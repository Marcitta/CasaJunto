/**
 * CASA JUNTO — B.5.5-HF1-D-B2C-HF3-HF2
 * Serviço Confiável de Reconciliação, Auditoria e Liberação de Suspensão (Server-Side / Firebase Admin SDK)
 *
 * Hardening implementado:
 * - AUD-HF3-01: Emissão confiável de AUDIT_PASSED exclusivamente pelo servidor (nunca pelo cliente).
 * - AUD-HF3-02: Leitura transacional completa de familyTasks, routineIndex e routineIndexConflicts
 *               dentro do MESMO runTransaction da liberação, protegida por consistencyVersion e auditStateHash.
 * - AUD-HF3-04: Leitura direta autoritativa do servidor Firestore sem fallback para cache.
 * - AUD-HF3-HF2-01: Autorização estrita de ADMIN ativo (`role === 'ADMIN'`, `status === 'ACTIVE'`,
 *                   `active === undefined || active === true`, `familyId === familyId`, `userId === callerUid`),
 *                   sem fallback permissivo para campos ausentes ou estados desconhecidos.
 * - AUD-HF3-HF2-02: Controle exclusivo de `consistencyVersion` no servidor durante reconciliações
 *                   validadas e liberações de suspensão, aliado a `auditStateHash` para cobrir
 *                   mutações diretas em subcoleções auditadas.
 *
 * PROIBIDO:
 * - Confiar em campos fornecidos pelo cliente (status, totalDiscrepancies, performedBy, isReconciliation).
 * - Utilizar banco (default) — usar exclusivamente CASAJUNTO_FIRESTORE_DATABASE_ID.
 * - Tocar em Motor 2.0, Scheduler ou família Rua Juriti sem solicitação explícita.
 */

import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import { getAdminFirestore } from '../firebaseAdmin';

export interface ServerConsistencyAuditResult {
  isConsistent: boolean;
  canSafelyResumeOrRollback: boolean;
  discrepancies: string[];
  stats: {
    totalTasks: number;
    totalIndexes: number;
    totalConflicts: number;
    activeTasks: number;
    activeIndexes: number;
    archivedTasks: number;
    archivedIndexes: number;
  };
}

export interface ServerRoutineReleaseAuditRecord {
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
  auditStateHash?: string;
  serverVerified: true;
  createdAt: string;
}

export interface ServerSuspensionReleaseParams {
  firestoreDb?: Firestore;
  familyId: string;
  callerUid: string;
  expectedConsistencyVersion?: number;
  /** AUD-HF2.1-02: Digest SHA-256 obrigatório do estado pré-auditado (64 chars hex minúsculos). */
  expectedAuditStateHash: string;
  /** Hook determinístico exclusivo para testes de concorrência dentro da transação */
  onAfterReadsHook?: () => Promise<void>;
}

export interface ServerSuspensionReleaseResult {
  success: boolean;
  auditId: string;
  consistencyVersion: number;
  releasedConsistencyVersion: number;
  auditStateHash: string;
  audit: ServerConsistencyAuditResult;
}

export interface ServerReconciliationIndexInput {
  taskMasterId: string;
  roomId: string;
  canonicalRoutineId: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt?: string;
  updatedAt?: string;
  lastOperationId: string;
  lastOperationType?: string;
}

export interface ServerReconciliationActions {
  indexesToArchive?: string[];
  indexesToCreateOrUpdate?: ServerReconciliationIndexInput[];
  tasksToDeactivate?: string[];
}

export interface ServerReconciliationParams {
  firestoreDb?: Firestore;
  familyId: string;
  callerUid: string;
  actions: ServerReconciliationActions;
}

export interface ServerReconciliationResult {
  reconciledCount: number;
  previousConsistencyVersion: number;
  newConsistencyVersion: number;
}

