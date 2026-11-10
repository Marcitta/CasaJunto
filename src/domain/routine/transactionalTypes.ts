/**
 * CasaJunto — B.5.5-HF1-D-B1: Tipos e Contratos da Infraestrutura Transacional Isolada
 * Documentos de Índice, Conflitos, Ledger de Operações e Interfaces de Persistência Injetável.
 */

import {
  FamilyTask,
  TaskAssignment,
  BatchRoutineOperationStatus,
  BatchRoutineItemResult,
  GranularBatchAddResult,
  BatchAddRoutineInput
} from '../../types';

export interface RoutineIndexDoc {
  taskMasterId: string;
  roomId: string;
  canonicalRoutineId: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  lastOperationId: string;
  lastOperationType?: 'CREATED' | 'REACTIVATED' | 'ALREADY_ACTIVE';
}

export interface RoutineIndexConflictDoc {
  taskMasterId: string;
  roomId: string;
  conflictingRoutineIds: string[];
  status: 'PENDING_ADMIN_RESOLUTION' | 'RESOLVED';
  detectedAt: string;
  resolvedAt?: string;
  resolvedByMemberId?: string;
  chosenCanonicalRoutineId?: string;
}

export interface OperationLedgerItem {
  taskMasterId: string;
  roomId: string;
  status: BatchRoutineOperationStatus;
  canonicalRoutineId?: string;
  error?: string;
  committedAt?: string;
}

export interface OperationLedgerDoc {
  operationId: string;
  familyId: string;
  clientSessionId?: string;
  createdAt: string;
  status: 'IN_FLIGHT' | 'PARTIALLY_COMMITTED' | 'COMMITTED' | 'ABORTED';
  items: Record<string, OperationLedgerItem>; // Chave: taskMasterId___roomId
  updatedAt?: string;
}

/**
 * Interface do contexto transacional injetável.
 * Impõe a regra "All Reads Before Any Writes" do Firestore.
 */
export interface ITransactionContext {
  // LEITURAS (Devem preceder quaisquer escritas)
  getFamilyTask(familyId: string, routineId: string): Promise<FamilyTask | null>;
  getRoutineIndex(familyId: string, indexKey: string): Promise<RoutineIndexDoc | null>;
  getRoutineIndexConflict(familyId: string, indexKey: string): Promise<RoutineIndexConflictDoc | null>;
  getOperationLedger(familyId: string, operationId: string): Promise<OperationLedgerDoc | null>;
  getAssignment(familyId: string, assignmentId: string): Promise<TaskAssignment | null>;
  queryFamilyTasksByTaskAndRoom(familyId: string, taskMasterId: string, roomId: string): Promise<FamilyTask[]>;

  // ESCRITAS (Executadas estritamente após todas as leituras)
  setFamilyTask(familyId: string, routineId: string, routine: FamilyTask): void;
  updateFamilyTask(familyId: string, routineId: string, updates: Partial<FamilyTask>): void;
  setRoutineIndex(familyId: string, indexKey: string, index: RoutineIndexDoc): void;
  updateRoutineIndex(familyId: string, indexKey: string, updates: Partial<RoutineIndexDoc>): void;
  setRoutineIndexConflict(familyId: string, indexKey: string, conflict: RoutineIndexConflictDoc): void;
  setOperationLedger(familyId: string, operationId: string, ledger: OperationLedgerDoc): void;
  updateOperationLedger(familyId: string, operationId: string, updates: Partial<OperationLedgerDoc>): void;
  setAssignment(familyId: string, assignmentId: string, assignment: TaskAssignment): void;
  updateAssignment(familyId: string, assignmentId: string, updates: Partial<TaskAssignment>): void;
}

/**
 * Interface da store transacional injetável.
 * Permite isolamento 100% livre de Firestore real para testes controlados.
 */
export interface ITransactionalStore {
  runTransaction<T>(updateFunction: (txn: ITransactionContext) => Promise<T>): Promise<T>;
  preReadLegacyRoutines(familyId: string, taskMasterId: string, roomId: string): Promise<FamilyTask[]>;
  // Métodos diretos de sondagem fora de transação:
  directGetOperationLedger(familyId: string, operationId: string): Promise<OperationLedgerDoc | null>;
  directGetRoutineIndex(familyId: string, indexKey: string): Promise<RoutineIndexDoc | null>;
  directGetFamilyTask(familyId: string, routineId: string): Promise<FamilyTask | null>;
  directGetAssignment(familyId: string, assignmentId: string): Promise<TaskAssignment | null>;
}
