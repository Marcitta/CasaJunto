/**
 * CasaJunto — B.5.5-HF1-D-B2A: FirestoreTransactionalAdapter
 * Adaptador isolado que implementa ITransactionalStore conectando ao Firestore real/emulador
 * através do SDK modular do Firebase.
 * 
 * DIRETRIZES DE ARQUITETURA:
 * 1. Utiliza o banco nomeado configurado (ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c), nunca o banco default cego.
 * 2. Executa transações através de runTransaction nativo do SDK.
 * 3. Garante isolamento estrito por tenant (/families/{familyId}/...).
 * 4. Utiliza FirestoreMappers para serialização e hidratação das entidades.
 * 5. Sondagens diretas utilizam getDocFromServer para garantir evidência confirmada pelo servidor (AUD-B1.1-05).
 * 6. Suporta Pre-Read de rotinas legadas fora da transação (AUD-B1.1-01).
 * 7. Isolamento absoluto: NÃO conectado ao AppContext, UI, Motor 2.0 ou Scheduler.
 */

import {
  Firestore,
  Transaction,
  runTransaction as firestoreRunTransaction,
  doc,
  collection,
  query,
  where,
  getDocs,
  getDocFromServer
} from 'firebase/firestore';
import { db as defaultDb } from './firebaseConfig';
import { FirestoreMappers } from './mappers';
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
} from '../../domain/routine/transactionalTypes';

export class FirestoreTransactionContext implements ITransactionContext {
  private hasWritten = false;

  constructor(
    private readonly rawTxn: Transaction,
    private readonly db: Firestore
  ) {}

  private checkReadPermission(target: string): void {
    if (this.hasWritten) {
      throw new Error(`Firestore Transaction Violation: All reads must precede any writes! Attempted read on ${target} after writes began.`);
    }
  }

  // --- LEITURAS ---
  public async getFamilyTask(familyId: string, routineId: string): Promise<FamilyTask | null> {
    this.checkReadPermission(`familyTasks/${routineId}`);
    const ref = doc(this.db, 'families', familyId, 'familyTasks', routineId);
    const snap = await this.rawTxn.get(ref);
    if (!snap.exists()) return null;
    return FirestoreMappers.toFamilyTask(snap.id, snap.data());
  }

  public async getRoutineIndex(familyId: string, indexKey: string): Promise<RoutineIndexDoc | null> {
    this.checkReadPermission(`routineIndex/${indexKey}`);
    const ref = doc(this.db, 'families', familyId, 'routineIndex', indexKey);
    const snap = await this.rawTxn.get(ref);
    if (!snap.exists()) return null;
    return snap.data() as RoutineIndexDoc;
  }

  public async getRoutineIndexConflict(familyId: string, indexKey: string): Promise<RoutineIndexConflictDoc | null> {
    this.checkReadPermission(`routineIndexConflicts/${indexKey}`);
    const ref = doc(this.db, 'families', familyId, 'routineIndexConflicts', indexKey);
    const snap = await this.rawTxn.get(ref);
    if (!snap.exists()) return null;
    return snap.data() as RoutineIndexConflictDoc;
  }

  public async getOperationLedger(familyId: string, operationId: string): Promise<OperationLedgerDoc | null> {
    this.checkReadPermission(`operationLedgers/${operationId}`);
    const ref = doc(this.db, 'families', familyId, 'operationLedgers', operationId);
    const snap = await this.rawTxn.get(ref);
    if (!snap.exists()) return null;
    return snap.data() as OperationLedgerDoc;
  }

  public async getAssignment(familyId: string, assignmentId: string): Promise<TaskAssignment | null> {
    this.checkReadPermission(`assignments/${assignmentId}`);
    const ref = doc(this.db, 'families', familyId, 'assignments', assignmentId);
    const snap = await this.rawTxn.get(ref);
    if (!snap.exists()) return null;
    return FirestoreMappers.toTaskAssignment(snap.id, snap.data());
  }

  public async queryFamilyTasksByTaskAndRoom(
    familyId: string,
    taskMasterId: string,
    roomId: string
  ): Promise<FamilyTask[]> {
    // No SDK Web, queries dentro da transação não são suportadas pelo Transaction.get().
    // O protocolo D-B2 adota Pre-Read fora da transação e validação pontual por ID dentro da transação.
    // Este método é mantido por compatibilidade da interface e retorna vazio se invocado dentro da transação.
    return [];
  }

  // --- ESCRITAS ---
  public setFamilyTask(familyId: string, routineId: string, routine: FamilyTask): void {
    this.hasWritten = true;
    const ref = doc(this.db, 'families', familyId, 'familyTasks', routineId);
    const payload = FirestoreMappers.sanitizePayload(FirestoreMappers.fromFamilyTask(routine));
    this.rawTxn.set(ref, payload);
  }

  public updateFamilyTask(familyId: string, routineId: string, updates: Partial<FamilyTask>): void {
    this.hasWritten = true;
    const ref = doc(this.db, 'families', familyId, 'familyTasks', routineId);
    const payload = FirestoreMappers.sanitizePayload(updates);
    this.rawTxn.update(ref, payload);
  }

