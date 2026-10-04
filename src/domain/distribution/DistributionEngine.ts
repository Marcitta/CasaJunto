/**
 * CasaJunto - DistributionEngine (Motor 2.0)
 * Núcleo de inteligência e orquestração do Household Responsibility Engine.
 * 100% puro: Zero dependência de React, DOM, window ou localStorage.
 */

import {
  Member,
  TaskMaster,
  FamilyTask,
  MemberSkill,
  MemberPreference,
  ProtectedTime,
  CalendarEvent,
  TaskAssignment,
  HouseholdHelp,
  MemberStats
} from '../models';
import { ScoringService, ScoringContext, CandidateEvaluation, TaskPriorityInfo } from './ScoringService';
import { BalanceService, BalanceAnalysis } from './BalanceService';
import { RebalanceService, RebalanceResult, BlitzAssignment } from './RebalanceService';
import { ExplainabilityService } from './ExplainabilityService';
import { AvailabilityService } from './AvailabilityService';
import { SafetyService } from './SafetyService';
import { EligibilityService } from './EligibilityService';
import { isMemberActive } from '../selectors';
import { SCORING_CONFIG } from './config/scoringConfig';
import { addMinutesToTimeString } from '../utils/dateTimeUtils';

export interface DistributionContext extends ScoringContext {}

