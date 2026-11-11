/**
 * CasaJunto — B.5.5-HF1-D-B1: RoutineTransactionalService
 * Serviço transacional isolado para gestão atômica de rotinas multiambiente,
 * reserva canônica de identidade, ledger de operações e reconciliação de ocorrências.
 * 
 * Totalmente isolado dos fluxos de produção existentes (não conectado ao AppContext ou UI).
 * Utiliza interfaces de store injetáveis para testes puros e simulação sem Firestore real.
 */

import {
  FamilyTask,
  TaskAssignment,
  BatchAddRoutineInput,
  GranularBatchAddResult,
  BatchRoutineItemResult
} from '../../types';
import {
  RoutineIndexDoc,
  RoutineIndexConflictDoc,
  OperationLedgerDoc,
  OperationLedgerItem,
  ITransactionalStore,
  ITransactionContext
} from '../../domain/routine/transactionalTypes';
import {
  buildRoutineIndexKey,
  aggregateGranularBatchResults,
  detectDuplicatePayloadCombinations,
  sanitizeKeyComponent
} from '../../domain/routine/multiRoomBatchContracts';
import { RoutineFeatureFlags } from '../../domain/routine/routineFeatureFlags';
import { RoutineGenerator } from '../../domain/routine/RoutineGenerator';
import { RoutineContinuityService } from './RoutineContinuityService';
import {
  getFamilyLocalDate,
  getRollingDateHorizon,
  addMinutesToTimeString
} from '../../domain/utils/dateTimeUtils';