function sanitizeKeyComponent(comp: string): string {
  if (!comp || typeof comp !== 'string') return 'unknown';
  return comp
    .trim()
    .replace(/%/g, '%25')
    .replace(/\//g, '%2F')
    .replace(/___/g, '%5F%5F%5F')
    .replace(/\s+/g, '_');
}

function buildRoutineIndexKey(taskMasterId: string, roomId: string): string {
  return `${sanitizeKeyComponent(taskMasterId)}___${sanitizeKeyComponent(roomId)}`;
}

export class SuspensionReleaseError extends Error {
  public readonly code:
    | 'UNAUTHENTICATED'
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'CONCURRENCY_CONFLICT'
    | 'AUDIT_FAILED'
    | 'FAILED_PRECONDITION'
    | 'INVALID_ARGUMENT';

  constructor(
    code:
      | 'UNAUTHENTICATED'
      | 'PERMISSION_DENIED'
      | 'NOT_FOUND'
      | 'CONCURRENCY_CONFLICT'
      | 'AUDIT_FAILED'
      | 'FAILED_PRECONDITION'
      | 'INVALID_ARGUMENT',
    message: string
  ) {
    super(message);
    this.name = 'SuspensionReleaseError';
    this.code = code;
  }
}

export class SuspensionReleaseService {
  /**
   * Calcula digest SHA-256 determinístico sobre todo o estado estrutural auditado
   * (familyTasks, routineIndex, routineIndexConflicts). Cobre qualquer mutação concorrente
   * que possa invalidar uma pré-auditoria, mesmo que consistencyVersion não tenha sido tocada.
   */
  public static computeAuditStateHash(
    tasks: Array<Record<string, any> & { id: string }>,
    indexes: Array<Record<string, any> & { id?: string }>,
    conflicts: Array<Record<string, any> & { id?: string }> = []
  ): string {
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

    return createHash('sha256').update(canonicalPayload).digest('hex');
  }

  /**
   * AUD-HF3-HF2-01: Validação estrita do contrato canônico de FamilyMembership no servidor.
   * Exige explicitamente:
   * - documento existente em familyMemberships/{familyId}_{callerUid}
   * - role === 'ADMIN'
   * - status === 'ACTIVE' (sem fallback para ausente, PENDING, INVITED, REVOKED, REMOVED ou desconhecido)
   * - active === undefined || active === true (bloqueia active: false ou valores inválidos)
   * - familyId === familyId solicitado e userId === callerUid autenticado
   */
  private static assertValidActiveAdminMembership(
    memSnap: { exists: boolean; data: () => Record<string, any> | undefined },
    familyId: string,
    callerUid: string
  ): void {
    if (!memSnap.exists) {
      throw new SuspensionReleaseError(
        'PERMISSION_DENIED',
        `Usuário '${callerUid}' não possui vínculo com a família '${familyId}'.`
      );
    }

    const memData = memSnap.data() || {};
    const hasAdminRole = memData.role === 'ADMIN';
    const hasActiveStatus = memData.status === 'ACTIVE';
    const isActiveFlagValid = memData.active === undefined || memData.active === true;
    const matchesFamily = memData.familyId === familyId;
    const matchesUser = memData.userId === callerUid;

    if (!hasAdminRole || !hasActiveStatus || !isActiveFlagValid || !matchesFamily || !matchesUser) {
      throw new SuspensionReleaseError(
        'PERMISSION_DENIED',
        `Acesso negado: vínculo inválido ou inativo para liberação/reconciliação (role=${String(memData.role)}, status=${String(memData.status)}, active=${String(memData.active)}, familyMatch=${matchesFamily}, userMatch=${matchesUser}).`
      );
    }
  }

  /**
   * AUD-HF2.1-02: Exige expectedAuditStateHash presente, não-vazio e em formato SHA-256 hex (64 caracteres).
   */
  private static assertValidExpectedAuditStateHash(hash: unknown): asserts hash is string {
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new SuspensionReleaseError(
        'INVALID_ARGUMENT',
        'expectedAuditStateHash obrigatório e deve ser um digest SHA-256 hexadecimal válido de 64 caracteres.'
      );
    }
  }

  /**
   * Executa auditoria estrutural completa no servidor sobre FamilyTasks, routineIndex e routineIndexConflicts.
   */
  public static auditConsistency(
    tasks: Array<Record<string, any> & { id: string }>,
    indexes: Array<Record<string, any> & { id?: string }>,
    conflicts: Array<Record<string, any> & { id?: string }> = []
  ): ServerConsistencyAuditResult {
    const discrepancies: string[] = [];
    const taskMap = new Map<string, Record<string, any> & { id: string }>();
    tasks.forEach(t => taskMap.set(t.id, t));

    const indexByKey = new Map<string, Record<string, any>>();
    for (const idx of indexes) {
      const key = buildRoutineIndexKey(String(idx.taskMasterId || ''), String(idx.roomId || ''));
      if (indexByKey.has(key)) {
        discrepancies.push(
          `Duplicidade de routineIndex para '${idx.taskMasterId}___${idx.roomId}'`
        );
      }
      indexByKey.set(key, idx);
    }

    let activeTasks = 0;
    let archivedTasks = 0;
    for (const t of tasks) {
      if (t.active === true) activeTasks++;
      else archivedTasks++;
    }

    let activeIndexes = 0;
    let archivedIndexes = 0;
    for (const idx of indexes) {
      if (idx.status === 'ACTIVE') activeIndexes++;
      else archivedIndexes++;
    }

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

      const tMasterId = task.taskMasterId || task.task_master_id;
      const tRoomId = task.roomId || task.room_id;

      if (tMasterId && tMasterId !== idx.taskMasterId) {
        discrepancies.push(
          `Divergência de taskMasterId para rotina '${task.id}': FamilyTask='${tMasterId}', routineIndex='${idx.taskMasterId}'`
        );
      }

      if (tRoomId && tRoomId !== idx.roomId) {
        discrepancies.push(
          `Divergência de roomId para rotina '${task.id}': FamilyTask='${tRoomId}', routineIndex='${idx.roomId}'`
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

    // 2. Validar FamilyTasks ativas com taskMasterId+roomId sem índice canônico ou duplicadas
    for (const task of tasks) {
      const tMasterId = task.taskMasterId || task.task_master_id;
      const tRoomId = task.roomId || task.room_id;

      if (task.active === true && tMasterId && tRoomId) {
        const key = buildRoutineIndexKey(tMasterId, tRoomId);
        const idx = indexByKey.get(key);
        if (!idx) {
          discrepancies.push(
            `FamilyTask ativa desindexada: '${task.id}' (${tMasterId} em ${tRoomId}) não possui routineIndex correspondente`
          );
        } else if (idx.canonicalRoutineId !== task.id) {
          discrepancies.push(
            `Conflito de unicidade: FamilyTask ativa '${task.id}' diverge da canonicalRoutineId '${idx.canonicalRoutineId}'`
          );
        }
      }
    }

    // 3. Validar conflitos administrativos pendentes
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
        totalConflicts: conflicts.length,
        activeTasks,
        activeIndexes,
        archivedTasks,
        archivedIndexes
      }
    };
  }

  private static async verifyCallerUidFromToken(auth: Auth, idToken: string): Promise<string> {
    if (!idToken || typeof idToken !== 'string' || idToken.trim() === '') {
      throw new SuspensionReleaseError('UNAUTHENTICATED', 'Token de autenticação ausente.');
    }

    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (err: any) {
      throw new SuspensionReleaseError(
        'UNAUTHENTICATED',
        `Token de autenticação inválido ou expirado: ${err?.message || 'verifyIdToken failed'}`
      );
    }

    if (!decoded?.uid) {
      throw new SuspensionReleaseError('UNAUTHENTICATED', 'UID ausente no token verificado.');
    }

    return decoded.uid;
  }

  /**
   * Verifica token Firebase ID no servidor e executa a liberação autoritativa da suspensão.
   * Nunca aceita UID ou status fornecidos pelo corpo da requisição sem verificação criptográfica do token.
   */
  public static async verifyIdTokenAndExecuteRelease(params: {
    auth: Auth;
    firestoreDb?: Firestore;
    idToken: string;
    familyId: string;
    expectedConsistencyVersion?: number;
    expectedAuditStateHash: string;
    onAfterReadsHook?: () => Promise<void>;
  }): Promise<ServerSuspensionReleaseResult> {
    const {
      auth,
      firestoreDb,
      idToken,
      familyId,
      expectedConsistencyVersion,
      expectedAuditStateHash,
      onAfterReadsHook
    } = params;

    const callerUid = await this.verifyCallerUidFromToken(auth, idToken);
    this.assertValidExpectedAuditStateHash(expectedAuditStateHash);

    return await this.executeServerSuspensionRelease({
      firestoreDb,
      familyId,
      callerUid,
      expectedConsistencyVersion,
      expectedAuditStateHash,
      onAfterReadsHook
    });
  }

  /**
   * Verifica token Firebase ID no servidor e executa reconciliação estrita sob suspensão,
   * incrementando `consistencyVersion` atomicamente exclusivamente no servidor (AUD-HF3-HF2-02).
   */
  public static async verifyIdTokenAndReconcile(params: {
    auth: Auth;
    firestoreDb?: Firestore;
    idToken: string;
    familyId: string;
    actions: ServerReconciliationActions;
  }): Promise<ServerReconciliationResult> {
    const { auth, firestoreDb, idToken, familyId, actions } = params;
    const callerUid = await this.verifyCallerUidFromToken(auth, idToken);

    return await this.executeServerReconciliation({
      firestoreDb,
      familyId,
      callerUid,
      actions
    });
  }

  /**
   * Executa reconciliação estrutural estritamente autorizada sob `routineSuspended=true`
   * e incrementa `consistencyVersion` atomicamente dentro da transação do Admin SDK (AUD-HF3-HF2-01, AUD-HF3-HF2-02).
   */
  public static async executeServerReconciliation(
    params: ServerReconciliationParams
  ): Promise<ServerReconciliationResult> {
    const {
      firestoreDb = getAdminFirestore(),
      familyId,
      callerUid,
      actions
    } = params;

    if (!familyId || typeof familyId !== 'string' || familyId.trim() === '') {
      throw new SuspensionReleaseError('INVALID_ARGUMENT', 'familyId inválido.');
    }
    if (!callerUid || typeof callerUid !== 'string' || callerUid.trim() === '') {
      throw new SuspensionReleaseError('UNAUTHENTICATED', 'callerUid autenticado é obrigatório.');
    }
    if (!actions || typeof actions !== 'object') {
      throw new SuspensionReleaseError('INVALID_ARGUMENT', 'Ações de reconciliação ausentes.');
    }

    const familyRef = firestoreDb.collection('families').doc(familyId);
    const membershipRef = firestoreDb.collection('familyMemberships').doc(`${familyId}_${callerUid}`);

    return await firestoreDb.runTransaction(async (txn) => {
      // ALL READS FIRST
      const [famSnap, memSnap, ftSnap, idxSnap] = await Promise.all([
        txn.get(familyRef),
        txn.get(membershipRef),
        txn.get(familyRef.collection('familyTasks')),
        txn.get(familyRef.collection('routineIndex'))
      ]);

      if (!famSnap.exists) {
        throw new SuspensionReleaseError('NOT_FOUND', `Família '${familyId}' não encontrada.`);
      }

      // AUD-HF3-HF2-01: Autorização estrita do ADMIN ativo
      this.assertValidActiveAdminMembership(memSnap, familyId, callerUid);

      const famData = famSnap.data() || {};
      if (famData.routineSuspended !== true && famData.routinesSuspended !== true) {
        throw new SuspensionReleaseError(
          'FAILED_PRECONDITION',
          'Reconciliação sob suspensão só é permitida com routineSuspended=true.'
        );
      }

      const taskMap = new Map<string, Record<string, any> & { id: string }>();
      for (const d of ftSnap.docs) {
        taskMap.set(d.id, { id: d.id, ...(d.data() as Record<string, any>) });
      }

      const indexMap = new Map<string, Record<string, any>>();
      for (const d of idxSnap.docs) {
        indexMap.set(d.id, d.data() as Record<string, any>);
      }

      const tasksBeingDeactivated = new Set<string>(actions.tasksToDeactivate || []);
      const nowIso = new Date().toISOString();

      const writesToApply: Array<() => void> = [];

      // 1. Validar e preparar desativação de tarefas divergentes (somente active: true -> false)
      for (const taskId of actions.tasksToDeactivate || []) {
        const existingTask = taskMap.get(taskId);
        if (!existingTask) {
          throw new SuspensionReleaseError(
            'NOT_FOUND',
            `Reconciliação rejeitada: FamilyTask '${taskId}' não encontrada.`
          );
        }
        if (existingTask.active !== true) {
          throw new SuspensionReleaseError(
            'FAILED_PRECONDITION',
            `Reconciliação rejeitada: FamilyTask '${taskId}' já está inativa.`
          );
        }
        const taskRef = familyRef.collection('familyTasks').doc(taskId);
        writesToApply.push(() => {
          txn.update(taskRef, { active: false, updatedAt: nowIso });
        });
      }

      // 2. Validar e preparar arquivamento de índices (somente para órfãos ou tarefas inativas/desativadas)
      for (const idxKey of actions.indexesToArchive || []) {
        const existingIdx = indexMap.get(idxKey);
        if (!existingIdx) {
          throw new SuspensionReleaseError(
            'NOT_FOUND',
            `Reconciliação rejeitada: routineIndex '${idxKey}' não encontrado.`
          );
        }
        const linkedTask = taskMap.get(String(existingIdx.canonicalRoutineId || ''));
        const isLinkedTaskActive =
          Boolean(linkedTask && linkedTask.active === true) &&
          !tasksBeingDeactivated.has(String(existingIdx.canonicalRoutineId || ''));
        if (isLinkedTaskActive) {
          throw new SuspensionReleaseError(
            'FAILED_PRECONDITION',
            `Reconciliação rejeitada: não é permitido arquivar routineIndex '${idxKey}' vinculado à FamilyTask ativa '${existingIdx.canonicalRoutineId}'.`
          );
        }
        if (existingIdx.status !== 'ARCHIVED') {
          const idxRef = familyRef.collection('routineIndex').doc(idxKey);
          writesToApply.push(() => {
            txn.update(idxRef, { status: 'ARCHIVED', updatedAt: nowIso });
          });
        }
      }

      // 3. Validar e preparar criação/atualização estrita de routineIndex para FamilyTask pré-existente
      for (const idxDoc of actions.indexesToCreateOrUpdate || []) {
        if (
          !idxDoc ||
          typeof idxDoc.taskMasterId !== 'string' ||
          typeof idxDoc.roomId !== 'string' ||
          typeof idxDoc.canonicalRoutineId !== 'string' ||
          typeof idxDoc.lastOperationId !== 'string' ||
          (idxDoc.status !== 'ACTIVE' && idxDoc.status !== 'ARCHIVED')
        ) {
          throw new SuspensionReleaseError(
            'INVALID_ARGUMENT',
            'Reconciliação rejeitada: payload inválido em indexesToCreateOrUpdate.'
          );
        }

        const linkedTask = taskMap.get(idxDoc.canonicalRoutineId);
        if (!linkedTask) {
          throw new SuspensionReleaseError(
            'NOT_FOUND',
            `Reconciliação rejeitada: FamilyTask '${idxDoc.canonicalRoutineId}' não existe para indexação.`
          );
        }

        const tMaster = linkedTask.taskMasterId || linkedTask.task_master_id;
        const tRoom = linkedTask.roomId || linkedTask.room_id;
        if ((tMaster && tMaster !== idxDoc.taskMasterId) || (tRoom && tRoom !== idxDoc.roomId)) {
          throw new SuspensionReleaseError(
            'INVALID_ARGUMENT',
            `Reconciliação rejeitada: taskMasterId/roomId divergentes da FamilyTask '${idxDoc.canonicalRoutineId}'.`
          );
        }

        const effectiveActive =
          linkedTask.active === true && !tasksBeingDeactivated.has(idxDoc.canonicalRoutineId);
        const expectedStatus = effectiveActive ? 'ACTIVE' : 'ARCHIVED';
        if (idxDoc.status !== expectedStatus) {
          throw new SuspensionReleaseError(
            'FAILED_PRECONDITION',
            `Reconciliação rejeitada: status '${idxDoc.status}' diverge do estado active=${effectiveActive} da FamilyTask '${idxDoc.canonicalRoutineId}'.`
          );
        }

        const key = buildRoutineIndexKey(idxDoc.taskMasterId, idxDoc.roomId);
        const idxRef = familyRef.collection('routineIndex').doc(key);
        const strictPayload: Record<string, any> = {
          taskMasterId: idxDoc.taskMasterId,
          roomId: idxDoc.roomId,
          canonicalRoutineId: idxDoc.canonicalRoutineId,
          status: idxDoc.status,
          createdAt: idxDoc.createdAt || nowIso,
          updatedAt: nowIso,
          lastOperationId: idxDoc.lastOperationId
        };
        if (idxDoc.lastOperationType) {
          strictPayload.lastOperationType = idxDoc.lastOperationType;
        }
        writesToApply.push(() => {
          txn.set(idxRef, strictPayload);
        });
      }

      if (writesToApply.length === 0) {
        throw new SuspensionReleaseError(
          'INVALID_ARGUMENT',
          'Reconciliação rejeitada: nenhuma mutação efetiva de reconciliação para aplicar (incremento isolado de consistencyVersion é proibido).'
        );
      }

      // ALL WRITES SECOND
      for (const applyWrite of writesToApply) {
        applyWrite();
      }

      const previousVersion =
        typeof famData.consistencyVersion === 'number' ? famData.consistencyVersion : 1;
      const newVersion = previousVersion + 1;

      txn.update(familyRef, {
        consistencyVersion: newVersion,
        lastReconciliationAt: nowIso
      });

      return {
        reconciledCount: writesToApply.length,
        previousConsistencyVersion: previousVersion,
        newConsistencyVersion: newVersion
      };
    });
  }

  /**
   * Executa verificação estrita de autorização (ADMIN ACTIVE), auditoria completa de coleções e liberação
   * dentro de UMA ÚNICA transação atômica do Firebase Admin SDK (AUD-HF3-01, AUD-HF3-02, AUD-HF3-04, AUD-HF3-HF2-01, AUD-HF3-HF2-02).
   */
  public static async executeServerSuspensionRelease(
    params: ServerSuspensionReleaseParams
  ): Promise<ServerSuspensionReleaseResult> {
    const {
      firestoreDb = getAdminFirestore(),
      familyId,
      callerUid,
      expectedConsistencyVersion,
      expectedAuditStateHash,
      onAfterReadsHook
    } = params;

    if (!familyId || typeof familyId !== 'string' || familyId.trim() === '') {
      throw new SuspensionReleaseError('INVALID_ARGUMENT', 'familyId inválido.');
    }
    if (!callerUid || typeof callerUid !== 'string' || callerUid.trim() === '') {
      throw new SuspensionReleaseError('UNAUTHENTICATED', 'callerUid autenticado é obrigatório.');
    }
    this.assertValidExpectedAuditStateHash(expectedAuditStateHash);

    const familyRef = firestoreDb.collection('families').doc(familyId);
    const membershipRef = firestoreDb.collection('familyMemberships').doc(`${familyId}_${callerUid}`);

    let failedAuditPayload: ServerRoutineReleaseAuditRecord | null = null;
    let failureError: SuspensionReleaseError | null = null;

    const txResult = await firestoreDb.runTransaction(async (txn) => {
      failedAuditPayload = null;
      failureError = null;

      // 1. Leituras transacionais autoritativas no servidor (ZERO cache, ZERO pré-leitura desconectada)
      const [famSnap, memSnap, ftSnap, idxSnap, confSnap] = await Promise.all([
        txn.get(familyRef),
        txn.get(membershipRef),
        txn.get(familyRef.collection('familyTasks')),
        txn.get(familyRef.collection('routineIndex')),
        txn.get(familyRef.collection('routineIndexConflicts'))
      ]);

      // 2. Verificar existência da família
      if (!famSnap.exists) {
        throw new SuspensionReleaseError('NOT_FOUND', `Família '${familyId}' não encontrada.`);
      }

      // 3. AUD-HF3-HF2-01: Autorização estrita no servidor — apenas ADMIN ACTIVE válido da família e UID correspondente
      this.assertValidActiveAdminMembership(memSnap, familyId, callerUid);

      const famData = famSnap.data() || {};
      const currentVersion =
        typeof famData.consistencyVersion === 'number' ? famData.consistencyVersion : 1;

      // 4. AUD-HF3-02 / AUD-HF3-HF2-02: Bloquear liberação se a versão de consistência mudou
      if (
        expectedConsistencyVersion !== undefined &&
        currentVersion !== expectedConsistencyVersion
      ) {
        throw new SuspensionReleaseError(
          'CONCURRENCY_CONFLICT',
          `Conflito de concorrência: consistencyVersion esperada=${expectedConsistencyVersion}, atual no servidor=${currentVersion}. Liberação abortada; reexecute a auditoria.`
        );
      }

      // Hook determinístico para testes de condição de corrida concorrente durante a transação
      if (onAfterReadsHook) {
        await onAfterReadsHook();
      }

      const tasks = ftSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const indexes = idxSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const conflicts = confSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

      // 5. AUD-HF3-HF2-02 / AUD-HF2.1-02: Verificar digest determinístico obrigatório das subcoleções auditadas
      const serverAuditStateHash = this.computeAuditStateHash(tasks, indexes, conflicts);
      if (serverAuditStateHash !== expectedAuditStateHash) {
        throw new SuspensionReleaseError(
          'CONCURRENCY_CONFLICT',
          'Conflito de concorrência: o estado de familyTasks/routineIndex/routineIndexConflicts foi alterado entre a pré-auditoria e a liberação.'
        );
      }

      // 6. Auditar integralmente os documentos lidos dentro da transação
      const audit = this.auditConsistency(tasks, indexes, conflicts);
      const nowIso = new Date().toISOString();
      const auditId = `audit_rel_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      if (!audit.canSafelyResumeOrRollback) {
        failedAuditPayload = {
          auditId,
          familyId,
          performedBy: callerUid,
          status: 'AUDIT_FAILED',
          totalDiscrepancies: audit.discrepancies.length,
          discrepancies: audit.discrepancies,
          auditedTasksCount: tasks.length,
          auditedIndexesCount: indexes.length,
          consistencyVersion: currentVersion,
          auditStateHash: serverAuditStateHash,
          serverVerified: true,
          createdAt: nowIso
        };
        failureError = new SuspensionReleaseError(
          'AUDIT_FAILED',
          `[SuspensionReleaseService] Liberação de suspensão rejeitada: foram encontradas ${audit.discrepancies.length} discrepâncias estruturais: ${audit.discrepancies.join('; ')}`
        );
        return null;
      }

      // 7. Emissão atômica de AUDIT_PASSED + liberação da suspensão + incremento de consistencyVersion
      const nextVersion = currentVersion + 1;
      const auditRecord: ServerRoutineReleaseAuditRecord = {
        auditId,
        familyId,
        performedBy: callerUid,
        status: 'AUDIT_PASSED',
        totalDiscrepancies: 0,
        discrepancies: [],
        auditedTasksCount: tasks.length,
        auditedIndexesCount: indexes.length,
        consistencyVersion: currentVersion,
        releasedConsistencyVersion: nextVersion,
        auditStateHash: serverAuditStateHash,
        serverVerified: true,
        createdAt: nowIso
      };

      const auditRef = familyRef.collection('routineReleaseAudits').doc(auditId);
      txn.create(auditRef, auditRecord);
      txn.update(familyRef, {
        routineSuspended: false,
        routinesSuspended: false,
        routineReleaseAuditId: auditId,
        routineReleaseAuditAt: nowIso,
        consistencyVersion: nextVersion
      });

      return {
        success: true,
        auditId,
        consistencyVersion: currentVersion,
        releasedConsistencyVersion: nextVersion,
        auditStateHash: serverAuditStateHash,
        audit
      };
    });

    if (failureError) {
      if (failedAuditPayload) {
        try {
          await familyRef
            .collection('routineReleaseAudits')
            .doc((failedAuditPayload as ServerRoutineReleaseAuditRecord).auditId)
            .create(failedAuditPayload);
        } catch {
          // Não mascarar o erro principal de auditoria
        }
      }
      throw failureError;
    }

    if (!txResult) {
      throw new SuspensionReleaseError(
        'AUDIT_FAILED',
        'Falha inesperada na transação de liberação da suspensão.'
      );
    }

    return txResult;
  }
}
