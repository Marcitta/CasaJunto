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
  familyTasks?: FamilyTask[];
}

export class DistributionService {
  /**
   * Resolve o target de execução da tarefa pelo family_task_id na camada de aplicação.
   * Regra canônica:
   * executionTarget ausente → HOUSEHOLD
   * Não inferir por TaskMaster, título, domesticSupportId ou nome da ajuda externa.
   */
  public static resolveExecutionTarget(
    task: Task | TaskAssignment,
    familyTasks?: FamilyTask[]
  ): 'HOUSEHOLD' | 'FLEXIBLE' | 'EXTERNAL_SUPPORT' {
    const familyTaskId = (task as Task).familyTaskId || (task as TaskAssignment).family_task_id;
    if (familyTaskId && familyTasks && familyTasks.length > 0) {
      const ft = familyTasks.find(f => f.id === familyTaskId);
      if (ft?.executionTarget) {
        return ft.executionTarget;
      }
    }
    const directTarget = (task as any).executionTarget || (task as any).execution_target;
    if (directTarget) {
      return directTarget;
    }
    return 'HOUSEHOLD';
  }
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

      // Resolução canônica de FamilyTask pelo family_task_id na fronteira de aplicação
      const target = this.resolveExecutionTarget(task, params.familyTasks);

      // HOUSEHOLD e FLEXIBLE entram no pool do Motor 2.0.
      // EXTERNAL_SUPPORT não entra no pool do Motor 2.0 e é excluído antes de chamar o Motor.
      if (target === 'EXTERNAL_SUPPORT') continue;

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
   * Fronteira de Aplicação / Orquestração:
   * 1. Separa externalAssignments da agenda completa (preservadas intactas)
   * 2. Envia apenas tarefas HOUSEHOLD e FLEXIBLE ao Motor 2.0
   * 3. Recompõe o resultado operacional fora de RebalanceService
   */
  public static executeRebalance(params: BuildDistributionContextParams): {
    result: RebalanceResult;
    taskUpdates: Record<string, Partial<Task>>;
  } {
    const targetDate = params.targetDate || getTodayDateString();

    // 1. Separar a agenda completa antes do Motor 2.0:
    //    - externalTasks: preservadas intactas
    //    - motorTasks (HOUSEHOLD + FLEXIBLE): enviadas ao Motor
    const externalTasks: Task[] = [];
    const motorTasks: Task[] = [];

    for (const task of params.tasks) {
      const target = this.resolveExecutionTarget(task, params.familyTasks);
      if (target === 'EXTERNAL_SUPPORT') {
        externalTasks.push(task);
      } else {
        motorTasks.push(task);
      }
    }

    // 2. Prepara o contexto do Motor 2.0 APENAS com tarefas HOUSEHOLD + FLEXIBLE
    const motorContext = this.buildContext({
      ...params,
      tasks: motorTasks
    });

    // 3. Executa o rebalanceamento puro no Motor 2.0 (sem conhecimento de EXTERNAL_SUPPORT)
    const motorResult = DistributionEngine.rebalance(motorContext);

    // 4. Converte externalTasks em assignments preservados intactos (is_unassigned, sem membro)
    const externalAssignments: TaskAssignment[] = externalTasks.map(t => {
      const master = this.getOrCreateTaskMaster(t);
      const ftId = t.familyTaskId || `ft-${t.id}`;
      return {
        id: t.id,
        family_id: params.family.id,
        family_task_id: ftId,
        task_id: master.id,
        member_id: '',
        room_id: t.roomId || null,
        scheduled_date: t.dueDate || targetDate,
        scheduled_start: t.scheduledStart || '08:00',
        scheduled_end: t.scheduledEnd,
        status: t.status === 'DONE' || (t.status as string) === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED',
        score: 0,
        assigned_reason: t.assignedReason || 'Apoio Externo (EXTERNAL_SUPPORT)',
        unassigned_reason: t.unassignedReason || 'Tarefa de apoio externo não alocada a membros',
        is_unassigned: true,
        factors: t.factors,
        rescheduled_count: 0
      };
    });

    // 5. Recomposição do resultado operacional FORA de RebalanceService:
    //    proposedAssignments une o resultado do Motor com as externalAssignments preservadas intactas
    const seenProposedIds = new Set<string>();
    const proposedAssignments: TaskAssignment[] = [];
    for (const asg of [...motorResult.proposedAssignments, ...externalAssignments]) {
      if (!seenProposedIds.has(asg.id)) {
        seenProposedIds.add(asg.id);
        proposedAssignments.push(asg);
      }
    }

    const taskUpdates: Record<string, Partial<Task>> = {};

    for (const asg of motorResult.proposedAssignments) {
      const original = params.tasks.find(t => t.id === asg.id);
      // Regra canônica: Tarefas já concluídas NUNCA são reatribuídas pelo rebalance
      if (original?.status === 'DONE' || (original?.status as string) === 'COMPLETED') {
        continue;
      }

      const member = motorContext.users.find(u => u.id === asg.member_id);
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

    return {
      result: {
        ...motorResult,
        proposedAssignments
      },
      taskUpdates
    };
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
