/**
 * CasaJunto — B.5.5-HF1-D-B1: InMemoryTransactionalStore
 * Implementação em memória de ITransactionalStore e ITransactionContext.
 * 
 * Simula com fidelidade o comportamento transacional do Firestore:
 * 1. Regra estrita "All Reads Before Any Writes": falha se qualquer leitura for executada após uma escrita.
 * 2. Controle de Concorrência Otimista (OCC) baseado em versões por documento.
 * 3. Retentativas automáticas em caso de conflito de concorrência.
 * 4. Isolamento estrito por família (multi-tenant seguro).
 * 5. Sondagem direta para simulação de recuperação de timeouts e UNKNOWN_COMMIT.
 */

import {
  FamilyTask,
  TaskAssignment
} from '../../types';
import {
  RoutineIndexDoc,
  RoutineIndexConflictDoc,
  OperationLedgerDoc,
  ITransactionalStore,
  ITransactionContext
} from './transactionalTypes';

interface DocRecord<T> {
  data: T;
  version: number;
}

export class InMemoryTransactionalStore implements ITransactionalStore {
  private familyTasks = new Map<string, DocRecord<FamilyTask>>();
  private routineIndices = new Map<string, DocRecord<RoutineIndexDoc>>();
  private routineConflicts = new Map<string, DocRecord<RoutineIndexConflictDoc>>();
  private operationLedgers = new Map<string, DocRecord<OperationLedgerDoc>>();
  private assignments = new Map<string, DocRecord<TaskAssignment>>();

  // Contadores e knobs de injeção de falhas para testes
  public readAfterWriteViolations = 0;
  public transactionAttempts = 0;
  public concurrencyConflictsCount = 0;
  public simulateTimeoutOnCommit = false;

  private makeKey(prefix: string, familyId: string, id: string): string {
    return `${prefix}:${familyId}:${id}`;
  }

  // --- SEED E CONSULTA DIRETA PARA TESTES ---
  public seedFamilyTask(routine: FamilyTask): void {
    const familyId = routine.family_id || routine.familyId || 'unknown';
    const key = this.makeKey('ft', familyId, routine.id);
    this.familyTasks.set(key, { data: JSON.parse(JSON.stringify(routine)), version: 1 });
  }

  public seedAssignment(assignment: TaskAssignment): void {
    const familyId = assignment.family_id || (assignment as any).familyId || 'unknown';
    const key = this.makeKey('asg', familyId, assignment.id);
    this.assignments.set(key, { data: JSON.parse(JSON.stringify(assignment)), version: 1 });
  }

  public getAllFamilyTasks(familyId: string): FamilyTask[] {
    const prefix = `ft:${familyId}:`;
    const results: FamilyTask[] = [];
    for (const [k, v] of this.familyTasks.entries()) {
      if (k.startsWith(prefix)) {
        results.push(JSON.parse(JSON.stringify(v.data)));
      }
    }
    return results;
  }

  public getAllAssignments(familyId: string): TaskAssignment[] {
    const prefix = `asg:${familyId}:`;
    const results: TaskAssignment[] = [];
    for (const [k, v] of this.assignments.entries()) {
      if (k.startsWith(prefix)) {
        results.push(JSON.parse(JSON.stringify(v.data)));
      }
    }
    return results;
  }

  public getAllRoutineIndices(familyId: string): RoutineIndexDoc[] {
    const prefix = `idx:${familyId}:`;
    const results: RoutineIndexDoc[] = [];
    for (const [k, v] of this.routineIndices.entries()) {
      if (k.startsWith(prefix)) {
        results.push(JSON.parse(JSON.stringify(v.data)));
      }
    }
    return results;
  }

  public getAllConflicts(familyId: string): RoutineIndexConflictDoc[] {
    const prefix = `cnf:${familyId}:`;
    const results: RoutineIndexConflictDoc[] = [];
    for (const [k, v] of this.routineConflicts.entries()) {
      if (k.startsWith(prefix)) {
        results.push(JSON.parse(JSON.stringify(v.data)));
      }
    }
    return results;
  }

  // --- MÉTODOS DIRETOS DE SONDAGEM FORA DE TRANSAÇÃO ---
  public async directGetOperationLedger(familyId: string, operationId: string): Promise<OperationLedgerDoc | null> {
    const key = this.makeKey('led', familyId, operationId);
    const rec = this.operationLedgers.get(key);
    return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
  }

  public async directGetRoutineIndex(familyId: string, indexKey: string): Promise<RoutineIndexDoc | null> {
    const key = this.makeKey('idx', familyId, indexKey);
    const rec = this.routineIndices.get(key);
    return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
  }

  public async directGetFamilyTask(familyId: string, routineId: string): Promise<FamilyTask | null> {
    const key = this.makeKey('ft', familyId, routineId);
    const rec = this.familyTasks.get(key);
    return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
  }

  public async directGetAssignment(familyId: string, assignmentId: string): Promise<TaskAssignment | null> {
    const key = this.makeKey('asg', familyId, assignmentId);
    const rec = this.assignments.get(key);
    return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
  }

