/**
 * CasaJunto - DistributionService
 * Camada de Aplicação: Conecta dados reais de AppContext e Firestore ao Motor 2.0 (DistributionEngine).
 * Garante isolamento estrito de Tenant, isolamento de Demo, cálculo dinâmico de idade e persistência.
 */

import {
  Family,
  Member,
  Task,
  ProtectedTime
} from '../../types';
import {
  DistributionContext,
  DistributionEngine,
  RebalanceResult
} from '../../domain/distribution';
import {
  TaskMaster,
  FamilyTask,
  TaskAssignment
} from '../../domain/models';
import { allMasterTasks } from '../../data/tasks';
import { calculateAgeFromBirthDate } from '../../utils/dateUtils';
import { getTodayDateString } from '../../data/demoData';
import { getActiveMembers } from '../../domain/selectors';
import { doc, writeBatch, collection } from 'firebase/firestore';
import { db } from '../../infrastructure/firebase/firebase';
import { FirestoreMappers } from '../../infrastructure/firebase/mappers';

export interface BuildDistributionContextParams {
  family: Family;
  members: Member[];
  tasks: Task[];
  protectedTimes: ProtectedTime[];
  targetDate?: string;
  dayOfWeek?: number;
}

export class DistributionService {
  /**
   * Converte uma Task da interface de usuário em um TaskMaster de catálogo caso não exista.
   */
  public static getOrCreateTaskMaster(task: Task): TaskMaster {
    const existing = allMasterTasks.find(
      tm => tm.id === task.taskMasterId || tm.id === task.id || tm.name.toLowerCase() === task.title.toLowerCase()
    );
    if (existing) return existing;

    return {
      id: task.taskMasterId || task.id,
      name: task.title,
      description: task.description || '',
      category: (task.category as any) || 'cleaning',
      room_type: (task.roomId as any) || 'living_room',
      minimum_age: (task as any).minAge || (task as any).minimum_age || (task as any).min_age || 10,
      difficulty: 2,
      duration_minutes: task.durationMinutes || (task.effort ? Math.max(10, task.effort * 2) : 20),
      effort_level: Math.min(5, Math.max(1, Math.round((task.effort || 10) / 5))),
      autonomy_required: 2,
      frequency_type: (task.frequency?.toLowerCase() as any) || 'daily',
      safety_level: 'safe',
      requires_supervision: false,
      can_be_done_in_pair: false,
      can_be_delegated: true,
      instructions: [task.description || task.title],
      materials: [],
      active: true
    };
  }

  /**
   * Constrói o DistributionContext oficial respeitando Tenant, Idade Derivada e Horários Protegidos.
   */
  public static buildContext(params: BuildDistributionContextParams): DistributionContext {
    const targetDate = params.targetDate || getTodayDateString();
    
    // Cálculo seguro do dia da semana (0 = Domingo .. 6 = Sábado)
    let dayOfWeek = params.dayOfWeek;
    if (dayOfWeek === undefined) {
      const d = new Date(`${targetDate}T12:00:00Z`);
      dayOfWeek = d.getUTCDay();
    }

    // 1. Moradores da família com idade calculada dinamicamente a partir de birth_date
    const users: Member[] = getActiveMembers(params.members)
      .map(m => {
        let age = m.age;
        if (m.birth_date) {
          const derived = calculateAgeFromBirthDate(m.birth_date);
          if (derived !== null) {
            age = derived;
          }
        }
        return {
          ...m,
          age: age ?? 18,
          active: true,
          autonomy_level: m.autonomy_level || 3,
          max_daily_minutes: m.max_daily_minutes
        };
      });

    // 2. Horários Protegidos estritamente da família ativa e com active === true
    const protectedTimes = params.protectedTimes.filter(
      pt => pt.family_id === params.family.id && pt.active !== false
    );

    // 3. Mapeamento das tarefas para FamilyTasks e TaskAssignments
    const customMasters: TaskMaster[] = [];
    const familyTasks: FamilyTask[] = [];
    const existingAssignments: TaskAssignment[] = [];
    const seenTaskIds = new Set<string>();

    for (const task of params.tasks) {
      if ((task.status as string) === 'CANCELLED') continue;
      if ((task as any).active === false) continue;

      // Restringe ao targetDate quando dueDate estiver preenchido
      const taskDate = task.dueDate || targetDate;
      if (taskDate !== targetDate) continue;

      // Previne duplicação de identidade canônica
      if (seenTaskIds.has(task.id)) continue;
      seenTaskIds.add(task.id);

      const master = this.getOrCreateTaskMaster(task);
      if (!allMasterTasks.some(tm => tm.id === master.id)) {
        customMasters.push(master);
      }

      const scheduledStart = task.scheduledStart || '08:00';
      const scheduledEnd = task.scheduledEnd;
      const ftId = task.familyTaskId || `ft-${task.id}`;

      familyTasks.push({
        id: ftId,
        family_id: params.family.id,
        task_master_id: master.id,
        frequency: (task.frequency?.toLowerCase() as any) || 'daily',
        preferred_days: [dayOfWeek],
        preferred_time: scheduledStart,
        active: true,
        assigned_automatically: true
      });

      existingAssignments.push({
        id: task.id,
        family_id: params.family.id,
        family_task_id: ftId,
        task_id: master.id,
        member_id: task.assignedMemberId || task.assigneeId || '',
        scheduled_date: taskDate,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        status: task.status === 'DONE' || (task.status as string) === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED',
        score: 0,
        assigned_reason: task.assignedReason || '',
        unassigned_reason: task.unassignedReason,
        is_unassigned: task.isUnassigned || !task.assignedMemberId,
        factors: task.factors,
        rescheduled_count: 0
      });
    }

    const allTasks = [...allMasterTasks, ...customMasters];

    return {
      users,
      allTasks,
      familyTasks,
      skills: [],
      preferences: [],
      protectedTimes,
      availabilities: [],
      calendarEvents: [],
      existingAssignments,
      targetDate,
      dayOfWeek
    };
  }