export class RoutineTransactionalService {
  /**
   * Executa a criação ou reativação transacional de um lote de rotinas multiambiente
   * garantindo reserva canônica, ledger idempotente e reconciliação atômica.
   */
  public static async executeBatchRoutines(params: {
    familyId: string;
    items: BatchAddRoutineInput[];
    operationId: string;
    clientSessionId?: string;
    store: ITransactionalStore;
    today?: string;
    timezone?: string;
  }): Promise<GranularBatchAddResult> {
    const {
      familyId,
      items,
      operationId,
      clientSessionId,
      store,
      today = getFamilyLocalDate(params.timezone),
      timezone = 'America/Sao_Paulo'
    } = params;

    const horizonDates = getRollingDateHorizon(today, 15);
    const nowIso = new Date().toISOString();

    // AUD-B2C-03 & AUD-B2C-HF2: Trava de suspensão segura
    if (RoutineFeatureFlags.isNewWritesSuspended(familyId)) {
      throw new Error(`[RoutineTransactionalService] Operações de rotinas estão temporariamente suspensas para a família ${familyId}.`);
    }

    if ('ensureContext' in store && typeof (store as any).ensureContext === 'function') {
      await (store as any).ensureContext(familyId);
    }

    // 1. Verificação prévia de duplicatas internas no mesmo payload
    const dupCheck = detectDuplicatePayloadCombinations(items);
    if (dupCheck.hasDuplicates) {
      const failedItems: BatchRoutineItemResult[] = items.map(it => {
        const isDup = dupCheck.duplicates.some(
          d => d.taskMasterId === it.taskMasterId && d.roomId === (it.roomId || 'geral')
        );
        return {
          taskMasterId: it.taskMasterId,
          roomId: it.roomId || 'geral',
          status: isDup ? 'FAILED' : 'FAILED',
          error: isDup ? 'Combinação tarefa + ambiente duplicada no mesmo lote' : 'Lote rejeitado por duplicidade interna',
          retryable: false
        };
      });
      return aggregateGranularBatchResults(failedItems, operationId);
    }

    // 2. FASE PRE-READ: CONSULTAS LEGADAS FORA DA TRANSAÇÃO (compatibilidade com SDK Web)
    const preReadLegacyMap = new Map<string, FamilyTask[]>();
    for (const input of items) {
      const roomId = input.roomId || 'geral';
      const indexKey = buildRoutineIndexKey(input.taskMasterId, roomId);
      if (store.preReadLegacyRoutines) {
        const legacy = await store.preReadLegacyRoutines(familyId, input.taskMasterId, roomId);
        preReadLegacyMap.set(indexKey, legacy);
      }
    }

    // 3. FASE 1: TRANSAÇÃO DE ROTINAS E RESERVA CANÔNICA (com ledger por item)
    let phase1Results: BatchRoutineItemResult[] = [];
    let routinesToSync: Array<{ routine: FamilyTask; itemIndex: number }> = [];

    try {
      const txnOutput = await store.runTransaction(async (txn: ITransactionContext) => {
        // --- ALL READS FIRST ---
        // A. Ler o ledger da operação (Idempotência contra reenvio da mesma tentativa lógica)
        const existingLedger = await txn.getOperationLedger(familyId, operationId);
        if (existingLedger && existingLedger.status === 'COMMITTED') {
          // Operação já comitada anteriormente: retorna os itens gravados no ledger sem novas escritas
          return {
            itemResults: Object.values(existingLedger.items).map(i => ({
              taskMasterId: i.taskMasterId,
              roomId: i.roomId,
              status: i.status,
              routineId: i.canonicalRoutineId,
              retryable: i.status === 'FAILED' || i.status === 'UNKNOWN_COMMIT'
            })),
            routinesToSync: []
          };
        }

        // B. Para cada item, ler índice, conflito e rotinas
        interface ItemReadContext {
          input: BatchAddRoutineInput;
          indexKey: string;
          indexDoc: RoutineIndexDoc | null;
          conflictDoc: RoutineIndexConflictDoc | null;
          boundRoutine: FamilyTask | null;
          legacyRoutines: FamilyTask[];
        }

        const readContexts: ItemReadContext[] = [];

        for (const input of items) {
          const roomId = input.roomId || 'geral';
          const indexKey = buildRoutineIndexKey(input.taskMasterId, roomId);

          const indexDoc = await txn.getRoutineIndex(familyId, indexKey);
          const conflictDoc = await txn.getRoutineIndexConflict(familyId, indexKey);

          let boundRoutine: FamilyTask | null = null;
          const legacyRoutines: FamilyTask[] = [];

          if (indexDoc && indexDoc.canonicalRoutineId) {
            boundRoutine = await txn.getFamilyTask(familyId, indexDoc.canonicalRoutineId);
          } else {
            // Busca candidatos pré-lidos e executa leitura pontual transacional de cada um para travar OCC
            const candidates = preReadLegacyMap.get(indexKey) || [];
            for (const cand of candidates) {
              const verified = await txn.getFamilyTask(familyId, cand.id);
              if (verified) {
                legacyRoutines.push(verified);
              }
            }
            // Fallback se não passou por preReadLegacyRoutines
            if (candidates.length === 0 && txn.queryFamilyTasksByTaskAndRoom) {
              const qRoutines = await txn.queryFamilyTasksByTaskAndRoom(familyId, input.taskMasterId, roomId);
              for (const qr of qRoutines) {
                legacyRoutines.push(qr);
              }
            }
          }

          readContexts.push({
            input,
            indexKey,
            indexDoc,
            conflictDoc,
            boundRoutine,
            legacyRoutines
          });
        }

        // --- ALL WRITES SECOND ---
        const localRoutinesToSync: Array<{ routine: FamilyTask; itemIndex: number }> = [];
        const itemResults: BatchRoutineItemResult[] = [];
        const ledgerItems: Record<string, OperationLedgerItem> = {};

        for (let i = 0; i < readContexts.length; i++) {
          const ctx = readContexts[i];
          const { input, indexKey, indexDoc, conflictDoc, boundRoutine, legacyRoutines } = ctx;
          const roomId = input.roomId || 'geral';

          // CASO 1: Conflito prévio existente aguardando resolução de admin
          if (conflictDoc && conflictDoc.status === 'PENDING_ADMIN_RESOLUTION') {
            const res: BatchRoutineItemResult = {
              taskMasterId: input.taskMasterId,
              roomId,
              status: 'AMBIGUOUS_LEGACY_CONFLICT',
              retryable: false,
              conflictDetails: {
                conflictingRoutineIds: conflictDoc.conflictingRoutineIds,
                resolutionRequired: true
              },
              error: 'Múltiplas rotinas legadas detectadas. Exige resolução pelo administrador.'
            };
            itemResults.push(res);
            ledgerItems[indexKey] = {
              taskMasterId: input.taskMasterId,
              roomId,
              status: 'AMBIGUOUS_LEGACY_CONFLICT',
              error: res.error,
              committedAt: nowIso
            };
            continue;
          }

          // CASO 2: Índice não existia, mas foram encontradas MÚLTIPLAS rotinas legadas
          if (!indexDoc && legacyRoutines.length > 1) {
            // REGRA OBRIGATÓRIA D.2: NÃO arquivar, NÃO deletar, NÃO modificar rotinas legadas!
            // Registrar conflito e bloquear novas criações pelo novo protocolo.
            const newConflict: RoutineIndexConflictDoc = {
              taskMasterId: input.taskMasterId,
              roomId,
              conflictingRoutineIds: legacyRoutines.map(r => r.id),
              status: 'PENDING_ADMIN_RESOLUTION',
              detectedAt: nowIso
            };
            txn.setRoutineIndexConflict(familyId, indexKey, newConflict);

            const res: BatchRoutineItemResult = {
              taskMasterId: input.taskMasterId,
              roomId,
              status: 'AMBIGUOUS_LEGACY_CONFLICT',
              retryable: false,
              conflictDetails: {
                conflictingRoutineIds: newConflict.conflictingRoutineIds,
                resolutionRequired: true
              },
              error: 'Conflito de duplicatas legadas detectado. Rotinas preservadas sem alteração.'
            };
            itemResults.push(res);
            ledgerItems[indexKey] = {
              taskMasterId: input.taskMasterId,
              roomId,
              status: 'AMBIGUOUS_LEGACY_CONFLICT',
              error: res.error,
              committedAt: nowIso
            };
            continue;
          }

          // CASO 3: Índice já existe com vínculo canônico
          if (indexDoc && boundRoutine) {
            if (indexDoc.status === 'ACTIVE' && boundRoutine.active !== false) {
              // Já ativa: no-op idempotente
              const res: BatchRoutineItemResult = {
                taskMasterId: input.taskMasterId,
                roomId,
                status: 'ALREADY_ACTIVE',
                routineId: boundRoutine.id,
                retryable: false
              };
              itemResults.push(res);
              ledgerItems[indexKey] = {
                taskMasterId: input.taskMasterId,
                roomId,
                status: 'ALREADY_ACTIVE',
                canonicalRoutineId: boundRoutine.id,
                committedAt: nowIso
              };
              // AUD-B2A-03: Reconciliação idempotente de ocorrências pendentes em caso de falha anterior
              localRoutinesToSync.push({ routine: boundRoutine, itemIndex: itemResults.length - 1 });
              continue;
            }

            // Rotina vinculada estava arquivada: REATIVAR CANONICAMENTE
            const reactivated: FamilyTask = {
              ...boundRoutine,
              active: true,
              frequency: (input.frequency || boundRoutine.frequency || 'DAILY').toUpperCase(),
              preferred_days: (input.frequency === 'WEEKLY' || input.frequency === 'BIWEEKLY')
                ? (input.preferredDays && input.preferredDays.length > 0 ? input.preferredDays : boundRoutine.preferred_days)
                : undefined,
              day_of_month: input.frequency === 'MONTHLY'
                ? (input.dayOfMonth ?? boundRoutine.day_of_month ?? 1)
                : undefined,
              start_date: input.frequency === 'ONE_TIME' ? (input.startDate || today) : undefined,
              preferred_time: input.preferredTime || boundRoutine.preferred_time || '09:00',
              estimated_minutes: input.durationMinutes ?? boundRoutine.estimated_minutes ?? 20,
              executionTarget: input.executionTarget || boundRoutine.executionTarget || 'HOUSEHOLD',
              domesticSupportId: input.executionTarget === 'HOUSEHOLD' ? null : (input.domesticSupportId ?? boundRoutine.domesticSupportId ?? null),
              updated_at: nowIso,
              updatedAt: nowIso
            };

            txn.setFamilyTask(familyId, reactivated.id, reactivated);
            txn.updateRoutineIndex(familyId, indexKey, {
              status: 'ACTIVE',
              updatedAt: nowIso,
              lastOperationId: operationId,
              lastOperationType: 'REACTIVATED'
            });

            localRoutinesToSync.push({ routine: reactivated, itemIndex: itemResults.length });
            const res: BatchRoutineItemResult = {
              taskMasterId: input.taskMasterId,
              roomId,
              status: 'REACTIVATED',
              routineId: reactivated.id,
              retryable: false
            };
            itemResults.push(res);
            ledgerItems[indexKey] = {
              taskMasterId: input.taskMasterId,
              roomId,
              status: 'REACTIVATED',
              canonicalRoutineId: reactivated.id,
              committedAt: nowIso
            };
            continue;
          }

          // CASO 4: Índice não existe, mas existe EXATAMENTE 1 rotina legada
          if (!indexDoc && legacyRoutines.length === 1) {
            const leg = legacyRoutines[0];
            const isLegActive = leg.active !== false;

            if (isLegActive) {
              // Adota a rotina legada ativa e cria o índice
              const newIdx: RoutineIndexDoc = {
                taskMasterId: input.taskMasterId,
                roomId,
                canonicalRoutineId: leg.id,
                status: 'ACTIVE',
                createdAt: nowIso,
                updatedAt: nowIso,
                lastOperationId: operationId,
                lastOperationType: 'ALREADY_ACTIVE'
              };
              txn.setRoutineIndex(familyId, indexKey, newIdx);

              const res: BatchRoutineItemResult = {
                taskMasterId: input.taskMasterId,
                roomId,
                status: 'ALREADY_ACTIVE',
                routineId: leg.id,
                retryable: false
              };
              itemResults.push(res);
              ledgerItems[indexKey] = {
                taskMasterId: input.taskMasterId,
                roomId,
                status: 'ALREADY_ACTIVE',
                canonicalRoutineId: leg.id,
                committedAt: nowIso
              };
              // AUD-B2A-03: Reconciliação de ocorrências de legado adotado
              localRoutinesToSync.push({ routine: leg, itemIndex: itemResults.length - 1 });
              continue;
            } else {
              // Reativa a rotina legada preservando ID e histórico
              const reactivated: FamilyTask = {
                ...leg,
                active: true,
                frequency: (input.frequency || leg.frequency || 'DAILY').toUpperCase(),
                preferred_days: (input.frequency === 'WEEKLY' || input.frequency === 'BIWEEKLY')
                  ? (input.preferredDays && input.preferredDays.length > 0 ? input.preferredDays : leg.preferred_days)
                  : undefined,
                day_of_month: input.frequency === 'MONTHLY'
                  ? (input.dayOfMonth ?? leg.day_of_month ?? 1)
                  : undefined,
                start_date: input.frequency === 'ONE_TIME' ? (input.startDate || today) : undefined,
                preferred_time: input.preferredTime || leg.preferred_time || '09:00',
                estimated_minutes: input.durationMinutes ?? leg.estimated_minutes ?? 20,
                updated_at: nowIso,
                updatedAt: nowIso
              };

              txn.setFamilyTask(familyId, leg.id, reactivated);
              const newIdx: RoutineIndexDoc = {
                taskMasterId: input.taskMasterId,
                roomId,
                canonicalRoutineId: leg.id,
                status: 'ACTIVE',
                createdAt: nowIso,
                updatedAt: nowIso,
                lastOperationId: operationId,
                lastOperationType: 'REACTIVATED'
              };
              txn.setRoutineIndex(familyId, indexKey, newIdx);

              localRoutinesToSync.push({ routine: reactivated, itemIndex: itemResults.length });
              const res: BatchRoutineItemResult = {
                taskMasterId: input.taskMasterId,
                roomId,
                status: 'REACTIVATED',
                routineId: leg.id,
                retryable: false
              };
              itemResults.push(res);
              ledgerItems[indexKey] = {
                taskMasterId: input.taskMasterId,
                roomId,
                status: 'REACTIVATED',
                canonicalRoutineId: leg.id,
                committedAt: nowIso
              };
              continue;
            }
          }

          // CASO 5: Nenhuma rotina legada encontrada -> CRIAR NOVA FAMILY TASK
          const cleanFam = sanitizeKeyComponent(familyId);
          const cleanTm = sanitizeKeyComponent(input.taskMasterId);
          const cleanRoom = sanitizeKeyComponent(roomId);
          const randomEntropy = Math.random().toString(36).substring(2, 8);
          const targetRoutineId = `ft_${cleanFam}_${cleanTm}_${cleanRoom}_${Date.now()}_${randomEntropy}`;
          const newRoutine: FamilyTask = {
            id: targetRoutineId,
            family_id: familyId,
            familyId,
            task_master_id: input.taskMasterId,
            taskMasterId: input.taskMasterId,
            name: input.name || 'Nova Rotina',
            room_id: roomId,
            roomId,
            frequency: (input.frequency || 'DAILY').toUpperCase(),
            preferred_days: (input.frequency === 'WEEKLY' || input.frequency === 'BIWEEKLY') ? input.preferredDays : undefined,
            day_of_month: input.frequency === 'MONTHLY' ? input.dayOfMonth : undefined,
            start_date: input.frequency === 'ONE_TIME' ? (input.startDate || today) : undefined,
            preferred_time: input.preferredTime || '09:00',
            estimated_minutes: input.durationMinutes ?? 20,
            active: true,
            executionTarget: input.executionTarget || 'HOUSEHOLD',
            domesticSupportId: input.executionTarget === 'HOUSEHOLD' ? null : (input.domesticSupportId ?? null),
            created_at: nowIso,
            createdAt: nowIso,
            updated_at: nowIso,
            updatedAt: nowIso
          };

          txn.setFamilyTask(familyId, targetRoutineId, newRoutine);
          const newIdx: RoutineIndexDoc = {
            taskMasterId: input.taskMasterId,
            roomId,
            canonicalRoutineId: targetRoutineId,
            status: 'ACTIVE',
            createdAt: nowIso,
            updatedAt: nowIso,
            lastOperationId: operationId,
            lastOperationType: 'CREATED'
          };
          txn.setRoutineIndex(familyId, indexKey, newIdx);

          localRoutinesToSync.push({ routine: newRoutine, itemIndex: itemResults.length });
          const res: BatchRoutineItemResult = {
            taskMasterId: input.taskMasterId,
            roomId,
            status: 'CREATED',
            routineId: targetRoutineId,
            retryable: false
          };
          itemResults.push(res);
          ledgerItems[indexKey] = {
            taskMasterId: input.taskMasterId,
            roomId,
            status: 'CREATED',
            canonicalRoutineId: targetRoutineId,
            committedAt: nowIso
          };
        }

        // Grava o ledger com o resultado real dos itens comitados
        const ledgerDoc: OperationLedgerDoc = {
          operationId,
          familyId,
          clientSessionId,
          createdAt: nowIso,
          status: 'COMMITTED',
          items: ledgerItems,
          updatedAt: nowIso
        };
        txn.setOperationLedger(familyId, operationId, ledgerDoc);

        return {
          itemResults,
          routinesToSync: localRoutinesToSync
        };
      });

      phase1Results = txnOutput.itemResults;
      routinesToSync = txnOutput.routinesToSync;
    } catch (err: any) {
      // Se a transação abortar (erro de rede ou contenção esgotada)
      const isTimeout = err?.message?.toLowerCase().includes('timeout');
      const failedItems: BatchRoutineItemResult[] = items.map(it => ({
        taskMasterId: it.taskMasterId,
        roomId: it.roomId || 'geral',
        status: isTimeout ? 'UNKNOWN_COMMIT' : 'FAILED',
        error: err?.message || 'Falha na transação de rotinas',
        retryable: true
      }));
      return aggregateGranularBatchResults(failedItems, operationId);
    }

    // 4. FASE 2: GERAÇÃO TRANSAÇÃO DE OCORRÊNCIAS (Create-If-Absent, Reads Before Writes)
    let syncFailuresCount = 0;
    for (const syncTarget of routinesToSync) {
      try {
        await this.transactionalSyncOccurrences({
          familyId,
          routine: syncTarget.routine,
          horizonDates,
          store,
          today
        });
      } catch (occErr: any) {
        syncFailuresCount++;
        // Se a agenda falhar, a rotina foi salva, mas o status vira OCCURRENCE_SYNC_PENDING
        const targetResult = phase1Results[syncTarget.itemIndex];
        if (targetResult) {
          targetResult.status = 'OCCURRENCE_SYNC_PENDING';
          targetResult.error = `Rotina persistida com sucesso, mas a sincronização de ocorrências falhou: ${occErr.message}`;
          targetResult.retryable = true;
        }
      }
    }

    // AUD-B1.1-03: Sincronização consistente entre ledger e estado das ocorrências
    if (syncFailuresCount > 0) {
      try {
        await store.runTransaction(async (updateTxn) => {
          const currentLedger = await updateTxn.getOperationLedger(familyId, operationId);
          if (currentLedger) {
            const updatedItems = { ...currentLedger.items };
            for (const res of phase1Results) {
              const k = buildRoutineIndexKey(res.taskMasterId, res.roomId);
              if (updatedItems[k] && res.status === 'OCCURRENCE_SYNC_PENDING') {
                updatedItems[k] = {
                  ...updatedItems[k],
                  status: 'OCCURRENCE_SYNC_PENDING',
                  error: res.error
                };
              }
            }
            updateTxn.updateOperationLedger(familyId, operationId, {
              status: 'PARTIALLY_COMMITTED',
              items: updatedItems,
              updatedAt: new Date().toISOString()
            });
          }
        });
      } catch {
        // Fallback silencioso não interrompe retorno consolidado
      }
    }

    return aggregateGranularBatchResults(phase1Results, operationId);
  }

