/**
 * CasaJunto - ChaosSessionService
 * CHAOS-1A: Modo Caos — Domain, Persistence & Security Foundation
 *
 * Gerencia o ciclo de vida estrito da entidade ChaosSession, controle de concorrência
 * via lock atômico em /chaosState/current e elegibilidade operacional de FamilyTask.chaosEligible.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  Timestamp,
  collection,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../infrastructure/firebase/firebase';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import {
  ChaosSession,
  ChaosSessionStatus,
  ChaosState,
  FamilyTask,
  Member,
  UserRole,
  ChaosTaskStrategy,
  ChaosSessionTaskConfig,
  ChaosSessionSummary,
  ChaosTimeExtension,
  TaskAssignment,
  TaskMaster,
  ProtectedTime,
  MemberSkill,
  MemberPreference,
  Task
} from '../types';
import { DistributionEngine, DistributionContext, EligibilityService } from '../domain/distribution';
import { allMasterTasks } from '../data/tasks';
import { logStructuredChaosError } from '../utils/chaosErrorUtils';
import { TaskCompletionService } from '../application/services/TaskCompletionService';

export const VALID_CHAOS_DURATIONS = [15, 30, 45, 60] as const;
export type ValidChaosDuration = typeof VALID_CHAOS_DURATIONS[number];

export interface CreateDraftSessionParams {
  familyId: string;
  createdByMemberId: string;
  callerRole: UserRole | string;
  initialDurationMinutes: number;
  participantMemberIds: string[];
  selectedTaskIds?: string[];
  tasks?: Array<ChaosSessionTaskConfig | string>;
  taskStrategies?: Record<string, ChaosTaskStrategy>;
  availableMembers?: Member[];
  availableTasks?: FamilyTask[];
  existingAssignments?: TaskAssignment[];
  todayDate?: string;
  isDemoMode?: boolean;
}

export interface UpdateDraftConfigParams {
  familyId: string;
  sessionId: string;
  callerRole: UserRole | string;
  updates: {
    initialDurationMinutes?: number;
    participantMemberIds?: string[];
    selectedTaskIds?: string[];
    tasks?: Array<ChaosSessionTaskConfig | string>;
    taskStrategies?: Record<string, ChaosTaskStrategy>;
  };
  availableMembers?: Member[];
  availableTasks?: FamilyTask[];
  existingAssignments?: TaskAssignment[];
  todayDate?: string;
  existingSession?: ChaosSession;
}

export interface AddTaskToDraftParams {
  familyId: string;
  sessionId: string;
  callerRole: UserRole | string;
  familyTaskId: string;
  strategy?: ChaosTaskStrategy;
  availableTasks?: FamilyTask[];
  existingAssignments?: TaskAssignment[];
  todayDate?: string;
  existingSession?: ChaosSession;
}

export interface RemoveTaskFromDraftParams {
  familyId: string;
  sessionId: string;
  callerRole: UserRole | string;
  familyTaskId: string;
  existingSession?: ChaosSession;
}

export interface UpdateTaskStrategyParams {
  familyId: string;
  sessionId: string;
  callerRole: UserRole | string;
  familyTaskId: string;
  strategy: ChaosTaskStrategy;
  existingSession?: ChaosSession;
}

export interface AddLateParticipantParams {
  familyId: string;
  sessionId: string;
  callerRole: UserRole | string;
  memberId: string;
  availableMembers?: Member[];
  existingSession?: ChaosSession;
  isDemoMode?: boolean;
}

export interface ResolveChaosOccurrenceParams {
  familyId: string;
  session: ChaosSession;
  taskConfig: ChaosSessionTaskConfig;
  familyTask: FamilyTask;
  taskMaster?: TaskMaster;
  todayDate: string;
  existingAssignments: TaskAssignment[];
  participants: Member[];
  allTasks?: TaskMaster[];
  protectedTimes?: ProtectedTime[];
  skills?: MemberSkill[];
  preferences?: MemberPreference[];
}

export interface ResolveChaosOccurrenceResult {
  assignment: TaskAssignment;
  isNew: boolean;
  reused: boolean;
  wasAlreadyCompleted: boolean;
}

export interface ResolveAllSessionTasksParams {
  familyId: string;
  session: ChaosSession;
  familyTasks: FamilyTask[];
  allTasks?: TaskMaster[];
  existingAssignments: TaskAssignment[];
  participants: Member[];
  todayDate: string;
  protectedTimes?: ProtectedTime[];
  skills?: MemberSkill[];
  preferences?: MemberPreference[];
}

export interface ResolveAllSessionTasksResult {
  assignments: TaskAssignment[];
  newAssignments: TaskAssignment[];
  reusedAssignments: TaskAssignment[];
  alreadyCompletedAssignments: TaskAssignment[];
}

export interface StartChaosSessionParams {
  familyId: string;
  sessionId: string;
  callerRole: UserRole | string;
  existingSession?: ChaosSession;
  isDemoMode?: boolean;
}

export interface CancelDraftSessionParams {
  familyId: string;
  sessionId: string;
  callerRole: UserRole | string;
  existingSession?: ChaosSession;
  isDemoMode?: boolean;
}

export interface ExtendChaosSessionParams {
  familyId: string;
  sessionId: string;
  callerRole: UserRole | string;
  callerMemberId: string;
  extensionMinutes: 15 | 30 | number;
  existingSession?: ChaosSession;
  isDemoMode?: boolean;
}

export interface CompleteChaosSessionParams {
  familyId: string;
  sessionId: string;
  callerRole: UserRole | string;
  callerMemberId?: string;
  existingSession?: ChaosSession;
  assignments?: TaskAssignment[];
  members?: Member[];
  effectiveEndedAt?: any;
  isDemoMode?: boolean;
}

export interface EvaluateChaosBonusParams {
  session: ChaosSession;
  assignments: TaskAssignment[];
  members?: Member[];
  effectiveEndedAt?: any;
}

export interface EvaluateChaosBonusResult {
  eligibleMemberIds: string[];
  bonusAwardedMemberIds: string[];
  bonusPointsDeltaByMemberId: Record<string, number>;
  summary: ChaosSessionSummary;
  completedChaosAssignments: TaskAssignment[];
}

export function toMillis(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (typeof val.toMillis === 'function') return val.toMillis();
  if (val instanceof Date) return val.getTime();
  if (typeof val.toDate === 'function') return val.toDate().getTime();
  if (typeof val === 'string') {
    const t = new Date(val).getTime();
    return isNaN(t) ? null : t;
  }
  return null;
}

/**
 * HF5: Determina canonicamente se uma atribuição (TaskAssignment / Task)
 * foi de fato CONCLUÍDA dentro do escopo e intervalo da ChaosSession informada.
 * 
 * Invariante canônica:
 * 1. assignment existe;
 * 2. status é COMPLETED ou DONE;
 * 3. assignment pertence à sessão atual:
 *    - assignment.chaos_session_id === session.id OU assignment.chaosSessionId === session.id
 * 4. conclusão ocorreu no intervalo válido da sessão:
 *    - completed_at >= session.startedAt (ou session.createdAt como fallback)
 *    - se session.endedAt existir: completed_at <= session.endedAt
 */
export function isAssignmentCompletedInChaosSession(
  assignment: TaskAssignment | any | null | undefined,
  session: ChaosSession | any | null | undefined
): boolean {
  if (!assignment || !session || !session.id) {
    return false;
  }

  // 1. Status deve ser COMPLETED ou DONE
  const status = assignment.status;
  if (status !== 'COMPLETED' && status !== 'DONE') {
    return false;
  }

  // 2. Pertencimento à sessão atual (ownership)
  const asgChaosSessionId = assignment.chaos_session_id || assignment.chaosSessionId;
  
  // Se possuir chaos_session_id explícito e for de OUTRA sessão, rejeitar imediatamente
  if (asgChaosSessionId && asgChaosSessionId !== session.id) {
    return false;
  }

  let belongsToSession = Boolean(asgChaosSessionId && asgChaosSessionId === session.id);

  // Retrocompatibilidade / Suporte a sessões de teste onde assignments não foram salvos com chaos_session_id
  if (!belongsToSession && session) {
    const asgId = assignment.id;
    const asgFtId = assignment.family_task_id || assignment.familyTaskId;
    
    if (Array.isArray(session.tasks)) {
      belongsToSession = session.tasks.some((t: any) => 
        (asgId && t.assignmentId === asgId) || 
        (asgFtId && t.familyTaskId === asgFtId)
      );
    }
    if (!belongsToSession && Array.isArray(session.selectedTaskIds) && asgFtId) {
      belongsToSession = session.selectedTaskIds.includes(asgFtId);
    }
  }

  if (!belongsToSession) {
    return false;
  }

  // 3. Validação temporal no intervalo da sessão
  const startedAtMs = toMillis(session.startedAt) ?? toMillis(session.createdAt);
  const completedAtMs = toMillis(
    assignment.completed_at || 
    assignment.completedAt || 
    (assignment as any).completed_date
  );

  if (startedAtMs !== null && completedAtMs !== null) {
    if (completedAtMs < startedAtMs) {
      return false; // Concluída antes do início da sessão
    }
  }

  const endedAtMs = toMillis(session.endedAt) ?? toMillis(session.completedAt);
  if (endedAtMs !== null && completedAtMs !== null) {
    if (completedAtMs > endedAtMs) {
      return false; // Concluída após o término da sessão
    }
  }

  return true;
}

export interface UpdateFamilyTaskChaosEligibleParams {
  familyId: string;
  familyTaskId: string;
  chaosEligible: boolean;
  callerRole: UserRole | string;
}

export class ChaosSessionService {
  /**
   * Valida se a duração fornecida pertence ao conjunto canônico [15, 30, 45, 60].
   */
  public static isValidDuration(minutes: number): minutes is ValidChaosDuration {
    return VALID_CHAOS_DURATIONS.includes(minutes as ValidChaosDuration);
  }

  /**
   * HF5: Determina canonicamente se uma atribuição (TaskAssignment / Task)
   * foi de fato CONCLUÍDA dentro do escopo e intervalo da ChaosSession informada.
   */
  public static isAssignmentCompletedInChaosSession(
    assignment: TaskAssignment | any | null | undefined,
    session: ChaosSession | any | null | undefined
  ): boolean {
    return isAssignmentCompletedInChaosSession(assignment, session);
  }

