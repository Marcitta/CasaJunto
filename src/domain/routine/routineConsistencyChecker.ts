/**
 * CasaJunto — B.5.5-HF1-D-B2C-HF3-HF1: Verificação de Consistência e Gate de Rollback Seguro
 *
 * Garante que:
 * 1. Uma família com rotinas suspensas só pode ter a suspensão liberada ou rollback finalizado
 *    se o estado entre FamilyTask, routineIndex e routineIndexConflicts for 100% consistente.
 * 2. Nenhuma divergência (ex: FamilyTask.active=false vs routineIndex.status='ACTIVE') passa despercebida.
 * 3. AUD-HF3-01: O cliente NUNCA emite AUDIT_PASSED nem altera routineSuspended=false diretamente.
 *    A liberação exige execução por autoridade confiável no backend (Cloud Function / Admin SDK).
 * 4. AUD-HF3-02: Captura consistencyVersion do servidor e valida atomicamente contra concorrência.
 * 5. AUD-HF3-04: Leituras obrigatórias exclusivamente do servidor (getDocFromServer / getDocsFromServer),
 *    ZERO fallback para cache local (getDoc / getDocs removidos).
 */

import {
  Firestore,
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer
} from 'firebase/firestore';
import { FamilyTask } from '../../types';
import { RoutineIndexDoc, RoutineIndexConflictDoc } from './transactionalTypes';
import { buildRoutineIndexKey } from './multiRoomBatchContracts';

export interface RoutineReleaseAuditRecord {
  auditId: string;
  familyId: string;
  performedBy: string;
  status: 'AUDIT_PASSED' | 'AUDIT_FAILED';
  totalDiscrepancies: number;
  discrepancies: string[];
  auditedTasksCount: number;
  auditedIndexesCount: number;
  consistencyVersion: number;
  releasedConsistencyVersion?: number;
  serverVerified?: boolean;
  createdAt: string;
}

export interface ConsistencyAuditResult {
  isConsistent: boolean;
  canSafelyResumeOrRollback: boolean;
  discrepancies: string[];
  stats: {
    totalTasks: number;
    totalIndexes: number;
    activeTasks: number;
    activeIndexes: number;
    archivedTasks: number;
    archivedIndexes: number;
  };
}

export type ServerSuspensionReleaseExecutor = (params: {
  familyId: string;
  performedByUid: string;
  expectedConsistencyVersion: number;
  expectedAuditStateHash: string;
  preflightAudit: ConsistencyAuditResult;
}) => Promise<{ success: boolean; auditId: string; audit?: ConsistencyAuditResult }>;

export type ServerReconciliationExecutor = (params: {
  familyId: string;
  actions: {
    indexesToArchive?: string[];
    indexesToCreateOrUpdate?: RoutineIndexDoc[];
    tasksToDeactivate?: string[];
  };
}) => Promise<{ reconciledCount: number; newConsistencyVersion: number }>;

let registeredServerReleaseExecutor: ServerSuspensionReleaseExecutor | null = null;
let registeredServerReconciliationExecutor: ServerReconciliationExecutor | null = null;

export class RoutineConsistencyChecker {
  /**
   * Registra o transport confiável de backend (Cloud Function HTTPS Callable / Admin Service)
   * responsável pela auditoria transacional no servidor e emissão de AUDIT_PASSED.
   */
  static setServerReleaseExecutor(executor: ServerSuspensionReleaseExecutor | null): void {
    registeredServerReleaseExecutor = executor;
  }

  /**
   * AUD-HF3-HF2-02: Registra o transport confiável de backend responsável por reconciliações
   * sob suspensão e incremento exclusivo de consistencyVersion no servidor.
   */
  static setServerReconciliationExecutor(executor: ServerReconciliationExecutor | null): void {
    registeredServerReconciliationExecutor = executor;
  }