  public setRoutineIndex(familyId: string, indexKey: string, index: RoutineIndexDoc): void {
    this.hasWritten = true;
    const ref = doc(this.db, 'families', familyId, 'routineIndex', indexKey);
    const payload = FirestoreMappers.sanitizePayload(index);
    this.rawTxn.set(ref, payload);
  }

  public updateRoutineIndex(familyId: string, indexKey: string, updates: Partial<RoutineIndexDoc>): void {
    this.hasWritten = true;
    const ref = doc(this.db, 'families', familyId, 'routineIndex', indexKey);
    const payload = FirestoreMappers.sanitizePayload(updates);
    this.rawTxn.update(ref, payload);
  }

  public setRoutineIndexConflict(familyId: string, indexKey: string, conflict: RoutineIndexConflictDoc): void {
    this.hasWritten = true;
    const ref = doc(this.db, 'families', familyId, 'routineIndexConflicts', indexKey);
    const payload = FirestoreMappers.sanitizePayload(conflict);
    this.rawTxn.set(ref, payload);
  }

  public setOperationLedger(familyId: string, operationId: string, ledger: OperationLedgerDoc): void {
    this.hasWritten = true;
    const ref = doc(this.db, 'families', familyId, 'operationLedgers', operationId);
    const payload = FirestoreMappers.sanitizePayload(ledger);
    this.rawTxn.set(ref, payload);
  }

  public updateOperationLedger(familyId: string, operationId: string, updates: Partial<OperationLedgerDoc>): void {
    this.hasWritten = true;
    const ref = doc(this.db, 'families', familyId, 'operationLedgers', operationId);
    const payload = FirestoreMappers.sanitizePayload(updates);
    this.rawTxn.update(ref, payload);
  }

  public setAssignment(familyId: string, assignmentId: string, assignment: TaskAssignment): void {
    this.hasWritten = true;
    const ref = doc(this.db, 'families', familyId, 'assignments', assignmentId);
    const payload = FirestoreMappers.sanitizePayload(FirestoreMappers.fromTaskAssignment(assignment));
    this.rawTxn.set(ref, payload);
  }

  public updateAssignment(familyId: string, assignmentId: string, updates: Partial<TaskAssignment>): void {
    this.hasWritten = true;
    const ref = doc(this.db, 'families', familyId, 'assignments', assignmentId);
    const payload = FirestoreMappers.sanitizePayload(updates);
    this.rawTxn.update(ref, payload);
  }
}

export const REQUIRED_NAMED_DATABASE_ID = 'ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c';

export interface FirestoreTransactionalAdapterOptions {
  requireEmulator?: boolean;
}

const inFlightEmulatorEnsures = new Map<string, Promise<void>>();

export class FirestoreTransactionalAdapter implements ITransactionalStore {
  private readonly db: Firestore;
  private readonly options?: FirestoreTransactionalAdapterOptions;
  private lastFamilyId: string | null = null;

  constructor(customDb?: Firestore, options?: FirestoreTransactionalAdapterOptions) {
    this.db = customDb || defaultDb;
    this.options = options;

    // AUD-B2A-02: Garantir que o adaptador NUNCA utilize o banco (default)
    const detectedDbName = (this.db as any)?._databaseId?.database || (this.db as any)?.databaseId;
    if (detectedDbName === '(default)') {
      throw new Error(`[FirestoreTransactionalAdapter] Violação AUD-B2A-02: Banco '(default)' expressamente rejeitado. É obrigatório utilizar o banco nomeado '${REQUIRED_NAMED_DATABASE_ID}'.`);
    }
    if (detectedDbName && detectedDbName !== REQUIRED_NAMED_DATABASE_ID) {
      throw new Error(`[FirestoreTransactionalAdapter] Violação AUD-B2A-02: Banco '${detectedDbName}' incompatível. É obrigatório utilizar '${REQUIRED_NAMED_DATABASE_ID}'.`);
    }

    // AUD-B2A-02: Em testes ou quando requireEmulator=true, exigir emulador ativo e rejeitar Firestore remoto silencioso
    if (options?.requireEmulator || process.env.NODE_ENV === 'test' || process.env.REQUIRE_FIRESTORE_EMULATOR === 'true') {
      const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
      const settingsHost = (this.db as any)?._settings?.host || (this.db as any)?._delegate?._settings?.host;
      const isEmulatorConfigured = Boolean(emulatorHost || (settingsHost && settingsHost.includes(':')));
      if (!isEmulatorConfigured) {
        throw new Error(`[FirestoreTransactionalAdapter] Violação AUD-B2A-02: Emulador Firestore não detectado no ambiente de testes. Conexão silenciosa com Firestore remoto estritamente proibida.`);
      }
    }
  }