  /**
   * HF5: Determina se uma tarefa avulsa (ONE_TIME) já teve sua única ocorrência concluída.
   * Regra canônica:
   * Uma FamilyTask ONE_TIME concluída (seja hoje, ontem, em sessão de caos anterior,
   * via SELF_CLAIMED ou ADMIN_INTERVENTION) torna-se permanentemente inelegível
   * para novas sessões do Modo Caos, sem mutação de seu histórico.
   * NÃO se aplica a tarefas recorrentes (DAILY, WEEKLY, BIWEEKLY, MONTHLY).
   */
  public static isOneTimeTaskAlreadyCompleted(
    familyTaskId: string,
    existingAssignments?: TaskAssignment[],
    familyTasks?: FamilyTask[],
    tasks?: Task[]
  ): boolean {
    if (!familyTaskId) return false;

    // Se temos o catálogo de FamilyTasks, verificar se é ONE_TIME
    if (familyTasks && familyTasks.length > 0) {
      const ft = familyTasks.find(f => f.id === familyTaskId);
      if (ft) {
        const isOneTime = ft.frequency === 'ONE_TIME' || (ft as any).frequencyType === 'ONE_TIME';
        // Tarefas recorrentes NUNCA são barradas por esta regra
        if (!isOneTime) {
          return false;
        }
      }
    }

    const ft = familyTasks?.find(f => f.id === familyTaskId);
    const tmId = ft?.task_id || (ft as any)?.taskId || (ft as any)?.taskMasterId;

    // 1. Checar em existingAssignments (Firestore / repositório de assignments)
    if (existingAssignments && existingAssignments.length > 0) {
      const hasCompleted = existingAssignments.some(a => {
        const matchFt = a.family_task_id === familyTaskId || 
                        (a as any).familyTaskId === familyTaskId ||
                        a.id === familyTaskId;
        const matchTm = Boolean(tmId && (a.task_id === tmId || (a as any).taskId === tmId));
        if (!matchFt && !matchTm) return false;

        return a.status === 'COMPLETED' || a.status === 'DONE';
      });

      if (hasCompleted) return true;
    }

    // 2. Checar em tasks (AppContext) se fornecido
    if (tasks && tasks.length > 0) {
      const hasCompleted = tasks.some(t => {
        const matchFt = t.familyTaskId === familyTaskId || 
                        (t as any).family_task_id === familyTaskId ||
                        t.id === familyTaskId;
        const matchTm = Boolean(tmId && ((t as any).taskMasterId === tmId || (t as any).taskId === tmId || (t as any).task_id === tmId));
        if (!matchFt && !matchTm) return false;

        return t.status === 'DONE' || (t.status as string) === 'COMPLETED';
      });

      if (hasCompleted) return true;
    }

    return false;
  }

  /**
   * HF3: Verifica se uma FamilyTask possui ocorrência canônica COMPLETED ou DONE na data local de hoje.
   */
  public static isTaskCompletedToday(
    familyTaskId: string,
    existingAssignments?: TaskAssignment[],
    todayDate?: string,
    familyTasks?: FamilyTask[]
  ): boolean {
    if (!existingAssignments || existingAssignments.length === 0 || !todayDate || !familyTaskId) {
      return false;
    }

    const ft = familyTasks?.find(f => f.id === familyTaskId);
    const tmId = ft?.task_id || (ft as any)?.taskId || (ft as any)?.taskMasterId;

    return existingAssignments.some(a => {
      const matchFamilyTask = a.family_task_id === familyTaskId || 
                              (a as any).familyTaskId === familyTaskId ||
                              a.id === familyTaskId;
      const matchMasterTask = Boolean(tmId && (a.task_id === tmId || (a as any).taskId === tmId));
      const isMatch = matchFamilyTask || matchMasterTask;

      if (!isMatch) return false;

      const asgDate = a.scheduled_date || (a as any).dueDate || (a as any).date;
      const matchDate = asgDate === todayDate;
      const isCompleted = a.status === 'COMPLETED' || a.status === 'DONE';

      return matchDate && isCompleted;
    });
  }

  /**
   * Normaliza e valida a lista de tarefas da sessão com suas estratégias operacionais.
   * - Deduplica por familyTaskId.
   * - Valida elegibilidade (active !== false, chaosEligible !== false, pertence à família) se availableTasks fornecido.
   * - Garante estratégia válida: DISTRIBUTED ou OPEN_POOL.
   * - HF5: Rejeita tarefas ONE_TIME já concluídas (em qualquer data).
   * - HF3: Rejeita tarefas cuja ocorrência de hoje já esteja COMPLETED ou DONE.
   */
  public static validateAndNormalizeTasks(
    taskInputs: Array<ChaosSessionTaskConfig | string>,
    availableTasks?: FamilyTask[],
    targetFamilyId?: string,
    existingAssignments?: TaskAssignment[],
    todayDate?: string
  ): ChaosSessionTaskConfig[] {
    if (!Array.isArray(taskInputs)) {
      throw new Error('INVALID_TASKS: tasks deve ser um array.');
    }

    const map = new Map<string, ChaosSessionTaskConfig>();

    for (const item of taskInputs) {
      const familyTaskId = typeof item === 'string' ? item : item.familyTaskId;
      const rawStrategy = typeof item === 'string' ? 'DISTRIBUTED' : item.strategy;
      const strategy: ChaosTaskStrategy = rawStrategy === 'OPEN_POOL' ? 'OPEN_POOL' : 'DISTRIBUTED';

      if (!familyTaskId) continue;

      // HF5: Service Guard — Rejeitar inclusão de tarefas ONE_TIME já concluídas (independentemente da data)
      if (this.isOneTimeTaskAlreadyCompleted(familyTaskId, existingAssignments, availableTasks)) {
        throw new Error(`ONE_TIME_ALREADY_COMPLETED: A tarefa avulsa ${familyTaskId} já foi concluída e não pode ser adicionada a uma nova sessão do Modo Caos.`);
      }

      // HF3: Service Guard — Rejeitar inclusão operacional de tarefas concluídas hoje
      if (existingAssignments && todayDate && this.isTaskCompletedToday(familyTaskId, existingAssignments, todayDate, availableTasks)) {
        throw new Error(`ALREADY_COMPLETED_TODAY: A tarefa ${familyTaskId} já foi concluída hoje e não pode ser adicionada à sessão do Modo Caos.`);
      }

      if (availableTasks && availableTasks.length > 0) {
        const ft = availableTasks.find(t => t.id === familyTaskId);
        if (!ft) {
          throw new Error(`TASK_NOT_FOUND: Tarefa ${familyTaskId} não encontrada.`);
        }
        if (targetFamilyId && ft.familyId && ft.familyId !== targetFamilyId && ft.family_id !== targetFamilyId) {
          throw new Error(`TASK_NOT_IN_FAMILY: Tarefa ${familyTaskId} não pertence à família ${targetFamilyId}.`);
        }
        if (ft.active === false) {
          throw new Error(`FAMILY_TASK_INACTIVE: Tarefa ${familyTaskId} está inativa.`);
        }
      }

      map.set(familyTaskId, {
        familyTaskId,
        strategy,
        taskMasterId: typeof item === 'object' ? item.taskMasterId : undefined,
        assignmentId: typeof item === 'object' ? item.assignmentId : undefined
      });
    }

    return Array.from(map.values());
  }

  /**
   * Normaliza e valida a lista de participantes.
   * - Deduplica IDs de forma segura.
   * - Se `availableMembers` for fornecido, garante que todos pertencem à família e estão ativos.
   */
  public static validateAndNormalizeParticipants(
    participantIds: string[],
    availableMembers?: Member[],
    targetFamilyId?: string
  ): string[] {
    if (!Array.isArray(participantIds)) {
      throw new Error('INVALID_PARTICIPANTS: participantMemberIds deve ser um array.');
    }

    // Deduplicação segura
    const deduplicated = Array.from(new Set(participantIds.filter(Boolean)));

    if (availableMembers && availableMembers.length > 0) {
      for (const id of deduplicated) {
        const member = availableMembers.find(m => m.id === id);
        if (!member) {
          throw new Error(`MEMBER_NOT_IN_FAMILY: Participante ${id} não pertence à família.`);
        }
        if (targetFamilyId && member.familyId && member.familyId !== targetFamilyId && member.family_id !== targetFamilyId) {
          throw new Error(`MEMBER_NOT_IN_FAMILY: Participante ${id} não pertence à família ${targetFamilyId}.`);
        }
        if (member.active === false) {
          throw new Error(`INACTIVE_MEMBER_REJECTED: Participante ${id} está inativo.`);
        }
      }
    }

    return deduplicated;
  }

  /**
   * CHA01, CHA02, CHA03, CHA04, CHA05, CHA06, CHA07
   * Cria uma sessão no estado DRAFT.
   * Restrito exclusivamente a ADMIN.
   */
  public static async createDraftSession(params: CreateDraftSessionParams): Promise<ChaosSession> {
    const {
      familyId,
      createdByMemberId,
      callerRole,
      initialDurationMinutes,
      participantMemberIds,
      selectedTaskIds = [],
      tasks,
      taskStrategies,
      availableMembers,
      availableTasks
    } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem criar uma sessão do Modo Caos.');
    }

    if (!this.isValidDuration(initialDurationMinutes)) {
      throw new Error(`INVALID_CHAOS_DURATION: Duração ${initialDurationMinutes} inválida. Permitido somente 15, 30, 45 ou 60 minutos.`);
    }

    const normalizedParticipants = this.validateAndNormalizeParticipants(
      participantMemberIds,
      availableMembers,
      familyId
    );

    // Normalização de tarefas com estratégia operacional (CHAOS-1B, CHAOS-1D-HF3)
    let normalizedTasks: ChaosSessionTaskConfig[] = [];
    if (tasks && Array.isArray(tasks)) {
      normalizedTasks = this.validateAndNormalizeTasks(tasks, availableTasks, familyId, params.existingAssignments, params.todayDate);
    } else if (selectedTaskIds && selectedTaskIds.length > 0) {
      const taskConfigs: ChaosSessionTaskConfig[] = selectedTaskIds.map(ftId => ({
        familyTaskId: ftId,
        strategy: (taskStrategies && taskStrategies[ftId]) || 'DISTRIBUTED'
      }));
      normalizedTasks = this.validateAndNormalizeTasks(taskConfigs, availableTasks, familyId, params.existingAssignments, params.todayDate);
    }

    const finalSelectedTaskIds = normalizedTasks.map(t => t.familyTaskId);
    const finalTaskStrategies: Record<string, ChaosTaskStrategy> = {};
    for (const t of normalizedTasks) {
      finalTaskStrategies[t.familyTaskId] = t.strategy;
    }

