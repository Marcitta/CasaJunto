/**
 * CASA JUNTO — B.5.5-HF1-D-B2C-HF3-HF1
 * Serviço Confiável de Auditoria e Liberação de Suspensão (Server-Side / Firebase Admin SDK)
 *
 * Elimina as vulnerabilidades:
 * - AUD-HF3-01: Emissão confiável de AUDIT_PASSED exclusivamente pelo servidor (nunca pelo cliente).
 * - AUD-HF3-02: Leitura transacional completa de familyTasks, routineIndex e routineIndexConflicts
 *               dentro do MESMO runTransaction da liberação, protegida por consistencyVersion.
 * - AUD-HF3-04: Leitura direta autoritativa do servidor Firestore sem fallback para cache.
 *
 * PROIBIDO:
 * - Confiar em campos fornecidos pelo cliente (status, totalDiscrepancies, performedBy, isReconciliation).
 * - Utilizar banco (default) — usar exclusivamente CASAJUNTO_FIRESTORE_DATABASE_ID.
 * - Tocar em Motor 2.0, Scheduler ou família Rua Juriti sem solicitação explícita.
 */

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
  serverVerified: true;
  createdAt: string;
}

export interface ServerSuspensionReleaseParams {
  firestoreDb?: Firestore;
  familyId: string;
  callerUid: string;
  expectedConsistencyVersion?: number;
  /** Hook determinístico exclusivo para testes de concorrência dentro da transação */
  onAfterReadsHook?: () => Promise<void>;
}

export interface ServerSuspensionReleaseResult {
  success: boolean;
  auditId: string;
  consistencyVersion: number;
  releasedConsistencyVersion: number;
  audit: ServerConsistencyAuditResult;
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
    | 'INVALID_ARGUMENT';

  constructor(
    code:
      | 'UNAUTHENTICATED'
      | 'PERMISSION_DENIED'
      | 'NOT_FOUND'
      | 'CONCURRENCY_CONFLICT'
      | 'AUDIT_FAILED'
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
    onAfterReadsHook?: () => Promise<void>;
  }): Promise<ServerSuspensionReleaseResult> {
    const { auth, firestoreDb, idToken, familyId, expectedConsistencyVersion, onAfterReadsHook } = params;

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

    return await this.executeServerSuspensionRelease({
      firestoreDb,
      familyId,
      callerUid: decoded.uid,
      expectedConsistencyVersion,
      onAfterReadsHook
    });
  }

  /**
   * Executa verificação de autorização (ADMIN ativo), auditoria completa de coleções e liberação
   * dentro de UMA ÚNICA transação atômica do Firebase Admin SDK (AUD-HF3-01, AUD-HF3-02, AUD-HF3-04).
   */
  public static async executeServerSuspensionRelease(
    params: ServerSuspensionReleaseParams
  ): Promise<ServerSuspensionReleaseResult> {
    const {
      firestoreDb = getAdminFirestore(),
      familyId,
      callerUid,
      expectedConsistencyVersion,
      onAfterReadsHook
    } = params;

    if (!familyId || typeof familyId !== 'string' || familyId.trim() === '') {
      throw new SuspensionReleaseError('INVALID_ARGUMENT', 'familyId inválido.');
    }
    if (!callerUid || typeof callerUid !== 'string' || callerUid.trim() === '') {
      throw new SuspensionReleaseError('UNAUTHENTICATED', 'callerUid autenticado é obrigatório.');
    }

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

      // 3. Autorização estrita no servidor: apenas ADMIN ativo da família
      if (!memSnap.exists) {
        throw new SuspensionReleaseError(
          'PERMISSION_DENIED',
          `Usuário '${callerUid}' não possui vínculo com a família '${familyId}'.`
        );
      }
      const memData = memSnap.data() || {};
      if (memData.role !== 'ADMIN' || memData.status === 'REMOVED' || memData.active === false) {
        throw new SuspensionReleaseError(
          'PERMISSION_DENIED',
          `Apenas um ADMIN ativo da família pode solicitar a liberação da suspensão (role=${memData.role}, status=${memData.status}).`
        );
      }

      const famData = famSnap.data() || {};
      const currentVersion =
        typeof famData.consistencyVersion === 'number' ? famData.consistencyVersion : 1;

      // 4. AUD-HF3-02: Bloquear liberação se a versão de consistência mudou entre a pré-auditoria e a transação
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

      // 5. Auditar integralmente os documentos lidos dentro da transação
      const tasks = ftSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const indexes = idxSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));
      const conflicts = confSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }));

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
          serverVerified: true,
          createdAt: nowIso
        };
        failureError = new SuspensionReleaseError(
          'AUDIT_FAILED',
          `[SuspensionReleaseService] Liberação de suspensão rejeitada: foram encontradas ${audit.discrepancies.length} discrepâncias estruturais: ${audit.discrepancies.join('; ')}`
        );
        return null;
      }

      // 6. Emissão atômica de AUDIT_PASSED + liberação da suspensão + incremento de consistencyVersion
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
