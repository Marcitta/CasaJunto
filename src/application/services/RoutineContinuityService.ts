/**
 * CasaJunto - RoutineContinuityService (Application Layer)
 * 
 * Orquestra o ciclo de vida de rotinas recorrentes (Routine Continuity 1.0):
 * - Horizonte de Geração de 15 dias (Hoje + 14 dias).
 * - Horizonte de Distribuição Automática (Hoje + Amanhã apenas).
 * - Dias 3 a 15 permanecem inicialmente NÃO ATRIBUÍDOS.
 * - Idempotência e Create-If-Absent atômico (concorrência multi-dispositivo).
 * - Proteção de dados PH-1 e histórico de conclusões imutável.
 * - Edição de rotina, Desativação e Reativação sem backfill histórico.
 * - Fuso horário oficial da família (default America/Sao_Paulo).
 */

import {
  Family,
  FamilyTask,
  TaskAssignment,
  Member,
  ProtectedTime,
  Task
} from '../../types';
import { RoutineGenerator } from '../../domain/routine/RoutineGenerator';
import { getActiveMembers } from '../../domain/selectors';
import {
  getFamilyLocalDate,
  getRollingDateHorizon,
  addDaysToDate,
  addMinutesToTimeString,
  DEFAULT_TIMEZONE
} from '../../domain/utils/dateTimeUtils';
import { db } from '../../infrastructure/firebase/firebase';
import { FirestoreMappers } from '../../infrastructure/firebase/mappers';
import { doc, runTransaction, setDoc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { DistributionService } from './DistributionService';

export interface SyncRoutineOccurrencesParams {
  family: Family;
  routines: FamilyTask[];
  existingAssignments: TaskAssignment[];
  isDemoMode?: boolean;
  inMemoryStore?: Map<string, TaskAssignment>;
}

export interface SyncRoutineOccurrencesResult {
  newAssignments: TaskAssignment[];
  newlyCreatedAssignments: TaskAssignment[];
  allAssignments: TaskAssignment[];
}

export interface DistributeEligibleOccurrencesParams {
  family: Family;
  assignments: TaskAssignment[];
  members: Member[];
  protectedTimes: ProtectedTime[];
  targetDates?: string[];
  routines?: FamilyTask[];
  isDemoMode?: boolean;
}

export interface DistributeEligibleOccurrencesResult {
  updatedAssignments: TaskAssignment[];
  allAssignments: TaskAssignment[];
}

export interface SyncRollingRoutinesParams {
  family: Family;
  routines: FamilyTask[];
  existingAssignments: TaskAssignment[];
  members?: Member[];
  protectedTimes?: ProtectedTime[];
  isDemoMode?: boolean;
  inMemoryStore?: Map<string, TaskAssignment>;
}

export interface SyncRollingRoutinesResult {
  newAssignments: TaskAssignment[];
  updatedAssignments: TaskAssignment[];
  allAssignments: TaskAssignment[];
}

export class RoutineContinuityService {
  /**
   * Grava uma ocorrência de forma atômica no Firestore SOMENTE se ela não existir.
   * Garante concorrência à prova de corrida (ex: dois dispositivos abrindo simultaneamente).
   */
  public static async createOccurrenceIfAbsent(
    familyId: string,
    occurrence: TaskAssignment,
    isDemoMode: boolean = false,
    inMemoryStore?: Map<string, TaskAssignment>
  ): Promise<boolean> {
    if (isDemoMode || !db || !familyId) {
      if (inMemoryStore) {
        if (inMemoryStore.has(occurrence.id)) {
          return false; // Já existe, não sobrescreve
        }
        inMemoryStore.set(occurrence.id, occurrence);
        return true;
      }
      return true;
    }

    try {
      const occurrenceRef = doc(db, 'families', familyId, 'assignments', occurrence.id);
      let wasCreated = false;

      await runTransaction(db, async (txn) => {
        const snap = await txn.get(occurrenceRef);
        if (snap.exists()) {
          // Já existe no banco: REGRA CANÔNICA -> NUNCA SOBRESCREVER
          wasCreated = false;
        } else {
          txn.set(occurrenceRef, FirestoreMappers.fromTaskAssignment(occurrence));
          wasCreated = true;
        }
      });

      return wasCreated;
    } catch (err) {
      console.warn(`[RoutineContinuity] Erro ao criar ocorrência atomicamente (${occurrence.id}):`, err);
      return false;
    }
  }

  /**
   * PH-2/PH-3 RECONCILIAÇÃO CANÔNICA (HOTFIX-TASK-CREATE-1-R2D):
   * GENERATION HORIZON: Today + next 14 days = 15 dias.
   * 
   * GERAÇÃO/SINCRONIZAÇÃO PURA DE OCORRÊNCIAS:
   * - Gerar ocorrências faltantes (Create-if-absent)
   * - Preservar IDs determinísticos
   * - Respeitar horizonte de 15 dias
   * - Respeitar recurrence rules e timezone da família
   * - Não sobrescrever ocorrências existentes
   * - Não alterar responsáveis (member_id, is_unassigned, status)
   * - Cancelar ocorrências futuras pendentes de rotinas inativas (active = false)
   * - NUNCA invoca Motor 2.0 / DistributionService / DistributionEngine
   * 
   * REGRA DE PRODUTO: CRIAR TAREFA ≠ DISTRIBUIR ≠ EQUILIBRAR CARGA.
   */
  public static async syncRoutineOccurrences(
    params: SyncRoutineOccurrencesParams
  ): Promise<SyncRoutineOccurrencesResult> {
    const { family, routines, existingAssignments, isDemoMode = false, inMemoryStore } = params;
    const timezone = family.timezone || DEFAULT_TIMEZONE;
    const today = getFamilyLocalDate(timezone);
    const horizonDates = getRollingDateHorizon(today, 15);

    // Mapeamento em memória para consulta rápida com deduplicação canônica
    const assignmentMap = new Map<string, TaskAssignment>();
    const occurrenceKeyToId = new Map<string, string>();
    const tmDateKeyToId = new Map<string, string>();

    // Prioridade canônica para deduplicação determinística:
    // COMPLETED / DONE (4) > IN_PROGRESS (3) > Atribuído ativo (2) > Desatribuído / PENDING (1) > CANCELLED (0)
    const getAssignmentPriority = (a: TaskAssignment | undefined): number => {
      if (!a) return -1;
      if (a.status === 'COMPLETED' || a.status === 'DONE') return 4;
      if (a.status === 'IN_PROGRESS') return 3;
      if (!a.is_unassigned && a.member_id && a.status !== 'CANCELLED') return 2;
      if (a.status !== 'CANCELLED') return 1;
      return 0;
    };

    for (const asg of existingAssignments) {
      const ftId = asg.family_task_id || (asg as any).familyTaskId;
      const asgDate = asg.scheduled_date || (asg as any).scheduledDate || (asg as any).dueDate || '';
      const tmId = asg.task_id || (asg as any).taskMasterId;

      const canonicalKey = ftId && asgDate ? `${ftId}_${asgDate}` : null;
      // Fallback legado baseado em task_id: só aplicável quando NÃO houver family_task_id
      const tmDateKey = !ftId && tmId && asgDate ? `${tmId}_${asgDate}` : null;

      let existingId = canonicalKey ? occurrenceKeyToId.get(canonicalKey) : undefined;
      if (!existingId && tmDateKey) {
        existingId = tmDateKeyToId.get(tmDateKey);
      }

      if (existingId) {
        const existing = assignmentMap.get(existingId);
        const newPriority = getAssignmentPriority(asg);
        const existingPriority = getAssignmentPriority(existing);

        if (newPriority > existingPriority) {
          assignmentMap.delete(existingId);
          assignmentMap.set(asg.id, { ...asg });
          if (canonicalKey) occurrenceKeyToId.set(canonicalKey, asg.id);
          if (tmDateKey) tmDateKeyToId.set(tmDateKey, asg.id);
        }
        continue;
      }

      if (canonicalKey) occurrenceKeyToId.set(canonicalKey, asg.id);
      if (tmDateKey) tmDateKeyToId.set(tmDateKey, asg.id);
      assignmentMap.set(asg.id, { ...asg });
    }

    // REGRA DE OURO: Rotinas inativas (active === false) nunca devem vazar ocorrências pendentes para Hoje/Futuro
    const activeRoutinesList = routines.filter(r => r.active !== false);
    const activeRoutineIds = new Set(activeRoutinesList.map(r => r.id));
    const activeTaskMasterIds = new Set(
      activeRoutinesList.map(r => r.task_master_id || (r as any).taskMasterId || (r as any).task_id).filter(Boolean)
    );

    const inactiveRoutines = routines.filter(r => r.active === false);
    const inactiveRoutineIds = new Set(inactiveRoutines.map(r => r.id));
    const inactiveTaskMasterIds = new Set(
      inactiveRoutines
        .map(r => r.task_master_id || (r as any).taskMasterId || (r as any).task_id)
        .filter(tmId => Boolean(tmId) && !activeTaskMasterIds.has(tmId))
    );

    if (inactiveRoutineIds.size > 0 || inactiveTaskMasterIds.size > 0) {
      for (const [id, asg] of assignmentMap.entries()) {
        const ftId = asg.family_task_id || (asg as any).familyTaskId;
        const asgDate = asg.scheduled_date || (asg as any).scheduledDate || (asg as any).dueDate || '';
        const tmId = asg.task_id || (asg as any).taskMasterId;

        // Se a atribuição está explicitamente vinculada a uma rotina ativa, ela NÃO é inativa
        const isLinkedToActiveRoutine = ftId && activeRoutineIds.has(ftId);

        const isInactive = !isLinkedToActiveRoutine && (
          (ftId && inactiveRoutineIds.has(ftId)) ||
          Array.from(inactiveRoutineIds).some(rId => asg.id.startsWith(`${rId}_`)) ||
          (!ftId && tmId && inactiveTaskMasterIds.has(tmId))
        );

        if (isInactive && asgDate >= today) {
          // Histórico concluído ou em progresso nunca é cancelado
          if (asg.status === 'COMPLETED' || asg.status === 'DONE' || asg.status === 'IN_PROGRESS') {
            continue;
          }

          if (asg.status !== 'CANCELLED') {
            const cancelledAsg: TaskAssignment = {
              ...asg,
              status: 'CANCELLED'
            };
            assignmentMap.set(id, cancelledAsg);

            if (!isDemoMode && db && family.id) {
              const docRef = doc(db, 'families', family.id, 'assignments', asg.id);
              setDoc(docRef, FirestoreMappers.fromTaskAssignment(cancelledAsg), { merge: true }).catch(err =>
                console.warn('[syncRoutineOccurrences] Failed to persist CANCELLED for inactive routine:', err)
              );
            }
          }
        }
      }
    }

    const newlyCreated: TaskAssignment[] = [];
    const activeRoutines = routines.filter(r => r.active !== false);

    // RC-HF2: Cada FamilyTask ativa deve gerar suas ocorrências independentemente.
    // Deduplicação de rotinas na entrada exclusivamente por FamilyTask.id (evita a MESMA FamilyTask duplicada na lista).
    const canonicalActiveRoutines: FamilyTask[] = [];
    const seenRoutineIds = new Set<string>();
    for (const r of activeRoutines) {
      const rId = r.id || (r as any).routineId || (r as any).familyTaskId;
      if (rId) {
        if (seenRoutineIds.has(rId)) {
          continue;
        }
        seenRoutineIds.add(rId);
      }
      canonicalActiveRoutines.push(r);
    }

    // 1. RECONCILIAÇÃO CANÔNICA DE OCORRÊNCIAS (ROUTINE-CONTINUITY-HF3):
    // Para cada FamilyTask ativa no horizonte de 15 dias:
    // - EXPECTED DATE + no assignment -> CREATE SCHEDULED (Create-If-Absent)
    // - EXPECTED DATE + CANCELLED -> RESTORE SCHEDULED (is_unassigned: true, member_id: '')
    // - EXPECTED DATE + SCHEDULED -> KEEP
    // - EXPECTED DATE + COMPLETED/DONE/IN_PROGRESS/SELF_CLAIMED -> PRESERVE
    // - NON-EXPECTED DATE + pending assignment (>= today) -> CANCEL
    // - NON-EXPECTED DATE + histórico protegido -> PRESERVE
    for (const routine of canonicalActiveRoutines) {
      for (const dateStr of horizonDates) {
        const canonicalKey = `${routine.id}_${dateStr}`;
        const existingId = occurrenceKeyToId.get(canonicalKey) || (assignmentMap.has(canonicalKey) ? canonicalKey : undefined);
        let existingAsg = existingId ? assignmentMap.get(existingId) : undefined;
        if (!existingAsg) {
          existingAsg = Array.from(assignmentMap.values()).find(
            a => (a.family_task_id === routine.id || a.id.startsWith(`${routine.id}_`)) &&
                 (a.scheduled_date === dateStr || (a as any).scheduledDate === dateStr)
          );
        }

        const shouldOccur = RoutineGenerator.shouldOccurOnDate(routine, dateStr);

        if (shouldOccur) {
          // EXPECTED DATE + CANCELLED -> RESTORE SCHEDULED
          if (existingAsg && existingAsg.status === 'CANCELLED') {
            // Histórico com conclusões reais nunca deve ser sobrescrito
            if (!existingAsg.completed_at && !existingAsg.completed_by) {
              const startTime = routine.preferred_time || routine.preferredTime || existingAsg.scheduled_start || '09:00';
              const restoredAsg: TaskAssignment = {
                ...existingAsg,
                family_id: family.id,
                family_task_id: routine.id,
                task_id: routine.task_master_id || (routine as any).taskMasterId || routine.task_id || existingAsg.task_id,
                scheduled_date: dateStr,
                scheduled_start: startTime,
                scheduled_end: addMinutesToTimeString(startTime, routine.estimated_minutes || 20),
                status: 'SCHEDULED',
                is_unassigned: true,
                member_id: '',
                room_id: routine.room_id || routine.roomId || existingAsg.room_id,
                updatedAt: new Date().toISOString()
              };

              assignmentMap.set(existingAsg.id, restoredAsg);
              if (canonicalKey) occurrenceKeyToId.set(canonicalKey, existingAsg.id);
              newlyCreated.push(restoredAsg);

              if (!isDemoMode && db && family.id) {
                const docRef = doc(db, 'families', family.id, 'assignments', existingAsg.id);
                try {
                  await setDoc(docRef, FirestoreMappers.fromTaskAssignment(restoredAsg), { merge: true });
                } catch (err) {
                  console.warn('[syncRoutineOccurrences] Failed to persist RESTORED assignment:', err);
                }
              } else if (inMemoryStore) {
                inMemoryStore.set(existingAsg.id, restoredAsg);
              }
            }
          }
          // EXPECTED DATE + SCHEDULED -> KEEP (preserva atribuição e status)
          // EXPECTED DATE + COMPLETED/DONE/IN_PROGRESS -> PRESERVE
        } else {
          // NON-EXPECTED DATE: Se existe assignment pendente nesta data a partir de hoje, cancela
          if (existingAsg && dateStr >= today) {
            if (existingAsg.status === 'SCHEDULED' || existingAsg.status === 'PENDING') {
              const cancelledAsg: TaskAssignment = {
                ...existingAsg,
                status: 'CANCELLED',
                updatedAt: new Date().toISOString()
              };
              assignmentMap.set(existingAsg.id, cancelledAsg);

              if (!isDemoMode && db && family.id) {
                const docRef = doc(db, 'families', family.id, 'assignments', existingAsg.id);
                try {
                  await setDoc(docRef, FirestoreMappers.fromTaskAssignment(cancelledAsg), { merge: true });
                } catch (err) {
                  console.warn('[syncRoutineOccurrences] Failed to persist CANCELLED for non-expected date:', err);
                }
              } else if (inMemoryStore) {
                inMemoryStore.set(existingAsg.id, cancelledAsg);
              }
            }
            // NON-EXPECTED DATE + histórico protegido (COMPLETED, etc) -> PRESERVE
          }
        }
      }
    }

    // 2. GERAÇÃO: 15 DIAS INCLUSIVOS (Create-If-Absent) — SEM DISTRIBUIÇÃO
    for (const routine of canonicalActiveRoutines) {
      const missing = RoutineGenerator.generateMissingOccurrences({
        routine,
        familyId: family.id,
        horizonDates,
        existingOccurrences: Array.from(assignmentMap.values())
      });

      for (const occ of missing) {
        if (!assignmentMap.has(occ.id)) {
          if (!isDemoMode && db && family.id) {
            const created = await this.createOccurrenceIfAbsent(family.id, occ, false, inMemoryStore);
            if (created) {
              assignmentMap.set(occ.id, occ);
              newlyCreated.push(occ);
            } else {
              // Se já existia atomicamente no Firestore durante corrida, mantém no mapa
              assignmentMap.set(occ.id, occ);
            }
          } else {
            if (inMemoryStore) {
              inMemoryStore.set(occ.id, occ);
            }
            assignmentMap.set(occ.id, occ);
            newlyCreated.push(occ);
          }
        }
      }
    }

    return {
      newAssignments: newlyCreated,
      newlyCreatedAssignments: newlyCreated,
      allAssignments: Array.from(assignmentMap.values())
    };
  }

  /**
   * DISTRIBUTION SCOPE (HOTFIX-TASK-CREATE-1-R2D):
   * Operação EXPLICITAMENTE SEPARADA de distribuição.
   * - Escopo temporal elegível: Today + Tomorrow (dias 3 a 15 permanecem desatribuídos).
   * - Distribui apenas ocorrências pendentes e desatribuídas através do Motor 2.0 (DistributionService.executeRebalance).
   * - NUNCA é chamada implicitamente por syncRoutineOccurrences ou addTask.
   */
  public static async distributeEligibleOccurrences(
    params: DistributeEligibleOccurrencesParams
  ): Promise<DistributeEligibleOccurrencesResult> {
    const { family, assignments, members, protectedTimes, targetDates, isDemoMode = false } = params;
    const timezone = family.timezone || DEFAULT_TIMEZONE;
    const today = getFamilyLocalDate(timezone);
    const tomorrow = addDaysToDate(today, 1);
    const autoDistributionDates = targetDates || [today, tomorrow];

    const assignmentMap = new Map<string, TaskAssignment>();
    for (const asg of assignments) {
      assignmentMap.set(asg.id, { ...asg });
    }

    const updatedAssignments: TaskAssignment[] = [];
    const activeMembers = getActiveMembers(members);
    const routineMap = new Map<string, FamilyTask>();
    if (params.routines) {
      for (const r of params.routines) {
        routineMap.set(r.id, r);
      }
    }

    if (activeMembers.length > 0) {
      for (const dateTarget of autoDistributionDates) {
        const unassignedForDate: TaskAssignment[] = [];
        for (const asg of assignmentMap.values()) {
          const r = asg.family_task_id ? routineMap.get(asg.family_task_id) : undefined;
          const execTarget = r?.executionTarget || (asg as any).executionTarget || (asg as any).execution_target || 'HOUSEHOLD';
          // Regra de produto (ExecutionTarget):
          // EXTERNAL_SUPPORT não entra no pool do Motor 2.0 e não é atribuída a MEMBER.
          // HOUSEHOLD e FLEXIBLE entram no pool do Motor 2.0.
          if (execTarget === 'EXTERNAL_SUPPORT') {
            continue;
          }

          if (
            asg.scheduled_date === dateTarget &&
            (asg.status === 'SCHEDULED' || asg.status === 'PENDING') &&
            (asg.is_unassigned || !asg.member_id)
          ) {
            unassignedForDate.push(asg);
          }
        }

        if (unassignedForDate.length === 0) continue;

        const tasksToDistribute: Task[] = unassignedForDate.map(asg => {
          const r = asg.family_task_id ? routineMap.get(asg.family_task_id) : undefined;
          return {
            id: asg.id,
            familyId: family.id,
            familyTaskId: asg.family_task_id,
            title: asg.task_id,
            description: '',
            taskMasterId: asg.task_id,
            assignedMemberId: '',
            assigneeId: '',
            status: 'PENDING',
            dueDate: asg.scheduled_date,
            scheduledStart: asg.scheduled_start,
            scheduledEnd: asg.scheduled_end,
            roomId: asg.room_id || 'geral',
            roomName: asg.room_id || 'geral',
            category: 'cleaning',
            durationMinutes: 20,
            effort: 10,
            frequency: 'DAILY',
            isUnassigned: true,
            executionTarget: r?.executionTarget || (asg as any).executionTarget || 'HOUSEHOLD',
            domesticSupportId: r?.domesticSupportId || (asg as any).domesticSupportId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
        });

        try {
          const { result, taskUpdates } = DistributionService.executeRebalance({
            family,
            members: activeMembers,
            tasks: tasksToDistribute,
            protectedTimes,
            targetDate: dateTarget
          });

          // Aplica atualizações nas ocorrências correspondentes
          for (const [taskId, update] of Object.entries(taskUpdates)) {
            const original = assignmentMap.get(taskId);
            if (original && original.status === 'SCHEDULED') {
              const updated: TaskAssignment = {
                ...original,
                member_id: update.assignedMemberId || original.member_id,
                is_unassigned: update.isUnassigned !== undefined ? update.isUnassigned : original.is_unassigned,
                assigned_reason: update.assignedReason || original.assigned_reason,
                unassigned_reason: update.unassignedReason || original.unassigned_reason,
                factors: update.factors || original.factors,
                scheduled_start: update.scheduledStart || original.scheduled_start,
                scheduled_end: update.scheduledEnd || original.scheduled_end
              };

              assignmentMap.set(taskId, updated);
              updatedAssignments.push(updated);

              // Persiste no Firestore se estiver em modo real
              if (!isDemoMode && db && family.id) {
                const docRef = doc(db, 'families', family.id, 'assignments', taskId);
                await setDoc(docRef, FirestoreMappers.fromTaskAssignment(updated), { merge: true });
              }
            }
          }
        } catch (distErr) {
          console.warn(`[RoutineContinuity] Erro ao executar distribuição para ${dateTarget}:`, distErr);
        }
      }
    }

    return {
      updatedAssignments,
      allAssignments: Array.from(assignmentMap.values())
    };
  }

  /**
   * Sincroniza o horizonte deslizante de 15 dias para todas as rotinas ativas da família.
   * COMPATIBILIDADE LEGADA:
   * 1. Executa geração pura de ocorrências via syncRoutineOccurrences (Create-if-absent, 15 dias).
   * 2. Se membros fornecidos, executa distribuição explícita via distributeEligibleOccurrences (Hoje + Amanhã).
   */
  public static async syncRollingRoutines(
    params: SyncRollingRoutinesParams
  ): Promise<SyncRollingRoutinesResult> {
    const genResult = await this.syncRoutineOccurrences({
      family: params.family,
      routines: params.routines,
      existingAssignments: params.existingAssignments,
      isDemoMode: params.isDemoMode,
      inMemoryStore: params.inMemoryStore
    });

    let updatedAssignments: TaskAssignment[] = [];
    let allAssignments = genResult.allAssignments;

    if (params.members && params.members.length > 0) {
      const distResult = await this.distributeEligibleOccurrences({
        family: params.family,
        assignments: genResult.allAssignments,
        members: params.members,
        protectedTimes: params.protectedTimes || [],
        routines: params.routines,
        isDemoMode: params.isDemoMode
      });
      updatedAssignments = distResult.updatedAssignments;
      allAssignments = distResult.allAssignments;
    }

    return {
      newAssignments: genResult.newAssignments,
      updatedAssignments,
      allAssignments
    };
  }

  /**
   * Criação pontual de uma rotina (FamilyTask) e geração imediata de suas ocorrências no horizonte de 15 dias.
   * - Gera ocorrências faltantes via RoutineGenerator.generateMissingOccurrences.
   * - Persiste atômica e idempotentemente no Firestore.
   * - member_id = '', is_unassigned = true, status = 'SCHEDULED' (GERAR ≠ DISTRIBUIR).
   */
  public static async createRoutine(params: {
    familyId: string;
    routine: FamilyTask;
    existingAssignments: TaskAssignment[];
    isDemoMode?: boolean;
    timezone?: string;
  }): Promise<{
    createdRoutine: FamilyTask;
    newAssignments: TaskAssignment[];
    allAssignments: TaskAssignment[];
  }> {
    const {
      familyId,
      routine,
      existingAssignments,
      isDemoMode = false,
      timezone = DEFAULT_TIMEZONE
    } = params;

    const today = getFamilyLocalDate(timezone);
    const horizonDates = getRollingDateHorizon(today, 15);
    const assignmentMap = new Map<string, TaskAssignment>();

    for (const asg of existingAssignments) {
      assignmentMap.set(asg.id, { ...asg });
    }

    const missing = RoutineGenerator.generateMissingOccurrences({
      routine,
      familyId,
      horizonDates,
      existingOccurrences: Array.from(assignmentMap.values()).filter(a => a.status !== 'CANCELLED'),
      durationMinutes: routine.estimated_minutes || 20
    });

    const newAssignments: TaskAssignment[] = [];
    for (const occ of missing) {
      if (!assignmentMap.has(occ.id)) {
        assignmentMap.set(occ.id, occ);
        newAssignments.push(occ);
      }
    }

    if (!isDemoMode && db && familyId) {
      const routineRef = doc(db, 'families', familyId, 'familyTasks', routine.id);
      await setDoc(routineRef, FirestoreMappers.fromFamilyTask(routine));

      for (const occ of newAssignments) {
        await this.createOccurrenceIfAbsent(familyId, occ, false);
      }
    }

    return {
      createdRoutine: routine,
      newAssignments,
      allAssignments: Array.from(assignmentMap.values())
    };
  }

  /**
   * Atualização de uma rotina existente (FamilyTask) (ROUTINE-CONTINUITY-HF1).
   * - Atualiza a definição da rotina.
   * - Cancela ocorrências que deixaram de ser válidas sob o novo cronograma.
   * - Restaura ocorrências canceladas que voltaram a ser válidas.
   * - Atualiza ocorrências PENDENTES/SCHEDULED válidas com novos horários e cômodo.
   * - NUNCA altera ocorrências COMPLETED, DONE ou IN_PROGRESS.
   * - Calcula e gera atômica e idempotentemente novas ocorrências faltantes no horizonte de 15 dias.
   * - Nascem com member_id = '', is_unassigned = true, status = 'SCHEDULED' (GERAR ≠ DISTRIBUIR).
   */
  public static async updateRoutine(params: {
    familyId: string;
    routineId: string;
    updates: Partial<FamilyTask>;
    existingRoutines: FamilyTask[];
    existingAssignments: TaskAssignment[];
    isDemoMode?: boolean;
    timezone?: string;
  }): Promise<{
    updatedRoutine: FamilyTask;
    affectedAssignments: TaskAssignment[];
    newAssignments: TaskAssignment[];
    allAssignments: TaskAssignment[];
  }> {
    const {
      familyId,
      routineId,
      updates,
      existingRoutines,
      existingAssignments,
      isDemoMode = false,
      timezone = DEFAULT_TIMEZONE
    } = params;

    const routine = existingRoutines.find(r => r.id === routineId);
    if (!routine) {
      throw new Error(`Rotina com ID ${routineId} não encontrada.`);
    }

    const updatedRoutine: FamilyTask = {
      ...routine,
      ...updates,
      id: routineId,
      family_id: familyId,
      updated_at: new Date().toISOString()
    };

    const today = getFamilyLocalDate(timezone);
    const horizonDates = getRollingDateHorizon(today, 15);
    const affectedAssignments: TaskAssignment[] = [];
    const assignmentMap = new Map<string, TaskAssignment>();

    for (const asg of existingAssignments) {
      assignmentMap.set(asg.id, { ...asg });
    }

    const targetTmId = updatedRoutine.task_master_id || (updatedRoutine as any).taskMasterId || (updatedRoutine as any).task_id;

    for (const asg of existingAssignments) {
      const asgFtId = asg.family_task_id || (asg as any).familyTaskId;
      const asgDate = asg.scheduled_date || (asg as any).scheduledDate || (asg as any).dueDate || '';
      const asgTmId = asg.task_id || (asg as any).taskMasterId;

      const isMatch = asgFtId === routineId || asg.id.startsWith(`${routineId}_`) || (!asgFtId && targetTmId && asgTmId === targetTmId);

      // Afeta apenas ocorrências desta rotina a partir de hoje
      if (isMatch && asgDate >= today) {
        // NUNCA mutar ocorrências COMPLETED, DONE ou IN_PROGRESS (preservar histórico e conclusões)
        if (asg.status === 'COMPLETED' || asg.status === 'DONE' || asg.status === 'IN_PROGRESS') {
          continue;
        }

        if (asg.status === 'SCHEDULED' || asg.status === 'PENDING') {
          // Se a data não é mais válida sob a nova definição, cancela
          const isValidDate = RoutineGenerator.shouldOccurOnDate(updatedRoutine, asgDate);
          if (!isValidDate) {
            const cancelled: TaskAssignment = {
              ...asg,
              status: 'CANCELLED'
            };
            assignmentMap.set(asg.id, cancelled);
            affectedAssignments.push(cancelled);
          } else {
            // Atualiza horários e cômodo
            const updated: TaskAssignment = {
              ...asg,
              room_id: updatedRoutine.room_id || updatedRoutine.roomId || asg.room_id,
              scheduled_start: updatedRoutine.preferred_time || updatedRoutine.preferredTime || asg.scheduled_start,
              scheduled_end: addMinutesToTimeString(
                updatedRoutine.preferred_time || updatedRoutine.preferredTime || asg.scheduled_start || '09:00',
                updatedRoutine.estimated_minutes || 20
              )
            };
            assignmentMap.set(asg.id, updated);
            affectedAssignments.push(updated);
          }
        } else if (asg.status === 'CANCELLED') {
          // Se estava cancelada mas voltou a ser válida sob a nova definição, restaura para SCHEDULED
          const isValidDate = RoutineGenerator.shouldOccurOnDate(updatedRoutine, asgDate);
          if (isValidDate) {
            const restored: TaskAssignment = {
              ...asg,
              family_task_id: routineId,
              task_id: updatedRoutine.task_master_id || updatedRoutine.taskMasterId || updatedRoutine.id,
              scheduled_date: asgDate,
              status: 'SCHEDULED',
              is_unassigned: true,
              member_id: '',
              room_id: updatedRoutine.room_id || updatedRoutine.roomId || asg.room_id,
              scheduled_start: updatedRoutine.preferred_time || updatedRoutine.preferredTime || asg.scheduled_start,
              scheduled_end: addMinutesToTimeString(
                updatedRoutine.preferred_time || updatedRoutine.preferredTime || asg.scheduled_start || '09:00',
                updatedRoutine.estimated_minutes || 20
              )
            };
            assignmentMap.set(asg.id, restored);
            affectedAssignments.push(restored);
          }
        }
      }
    }

    // Calcula ocorrências faltantes no horizonte de 15 dias a partir de hoje
    const nonCancelled = Array.from(assignmentMap.values()).filter(a => a.status !== 'CANCELLED');
    const missing = RoutineGenerator.generateMissingOccurrences({
      routine: updatedRoutine,
      familyId,
      horizonDates,
      existingOccurrences: nonCancelled,
      durationMinutes: updatedRoutine.estimated_minutes || 20
    });

    const newAssignments: TaskAssignment[] = [];
    for (const occ of missing) {
      if (!assignmentMap.has(occ.id)) {
        assignmentMap.set(occ.id, occ);
        newAssignments.push(occ);
      }
    }

    // Persistência em Firestore
    if (!isDemoMode && db && familyId) {
      const routineRef = doc(db, 'families', familyId, 'familyTasks', routineId);
      await setDoc(routineRef, FirestoreMappers.fromFamilyTask(updatedRoutine), { merge: true });

      if (affectedAssignments.length > 0) {
        const batch = writeBatch(db);
        for (const asg of affectedAssignments) {
          const asgRef = doc(db, 'families', familyId, 'assignments', asg.id);
          batch.set(asgRef, FirestoreMappers.fromTaskAssignment(asg), { merge: true });
        }
        await batch.commit();
      }

      for (const occ of newAssignments) {
        await this.createOccurrenceIfAbsent(familyId, occ, false);
      }
    }

    return {
      updatedRoutine,
      affectedAssignments,
      newAssignments,
      allAssignments: Array.from(assignmentMap.values())
    };
  }

  /**
   * Desativação de rotina (active = false).
   * - Marca active = false na FamilyTask (mantém mesmo ID).
   * - Cancela ocorrências pendentes (SCHEDULED) de hoje em diante (status = CANCELLED).
   * - PRESERVA histórico de COMPLETED e IN_PROGRESS intactos.
   * - NUNCA deleta fisicamente os registros.
   */
  public static async deactivateRoutine(params: {
    familyId: string;
    routineId: string;
    existingRoutines: FamilyTask[];
    existingAssignments: TaskAssignment[];
    isDemoMode?: boolean;
    timezone?: string;
  }): Promise<{
    deactivatedRoutine: FamilyTask;
    cancelledAssignments: TaskAssignment[];
  }> {
    const {
      familyId,
      routineId,
      existingRoutines,
      existingAssignments,
      isDemoMode = false,
      timezone = DEFAULT_TIMEZONE
    } = params;

    const routine = existingRoutines.find(r => r.id === routineId);
    if (!routine) {
      throw new Error(`Rotina com ID ${routineId} não encontrada.`);
    }

    const deactivatedRoutine: FamilyTask = {
      ...routine,
      active: false,
      updated_at: new Date().toISOString()
    };

    const targetTmId = routine.task_master_id || (routine as any).taskMasterId || (routine as any).task_id;
    const today = getFamilyLocalDate(timezone);
    const cancelledAssignments: TaskAssignment[] = [];

    for (const asg of existingAssignments) {
      const asgFtId = asg.family_task_id || (asg as any).familyTaskId;
      const asgDate = asg.scheduled_date || (asg as any).scheduledDate || (asg as any).dueDate;
      const asgTmId = asg.task_id || (asg as any).taskMasterId;

      const matches = 
        asgFtId === routineId || 
        asg.id.startsWith(`${routineId}_`) ||
        (!asgFtId && targetTmId && asgTmId === targetTmId);

      if (matches && asgDate && asgDate >= today) {
        // COMPLETED e IN_PROGRESS são estritamente preservados
        if (asg.status === 'COMPLETED' || asg.status === 'DONE' || asg.status === 'IN_PROGRESS') {
          continue;
        }

        cancelledAssignments.push({
          ...asg,
          family_task_id: routineId,
          scheduled_date: asgDate,
          status: 'CANCELLED'
        });
      }
    }

    // Persistência
    if (!isDemoMode && db && familyId) {
      const routineRef = doc(db, 'families', familyId, 'familyTasks', routineId);
      await setDoc(routineRef, FirestoreMappers.fromFamilyTask(deactivatedRoutine), { merge: true });

      try {
        const asgColRef = collection(db, 'families', familyId, 'assignments');
        const snap = await getDocs(asgColRef);
        snap.forEach(d => {
          const data = d.data();
          const docFtId = data.family_task_id || data.familyTaskId;
          const docDate = data.scheduled_date || data.scheduledDate || data.dueDate;
          const docTmId = data.task_id || data.taskMasterId;
          const docStatus = data.status;

          const matches = docFtId === routineId || d.id.startsWith(`${routineId}_`) || (targetTmId && docTmId === targetTmId);
          if (matches && docDate && docDate >= today) {
            if (docStatus !== 'COMPLETED' && docStatus !== 'DONE' && docStatus !== 'IN_PROGRESS' && docStatus !== 'CANCELLED') {
              const asgObj = FirestoreMappers.toTaskAssignment(d.id, data);
              asgObj.status = 'CANCELLED';
              asgObj.family_task_id = routineId;
              if (!cancelledAssignments.some(a => a.id === d.id)) {
                cancelledAssignments.push(asgObj);
              }
            }
          }
        });
      } catch (err) {
        console.warn('[deactivateRoutine] Error querying firestore assignments:', err);
      }

      if (cancelledAssignments.length > 0) {
        const batch = writeBatch(db);
        for (const asg of cancelledAssignments) {
          const asgRef = doc(db, 'families', familyId, 'assignments', asg.id);
          batch.set(asgRef, FirestoreMappers.fromTaskAssignment(asg), { merge: true });
        }
        await batch.commit();
      }
    }

    return { deactivatedRoutine, cancelledAssignments };
  }

  /**
   * Reativação de rotina (active = true).
   * - Reutiliza o MESMO FamilyTask ID.
   * - SEM backfill histórico.
   * - Retoma a partir de HOJE.
   * - Restaura ocorrências CANCELLED válidas de hoje em diante para SCHEDULED.
   * - Gera novas ocorrências faltantes para completar o horizonte de 15 dias.
   */
  public static async reactivateRoutine(params: {
    familyId: string;
    routineId: string;
    existingRoutines: FamilyTask[];
    existingAssignments: TaskAssignment[];
    isDemoMode?: boolean;
    timezone?: string;
  }): Promise<{
    reactivatedRoutine: FamilyTask;
    restoredAssignments: TaskAssignment[];
    newAssignments: TaskAssignment[];
    allAssignments: TaskAssignment[];
  }> {
    const {
      familyId,
      routineId,
      existingRoutines,
      existingAssignments,
      isDemoMode = false,
      timezone = DEFAULT_TIMEZONE
    } = params;

    const routine = existingRoutines.find(r => r.id === routineId);
    if (!routine) {
      throw new Error(`Rotina com ID ${routineId} não encontrada.`);
    }

    const reactivatedRoutine: FamilyTask = {
      ...routine,
      active: true,
      updated_at: new Date().toISOString()
    };

    const targetTmId = routine.task_master_id || (routine as any).taskMasterId || (routine as any).task_id;
    const today = getFamilyLocalDate(timezone);
    const horizonDates = getRollingDateHorizon(today, 15);
    const restoredAssignments: TaskAssignment[] = [];
    const assignmentMap = new Map<string, TaskAssignment>();

    for (const asg of existingAssignments) {
      assignmentMap.set(asg.id, { ...asg });
    }

    // 1. Restaura ocorrências CANCELLED de hoje em diante que sejam válidas no cronograma atual
    for (const asg of existingAssignments) {
      const asgFtId = asg.family_task_id || (asg as any).familyTaskId;
      const asgDate = asg.scheduled_date || (asg as any).scheduledDate || (asg as any).dueDate;
      const asgTmId = asg.task_id || (asg as any).taskMasterId;

      const matches = 
        asgFtId === routineId || 
        asg.id.startsWith(`${routineId}_`) ||
        (!asgFtId && targetTmId && asgTmId === targetTmId);

      if (matches && asgDate && asgDate >= today && asg.status === 'CANCELLED') {
        if (RoutineGenerator.shouldOccurOnDate(reactivatedRoutine, asgDate)) {
          const restored: TaskAssignment = {
            ...asg,
            family_task_id: routineId,
            scheduled_date: asgDate,
            status: 'SCHEDULED'
          };
          assignmentMap.set(asg.id, restored);
          restoredAssignments.push(restored);
        }
      }
    }

    // 2. Gera ocorrências faltantes no horizonte de 15 dias a partir de hoje
    const missing = RoutineGenerator.generateMissingOccurrences({
      routine: reactivatedRoutine,
      familyId,
      horizonDates,
      existingOccurrences: Array.from(assignmentMap.values()).filter(a => a.status !== 'CANCELLED')
    });

    const newAssignments: TaskAssignment[] = [];
    for (const occ of missing) {
      assignmentMap.set(occ.id, occ);
      newAssignments.push(occ);
    }

    // Persistência
    if (!isDemoMode && db && familyId) {
      const routineRef = doc(db, 'families', familyId, 'familyTasks', routineId);
      await setDoc(routineRef, FirestoreMappers.fromFamilyTask(reactivatedRoutine), { merge: true });

      const batch = writeBatch(db);
      for (const asg of restoredAssignments) {
        const asgRef = doc(db, 'families', familyId, 'assignments', asg.id);
        batch.set(asgRef, FirestoreMappers.fromTaskAssignment(asg), { merge: true });
      }
      for (const occ of newAssignments) {
        const asgRef = doc(db, 'families', familyId, 'assignments', occ.id);
        batch.set(asgRef, FirestoreMappers.fromTaskAssignment(occ));
      }
      await batch.commit();
    }

    return { reactivatedRoutine, restoredAssignments, newAssignments, allAssignments: Array.from(assignmentMap.values()) };
  }
}