  /**
   * Executa o rebalanceamento oficial através do Motor 2.0.
   */
  public static executeRebalance(params: BuildDistributionContextParams): {
    result: RebalanceResult;
    taskUpdates: Record<string, Partial<Task>>;
  } {
    const ctx = this.buildContext(params);
    const result = DistributionEngine.rebalance(ctx);

    const taskUpdates: Record<string, Partial<Task>> = {};

    for (const asg of result.proposedAssignments) {
      const original = params.tasks.find(t => t.id === asg.id);
      // Regra canônica: Tarefas já concluídas NUNCA são reatribuídas pelo rebalance
      if (original?.status === 'DONE' || (original?.status as string) === 'COMPLETED') {
        continue;
      }

      const member = ctx.users.find(u => u.id === asg.member_id);
      const isUnassigned = asg.is_unassigned || !asg.member_id;

      taskUpdates[asg.id] = {
        assignedMemberId: isUnassigned ? '' : asg.member_id,
        assigneeId: isUnassigned ? '' : asg.member_id,
        assigneeName: isUnassigned ? 'Não atribuído' : (member?.name || 'Membro'),
        assignedReason: asg.assigned_reason,
        unassignedReason: asg.unassigned_reason,
        isUnassigned,
        factors: asg.factors,
        scheduledStart: asg.scheduled_start,
        scheduledEnd: asg.scheduled_end,
        taskMasterId: asg.task_id
      };
    }

    return { result, taskUpdates };
  }

  /**
   * Persiste as atribuições rebalanceadas no Firestore em lote atômico (Multi-Tenant).
   */
  public static async persistAssignmentsToFirestore(
    familyId: string,
    tasks: Task[],
    updates: Record<string, Partial<Task>>
  ): Promise<void> {
    if (!familyId) {
      throw new Error('Identificador da família é obrigatório para persistir atribuições.');
    }
    if (!db) return;

    try {
      const batch = writeBatch(db);
      let count = 0;

      for (const [taskId, update] of Object.entries(updates)) {
        const original = tasks.find(t => t.id === taskId);
        
        // Regra canônica: NUNCA sobrescreve tarefas concluídas nem altera seus metadados
        if (original?.status === 'DONE' || (original?.status as string) === 'COMPLETED') {
          continue;
        }

        const taskRef = doc(db, 'families', familyId, 'assignments', taskId);

        const assignmentData: Partial<TaskAssignment> = {
          id: taskId,
          family_id: familyId,
          family_task_id: original?.familyTaskId || (original as any)?.family_task_id || null,
          task_id: update.taskMasterId || original?.taskMasterId || original?.id || taskId,
          member_id: update.assignedMemberId || '',
          room_id: original?.roomId || null,
          scheduled_date: original?.dueDate || getTodayDateString(),
          scheduled_start: update.scheduledStart || original?.scheduledStart || null,
          scheduled_end: update.scheduledEnd || original?.scheduledEnd || null,
          status: (original?.status === 'IN_PROGRESS') ? 'IN_PROGRESS' : 'SCHEDULED',
          assigned_reason: update.assignedReason || '',
          unassigned_reason: update.unassignedReason || null,
          is_unassigned: update.isUnassigned !== undefined ? update.isUnassigned : false,
          factors: update.factors,
          completed_at: original?.completedAt || null,
          completed_by: original?.completedByMemberId || null,
          completed_by_name: original?.completedByName || null,
          completion_type: original?.completionType || null
        };

        batch.set(taskRef, FirestoreMappers.fromTaskAssignment(assignmentData), { merge: true });
        count++;
      }

      if (count > 0) {
        await batch.commit();
      }
    } catch (err) {
      console.error('Falha ao persistir lote de atribuições no Firestore:', err);
      throw err;
    }
  }
}