    const sessionId = `chaos_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowTimestamp = Timestamp.now();

    const draftSession: ChaosSession = {
      id: sessionId,
      familyId,
      createdByMemberId,
      status: 'DRAFT',
      createdAt: nowTimestamp,
      startedAt: null,
      endedAt: null,
      initialDurationMinutes,
      totalDurationMinutes: initialDurationMinutes,
      expiresAt: null,
      participantMemberIds: normalizedParticipants,
      lateParticipantMemberIds: [],
      selectedTaskIds: finalSelectedTaskIds,
      tasks: normalizedTasks,
      taskStrategies: finalTaskStrategies,
      extensions: [],
      bonusAwardedMemberIds: [],
      bonusPointsPerMember: 5,
      updatedAt: nowTimestamp
    };

    const isExplicitDemo = Boolean(params.isDemoMode);

    if (db && !isExplicitDemo) {
      try {
        const sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);
        const payload = FirestoreMappers.fromChaosSession(draftSession);
        await setDoc(sessionRef, payload);
      } catch (err: any) {
        console.error('[createDraftSession:EXCEPTION]', {
          familyId,
          sessionId,
          name: err?.name,
          code: err?.code,
          message: err?.message,
          stack: err?.stack
        });
        logStructuredChaosError('createDraftSession', err, { familyId, sessionId });
        throw err;
      }
    }

    return draftSession;
  }

  /**
   * CHA20
   * Atualiza as configurações de uma sessão em estado DRAFT.
   * Restrito a ADMIN.
   */
  public static async updateDraftConfig(params: UpdateDraftConfigParams): Promise<ChaosSession> {
    const { familyId, sessionId, callerRole, updates, availableMembers, availableTasks, existingSession: providedSession } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem editar o rascunho da sessão.');
    }

    let existingSession: ChaosSession | null = providedSession || null;
    let sessionRef: any = null;

    if (!existingSession && db) {
      try {
        sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);
        const snap = await getDoc(sessionRef);
        if (snap.exists()) {
          existingSession = FirestoreMappers.toChaosSession(snap.id, snap.data());
        }
      } catch {
        // Graceful em ambiente de testes offline
      }
    }

    if (existingSession && existingSession.status !== 'DRAFT') {
      throw new Error('CANNOT_MODIFY_NON_DRAFT_SESSION: Apenas sessões em DRAFT podem ser configuradas.');
    }

    const payloadUpdates: Partial<ChaosSession> = {
      updatedAt: Timestamp.now()
    };

    if (updates.initialDurationMinutes !== undefined) {
      if (!this.isValidDuration(updates.initialDurationMinutes)) {
        throw new Error(`INVALID_CHAOS_DURATION: Duração ${updates.initialDurationMinutes} inválida.`);
      }
      payloadUpdates.initialDurationMinutes = updates.initialDurationMinutes;
      payloadUpdates.totalDurationMinutes = updates.initialDurationMinutes;
    }

    if (updates.participantMemberIds !== undefined) {
      payloadUpdates.participantMemberIds = this.validateAndNormalizeParticipants(
        updates.participantMemberIds,
        availableMembers,
        familyId
      );
    }

    if (updates.tasks !== undefined) {
      const normalized = this.validateAndNormalizeTasks(updates.tasks, availableTasks, familyId, params.existingAssignments, params.todayDate);
      payloadUpdates.tasks = normalized;
      payloadUpdates.selectedTaskIds = normalized.map(t => t.familyTaskId);
      const strats: Record<string, ChaosTaskStrategy> = {};
      for (const t of normalized) {
        strats[t.familyTaskId] = t.strategy;
      }
      payloadUpdates.taskStrategies = strats;
    } else if (updates.selectedTaskIds !== undefined) {
      const taskConfigs: ChaosSessionTaskConfig[] = updates.selectedTaskIds.map(ftId => ({
        familyTaskId: ftId,
        strategy: (updates.taskStrategies && updates.taskStrategies[ftId]) || 'DISTRIBUTED'
      }));
      const normalized = this.validateAndNormalizeTasks(taskConfigs, availableTasks, familyId, params.existingAssignments, params.todayDate);
      payloadUpdates.tasks = normalized;
      payloadUpdates.selectedTaskIds = normalized.map(t => t.familyTaskId);
      const strats: Record<string, ChaosTaskStrategy> = {};
      for (const t of normalized) {
        strats[t.familyTaskId] = t.strategy;
      }
      payloadUpdates.taskStrategies = strats;
    } else if (updates.taskStrategies !== undefined) {
      payloadUpdates.taskStrategies = updates.taskStrategies;
    }

    if (db && sessionRef) {
      try {
        await updateDoc(sessionRef, FirestoreMappers.toChaosSessionUpdatePayload(payloadUpdates));
      } catch {
        // Graceful em ambiente de testes offline
      }
    }

    return {
      ...(existingSession || {
        id: sessionId,
        familyId,
        createdByMemberId: '',
        status: 'DRAFT' as ChaosSessionStatus,
        createdAt: Timestamp.now(),
        initialDurationMinutes: 15,
        totalDurationMinutes: 15,
        participantMemberIds: [],
        lateParticipantMemberIds: [],
        selectedTaskIds: [],
        tasks: [],
        taskStrategies: {},
        extensions: [],
        bonusAwardedMemberIds: [],
        bonusPointsPerMember: 5
      }),
      ...payloadUpdates
    };
  }

  /**
   * CHA08, CHA09, CHA10, CHA11, CHA12, CHA16, CHA17
   * Inicia uma sessão: DRAFT → ACTIVE via runTransaction.
   * Garante lock de concorrência /chaosState/current.
   * Restrito exclusivamente a ADMIN.
   */
  public static async startChaosSession(params: StartChaosSessionParams): Promise<ChaosSession> {
    const { familyId, sessionId, callerRole, existingSession, isDemoMode } = params;

    if (callerRole !== 'ADMIN') {
      const err = new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem iniciar a sessão do Modo Caos.');
      logStructuredChaosError('startChaosSession', err, { familyId, sessionId, callerRole });
      throw err;
    }

    const isExplicitDemo = Boolean(isDemoMode);

    if (isExplicitDemo || (!db && existingSession)) {
      const base = existingSession || {
        id: sessionId,
        familyId,
        createdByMemberId: 'admin',
        status: 'DRAFT',
        createdAt: Timestamp.now(),
        startedAt: null,
        endedAt: null,
        initialDurationMinutes: 45,
        totalDurationMinutes: 45,
        expiresAt: null,
        participantMemberIds: [],
        lateParticipantMemberIds: [],
        selectedTaskIds: [],
        tasks: [],
        taskStrategies: {},
        extensions: [],
        bonusAwardedMemberIds: [],
        bonusPointsPerMember: 5,
        updatedAt: Timestamp.now()
      } as ChaosSession;

      const startedAt = Timestamp.now();
      const duration = base.initialDurationMinutes || 45;
      const expiresAt = Timestamp.fromMillis(startedAt.toMillis() + duration * 60 * 1000);

      return {
        ...base,
        status: 'ACTIVE',
        startedAt,
        expiresAt,
        updatedAt: startedAt
      };
    }

    if (!db) {
      const err = new Error('DATABASE_NOT_AVAILABLE: Firestore db não inicializado.');
      logStructuredChaosError('startChaosSession', err, { familyId, sessionId });
      throw err;
    }

    const sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);
    const lockRef = doc(db, 'families', familyId, 'chaosState', 'current');

    try {
      return await runTransaction(db, async (transaction) => {
        const lockSnap = await transaction.get(lockRef);
        const sessionSnap = await transaction.get(sessionRef);

        if (!sessionSnap.exists()) {
          throw new Error('SESSION_NOT_FOUND: Sessão não encontrada.');
        }

        const session = FirestoreMappers.toChaosSession(sessionSnap.id, sessionSnap.data());

        if (session.status !== 'DRAFT') {
          throw new Error(`INVALID_STATUS_TRANSITION: Apenas sessões em DRAFT podem ser iniciadas. Status atual: ${session.status}`);
        }

        if (lockSnap.exists()) {
          const lockData = lockSnap.data();
          if (lockData?.activeSessionId) {
            throw new Error(`ACTIVE_SESSION_EXISTS: Já existe uma sessão ativa (${lockData.activeSessionId}) para esta família.`);
          }
        }

        const startedAt = Timestamp.now();
        const expiresAt = Timestamp.fromMillis(startedAt.toMillis() + session.initialDurationMinutes * 60 * 1000);

        // Atualiza a sessão para ACTIVE com serialização canônica estrita
        const sessionUpdate = FirestoreMappers.toChaosSessionUpdatePayload({
          status: 'ACTIVE',
          startedAt,
          expiresAt,
          tasks: (existingSession?.tasks && existingSession.tasks.length > 0) ? existingSession.tasks : undefined,
          updatedAt: startedAt
        });

        transaction.update(sessionRef, sessionUpdate);

        // Atualiza o lock canônico da família
        const lockPayload = FirestoreMappers.fromChaosState({
          activeSessionId: sessionId,
          updatedAt: startedAt
        });
        transaction.set(lockRef, lockPayload);

        return {
          ...session,
          tasks: existingSession?.tasks || session.tasks,
          status: 'ACTIVE',
          startedAt,
          expiresAt,
          updatedAt: startedAt
        };
      });
    } catch (err: any) {
      console.error('[startChaosSession:EXCEPTION]', {
        familyId,
        sessionId,
        name: err?.name,
        code: err?.code,
        message: err?.message,
        stack: err?.stack
      });
      logStructuredChaosError('startChaosSession', err, { familyId, sessionId });
      throw err;
    }
  }

  /**
   * CHA13, CHA14
   * Cancela uma sessão em rascunho: DRAFT → CANCELLED.
   * Sessão ACTIVE NÃO pode ser cancelada (deve ser completada).
   * Restrito a ADMIN.
   */
  public static async cancelDraftChaosSession(params: CancelDraftSessionParams): Promise<ChaosSession> {
    const { familyId, sessionId, callerRole } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem cancelar uma sessão.');
    }

    const existingSession = params.existingSession;
    if (existingSession) {
      if (existingSession.status === 'ACTIVE') {
        throw new Error('ACTIVE_CANNOT_BE_CANCELLED: Uma sessão ACTIVE não pode ser cancelada. Ela deve ser finalizada como COMPLETED.');
      }
      if (existingSession.status !== 'DRAFT') {
        throw new Error(`INVALID_STATUS_TRANSITION: Apenas sessões em DRAFT podem ser canceladas. Status atual: ${existingSession.status}`);
      }
      const updatedAt = Timestamp.now();
      existingSession.status = 'CANCELLED';
      existingSession.updatedAt = updatedAt;
      return existingSession;
    }

    if (!db) {
      throw new Error('DATABASE_NOT_AVAILABLE: Firestore db não inicializado.');
    }

    const sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);
    const snap = await getDoc(sessionRef);

    if (!snap.exists()) {
      throw new Error('SESSION_NOT_FOUND: Sessão não encontrada.');
    }

    const session = FirestoreMappers.toChaosSession(snap.id, snap.data());

    if (session.status === 'ACTIVE') {
      throw new Error('ACTIVE_CANNOT_BE_CANCELLED: Uma sessão ACTIVE não pode ser cancelada. Ela deve ser finalizada como COMPLETED.');
    }

    if (session.status !== 'DRAFT') {
      throw new Error(`INVALID_STATUS_TRANSITION: Apenas sessões em DRAFT podem ser canceladas. Status atual: ${session.status}`);
    }

    const updatedAt = Timestamp.now();
    await updateDoc(sessionRef, FirestoreMappers.toChaosSessionUpdatePayload({
      status: 'CANCELLED',
      updatedAt
    }));

    return {
      ...session,
      status: 'CANCELLED',
      updatedAt
    };
  }

  /**
   * CHC01-CHC15, CHC34-CHC39
   * Avalia de forma pura, idempotente e canônica a elegibilidade de bônus Caos (+5)
   * e calcula o snapshot histórico (summary) da sessão.
   */
  public static evaluateChaosBonusAndSummary(params: EvaluateChaosBonusParams): EvaluateChaosBonusResult {
    const { session, assignments, members = [], effectiveEndedAt } = params;

    const participantSet = new Set<string>([
      ...(session.participantMemberIds || []),
      ...(session.lateParticipantMemberIds || [])
    ]);

    // Fonte canônica de tarefas pertencentes à sessão: session.tasks / session.selectedTaskIds
    const sessionFamilyTaskIds = new Set<string>(session.selectedTaskIds || []);
    const sessionAssignmentIds = new Set<string>();
    if (Array.isArray(session.tasks)) {
      for (const t of session.tasks) {
        if (t.familyTaskId) sessionFamilyTaskIds.add(t.familyTaskId);
        if (t.assignmentId) sessionAssignmentIds.add(t.assignmentId);
      }
    }

    const sessionForEvaluation = {
      ...session,
      startedAt: session.startedAt || session.createdAt,
      endedAt: effectiveEndedAt ?? session.endedAt
    };

    const completedChaosAssignments: TaskAssignment[] = [];
    const eligibleMemberIdsSet = new Set<string>();

    for (const asg of assignments) {
      // HF5: Reuso do predicado canônico para paridade estrita entre ACTIVE e CLOSURE
      if (!isAssignmentCompletedInChaosSession(asg, sessionForEvaluation)) {
        continue;
      }

      completedChaosAssignments.push(asg);

      // 4. Executor real: completed_by ou completedByMemberId (fallback: member_id atribuído)
      const executorId = asg.completed_by || (asg as any).completedByMemberId || (asg as any).completedBy || asg.member_id;
      if (executorId && participantSet.has(executorId)) {
        eligibleMemberIdsSet.add(executorId);
      }
    }

    const eligibleMemberIds = Array.from(eligibleMemberIdsSet);
    const alreadyAwardedSet = new Set<string>(session.bonusAwardedMemberIds || []);
    const bonusPointsDeltaByMemberId: Record<string, number> = {};

    for (const memberId of eligibleMemberIds) {
      if (!alreadyAwardedSet.has(memberId)) {
        bonusPointsDeltaByMemberId[memberId] = session.bonusPointsPerMember || 5;
      } else {
        bonusPointsDeltaByMemberId[memberId] = 0;
      }
    }

    const finalBonusAwardedMemberIds = Array.from(
      new Set([...alreadyAwardedSet, ...eligibleMemberIds])
    );

    const totalTasks = session.selectedTaskIds ? session.selectedTaskIds.length : (session.tasks ? session.tasks.length : 0);
    const completedCount = completedChaosAssignments.length;
    const rawRate = totalTasks === 0 ? 0 : completedCount / totalTasks;
    const completionRate = totalTasks === 0 ? 0 : Math.min(1.0, Math.max(0.0, Number(rawRate.toFixed(4))));
    const participantsCount = participantSet.size;
    const bonusRecipientsCount = finalBonusAwardedMemberIds.length;

    const summary: ChaosSessionSummary = {
      totalTasks,
      completedCount,
      completionRate,
      participantsCount,
      bonusRecipientsCount
    };

    return {
      eligibleMemberIds,
      bonusAwardedMemberIds: finalBonusAwardedMemberIds,
      bonusPointsDeltaByMemberId,
      summary,
      completedChaosAssignments
    };
  }

  /**
   * CHC16-CHC27
   * Estende uma sessão ACTIVE em +15 ou +30 minutos.
   * Restrito exclusivamente a ADMIN da mesma família.
   * Não redistribui tarefas, não altera participantes, não concede bônus.
   */
  public static async extendChaosSession(params: ExtendChaosSessionParams): Promise<ChaosSession> {
    const { familyId, sessionId, callerRole, callerMemberId, extensionMinutes } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem estender o tempo da sessão.');
    }

    if (extensionMinutes !== 15 && extensionMinutes !== 30) {
      throw new Error(`INVALID_EXTENSION_MINUTES: Apenas extensões de 15 ou 30 minutos são permitidas. Recebido: ${extensionMinutes}`);
    }

    const existingSession = params.existingSession;

    if (existingSession) {
      if (existingSession.status === 'DRAFT') {
        throw new Error('INVALID_STATUS_TRANSITION: Sessões em DRAFT não podem ser estendidas.');
      }
      if (existingSession.status !== 'ACTIVE') {
        throw new Error(`INVALID_STATUS_TRANSITION: Apenas sessões ACTIVE podem ser estendidas. Status atual: ${existingSession.status}`);
      }

      const extendedAt = Timestamp.now();
      const extRecord: ChaosTimeExtension = {
        extendedMinutes: extensionMinutes as 15 | 30,
        extendedAt,
        extendedByMemberId: callerMemberId
      };

      const currentDuration = existingSession.totalDurationMinutes || existingSession.initialDurationMinutes || 15;
      const totalDurationMinutes = currentDuration + extensionMinutes;

      const currentExpiresMillis = toMillis(existingSession.expiresAt) ||
        (toMillis(existingSession.startedAt) + (existingSession.initialDurationMinutes || 15) * 60 * 1000);
      const expiresAt = Timestamp.fromMillis(currentExpiresMillis + extensionMinutes * 60 * 1000);

      existingSession.totalDurationMinutes = totalDurationMinutes;
      existingSession.expiresAt = expiresAt;
      existingSession.extensions = [...(existingSession.extensions || []), extRecord];
      existingSession.updatedAt = extendedAt;

      return existingSession;
    }

    if (!db) {
      throw new Error('DATABASE_NOT_AVAILABLE: Firestore db não inicializado.');
    }

    const sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);

    return await runTransaction(db, async (transaction) => {
      const sessionSnap = await transaction.get(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error('SESSION_NOT_FOUND: Sessão não encontrada.');
      }

      const session = FirestoreMappers.toChaosSession(sessionSnap.id, sessionSnap.data());

      if (session.status === 'DRAFT') {
        throw new Error('INVALID_STATUS_TRANSITION: Sessões em DRAFT não podem ser estendidas.');
      }
      if (session.status !== 'ACTIVE') {
        throw new Error(`INVALID_STATUS_TRANSITION: Apenas sessões ACTIVE podem ser estendidas. Status atual: ${session.status}`);
      }

      const extendedAt = Timestamp.now();
      const extRecord: ChaosTimeExtension = {
        extendedMinutes: extensionMinutes as 15 | 30,
        extendedAt,
        extendedByMemberId: callerMemberId
      };

      const currentDuration = session.totalDurationMinutes || session.initialDurationMinutes || 15;
      const totalDurationMinutes = currentDuration + extensionMinutes;

      const currentExpiresMillis = toMillis(session.expiresAt) ||
        (toMillis(session.startedAt) + (session.initialDurationMinutes || 15) * 60 * 1000);
      const expiresAt = Timestamp.fromMillis(currentExpiresMillis + extensionMinutes * 60 * 1000);

      const extensions = [...(session.extensions || []), extRecord];

      transaction.update(sessionRef, FirestoreMappers.toChaosSessionUpdatePayload({
        totalDurationMinutes,
        expiresAt,
        extensions,
        updatedAt: extendedAt
      }));

      return {
        ...session,
        totalDurationMinutes,
        expiresAt,
        extensions,
        updatedAt: extendedAt
      };
    });
  }

  /**
   * CHA15, CHA29, CHC01-CHC15, CHC28-CHC30, CHC40
   * Finaliza uma sessão ativa: ACTIVE → COMPLETED via runTransaction.
   * Concede bônus de participação de +5 exactly-once para quem concluiu >= 1 tarefa da sessão.
   * Gera snapshot histórico auditável (summary).
   * Libera o lock atômico activeSessionId = null.
   * Restrito exclusivamente a ADMIN.
   */
  public static async completeChaosSession(params: CompleteChaosSessionParams): Promise<ChaosSession> {
    const { familyId, sessionId, callerRole, assignments = [], members = [] } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem finalizar a sessão.');
    }

    const existingSession = params.existingSession;

    // Se temos existingSession fornecido (em memória / simulação / testes)
    if (existingSession) {
      if (existingSession.status === 'COMPLETED') {
        // Idempotência estrita: double complete / F5 / retry não duplica bônus
        return existingSession;
      }
      if (existingSession.status !== 'ACTIVE') {
        throw new Error(`INVALID_STATUS_TRANSITION: Apenas sessões ACTIVE podem ser finalizadas. Status atual: ${existingSession.status}`);
      }

      const endedAt = params.effectiveEndedAt || Timestamp.now();
      const evalResult = ChaosSessionService.evaluateChaosBonusAndSummary({
        session: existingSession,
        assignments,
        members,
        effectiveEndedAt: endedAt
      });

      // Aplica +5 para membros premiados (que ainda não haviam recebido)
      for (const [memberId, delta] of Object.entries(evalResult.bonusPointsDeltaByMemberId)) {
        if (delta > 0) {
          const targetMember = members.find(m => m.id === memberId);
          if (targetMember) {
            targetMember.points = (targetMember.points || 0) + delta;
          }
        }
      }

      existingSession.status = 'COMPLETED';
      existingSession.endedAt = endedAt;
      existingSession.bonusAwardedMemberIds = evalResult.bonusAwardedMemberIds;
      existingSession.summary = evalResult.summary;
      existingSession.updatedAt = endedAt;

      return existingSession;
    }

    if (!db) {
      throw new Error('DATABASE_NOT_AVAILABLE: Firestore db não inicializado.');
    }

    const sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);
    const lockRef = doc(db, 'families', familyId, 'chaosState', 'current');

    return await runTransaction(db, async (transaction) => {
      const sessionSnap = await transaction.get(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error('SESSION_NOT_FOUND: Sessão não encontrada.');
      }

      const session = FirestoreMappers.toChaosSession(sessionSnap.id, sessionSnap.data());

      if (session.status === 'COMPLETED') {
        // Idempotência estrita: double complete / F5 / retry não duplica bônus
        return session;
      }

      if (session.status !== 'ACTIVE') {
        throw new Error(`INVALID_STATUS_TRANSITION: Apenas sessões ACTIVE podem ser finalizadas. Status atual: ${session.status}`);
      }

      const lockSnap = await transaction.get(lockRef);
      if (lockSnap.exists()) {
        const lockData = lockSnap.data();
        if (lockData?.activeSessionId && lockData.activeSessionId !== sessionId) {
          throw new Error(`LOCK_MISMATCH: Lock atual (${lockData.activeSessionId}) não pertence à sessão ${sessionId}.`);
        }
      }

      const endedAt = params.effectiveEndedAt || Timestamp.now();
      const evalResult = ChaosSessionService.evaluateChaosBonusAndSummary({
        session,
        assignments,
        members,
        effectiveEndedAt: endedAt
      });

      // Leitura transacional dos membros a premiar
      const memberUpdates: { ref: any; newPoints: number; memberId: string }[] = [];
      for (const [memberId, delta] of Object.entries(evalResult.bonusPointsDeltaByMemberId)) {
        if (delta > 0) {
          const mRef = doc(db, 'families', familyId, 'members', memberId);
          const mSnap = await transaction.get(mRef);
          if (mSnap.exists()) {
            const currentPoints = mSnap.data()?.points || 0;
            memberUpdates.push({
              ref: mRef,
              newPoints: currentPoints + delta,
              memberId
            });
          }
        }
      }

      // Escritas após leituras
      for (const mUp of memberUpdates) {
        transaction.update(mUp.ref, {
          points: mUp.newPoints,
          updatedAt: endedAt
        });
        // Atualiza in-memory se fornecido
        const m = members.find(mem => mem.id === mUp.memberId);
        if (m) {
          m.points = mUp.newPoints;
        }
      }

      transaction.update(sessionRef, FirestoreMappers.toChaosSessionUpdatePayload({
        status: 'COMPLETED',
        endedAt,
        bonusAwardedMemberIds: evalResult.bonusAwardedMemberIds,
        summary: evalResult.summary,
        updatedAt: endedAt
      }));

      transaction.set(lockRef, FirestoreMappers.fromChaosState({
        activeSessionId: null,
        updatedAt: endedAt
      }));

      return {
        ...session,
        status: 'COMPLETED',
        endedAt,
        bonusAwardedMemberIds: evalResult.bonusAwardedMemberIds,
        summary: evalResult.summary,
        updatedAt: endedAt
      };
    });
  }

  /**
   * CHA26, CHA27
   * Recupera a sessão ativa a partir do lock canônico /chaosState/current.
   */
  public static async getActiveChaosSession(familyId: string): Promise<ChaosSession | null> {
    if (!db || !familyId) {
      return null;
    }

    try {
      const lockRef = doc(db, 'families', familyId, 'chaosState', 'current');
      const lockSnap = await getDoc(lockRef);

      if (!lockSnap.exists()) {
        return null;
      }

      const activeId = lockSnap.data()?.activeSessionId;
      if (!activeId) {
        return null;
      }

      const sessionRef = doc(db, 'families', familyId, 'chaosSessions', activeId);
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        return null;
      }

      const session = FirestoreMappers.toChaosSession(sessionSnap.id, sessionSnap.data());
      if (session.status === 'ACTIVE') {
        return session;
      }

      return null;
    } catch (err) {
      console.warn('[ChaosSessionService] Erro ao recuperar sessão ativa:', err);
      return null;
    }
  }

  /**
   * CHD22, CHD48
   * Escuta em tempo real mudanças no lock atômico /chaosState/current e na ChaosSession ativa.
   * Retorna uma função de cancelamento de subscrição.
   */
  public static subscribeToActiveChaosSession(
    familyId: string,
    onUpdate: (session: ChaosSession | null) => void,
    onError?: (err: any) => void
  ): () => void {
    if (!db || !familyId) {
      onUpdate(null);
      return () => {};
    }

    let unsubSession: (() => void) | null = null;
    let currentActiveId: string | null = null;

    try {
      const lockRef = doc(db, 'families', familyId, 'chaosState', 'current');
      const unsubLock = onSnapshot(
        lockRef,
        (lockSnap) => {
          const activeId = lockSnap.exists() ? lockSnap.data()?.activeSessionId : null;
          if (!activeId) {
            if (unsubSession) {
              unsubSession();
              unsubSession = null;
            }
            currentActiveId = null;
            onUpdate(null);
            return;
          }

          if (activeId !== currentActiveId) {
            if (unsubSession) {
              unsubSession();
              unsubSession = null;
            }
            currentActiveId = activeId;

            const sessionRef = doc(db, 'families', familyId, 'chaosSessions', activeId);
            unsubSession = onSnapshot(
              sessionRef,
              (sessionSnap) => {
                if (sessionSnap.exists()) {
                  const session = FirestoreMappers.toChaosSession(sessionSnap.id, sessionSnap.data());
                  if (session.status === 'ACTIVE') {
                    onUpdate(session);
                    return;
                  }
                }
                onUpdate(null);
              },
              (err) => {
                if (onError) onError(err);
                else console.warn('[ChaosSessionService] Erro ao escutar sessão ativa:', err);
                onUpdate(null);
              }
            );
          }
        },
        (err) => {
          if (onError) onError(err);
          else console.warn('[ChaosSessionService] Erro ao escutar lock do Modo Caos:', err);
          onUpdate(null);
        }
      );

      return () => {
        unsubLock();
        if (unsubSession) {
          unsubSession();
          unsubSession = null;
        }
      };
    } catch (err) {
      if (onError) onError(err);
      onUpdate(null);
      return () => {};
    }
  }

  /**
   * Listener reativo em tempo real para as atribuições (TaskAssignments) vinculadas à sessão do Caos.
   * Garante convergência imediata entre MEMBER e ADMIN sem necessidade de refresh/F5.
   */
  public static subscribeToChaosAssignments(
    familyId: string,
    sessionId: string,
    onUpdate: (assignments: TaskAssignment[]) => void,
    onError?: (err: any) => void
  ): () => void {
    if (!db || !familyId || !sessionId) {
      onUpdate([]);
      return () => {};
    }

    try {
      const q = query(
        collection(db, 'families', familyId, 'assignments'),
        where('chaos_session_id', '==', sessionId)
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list: TaskAssignment[] = [];
          snap.forEach(docSnap => {
            list.push(FirestoreMappers.toTaskAssignment(docSnap.id, docSnap.data()));
          });
          onUpdate(list);
        },
        (err) => {
          console.warn('[ChaosSessionService] Erro ao escutar atribuições do Modo Caos:', err);
          if (onError) onError(err);
        }
      );
      return unsub;
    } catch (err) {
      console.warn('[ChaosSessionService] Falha ao registrar subscribeToChaosAssignments:', err);
      return () => {};
    }
  }

  /**
   * CHA18, CHA19
   * Avalia permissão de acesso/leitura do Member a uma sessão:
   * - ADMIN tem acesso a qualquer sessão da família.
   * - MEMBER tem acesso APENAS se status == 'ACTIVE' E membro for participante.
   */
  public static canMemberAccessChaosSession(
    session: ChaosSession,
    callerMemberId: string,
    callerRole: UserRole | string
  ): boolean {
    if (callerRole === 'ADMIN') {
      return true;
    }
    if (callerRole === 'MEMBER') {
      const isParticipant =
        (session.participantMemberIds || []).includes(callerMemberId) ||
        (session.lateParticipantMemberIds || []).includes(callerMemberId);
      return session.status === 'ACTIVE' && isParticipant;
    }
    return false;
  }

  /**
   * CHA21, CHA22, CHA23, CHA24
   * Atualiza FamilyTask.chaosEligible.
   * Restrito exclusivamente a ADMIN.
   * Não altera active, recorrência ou assignments.
   */
  public static async updateFamilyTaskChaosEligible(
    params: UpdateFamilyTaskChaosEligibleParams
  ): Promise<boolean> {
    const { familyId, familyTaskId, chaosEligible, callerRole } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem alterar a elegibilidade de tarefas para o Modo Caos.');
    }

    if (!db) {
      throw new Error('DATABASE_NOT_AVAILABLE: Firestore db não inicializado.');
    }

    const ftRef = doc(db, 'families', familyId, 'familyTasks', familyTaskId);
    const snap = await getDoc(ftRef);

    if (!snap.exists()) {
      throw new Error('TASK_NOT_FOUND: Rotina da família não encontrada.');
    }

    await updateDoc(ftRef, {
      chaosEligible: Boolean(chaosEligible),
      updatedAt: new Date().toISOString()
    });

    return true;
  }

  /**
   * CHAOS-1B: Adiciona ou atualiza uma tarefa no rascunho da sessão com sua estratégia operacional.
   * Restrito exclusivamente a ADMIN em sessões DRAFT.
   */
  public static async addTaskToDraftSession(params: AddTaskToDraftParams): Promise<ChaosSession> {
    const { familyId, sessionId, callerRole, familyTaskId, strategy = 'DISTRIBUTED', availableTasks, existingSession: providedSession } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem adicionar tarefas à sessão.');
    }

    let existingSession: ChaosSession | null = providedSession || null;
    let sessionRef: any = null;

    if (!existingSession && db) {
      try {
        sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);
        const snap = await getDoc(sessionRef);
        if (snap.exists()) {
          existingSession = FirestoreMappers.toChaosSession(snap.id, snap.data());
        }
      } catch {
        // Graceful em testes offline
      }
    }

    if (existingSession && existingSession.status !== 'DRAFT') {
      throw new Error('CANNOT_MODIFY_NON_DRAFT_SESSION: Apenas sessões em DRAFT podem receber tarefas.');
    }

    const normalized = this.validateAndNormalizeTasks(
      [{ familyTaskId, strategy }],
      availableTasks,
      familyId,
      params.existingAssignments,
      params.todayDate
    );
    const taskToAdd = normalized[0];

    const currentTasks = existingSession?.tasks || [];
    const currentStrategies = { ...(existingSession?.taskStrategies || {}) };

    const taskIndex = currentTasks.findIndex(t => t.familyTaskId === familyTaskId);
    let updatedTasks: ChaosSessionTaskConfig[];

    if (taskIndex !== -1) {
      updatedTasks = [...currentTasks];
      updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], strategy: taskToAdd.strategy };
    } else {
      updatedTasks = [...currentTasks, taskToAdd];
    }

    currentStrategies[familyTaskId] = taskToAdd.strategy;
    const selectedTaskIds = updatedTasks.map(t => t.familyTaskId);
    const updatedAt = Timestamp.now();

    if (db && sessionRef) {
      try {
        await updateDoc(sessionRef, FirestoreMappers.toChaosSessionUpdatePayload({
          tasks: updatedTasks,
          selectedTaskIds,
          taskStrategies: currentStrategies,
          updatedAt
        }));
      } catch {
        // Graceful em testes offline
      }
    }

    return {
      ...(existingSession || {
        id: sessionId,
        familyId,
        createdByMemberId: '',
        status: 'DRAFT' as ChaosSessionStatus,
        createdAt: Timestamp.now(),
        initialDurationMinutes: 15,
        totalDurationMinutes: 15,
        participantMemberIds: [],
        lateParticipantMemberIds: [],
        selectedTaskIds: [],
        tasks: [],
        taskStrategies: {},
        extensions: [],
        bonusAwardedMemberIds: [],
        bonusPointsPerMember: 5
      }),
      tasks: updatedTasks,
      selectedTaskIds,
      taskStrategies: currentStrategies,
      updatedAt
    };
  }

  /**
   * CHAOS-1B: Remove uma tarefa do rascunho da sessão.
   * Restrito a ADMIN em sessões DRAFT.
   */
  public static async removeTaskFromDraftSession(params: RemoveTaskFromDraftParams): Promise<ChaosSession> {
    const { familyId, sessionId, callerRole, familyTaskId, existingSession: providedSession } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem remover tarefas da sessão.');
    }

    let existingSession: ChaosSession | null = providedSession || null;
    let sessionRef: any = null;

    if (!existingSession && db) {
      try {
        sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);
        const snap = await getDoc(sessionRef);
        if (snap.exists()) {
          existingSession = FirestoreMappers.toChaosSession(snap.id, snap.data());
        }
      } catch {
        // Graceful em testes offline
      }
    }

    if (existingSession && existingSession.status !== 'DRAFT') {
      throw new Error('CANNOT_MODIFY_NON_DRAFT_SESSION: Apenas sessões em DRAFT podem ter tarefas removidas.');
    }

    const currentTasks = existingSession?.tasks || [];
    const currentStrategies = { ...(existingSession?.taskStrategies || {}) };

    const updatedTasks = currentTasks.filter(t => t.familyTaskId !== familyTaskId);
    delete currentStrategies[familyTaskId];
    const selectedTaskIds = updatedTasks.map(t => t.familyTaskId);
    const updatedAt = Timestamp.now();

    if (db && sessionRef) {
      try {
        await updateDoc(sessionRef, FirestoreMappers.toChaosSessionUpdatePayload({
          tasks: updatedTasks,
          selectedTaskIds,
          taskStrategies: currentStrategies,
          updatedAt
        }));
      } catch {
        // Graceful em testes offline
      }
    }

    return {
      ...(existingSession || {
        id: sessionId,
        familyId,
        createdByMemberId: '',
        status: 'DRAFT' as ChaosSessionStatus,
        createdAt: Timestamp.now(),
        initialDurationMinutes: 15,
        totalDurationMinutes: 15,
        participantMemberIds: [],
        lateParticipantMemberIds: [],
        selectedTaskIds: [],
        tasks: [],
        taskStrategies: {},
        extensions: [],
        bonusAwardedMemberIds: [],
        bonusPointsPerMember: 5
      }),
      tasks: updatedTasks,
      selectedTaskIds,
      taskStrategies: currentStrategies,
      updatedAt
    };
  }

  /**
   * CHAOS-1B: Atualiza a estratégia operacional de uma tarefa no rascunho.
   * Restrito a ADMIN em sessões DRAFT.
   */
  public static async updateTaskStrategyInDraft(params: UpdateTaskStrategyParams): Promise<ChaosSession> {
    const { familyId, sessionId, callerRole, familyTaskId, strategy, existingSession: providedSession } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem alterar a estratégia da tarefa.');
    }

    if (strategy !== 'DISTRIBUTED' && strategy !== 'OPEN_POOL') {
      throw new Error(`INVALID_STRATEGY: Estratégia ${strategy} inválida. Permitido apenas DISTRIBUTED ou OPEN_POOL.`);
    }

    let existingSession: ChaosSession | null = providedSession || null;
    let sessionRef: any = null;

    if (!existingSession && db) {
      try {
        sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);
        const snap = await getDoc(sessionRef);
        if (snap.exists()) {
          existingSession = FirestoreMappers.toChaosSession(snap.id, snap.data());
        }
      } catch {
        // Graceful em testes offline
      }
    }

    if (existingSession && existingSession.status !== 'DRAFT') {
      throw new Error('CANNOT_MODIFY_NON_DRAFT_SESSION: Apenas sessões em DRAFT podem ter estratégias alteradas.');
    }

    const currentTasks = existingSession?.tasks || [];
    const currentStrategies = { ...(existingSession?.taskStrategies || {}) };

    const taskIndex = currentTasks.findIndex(t => t.familyTaskId === familyTaskId);
    let updatedTasks: ChaosSessionTaskConfig[];

    if (taskIndex !== -1) {
      updatedTasks = [...currentTasks];
      updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], strategy };
    } else {
      updatedTasks = [...currentTasks, { familyTaskId, strategy }];
    }

    currentStrategies[familyTaskId] = strategy;
    const selectedTaskIds = updatedTasks.map(t => t.familyTaskId);
    const updatedAt = Timestamp.now();

    if (db && sessionRef) {
      try {
        await updateDoc(sessionRef, FirestoreMappers.toChaosSessionUpdatePayload({
          tasks: updatedTasks,
          selectedTaskIds,
          taskStrategies: currentStrategies,
          updatedAt
        }));
      } catch {
        // Graceful em testes offline
      }
    }

    return {
      ...(existingSession || {
        id: sessionId,
        familyId,
        createdByMemberId: '',
        status: 'DRAFT' as ChaosSessionStatus,
        createdAt: Timestamp.now(),
        initialDurationMinutes: 15,
        totalDurationMinutes: 15,
        participantMemberIds: [],
        lateParticipantMemberIds: [],
        selectedTaskIds: [],
        tasks: [],
        taskStrategies: {},
        extensions: [],
        bonusAwardedMemberIds: [],
        bonusPointsPerMember: 5
      }),
      tasks: updatedTasks,
      selectedTaskIds,
      taskStrategies: currentStrategies,
      updatedAt
    };
  }

  /**
   * CHAOS-1B: Adiciona um participante tardio (Late Participant) em sessão ACTIVE.
   * Restrito a ADMIN.
   * Invariante: Tarefas já distribuídas NÃO são redistribuídas retroativamente.
   */
  public static async addLateParticipant(params: AddLateParticipantParams): Promise<ChaosSession> {
    const { familyId, sessionId, callerRole, memberId, availableMembers, existingSession: providedSession } = params;

    if (callerRole !== 'ADMIN') {
      throw new Error('FORBIDDEN_MEMBER_ACCESS: Apenas administradores podem adicionar participantes tardios à sessão.');
    }

    let existingSession: ChaosSession | null = providedSession || null;
    let sessionRef: any = null;

    if (!existingSession && db) {
      try {
        sessionRef = doc(db, 'families', familyId, 'chaosSessions', sessionId);
        const snap = await getDoc(sessionRef);
        if (snap.exists()) {
          existingSession = FirestoreMappers.toChaosSession(snap.id, snap.data());
        }
      } catch {
        // Graceful em testes offline
      }
    }

    if (existingSession && existingSession.status !== 'ACTIVE') {
      throw new Error(`INVALID_STATUS_FOR_LATE_PARTICIPANT: Participantes tardios só podem ser adicionados em sessões ACTIVE. Status atual: ${existingSession.status}`);
    }

    if (availableMembers && availableMembers.length > 0) {
      const member = availableMembers.find(m => m.id === memberId);
      if (!member) {
        throw new Error(`MEMBER_NOT_IN_FAMILY: Participante ${memberId} não pertence à família.`);
      }
      if (member.familyId && member.familyId !== familyId && member.family_id !== familyId) {
        throw new Error(`MEMBER_NOT_IN_FAMILY: Participante ${memberId} não pertence à família ${familyId}.`);
      }
      if (member.active === false) {
        throw new Error(`INACTIVE_MEMBER_REJECTED: Participante ${memberId} está inativo.`);
      }
    }

    const currentParticipants = existingSession?.participantMemberIds || [];
    const currentLate = existingSession?.lateParticipantMemberIds || [];

    if (currentParticipants.includes(memberId)) {
      return existingSession!;
    }

    const updatedParticipants = [...currentParticipants, memberId];
    const updatedLate = Array.from(new Set([...currentLate, memberId]));
    const updatedAt = Timestamp.now();

    if (db && sessionRef) {
      try {
        await updateDoc(sessionRef, FirestoreMappers.toChaosSessionUpdatePayload({
          participantMemberIds: updatedParticipants,
          lateParticipantMemberIds: updatedLate,
          updatedAt
        }));
      } catch {
        // Graceful em testes offline
      }
    }

    return {
      ...(existingSession || {
        id: sessionId,
        familyId,
        createdByMemberId: '',
        status: 'ACTIVE' as ChaosSessionStatus,
        createdAt: Timestamp.now(),
        initialDurationMinutes: 15,
        totalDurationMinutes: 15,
        participantMemberIds: [],
        lateParticipantMemberIds: [],
        selectedTaskIds: [],
        tasks: [],
        taskStrategies: {},
        extensions: [],
        bonusAwardedMemberIds: [],
        bonusPointsPerMember: 5
      }),
      participantMemberIds: updatedParticipants,
      lateParticipantMemberIds: updatedLate,
      updatedAt
    };
  }

  /**
   * CHAOS-1B: Obtém ou sintetiza um TaskMaster canônico a partir de uma FamilyTask.
   */
  public static getOrCreateTaskMaster(familyTask: FamilyTask, catalogTasks?: TaskMaster[]): TaskMaster {
    const pool = catalogTasks && catalogTasks.length > 0 ? catalogTasks : allMasterTasks;
    const tmId = familyTask.task_master_id || (familyTask as any).taskId || familyTask.id;
    const found = pool.find(t => t.id === tmId || (familyTask.name && t.name.toLowerCase() === familyTask.name.toLowerCase()));
    if (found) return found;

    return {
      id: tmId,
      name: familyTask.name || familyTask.custom_name || (familyTask as any).customTitle || 'Tarefa',
      description: (familyTask as any).customDescription || (familyTask as any).custom_description || '',
      category: (familyTask.category as any) || 'cleaning',
      room_type: (familyTask.room_id as any) || (familyTask.roomId as any) || 'living_room',
      minimum_age: familyTask.min_age !== undefined ? familyTask.min_age : 0,
      difficulty: familyTask.difficulty_score || 2,
      duration_minutes: familyTask.estimated_minutes || 20,
      effort_level: 2,
      autonomy_required: familyTask.min_autonomy !== undefined ? familyTask.min_autonomy : 1,
      frequency_type: 'daily',
      safety_level: 'safe',
      requires_supervision: familyTask.requires_help === true,
      can_be_done_in_pair: false,
      can_be_delegated: true,
      instructions: [],
      materials: [],
      active: true
    };
  }

  /**
   * CHAOS-1B: Executa a distribuição da tarefa através do contrato público canônico do Motor 2.0.
   * Utiliza DistributionEngine.distributeDailyTasks sem criar pipeline paralelo.
   */
  public static executeMotor2Distribution(params: {
    taskMaster: TaskMaster;
    familyTask: FamilyTask;
    participants: Member[];
    todayDate: string;
    existingAssignments: TaskAssignment[];
    protectedTimes: ProtectedTime[];
    skills: MemberSkill[];
    preferences: MemberPreference[];
    allTasks: TaskMaster[];
  }): TaskAssignment {
    const {
      taskMaster,
      familyTask,
      participants,
      todayDate,
      existingAssignments,
      protectedTimes,
      skills,
      preferences,
      allTasks
    } = params;

    const d = new Date(`${todayDate}T12:00:00Z`);
    const dayOfWeek = isNaN(d.getTime()) ? new Date().getDay() : d.getUTCDay();

    // Filtra apenas membros ativos dentre os participantes da sessão
    const activeParticipants = (participants || []).filter(m => m.active !== false);

    const taskPool = allTasks && allTasks.length > 0
      ? (allTasks.some(t => t.id === taskMaster.id) ? allTasks : [...allTasks, taskMaster])
      : [taskMaster];

    const distributionCtx: DistributionContext = {
      users: activeParticipants,
      allTasks: taskPool,
      familyTasks: [{
        ...familyTask,
        task_master_id: taskMaster.id,
        active: true,
        frequency: 'daily'
      }],
      skills,
      preferences,
      protectedTimes,
      availabilities: [],
      calendarEvents: [],
      existingAssignments,
      targetDate: todayDate,
      dayOfWeek
    };

    const engineAssignments = DistributionEngine.distributeDailyTasks(distributionCtx);
    if (engineAssignments.length > 0) {
      return engineAssignments[0];
    }

    return {
      id: `asg-unassigned-${todayDate}-${taskMaster.id}-${Date.now()}`,
      family_id: familyTask.family_id,
      family_task_id: familyTask.id,
      task_id: taskMaster.id,
      member_id: '',
      scheduled_date: todayDate,
      scheduled_start: familyTask.preferred_time || '08:00',
      status: 'SCHEDULED',
      score: 0,
      assigned_reason: 'Nenhum participante disponível para esta tarefa.',
      unassigned_reason: 'Critérios de segurança, limite diário de minutos ou horários protegidos impediram a alocação automática.',
      is_unassigned: true,
      factors: {
        availability: 'Participantes indisponíveis ou no limite diário',
        autonomy: 'Nenhum morador disponível com nível de segurança/autonomia adequado',
        weeklyBalance: 'Aguardando decisão manual do gestor da rotina',
        history: 'N/A',
        preference: 'N/A'
      },
      rescheduled_count: 0
    };
  }

  /**
   * CHAOS-1B: Resolve a ocorrência operacional de uma tarefa para o Modo Caos.
   * - Procura ocorrência existente para HOJE (prevenção de duplicidade).
   * - Se já estiver CONCLUÍDA: NUNCA reabre, nunca sobrescreve, nunca duplica.
   * - Se pendente: reutiliza ocorrência existente vinculando à ChaosSession e aplicando a estratégia.
   * - Se não existir: cria nova ocorrência com a estratégia (OPEN_POOL ou DISTRIBUTED).
   */
  public static resolveTaskOccurrenceForChaos(params: ResolveChaosOccurrenceParams): ResolveChaosOccurrenceResult {
    const {
      familyId,
      session,
      taskConfig,
      familyTask,
      todayDate,
      existingAssignments,
      participants,
      allTasks,
      protectedTimes = [],
      skills = [],
      preferences = []
    } = params;

    const strategy: ChaosTaskStrategy = taskConfig.strategy || 'DISTRIBUTED';
    const tm = params.taskMaster || this.getOrCreateTaskMaster(familyTask, allTasks);

    const ftId = familyTask.id;
    const tmId = tm.id;

    // Invariant 2: Conjunto canônico de participantes efetivos da sessão
    const allowedMemberIds = new Set<string>([
      ...(session.participantMemberIds || []),
      ...(session.lateParticipantMemberIds || [])
    ]);

    // Candidatos passados para o Motor pertencem ESTRITAMENTE a participantMemberIds / lateParticipantMemberIds
    const candidateParticipants = (participants || []).filter(
      p => allowedMemberIds.has(p.id) && p.active !== false
    );

    // 1. Procurar ocorrência canônica existente para HOJE
    const configAssignmentId = taskConfig.assignmentId || (familyTask as any).assignmentId;
    const existingIndex = existingAssignments.findIndex(a => {
      const matchFamily = !a.family_id || a.family_id === familyId;
      const matchId = Boolean(configAssignmentId && a.id === configAssignmentId);
      const matchTask = a.family_task_id === ftId ||
                        (a as any).familyTaskId === ftId ||
                        a.task_id === tmId ||
                        (a as any).taskId === tmId ||
                        (a as any).taskMasterId === tmId ||
                        a.id === ftId ||
                        a.task_id === ftId;
      const matchDate = (a.scheduled_date === todayDate) || ((a as any).dueDate === todayDate) || ((a as any).date === todayDate);
      const notCancelled = a.status !== 'CANCELLED';
      return matchFamily && (matchId || matchTask) && matchDate && notCancelled;
    });

    if (existingIndex !== -1) {
      const existing = existingAssignments[existingIndex];

      // SE JÁ ESTIVER CONCLUÍDA: REGRA INVARIANTE -> NUNCA REABRIR, NUNCA SOBRESCREVER, NUNCA DUPLICAR
      if (existing.status === 'COMPLETED' || existing.status === 'DONE') {
        return {
          assignment: existing,
          isNew: false,
          reused: true,
          wasAlreadyCompleted: true
        };
      }

      // MATRIZ DE RESOLUÇÃO DO MODO CAOS (CANÔNICA):
      // D. OPEN_POOL -> member_id = '', is_unassigned = true, sem Motor
      if (strategy === 'OPEN_POOL') {
        const updated: TaskAssignment = {
          ...existing,
          chaos_session_id: session.id,
          chaosSessionId: session.id,
          chaos_strategy: 'OPEN_POOL',
          chaosStrategy: 'OPEN_POOL',
          member_id: '',
          is_unassigned: true,
          unassigned_reason: 'Disponível no Modo Caos (Pool Aberto)',
          score: 0
        };
        (updated as any).assignedMemberId = '';
        (updated as any).assignee_id = '';
        (updated as any).assigneeId = '';
        (updated as any).assignedReason = undefined;
        updated.assigned_reason = undefined;

        return {
          assignment: updated,
          isNew: false,
          reused: true,
          wasAlreadyCompleted: false
        };
      }

      // DISTRIBUTED -> Avaliar Matriz A vs B vs C
      const isAssigneeParticipant = Boolean(
        existing.member_id &&
        allowedMemberIds.has(existing.member_id) &&
        !existing.is_unassigned
      );

      // Checagem de elegibilidade para Matriz A: assignee É participante e continua Safety/Eligibility válido
      let isAssigneeStillEligible = false;
      if (isAssigneeParticipant) {
        const assigneeMember = candidateParticipants.find(p => p.id === existing.member_id);
        if (assigneeMember && assigneeMember.active !== false) {
          const d = new Date(`${todayDate}T12:00:00Z`);
          const dayOfWeek = isNaN(d.getTime()) ? new Date().getDay() : d.getUTCDay();
          const targetSlot = existing.scheduled_start || familyTask.preferred_time || '08:00';
          const eligibility = EligibilityService.checkEligibility(
            assigneeMember,
            tm,
            targetSlot,
            {
              protectedTimes: protectedTimes || [],
              calendarEvents: [],
              allTasks: allTasks && allTasks.length > 0 ? allTasks : [tm],
              targetDate: todayDate,
              dayOfWeek,
              skills: skills || []
            },
            existingAssignments.filter(a => a.id !== existing.id)
          );
          isAssigneeStillEligible = eligibility.isEligible;
        }
      }

      // A. DISTRIBUTED + assignment já atribuído + assignee É participante + continua Safety/Eligibility válido
      if (isAssigneeParticipant && isAssigneeStillEligible) {
        const updated: TaskAssignment = {
          ...existing,
          chaos_session_id: session.id,
          chaosSessionId: session.id,
          chaos_strategy: 'DISTRIBUTED',
          chaosStrategy: 'DISTRIBUTED',
          is_unassigned: false,
          unassigned_reason: undefined
        };
        (updated as any).assignedMemberId = existing.member_id;
        (updated as any).assignee_id = existing.member_id;
        (updated as any).assigneeId = existing.member_id;

        return {
          assignment: updated,
          isNew: false,
          reused: true,
          wasAlreadyCompleted: false
        };
      }

      // B. DISTRIBUTED + pre-assigned a NÃO participante (ou perdeu elegibilidade)
      // C. DISTRIBUTED + unassigned
      // -> Enviar a tarefa para resolução pelo Motor 2.0 (candidatos = participantes efetivos SOMENTE)
      const engineAssignment = candidateParticipants.length > 0 ? this.executeMotor2Distribution({
        taskMaster: tm,
        familyTask,
        participants: candidateParticipants,
        todayDate,
        existingAssignments: existingAssignments.filter(a => a.id !== existing.id),
        protectedTimes,
        skills,
        preferences,
        allTasks: allTasks || [tm]
      }) : null;

      const updated: TaskAssignment = {
        ...existing,
        chaos_session_id: session.id,
        chaosSessionId: session.id,
        chaos_strategy: 'DISTRIBUTED',
        chaosStrategy: 'DISTRIBUTED'
      };

      // Invariant: atribuir APENAS se o Motor retornou participante válido da sessão
      if (
        engineAssignment &&
        !engineAssignment.is_unassigned &&
        engineAssignment.member_id &&
        allowedMemberIds.has(engineAssignment.member_id)
      ) {
        updated.member_id = engineAssignment.member_id;
        (updated as any).assignedMemberId = engineAssignment.member_id;
        (updated as any).assignee_id = engineAssignment.member_id;
        (updated as any).assigneeId = engineAssignment.member_id;
        updated.is_unassigned = false;
        updated.unassigned_reason = undefined;
        updated.assigned_reason = `Distribuído via Modo Caos (Motor 2.0): ${engineAssignment.assigned_reason || ''}`;
        updated.factors = engineAssignment.factors;
        updated.score = engineAssignment.score;
        if (engineAssignment.scheduled_start) updated.scheduled_start = engineAssignment.scheduled_start;
        if (engineAssignment.scheduled_end) updated.scheduled_end = engineAssignment.scheduled_end;
      } else {
        // Fallback seguro: NUNCA voltar para o responsável antigo não participante!
        updated.member_id = '';
        (updated as any).assignedMemberId = '';
        (updated as any).assignee_id = '';
        (updated as any).assigneeId = '';
        updated.is_unassigned = true;
        updated.unassigned_reason = engineAssignment?.unassigned_reason || 'Nenhum participante elegível na força-tarefa do Modo Caos. Tarefa disponibilizada no Pool Aberto.';
        updated.factors = engineAssignment?.factors || {
          availability: 'Participantes selecionados indisponíveis ou no limite diário',
          autonomy: 'Nível de autonomia insuficiente entre os participantes selecionados'
        };
      }

      return {
        assignment: updated,
        isNew: false,
        reused: true,
        wasAlreadyCompleted: false
      };
    }

    // 2. Não existe ocorrência hoje -> Cria nova ocorrência canônica
    const newId = `${familyTask.id}_${todayDate}`;
    const newAssignment: TaskAssignment = {
      id: newId,
      family_id: familyId,
      family_task_id: familyTask.id,
      task_id: tm.id,
      member_id: '',
      room_id: familyTask.room_id || familyTask.roomId,
      scheduled_date: todayDate,
      scheduled_start: familyTask.preferred_time || '08:00',
      status: 'SCHEDULED',
      chaos_session_id: session.id,
      chaosSessionId: session.id,
      chaos_strategy: strategy,
      chaosStrategy: strategy,
      score: 0,
      rescheduled_count: 0
    };

    if (strategy === 'OPEN_POOL') {
      newAssignment.member_id = '';
      (newAssignment as any).assignedMemberId = '';
      (newAssignment as any).assignee_id = '';
      (newAssignment as any).assigneeId = '';
      newAssignment.is_unassigned = true;
      newAssignment.unassigned_reason = 'Disponível no Modo Caos (Pool Aberto)';
    } else {
      // DISTRIBUTED -> Motor 2.0 (contrato público canônico DistributionEngine.distributeDailyTasks)
      const engineAssignment = candidateParticipants.length > 0 ? this.executeMotor2Distribution({
        taskMaster: tm,
        familyTask,
        participants: candidateParticipants,
        todayDate,
        existingAssignments,
        protectedTimes,
        skills,
        preferences,
        allTasks: allTasks || [tm]
      }) : null;

      // CHF4-01, CHF4-02, CHF4-06: Validação estrita do resultado do Motor
      if (
        engineAssignment &&
        !engineAssignment.is_unassigned &&
        engineAssignment.member_id &&
        allowedMemberIds.has(engineAssignment.member_id)
      ) {
        newAssignment.member_id = engineAssignment.member_id;
        (newAssignment as any).assignedMemberId = engineAssignment.member_id;
        (newAssignment as any).assignee_id = engineAssignment.member_id;
        (newAssignment as any).assigneeId = engineAssignment.member_id;
        newAssignment.is_unassigned = false;
        newAssignment.assigned_reason = `Distribuído via Modo Caos (Motor 2.0): ${engineAssignment.assigned_reason || ''}`;
        newAssignment.factors = engineAssignment.factors;
        newAssignment.score = engineAssignment.score;
      } else {
        newAssignment.member_id = '';
        (newAssignment as any).assignedMemberId = '';
        (newAssignment as any).assignee_id = '';
        (newAssignment as any).assigneeId = '';
        newAssignment.is_unassigned = true;
        newAssignment.unassigned_reason = engineAssignment?.unassigned_reason || 'Nenhum participante elegível na força-tarefa do Modo Caos. Tarefa disponibilizada no Pool Aberto.';
        newAssignment.factors = engineAssignment?.factors || {
          availability: 'Participantes selecionados indisponíveis ou no limite diário',
          autonomy: 'Nível de autonomia insuficiente entre os participantes selecionados'
        };
      }
    }

    return {
      assignment: newAssignment,
      isNew: true,
      reused: false,
      wasAlreadyCompleted: false
    };
  }

  /**
   * CHAOS-1B: Resolve todas as ocorrências de uma ChaosSession.
   */
  public static resolveAllChaosSessionTasks(params: ResolveAllSessionTasksParams): ResolveAllSessionTasksResult {
    const {
      familyId,
      session,
      familyTasks,
      allTasks,
      existingAssignments,
      participants,
      todayDate,
      protectedTimes,
      skills,
      preferences
    } = params;

    const taskConfigs: ChaosSessionTaskConfig[] = session.tasks && session.tasks.length > 0
      ? session.tasks
      : (session.selectedTaskIds || []).map(ftId => ({
          familyTaskId: ftId,
          strategy: (session.taskStrategies && session.taskStrategies[ftId]) || 'DISTRIBUTED'
        }));

    // CHF4-01 / CHF4-02: Escopo estrito de participantes autorizados para a sessão
    const allowedParticipantIds = new Set<string>([
      ...(session.participantMemberIds || []),
      ...(session.lateParticipantMemberIds || [])
    ]);
    const scopedParticipants = (participants || []).filter(
      p => allowedParticipantIds.has(p.id) && p.active !== false
    );

    const assignments: TaskAssignment[] = [];
    const newAssignments: TaskAssignment[] = [];
    const reusedAssignments: TaskAssignment[] = [];
    const alreadyCompletedAssignments: TaskAssignment[] = [];

    const runningAssignments = [...existingAssignments];

    for (const config of taskConfigs) {
      const ft = familyTasks.find(t => t.id === config.familyTaskId);
      if (!ft) continue;

      const result = this.resolveTaskOccurrenceForChaos({
        familyId,
        session,
        taskConfig: config,
        familyTask: ft,
        todayDate,
        existingAssignments: runningAssignments,
        participants: scopedParticipants,
        allTasks,
        protectedTimes,
        skills,
        preferences
      });

      assignments.push(result.assignment);

      if (result.wasAlreadyCompleted) {
        alreadyCompletedAssignments.push(result.assignment);
      } else if (result.isNew) {
        newAssignments.push(result.assignment);
        runningAssignments.push(result.assignment);
      } else if (result.reused) {
        reusedAssignments.push(result.assignment);
        const idx = runningAssignments.findIndex(a => a.id === result.assignment.id);
        if (idx !== -1) {
          runningAssignments[idx] = result.assignment;
        } else {
          runningAssignments.push(result.assignment);
        }
      }
    }

    return {
      assignments,
      newAssignments,
      reusedAssignments,
      alreadyCompletedAssignments
    };
  }

  /**
   * CHAOS-1B: Autorização e Conclusão de Tarefa da Sessão do Modo Caos via PH-1.
   * Garante que:
   * - Sessão está ACTIVE.
   * - Se caller for MEMBER, deve ser participante da sessão.
   * - Passa obrigatoriamente por TaskCompletionService.authorizeCompletion.
   */
  public static canMemberCompleteChaosTask(params: {
    session: ChaosSession;
    task: TaskAssignment | Task;
    callerMember: Member;
  }): { allowed: boolean; reason?: string; completionType?: any; targetMemberId?: string; isSelfClaim?: boolean } {
    const { session, task, callerMember } = params;

    if (!callerMember || !callerMember.id) {
      return { allowed: false, reason: 'UNAUTHENTICATED: Morador não identificado.' };
    }

    if (session.status !== 'ACTIVE') {
      return { allowed: false, reason: 'SESSION_NOT_ACTIVE: A sessão do Modo Caos não está ativa.' };
    }

    const isAdmin = callerMember.role === 'ADMIN';
    const isParticipant = (session.participantMemberIds || []).includes(callerMember.id) ||
      (session.lateParticipantMemberIds || []).includes(callerMember.id);

    // Morador comum não participante não tem acesso operacional à sessão
    if (!isAdmin && !isParticipant) {
      return {
        allowed: false,
        reason: 'NOT_A_SESSION_PARTICIPANT: Morador não é participante da sessão ativa do Modo Caos.'
      };
    }

    // Gatekeeper estrito PH-1
    return TaskCompletionService.authorizeCompletion({ task, callerMember });
  }
}

/**
 * Avaliador determinístico de Firestore Rules para ChaosSession e ChaosState
 * Usado na suíte de testes de segurança.
 */
export function evaluateChaosSessionRule(params: {
  operation: 'read' | 'create' | 'update' | 'delete';
  callerFamilyId: string;
  targetFamilyId: string;
  callerRole: 'ADMIN' | 'MEMBER';
  callerMemberId: string;
  resourceData?: Partial<ChaosSession>;
  requestData?: Partial<ChaosSession>;
}): { allowed: boolean; reason?: string } {
  const {
    operation,
    callerFamilyId,
    targetFamilyId,
    callerRole,
    callerMemberId,
    resourceData,
    requestData
  } = params;

  // Tenant Isolation
  if (callerFamilyId !== targetFamilyId) {
    return { allowed: false, reason: 'TENANT_ISOLATION_VIOLATION' };
  }

  if (operation === 'delete') {
    return { allowed: false, reason: 'DELETE_FORBIDDEN' };
  }

  if (operation === 'read') {
    if (callerRole === 'ADMIN') {
      return { allowed: true };
    }
    if (callerRole === 'MEMBER') {
      if (resourceData?.status === 'ACTIVE' && resourceData?.participantMemberIds?.includes(callerMemberId)) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'MEMBER_READ_NOT_ACTIVE_OR_NOT_PARTICIPANT' };
    }
    return { allowed: false, reason: 'UNAUTHORIZED_ROLE' };
  }

  if (operation === 'create') {
    if (callerRole !== 'ADMIN') {
      return { allowed: false, reason: 'MEMBER_CANNOT_CREATE_SESSION' };
    }
    if (requestData?.status !== 'DRAFT') {
      return { allowed: false, reason: 'SESSION_MUST_BE_CREATED_AS_DRAFT' };
    }
    return { allowed: true };
  }

  if (operation === 'update') {
    if (callerRole !== 'ADMIN') {
      return { allowed: false, reason: 'MEMBER_CANNOT_UPDATE_SESSION' };
    }
    const currentStatus = resourceData?.status;
    const targetStatus = requestData?.status;

    // DRAFT -> ACTIVE
    if (currentStatus === 'DRAFT' && targetStatus === 'ACTIVE') {
      return { allowed: true };
    }
    // DRAFT -> CANCELLED
    if (currentStatus === 'DRAFT' && targetStatus === 'CANCELLED') {
      return { allowed: true };
    }
    // DRAFT -> DRAFT (config updates)
    if (currentStatus === 'DRAFT' && targetStatus === 'DRAFT') {
      return { allowed: true };
    }
    // ACTIVE -> COMPLETED
    if (currentStatus === 'ACTIVE' && targetStatus === 'COMPLETED') {
      return { allowed: true };
    }

    return { allowed: false, reason: 'INVALID_STATUS_TRANSITION' };
  }

  return { allowed: false, reason: 'UNKNOWN_OPERATION' };
}

export function evaluateChaosStateRule(params: {
  operation: 'read' | 'write';
  callerFamilyId: string;
  targetFamilyId: string;
  callerRole: 'ADMIN' | 'MEMBER';
}): { allowed: boolean; reason?: string } {
  const { operation, callerFamilyId, targetFamilyId, callerRole } = params;

  if (callerFamilyId !== targetFamilyId) {
    return { allowed: false, reason: 'TENANT_ISOLATION_VIOLATION' };
  }

  if (operation === 'read') {
    return { allowed: true };
  }

  if (operation === 'write') {
    if (callerRole === 'ADMIN') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'MEMBER_CANNOT_WRITE_CHAOS_STATE' };
  }

  return { allowed: false, reason: 'UNKNOWN_OPERATION' };
}