  /**
   * Calcula digest SHA-256 determinístico idêntico ao servidor sobre todo o estado estrutural auditado.
   */
  static async computeAuditStateHash(
    tasks: Array<Record<string, any> & { id: string }>,
    indexes: Array<Record<string, any> & { id?: string }>,
    conflicts: Array<Record<string, any> & { id?: string }> = []
  ): Promise<string> {
    const normalizedTasks = tasks
      .map(t => ({
        id: String(t.id || ''),
        active: t.active === true,
        taskMasterId: String(t.taskMasterId || t.task_master_id || ''),
        roomId: String(t.roomId || t.room_id || '')
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const normalizedIndexes = indexes
      .map(idx => ({
        docId: String(idx.id || buildRoutineIndexKey(String(idx.taskMasterId || ''), String(idx.roomId || ''))),
        taskMasterId: String(idx.taskMasterId || ''),
        roomId: String(idx.roomId || ''),
        canonicalRoutineId: String(idx.canonicalRoutineId || ''),
        status: String(idx.status || '')
      }))
      .sort((a, b) => a.docId.localeCompare(b.docId));

    const normalizedConflicts = conflicts
      .map(c => ({
        docId: String(c.id || buildRoutineIndexKey(String(c.taskMasterId || ''), String(c.roomId || ''))),
        taskMasterId: String(c.taskMasterId || ''),
        roomId: String(c.roomId || ''),
        status: String(c.status || ''),
        chosenCanonicalRoutineId: String(c.chosenCanonicalRoutineId || '')
      }))
      .sort((a, b) => a.docId.localeCompare(b.docId));

    const canonicalPayload = JSON.stringify({
      tasks: normalizedTasks,
      indexes: normalizedIndexes,
      conflicts: normalizedConflicts
    });

    const data = new TextEncoder().encode(canonicalPayload);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Executa auditoria completa entre FamilyTasks, routineIndex e routineIndexConflicts.
   */
  static auditConsistency(
    tasks: FamilyTask[],
    indexes: RoutineIndexDoc[],
    conflicts: RoutineIndexConflictDoc[] = []
  ): ConsistencyAuditResult {
    const discrepancies: string[] = [];
    const taskMap = new Map<string, FamilyTask>();
    tasks.forEach(t => taskMap.set(t.id, t));

    const indexByKey = new Map<string, RoutineIndexDoc>();
    for (const idx of indexes) {
      const key = buildRoutineIndexKey(idx.taskMasterId, idx.roomId);
      if (indexByKey.has(key)) {
        discrepancies.push(
          `Duplicidade de routineIndex: múltiplos índices para '${idx.taskMasterId}___${idx.roomId}'`
        );
      }
      indexByKey.set(key, idx);
    }

    let activeTasks = 0;
    let archivedTasks = 0;
    tasks.forEach(t => {
      if (t.active) activeTasks++;
      else archivedTasks++;
    });

    let activeIndexes = 0;
    let archivedIndexes = 0;
    indexes.forEach(idx => {
      if (idx.status === 'ACTIVE') activeIndexes++;
      else archivedIndexes++;
    });

    // 1. Validar cada routineIndex em relação à FamilyTask correspondente
    for (const idx of indexes) {
      const task = taskMap.get(idx.canonicalRoutineId);
      if (!task) {
        if (idx.status !== 'ARCHIVED') {
          discrepancies.push(
            `Índice órfão: routineIndex '${idx.taskMasterId}___${idx.roomId}' aponta para FamilyTask inexistente '${idx.canonicalRoutineId}'`
          );
        }
        continue;
      }

      const tMasterId = task.taskMasterId || (task as any).task_master_id;
      const tRoomId = task.roomId || (task as any).room_id;

      if (tMasterId && tMasterId !== idx.taskMasterId) {
        discrepancies.push(
          `Divergência de taskMasterId para rotina '${task.id}': FamilyTask tem '${tMasterId}', mas routineIndex tem '${idx.taskMasterId}'`
        );
      }

      if (tRoomId && tRoomId !== idx.roomId) {
        discrepancies.push(
          `Divergência de roomId para rotina '${task.id}': FamilyTask tem '${tRoomId}', mas routineIndex tem '${idx.roomId}'`
        );
      }

      if (idx.status === 'ACTIVE' && task.active !== true) {
        discrepancies.push(
          `Divergência de status: routineIndex '${idx.taskMasterId}___${idx.roomId}' está ACTIVE, mas FamilyTask '${task.id}' está active=${task.active}`
        );
      } else if (idx.status === 'ARCHIVED' && task.active === true) {
        discrepancies.push(
          `Divergência de status: routineIndex '${idx.taskMasterId}___${idx.roomId}' está ARCHIVED, mas FamilyTask '${task.id}' está active=true`
        );
      }
    }

    // 2. Validar se existem FamilyTasks ativas com taskMasterId+roomId sem índice canônico ou duplicadas
    for (const task of tasks) {
      const tMasterId = task.taskMasterId || (task as any).task_master_id;
      const tRoomId = task.roomId || (task as any).room_id;

      if (task.active && tMasterId && tRoomId) {
        const key = buildRoutineIndexKey(tMasterId, tRoomId);
        const idx = indexByKey.get(key);
        if (!idx) {
          discrepancies.push(
            `FamilyTask ativa desindexada: '${task.id}' (${tMasterId} em ${tRoomId}) não possui routineIndex correspondente`
          );
        } else if (idx.canonicalRoutineId !== task.id) {
          discrepancies.push(
            `Conflito de unicidade: FamilyTask ativa '${task.id}' não é a canonicalRoutineId registrada no índice ('${idx.canonicalRoutineId}')`
          );
        }
      }
    }

    // 3. Validar se existem conflitos pendentes de resolução
    for (const conf of conflicts) {
      if (conf.status === 'PENDING_ADMIN_RESOLUTION') {
        discrepancies.push(
          `Conflito pendente de resolução administrativa para '${conf.taskMasterId}___${conf.roomId}'`
        );
      }
    }

    const isConsistent = discrepancies.length === 0;

    return {
      isConsistent,
      canSafelyResumeOrRollback: isConsistent,
      discrepancies,
      stats: {
        totalTasks: tasks.length,
        totalIndexes: indexes.length,
        activeTasks,
        activeIndexes,
        archivedTasks,
        archivedIndexes
      }
    };
  }

  /**
   * Avalia estritamente se o rollback ou a retomada de escritas podem ser liberados.
   */
  static assertSafeRollbackRelease(
    tasks: FamilyTask[],
    indexes: RoutineIndexDoc[],
    conflicts: RoutineIndexConflictDoc[] = []
  ): void {
    const audit = this.auditConsistency(tasks, indexes, conflicts);
    if (!audit.canSafelyResumeOrRollback) {
      throw new Error(
        `[RoutineConsistencyChecker] Rollback/Retomada bloqueada por inconsistência estrutural: ${audit.discrepancies.join('; ')}`
      );
    }
  }

  /**
   * AUD-HF3-04: Carrega estado de consistência EXCLUSIVAMENTE do servidor Firestore.
   * Zero fallback para cache (getDoc / getDocs proibidos). Aborta em erro de rede, timeout ou resposta em cache.
   */
  static async fetchServerConsistencyState(
    db: Firestore,
    familyId: string
  ): Promise<{
    consistencyVersion: number;
    auditStateHash: string;
    routineSuspended: boolean;
    tasks: FamilyTask[];
    indexes: RoutineIndexDoc[];
    conflicts: RoutineIndexConflictDoc[];
  }> {
    const famDocRef = doc(db, 'families', familyId);
    const [famSnap, ftSnap, idxSnap, confSnap] = await Promise.all([
      getDocFromServer(famDocRef),
      getDocsFromServer(collection(db, 'families', familyId, 'familyTasks')),
      getDocsFromServer(collection(db, 'families', familyId, 'routineIndex')),
      getDocsFromServer(collection(db, 'families', familyId, 'routineIndexConflicts'))
    ]);

    if (
      famSnap.metadata.fromCache ||
      ftSnap.metadata.fromCache ||
      idxSnap.metadata.fromCache ||
      confSnap.metadata.fromCache
    ) {
      throw new Error(
        '[RoutineConsistencyChecker] AUD-HF3-04: Resposta proveniente de cache local rejeitada. Auditoria exige dados confirmados pelo servidor.'
      );
    }

    if (!famSnap.exists()) {
      throw new Error(`[RoutineConsistencyChecker] Família '${familyId}' não encontrada no servidor.`);
    }

    const famData = famSnap.data() as Record<string, any>;
    const consistencyVersion =
      typeof famData.consistencyVersion === 'number' ? famData.consistencyVersion : 1;
    const routineSuspended =
      famData.routineSuspended === true || famData.routinesSuspended === true;

    const tasksWithId = ftSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const indexesWithId = idxSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const conflictsWithId = confSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    const auditStateHash = await this.computeAuditStateHash(
      tasksWithId,
      indexesWithId,
      conflictsWithId
    );

    const tasks: FamilyTask[] = tasksWithId as FamilyTask[];
    const indexes: RoutineIndexDoc[] = idxSnap.docs.map(d => d.data() as RoutineIndexDoc);
    const conflicts: RoutineIndexConflictDoc[] = confSnap.docs.map(
      d => d.data() as RoutineIndexConflictDoc
    );

    return {
      consistencyVersion,
      auditStateHash,
      routineSuspended,
      tasks,
      indexes,
      conflicts
    };
  }

  /**
   * AUD-HF3-03 / AUD-HF3-HF2-02:
   * Delega ações de reconciliação estrutural sob suspensão exclusivamente para a autoridade confiável
   * de servidor (Admin SDK), garantindo que `consistencyVersion` nunca seja incrementado por clientes.
   */
  static async reconcileFamilyRoutinesWhileSuspended(
    _db: Firestore,
    familyId: string,
    actions: {
      indexesToArchive?: string[];
      indexesToCreateOrUpdate?: RoutineIndexDoc[];
      tasksToDeactivate?: string[];
    },
    options?: {
      serverReconciliationExecutor?: ServerReconciliationExecutor;
    }
  ): Promise<{ reconciledCount: number; newConsistencyVersion: number }> {
    const executor = options?.serverReconciliationExecutor || registeredServerReconciliationExecutor;
    if (!executor) {
      throw new Error(
        '[RoutineConsistencyChecker] Reconciliação bloqueada (AUD-HF3-HF2-02): autoridade confiável de servidor (Cloud Function / Admin SDK) não configurada. O cliente não possui permissão para alterar consistencyVersion.'
      );
    }

    return await executor({ familyId, actions });
  }

  /**
   * HF3-01 / HF3-02 / AUD-HF3-01..04 / AUD-HF3-HF2-01..02:
   * 1. Executa pré-auditoria estritamente contra o servidor Firestore (SEM cache fallback).
   * 2. Delega a auditoria autoritativa + emissão de AUDIT_PASSED + liberação para o backend confiável,
   *    enviando `expectedConsistencyVersion` e `expectedAuditStateHash`.
   * 3. NUNCA escreve AUDIT_PASSED, consistencyVersion ou routineSuspended=false diretamente pelo cliente.
   */
  static async executeSuspensionRelease(
    db: Firestore,
    familyId: string,
    performedByUid: string,
    options?: {
      serverReleaseExecutor?: ServerSuspensionReleaseExecutor;
    }
  ): Promise<{ success: boolean; auditId: string; audit: ConsistencyAuditResult }> {
    // 1. AUD-HF3-04: Consulta obrigatória ao servidor (ZERO fallback para cache)
    const serverState = await this.fetchServerConsistencyState(db, familyId);

    // 2. Pré-validação estrutural no servidor lido
    const audit = this.auditConsistency(
      serverState.tasks,
      serverState.indexes,
      serverState.conflicts
    );
    if (!audit.canSafelyResumeOrRollback) {
      throw new Error(
        `[RoutineConsistencyChecker] Liberação de suspensão rejeitada: foram encontradas ${audit.discrepancies.length} discrepâncias estruturais: ${audit.discrepancies.join('; ')}`
      );
    }

    // 3. AUD-HF3-01: Exige executor confiável no backend (Cloud Function / Firebase Admin SDK)
    const executor = options?.serverReleaseExecutor || registeredServerReleaseExecutor;
    if (!executor) {
      throw new Error(
        '[RoutineConsistencyChecker] Liberação bloqueada (AUD-HF3-01): autoridade confiável de servidor (Cloud Function / Admin SDK) não configurada. O cliente não possui permissão para emitir AUDIT_PASSED ou desativar routineSuspended.'
      );
    }

    const serverRes = await executor({
      familyId,
      performedByUid,
      expectedConsistencyVersion: serverState.consistencyVersion,
      expectedAuditStateHash: serverState.auditStateHash,
      preflightAudit: audit
    });

    if (!serverRes?.success || !serverRes?.auditId) {
      throw new Error(
        '[RoutineConsistencyChecker] Backend confiável rejeitou a liberação da suspensão.'
      );
    }

    return {
      success: true,
      auditId: serverRes.auditId,
      audit: serverRes.audit || audit
    };
  }
}

/**
 * PROCEDIMENTO OPERACIONAL DE RECUPERAÇÃO APÓS FALHAS / DIVERGÊNCIAS (RUNBOOK):
 *
 * 1. DIAGNÓSTICO:
 *    - Executar `RoutineConsistencyChecker.fetchServerConsistencyState(db, familyId)` e `auditConsistency(...)`.
 *    - Analisar os tipos de discrepâncias reportados:
 *      a) 'Índice órfão': O routineIndex aponta para um FamilyTask que foi excluído ou não existe.
 *         -> Ação: Arquivar o routineIndex órfão (`status: 'ARCHIVED'`).
 *      b) 'FamilyTask ativa desindexada': Uma rotina ativa existe sem routineIndex canônico.
 *         -> Ação: Criar o routineIndex canônico para (taskMasterId + roomId) apontando para o FamilyTask pré-existente.
 *      c) 'Divergência de status': FamilyTask.active != (routineIndex.status === 'ACTIVE').
 *         -> Ação: Sincronizar o status (desativar a FamilyTask se o índice estiver ARCHIVED, ou atualizar o índice para ACTIVE).
 *      d) 'Conflito de unicidade': Múltiplas FamilyTasks ativas para a mesma combinação.
 *         -> Ação: Preservar uma única rotina canônica e desativar duplicatas ou resolver conflito pendente.
 *
 * 2. RECONCILIAÇÃO:
 *    - Aplicar `reconcileFamilyRoutinesWhileSuspended` enquanto a família permanece em `routineSuspended: true`.
 *    - Nenhuma criação, exclusão ou mutação arbitrária é permitida durante a suspensão.
 *    - Cada reconciliação incrementa `consistencyVersion`, invalidando auditorias anteriores concorrentes.
 *
 * 3. VALIDAÇÃO E LIBERAÇÃO:
 *    - Executar `RoutineConsistencyChecker.executeSuspensionRelease(db, familyId, adminUid)` conectado ao backend confiável (`SuspensionReleaseService` / Cloud Function `releaseFamilyRoutineSuspension`).
 *    - O servidor verifica o token e o papel ADMIN ativo, re-audita as coleções dentro de `adminDb.runTransaction` e emite `AUDIT_PASSED` + `routineSuspended: false` atomicamente.
 */