  /**
   * Sincronização transacional segura de ocorrências para uma rotina específica.
   * Executa estritamente todas as leituras antes de qualquer escrita.
   * Cria ocorrências apenas se ausentes (Create-If-Absent real).
   * Preserva histórico concluído e atribuições de moradores.
   */
  public static async transactionalSyncOccurrences(params: {
    familyId: string;
    routine: FamilyTask;
    horizonDates: string[];
    store: ITransactionalStore;
    today: string;
  }): Promise<{ created: string[]; reconciled: string[]; preserved: string[] }> {
    const { familyId, routine, horizonDates, store, today } = params;
    const nowIso = new Date().toISOString();
    const resolvedDuration = RoutineContinuityService.resolveRoutineDurationMinutes(routine);

    return await store.runTransaction(async (txn: ITransactionContext) => {
      // --- ALL READS FIRST ---
      const dateToSnap = new Map<string, TaskAssignment | null>();

      for (const dateStr of horizonDates) {
        const occId = `${routine.id}_${dateStr}`;
        const asg = await txn.getAssignment(familyId, occId);
        dateToSnap.set(dateStr, asg);
      }

      // --- ALL WRITES SECOND ---
      const created: string[] = [];
      const reconciled: string[] = [];
      const preserved: string[] = [];

      for (const dateStr of horizonDates) {
        const existingAsg = dateToSnap.get(dateStr);
        const shouldOccur = RoutineGenerator.shouldOccurOnDate(routine, dateStr);
        const occId = `${routine.id}_${dateStr}`;

        if (!existingAsg) {
          // Ocorrência NÃO existe no banco: Create-If-Absent atômico
          if (shouldOccur) {
            const newOcc = RoutineGenerator.createInitialOccurrence(
              routine,
              dateStr,
              familyId,
              resolvedDuration
            );
            txn.setAssignment(familyId, occId, newOcc);
            created.push(occId);
          }
        } else {
          // Ocorrência JÁ existe no banco
          const isPast = dateStr < today;
          const isCompletedOrInProgress =
            existingAsg.status === 'COMPLETED' ||
            existingAsg.status === 'DONE' ||
            existingAsg.status === 'IN_PROGRESS' ||
            Boolean(existingAsg.completed_at) ||
            Boolean((existingAsg as any).completedAt) ||
            Boolean(existingAsg.completed_by);

          if (isPast || isCompletedOrInProgress) {
            // Imutabilidade absoluta do histórico
            preserved.push(occId);
            continue;
          }

          if (shouldOccur) {
            if (existingAsg.status === 'CANCELLED') {
              const startTime = routine.preferred_time || routine.preferredTime || '09:00';
              txn.updateAssignment(familyId, occId, {
                status: 'SCHEDULED',
                scheduled_start: startTime,
                scheduled_end: addMinutesToTimeString(startTime, resolvedDuration),
                room_id: routine.room_id || routine.roomId,
                updatedAt: nowIso
              });
              reconciled.push(occId);
            }
          } else {
            // Fora do novo cronograma: proteção de moradores vs cancelamento
            const isAssigned =
              !existingAsg.is_unassigned &&
              Boolean(existingAsg.member_id) &&
              existingAsg.member_id.trim() !== '';

            if (isAssigned) {
              txn.updateAssignment(familyId, occId, {
                assigned_reason: existingAsg.assigned_reason
                  ? `${existingAsg.assigned_reason} (Conflito: fora da nova frequência)`
                  : 'Conflito: fora da nova frequência',
                factors: { ...(existingAsg.factors || {}), conflict: 'OFF_SCHEDULE_PRESERVED' },
                updatedAt: nowIso
              });
              reconciled.push(occId);
            } else if (existingAsg.status !== 'CANCELLED') {
              txn.updateAssignment(familyId, occId, {
                status: 'CANCELLED',
                unassigned_reason: 'Rotina reconfigurada: data fora do cronograma ativo',
                updatedAt: nowIso
              });
              reconciled.push(occId);
            }
          }
        }
      }

      return { created, reconciled, preserved };
    });
  }