export class DistributionEngine {
  /**
   * Executa o ciclo diário completo de distribuição de tarefas.
   */
  public static distributeDailyTasks(ctx: DistributionContext): TaskAssignment[] {
    const generatedAssignments: TaskAssignment[] = [];
    const helper = ctx.householdHelp;
    const isHelperToday = helper && helper.active && helper.days.includes(ctx.dayOfWeek);

    // 1. Filtrar tarefas agendadas para o dia alvo
    const tasksForToday = ctx.familyTasks.filter(ft => {
      if (!ft.active) return false;
      if (ft.frequency === 'daily') return true;
      if (ft.preferred_days && ft.preferred_days.includes(ctx.dayOfWeek)) return true;
      return false;
    });

    // 2. Ordenar tarefas por prioridade inteligente
    const prioritizedTasks = tasksForToday
      .map(ft => {
        const tm = ctx.allTasks.find(t => t.id === ft.task_master_id);
        if (!tm) return null;
        const priority = ScoringService.calculateTaskPriority(tm, ft, ctx);
        return { familyTask: ft, taskMaster: tm, priority };
      })
      .filter((item): item is { familyTask: FamilyTask; taskMaster: TaskMaster; priority: TaskPriorityInfo } => item !== null)
      .sort((a, b) => b.priority.priorityScore - a.priority.priorityScore);

    // Grade de horários sugeridos ao longo do dia
    const defaultSlots = ['08:00', '09:30', '11:30', '15:30', '17:30', '19:00', '20:15'];
    let slotIdx = 0;

    for (const { familyTask, taskMaster } of prioritizedTasks) {
      // Se a diarista faz hoje esta tarefa exata, não cria atribuição para a família
      if (isHelperToday && helper.tasks_covered.includes(taskMaster.id)) {
        continue;
      }

      const startSlot = familyTask.preferred_time || defaultSlots[slotIdx % defaultSlots.length];
      slotIdx++;

      const endSlot = addMinutesToTimeString(startSlot, taskMaster.duration_minutes);

      // Avaliar todos os moradores para esta tarefa
      const candidateEvals: CandidateEvaluation[] = [];
      for (const member of ctx.users) {
        if (!isMemberActive(member)) continue;
        const evaluation = ScoringService.evaluateCandidate(member, taskMaster, startSlot, ctx, generatedAssignments);
        if (evaluation.isEligible) {
          candidateEvals.push(evaluation);
        }
      }

      // Ordenar pelo melhor score
      candidateEvals.sort((a, b) => b.totalScore - a.totalScore);

      if (candidateEvals.length > 0) {
        const winner = candidateEvals[0];

        generatedAssignments.push({
          id: `asg-${ctx.targetDate}-${taskMaster.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          family_id: familyTask.family_id,
          family_task_id: familyTask.id,
          task_id: taskMaster.id,
          member_id: winner.userId,
          scheduled_date: ctx.targetDate,
          scheduled_start: startSlot,
          scheduled_end: endSlot,
          status: 'SCHEDULED',
          score: winner.totalScore,
          assigned_reason: winner.explanation,
          factors: winner.factors,
          rescheduled_count: 0
        });
      } else {
        // NENHUM MORADOR ELEGÍVEL: Não forçar atribuição incorreta
        generatedAssignments.push({
          id: `asg-unassigned-${ctx.targetDate}-${taskMaster.id}-${Date.now()}`,
          family_id: familyTask.family_id,
          family_task_id: familyTask.id,
          task_id: taskMaster.id,
          member_id: '',
          scheduled_date: ctx.targetDate,
          scheduled_start: startSlot,
          scheduled_end: endSlot,
          status: 'SCHEDULED',
          score: 0,
          assigned_reason: 'Nenhum morador está disponível para esta tarefa.',
          unassigned_reason: 'Critérios de segurança, limite diário de minutos ou horários protegidos impediram a alocação automática.',
          is_unassigned: true,
          factors: {
            availability: 'Todos os moradores atingiram o limite diário ou possuem horários bloqueados',
            autonomy: 'Nenhum morador disponível com nível de segurança/autonomia adequado',
            weeklyBalance: 'Aguardando decisão manual do gestor da rotina',
            history: 'N/A',
            preference: 'N/A'
          },
          rescheduled_count: 0
        });
      }
    }

    return generatedAssignments;
  }

  /**
   * Rebalanceamento dinâmico
   */
  public static rebalance(ctx: DistributionContext): RebalanceResult {
    return RebalanceService.rebalancePendingAssignments(ctx, (c) => this.distributeDailyTasks(c));
  }

  /**
   * Análise de equilíbrio
   */
  public static analyzeBalance(assignments: TaskAssignment[], members: Member[], tasks: TaskMaster[]): BalanceAnalysis {
    return BalanceService.analyzeDistributionBalance(assignments, members, tasks);
  }

  /**
   * Métricas do morador
   */
  public static calculateMemberStats(memberId: string, assignments: TaskAssignment[], tasks: TaskMaster[]): MemberStats {
    return BalanceService.calculateMemberStats(memberId, assignments, tasks);
  }

  /**
   * Blitz / Casa em Ordem
   */
  public static generateBlitz(members: Member[], tasks: TaskMaster[], durationMinutes: number): BlitzAssignment[] {
    return RebalanceService.generateBlitzAssignments(members, tasks, durationMinutes);
  }

  /**
   * Conselho Inteligente
   */
  public static getSmartAdvice(assignments: TaskAssignment[], members: Member[], tasks: TaskMaster[]): string {
    return ExplainabilityService.generateSmartAdvice(assignments, members, tasks);
  }
}

// Exportações diretas de conveniência para manter compatibilidade com utilitários e testes
export const distributeDailyTasks = (ctx: DistributionContext) => DistributionEngine.distributeDailyTasks(ctx);
export const analyzeDistributionBalance = (assignments: TaskAssignment[], members: Member[], tasks: TaskMaster[]) =>
  DistributionEngine.analyzeBalance(assignments, members, tasks);
export const calculateMemberStats = (memberId: string, assignments: TaskAssignment[], tasks: TaskMaster[]) =>
  DistributionEngine.calculateMemberStats(memberId, assignments, tasks);
export const generateBlitzAssignments = (members: Member[], tasks: TaskMaster[], durationMinutes: number) =>
  DistributionEngine.generateBlitz(members, tasks, durationMinutes);
export const generateSmartAdvice = (assignments: TaskAssignment[], members: Member[], tasks: TaskMaster[]) =>
  DistributionEngine.getSmartAdvice(assignments, members, tasks);
export const rebalancePendingAssignments = (ctx: DistributionContext) => DistributionEngine.rebalance(ctx);
export const calculateEffortPoints = (durationMinutes: number, effortLevel: number) =>
  BalanceService.calculateEffortPoints(durationMinutes, effortLevel);
export const getEffortLabel = (effortLevel: number) => BalanceService.getEffortLabel(effortLevel);
export const getUserMaxDailyMinutes = (member: Member) => AvailabilityService.getMaxDailyMinutes(member);
export const checkDynamicAvailability = (
  member: Member,
  timeSlot: string,
  durationMinutes: number,
  ctx: any,
  assignments: TaskAssignment[]
) => AvailabilityService.checkAvailability(member, timeSlot, durationMinutes, ctx, assignments);
export const checkEligibility = (
  member: Member,
  task: TaskMaster,
  timeSlot: string,
  ctx: any,
  assignments: TaskAssignment[]
) => EligibilityService.checkEligibility(member, task, timeSlot, ctx, assignments);
export const evaluateCandidate = (
  member: Member,
  task: TaskMaster,
  timeSlot: string,
  ctx: any,
  assignments: TaskAssignment[]
) => ScoringService.evaluateCandidate(member, task, timeSlot, ctx, assignments);
export const calculateTaskPriority = (task: TaskMaster, familyTask: FamilyTask, ctx: any) =>
  ScoringService.calculateTaskPriority(task, familyTask, ctx);