  public async preReadLegacyRoutines(
    familyId: string,
    taskMasterId: string,
    roomId: string
  ): Promise<FamilyTask[]> {
    const prefix = `ft:${familyId}:`;
    const matches: FamilyTask[] = [];
    for (const [k, v] of this.familyTasks.entries()) {
      if (k.startsWith(prefix)) {
        const r = v.data;
        const rTaskMaster = r.task_master_id || r.taskMasterId;
        const rRoom = r.room_id || r.roomId || 'geral';
        if (rTaskMaster === taskMasterId && rRoom === roomId) {
          matches.push(JSON.parse(JSON.stringify(r)));
        }
      }
    }
    return matches;
  }

  // --- RUN TRANSACTION COM ALL-READS-BEFORE-WRITES E OCC ---
  public async runTransaction<T>(
    updateFunction: (txn: ITransactionContext) => Promise<T>,
    maxRetries: number = 8
  ): Promise<T> {
    let attempt = 0;

    while (attempt < maxRetries) {
      attempt++;
      this.transactionAttempts++;

      let hasWritten = false;
      const readVersions = new Map<string, number>();

      // Buffer de escritas encenadas para commit atômico
      const stagedWrites: Array<() => void> = [];

      const checkReadPermission = (docKey: string) => {
        if (hasWritten) {
          this.readAfterWriteViolations++;
          throw new Error(`Firestore Transaction Violation: All reads must precede any writes! Attempted read on ${docKey} after writes began.`);
        }
      };

      const recordRead = (docKey: string, rec?: DocRecord<any>) => {
        checkReadPermission(docKey);
        readVersions.set(docKey, rec ? rec.version : 0);
      };

      const txnContext: ITransactionContext = {
        // --- LEITURAS ---
        getFamilyTask: async (familyId: string, routineId: string): Promise<FamilyTask | null> => {
          const key = this.makeKey('ft', familyId, routineId);
          const rec = this.familyTasks.get(key);
          recordRead(key, rec);
          return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
        },

        getRoutineIndex: async (familyId: string, indexKey: string): Promise<RoutineIndexDoc | null> => {
          const key = this.makeKey('idx', familyId, indexKey);
          const rec = this.routineIndices.get(key);
          recordRead(key, rec);
          return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
        },

        getRoutineIndexConflict: async (familyId: string, indexKey: string): Promise<RoutineIndexConflictDoc | null> => {
          const key = this.makeKey('cnf', familyId, indexKey);
          const rec = this.routineConflicts.get(key);
          recordRead(key, rec);
          return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
        },

        getOperationLedger: async (familyId: string, operationId: string): Promise<OperationLedgerDoc | null> => {
          const key = this.makeKey('led', familyId, operationId);
          const rec = this.operationLedgers.get(key);
          recordRead(key, rec);
          return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
        },

        getAssignment: async (familyId: string, assignmentId: string): Promise<TaskAssignment | null> => {
          const key = this.makeKey('asg', familyId, assignmentId);
          const rec = this.assignments.get(key);
          recordRead(key, rec);
          return rec ? JSON.parse(JSON.stringify(rec.data)) : null;
        },

        queryFamilyTasksByTaskAndRoom: async (
          familyId: string,
          taskMasterId: string,
          roomId: string
        ): Promise<FamilyTask[]> => {
          const queryKey = this.makeKey('query', familyId, `${taskMasterId}_${roomId}`);
          checkReadPermission(queryKey);

          const prefix = `ft:${familyId}:`;
          const matches: FamilyTask[] = [];
          for (const [k, v] of this.familyTasks.entries()) {
            if (k.startsWith(prefix)) {
              const r = v.data;
              const rTaskMaster = r.task_master_id || r.taskMasterId;
              const rRoom = r.room_id || r.roomId || 'geral';
              if (rTaskMaster === taskMasterId && rRoom === roomId) {
                matches.push(JSON.parse(JSON.stringify(r)));
                readVersions.set(k, v.version);
              }
            }
          }
          return matches;
        },

        // --- ESCRITAS ---
        setFamilyTask: (familyId: string, routineId: string, routine: FamilyTask): void => {
          hasWritten = true;
          const key = this.makeKey('ft', familyId, routineId);
          stagedWrites.push(() => {
            const currentRec = this.familyTasks.get(key);
            const currentVer = currentRec ? currentRec.version : 0;
            this.familyTasks.set(key, {
              data: JSON.parse(JSON.stringify(routine)),
              version: currentVer + 1
            });
          });
        },

        updateFamilyTask: (familyId: string, routineId: string, updates: Partial<FamilyTask>): void => {
          hasWritten = true;
          const key = this.makeKey('ft', familyId, routineId);
          stagedWrites.push(() => {
            const currentRec = this.familyTasks.get(key);
            if (!currentRec) return;
            this.familyTasks.set(key, {
              data: { ...currentRec.data, ...JSON.parse(JSON.stringify(updates)) },
              version: currentRec.version + 1
            });
          });
        },

        setRoutineIndex: (familyId: string, indexKey: string, index: RoutineIndexDoc): void => {
          hasWritten = true;
          const key = this.makeKey('idx', familyId, indexKey);
          stagedWrites.push(() => {
            const currentRec = this.routineIndices.get(key);
            const currentVer = currentRec ? currentRec.version : 0;
            this.routineIndices.set(key, {
              data: JSON.parse(JSON.stringify(index)),
              version: currentVer + 1
            });
          });
        },

        updateRoutineIndex: (familyId: string, indexKey: string, updates: Partial<RoutineIndexDoc>): void => {
          hasWritten = true;
          const key = this.makeKey('idx', familyId, indexKey);
          stagedWrites.push(() => {
            const currentRec = this.routineIndices.get(key);
            if (!currentRec) return;
            this.routineIndices.set(key, {
              data: { ...currentRec.data, ...JSON.parse(JSON.stringify(updates)) },
              version: currentRec.version + 1
            });
          });
        },

        setRoutineIndexConflict: (familyId: string, indexKey: string, conflict: RoutineIndexConflictDoc): void => {
          hasWritten = true;
          const key = this.makeKey('cnf', familyId, indexKey);
          stagedWrites.push(() => {
            const currentRec = this.routineConflicts.get(key);
            const currentVer = currentRec ? currentRec.version : 0;
            this.routineConflicts.set(key, {
              data: JSON.parse(JSON.stringify(conflict)),
              version: currentVer + 1
            });
          });
        },

        setOperationLedger: (familyId: string, operationId: string, ledger: OperationLedgerDoc): void => {
          hasWritten = true;
          const key = this.makeKey('led', familyId, operationId);
          stagedWrites.push(() => {
            const currentRec = this.operationLedgers.get(key);
            const currentVer = currentRec ? currentRec.version : 0;
            this.operationLedgers.set(key, {
              data: JSON.parse(JSON.stringify(ledger)),
              version: currentVer + 1
            });
          });
        },

        updateOperationLedger: (familyId: string, operationId: string, updates: Partial<OperationLedgerDoc>): void => {
          hasWritten = true;
          const key = this.makeKey('led', familyId, operationId);
          stagedWrites.push(() => {
            const currentRec = this.operationLedgers.get(key);
            if (!currentRec) return;
            this.operationLedgers.set(key, {
              data: { ...currentRec.data, ...JSON.parse(JSON.stringify(updates)) },
              version: currentRec.version + 1
            });
          });
        },

        setAssignment: (familyId: string, assignmentId: string, assignment: TaskAssignment): void => {
          hasWritten = true;
          const key = this.makeKey('asg', familyId, assignmentId);
          stagedWrites.push(() => {
            const currentRec = this.assignments.get(key);
            const currentVer = currentRec ? currentRec.version : 0;
            this.assignments.set(key, {
              data: JSON.parse(JSON.stringify(assignment)),
              version: currentVer + 1
            });
          });
        },

        updateAssignment: (familyId: string, assignmentId: string, updates: Partial<TaskAssignment>): void => {
          hasWritten = true;
          const key = this.makeKey('asg', familyId, assignmentId);
          stagedWrites.push(() => {
            const currentRec = this.assignments.get(key);
            if (!currentRec) return;
            this.assignments.set(key, {
              data: { ...currentRec.data, ...JSON.parse(JSON.stringify(updates)) },
              version: currentRec.version + 1
            });
          });
        }
      };

      try {
        const result = await updateFunction(txnContext);

        if (this.simulateTimeoutOnCommit) {
          throw new Error('Transaction network timeout: timed out waiting for Firestore commit acknowledgment');
        }

        // Validação de Concorrência Otimista (OCC) no momento do commit
        let conflictDetected = false;
        for (const [readKey, expectedVer] of readVersions.entries()) {
          let currentVer = 0;
          if (readKey.startsWith('ft:')) currentVer = this.familyTasks.get(readKey)?.version || 0;
          else if (readKey.startsWith('idx:')) currentVer = this.routineIndices.get(readKey)?.version || 0;
          else if (readKey.startsWith('cnf:')) currentVer = this.routineConflicts.get(readKey)?.version || 0;
          else if (readKey.startsWith('led:')) currentVer = this.operationLedgers.get(readKey)?.version || 0;
          else if (readKey.startsWith('asg:')) currentVer = this.assignments.get(readKey)?.version || 0;

          if (currentVer !== expectedVer) {
            conflictDetected = true;
            this.concurrencyConflictsCount++;
            break;
          }
        }

        if (conflictDetected) {
          if (attempt >= maxRetries) {
            throw new Error(`Transaction contention: failed after ${maxRetries} attempts due to concurrent updates.`);
          }
          // Delay simulado de backoff antes da próxima tentativa
          await new Promise(r => setTimeout(r, Math.random() * 15 + 5));
          continue;
        }

        // Aplicar todas as escritas atomicamente
        for (const writeOp of stagedWrites) {
          writeOp();
        }

        return result;
      } catch (err: any) {
        if (err?.message?.includes('Transaction contention') && attempt < maxRetries) {
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Transaction aborted after exceeding maximum retries (${maxRetries})`);
  }
}