  /**
   * Sonda idempotente do ledger após timeout (UNKNOWN_COMMIT).
   * Regra estrita D.2:
   * - A ausência do ledger NÃO comprova rollback definitivo.
   * - Enquanto não houver evidência, mantém UNKNOWN_COMMIT.
   * - Não permite retry direto de UNKNOWN_COMMIT com novo operationId sem reconciliação.
   */
  public static async probeAndReconcileOperation(params: {
    familyId: string;
    operationId: string;
    items: BatchAddRoutineInput[];
    store: ITransactionalStore;
  }): Promise<{
    reconciledResult?: GranularBatchAddResult;
    isUnknown: boolean;
    reason: string;
  }> {
    const { familyId, operationId, items, store } = params;

    if ('ensureContext' in store && typeof (store as any).ensureContext === 'function') {
      await (store as any).ensureContext(familyId);
    }

    const ledger = await store.directGetOperationLedger(familyId, operationId);

    if (ledger && (ledger.status === 'COMMITTED' || ledger.status === 'PARTIALLY_COMMITTED')) {
      // Commit comprovado com evidência do servidor!
      const itemResults: BatchRoutineItemResult[] = items.map(it => {
        const roomId = it.roomId || 'geral';
        const key = buildRoutineIndexKey(it.taskMasterId, roomId);
        const lItem = ledger.items[key];
        if (lItem) {
          return {
            taskMasterId: it.taskMasterId,
            roomId,
            status: lItem.status,
            routineId: lItem.canonicalRoutineId,
            retryable: lItem.status === 'FAILED' || lItem.status === 'UNKNOWN_COMMIT' || lItem.status === 'OCCURRENCE_SYNC_PENDING',
            error: lItem.error
          };
        }
        return {
          taskMasterId: it.taskMasterId,
          roomId,
          status: 'UNKNOWN_COMMIT',
          retryable: true,
          error: 'Item não encontrado no ledger da operação'
        };
      });

      return {
        reconciledResult: aggregateGranularBatchResults(itemResults, operationId),
        isUnknown: false,
        reason: 'Commit confirmado com sucesso no ledger do servidor'
      };
    }

    // Se o ledger não foi encontrado, inspeciona se os índices contêm o operationId gravado
    let matchesCount = 0;
    for (const it of items) {
      const roomId = it.roomId || 'geral';
      const key = buildRoutineIndexKey(it.taskMasterId, roomId);
      const idx = await store.directGetRoutineIndex(familyId, key);
      if (idx && idx.lastOperationId === operationId) {
        matchesCount++;
      }
    }

    if (matchesCount === items.length && items.length > 0) {
      // Reconstroi com base em evidência transacional atômica registrada no índice (AUD-B2A-01)
      const itemResults: BatchRoutineItemResult[] = [];
      for (const it of items) {
        const roomId = it.roomId || 'geral';
        const key = buildRoutineIndexKey(it.taskMasterId, roomId);
        const idx = await store.directGetRoutineIndex(familyId, key);
        let itemStatus: 'CREATED' | 'REACTIVATED' | 'ALREADY_ACTIVE';
        let canonicalId: string | undefined = undefined;

        // AUD-B2A-01: Não inferir por timestamp! Exigir evidência atômica lastOperationType no RoutineIndexDoc.
        if (idx && idx.lastOperationType) {
          canonicalId = idx.canonicalRoutineId;
          itemStatus = idx.lastOperationType;
        } else {
          // Sem evidência atômica explícita do tipo de operação: preserva isUnknown: true sem inferir por timestamps
          return {
            isUnknown: true,
            reason: 'Índice sem lastOperationType gravado atomicamente. Inferência por timestamp proibida (AUD-B2A-01). Mantenha UNKNOWN_COMMIT.'
          };
        }

        itemResults.push({
          taskMasterId: it.taskMasterId,
          roomId,
          status: itemStatus,
          routineId: canonicalId,
          retryable: false
        });
      }

      return {
        reconciledResult: aggregateGranularBatchResults(itemResults, operationId),
        isUnknown: false,
        reason: 'Commit confirmado pela correspondência de todos os índices com lastOperationType atômico'
      };
    }

    // Regra D.2: A ausência do ledger NÃO comprova rollback definitivo se a janela de tempo for recente.
    // Mantém UNKNOWN_COMMIT e orienta que o retry deve reutilizar o mesmo operationId.
    return {
      isUnknown: true,
      reason: 'Evidência insuficiente no servidor para comprovar commit ou rollback definitivo. Mantenha UNKNOWN_COMMIT.'
    };
  }

  /**
   * AUD-B2A-03: Reconciliação direta de ocorrências pendentes de uma rotina canônica.
   * Útil para recuperação após interrupção/crash antes da conclusão da geração de ocorrências.
   */
  public static async reconcilePendingRoutineOccurrences(params: {
    familyId: string;
    routineId: string;
    store: ITransactionalStore;
    today?: string;
    timezone?: string;
  }): Promise<{ created: string[]; reconciled: string[]; preserved: string[] }> {
    const {
      familyId,
      routineId,
      store,
      today = getFamilyLocalDate(params.timezone)
    } = params;

    if ('ensureContext' in store && typeof (store as any).ensureContext === 'function') {
      await (store as any).ensureContext(familyId);
    }

    const routine = await store.directGetFamilyTask(familyId, routineId);
    if (!routine) {
      throw new Error(`Rotina ${routineId} não encontrada para reconciliação.`);
    }

    const horizonDates = getRollingDateHorizon(today, 15);
    return await this.transactionalSyncOccurrences({
      familyId,
      routine,
      horizonDates,
      store,
      today
    });
  }
}