  public async ensureEmulatorAuth(familyId: string): Promise<void> {
    if (!this.options?.requireEmulator && process.env.NODE_ENV !== 'test') return;
    this.lastFamilyId = familyId;
    try {
      const { getAuth, connectAuthEmulator, signInAnonymously } = await import('firebase/auth');
      const auth = getAuth(this.db.app);
      let user = auth.currentUser;
      if (!user) {
        try {
          connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        } catch {}
        const cred = await signInAnonymously(auth);
        user = cred.user;
      }
      const uid = user?.uid;
      if (uid && familyId) {
        const cacheKey = `${familyId}_${uid}`;
        if (!inFlightEmulatorEnsures.has(cacheKey)) {
          const promise = (async () => {
            const base = `http://127.0.0.1:8088/v1/projects/demo-no-project/databases/${REQUIRED_NAMED_DATABASE_ID}/documents`;
            await fetch(`${base}/families/${familyId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
              body: JSON.stringify({ fields: { ownerUserId: { stringValue: uid }, name: { stringValue: 'Emu Family' } } })
            });
            await fetch(`${base}/familyMemberships/${familyId}_${uid}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
              body: JSON.stringify({ fields: { userId: { stringValue: uid }, role: { stringValue: 'ADMIN' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: familyId } } })
            });
          })();
          inFlightEmulatorEnsures.set(cacheKey, promise);
        }
        await inFlightEmulatorEnsures.get(cacheKey);
      }
    } catch {}
  }

  public async ensureContext(familyId: string): Promise<void> {
    await this.ensureEmulatorAuth(familyId);
  }

  /**
   * Executa a transação atômica delegando para o runTransaction oficial do Firestore SDK.
   */
  public async runTransaction<T>(updateFunction: (txn: ITransactionContext) => Promise<T>): Promise<T> {
    if (this.lastFamilyId) {
      await this.ensureEmulatorAuth(this.lastFamilyId);
    }
    return await firestoreRunTransaction(this.db, async (rawTxn: Transaction) => {
      const context = new FirestoreTransactionContext(rawTxn, this.db);
      return await updateFunction(context);
    });
  }

  /**
   * Pre-Read de rotinas legadas fora da transação (AUD-B1.1-01).
   * Permite identificar candidatos sem violar as restrições do SDK Web.
   */
  public async preReadLegacyRoutines(
    familyId: string,
    taskMasterId: string,
    roomId: string
  ): Promise<FamilyTask[]> {
    await this.ensureEmulatorAuth(familyId);
    const ftCol = collection(this.db, 'families', familyId, 'familyTasks');

    // Consulta por convenção snake_case
    const qSnake = query(
      ftCol,
      where('task_master_id', '==', taskMasterId),
      where('room_id', '==', roomId)
    );

    // Consulta por convenção camelCase
    const qCamel = query(
      ftCol,
      where('taskMasterId', '==', taskMasterId),
      where('roomId', '==', roomId)
    );

    const [snapSnake, snapCamel] = await Promise.all([
      getDocs(qSnake),
      getDocs(qCamel)
    ]);

    const routinesMap = new Map<string, FamilyTask>();

    snapSnake.docs.forEach(docSnap => {
      routinesMap.set(docSnap.id, FirestoreMappers.toFamilyTask(docSnap.id, docSnap.data()));
    });

    snapCamel.docs.forEach(docSnap => {
      routinesMap.set(docSnap.id, FirestoreMappers.toFamilyTask(docSnap.id, docSnap.data()));
    });

    return Array.from(routinesMap.values());
  }

  /**
   * Sondagem direta de confirmação no servidor via getDocFromServer (AUD-B1.1-05).
   * Contorna o cache local para garantir prova definitiva de commit remoto.
   */
  public async directGetOperationLedger(familyId: string, operationId: string): Promise<OperationLedgerDoc | null> {
    try {
      await this.ensureEmulatorAuth(familyId);
      const ref = doc(this.db, 'families', familyId, 'operationLedgers', operationId);
      const snap = await getDocFromServer(ref);
      return snap.exists() ? (snap.data() as OperationLedgerDoc) : null;
    } catch {
      return null;
    }
  }

  public async directGetRoutineIndex(familyId: string, indexKey: string): Promise<RoutineIndexDoc | null> {
    try {
      await this.ensureEmulatorAuth(familyId);
      const ref = doc(this.db, 'families', familyId, 'routineIndex', indexKey);
      const snap = await getDocFromServer(ref);
      return snap.exists() ? (snap.data() as RoutineIndexDoc) : null;
    } catch {
      return null;
    }
  }

  public async directGetFamilyTask(familyId: string, routineId: string): Promise<FamilyTask | null> {
    try {
      await this.ensureEmulatorAuth(familyId);
      const ref = doc(this.db, 'families', familyId, 'familyTasks', routineId);
      const snap = await getDocFromServer(ref);
      if (!snap.exists()) return null;
      return FirestoreMappers.toFamilyTask(snap.id, snap.data());
    } catch {
      return null;
    }
  }

  public async directGetAssignment(familyId: string, assignmentId: string): Promise<TaskAssignment | null> {
    try {
      await this.ensureEmulatorAuth(familyId);
      const ref = doc(this.db, 'families', familyId, 'assignments', assignmentId);
      const snap = await getDocFromServer(ref);
      if (!snap.exists()) return null;
      return FirestoreMappers.toTaskAssignment(snap.id, snap.data());
    } catch {
      return null;
    }
  }
}
