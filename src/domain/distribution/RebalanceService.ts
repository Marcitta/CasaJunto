/**
 * CasaJunto - RebalanceService
 * Camada 7 do Pipeline de Distribuição:
 * Reequilíbrio dinâmico de tarefas pendentes e alocação do Modo Casa em Ordem (Blitz).
 */

import {
  Member,
  TaskAssignment,
  TaskMaster,
  FamilyTask
} from '../models';
import { ScoringContext } from './ScoringService';
import { DistributionEngine } from './DistributionEngine';
import { getActiveMembers } from '../selectors';

export interface RebalanceResult {
  proposedAssignments: TaskAssignment[];
  changesCount: number;
  message: string;
}

export interface BlitzAssignment {
  id: string;
  memberId: string;
  memberName: string;
  taskId: string;
  title: string;
  roomName: string;
  timeStr: string;
  icon: string;
  instructions: string[];
}

export class RebalanceService {
  /**
   * Reequilibra apenas as tarefas pendentes preservando as já concluídas ou em andamento.
   */
  public static rebalancePendingAssignments(
    ctx: ScoringContext,
    distributeFn: (ctx: ScoringContext) => TaskAssignment[]
  ): RebalanceResult {
    const fixedAssignments = ctx.existingAssignments.filter(
      a => a.status === 'COMPLETED' || a.status === 'IN_PROGRESS'
    );
    const pendingAssignments = ctx.existingAssignments.filter(
      a => a.status !== 'COMPLETED' && a.status !== 'IN_PROGRESS' && a.status !== 'CANCELLED'
    );

    if (pendingAssignments.length === 0) {
      return {
        proposedAssignments: ctx.existingAssignments,
        changesCount: 0,
        message: 'Nenhuma tarefa pendente para reequilibrar.'
      };
    }

    const rebalanceFamilyTasks: FamilyTask[] = pendingAssignments.map((a, idx) => {
      const existingFt = ctx.familyTasks.find(ft => ft.id === a.family_task_id || ft.task_master_id === a.task_id);
      return {
        id: a.id, // Preserva identidade exata da ocorrência
        family_id: a.family_id || ctx.users[0]?.family_id || 'fam-1',
        task_master_id: a.task_id,
        frequency: existingFt?.frequency || 'daily',
        preferred_days: existingFt?.preferred_days || [ctx.dayOfWeek],
        preferred_time: a.scheduled_start || existingFt?.preferred_time,
        active: true,
        assigned_automatically: true
      };
    });

    const rebalancedContext: ScoringContext = {
      ...ctx,
      familyTasks: rebalanceFamilyTasks,
      existingAssignments: fixedAssignments
    };

    const rawNewAssignments = distributeFn(rebalancedContext);
    
    // Mapeamento canônico 1:1 por identidade de ocorrência (evita swap por índice)
    const newAssignments: TaskAssignment[] = [];
    const usedPendingIds = new Set<string>();

    for (const rawAsg of rawNewAssignments) {
      const matched = pendingAssignments.find(
        p => !usedPendingIds.has(p.id) && (p.id === rawAsg.family_task_id || p.task_id === rawAsg.task_id)
      );

      if (matched) {
        usedPendingIds.add(matched.id);
        newAssignments.push({
          ...rawAsg,
          id: matched.id,
          family_id: matched.family_id || rawAsg.family_id,
          family_task_id: matched.family_task_id || rawAsg.family_task_id,
          task_id: matched.task_id,
          room_id: matched.room_id || rawAsg.room_id,
          scheduled_date: matched.scheduled_date || rawAsg.scheduled_date,
          status: rawAsg.status || 'SCHEDULED'
        });
      } else {
        newAssignments.push(rawAsg);
      }
    }

    // Preserva pendentes que por ventura não foram alocadas
    for (const p of pendingAssignments) {
      if (!usedPendingIds.has(p.id)) {
        newAssignments.push(p);
      }
    }

    // Invariante de Unicidade Canônica: 1 ocorrência tem no máximo 1 responsável
    const assignmentIdSet = new Set<string>();
    const deduplicatedCombined: TaskAssignment[] = [];
    for (const asg of [...fixedAssignments, ...newAssignments]) {
      if (!assignmentIdSet.has(asg.id)) {
        assignmentIdSet.add(asg.id);
        deduplicatedCombined.push(asg);
      }
    }

    let changesCount = 0;
    for (const newAsg of newAssignments) {
      const old = pendingAssignments.find(p => p.id === newAsg.id);
      if (old && old.member_id !== newAsg.member_id) {
        changesCount++;
      }
    }

    return {
      proposedAssignments: deduplicatedCombined,
      changesCount,
      message:
        changesCount > 0
          ? `Rebalanceamento concluiu ${changesCount} realocações para maior equilíbrio da família.`
          : 'A distribuição atual já era a mais equilibrada possível.'
    };
  }

  /**
   * Gera atribuições instantâneas para o Modo Casa em Ordem (Blitz).
   */
  public static generateBlitzAssignments(
    members: Member[],
    allTasks: TaskMaster[],
    durationMinutes: number
  ): BlitzAssignment[] {
    const activeMembers = getActiveMembers(members);
    const result: BlitzAssignment[] = [];

    const blitzCandidates = allTasks.filter(t => {
      if (t.difficulty > 3) return false;
      if (t.safety_level === 'adult_only') return false;
      return ['cleaning', 'organization', 'waste', 'kitchen'].includes(t.category);
    });

    let candidateIdx = 0;

    for (const member of activeMembers) {
      const eligibleTasks = blitzCandidates.filter(t => t.minimum_age <= member.age);
      const selectedTask =
        eligibleTasks[candidateIdx % eligibleTasks.length] || eligibleTasks[0] || blitzCandidates[0];
      candidateIdx++;

      const icon =
        selectedTask.category === 'kitchen'
          ? '🍳'
          : selectedTask.category === 'waste'
          ? '♻️'
          : selectedTask.category === 'organization'
          ? '📦'
          : '🧹';

      result.push({
        id: `blitz-${member.id}-${Date.now()}`,
        memberId: member.id,
        memberName: member.name,
        taskId: selectedTask.id,
        title: selectedTask.name,
        roomName: selectedTask.room_type,
        timeStr: `${durationMinutes} min`,
        icon,
        instructions: selectedTask.instructions
      });
    }

    return result;
  }
}
