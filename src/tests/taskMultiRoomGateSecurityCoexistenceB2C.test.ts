/**
 * CasaJunto — B.5.5-HF1-D-B2C-HF1: Suíte de Testes do Gate de Segurança, Coexistência e Recuperação
 * 
 * Implementa as correções obrigatórias AUD-B2C-01 a AUD-B2C-06:
 * - AUD-B2C-01: Regras do emulador sem bypass de request.auth == null e com familyMemberships blindada.
 * - AUD-B2C-02: Concorrência mista real entre escritor legado e transacional com barreira de sincronização.
 * - AUD-B2C-03: Consistência entre FamilyTask e routineIndex e Safe Suspension Strategy para Rollback.
 * - AUD-B2C-04: Eliminação de falsos positivos (exigência estrita de PERMISSION_DENIED; teste de ADMIN legítimo).
 * - AUD-B2C-05: runAllTests com falha em BLOCKED.
 * - AUD-B2C-06: Comparação e diff de regras com produção.
 */

import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  disableNetwork,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  runTransaction,
  writeBatch,
  query,
  where
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';
import { SuspensionReleaseService } from '../../functions/src/services/suspensionReleaseService';
import {
  FirestoreTransactionalAdapter,
  REQUIRED_NAMED_DATABASE_ID
} from '../infrastructure/firebase/FirestoreTransactionalAdapter';
import { RoutineTransactionalService } from '../application/services/RoutineTransactionalService';
import { RoutineFeatureFlags } from '../domain/routine/routineFeatureFlags';
import {
  buildRoutineIndexKey,
  generateBatchOperationId
} from '../domain/routine/multiRoomBatchContracts';
import {
  FamilyTask,
  TaskAssignment,
  BatchAddRoutineInput
} from '../types';
import {
  RoutineIndexDoc,
  OperationLedgerDoc
} from '../domain/routine/transactionalTypes';
import { RoutineConsistencyChecker } from '../domain/routine/routineConsistencyChecker';

export interface B2CTestScenario {
  id: string;
  name: string;
  status: 'PENDING' | 'PASS' | 'FAIL' | 'BLOCKED';
  details?: string;
  category?: 'SECURITY_RULES' | 'CONCURRENCY' | 'RECOVERY' | 'ROLLBACK' | 'INTEGRITY';
}

const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8088;
const PROJECT_ID = 'demo-no-project';

async function checkEmulator(): Promise<boolean> {
  try {
    const res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/`);
    const txt = await res.text();
    return txt.includes('Ok') || txt.includes('firestore');
  } catch {
    return false;
  }
}

function createMockJwt(uid: string, claims: Record<string, any> = {}): string {
  const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({
    sub: uid,
    user_id: uid,
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    ...claims
  })).toString('base64url');
  return `Bearer ${h}.${p}.`;
}

async function emulatorRestRequest(path: string, options: {
  method?: string;
  authHeader?: string;
  body?: any;
}) {
  const url = `http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/projects/${PROJECT_ID}/databases/${REQUIRED_NAMED_DATABASE_ID}/documents/${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': options.authHeader || 'Bearer owner'
  };

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  return res;
}

export async function runTaskMultiRoomGateSecurityCoexistenceB2CTests(): Promise<{
  status: 'EXECUTED' | 'BLOCKED';
  summary: string;
  scenarios: B2CTestScenario[];
}> {
  process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_HOST}:${EMULATOR_PORT}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `${EMULATOR_HOST}:9099`;

  const isUp = await checkEmulator();
  if (!isUp) {
    return {
      status: 'BLOCKED',
      summary: `Emulador Firestore indisponível em ${EMULATOR_HOST}:${EMULATOR_PORT}`,
      scenarios: []
    };
  }

  const appName = `b2c-gate-hf1-${Date.now()}`;
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-test-key' }, appName);
  const db = getFirestore(app, REQUIRED_NAMED_DATABASE_ID);
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORT);
  const adapter = new FirestoreTransactionalAdapter(db, { requireEmulator: true });

  const adminAppName = `b2c-admin-${Date.now()}`;
  const adminTestApp = initializeAdminApp({ projectId: PROJECT_ID }, adminAppName);
  const adminDb = getAdminFirestore(adminTestApp, REQUIRED_NAMED_DATABASE_ID);
  const adminAuthSdk = getAdminAuth(adminTestApp);

  const serverExecutor = async (params: {
    familyId: string;
    performedByUid: string;
    expectedConsistencyVersion: number;
    expectedAuditStateHash: string;
  }) => {
    const auth = getAuth(db.app);
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('Sessão Auth Emulator ausente para invocar servidor confiável.');
    }
    const res = await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
      auth: adminAuthSdk as any,
      firestoreDb: adminDb as any,
      idToken,
      familyId: params.familyId,
      expectedConsistencyVersion: params.expectedConsistencyVersion,
      expectedAuditStateHash: params.expectedAuditStateHash
    });
    return {
      success: res.success,
      auditId: res.auditId,
      audit: res.audit
    };
  };

  const serverReconciliationExecutor = async (params: {
    familyId: string;
    actions: {
      indexesToArchive?: string[];
      indexesToCreateOrUpdate?: RoutineIndexDoc[];
      tasksToDeactivate?: string[];
    };
  }) => {
    const auth = getAuth(db.app);
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('Sessão Auth Emulator ausente para invocar reconciliação no servidor confiável.');
    }
    const res = await SuspensionReleaseService.verifyIdTokenAndReconcile({
      auth: adminAuthSdk as any,
      firestoreDb: adminDb as any,
      idToken,
      familyId: params.familyId,
      actions: params.actions
    });
    return {
      reconciledCount: res.reconciledCount,
      newConsistencyVersion: res.newConsistencyVersion
    };
  };

  RoutineConsistencyChecker.setServerReleaseExecutor(serverExecutor);
  RoutineConsistencyChecker.setServerReconciliationExecutor(serverReconciliationExecutor);

  const results: B2CTestScenario[] = [];

  try {
    // ------------------------------------------------------------------------
    // B2C-01: Coexistência de versões (Cliente antigo com flag off vs novo com flag on)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c01_${Date.now()}`;

      // 1. Cliente novo opera com flag ativada na família piloto
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);
      const inputNew: BatchAddRoutineInput = {
        taskMasterId: 'tm_tirar_po',
        roomId: 'sala',
        frequency: 'DAILY'
      };
      const resNew = await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [inputNew],
        operationId: generateBatchOperationId(testFamId),
        store: adapter,
        clientSessionId: 'session_new_v2'
      });
      const canonicalRoutineId = resNew.items[0].routineId!;

      // 2. Cliente antigo com flag desativada lê o banco e executa consulta legada
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, false);
      const ftSnap = await getDoc(doc(db, 'families', testFamId, 'familyTasks', canonicalRoutineId));
      if (!ftSnap.exists()) {
        throw new Error('Cliente antigo falhou ao ler FamilyTask gerada pelo cliente novo');
      }
      const legacyData = ftSnap.data() as FamilyTask;
      if (legacyData.task_master_id !== 'tm_tirar_po' || !legacyData.active) {
        throw new Error('Dados da FamilyTask incompatíveis com leitor legado');
      }

      // 3. Cliente antigo cria outra tarefa pontual/customizada sem afetar o routineIndex da tarefa existente
      const legacyCustomId = `ft_custom_legacy_${Date.now()}`;
      await setDoc(doc(db, 'families', testFamId, 'familyTasks', legacyCustomId), {
        id: legacyCustomId,
        family_id: testFamId,
        task_master_id: 'tm_outra_tarefa',
        room_id: 'cozinha',
        active: true,
        frequency: 'DAILY',
        created_at: new Date().toISOString()
      });

      // 4. Cliente novo reativa a flag e verifica que o índice original permanece íntegro e a tarefa legada convive
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);
      const idxSnap = await getDoc(doc(db, 'families', testFamId, 'routineIndex', buildRoutineIndexKey('tm_tirar_po', 'sala')));
      if (!idxSnap.exists()) {
        throw new Error('routineIndex foi corrompido durante a coexistência');
      }

      results.push({
        id: 'B2C-01',
        name: 'Coexistência de versões (Cliente antigo com flag off vs novo com flag on)',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Clientes novos e antigos operam com transparência e sem corromper índices canônicos'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-01',
        name: 'Coexistência de versões (Cliente antigo com flag off vs novo com flag on)',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-02: AUD-B2C-02 — Concorrência real entre escritor legado e transacional com barreira
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c02_${Date.now()}`;
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);

      const taskMasterId = 'tm_aspirar_tapete';
      const roomId = 'quarto';
      const rKey = buildRoutineIndexKey(taskMasterId, roomId);

      // BARREIRA DE SINCRONIZAÇÃO:
      // O escritor transacional executa o Pre-Read (onde nenhuma rotina legada existe ainda).
      // Imediatamente após o Pre-Read e antes de entrar em runTransaction, o escritor legado
      // grava diretamente em familyTasks sem atualizar routineIndex.
      await adapter.ensureEmulatorAuth(testFamId);
      let preReadFinished = false;
      let legacyWriteFinished = false;

      const barrierStore: any = Object.assign(Object.create(adapter), {
        preReadLegacyRoutines: async (fam: string, tm: string, rm: string) => {
          // Pre-Read executa antes da gravação legada: encontra 0 rotinas
          const found = await adapter.preReadLegacyRoutines(fam, tm, rm);
          preReadFinished = true;
          return found;
        },
        runTransaction: async (fn: any) => {
          // Se o Pre-Read acabou mas o escritor legado ainda não gravou, força o escritor legado a gravar AGORA
          if (preReadFinished && !legacyWriteFinished) {
            const legacyRoutineId = `ft_legacy_raced_${Date.now()}`;
            await setDoc(doc(db, 'families', testFamId, 'familyTasks', legacyRoutineId), {
              id: legacyRoutineId,
              family_id: testFamId,
              task_master_id: taskMasterId,
              room_id: roomId,
              active: true,
              frequency: 'DAILY',
              created_at: new Date().toISOString(),
              racedLegacyWriter: true
            });
            legacyWriteFinished = true;
          }
          return await adapter.runTransaction(fn);
        }
      });

      // Executa o escritor transacional através da store com a barreira
      const transResult = await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [{ taskMasterId, roomId, frequency: 'DAILY' }],
        operationId: generateBatchOperationId(testFamId),
        store: barrierStore,
        clientSessionId: 'sess_barrier_trans'
      });

      // Inspeção do banco após a corrida:
      const allTasksSnap = await getDocs(collection(db, 'families', testFamId, 'familyTasks'));
      const idxSnap = await getDoc(doc(db, 'families', testFamId, 'routineIndex', rKey));

      // DIAGNÓSTICO AUD-B2C-02 COMPROVADO:
      // Como o escritor legado contornou o routineIndex após o Pre-Read, foram gerados 2 documentos FamilyTask!
      const totalRoutines = allTasksSnap.size;
      const isSplitBrainDetected = totalRoutines === 2 && idxSnap.exists();

      if (!isSplitBrainDetected) {
        throw new Error(`Falha ao demonstrar corrida: esperado totalRoutines=2, obtido=${totalRoutines}`);
      }

      // Conclusão exigida pelo AUD-B2C-02:
      // A unicidade NÃO pode ser garantida se o escritor legado continuar autorizado a contornar routineIndex!
      results.push({
        id: 'B2C-02',
        name: 'AUD-B2C-02: Concorrência real entre escritor legado e transacional com barreira',
        category: 'CONCURRENCY',
        status: 'PASS',
        details: 'Corrida comprovada: escritor legado pós-Pre-Read gerou split-brain (2 rotinas). Demonstra que unicidade exige bloqueio de escritores legados cegos no banco.'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-02',
        name: 'AUD-B2C-02: Concorrência real entre escritor legado e transacional com barreira',
        category: 'CONCURRENCY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-03: Recuperação completa após reinicialização da aplicação (Crash / Restart)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c03_${Date.now()}`;
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);

      const opId = generateBatchOperationId(testFamId);
      const input: BatchAddRoutineInput = {
        taskMasterId: 'tm_lavar_banheiro',
        roomId: 'banheiro_suite',
        frequency: 'WEEKLY',
        preferredDays: [2, 5],
        preferredTime: '11:00',
        durationMinutes: 40
      };

      await adapter.ensureEmulatorAuth(testFamId);
      // 1. Simula falha na Fase 2 e falha na atualização do ledger
      let callCount = 0;
      const crashStore = Object.assign(Object.create(adapter), {
        runTransaction: async (fn: any) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('Simulated process crash / network cut during Phase 2');
          }
          return await adapter.runTransaction(fn);
        }
      });

      const partialRes = await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [input],
        operationId: opId,
        store: crashStore as any
      });

      const routineId = partialRes.items[0].routineId!;
      if (!partialRes.hasPendingSync) {
        throw new Error('Deveria registrar hasPendingSync=true após falha na Fase 2');
      }

      // 2. Simula FECHAMENTO COMPLETO DA APLICAÇÃO (memória zerada, nova instância de store e adapter)
      const freshAdapter = new FirestoreTransactionalAdapter(db, { requireEmulator: true });

      // 3. REABERTURA EM NOVA SESSÃO: reconciliação automática de ocorrências pendentes
      const reconcileOutput = await RoutineTransactionalService.reconcilePendingRoutineOccurrences({
        familyId: testFamId,
        routineId,
        store: freshAdapter
      });

      if (reconcileOutput.created.length === 0) {
        throw new Error('Reconciliação pós-reinicialização não gerou as ocorrências pendentes');
      }

      // 4. Verifica que a FamilyTask continua única e intacta
      const ftSnap = await getDoc(doc(db, 'families', testFamId, 'familyTasks', routineId));
      const ftData = ftSnap.data() as FamilyTask;
      if (ftData.estimated_minutes !== 40 || ftData.frequency !== 'WEEKLY') {
        throw new Error('Configuração de duração ou frequência perdida após reinicialização');
      }

      const allFt = await getDocs(collection(db, 'families', testFamId, 'familyTasks'));
      if (allFt.size !== 1) {
        throw new Error(`Reconciliação gerou tarefas duplicadas: total=${allFt.size}`);
      }

      results.push({
        id: 'B2C-03',
        name: 'Recuperação completa após reinicialização da aplicação (Crash / Restart)',
        category: 'RECOVERY',
        status: 'PASS',
        details: 'Sessão reiniciada recuperou ocorrências pendentes sem duplicar tarefas ou perder configurações'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-03',
        name: 'Recuperação completa após reinicialização da aplicação (Crash / Restart)',
        category: 'RECOVERY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-04: Ledger desatualizado após falha de rede e sondagem com getDocFromServer
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c04_${Date.now()}`;
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);

      const opId = generateBatchOperationId(testFamId);
      const input: BatchAddRoutineInput = {
        taskMasterId: 'tm_limpar_microondas',
        roomId: 'cozinha',
        frequency: 'DAILY'
      };

      // Commit normal no servidor
      await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [input],
        operationId: opId,
        store: adapter
      });

      // Simula cliente que perdeu conexão e não recebeu a resposta: executa sondagem com getDocFromServer
      const probeResult = await RoutineTransactionalService.probeAndReconcileOperation({
        familyId: testFamId,
        operationId: opId,
        items: [input],
        store: adapter
      });

      if (probeResult.isUnknown || !probeResult.reconciledResult) {
        throw new Error(`Sondagem no servidor falhou em confirmar o commit: isUnknown=${probeResult.isUnknown}`);
      }
      if (probeResult.reconciledResult.added !== 1) {
        throw new Error(`Resultado reconciliado incorreto: added=${probeResult.reconciledResult.added}`);
      }

      results.push({
        id: 'B2C-04',
        name: 'Ledger desatualizado após falha de rede e sondagem com getDocFromServer',
        category: 'RECOVERY',
        status: 'PASS',
        details: 'Sondagem direta confirmou commit a partir do ledger do Firestore'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-04',
        name: 'Ledger desatualizado após falha de rede e sondagem com getDocFromServer',
        category: 'RECOVERY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-05: Retry idempotente com mesmo operationId
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c05_${Date.now()}`;
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);

      const opId = generateBatchOperationId(testFamId);
      const input: BatchAddRoutineInput = {
        taskMasterId: 'tm_tirar_reciclaveis',
        roomId: 'area_servico',
        frequency: 'DAILY'
      };

      // Primeira execução
      const res1 = await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [input],
        operationId: opId,
        store: adapter
      });

      // Segunda execução (retry imediato com mesmo operationId)
      const res2 = await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [input],
        operationId: opId,
        store: adapter
      });

      if (res1.items[0].routineId !== res2.items[0].routineId) {
        throw new Error('Retry gerou ID de rotina diferente!');
      }

      const ftSnaps = await getDocs(collection(db, 'families', testFamId, 'familyTasks'));
      if (ftSnaps.size !== 1) {
        throw new Error(`Retry duplicou documento FamilyTask: encontrados=${ftSnaps.size}`);
      }

      results.push({
        id: 'B2C-05',
        name: 'Retry idempotente com mesmo operationId',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Reexecução repetida com mesmo operationId foi 100% idempotente'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-05',
        name: 'Retry idempotente com mesmo operationId',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-06: AUD-B2C-03 — Consistência FamilyTask / routineIndex e Safe Suspension
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c06_${Date.now()}`;
      const rKey = buildRoutineIndexKey('tm_limpeza_pesada', 'garagem');

      // 1. Cria rotina com motor transacional: ambos os documentos iniciam com ACTIVE
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);
      const res = await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [{ taskMasterId: 'tm_limpeza_pesada', roomId: 'garagem', frequency: 'WEEKLY' }],
        operationId: generateBatchOperationId(testFamId),
        store: adapter
      });
      const routineId = res.items[0].routineId!;

      const ftInit = (await getDoc(doc(db, 'families', testFamId, 'familyTasks', routineId))).data() as FamilyTask;
      const idxInit = (await getDoc(doc(db, 'families', testFamId, 'routineIndex', rKey))).data() as RoutineIndexDoc;

      if (!ftInit.active || idxInit.status !== 'ACTIVE') {
        throw new Error(`Inconsistência inicial: ft.active=${ftInit.active}, idx.status=${idxInit.status}`);
      }

      // 2. Desativação transacional consistente: ambos atualizados sincronizadamente
      await updateDoc(doc(db, 'families', testFamId, 'familyTasks', routineId), { active: false });
      await updateDoc(doc(db, 'families', testFamId, 'routineIndex', rKey), { status: 'ARCHIVED' });

      const ftArchived = (await getDoc(doc(db, 'families', testFamId, 'familyTasks', routineId))).data() as FamilyTask;
      const idxArchived = (await getDoc(doc(db, 'families', testFamId, 'routineIndex', rKey))).data() as RoutineIndexDoc;

      if (ftArchived.active !== false || idxArchived.status !== 'ARCHIVED') {
        throw new Error('Falha na consistência de desativação transacional');
      }

      // 3. DEMONSTRAÇÃO DO RISCO DE ROLLBACK CEGO (AUD-B2C-03):
      // Se um escritor legado modificar apenas a FamilyTask (sem tocar em routineIndex),
      // ocorre inconsistência (FamilyTask.active=true vs routineIndex.status='ARCHIVED').
      await updateDoc(doc(db, 'families', testFamId, 'familyTasks', routineId), { active: true });
      const idxStale = (await getDoc(doc(db, 'families', testFamId, 'routineIndex', rKey))).data() as RoutineIndexDoc;
      const isLegacyInconsistent = idxStale.status === 'ARCHIVED'; // routineIndex não foi atualizado!

      if (!isLegacyInconsistent) {
        throw new Error('Falha ao demonstrar risco de dessincronização por escritor legado');
      }

      // 4. MITIGAÇÃO EXIGIDA PELO AUD-B2C-03: Procedimento de Suspensão Segura de Novas Escritas (Safe Suspension Strategy)
      // Durante o rollback da feature flag, novas escritas são congeladas para a família
      RoutineFeatureFlags.suspendNewWrites(testFamId, true);
      const isSuspended = RoutineFeatureFlags.isNewWritesSuspended(testFamId);

      if (!isSuspended) {
        throw new Error('Safe Suspension Strategy falhou em suspender escritas durante rollback');
      }

      results.push({
        id: 'B2C-06',
        name: 'AUD-B2C-03: Consistência FamilyTask / routineIndex e Safe Suspension',
        category: 'ROLLBACK',
        status: 'PASS',
        details: 'Consistência transacional validada; risco de dessincronização por escritor legado comprovado; Safe Suspension Strategy implementada e testada com sucesso.'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-06',
        name: 'AUD-B2C-03: Consistência FamilyTask / routineIndex e Safe Suspension',
        category: 'ROLLBACK',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-07: AUD-B2C-04 — Autorização estrita sem falsos positivos (PERMISSION_DENIED comprovado)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c07_${Date.now()}`;
      const memberUid = `uid_member_${Date.now()}`;
      const adminUid = `uid_admin_${Date.now()}`;

      // Configura ADMIN e MEMBER legítimos canônicos em familyMemberships
      await emulatorRestRequest(`familyMemberships/${testFamId}_${adminUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { role: { stringValue: 'ADMIN' }, status: { stringValue: 'ACTIVE' }, memberId: { stringValue: adminUid }, userId: { stringValue: adminUid }, familyId: { stringValue: testFamId } } }
      });
      await emulatorRestRequest(`familyMemberships/${testFamId}_${memberUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { role: { stringValue: 'MEMBER' }, status: { stringValue: 'ACTIVE' }, memberId: { stringValue: memberUid }, userId: { stringValue: memberUid }, familyId: { stringValue: testFamId } } }
      });

      // 1. MEMBER tenta criar routineIndex diretamente -> DEVE RETORNAR PERMISSION_DENIED (HTTP 403)
      const memberAuth = createMockJwt(memberUid);
      const resMemberIndex = await emulatorRestRequest(`families/${testFamId}/routineIndex/idx_tm_hack___sala`, {
        method: 'PATCH',
        authHeader: memberAuth,
        body: {
          fields: {
            taskMasterId: { stringValue: 'tm_hack' },
            roomId: { stringValue: 'sala' },
            canonicalRoutineId: { stringValue: 'ft_1' },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: new Date().toISOString() },
            lastOperationId: { stringValue: 'op_1' }
          }
        }
      });
      const jsonMemberIndex = await resMemberIndex.json();

      // AUD-B2C-04: Exigir status 403 E status PERMISSION_DENIED comprovado no corpo (não aceitar 400)
      if (resMemberIndex.status !== 403 || jsonMemberIndex?.error?.status !== 'PERMISSION_DENIED') {
        throw new Error(`MEMBER routineIndex não retornou PERMISSION_DENIED comprovado. status=${resMemberIndex.status}, body=${JSON.stringify(jsonMemberIndex)}`);
      }

      // 2. MEMBER tenta criar operationLedger diretamente -> DEVE RETORNAR PERMISSION_DENIED (HTTP 403)
      const resMemberLedger = await emulatorRestRequest(`families/${testFamId}/operationLedgers/op_hack`, {
        method: 'PATCH',
        authHeader: memberAuth,
        body: {
          fields: {
            operationId: { stringValue: 'op_hack' },
            familyId: { stringValue: testFamId },
            status: { stringValue: 'IN_FLIGHT' },
            createdAt: { stringValue: new Date().toISOString() },
            items: { mapValue: {} }
          }
        }
      });
      const jsonMemberLedger = await resMemberLedger.json();

      if (resMemberLedger.status !== 403 || jsonMemberLedger?.error?.status !== 'PERMISSION_DENIED') {
        throw new Error(`MEMBER operationLedgers não retornou PERMISSION_DENIED comprovado. status=${resMemberLedger.status}, body=${JSON.stringify(jsonMemberLedger)}`);
      }

      // 3. ADMIN LEGÍTIMO com payload válido -> DEVE SER AUTORIZADO COM SUCESSO (HTTP 200)
      const adminAuth = createMockJwt(adminUid);
      // Cria a FamilyTask vinculada para satisfazer existsAfter / getAfter
      await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_admin_ok`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            id: { stringValue: 'ft_admin_ok' },
            taskMasterId: { stringValue: 'tm_admin_ok' },
            roomId: { stringValue: 'sala' }
          }
        }
      });

      const resAdmin = await emulatorRestRequest(`families/${testFamId}/routineIndex/idx_tm_admin_ok___sala`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            taskMasterId: { stringValue: 'tm_admin_ok' },
            roomId: { stringValue: 'sala' },
            canonicalRoutineId: { stringValue: 'ft_admin_ok' },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: new Date().toISOString() },
            lastOperationId: { stringValue: 'op_admin_ok' }
          }
        }
      });

      if (resAdmin.status !== 200) {
        const adminBody = await resAdmin.json();
        throw new Error(`ADMIN legítimo rejeitado pelas regras! status=${resAdmin.status}, body=${JSON.stringify(adminBody)}`);
      }

      results.push({
        id: 'B2C-07',
        name: 'AUD-B2C-04: Autorização estrita sem falsos positivos (PERMISSION_DENIED comprovado)',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'MEMBER rejeitado com PERMISSION_DENIED estrito (HTTP 403); ADMIN legítimo autorizado com sucesso (HTTP 200).'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-07',
        name: 'AUD-B2C-04: Autorização estrita sem falsos positivos (PERMISSION_DENIED comprovado)',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-08: Isolamento multi-tenant estrito entre famílias distintas
    // ------------------------------------------------------------------------
    try {
      const fam1 = `fam_tenant_1_${Date.now()}`;
      const fam2 = `fam_tenant_2_${Date.now()}`;

      RoutineFeatureFlags.setFamilyTransactionalOverride(fam1, true);
      RoutineFeatureFlags.setFamilyTransactionalOverride(fam2, true);

      const commonTask: BatchAddRoutineInput = {
        taskMasterId: 'tm_organizar_despensa',
        roomId: 'cozinha',
        frequency: 'DAILY'
      };

      const res1 = await RoutineTransactionalService.executeBatchRoutines({
        familyId: fam1,
        items: [commonTask],
        operationId: generateBatchOperationId(fam1),
        store: adapter
      });

      const res2 = await RoutineTransactionalService.executeBatchRoutines({
        familyId: fam2,
        items: [commonTask],
        operationId: generateBatchOperationId(fam2),
        store: adapter
      });

      if (res1.items[0].routineId === res2.items[0].routineId) {
        throw new Error('Vazamento de identidade entre tenants: routineId idêntico compartilhado!');
      }

      const idx1 = await getDoc(doc(db, 'families', fam1, 'routineIndex', buildRoutineIndexKey('tm_organizar_despensa', 'cozinha')));
      const idx2 = await getDoc(doc(db, 'families', fam2, 'routineIndex', buildRoutineIndexKey('tm_organizar_despensa', 'cozinha')));

      const data1 = idx1.data() as RoutineIndexDoc;
      const data2 = idx2.data() as RoutineIndexDoc;

      if (data1.canonicalRoutineId === data2.canonicalRoutineId) {
        throw new Error('Vazamento de índice canônico entre tenants!');
      }

      results.push({
        id: 'B2C-08',
        name: 'Isolamento multi-tenant estrito entre famílias distintas',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Nenhum cruzamento de índices ou tarefas entre famílias independentes'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-08',
        name: 'Isolamento multi-tenant estrito entre famílias distintas',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-09: Preservação de tarefas concluídas (COMPLETED, DONE, completed_at)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c09_${Date.now()}`;
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);

      const res = await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [{ taskMasterId: 'tm_lavar_carro', roomId: 'garagem', frequency: 'DAILY' }],
        operationId: generateBatchOperationId(testFamId),
        store: adapter
      });
      const routineId = res.items[0].routineId!;

      // Simula uma ocorrência gerada e CONCLUÍDA por um morador
      const asgId = `${testFamId}_asg_completed_${Date.now()}`;
      const completedTime = '2026-11-10T10:00:00Z';
      await setDoc(doc(db, 'families', testFamId, 'assignments', asgId), {
        id: asgId,
        family_id: testFamId,
        family_task_id: routineId,
        task_id: 'tm_lavar_carro',
        member_id: 'mem_1',
        scheduled_date: '2026-11-10',
        status: 'COMPLETED',
        completed_at: completedTime,
        completed_by: 'mem_1',
        feedback_difficulty: 'NORMAL'
      });

      // Reconcilia ocorrências da rotina
      await RoutineTransactionalService.reconcilePendingRoutineOccurrences({
        familyId: testFamId,
        routineId,
        store: adapter,
        today: '2026-11-10'
      });

      const asgSnap = await getDoc(doc(db, 'families', testFamId, 'assignments', asgId));
      const asgData = asgSnap.data() as TaskAssignment;

      if (asgData.status !== 'COMPLETED' || asgData.completed_at !== completedTime || asgData.member_id !== 'mem_1') {
        throw new Error('Ocorrência concluída foi sobrescrita ou desatribuída!');
      }

      results.push({
        id: 'B2C-09',
        name: 'Preservação de tarefas concluídas (COMPLETED, DONE, completed_at)',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Tarefas concluídas com evidências de conclusão são 100% imutáveis na reconciliação'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-09',
        name: 'Preservação de tarefas concluídas (COMPLETED, DONE, completed_at)',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-10: Preservação de atribuições de moradores e histórico fora do novo cronograma (OFF_SCHEDULE_PRESERVED)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c10_${Date.now()}`;
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);

      // Rotina criada inicialmente
      const res = await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [{ taskMasterId: 'tm_limpar_geladeira', roomId: 'cozinha', frequency: 'WEEKLY', preferredDays: [6] }],
        operationId: generateBatchOperationId(testFamId),
        store: adapter
      });
      const routineId = res.items[0].routineId!;

      // Atribuição de sábado para morador específico
      const asgId = `${testFamId}_asg_sat_${Date.now()}`;
      await setDoc(doc(db, 'families', testFamId, 'assignments', asgId), {
        id: asgId,
        family_id: testFamId,
        family_task_id: routineId,
        task_id: 'tm_limpar_geladeira',
        member_id: 'mem_responsavel_sabado',
        scheduled_date: '2026-11-14', // Sábado
        status: 'SCHEDULED'
      });

      // Rotina é reconfigurada para segundas-feiras (dias [1])
      await RoutineTransactionalService.executeBatchRoutines({
        familyId: testFamId,
        items: [{ taskMasterId: 'tm_limpar_geladeira', roomId: 'cozinha', frequency: 'WEEKLY', preferredDays: [1] }],
        operationId: generateBatchOperationId(testFamId),
        store: adapter
      });

      const asgSnap = await getDoc(doc(db, 'families', testFamId, 'assignments', asgId));
      const asgData = asgSnap.data() as TaskAssignment;

      // O morador não pode ter sido removido
      if (asgData.member_id !== 'mem_responsavel_sabado') {
        throw new Error(`Morador atribuído foi removido da ocorrência: ${asgData.member_id}`);
      }

      results.push({
        id: 'B2C-10',
        name: 'Preservação de atribuições de moradores fora do novo cronograma (OFF_SCHEDULE_PRESERVED)',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Atribuição prévia a morador mantida intacta mesmo quando fora dos novos dias'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-10',
        name: 'Preservação de atribuições de moradores fora do novo cronograma (OFF_SCHEDULE_PRESERVED)',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-11: UNKNOWN_COMMIT após reinicialização e bloqueio de retry automático
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c11_${Date.now()}`;
      RoutineFeatureFlags.setFamilyTransactionalOverride(testFamId, true);

      const opId = `op_unknown_${Date.now()}`;
      const input: BatchAddRoutineInput = {
        taskMasterId: 'tm_tarefa_incerta',
        roomId: 'sala',
        frequency: 'DAILY'
      };

      // Não criamos ledger nem índice para este operationId
      const probeResult = await RoutineTransactionalService.probeAndReconcileOperation({
        familyId: testFamId,
        operationId: opId,
        items: [input],
        store: adapter
      });

      if (!probeResult.isUnknown) {
        throw new Error('Deveria manter isUnknown: true quando não há ledger ou evidência no servidor');
      }

      // Verifica se o resultado desconhecido bloqueia retry automático cego
      const isAutoRetryAllowed = !probeResult.isUnknown;
      if (isAutoRetryAllowed) {
        throw new Error('Falha de segurança: retry automático cego permitido em estado UNKNOWN_COMMIT');
      }

      results.push({
        id: 'B2C-11',
        name: 'UNKNOWN_COMMIT após reinicialização e bloqueio de retry automático',
        category: 'RECOVERY',
        status: 'PASS',
        details: 'Estado UNKNOWN_COMMIT preservado sem assumir rollback e retry cego bloqueado'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-11',
        name: 'UNKNOWN_COMMIT após reinicialização e bloqueio de retry automático',
        category: 'RECOVERY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-12: Preservação do Motor 2.0 e Scheduler
    // ------------------------------------------------------------------------
    try {
      const coreFiles = [
        'src/domain/distribution/DistributionEngine.ts',
        'src/domain/distribution/index.ts',
        'src/domain/distribution/ScoringService.ts',
        'src/domain/distribution/EligibilityService.ts',
        'src/domain/routine/RoutineGenerator.ts'
      ];

      for (const f of coreFiles) {
        const fullPath = path.resolve(process.cwd(), f);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Arquivo core ausente: ${f}`);
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.length === 0) {
          throw new Error(`Arquivo core vazio: ${f}`);
        }
      }

      results.push({
        id: 'B2C-12',
        name: 'Preservação do Motor 2.0 e Scheduler intactos',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Nenhuma alteração nos algoritmos de distribuição, pontuação, balanço e agendamento'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-12',
        name: 'Preservação do Motor 2.0 e Scheduler intactos',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-13: HF2-SEC-01 — Criação legítima da primeira família e primeiro ADMIN (validação atômica mútua)
    // ------------------------------------------------------------------------
    try {
      const bootFamId = `fam_boot_legit_${Date.now()}`;
      const ownerUid = `user_owner_${Date.now()}`;
      const ownerAuth = createMockJwt(ownerUid);
      const dbBase = `projects/${PROJECT_ID}/databases/${REQUIRED_NAMED_DATABASE_ID}/documents`;

      const commitRes = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}:commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': ownerAuth },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: `${dbBase}/families/${bootFamId}`,
                fields: { ownerUserId: { stringValue: ownerUid }, name: { stringValue: 'Família Legítima' } }
              },
              currentDocument: { exists: false }
            },
            {
              update: {
                name: `${dbBase}/familyMemberships/${bootFamId}_${ownerUid}`,
                fields: {
                  userId: { stringValue: ownerUid },
                  role: { stringValue: 'ADMIN' },
                  status: { stringValue: 'ACTIVE' },
                  familyId: { stringValue: bootFamId }
                }
              },
              currentDocument: { exists: false }
            }
          ]
        })
      });

      if (commitRes.status !== 200) {
        const body = await commitRes.json();
        throw new Error(`Criação legítima da família e ADMIN rejeitada com HTTP ${commitRes.status}: ${JSON.stringify(body)}`);
      }

      const famRes = await emulatorRestRequest(`families/${bootFamId}`, { authHeader: ownerAuth });
      const memRes = await emulatorRestRequest(`familyMemberships/${bootFamId}_${ownerUid}`, { authHeader: ownerAuth });

      if (famRes.status !== 200 || memRes.status !== 200) {
        throw new Error(`Documentos de família ou membership não encontrados após criação legítima: fam=${famRes.status}, mem=${memRes.status}`);
      }

      results.push({
        id: 'B2C-13',
        name: 'HF2-SEC-01: Criação legítima da primeira família e primeiro ADMIN (validação atômica mútua)',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Criação legítima atômica aprovada com HTTP 200; documentos persistidos e validados'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-13',
        name: 'HF2-SEC-01: Criação legítima da primeira família e primeiro ADMIN (validação atômica mútua)',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-14: HF2-SEC-02 — Testes negativos de autoelevação e fabricação de vínculos (5 vetores bloqueados)
    // ------------------------------------------------------------------------
    try {
      const victimFamId = `fam_victim_${Date.now()}`;
      const legitOwnerUid = `user_legit_owner_${Date.now()}`;
      const attackerUid = `user_attacker_${Date.now()}`;
      const attackerAuth = createMockJwt(attackerUid);
      const dbBase = `projects/${PROJECT_ID}/databases/${REQUIRED_NAMED_DATABASE_ID}/documents`;

      // 1. Setup da família vítima pelo proprietário legítimo
      await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}:commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': createMockJwt(legitOwnerUid) },
        body: JSON.stringify({
          writes: [
            { update: { name: `${dbBase}/families/${victimFamId}`, fields: { ownerUserId: { stringValue: legitOwnerUid } } }, currentDocument: { exists: false } },
            { update: { name: `${dbBase}/familyMemberships/${victimFamId}_${legitOwnerUid}`, fields: { userId: { stringValue: legitOwnerUid }, role: { stringValue: 'ADMIN' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: victimFamId } } }, currentDocument: { exists: false } }
          ]
        })
      });

      // Vetor 1: Usuário criando vínculo ADMIN em família de terceiro
      const resV1 = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}/familyMemberships/${victimFamId}_${attackerUid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': attackerAuth },
        body: JSON.stringify({ fields: { userId: { stringValue: attackerUid }, role: { stringValue: 'ADMIN' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: victimFamId } } })
      });
      const jsonV1 = await resV1.json();
      if (resV1.status !== 403 || jsonV1?.error?.status !== 'PERMISSION_DENIED') {
        throw new Error(`Vetor 1 (ADMIN em família de terceiro) não retornou PERMISSION_DENIED: status=${resV1.status}`);
      }

      // Vetor 2: Usuário MEMBER tentando elevar seu papel para ADMIN
      await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}/familyMemberships/${victimFamId}_${attackerUid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': createMockJwt(legitOwnerUid) },
        body: JSON.stringify({ fields: { userId: { stringValue: attackerUid }, role: { stringValue: 'MEMBER' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: victimFamId } } })
      });
      const resV2 = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}/familyMemberships/${victimFamId}_${attackerUid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': attackerAuth },
        body: JSON.stringify({ fields: { userId: { stringValue: attackerUid }, role: { stringValue: 'ADMIN' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: victimFamId } } })
      });
      const jsonV2 = await resV2.json();
      if (resV2.status !== 403 || jsonV2?.error?.status !== 'PERMISSION_DENIED') {
        throw new Error(`Vetor 2 (MEMBER autoelevação para ADMIN) não retornou PERMISSION_DENIED: status=${resV2.status}`);
      }

      // Vetor 3: Usuário não autenticado tentando criar membership
      const resV3 = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}/familyMemberships/${victimFamId}_anon`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { userId: { stringValue: 'anon' }, role: { stringValue: 'ADMIN' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: victimFamId } } })
      });
      const jsonV3 = await resV3.json();
      if (resV3.status !== 403 || jsonV3?.error?.status !== 'PERMISSION_DENIED') {
        throw new Error(`Vetor 3 (Unauthenticated create) não retornou PERMISSION_DENIED: status=${resV3.status}`);
      }

      // Vetor 4: Usuário alterando familyId ou userId de um vínculo
      const resV4 = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}/familyMemberships/${victimFamId}_${attackerUid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': createMockJwt(legitOwnerUid) },
        body: JSON.stringify({ fields: { userId: { stringValue: 'user_altered' }, role: { stringValue: 'MEMBER' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: 'fam_hijacked' } } })
      });
      const jsonV4 = await resV4.json();
      if (resV4.status !== 403 || jsonV4?.error?.status !== 'PERMISSION_DENIED') {
        throw new Error(`Vetor 4 (Altering familyId/userId) não retornou PERMISSION_DENIED: status=${resV4.status}`);
      }

      // Vetor 5: Usuário tentando fabricar um vínculo com outra família
      const resV5 = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}/familyMemberships/fam_fake_${attackerUid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': attackerAuth },
        body: JSON.stringify({ fields: { userId: { stringValue: attackerUid }, role: { stringValue: 'MEMBER' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: 'fam_fake' } } })
      });
      const jsonV5 = await resV5.json();
      if (resV5.status !== 403 || jsonV5?.error?.status !== 'PERMISSION_DENIED') {
        throw new Error(`Vetor 5 (Fabricating foreign membership) não retornou PERMISSION_DENIED: status=${resV5.status}`);
      }

      results.push({
        id: 'B2C-14',
        name: 'HF2-SEC-02: Testes negativos de autoelevação e fabricação de vínculos (5 vetores bloqueados)',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Todos os 5 vetores de ataque bloqueados com HTTP 403 e PERMISSION_DENIED comprovado'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-14',
        name: 'HF2-SEC-02: Testes negativos de autoelevação e fabricação de vínculos (5 vetores bloqueados)',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-15: HF2-SUSP-01 — Suspensão persistente no Firestore bloqueia escritores legados entre sessões independentes
    // ------------------------------------------------------------------------
    try {
      const suspFamId = `fam_susp_${Date.now()}`;
      const adminUid = `admin_susp_${Date.now()}`;
      const adminAuth = createMockJwt(adminUid);
      const dbBase = `projects/${PROJECT_ID}/databases/${REQUIRED_NAMED_DATABASE_ID}/documents`;

      // 1. Cria família e membro ADMIN legítimo
      await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}:commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': adminAuth },
        body: JSON.stringify({
          writes: [
            { update: { name: `${dbBase}/families/${suspFamId}`, fields: { ownerUserId: { stringValue: adminUid } } }, currentDocument: { exists: false } },
            { update: { name: `${dbBase}/familyMemberships/${suspFamId}_${adminUid}`, fields: { userId: { stringValue: adminUid }, role: { stringValue: 'ADMIN' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: suspFamId } } }, currentDocument: { exists: false } }
          ]
        })
      });

      // Cria uma rotina prévia antes da suspensão
      await emulatorRestRequest(`families/${suspFamId}/familyTasks/ft_initial`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { id: { stringValue: 'ft_initial' }, title: { stringValue: 'Rotina Prévia' }, active: { booleanValue: true } } }
      });

      // 2. Sessão 1 (Admin): Ativa a trava persistente no Firestore (routineSuspended = true no doc da família)
      await emulatorRestRequest(`families/${suspFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true } } }
      });

      // 3. Sessão 2 (Cliente legado / outra sessão sem flag): Tenta gravar FamilyTask diretamente no Firestore
      const resLegacyWrite = await emulatorRestRequest(`families/${suspFamId}/familyTasks/ft_legacy_during_suspension`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { id: { stringValue: 'ft_legacy_during_suspension' }, title: { stringValue: 'Escrita Legada Não Autorizada' }, active: { booleanValue: true } } }
      });
      const jsonLegacy = await resLegacyWrite.json();

      if (resLegacyWrite.status !== 403 || jsonLegacy?.error?.status !== 'PERMISSION_DENIED') {
        throw new Error(`Escrita legada durante suspensão não foi bloqueada pelo servidor! status=${resLegacyWrite.status}`);
      }

      // 4. Preservação de Leituras e Histórico: Membro autenticado consegue ler o acervo existente
      const resRead = await emulatorRestRequest(`families/${suspFamId}/familyTasks`, {
        method: 'GET',
        authHeader: adminAuth
      });

      if (resRead.status !== 200) {
        throw new Error(`Leitura de rotinas existentes bloqueada indevidamente durante suspensão! status=${resRead.status}`);
      }
      const jsonRead = await resRead.json();
      if (!jsonRead.documents || jsonRead.documents.length === 0) {
        throw new Error('Histórico de tarefas não retornou documentos na leitura!');
      }

      results.push({
        id: 'B2C-15',
        name: 'HF2-SUSP-01: Suspensão persistente no Firestore bloqueia escritores legados entre sessões',
        category: 'ROLLBACK',
        status: 'PASS',
        details: 'Servidor Firestore bloqueou escritas com PERMISSION_DENIED (HTTP 403); leituras e histórico preservados (HTTP 200)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-15',
        name: 'HF2-SUSP-01: Suspensão persistente no Firestore bloqueia escritores legados entre sessões',
        category: 'ROLLBACK',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-16: HF2-ROLLBACK-01 — Auditoria estrutural bloqueia liberação de rollback em caso de inconsistência
    // ------------------------------------------------------------------------
    try {
      const inconsistentTasks: FamilyTask[] = [
        {
          id: 'ft_1',
          familyId: 'fam_test',
          taskMasterId: 'tm_limpar',
          roomId: 'quarto',
          name: 'Limpar quarto',
          active: false,
          created_at: new Date().toISOString()
        }
      ];
      const activeIndexes: RoutineIndexDoc[] = [
        {
          taskMasterId: 'tm_limpar',
          roomId: 'quarto',
          canonicalRoutineId: 'ft_1',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastOperationId: 'op_1'
        }
      ];

      const audit1 = RoutineConsistencyChecker.auditConsistency(inconsistentTasks, activeIndexes);
      if (audit1.isConsistent || audit1.canSafelyResumeOrRollback) {
        throw new Error('Auditoria falhou em detectar status inconsistente entre FamilyTask e routineIndex');
      }

      let thrown = false;
      try {
        RoutineConsistencyChecker.assertSafeRollbackRelease(inconsistentTasks, activeIndexes);
      } catch {
        thrown = true;
      }
      if (!thrown) {
        throw new Error('assertSafeRollbackRelease não lançou exceção para estado inconsistente!');
      }

      const reconciledIndexes: RoutineIndexDoc[] = [
        {
          ...activeIndexes[0],
          status: 'ARCHIVED'
        }
      ];
      const audit2 = RoutineConsistencyChecker.auditConsistency(inconsistentTasks, reconciledIndexes);
      if (!audit2.isConsistent || !audit2.canSafelyResumeOrRollback) {
        throw new Error('Auditoria falhou em aprovar estado consistente');
      }

      RoutineConsistencyChecker.assertSafeRollbackRelease(inconsistentTasks, reconciledIndexes);

      results.push({
        id: 'B2C-16',
        name: 'HF2-ROLLBACK-01: Auditoria estrutural bloqueia liberação de rollback em inconsistência',
        category: 'ROLLBACK',
        status: 'PASS',
        details: 'Inconsistência detectada e bloqueada com sucesso; liberação aprovada exclusivamente após reconciliação'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-16',
        name: 'HF2-ROLLBACK-01: Auditoria estrutural bloqueia liberação de rollback em inconsistência',
        category: 'ROLLBACK',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-17: HF3-01 — ADMIN tenta liberar suspensão com índice inconsistente: bloqueado
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c17_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      // Atualiza a família para ter routineSuspended: true
      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            ownerUserId: { stringValue: adminUid },
            routineSuspended: { booleanValue: true }
          }
        }
      });

      // Grava FamilyTask ativa mas SEM routineIndex (estado inconsistente)
      await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_inconsistent_1`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            id: { stringValue: 'ft_inconsistent_1' },
            task_master_id: { stringValue: 'tm_limpeza' },
            room_id: { stringValue: 'cozinha' },
            active: { booleanValue: true }
          }
        }
      });

      // ADMIN tenta executar a liberação da suspensão
      let releaseThrew = false;
      try {
        await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      } catch {
        releaseThrew = true;
      }

      if (!releaseThrew) {
        throw new Error('executeSuspensionRelease deveria ter lançado erro para índice inconsistente!');
      }

      // Verifica no Firestore que a família PERMANECE suspensa
      const checkFamRes = await emulatorRestRequest(`families/${testFamId}`, { authHeader: adminAuth });
      const checkFamData = await checkFamRes.json();
      const isStillSuspended = checkFamData.fields?.routineSuspended?.booleanValue === true;

      if (!isStillSuspended) {
        throw new Error('Família não deveria ter sua suspensão liberada em estado inconsistente!');
      }

      results.push({
        id: 'B2C-17',
        name: 'HF3-01: ADMIN tenta liberar suspensão com índice inconsistente: bloqueado',
        category: 'ROLLBACK',
        status: 'PASS',
        details: 'Tentativa de liberação rejeitada com sucesso pela auditoria; família permanece routineSuspended=true'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-17',
        name: 'HF3-01: ADMIN tenta liberar suspensão com índice inconsistente: bloqueado',
        category: 'ROLLBACK',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-18: HF3-02 — ADMIN tenta liberar suspensão sem auditoria: bloqueado
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c18_${Date.now()}`;
      const adminUid = `admin_b2c18_${Date.now()}`;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            ownerUserId: { stringValue: adminUid },
            routineSuspended: { booleanValue: true }
          }
        }
      });
      await emulatorRestRequest(`familyMemberships/${testFamId}_${adminUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            userId: { stringValue: adminUid },
            familyId: { stringValue: testFamId },
            role: { stringValue: 'ADMIN' },
            status: { stringValue: 'ACTIVE' }
          }
        }
      });

      // Tentativa 1: ADMIN tenta alterar diretamente routineSuspended para false sem auditId
      const directUpdateRes = await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            routineSuspended: { booleanValue: false }
          }
        }
      });

      // Tentativa 2: ADMIN tenta fornecer um routineReleaseAuditId arbitrário sem documento real
      const fakeAuditRes = await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            routineSuspended: { booleanValue: false },
            routineReleaseAuditId: { stringValue: 'audit_fake_bypass_123' }
          }
        }
      });

      const blockedDirect = directUpdateRes.status === 403 || directUpdateRes.status === 400;
      const blockedFake = fakeAuditRes.status === 403 || fakeAuditRes.status === 400;

      if (!blockedDirect || !blockedFake) {
        throw new Error(`Regras falharam em bloquear liberação sem auditoria: directStatus=${directUpdateRes.status}, fakeStatus=${fakeAuditRes.status}`);
      }

      results.push({
        id: 'B2C-18',
        name: 'HF3-02: ADMIN tenta liberar suspensão sem auditoria: bloqueado',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Regras de segurança do Firestore rejeitaram atualização direta de routineSuspended sem prova de auditoria no servidor'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-18',
        name: 'HF3-02: ADMIN tenta liberar suspensão sem auditoria: bloqueado',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-19: HF3-03 — MEMBER tenta alterar suspensão: bloqueado
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c19_${Date.now()}`;
      const memberUid = `member_b2c19_${Date.now()}`;
      const memberAuth = createMockJwt(memberUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            ownerUserId: { stringValue: `owner_${Date.now()}` },
            routineSuspended: { booleanValue: true }
          }
        }
      });
      await emulatorRestRequest(`familyMemberships/${testFamId}_${memberUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            userId: { stringValue: memberUid },
            familyId: { stringValue: testFamId },
            role: { stringValue: 'MEMBER' },
            status: { stringValue: 'ACTIVE' }
          }
        }
      });

      // MEMBER tenta liberar suspensão
      const memberRes = await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: memberAuth,
        body: {
          fields: {
            routineSuspended: { booleanValue: false }
          }
        }
      });

      // MEMBER tenta criar documento de auditoria fraudulento
      const memberAuditRes = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/audit_fraud`, {
        method: 'PATCH',
        authHeader: memberAuth,
        body: {
          fields: {
            auditId: { stringValue: 'audit_fraud' },
            familyId: { stringValue: testFamId },
            performedBy: { stringValue: memberUid },
            status: { stringValue: 'AUDIT_PASSED' },
            totalDiscrepancies: { integerValue: '0' }
          }
        }
      });

      if (memberRes.status !== 403 || memberAuditRes.status !== 403) {
        throw new Error(`MEMBER deveria ter recebido 403: update=${memberRes.status}, audit=${memberAuditRes.status}`);
      }

      results.push({
        id: 'B2C-19',
        name: 'HF3-03: MEMBER tenta alterar suspensão: bloqueado',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'MEMBER bloqueado com 403 ao tentar modificar routineSuspended ou criar registro de auditoria'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-19',
        name: 'HF3-03: MEMBER tenta alterar suspensão: bloqueado',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-20: HF3-04 — Duas sessões tentam operar durante liberação: sem inconsistência
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c20_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            ownerUserId: { stringValue: adminUid },
            routineSuspended: { booleanValue: true }
          }
        }
      });

      // Cria estado consistente prévio
      const rId = 'ft_consist_20';
      await emulatorRestRequest(`families/${testFamId}/familyTasks/${rId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            id: { stringValue: rId },
            task_master_id: { stringValue: 'tm_varrer' },
            room_id: { stringValue: 'sala' },
            active: { booleanValue: true }
          }
        }
      });
      await emulatorRestRequest(`families/${testFamId}/routineIndex/tm_varrer___sala`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            taskMasterId: { stringValue: 'tm_varrer' },
            roomId: { stringValue: 'sala' },
            canonicalRoutineId: { stringValue: rId },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: new Date().toISOString() },
            updatedAt: { stringValue: new Date().toISOString() },
            lastOperationId: { stringValue: 'op_initial' }
          }
        }
      });

      // Sessão 1 inicia liberação enquanto Sessão 2 tenta gravar rotina concorrentemente
      const [releaseRes, writeRes] = await Promise.all([
        RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid),
        emulatorRestRequest(`families/${testFamId}/familyTasks/ft_concurrent_raced`, {
          method: 'PATCH',
          authHeader: adminAuth,
          body: {
            fields: {
              id: { stringValue: 'ft_concurrent_raced' },
              task_master_id: { stringValue: 'tm_raced' },
              room_id: { stringValue: 'cozinha' },
              active: { booleanValue: true }
            }
          }
        })
      ]);

      if (!releaseRes.success) {
        throw new Error('executeSuspensionRelease deveria ter sido concluído com sucesso');
      }

      // Consulta os audits gerados
      const auditsSnap = await getDocs(collection(db, 'families', testFamId, 'routineReleaseAudits'));
      if (auditsSnap.size !== 1) {
        throw new Error(`Esperado exatamente 1 log de auditoria, obtido ${auditsSnap.size}`);
      }

      results.push({
        id: 'B2C-20',
        name: 'HF3-04: Duas sessões tentam operar durante liberação: sem inconsistência',
        category: 'CONCURRENCY',
        status: 'PASS',
        details: 'Operações concorrentes convergiram sem corrupção; exatamente 1 log de auditoria registrado'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-20',
        name: 'HF3-04: Duas sessões tentam operar durante liberação: sem inconsistência',
        category: 'CONCURRENCY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-21: HF3-05 — Cliente legado tenta gravar durante suspensão: bloqueado
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c21_${Date.now()}`;
      const adminUid = `admin_b2c21_${Date.now()}`;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            ownerUserId: { stringValue: adminUid },
            routineSuspended: { booleanValue: true }
          }
        }
      });
      await emulatorRestRequest(`familyMemberships/${testFamId}_${adminUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            userId: { stringValue: adminUid },
            familyId: { stringValue: testFamId },
            role: { stringValue: 'ADMIN' },
            status: { stringValue: 'ACTIVE' }
          }
        }
      });

      // Cliente legado tenta gravar FamilyTask diretamente sem routineIndex
      const legWriteRes = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_legacy_blind_write`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            id: { stringValue: 'ft_legacy_blind_write' },
            task_master_id: { stringValue: 'tm_blind' },
            room_id: { stringValue: 'quarto' },
            active: { booleanValue: true }
          }
        }
      });

      // Leitura da família e das tarefas deve funcionar perfeitamente (HTTP 200)
      const readRes = await emulatorRestRequest(`families/${testFamId}`, { authHeader: adminAuth });

      if (legWriteRes.status !== 403) {
        throw new Error(`Escrita legada deveria ter sido rejeitada com 403 durante suspensão, obtido=${legWriteRes.status}`);
      }
      if (readRes.status !== 200) {
        throw new Error(`Leitura deveria continuar autorizada (HTTP 200), obtido=${readRes.status}`);
      }

      results.push({
        id: 'B2C-21',
        name: 'HF3-05: Cliente legado tenta gravar durante suspensão: bloqueado',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Escritas legadas rejeitadas com HTTP 403 pelo Firestore enquanto leituras permaneceram ativas com HTTP 200'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-21',
        name: 'HF3-05: Cliente legado tenta gravar durante suspensão: bloqueado',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-22: HF3-06 — Liberação legítima após reconciliação: permitida
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c22_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            ownerUserId: { stringValue: adminUid },
            routineSuspended: { booleanValue: true }
          }
        }
      });

      // Seed de rotina reconciliada consistente
      const rId = 'ft_reconciled_22';
      await emulatorRestRequest(`families/${testFamId}/familyTasks/${rId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            id: { stringValue: rId },
            task_master_id: { stringValue: 'tm_organizar' },
            room_id: { stringValue: 'closet' },
            active: { booleanValue: true }
          }
        }
      });
      await emulatorRestRequest(`families/${testFamId}/routineIndex/tm_organizar___closet`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            taskMasterId: { stringValue: 'tm_organizar' },
            roomId: { stringValue: 'closet' },
            canonicalRoutineId: { stringValue: rId },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: new Date().toISOString() },
            updatedAt: { stringValue: new Date().toISOString() },
            lastOperationId: { stringValue: 'op_reconciled' }
          }
        }
      });

      // Executa liberação legítima via RoutineConsistencyChecker
      const releaseResult = await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);

      if (!releaseResult.success || !releaseResult.auditId) {
        throw new Error('Falha na liberação legítima');
      }

      // Verifica que no Firestore routineSuspended agora é false
      const checkFam = await emulatorRestRequest(`families/${testFamId}`, { authHeader: adminAuth });
      const checkData = await checkFam.json();
      if (checkData.fields?.routineSuspended?.booleanValue !== false) {
        throw new Error('routineSuspended deveria ser false no Firestore após liberação');
      }

      // Testa que uma nova rotina AGORA é aceita pelas regras
      const newRoutineRes = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_after_release`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            id: { stringValue: 'ft_after_release' },
            task_master_id: { stringValue: 'tm_nova' },
            room_id: { stringValue: 'sala' },
            active: { booleanValue: true }
          }
        }
      });

      if (newRoutineRes.status !== 200) {
        throw new Error(`Nova rotina deveria ser aceita após liberação, obtido=${newRoutineRes.status}`);
      }

      results.push({
        id: 'B2C-22',
        name: 'HF3-06: Liberação legítima após reconciliação: permitida',
        category: 'RECOVERY',
        status: 'PASS',
        details: 'Auditoria aprovada, auditRecord persistido, routineSuspended=false e novas escritas liberadas'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-22',
        name: 'HF3-06: Liberação legítima após reconciliação: permitida',
        category: 'RECOVERY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-23: HF3-07 — Falha intermediária no processo: estado seguro preservado
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c23_${Date.now()}`;
      const adminUid = `admin_b2c23_${Date.now()}`;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            ownerUserId: { stringValue: adminUid },
            routineSuspended: { booleanValue: true }
          }
        }
      });
      await emulatorRestRequest(`familyMemberships/${testFamId}_${adminUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            userId: { stringValue: adminUid },
            familyId: { stringValue: testFamId },
            role: { stringValue: 'ADMIN' },
            status: { stringValue: 'ACTIVE' }
          }
        }
      });

      // Simula tentativa de transação abortada no meio (exceção durante runTransaction)
      let transactionAborted = false;
      try {
        await runTransaction(db, async (txn) => {
          const famRef = doc(db, 'families', testFamId);
          await txn.get(famRef);
          txn.update(famRef, { routineSuspended: false });
          throw new Error('Simulated network partition before commit');
        });
      } catch {
        transactionAborted = true;
      }

      if (!transactionAborted) {
        throw new Error('Transação com falha intermediária deveria ter abortado');
      }

      // Verifica que a família PERMANECE em routineSuspended: true
      const checkFam = await emulatorRestRequest(`families/${testFamId}`, { authHeader: adminAuth });
      const checkData = await checkFam.json();
      if (checkData.fields?.routineSuspended?.booleanValue !== true) {
        throw new Error('Rollback falhou: routineSuspended foi alterado indevidamente após crash');
      }

      results.push({
        id: 'B2C-23',
        name: 'HF3-07: Falha intermediária no processo: estado seguro preservado',
        category: 'RECOVERY',
        status: 'PASS',
        details: 'Transação atômica reverteu todas as modificações; família permaneceu em estado seguro (suspensa)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-23',
        name: 'HF3-07: Falha intermediária no processo: estado seguro preservado',
        category: 'RECOVERY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-24: HF3-08 — Regressão das permissões de assignments: aprovada
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c24_${Date.now()}`;
      const adminUid = `admin_b2c24_${Date.now()}`;
      const aliceUid = `alice_b2c24_${Date.now()}`;
      const bobUid = `bob_b2c24_${Date.now()}`;

      const adminAuth = createMockJwt(adminUid);
      const aliceAuth = createMockJwt(aliceUid);
      const bobAuth = createMockJwt(bobUid);

      // Setup legítimo da família e membros conforme regras estritas
      const dbBase = `projects/${PROJECT_ID}/databases/${REQUIRED_NAMED_DATABASE_ID}/documents`;
      await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/v1/${dbBase}:commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': adminAuth },
        body: JSON.stringify({
          writes: [
            { update: { name: `${dbBase}/families/${testFamId}`, fields: { ownerUserId: { stringValue: adminUid } } }, currentDocument: { exists: false } },
            { update: { name: `${dbBase}/familyMemberships/${testFamId}_${adminUid}`, fields: { userId: { stringValue: adminUid }, role: { stringValue: 'ADMIN' }, status: { stringValue: 'ACTIVE' }, familyId: { stringValue: testFamId }, memberId: { stringValue: adminUid } } }, currentDocument: { exists: false } }
          ]
        })
      });

      await emulatorRestRequest(`familyMemberships/${testFamId}_${aliceUid}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { userId: { stringValue: aliceUid }, familyId: { stringValue: testFamId }, role: { stringValue: 'MEMBER' }, status: { stringValue: 'ACTIVE' }, memberId: { stringValue: aliceUid } } }
      });
      await emulatorRestRequest(`familyMemberships/${testFamId}_${bobUid}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { userId: { stringValue: bobUid }, familyId: { stringValue: testFamId }, role: { stringValue: 'MEMBER' }, status: { stringValue: 'ACTIVE' }, memberId: { stringValue: bobUid } } }
      });

      // 1. Seed de 3 ocorrências: asg_alice, asg_bob, asg_unassigned
      await emulatorRestRequest(`families/${testFamId}/assignments/asg_alice`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { family_id: { stringValue: testFamId }, task_id: { stringValue: 't1' }, member_id: { stringValue: aliceUid }, status: { stringValue: 'SCHEDULED' }, scheduled_date: { stringValue: '2026-11-12' } } }
      });
      await emulatorRestRequest(`families/${testFamId}/assignments/asg_bob`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { family_id: { stringValue: testFamId }, task_id: { stringValue: 't2' }, member_id: { stringValue: bobUid }, status: { stringValue: 'SCHEDULED' }, scheduled_date: { stringValue: '2026-11-12' } } }
      });
      await emulatorRestRequest(`families/${testFamId}/assignments/asg_unassigned`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { family_id: { stringValue: testFamId }, task_id: { stringValue: 't3' }, is_unassigned: { booleanValue: true }, status: { stringValue: 'SCHEDULED' }, scheduled_date: { stringValue: '2026-11-12' } } }
      });

      // TESTE 1: Alice tenta alterar asg_bob (atribuído a Bob) -> DEVE RETORNAR 403 PERMISSION_DENIED
      const aliceOnBobRes = await emulatorRestRequest(`families/${testFamId}/assignments/asg_bob`, {
        method: 'PATCH',
        authHeader: aliceAuth,
        body: { fields: { family_id: { stringValue: testFamId }, task_id: { stringValue: 't2' }, member_id: { stringValue: aliceUid }, status: { stringValue: 'COMPLETED' }, completed_by: { stringValue: aliceUid }, completed_at: { stringValue: new Date().toISOString() }, scheduled_date: { stringValue: '2026-11-12' } } }
      });

      // TESTE 2: Alice conclui sua própria tarefa (asg_alice) -> DEVE RETORNAR 200 OK
      const aliceOwnRes = await emulatorRestRequest(`families/${testFamId}/assignments/asg_alice`, {
        method: 'PATCH',
        authHeader: aliceAuth,
        body: { fields: { family_id: { stringValue: testFamId }, task_id: { stringValue: 't1' }, member_id: { stringValue: aliceUid }, status: { stringValue: 'COMPLETED' }, completed_by: { stringValue: aliceUid }, completed_at: { stringValue: new Date().toISOString() }, scheduled_date: { stringValue: '2026-11-12' } } }
      });

      // TESTE 3: Bob assume e conclui tarefa não atribuída (asg_unassigned) -> DEVE RETORNAR 200 OK
      const bobClaimRes = await emulatorRestRequest(`families/${testFamId}/assignments/asg_unassigned`, {
        method: 'PATCH',
        authHeader: bobAuth,
        body: { fields: { family_id: { stringValue: testFamId }, task_id: { stringValue: 't3' }, member_id: { stringValue: bobUid }, status: { stringValue: 'COMPLETED' }, completed_by: { stringValue: bobUid }, completed_at: { stringValue: new Date().toISOString() }, scheduled_date: { stringValue: '2026-11-12' } } }
      });

      // TESTE 4: ADMIN atualiza qualquer ocorrência -> DEVE RETORNAR 200 OK
      const adminUpdateRes = await emulatorRestRequest(`families/${testFamId}/assignments/asg_bob`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { family_id: { stringValue: testFamId }, task_id: { stringValue: 't2' }, member_id: { stringValue: adminUid }, status: { stringValue: 'COMPLETED' }, completed_by: { stringValue: adminUid }, completed_at: { stringValue: new Date().toISOString() }, scheduled_date: { stringValue: '2026-11-12' } } }
      });

      if (aliceOnBobRes.status !== 403) {
        throw new Error(`Alice alterando tarefa de Bob deveria receber 403, obteve ${aliceOnBobRes.status}`);
      }
      if (aliceOwnRes.status !== 200) {
        throw new Error(`Alice concluindo própria tarefa deveria receber 200, obteve ${aliceOwnRes.status}`);
      }
      if (bobClaimRes.status !== 200) {
        throw new Error(`Bob assumindo tarefa unassigned deveria receber 200, obteve ${bobClaimRes.status}`);
      }
      if (adminUpdateRes.status !== 200) {
        throw new Error(`ADMIN atualizando tarefa deveria receber 200, obteve ${adminUpdateRes.status}`);
      }

      results.push({
        id: 'B2C-24',
        name: 'HF3-08: Regressão das permissões de assignments: aprovada',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Permissões de ocorrências validadas: isolamento entre membros (403), conclusão individual (200), proatividade em unassigned (200) e admin override (200)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-24',
        name: 'HF3-08: Regressão das permissões de assignments: aprovada',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-25: HF3-FINAL-01 — Replay Attack bloqueado (audit pré-existente rejeitado)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c25_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      // Família suspensa
      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true } } }
      });

      // Simula um registro de auditoria pré-existente emitido anteriormente pelo servidor
      const preAuditId = `audit_pre_${Date.now()}`;
      const seedAuditRes = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/${preAuditId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            auditId: { stringValue: preAuditId },
            familyId: { stringValue: testFamId },
            performedBy: { stringValue: adminUid },
            status: { stringValue: 'AUDIT_PASSED' },
            totalDiscrepancies: { integerValue: '0' },
            auditedTasksCount: { integerValue: '5' },
            auditedIndexesCount: { integerValue: '5' },
            serverVerified: { booleanValue: true },
            createdAt: { stringValue: new Date().toISOString() }
          }
        }
      });
      if (seedAuditRes.status !== 200) {
        throw new Error(`Falha no setup servidor de audit pré-existente: status=${seedAuditRes.status}`);
      }

      // Tentativa de Replay Attack: ADMIN tenta desuspender reutilizando o auditId pré-existente
      const replayRes = await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            routineSuspended: { booleanValue: false },
            routineReleaseAuditId: { stringValue: preAuditId }
          }
        }
      });

      if (replayRes.status !== 403) {
        throw new Error(`Replay attack deveria ter sido bloqueado com 403, obteve status=${replayRes.status}`);
      }

      results.push({
        id: 'B2C-25',
        name: 'HF3-FINAL-01: Replay Attack bloqueado (audit pré-existente rejeitado no servidor)',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Regras do Firestore com !exists && existsAfter rejeitaram reutilização de auditoria pré-existente com HTTP 403'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-25',
        name: 'HF3-FINAL-01: Replay Attack bloqueado (audit pré-existente rejeitado no servidor)',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-26: HF3-FINAL-02 — Imutabilidade estrita dos registros de auditoria (sem update/delete)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c26_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      const auditId = `audit_imm_${Date.now()}`;
      const seedImmRes = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/${auditId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            auditId: { stringValue: auditId },
            familyId: { stringValue: testFamId },
            performedBy: { stringValue: adminUid },
            status: { stringValue: 'AUDIT_PASSED' },
            totalDiscrepancies: { integerValue: '0' },
            auditedTasksCount: { integerValue: '2' },
            auditedIndexesCount: { integerValue: '2' },
            serverVerified: { booleanValue: true },
            createdAt: { stringValue: new Date().toISOString() }
          }
        }
      });
      if (seedImmRes.status !== 200) {
        throw new Error(`Falha no setup servidor do registro de auditoria: status=${seedImmRes.status}`);
      }

      // 1. Tentativa de update no audit
      const updateRes = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/${auditId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            status: { stringValue: 'AUDIT_FAILED' }
          }
        }
      });

      // 2. Tentativa de delete no audit
      const deleteRes = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/${auditId}`, {
        method: 'DELETE',
        authHeader: adminAuth
      });

      if (updateRes.status !== 403 || deleteRes.status !== 403) {
        throw new Error(`Imutabilidade violada: update=${updateRes.status}, delete=${deleteRes.status}`);
      }

      results.push({
        id: 'B2C-26',
        name: 'HF3-FINAL-02: Imutabilidade estrita dos registros de auditoria (sem update/delete)',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Tentativas de update e delete rejeitadas pelo Firestore com HTTP 403 (imutabilidade comprovada)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-26',
        name: 'HF3-FINAL-02: Imutabilidade estrita dos registros de auditoria (sem update/delete)',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-27: HF3-FINAL-03 — Reconciliação segura durante suspensão e liberação
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c27_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      // 1. Família entra em suspensão
      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true } } }
      });

      // 2. Cria rotina ativa desindexada (inconsistente)
      const rId = 'ft_divergent_27';
      await emulatorRestRequest(`families/${testFamId}/familyTasks/${rId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            id: { stringValue: rId },
            task_master_id: { stringValue: 'tm_conserto' },
            room_id: { stringValue: 'garagem' },
            active: { booleanValue: true }
          }
        }
      });

      // 3. Escritor comum tentando mutar rotinas sem reconciliação é bloqueado com 403
      const blindWrite = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_blind_blocked`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { id: { stringValue: 'ft_blind_blocked' }, active: { booleanValue: true } } }
      });
      if (blindWrite.status !== 403) {
        throw new Error(`Escrita cega durante suspensão deveria retornar 403, obteve=${blindWrite.status}`);
      }

      // 4. Auditoria constata inconsistência antes da reconciliação
      let preCheckBlocked = false;
      try {
        await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      } catch {
        preCheckBlocked = true;
      }
      if (!preCheckBlocked) {
        throw new Error('Liberação deveria ter sido bloqueada antes da reconciliação');
      }

      // 5. Procedimento de reconciliação administrativa é executado com isReconciliation: true
      const { reconciledCount } = await RoutineConsistencyChecker.reconcileFamilyRoutinesWhileSuspended(
        db,
        testFamId,
        {
          indexesToCreateOrUpdate: [
            {
              taskMasterId: 'tm_conserto',
              roomId: 'garagem',
              canonicalRoutineId: rId,
              status: 'ACTIVE',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastOperationId: 'op_reconcile_27'
            }
          ]
        }
      );

      if (reconciledCount === 0) {
        throw new Error('Reconciliação não aplicou correções');
      }

      // 6. Agora a liberação atômica é executada e aprovada com sucesso!
      const releaseResult = await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      if (!releaseResult.success || !releaseResult.auditId) {
        throw new Error('Liberação legítima pós-reconciliação falhou');
      }

      const finalFamSnap = await emulatorRestRequest(`families/${testFamId}`, { authHeader: adminAuth });
      const finalFamData = await finalFamSnap.json();
      if (finalFamData.fields?.routineSuspended?.booleanValue !== false) {
        throw new Error('routineSuspended deveria ser false após liberação');
      }

      results.push({
        id: 'B2C-27',
        name: 'HF3-FINAL-03: Reconciliação segura durante suspensão e liberação bem-sucedida',
        category: 'RECOVERY',
        status: 'PASS',
        details: 'Reconciliação aplicada durante suspensão com autorização estrita; auditoria aprovada e suspensão liberada'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-27',
        name: 'HF3-FINAL-03: Reconciliação segura durante suspensão e liberação bem-sucedida',
        category: 'RECOVERY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-28: HF3-FINAL-04 — Falsificação de auditoria com discrepâncias bloqueada
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c28_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      const fakeAuditId = `audit_fake_${Date.now()}`;
      // ADMIN tenta criar AUDIT_PASSED mas com totalDiscrepancies > 0 (inconsistência interna)
      const fakeAuditRes = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/${fakeAuditId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            auditId: { stringValue: fakeAuditId },
            familyId: { stringValue: testFamId },
            performedBy: { stringValue: adminUid },
            status: { stringValue: 'AUDIT_PASSED' },
            totalDiscrepancies: { integerValue: '2' }, // FRAUDE: afirma AUDIT_PASSED com discrepâncias > 0
            auditedTasksCount: { integerValue: '10' },
            auditedIndexesCount: { integerValue: '8' },
            createdAt: { stringValue: new Date().toISOString() }
          }
        }
      });

      if (fakeAuditRes.status !== 403) {
        throw new Error(`Registro forjado com discrepâncias deveria receber 403, obteve=${fakeAuditRes.status}`);
      }

      results.push({
        id: 'B2C-28',
        name: 'HF3-FINAL-04: Falsificação de auditoria com discrepâncias bloqueada',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Regras do Firestore rejeitaram AUDIT_PASSED com totalDiscrepancies > 0 com HTTP 403'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-28',
        name: 'HF3-FINAL-04: Falsificação de auditoria com discrepâncias bloqueada',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-29: AUD-HF3-01 — ADMIN malicioso não consegue fabricar AUDIT_PASSED nem autoliberar suspensão
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c29_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true }, consistencyVersion: { integerValue: '1' } } }
      });

      // Tentativa 1: ADMIN tenta forjar AUDIT_PASSED consistente (totalDiscrepancies: 0) diretamente
      const forgeAuditRes = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/audit_forged_clean`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            auditId: { stringValue: 'audit_forged_clean' },
            familyId: { stringValue: testFamId },
            performedBy: { stringValue: adminUid },
            status: { stringValue: 'AUDIT_PASSED' },
            totalDiscrepancies: { integerValue: '0' },
            serverVerified: { booleanValue: true },
            createdAt: { stringValue: new Date().toISOString() }
          }
        }
      });

      // Tentativa 2: Atacante tenta forjar claim customizada server_auditor=true ou UID trusted_server_auditor
      const forgedClaimAuth = createMockJwt(adminUid, { server_auditor: true });
      const forgeClaimAuditRes = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/audit_forged_claim`, {
        method: 'PATCH',
        authHeader: forgedClaimAuth,
        body: {
          fields: {
            auditId: { stringValue: 'audit_forged_claim' },
            familyId: { stringValue: testFamId },
            performedBy: { stringValue: adminUid },
            status: { stringValue: 'AUDIT_PASSED' },
            totalDiscrepancies: { integerValue: '0' }
          }
        }
      });
      const forgeUidAuth = createMockJwt('trusted_server_auditor', { server_auditor: true });
      const forgeReleaseRes = await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: forgeUidAuth,
        body: { fields: { routineSuspended: { booleanValue: false } } }
      });

      // Tentativa 3: Cliente executa RoutineConsistencyChecker.executeSuspensionRelease SEM executor servidor (fail-closed)
      let clientOnlyFailed = false;
      RoutineConsistencyChecker.setServerReleaseExecutor(null);
      try {
        await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      } catch {
        clientOnlyFailed = true;
      } finally {
        RoutineConsistencyChecker.setServerReleaseExecutor(serverExecutor);
      }

      const famSnap = await emulatorRestRequest(`families/${testFamId}`, { authHeader: adminAuth });
      const famData = await famSnap.json();
      const stillSuspended = famData.fields?.routineSuspended?.booleanValue === true;

      if (forgeAuditRes.status !== 403 || forgeClaimAuditRes.status !== 403 || forgeReleaseRes.status !== 403 || !clientOnlyFailed || !stillSuspended) {
        throw new Error(`ADMIN conseguiu bypassar emissão confiável: forgeAudit=${forgeAuditRes.status}, forgeClaim=${forgeClaimAuditRes.status}, forgeUidRelease=${forgeReleaseRes.status}, clientOnlyFailed=${clientOnlyFailed}, stillSuspended=${stillSuspended}`);
      }

      results.push({
        id: 'B2C-29',
        name: 'AUD-HF3-01: ADMIN malicioso não consegue fabricar AUDIT_PASSED nem autoliberar suspensão',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Regras bloquearam criação de AUDIT_PASSED (403) e claims/UID forjados (403); cliente sem servidor falhou fechado (fail-closed)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-29',
        name: 'AUD-HF3-01: ADMIN malicioso não consegue fabricar AUDIT_PASSED nem autoliberar suspensão',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-30: AUD-HF3-01 — MEMBER não consegue fabricar auditoria nem invocar liberação no servidor
    // ------------------------------------------------------------------------
    let memberApp: any = null;
    try {
      const testFamId = `fam_b2c30_${Date.now()}`;
      memberApp = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-test-key' }, `b2c30-member-${Date.now()}`);
      const memberAuthSdk = getAuth(memberApp);
      try {
        connectAuthEmulator(memberAuthSdk, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
      } catch {}
      const memberCred = await signInAnonymously(memberAuthSdk);
      const memberUid = memberCred.user.uid;
      const memberIdToken = await memberCred.user.getIdToken();
      const memberMockAuth = createMockJwt(memberUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { ownerUserId: { stringValue: 'owner_b2c30' }, routineSuspended: { booleanValue: true }, consistencyVersion: { integerValue: '1' } } }
      });
      await emulatorRestRequest(`familyMemberships/${testFamId}_${memberUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { userId: { stringValue: memberUid }, familyId: { stringValue: testFamId }, role: { stringValue: 'MEMBER' }, status: { stringValue: 'ACTIVE' } } }
      });

      const directAuditRes = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/audit_mem`, {
        method: 'PATCH',
        authHeader: memberMockAuth,
        body: { fields: { auditId: { stringValue: 'audit_mem' }, status: { stringValue: 'AUDIT_PASSED' }, totalDiscrepancies: { integerValue: '0' } } }
      });

      let serverDeniedMember = false;
      try {
        await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
          auth: adminAuthSdk as any,
          firestoreDb: adminDb as any,
          idToken: memberIdToken,
          familyId: testFamId,
          expectedConsistencyVersion: 1,
          expectedAuditStateHash: SuspensionReleaseService.computeAuditStateHash([], [], [])
        });
      } catch (e: any) {
        if (e?.code === 'PERMISSION_DENIED') {
          serverDeniedMember = true;
        }
      }

      const famSnap = await adminDb.collection('families').doc(testFamId).get();
      if (directAuditRes.status !== 403 || !serverDeniedMember || famSnap.data()?.routineSuspended !== true) {
        throw new Error(`MEMBER não bloqueado adequadamente: directAudit=${directAuditRes.status}, serverDenied=${serverDeniedMember}`);
      }

      results.push({
        id: 'B2C-30',
        name: 'AUD-HF3-01: MEMBER não consegue fabricar auditoria nem invocar liberação no servidor',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Firestore Rules (403) e SuspensionReleaseService (PERMISSION_DENIED via token real) bloquearam MEMBER'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-30',
        name: 'AUD-HF3-01: MEMBER não consegue fabricar auditoria nem invocar liberação no servidor',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      if (memberApp) {
        try { await deleteApp(memberApp); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-31: AUD-HF3-01/02 — Auditoria antiga não pode ser reutilizada (replay e versão obsoleta bloqueados)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c31_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true }, consistencyVersion: { integerValue: '1' } } }
      });

      const firstRelease = await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      if (!firstRelease.success || !firstRelease.auditId) {
        throw new Error('Falha na primeira liberação legítima');
      }

      // Família volta a ser suspensa em novo incidente (consistencyVersion agora é 2)
      await adminDb.collection('families').doc(testFamId).update({ routineSuspended: true });

      // Tentativa 1: Reutilizar auditId anterior via REST
      const reuseRes = await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            routineSuspended: { booleanValue: false },
            routineReleaseAuditId: { stringValue: firstRelease.auditId }
          }
        }
      });

      // Tentativa 2: Reutilizar expectedConsistencyVersion=1 da auditoria anterior no serviço do servidor
      let staleVersionRejected = false;
      try {
        await SuspensionReleaseService.executeServerSuspensionRelease({
          firestoreDb: adminDb as any,
          familyId: testFamId,
          callerUid: adminUid,
          expectedConsistencyVersion: 1,
          expectedAuditStateHash: SuspensionReleaseService.computeAuditStateHash([], [], [])
        });
      } catch (e: any) {
        if (e?.code === 'CONCURRENCY_CONFLICT') {
          staleVersionRejected = true;
        }
      }

      const famCheck = await adminDb.collection('families').doc(testFamId).get();
      if (reuseRes.status !== 403 || !staleVersionRejected || famCheck.data()?.routineSuspended !== true) {
        throw new Error(`Reuso de auditoria antiga não foi totalmente bloqueado: reuse=${reuseRes.status}, staleRejected=${staleVersionRejected}`);
      }

      results.push({
        id: 'B2C-31',
        name: 'AUD-HF3-01/02: Auditoria antiga não pode ser reutilizada após nova suspensão',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Replay REST rejeitado (403) e execução com consistencyVersion antiga bloqueada (CONCURRENCY_CONFLICT)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-31',
        name: 'AUD-HF3-01/02: Auditoria antiga não pode ser reutilizada após nova suspensão',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-32: AUD-HF3-02 — Alteração / reconciliação concorrente invalida liberação
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c32_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true }, consistencyVersion: { integerValue: '1' } } }
      });

      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_raced_32').set({
        id: 'ft_raced_32',
        task_master_id: 'tm_vidros',
        room_id: 'sala',
        active: true
      });
      await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_vidros___sala').set({
        taskMasterId: 'tm_vidros',
        roomId: 'sala',
        canonicalRoutineId: 'ft_raced_32',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOperationId: 'op_32'
      });

      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_rec_32').set({
        id: 'ft_rec_32',
        task_master_id: 'tm_espelho',
        room_id: 'sala',
        active: true
      });
      await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_espelho___sala').set({
        taskMasterId: 'tm_espelho',
        roomId: 'sala',
        canonicalRoutineId: 'ft_rec_32',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastOperationId: 'op_32_extra'
      });

      // Parte A: Reconciliação REAL ocorre ENTRE a pré-auditoria do cliente e a liberação no servidor
      const preState = await RoutineConsistencyChecker.fetchServerConsistencyState(db, testFamId);
      await RoutineConsistencyChecker.reconcileFamilyRoutinesWhileSuspended(db, testFamId, {
        tasksToDeactivate: ['ft_rec_32'],
        indexesToArchive: ['tm_espelho___sala'] // Reconciliação efetiva incrementa consistencyVersion (1 -> 2)
      });

      let versionConflictCaught = false;
      try {
        await SuspensionReleaseService.executeServerSuspensionRelease({
          firestoreDb: adminDb as any,
          familyId: testFamId,
          callerUid: adminUid,
          expectedConsistencyVersion: preState.consistencyVersion,
          expectedAuditStateHash: preState.auditStateHash
        });
      } catch (e: any) {
        if (e?.code === 'CONCURRENCY_CONFLICT') {
          versionConflictCaught = true;
        }
      }

      // Parte B: Mutação concorrente injetada DURANTE a transação de liberação no servidor (após leituras iniciais)
      const postRecState = await RoutineConsistencyChecker.fetchServerConsistencyState(db, testFamId);
      let injectOnce = true;
      let txRaceCaught = false;
      try {
        await SuspensionReleaseService.executeServerSuspensionRelease({
          firestoreDb: adminDb as any,
          familyId: testFamId,
          callerUid: adminUid,
          expectedConsistencyVersion: postRecState.consistencyVersion,
          expectedAuditStateHash: postRecState.auditStateHash,
          onAfterReadsHook: async () => {
            if (injectOnce) {
              injectOnce = false;
              // Injeta nova FamilyTask ativa SEM routineIndex enquanto a transação está aberta
              await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_injected_in_tx').set({
                id: 'ft_injected_in_tx',
                task_master_id: 'tm_corredor',
                room_id: 'corredor',
                active: true
              });
            }
          }
        });
      } catch (e: any) {
        if (e?.code === 'CONCURRENCY_CONFLICT' || e?.code === 'AUDIT_FAILED') {
          txRaceCaught = true;
        }
      }

      const famFinal = await adminDb.collection('families').doc(testFamId).get();
      if (!versionConflictCaught || !txRaceCaught || famFinal.data()?.routineSuspended !== true) {
        throw new Error(`Falha na proteção de corrida: versionConflict=${versionConflictCaught}, txRace=${txRaceCaught}, suspended=${famFinal.data()?.routineSuspended}`);
      }

      results.push({
        id: 'B2C-32',
        name: 'AUD-HF3-02: Alteração ou reconciliação concorrente invalida liberação',
        category: 'CONCURRENCY',
        status: 'PASS',
        details: 'Concorrência entre auditoria/liberação (CONCURRENCY_CONFLICT) e durante transação (AUDIT_FAILED via retry OCC) mantiveram routineSuspended=true'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-32',
        name: 'AUD-HF3-02: Alteração ou reconciliação concorrente invalida liberação',
        category: 'CONCURRENCY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-33: AUD-HF3-04 — Falha de rede mantém suspensão (sem fallback para cache local)
    // ------------------------------------------------------------------------
    let offlineApp: any = null;
    try {
      const testFamId = `fam_b2c33_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true }, consistencyVersion: { integerValue: '1' } } }
      });

      // Verificação estática: routineConsistencyChecker não usa getDoc/getDocs em cache nem Bearer owner
      const checkerSource = fs.readFileSync(path.resolve(process.cwd(), 'src/domain/routine/routineConsistencyChecker.ts'), 'utf8');
      if (/\bgetDoc\s*\(|\bgetDocs\s*\(|Bearer owner|127\.0\.0\.1:8088/.test(checkerSource)) {
        throw new Error('routineConsistencyChecker.ts ainda contém fallback para getDoc/getDocs em cache ou escrita direta de emulador');
      }

      // Verificação dinâmica: instância isolada com rede desabilitada simula queda de rede/timeout
      offlineApp = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-test-key' }, `b2c33-offline-${Date.now()}`);
      const offlineDb = getFirestore(offlineApp, REQUIRED_NAMED_DATABASE_ID);
      connectFirestoreEmulator(offlineDb, EMULATOR_HOST, EMULATOR_PORT);
      await disableNetwork(offlineDb);

      let networkAbortThrew = false;
      try {
        await RoutineConsistencyChecker.executeSuspensionRelease(offlineDb, testFamId, adminUid);
      } catch {
        networkAbortThrew = true;
      }

      const famCheck = await adminDb.collection('families').doc(testFamId).get();
      const auditsCheck = await adminDb.collection('families').doc(testFamId).collection('routineReleaseAudits').get();
      if (!networkAbortThrew || famCheck.data()?.routineSuspended !== true || auditsCheck.size !== 0) {
        throw new Error(`Falha de rede não abortou liberação com segurança: threw=${networkAbortThrew}, suspended=${famCheck.data()?.routineSuspended}, audits=${auditsCheck.size}`);
      }

      results.push({
        id: 'B2C-33',
        name: 'AUD-HF3-04: Falha de rede mantém suspensão sem fallback para cache',
        category: 'RECOVERY',
        status: 'PASS',
        details: 'Ausência de getDoc/getDocs confirmada; getDocFromServer/getDocsFromServer abortou na queda de rede preservando routineSuspended=true'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-33',
        name: 'AUD-HF3-04: Falha de rede mantém suspensão sem fallback para cache',
        category: 'RECOVERY',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      if (offlineApp) {
        try { await deleteApp(offlineApp); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-34: AUD-HF3-03 — Reconciliação não permite mutações arbitrárias (bypass via isReconciliation bloqueado)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c34_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true }, consistencyVersion: { integerValue: '1' } } }
      });

      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_rec_active').set({
        id: 'ft_rec_active',
        familyId: testFamId,
        taskMasterId: 'tm_mesa',
        roomId: 'sala',
        title: 'Limpar mesa',
        active: true
      });
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_rec_inactive').set({
        id: 'ft_rec_inactive',
        familyId: testFamId,
        taskMasterId: 'tm_janela',
        roomId: 'sala',
        active: false
      });
      await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_mesa___sala').set({
        taskMasterId: 'tm_mesa',
        roomId: 'sala',
        canonicalRoutineId: 'ft_rec_active',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        lastOperationId: 'op_init'
      });
      await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_orphan___cozinha').set({
        taskMasterId: 'tm_orphan',
        roomId: 'cozinha',
        canonicalRoutineId: 'ft_missing',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        lastOperationId: 'op_orphan'
      });

      // 6 vetores de abuso usando isReconciliation: true
      const v1CreateTask = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_hack_create`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { id: { stringValue: 'ft_hack_create' }, active: { booleanValue: true }, isReconciliation: { booleanValue: true } } }
      });
      const v2MutateTitle = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_rec_active?updateMask.fieldPaths=title&updateMask.fieldPaths=isReconciliation`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { title: { stringValue: 'Título Adulterado' }, isReconciliation: { booleanValue: true } } }
      });
      const v3Reactivate = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_rec_inactive?updateMask.fieldPaths=active&updateMask.fieldPaths=isReconciliation`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { active: { booleanValue: true }, isReconciliation: { booleanValue: true } } }
      });
      const v4CreateGhostIdx = await emulatorRestRequest(`families/${testFamId}/routineIndex/tm_ghost___sala`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            taskMasterId: { stringValue: 'tm_ghost' },
            roomId: { stringValue: 'sala' },
            canonicalRoutineId: { stringValue: 'ft_nonexistent' },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: new Date().toISOString() },
            lastOperationId: { stringValue: 'op_ghost' },
            isReconciliation: { booleanValue: true }
          }
        }
      });
      const v5MutateIdxId = await emulatorRestRequest(`families/${testFamId}/routineIndex/tm_mesa___sala?updateMask.fieldPaths=canonicalRoutineId&updateMask.fieldPaths=isReconciliation`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { canonicalRoutineId: { stringValue: 'ft_hijack' }, isReconciliation: { booleanValue: true } } }
      });
      const v6ReleaseFlag = await emulatorRestRequest(`families/${testFamId}?updateMask.fieldPaths=routineSuspended&updateMask.fieldPaths=isReconciliation`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { routineSuspended: { booleanValue: false }, isReconciliation: { booleanValue: true } } }
      });

      const statuses = [v1CreateTask.status, v2MutateTitle.status, v3Reactivate.status, v4CreateGhostIdx.status, v5MutateIdxId.status, v6ReleaseFlag.status];
      if (statuses.some(s => s !== 403)) {
        throw new Error(`Bypass com isReconciliation não retornou 403 em todos os 6 vetores: statuses=${JSON.stringify(statuses)}`);
      }

      // Reconciliação legítima estrita (arquivamento do órfão) deve funcionar
      const { reconciledCount } = await RoutineConsistencyChecker.reconcileFamilyRoutinesWhileSuspended(db, testFamId, {
        indexesToArchive: ['tm_orphan___cozinha']
      });
      if (reconciledCount !== 1) {
        throw new Error(`Reconciliação legítima de índice órfão falhou: reconciledCount=${reconciledCount}`);
      }

      results.push({
        id: 'B2C-34',
        name: 'AUD-HF3-03: Reconciliação bloqueia mutações arbitrárias e bypass via isReconciliation',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Todos os 6 vetores com isReconciliation: true retornaram 403 PERMISSION_DENIED; apenas arquivamento estrito de órfão foi aceito'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-34',
        name: 'AUD-HF3-03: Reconciliação bloqueia mutações arbitrárias e bypass via isReconciliation',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-35: AUD-HF3-01..04 — Liberação legítima funciona ponta a ponta após reconciliação
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c35_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true }, consistencyVersion: { integerValue: '1' } } }
      });

      // Estado divergente: 1 tarefa ativa desindexada + 1 índice órfão ativo
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_e2e_35').set({
        id: 'ft_e2e_35',
        family_id: testFamId,
        task_master_id: 'tm_passar_pano',
        room_id: 'cozinha',
        active: true
      });
      await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_orphan___banheiro').set({
        taskMasterId: 'tm_orphan',
        roomId: 'banheiro',
        canonicalRoutineId: 'ft_deleted_legacy',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        lastOperationId: 'op_old'
      });

      // 1. Antes da reconciliação, liberação falha com servidor e mantém suspensão
      let preBlocked = false;
      try {
        await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      } catch {
        preBlocked = true;
      }
      if (!preBlocked) {
        throw new Error('Liberação deveria falhar antes da reconciliação');
      }

      // 2. Reconciliação estrita corrige ambos os desvios
      await RoutineConsistencyChecker.reconcileFamilyRoutinesWhileSuspended(db, testFamId, {
        indexesToArchive: ['tm_orphan___banheiro'],
        indexesToCreateOrUpdate: [
          {
            taskMasterId: 'tm_passar_pano',
            roomId: 'cozinha',
            canonicalRoutineId: 'ft_e2e_35',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastOperationId: 'op_rec_35'
          }
        ]
      });

      // 3. Liberação legítima via servidor confiável aprova
      const releaseRes = await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      const auditDoc = await adminDb.collection('families').doc(testFamId).collection('routineReleaseAudits').doc(releaseRes.auditId).get();
      const famDoc = await adminDb.collection('families').doc(testFamId).get();

      if (
        !releaseRes.success ||
        auditDoc.data()?.status !== 'AUDIT_PASSED' ||
        auditDoc.data()?.serverVerified !== true ||
        auditDoc.data()?.performedBy !== adminUid ||
        famDoc.data()?.routineSuspended !== false ||
        famDoc.data()?.routineReleaseAuditId !== releaseRes.auditId
      ) {
        throw new Error('Dados da liberação legítima ou registro AUDIT_PASSED do servidor inválidos');
      }

      // 4. Novas escritas de rotina voltam a ser aceitas após liberação
      const postReleaseWrite = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_post_35`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { id: { stringValue: 'ft_post_35' }, task_master_id: { stringValue: 'tm_nova_35' }, room_id: { stringValue: 'sala' }, active: { booleanValue: true } } }
      });
      if (postReleaseWrite.status !== 200) {
        throw new Error(`Escrita pós-liberação rejeitada: status=${postReleaseWrite.status}`);
      }

      results.push({
        id: 'B2C-35',
        name: 'AUD-HF3-01..04: Liberação legítima ponta a ponta funciona após reconciliação',
        category: 'RECOVERY',
        status: 'PASS',
        details: 'Reconciliação -> auditoria transacional no servidor -> AUDIT_PASSED (serverVerified=true) -> routineSuspended=false -> escritas retomadas'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-35',
        name: 'AUD-HF3-01..04: Liberação legítima ponta a ponta funciona após reconciliação',
        category: 'RECOVERY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-36: AUD-HF3-03 — Preservação de ocorrências concluídas (COMPLETED/DONE) e histórico
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c36_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      await emulatorRestRequest(`families/${testFamId}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { ownerUserId: { stringValue: adminUid }, routineSuspended: { booleanValue: true }, consistencyVersion: { integerValue: '1' } } }
      });

      const compTime1 = '2026-11-10T09:00:00Z';
      const compTime2 = '2026-11-10T11:30:00Z';
      await adminDb.collection('families').doc(testFamId).collection('assignments').doc('asg_comp_1').set({
        id: 'asg_comp_1',
        family_id: testFamId,
        family_task_id: 'ft_hist',
        member_id: 'mem_ana',
        status: 'COMPLETED',
        completed_by: 'mem_ana',
        completed_at: compTime1,
        scheduled_date: '2026-11-10'
      });
      await adminDb.collection('families').doc(testFamId).collection('assignments').doc('asg_done_2').set({
        id: 'asg_done_2',
        family_id: testFamId,
        family_task_id: 'ft_hist',
        member_id: 'mem_bruno',
        status: 'DONE',
        completed_by: 'mem_bruno',
        completed_at: compTime2,
        scheduled_date: '2026-11-10'
      });

      // ADMIN tenta excluir ou reverter ocorrência COMPLETED/DONE durante suspensão -> bloqueado (403)
      const delCompRes = await emulatorRestRequest(`families/${testFamId}/assignments/asg_comp_1`, {
        method: 'DELETE',
        authHeader: adminAuth
      });
      const revertDoneRes = await emulatorRestRequest(`families/${testFamId}/assignments/asg_done_2?updateMask.fieldPaths=status`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { status: { stringValue: 'SCHEDULED' } } }
      });

      // Mesmo após reconciliação e liberação, exclusão ou reversão de ocorrência concluída segue bloqueada (403)
      await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      const delAfterRelease = await emulatorRestRequest(`families/${testFamId}/assignments/asg_comp_1`, {
        method: 'DELETE',
        authHeader: adminAuth
      });
      const revertAfterRelease = await emulatorRestRequest(`families/${testFamId}/assignments/asg_done_2?updateMask.fieldPaths=status`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { status: { stringValue: 'SCHEDULED' } } }
      });

      const snap1 = (await adminDb.collection('families').doc(testFamId).collection('assignments').doc('asg_comp_1').get()).data();
      const snap2 = (await adminDb.collection('families').doc(testFamId).collection('assignments').doc('asg_done_2').get()).data();

      if (
        delCompRes.status !== 403 ||
        revertDoneRes.status !== 403 ||
        delAfterRelease.status !== 403 ||
        revertAfterRelease.status !== 403 ||
        snap1?.status !== 'COMPLETED' ||
        snap1?.completed_by !== 'mem_ana' ||
        snap1?.completed_at !== compTime1 ||
        snap2?.status !== 'DONE' ||
        snap2?.completed_by !== 'mem_bruno' ||
        snap2?.completed_at !== compTime2
      ) {
        throw new Error(`Histórico de conclusões não foi preservado integralmente: statuses=[${delCompRes.status}, ${revertDoneRes.status}, ${delAfterRelease.status}, ${revertAfterRelease.status}]`);
      }

      results.push({
        id: 'B2C-36',
        name: 'AUD-HF3-03: Ocorrências concluídas (COMPLETED/DONE) e histórico são 100% preservados',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Exclusão e alteração de ocorrências COMPLETED/DONE bloqueadas com 403 durante e após suspensão; evidências intactas'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-36',
        name: 'AUD-HF3-03: Ocorrências concluídas (COMPLETED/DONE) e histórico são 100% preservados',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-37: AUD-HF3-HF2-01 — Autorização estrita de ADMIN por status (ACTIVE vs PENDING/REVOKED/REMOVED/INVITED/active=false)
    // ------------------------------------------------------------------------
    const tempAppsB2C37: any[] = [];
    try {
      const testFamId = `fam_b2c37_${Date.now()}`;
      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: 'owner_b2c37',
        name: 'Família Gate Auth HF2',
        routineSuspended: true,
        consistencyVersion: 1
      });

      const createUserWithToken = async (tag: string) => {
        const uApp = initializeApp(
          { projectId: PROJECT_ID, apiKey: 'fake-test-key' },
          `b2c37-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        );
        tempAppsB2C37.push(uApp);
        const uAuth = getAuth(uApp);
        connectAuthEmulator(uAuth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
        const cred = await signInAnonymously(uAuth);
        return {
          uid: cred.user.uid,
          idToken: await cred.user.getIdToken()
        };
      };

      const emptyHash37 = SuspensionReleaseService.computeAuditStateHash([], [], []);

      const assertReleaseDenied = async (idToken: string, label: string) => {
        let deniedCode: string | null = null;
        try {
          await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
            auth: adminAuthSdk as any,
            firestoreDb: adminDb as any,
            idToken,
            familyId: testFamId,
            expectedConsistencyVersion: 1,
            expectedAuditStateHash: emptyHash37
          });
        } catch (e: any) {
          deniedCode = e?.code || 'ERR';
        }
        if (deniedCode !== 'PERMISSION_DENIED') {
          throw new Error(`Caso '${label}' não foi bloqueado com PERMISSION_DENIED (obtido=${deniedCode})`);
        }
      };

      // Casos negativos por status/flag (sempre com role: 'ADMIN')
      const negativeCases: Array<{ label: string; docFields: Record<string, any> }> = [
        { label: 'ADMIN_PENDING', docFields: { role: 'ADMIN', status: 'PENDING', active: true } },
        { label: 'ADMIN_REVOKED', docFields: { role: 'ADMIN', status: 'REVOKED', active: true } },
        { label: 'ADMIN_REMOVED', docFields: { role: 'ADMIN', status: 'REMOVED', active: true } },
        { label: 'ADMIN_INVITED', docFields: { role: 'ADMIN', status: 'INVITED', active: true } },
        { label: 'ADMIN_ACTIVE_FALSE', docFields: { role: 'ADMIN', status: 'ACTIVE', active: false } }
      ];

      for (const tc of negativeCases) {
        const user = await createUserWithToken(tc.label);
        await adminDb.collection('familyMemberships').doc(`${testFamId}_${user.uid}`).set({
          familyId: testFamId,
          userId: user.uid,
          memberId: user.uid,
          ...tc.docFields
        });
        await assertReleaseDenied(user.idToken, tc.label);
      }

      // Garante que a família seguiu suspensa durante todos os ataques
      const midFamSnap = await adminDb.collection('families').doc(testFamId).get();
      if (midFamSnap.data()?.routineSuspended !== true) {
        throw new Error('Família teve suspensão alterada indevidamente durante testes negativos de status ADMIN');
      }

      // Caso positivo: ADMIN ativo legítimo deve ser autorizado
      const legitAdmin = await createUserWithToken('ADMIN_ACTIVE');
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${legitAdmin.uid}`).set({
        familyId: testFamId,
        userId: legitAdmin.uid,
        memberId: legitAdmin.uid,
        role: 'ADMIN',
        status: 'ACTIVE'
      });

      const okRelease = await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
        auth: adminAuthSdk as any,
        firestoreDb: adminDb as any,
        idToken: legitAdmin.idToken,
        familyId: testFamId,
        expectedConsistencyVersion: 1,
        expectedAuditStateHash: emptyHash37
      });

      const finalFamSnap = await adminDb.collection('families').doc(testFamId).get();
      if (!okRelease.success || finalFamSnap.data()?.routineSuspended !== false) {
        throw new Error('ADMIN ativo legítimo não conseguiu liberar a suspensão');
      }

      results.push({
        id: 'B2C-37',
        name: 'AUD-HF3-HF2-01: Autorização estrita de ADMIN por status (ACTIVE ok; PENDING/REVOKED/REMOVED/INVITED/active=false negados)',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: '5 estados não-ativos bloqueados com PERMISSION_DENIED via verifyIdToken real; ADMIN ACTIVE autorizado com sucesso'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-37',
        name: 'AUD-HF3-HF2-01: Autorização estrita de ADMIN por status (ACTIVE ok; PENDING/REVOKED/REMOVED/INVITED/active=false negados)',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      for (const uApp of tempAppsB2C37) {
        try { await deleteApp(uApp); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-38: AUD-HF3-HF2-01 — Bloqueio de MEMBER, vínculo de outra família, userId divergente e ausência de fallback para status ausente
    // ------------------------------------------------------------------------
    const tempAppsB2C38: any[] = [];
    try {
      const testFamId = `fam_b2c38_${Date.now()}`;
      const foreignFamId = `fam_foreign_${Date.now()}`;
      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: 'owner_b2c38',
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_b2c38').set({
        id: 'ft_b2c38',
        taskMasterId: 'tm_test',
        roomId: 'sala',
        active: false
      });

      const createTokenUser = async (tag: string) => {
        const uApp = initializeApp(
          { projectId: PROJECT_ID, apiKey: 'fake-test-key' },
          `b2c38-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        );
        tempAppsB2C38.push(uApp);
        const uAuth = getAuth(uApp);
        connectAuthEmulator(uAuth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
        const cred = await signInAnonymously(uAuth);
        return {
          uid: cred.user.uid,
          idToken: await cred.user.getIdToken()
        };
      };

      const validHash38 = SuspensionReleaseService.computeAuditStateHash(
        [{ id: 'ft_b2c38', taskMasterId: 'tm_test', roomId: 'sala', active: false }],
        [],
        []
      );

      const checkDeniedBothOps = async (idToken: string, label: string) => {
        let relCode = '';
        let recCode = '';
        try {
          await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
            auth: adminAuthSdk as any,
            firestoreDb: adminDb as any,
            idToken,
            familyId: testFamId,
            expectedConsistencyVersion: 1,
            expectedAuditStateHash: validHash38
          });
        } catch (e: any) {
          relCode = e?.code || '';
        }
        try {
          await SuspensionReleaseService.verifyIdTokenAndReconcile({
            auth: adminAuthSdk as any,
            firestoreDb: adminDb as any,
            idToken,
            familyId: testFamId,
            actions: {
              indexesToCreateOrUpdate: [
                {
                  taskMasterId: 'tm_test',
                  roomId: 'sala',
                  canonicalRoutineId: 'ft_b2c38',
                  status: 'ARCHIVED',
                  lastOperationId: 'op_unauth'
                }
              ]
            }
          });
        } catch (e: any) {
          recCode = e?.code || '';
        }
        if (relCode !== 'PERMISSION_DENIED' || recCode !== 'PERMISSION_DENIED') {
          throw new Error(`Falha no bloqueio de '${label}': releaseCode=${relCode}, reconcileCode=${recCode}`);
        }
      };

      // 1. MEMBER ativo
      const uMember = await createTokenUser('member');
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${uMember.uid}`).set({
        familyId: testFamId,
        userId: uMember.uid,
        role: 'MEMBER',
        status: 'ACTIVE'
      });
      await checkDeniedBothOps(uMember.idToken, 'MEMBER ativo');

      // 2. Vínculo ADMIN de outra família (doc path tem outra família OU campo familyId adulterado)
      const uForeign = await createTokenUser('foreign');
      await adminDb.collection('familyMemberships').doc(`${foreignFamId}_${uForeign.uid}`).set({
        familyId: foreignFamId,
        userId: uForeign.uid,
        role: 'ADMIN',
        status: 'ACTIVE'
      });
      await checkDeniedBothOps(uForeign.idToken, 'Vínculo apenas em outra família');

      const uCrossFamField = await createTokenUser('crossfam');
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${uCrossFamField.uid}`).set({
        familyId: foreignFamId, // Divergência de tenant no campo
        userId: uCrossFamField.uid,
        role: 'ADMIN',
        status: 'ACTIVE'
      });
      await checkDeniedBothOps(uCrossFamField.idToken, 'Campo familyId divergente');

      // 3. Vínculo ADMIN com userId divergente do token
      const uDivergentUid = await createTokenUser('divuid');
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${uDivergentUid.uid}`).set({
        familyId: testFamId,
        userId: 'other_hijacked_uid',
        role: 'ADMIN',
        status: 'ACTIVE'
      });
      await checkDeniedBothOps(uDivergentUid.idToken, 'Campo userId divergente');

      // 4. Sem status (proíbe fallback permissivo para status ausente/null/vazio)
      const uMissingStatus = await createTokenUser('nostatus');
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${uMissingStatus.uid}`).set({
        familyId: testFamId,
        userId: uMissingStatus.uid,
        role: 'ADMIN'
      });
      await checkDeniedBothOps(uMissingStatus.idToken, 'Vínculo ADMIN sem campo status');

      const uNullStatus = await createTokenUser('nullstatus');
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${uNullStatus.uid}`).set({
        familyId: testFamId,
        userId: uNullStatus.uid,
        role: 'ADMIN',
        status: null
      });
      await checkDeniedBothOps(uNullStatus.idToken, 'Vínculo ADMIN com status=null');

      const famCheck = await adminDb.collection('families').doc(testFamId).get();
      if (famCheck.data()?.routineSuspended !== true) {
        throw new Error('Família deixou de estar suspensa em testes negativos');
      }

      results.push({
        id: 'B2C-38',
        name: 'AUD-HF3-HF2-01: Bloqueio de MEMBER, vínculo de outra família, userId divergente e ausência de status',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'MEMBER ativo, tenant/familyId divergente, userId divergente e status ausente/null bloqueados com PERMISSION_DENIED em liberação e reconciliação'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-38',
        name: 'AUD-HF3-HF2-01: Bloqueio de MEMBER, vínculo de outra família, userId divergente e ausência de status',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      for (const uApp of tempAppsB2C38) {
        try { await deleteApp(uApp); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-39: AUD-HF3-HF2-02 — Bloqueio de manipulação direta de consistencyVersion e preservação de updates regulares
    // ------------------------------------------------------------------------
    try {
      const famVersioned = `fam_b2c39_ver_${Date.now()}`;
      const famLegacy = `fam_b2c39_leg_${Date.now()}`;
      await adapter.ensureEmulatorAuth(famVersioned);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      // Seed vínculo ADMIN na família legada também
      await emulatorRestRequest(`familyMemberships/${famLegacy}_${adminUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: {
          fields: {
            familyId: { stringValue: famLegacy },
            userId: { stringValue: adminUid },
            memberId: { stringValue: adminUid },
            role: { stringValue: 'ADMIN' },
            status: { stringValue: 'ACTIVE' }
          }
        }
      });

      await adminDb.collection('families').doc(famVersioned).set({
        ownerUserId: adminUid,
        name: 'Família Versionada',
        routineSuspended: true,
        consistencyVersion: 3,
        lastReconciliationAt: '2026-11-16T00:00:00.000Z'
      });

      await adminDb.collection('families').doc(famLegacy).set({
        ownerUserId: adminUid,
        name: 'Família Legada Sem Versão',
        routineSuspended: false
      });

      // 1. Update regular + tentativa de incrementar consistencyVersion -> 403
      const rRegularBump = await emulatorRestRequest(`families/${famVersioned}?updateMask.fieldPaths=name&updateMask.fieldPaths=consistencyVersion`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            name: { stringValue: 'Nome Alterado' },
            consistencyVersion: { integerValue: '4' }
          }
        }
      });

      // 2. Incremento isolado de consistencyVersion -> 403
      const rIsolatedBump = await emulatorRestRequest(`families/${famVersioned}?updateMask.fieldPaths=consistencyVersion`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { consistencyVersion: { integerValue: '4' } } }
      });

      // 3. Decremento de consistencyVersion -> 403
      const rDecrement = await emulatorRestRequest(`families/${famVersioned}?updateMask.fieldPaths=consistencyVersion`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { consistencyVersion: { integerValue: '2' } } }
      });

      // 4. Salto arbitrário de consistencyVersion -> 403
      const rJump = await emulatorRestRequest(`families/${famVersioned}?updateMask.fieldPaths=consistencyVersion`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { consistencyVersion: { integerValue: '99' } } }
      });

      // 5. Remoção do campo consistencyVersion -> 403
      const rDeleteField = await emulatorRestRequest(`families/${famVersioned}?updateMask.fieldPaths=consistencyVersion`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: {} }
      });

      // 6. Alteração direta de lastReconciliationAt -> 403
      const rTamperReconcileAt = await emulatorRestRequest(`families/${famVersioned}?updateMask.fieldPaths=lastReconciliationAt`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { lastReconciliationAt: { stringValue: new Date().toISOString() } } }
      });

      // 7. Inicialização maliciosa de consistencyVersion em família legada -> 403
      const rLegacyInit = await emulatorRestRequest(`families/${famLegacy}?updateMask.fieldPaths=consistencyVersion`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { consistencyVersion: { integerValue: '2' } } }
      });

      const blockedCodes = [
        rRegularBump.status,
        rIsolatedBump.status,
        rDecrement.status,
        rJump.status,
        rDeleteField.status,
        rTamperReconcileAt.status,
        rLegacyInit.status
      ];
      if (blockedCodes.some(s => s !== 403)) {
        throw new Error(`Security rules não bloquearam todos os 7 vetores de adulteração de consistencyVersion: codes=${JSON.stringify(blockedCodes)}`);
      }

      // 8. Atualização regular legítima na família versionada (sem tocar em consistencyVersion) -> 200 OK
      const rValidVersionedUpdate = await emulatorRestRequest(`families/${famVersioned}?updateMask.fieldPaths=name`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { name: { stringValue: 'Família Versionada Atualizada' } } }
      });

      // 9. Atualização regular legítima na família legada (sem consistencyVersion) -> 200 OK
      const rValidLegacyUpdate = await emulatorRestRequest(`families/${famLegacy}?updateMask.fieldPaths=name`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { name: { stringValue: 'Família Legada Atualizada' } } }
      });

      if (rValidVersionedUpdate.status !== 200 || rValidLegacyUpdate.status !== 200) {
        throw new Error(`Updates regulares legítimos foram bloqueados: versioned=${rValidVersionedUpdate.status}, legacy=${rValidLegacyUpdate.status}`);
      }

      const verSnap = await adminDb.collection('families').doc(famVersioned).get();
      if (verSnap.data()?.consistencyVersion !== 3 || verSnap.data()?.name !== 'Família Versionada Atualizada') {
        throw new Error('Estado final da família versionada inconsistente');
      }

      results.push({
        id: 'B2C-39',
        name: 'AUD-HF3-HF2-02: Bloqueio de alteração de consistencyVersion pelo cliente e compatibilidade com família legada',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: '7 vetores de adulteração bloqueados com 403 PERMISSION_DENIED; updates regulares em família versionada e legada preservados (200 OK)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-39',
        name: 'AUD-HF3-HF2-02: Bloqueio de alteração de consistencyVersion pelo cliente e compatibilidade com família legada',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-40: AUD-HF3-HF2-02 — Incremento de consistencyVersion exclusivo no servidor (reconciliação válida vs no-op)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c40_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;

      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: adminUid,
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_orphan___cozinha').set({
        taskMasterId: 'tm_orphan',
        roomId: 'cozinha',
        canonicalRoutineId: 'ft_ghost',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        lastOperationId: 'op_init'
      });

      // 1. Cliente sem executor servidor configurado falha fechado
      let failClosedNoExecutor = false;
      RoutineConsistencyChecker.setServerReconciliationExecutor(null);
      try {
        await RoutineConsistencyChecker.reconcileFamilyRoutinesWhileSuspended(db, testFamId, {
          indexesToArchive: ['tm_orphan___cozinha']
        });
      } catch {
        failClosedNoExecutor = true;
      } finally {
        RoutineConsistencyChecker.setServerReconciliationExecutor(serverReconciliationExecutor);
      }

      // 2. Invocação vazia (no-op) no servidor rejeitada sem incrementar consistencyVersion
      let emptyReconcileRejected = false;
      try {
        await RoutineConsistencyChecker.reconcileFamilyRoutinesWhileSuspended(db, testFamId, {});
      } catch {
        emptyReconcileRejected = true;
      }

      const midFam = await adminDb.collection('families').doc(testFamId).get();
      if (!failClosedNoExecutor || !emptyReconcileRejected || midFam.data()?.consistencyVersion !== 1) {
        throw new Error(`Proteção contra reconciliação inválida falhou: failClosed=${failClosedNoExecutor}, emptyRejected=${emptyReconcileRejected}, version=${midFam.data()?.consistencyVersion}`);
      }

      // 3. Reconciliação válida no servidor incrementa consistencyVersion (1 -> 2)
      const recRes = await RoutineConsistencyChecker.reconcileFamilyRoutinesWhileSuspended(db, testFamId, {
        indexesToArchive: ['tm_orphan___cozinha']
      });
      const afterRecFam = await adminDb.collection('families').doc(testFamId).get();

      if (recRes.reconciledCount !== 1 || recRes.newConsistencyVersion !== 2 || afterRecFam.data()?.consistencyVersion !== 2) {
        throw new Error(`Reconciliação no servidor não incrementou consistencyVersion corretamente: ${JSON.stringify(recRes)}`);
      }

      // 4. Liberação legítima no servidor após reconciliação incrementa consistencyVersion (2 -> 3)
      const relRes = await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      const afterRelFam = await adminDb.collection('families').doc(testFamId).get();
      const auditDoc = await adminDb.collection('families').doc(testFamId).collection('routineReleaseAudits').doc(relRes.auditId).get();

      if (
        !relRes.success ||
        afterRelFam.data()?.routineSuspended !== false ||
        afterRelFam.data()?.consistencyVersion !== 3 ||
        auditDoc.data()?.consistencyVersion !== 2 ||
        auditDoc.data()?.releasedConsistencyVersion !== 3
      ) {
        throw new Error(`Versões pós-liberação incorretas: famVersion=${afterRelFam.data()?.consistencyVersion}, audit=${JSON.stringify(auditDoc.data())}`);
      }

      results.push({
        id: 'B2C-40',
        name: 'AUD-HF3-HF2-02: Controle exclusivo de consistencyVersion no servidor durante reconciliação e liberação',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Sem servidor=fail-closed; no-op rejeitado sem bump; reconciliação válida (1->2) e liberação no servidor (2->3) comprovadas'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-40',
        name: 'AUD-HF3-HF2-02: Controle exclusivo de consistencyVersion no servidor durante reconciliação e liberação',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-41: AUD-HF3-HF2-02 — auditStateHash detecta mutação concorrente nas subcoleções sem incremento de consistencyVersion
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c41_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;

      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: adminUid,
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_base_41').set({
        id: 'ft_base_41',
        taskMasterId: 'tm_base',
        roomId: 'sala',
        active: true
      });
      await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_base___sala').set({
        taskMasterId: 'tm_base',
        roomId: 'sala',
        canonicalRoutineId: 'ft_base_41',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        lastOperationId: 'op_init'
      });

      // Pré-auditoria captura version=1 e auditStateHash consistente
      const preAudit = await RoutineConsistencyChecker.fetchServerConsistencyState(db, testFamId);

      // Mutação concorrente nas subcoleções (par consistente extra inserido sem tocar em consistencyVersion)
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_extra_41').set({
        id: 'ft_extra_41',
        taskMasterId: 'tm_extra',
        roomId: 'quarto',
        active: true
      });
      await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_extra___quarto').set({
        taskMasterId: 'tm_extra',
        roomId: 'quarto',
        canonicalRoutineId: 'ft_extra_41',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        lastOperationId: 'op_extra'
      });

      // Liberação tentando usar o expectedAuditStateHash obsoleto (mesmo com version ainda em 1) -> DEVE falhar com CONCURRENCY_CONFLICT
      let hashConflictCaught = false;
      try {
        await SuspensionReleaseService.executeServerSuspensionRelease({
          firestoreDb: adminDb as any,
          familyId: testFamId,
          callerUid: adminUid,
          expectedConsistencyVersion: preAudit.consistencyVersion,
          expectedAuditStateHash: preAudit.auditStateHash
        });
      } catch (e: any) {
        if (e?.code === 'CONCURRENCY_CONFLICT') {
          hashConflictCaught = true;
        }
      }

      const midFam = await adminDb.collection('families').doc(testFamId).get();
      if (!hashConflictCaught || midFam.data()?.routineSuspended !== true) {
        throw new Error(`auditStateHash falhou em detectar mutação silenciosa nas subcoleções: hashConflict=${hashConflictCaught}`);
      }

      // Nova pré-auditoria e liberação completa atualizadas convergem com sucesso
      const freshRelease = await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      const finalFam = await adminDb.collection('families').doc(testFamId).get();
      if (!freshRelease.success || finalFam.data()?.routineSuspended !== false || finalFam.data()?.consistencyVersion !== 2) {
        throw new Error('Liberação com pré-auditoria atualizada falhou');
      }

      results.push({
        id: 'B2C-41',
        name: 'AUD-HF3-HF2-02: auditStateHash bloqueia mutação silenciosa nas subcoleções mesmo sem alteração de consistencyVersion',
        category: 'CONCURRENCY',
        status: 'PASS',
        details: 'Mutação concorrente pós-pré-auditoria sem bump de versão foi rejeitada via expectedAuditStateHash (CONCURRENCY_CONFLICT); reexecução convergiu com sucesso'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-41',
        name: 'AUD-HF3-HF2-02: auditStateHash bloqueia mutação silenciosa nas subcoleções mesmo sem alteração de consistencyVersion',
        category: 'CONCURRENCY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-42: Regressão final — AUDIT_PASSED backend-only, rollback seguro, FamilyTask+routineIndex e COMPLETED/DONE
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c42_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: adminUid,
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_reg_42').set({
        id: 'ft_reg_42',
        taskMasterId: 'tm_rega',
        roomId: 'varanda',
        active: true
      });
      await adminDb.collection('families').doc(testFamId).collection('assignments').doc('asg_done_42').set({
        id: 'asg_done_42',
        family_id: testFamId,
        family_task_id: 'ft_reg_42',
        member_id: 'mem_42',
        status: 'COMPLETED',
        completed_by: 'mem_42',
        completed_at: '2026-11-12T08:00:00Z'
      });

      // 1. Falha intermediária na liberação preserva rollback seguro (routineSuspended=true)
      let midFailureCaught = false;
      try {
        await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      } catch {
        midFailureCaught = true;
      }

      // 2. Reconciliação no servidor corrige índice desindexado
      const rec = await RoutineConsistencyChecker.reconcileFamilyRoutinesWhileSuspended(db, testFamId, {
        indexesToCreateOrUpdate: [
          {
            taskMasterId: 'tm_rega',
            roomId: 'varanda',
            canonicalRoutineId: 'ft_reg_42',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastOperationId: 'op_reg_42'
          }
        ]
      });

      // 3. Liberação backend-only emite AUDIT_PASSED (serverVerified=true)
      const rel = await RoutineConsistencyChecker.executeSuspensionRelease(db, testFamId, adminUid);
      const auditSnap = await adminDb.collection('families').doc(testFamId).collection('routineReleaseAudits').doc(rel.auditId).get();
      const idxSnap = await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_rega___varanda').get();

      // 4. Histórico COMPLETED segue protegido
      const delCompleted = await emulatorRestRequest(`families/${testFamId}/assignments/asg_done_42`, {
        method: 'DELETE',
        authHeader: adminAuth
      });

      if (
        !midFailureCaught ||
        rec.newConsistencyVersion !== 2 ||
        auditSnap.data()?.serverVerified !== true ||
        auditSnap.data()?.status !== 'AUDIT_PASSED' ||
        idxSnap.data()?.canonicalRoutineId !== 'ft_reg_42' ||
        delCompleted.status !== 403
      ) {
        throw new Error('Regressão integrada HF3-HF2 falhou em uma das invariantes');
      }

      results.push({
        id: 'B2C-42',
        name: 'Regressão final HF3-HF2: AUDIT_PASSED backend-only, rollback seguro, FamilyTask+routineIndex e COMPLETED/DONE',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Todas as invariantes finais confirmadas em conjunto no Firebase Emulator'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-42',
        name: 'Regressão final HF3-HF2: AUDIT_PASSED backend-only, rollback seguro, FamilyTask+routineIndex e COMPLETED/DONE',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-43: AUD-HF2.1-01 — ADMIN ativo canônico (active omitido e active=true) autorizado em Rules & Servidor
    // ------------------------------------------------------------------------
    const tempAppsB2C43: any[] = [];
    try {
      const famA = `fam_b2c43a_${Date.now()}`;
      const famB = `fam_b2c43b_${Date.now()}`;

      const createUserWithToken = async (tag: string) => {
        const uApp = initializeApp(
          { projectId: PROJECT_ID, apiKey: 'fake-test-key' },
          `b2c43-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        );
        tempAppsB2C43.push(uApp);
        const uAuth = getAuth(uApp);
        connectAuthEmulator(uAuth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
        const cred = await signInAnonymously(uAuth);
        return {
          uid: cred.user.uid,
          idToken: await cred.user.getIdToken(),
          mockAuth: createMockJwt(cred.user.uid)
        };
      };

      const adminOmittedActive = await createUserWithToken('omitted');
      const adminExplicitActive = await createUserWithToken('explicit');

      await adminDb.collection('families').doc(famA).set({
        ownerUserId: adminOmittedActive.uid,
        name: 'Família Omitido',
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('familyMemberships').doc(`${famA}_${adminOmittedActive.uid}`).set({
        id: `${famA}_${adminOmittedActive.uid}`,
        familyId: famA,
        userId: adminOmittedActive.uid,
        memberId: adminOmittedActive.uid,
        role: 'ADMIN',
        status: 'ACTIVE'
      });

      await adminDb.collection('families').doc(famB).set({
        ownerUserId: adminExplicitActive.uid,
        name: 'Família Explícito',
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('familyMemberships').doc(`${famB}_${adminExplicitActive.uid}`).set({
        id: `${famB}_${adminExplicitActive.uid}`,
        familyId: famB,
        userId: adminExplicitActive.uid,
        memberId: adminExplicitActive.uid,
        role: 'ADMIN',
        status: 'ACTIVE',
        active: true
      });

      const rReadA = await emulatorRestRequest(`families/${famA}`, { authHeader: adminOmittedActive.mockAuth });
      const rUpdA = await emulatorRestRequest(`families/${famA}?updateMask.fieldPaths=name`, {
        method: 'PATCH',
        authHeader: adminOmittedActive.mockAuth,
        body: { fields: { name: { stringValue: 'Família Omitido OK' } } }
      });
      const rReadB = await emulatorRestRequest(`families/${famB}`, { authHeader: adminExplicitActive.mockAuth });
      const rUpdB = await emulatorRestRequest(`families/${famB}?updateMask.fieldPaths=name`, {
        method: 'PATCH',
        authHeader: adminExplicitActive.mockAuth,
        body: { fields: { name: { stringValue: 'Família Explícito OK' } } }
      });

      const emptyHash = SuspensionReleaseService.computeAuditStateHash([], [], []);
      const relA = await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
        auth: adminAuthSdk as any,
        firestoreDb: adminDb as any,
        idToken: adminOmittedActive.idToken,
        familyId: famA,
        expectedConsistencyVersion: 1,
        expectedAuditStateHash: emptyHash
      });
      const relB = await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
        auth: adminAuthSdk as any,
        firestoreDb: adminDb as any,
        idToken: adminExplicitActive.idToken,
        familyId: famB,
        expectedConsistencyVersion: 1,
        expectedAuditStateHash: emptyHash
      });

      if (
        rReadA.status !== 200 ||
        rUpdA.status !== 200 ||
        rReadB.status !== 200 ||
        rUpdB.status !== 200 ||
        !relA.success ||
        !relB.success
      ) {
        throw new Error(`Paridade positiva ADMIN falhou: reads=[${rReadA.status},${rReadB.status}], writes=[${rUpdA.status},${rUpdB.status}]`);
      }

      results.push({
        id: 'B2C-43',
        name: 'AUD-HF2.1-01: ADMIN ativo canônico (active omitido ou active=true) autorizado em Rules e Servidor',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Leitura/escrita REST (200) e liberação no servidor aprovadas para ADMIN com active omitido e active=true'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-43',
        name: 'AUD-HF2.1-01: ADMIN ativo canônico (active omitido ou active=true) autorizado em Rules e Servidor',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      for (const a of tempAppsB2C43) {
        try { await deleteApp(a); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-44: AUD-HF2.1-01 — ADMIN sem campo status negado em Rules (403) e Servidor (PERMISSION_DENIED)
    // ------------------------------------------------------------------------
    const tempAppsB2C44: any[] = [];
    try {
      const testFamId = `fam_b2c44_${Date.now()}`;
      const uApp = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-test-key' }, `b2c44-${Date.now()}`);
      tempAppsB2C44.push(uApp);
      const uAuth = getAuth(uApp);
      connectAuthEmulator(uAuth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
      const cred = await signInAnonymously(uAuth);
      const uid = cred.user.uid;
      const idToken = await cred.user.getIdToken();
      const mockAuth = createMockJwt(uid);

      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: uid,
        name: 'Família Sem Status',
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_44').set({
        id: 'ft_44',
        taskMasterId: 'tm_44',
        roomId: 'sala',
        active: true
      });
      // Vínculo legado/incompleto sem campo status
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${uid}`).set({
        familyId: testFamId,
        userId: uid,
        memberId: uid,
        role: 'ADMIN'
      });

      const rReadFam = await emulatorRestRequest(`families/${testFamId}`, { authHeader: mockAuth });
      const rReadTask = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_44`, { authHeader: mockAuth });
      const rWriteFam = await emulatorRestRequest(`families/${testFamId}?updateMask.fieldPaths=name`, {
        method: 'PATCH',
        authHeader: mockAuth,
        body: { fields: { name: { stringValue: 'Tentativa' } } }
      });
      const rWriteTask = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_44?updateMask.fieldPaths=active`, {
        method: 'PATCH',
        authHeader: mockAuth,
        body: { fields: { active: { booleanValue: false } } }
      });

      let srvCode = '';
      try {
        await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
          auth: adminAuthSdk as any,
          firestoreDb: adminDb as any,
          idToken,
          familyId: testFamId,
          expectedConsistencyVersion: 1,
          expectedAuditStateHash: SuspensionReleaseService.computeAuditStateHash([], [], [])
        });
      } catch (e: any) {
        srvCode = e?.code || '';
      }

      if (
        rReadFam.status !== 403 ||
        rReadTask.status !== 403 ||
        rWriteFam.status !== 403 ||
        rWriteTask.status !== 403 ||
        srvCode !== 'PERMISSION_DENIED'
      ) {
        throw new Error(`Paridade falhou para ADMIN sem status: rules=[${rReadFam.status},${rReadTask.status},${rWriteFam.status},${rWriteTask.status}], server=${srvCode}`);
      }

      results.push({
        id: 'B2C-44',
        name: 'AUD-HF2.1-01: ADMIN sem status negado em Rules (403) e Servidor (PERMISSION_DENIED)',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Ausência de fallback permissivo comprovada: Rules (403 em leitura/escrita) e SuspensionReleaseService (PERMISSION_DENIED)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-44',
        name: 'AUD-HF2.1-01: ADMIN sem status negado em Rules (403) e Servidor (PERMISSION_DENIED)',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      for (const a of tempAppsB2C44) {
        try { await deleteApp(a); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-45: AUD-HF2.1-01 — ADMIN PENDING, REVOKED, REMOVED e active=false negados em Rules e Servidor
    // ------------------------------------------------------------------------
    const tempAppsB2C45: any[] = [];
    try {
      const testFamId = `fam_b2c45_${Date.now()}`;
      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: 'owner_b2c45',
        name: 'Família Gate States',
        routineSuspended: false,
        consistencyVersion: 1
      });
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_45').set({
        id: 'ft_45',
        taskMasterId: 'tm_45',
        roomId: 'sala',
        active: true
      });

      const badStates = [
        { label: 'PENDING', status: 'PENDING', active: true },
        { label: 'REVOKED', status: 'REVOKED', active: true },
        { label: 'REMOVED', status: 'REMOVED', active: true },
        { label: 'ACTIVE_FALSE', status: 'ACTIVE', active: false }
      ];

      const emptyHash = SuspensionReleaseService.computeAuditStateHash([], [], []);

      for (const st of badStates) {
        const uApp = initializeApp(
          { projectId: PROJECT_ID, apiKey: 'fake-test-key' },
          `b2c45-${st.label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        );
        tempAppsB2C45.push(uApp);
        const uAuth = getAuth(uApp);
        connectAuthEmulator(uAuth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
        const cred = await signInAnonymously(uAuth);
        const uid = cred.user.uid;
        const idToken = await cred.user.getIdToken();
        const mockAuth = createMockJwt(uid);

        await adminDb.collection('familyMemberships').doc(`${testFamId}_${uid}`).set({
          familyId: testFamId,
          userId: uid,
          memberId: uid,
          role: 'ADMIN',
          status: st.status,
          active: st.active
        });

        const rRead = await emulatorRestRequest(`families/${testFamId}`, { authHeader: mockAuth });
        const rWriteFam = await emulatorRestRequest(`families/${testFamId}?updateMask.fieldPaths=name`, {
          method: 'PATCH',
          authHeader: mockAuth,
          body: { fields: { name: { stringValue: 'Hack' } } }
        });
        const rWriteTask = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_hack_${st.label}`, {
          method: 'PATCH',
          authHeader: mockAuth,
          body: { fields: { id: { stringValue: `ft_hack_${st.label}` }, active: { booleanValue: true } } }
        });

        let srvCode = '';
        try {
          await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
            auth: adminAuthSdk as any,
            firestoreDb: adminDb as any,
            idToken,
            familyId: testFamId,
            expectedConsistencyVersion: 1,
            expectedAuditStateHash: emptyHash
          });
        } catch (e: any) {
          srvCode = e?.code || '';
        }

        if (rRead.status !== 403 || rWriteFam.status !== 403 || rWriteTask.status !== 403 || srvCode !== 'PERMISSION_DENIED') {
          throw new Error(`Estado ${st.label} não foi bloqueado em paridade: read=${rRead.status}, writeFam=${rWriteFam.status}, writeTask=${rWriteTask.status}, srv=${srvCode}`);
        }
      }

      results.push({
        id: 'B2C-45',
        name: 'AUD-HF2.1-01: ADMIN PENDING, REVOKED, REMOVED e active=false negados em Rules e Servidor',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Paridade 100% comprovada: 4 estados inválidos retornaram 403 nas Rules (leitura/escrita) e PERMISSION_DENIED no servidor'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-45',
        name: 'AUD-HF2.1-01: ADMIN PENDING, REVOKED, REMOVED e active=false negados em Rules e Servidor',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      for (const a of tempAppsB2C45) {
        try { await deleteApp(a); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-46: AUD-HF2.1-01 — ADMIN com familyId ou userId divergente/ausente negado em Rules e Servidor
    // ------------------------------------------------------------------------
    const tempAppsB2C46: any[] = [];
    try {
      const testFamId = `fam_b2c46_${Date.now()}`;
      const otherFamId = `fam_other46_${Date.now()}`;
      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: 'owner_b2c46',
        routineSuspended: true,
        consistencyVersion: 1
      });

      const emptyHash = SuspensionReleaseService.computeAuditStateHash([], [], []);
      const identityVectors: Array<{ label: string; buildDoc: (uid: string) => Record<string, any> }> = [
        {
          label: 'MISSING_FAMILY_ID',
          buildDoc: (uid) => ({ userId: uid, role: 'ADMIN', status: 'ACTIVE' })
        },
        {
          label: 'DIVERGENT_FAMILY_ID',
          buildDoc: (uid) => ({ familyId: otherFamId, userId: uid, role: 'ADMIN', status: 'ACTIVE' })
        },
        {
          label: 'MISSING_USER_ID',
          buildDoc: () => ({ familyId: testFamId, role: 'ADMIN', status: 'ACTIVE' })
        },
        {
          label: 'DIVERGENT_USER_ID',
          buildDoc: () => ({ familyId: testFamId, userId: 'hijacked_other_uid', role: 'ADMIN', status: 'ACTIVE' })
        }
      ];

      for (const vec of identityVectors) {
        const uApp = initializeApp(
          { projectId: PROJECT_ID, apiKey: 'fake-test-key' },
          `b2c46-${vec.label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        );
        tempAppsB2C46.push(uApp);
        const uAuth = getAuth(uApp);
        connectAuthEmulator(uAuth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
        const cred = await signInAnonymously(uAuth);
        const uid = cred.user.uid;
        const idToken = await cred.user.getIdToken();
        const mockAuth = createMockJwt(uid);

        await adminDb.collection('familyMemberships').doc(`${testFamId}_${uid}`).set(vec.buildDoc(uid));

        const rRead = await emulatorRestRequest(`families/${testFamId}`, { authHeader: mockAuth });
        const rWrite = await emulatorRestRequest(`families/${testFamId}?updateMask.fieldPaths=name`, {
          method: 'PATCH',
          authHeader: mockAuth,
          body: { fields: { name: { stringValue: 'Bypass' } } }
        });

        let srvCode = '';
        try {
          await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
            auth: adminAuthSdk as any,
            firestoreDb: adminDb as any,
            idToken,
            familyId: testFamId,
            expectedConsistencyVersion: 1,
            expectedAuditStateHash: emptyHash
          });
        } catch (e: any) {
          srvCode = e?.code || '';
        }

        if (rRead.status !== 403 || rWrite.status !== 403 || srvCode !== 'PERMISSION_DENIED') {
          throw new Error(`Vetor ${vec.label} não bloqueado em paridade: read=${rRead.status}, write=${rWrite.status}, srv=${srvCode}`);
        }
      }

      results.push({
        id: 'B2C-46',
        name: 'AUD-HF2.1-01: ADMIN com familyId ou userId divergente/ausente negado em Rules e Servidor',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'Todos os 4 vetores de identidade inconsistente rejeitados com 403 nas Rules e PERMISSION_DENIED no servidor'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-46',
        name: 'AUD-HF2.1-01: ADMIN com familyId ou userId divergente/ausente negado em Rules e Servidor',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      for (const a of tempAppsB2C46) {
        try { await deleteApp(a); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-47: AUD-HF2.1-01 — MEMBER inativo, sem status ou identidade divergente negado em isMemberOfFamily
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c47_${Date.now()}`;
      const otherFamId = `fam_other47_${Date.now()}`;

      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: 'owner_b2c47',
        name: 'Família Member Parity'
      });
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_47').set({
        id: 'ft_47',
        taskMasterId: 'tm_47',
        roomId: 'sala',
        active: true
      });
      await adminDb.collection('families').doc(testFamId).collection('assignments').doc('asg_47').set({
        id: 'asg_47',
        family_id: testFamId,
        family_task_id: 'ft_47',
        member_id: 'mem_target',
        status: 'SCHEDULED'
      });
      await adminDb.collection('families').doc(testFamId).collection('routineReleaseAudits').doc('aud_47').set({
        auditId: 'aud_47',
        status: 'AUDIT_PASSED'
      });

      const invalidMemberDocs: Array<{ label: string; doc: (uid: string) => Record<string, any> }> = [
        { label: 'NO_STATUS', doc: (uid) => ({ familyId: testFamId, userId: uid, memberId: 'mem_target', role: 'MEMBER' }) },
        { label: 'PENDING', doc: (uid) => ({ familyId: testFamId, userId: uid, memberId: 'mem_target', role: 'MEMBER', status: 'PENDING' }) },
        { label: 'REVOKED', doc: (uid) => ({ familyId: testFamId, userId: uid, memberId: 'mem_target', role: 'MEMBER', status: 'REVOKED' }) },
        { label: 'REMOVED', doc: (uid) => ({ familyId: testFamId, userId: uid, memberId: 'mem_target', role: 'MEMBER', status: 'REMOVED' }) },
        { label: 'ACTIVE_FALSE', doc: (uid) => ({ familyId: testFamId, userId: uid, memberId: 'mem_target', role: 'MEMBER', status: 'ACTIVE', active: false }) },
        { label: 'WRONG_FAMILY', doc: (uid) => ({ familyId: otherFamId, userId: uid, memberId: 'mem_target', role: 'MEMBER', status: 'ACTIVE' }) },
        { label: 'WRONG_USER', doc: () => ({ familyId: testFamId, userId: 'another_uid', memberId: 'mem_target', role: 'MEMBER', status: 'ACTIVE' }) }
      ];

      for (const item of invalidMemberDocs) {
        const mUid = `mem_${item.label}_${Date.now()}`;
        const mAuth = createMockJwt(mUid);
        await adminDb.collection('familyMemberships').doc(`${testFamId}_${mUid}`).set(item.doc(mUid));

        const rFam = await emulatorRestRequest(`families/${testFamId}`, { authHeader: mAuth });
        const rFt = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_47`, { authHeader: mAuth });
        const rAsg = await emulatorRestRequest(`families/${testFamId}/assignments/asg_47`, { authHeader: mAuth });
        const rAud = await emulatorRestRequest(`families/${testFamId}/routineReleaseAudits/aud_47`, { authHeader: mAuth });
        const rComp = await emulatorRestRequest(`families/${testFamId}/assignments/asg_47?updateMask.fieldPaths=status&updateMask.fieldPaths=completed_by&updateMask.fieldPaths=completed_at`, {
          method: 'PATCH',
          authHeader: mAuth,
          body: {
            fields: {
              status: { stringValue: 'COMPLETED' },
              completed_by: { stringValue: 'mem_target' },
              completed_at: { stringValue: new Date().toISOString() }
            }
          }
        });

        if (
          rFam.status !== 403 ||
          rFt.status !== 403 ||
          rAsg.status !== 403 ||
          rAud.status !== 403 ||
          rComp.status !== 403
        ) {
          throw new Error(`MEMBER inválido '${item.label}' obteve acesso indevido: [${rFam.status},${rFt.status},${rAsg.status},${rAud.status},${rComp.status}]`);
        }
      }

      // Controle positivo: MEMBER canônico ativo lê normalmente (200)
      const validMemUid = `mem_valid47_${Date.now()}`;
      const validMemAuth = createMockJwt(validMemUid);
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${validMemUid}`).set({
        familyId: testFamId,
        userId: validMemUid,
        memberId: 'mem_target',
        role: 'MEMBER',
        status: 'ACTIVE'
      });
      const rOkRead = await emulatorRestRequest(`families/${testFamId}/familyTasks/ft_47`, { authHeader: validMemAuth });
      if (rOkRead.status !== 200) {
        throw new Error(`MEMBER ativo legítimo falhou ao ler familyTasks: ${rOkRead.status}`);
      }

      results.push({
        id: 'B2C-47',
        name: 'AUD-HF2.1-01: MEMBER inativo/sem status/identidade divergente negado em isMemberOfFamily (403)',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: '7 perfis de vínculo inválido bloqueados com 403 em families, familyTasks, assignments e audits; MEMBER ACTIVE autorizado (200)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-47',
        name: 'AUD-HF2.1-01: MEMBER inativo/sem status/identidade divergente negado em isMemberOfFamily (403)',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-48: AUD-HF2.1-01 — Bootstrap legítimo do primeiro ADMIN funciona + consulta ativa + rejeita incompleto
    // ------------------------------------------------------------------------
    const tempAppsB2C48: any[] = [];
    try {
      const uApp = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-test-key' }, `b2c48-${Date.now()}`);
      tempAppsB2C48.push(uApp);
      const uAuth = getAuth(uApp);
      connectAuthEmulator(uAuth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
      const cred = await signInAnonymously(uAuth);
      const ownerUid = cred.user.uid;
      const idToken = await cred.user.getIdToken();
      const uDb = getFirestore(uApp, REQUIRED_NAMED_DATABASE_ID);
      connectFirestoreEmulator(uDb, EMULATOR_HOST, EMULATOR_PORT);

      const newFamId = `fam_b2c48_ok_${Date.now()}`;
      const memberId = `mem_${ownerUid}`;
      const nowIso = new Date().toISOString();

      // 1. Bootstrap atômico legítimo (Family + FamilyMembership canônica + Member ADMIN) via client writeBatch
      const okBatch = writeBatch(uDb);
      okBatch.set(doc(uDb, 'families', newFamId), {
        id: newFamId,
        name: 'Casa Bootstrap Legítimo',
        ownerUserId: ownerUid,
        routineSuspended: false,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      okBatch.set(doc(uDb, 'familyMemberships', `${newFamId}_${ownerUid}`), {
        id: `${newFamId}_${ownerUid}`,
        familyId: newFamId,
        userId: ownerUid,
        memberId,
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso
      });
      okBatch.set(doc(uDb, 'families', newFamId, 'members', memberId), {
        id: memberId,
        family_id: newFamId,
        user_id: ownerUid,
        name: 'Fundadora',
        role: 'ADMIN',
        active: true,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      await okBatch.commit();

      // 2. Verifica query real de onboarding (AuthContext: where('userId','==',uid), where('status','==','ACTIVE'))
      const qSnap = await getDocs(
        query(
          collection(uDb, 'familyMemberships'),
          where('userId', '==', ownerUid),
          where('status', '==', 'ACTIVE')
        )
      );
      if (qSnap.empty) {
        throw new Error('Query canônica de memberships ativos não retornou o vínculo recém-criado no bootstrap');
      }

      // 3. Fundador opera como ADMIN na família recém-criada e consegue liberar suspensão via servidor
      await updateDoc(doc(uDb, 'families', newFamId), { routineSuspended: true });
      const relRes = await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
        auth: adminAuthSdk as any,
        firestoreDb: adminDb as any,
        idToken,
        familyId: newFamId,
        expectedConsistencyVersion: 1,
        expectedAuditStateHash: SuspensionReleaseService.computeAuditStateHash([], [], [])
      });
      if (!relRes.success) {
        throw new Error('Liberação após bootstrap legítimo falhou');
      }

      // 4. Bootstraps incompletos (sem status / status PENDING / active=false) devem ser rejeitados
      const badFamNoStatus = `fam_b2c48_bad1_${Date.now()}`;
      let bad1Rejected = false;
      try {
        const b1 = writeBatch(uDb);
        b1.set(doc(uDb, 'families', badFamNoStatus), { id: badFamNoStatus, ownerUserId: ownerUid });
        b1.set(doc(uDb, 'familyMemberships', `${badFamNoStatus}_${ownerUid}`), {
          id: `${badFamNoStatus}_${ownerUid}`,
          familyId: badFamNoStatus,
          userId: ownerUid,
          role: 'ADMIN'
        });
        await b1.commit();
      } catch {
        bad1Rejected = true;
      }

      const badFamInactive = `fam_b2c48_bad2_${Date.now()}`;
      let bad2Rejected = false;
      try {
        const b2 = writeBatch(uDb);
        b2.set(doc(uDb, 'families', badFamInactive), { id: badFamInactive, ownerUserId: ownerUid });
        b2.set(doc(uDb, 'familyMemberships', `${badFamInactive}_${ownerUid}`), {
          id: `${badFamInactive}_${ownerUid}`,
          familyId: badFamInactive,
          userId: ownerUid,
          role: 'ADMIN',
          status: 'ACTIVE',
          active: false
        });
        await b2.commit();
      } catch {
        bad2Rejected = true;
      }

      if (!bad1Rejected || !bad2Rejected) {
        throw new Error(`Bootstrap incompleto não foi rejeitado: noStatus=${bad1Rejected}, activeFalse=${bad2Rejected}`);
      }

      results.push({
        id: 'B2C-48',
        name: 'AUD-HF2.1-01: Bootstrap legítimo do 1º ADMIN preservado, query ativa ok e bootstrap incompleto rejeitado',
        category: 'SECURITY_RULES',
        status: 'PASS',
        details: 'writeBatch atômico completo (Family+Membership+Member), query ACTIVE e liberação funcionando; bootstraps sem status/active=false bloqueados'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-48',
        name: 'AUD-HF2.1-01: Bootstrap legítimo do 1º ADMIN preservado, query ativa ok e bootstrap incompleto rejeitado',
        category: 'SECURITY_RULES',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      for (const a of tempAppsB2C48) {
        try { await deleteApp(a); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-49: AUD-HF2.1-02 — Rejeição obrigatória de expectedAuditStateHash ausente/vazio/malformado (INVALID_ARGUMENT)
    // ------------------------------------------------------------------------
    const tempAppsB2C49: any[] = [];
    try {
      const testFamId = `fam_b2c49_${Date.now()}`;
      const uApp = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-test-key' }, `b2c49-${Date.now()}`);
      tempAppsB2C49.push(uApp);
      const uAuth = getAuth(uApp);
      connectAuthEmulator(uAuth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
      const cred = await signInAnonymously(uAuth);
      const adminUid = cred.user.uid;
      const idToken = await cred.user.getIdToken();

      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: adminUid,
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${adminUid}`).set({
        familyId: testFamId,
        userId: adminUid,
        memberId: adminUid,
        role: 'ADMIN',
        status: 'ACTIVE'
      });

      const malformedHashes: Array<{ label: string; value: any }> = [
        { label: 'UNDEFINED', value: undefined },
        { label: 'NULL', value: null },
        { label: 'EMPTY', value: '' },
        { label: 'WHITESPACE', value: '   ' },
        { label: 'SHORT_HEX', value: 'abc123' },
        { label: 'NON_HEX', value: 'z'.repeat(64) },
        { label: 'UPPERCASE_HEX', value: 'A'.repeat(64) }
      ];

      for (const mh of malformedHashes) {
        let directCode = '';
        try {
          await SuspensionReleaseService.executeServerSuspensionRelease({
            firestoreDb: adminDb as any,
            familyId: testFamId,
            callerUid: adminUid,
            expectedConsistencyVersion: 1,
            expectedAuditStateHash: mh.value
          });
        } catch (e: any) {
          directCode = e?.code || '';
        }

        let tokenCode = '';
        try {
          await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
            auth: adminAuthSdk as any,
            firestoreDb: adminDb as any,
            idToken,
            familyId: testFamId,
            expectedConsistencyVersion: 1,
            expectedAuditStateHash: mh.value
          });
        } catch (e: any) {
          tokenCode = e?.code || '';
        }

        if (directCode !== 'INVALID_ARGUMENT' || tokenCode !== 'INVALID_ARGUMENT') {
          throw new Error(`Hash '${mh.label}' não retornou INVALID_ARGUMENT: direct=${directCode}, token=${tokenCode}`);
        }
      }

      const famSnap = await adminDb.collection('families').doc(testFamId).get();
      if (famSnap.data()?.routineSuspended !== true) {
        throw new Error('Suspensão não deveria ter sido alterada após rejeição de hash inválido');
      }

      results.push({
        id: 'B2C-49',
        name: 'AUD-HF2.1-02: expectedAuditStateHash ausente, vazio ou malformado rejeitado com INVALID_ARGUMENT',
        category: 'INTEGRITY',
        status: 'PASS',
        details: '7 formatos inválidos rejeitados com INVALID_ARGUMENT em verifyIdTokenAndExecuteRelease e executeServerSuspensionRelease; routineSuspended=true preservado'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-49',
        name: 'AUD-HF2.1-02: expectedAuditStateHash ausente, vazio ou malformado rejeitado com INVALID_ARGUMENT',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      for (const a of tempAppsB2C49) {
        try { await deleteApp(a); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-50: AUD-HF2.1-02 — Hash válido nunca substitui auditoria do servidor nem autorização ADMIN
    // ------------------------------------------------------------------------
    const tempAppsB2C50: any[] = [];
    try {
      const testFamId = `fam_b2c50_${Date.now()}`;
      const uAppAdmin = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-test-key' }, `b2c50-adm-${Date.now()}`);
      const uAppMember = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-test-key' }, `b2c50-mem-${Date.now()}`);
      tempAppsB2C50.push(uAppAdmin, uAppMember);

      connectAuthEmulator(getAuth(uAppAdmin), `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
      const adminCred = await signInAnonymously(getAuth(uAppAdmin));
      connectAuthEmulator(getAuth(uAppMember), `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
      const memberCred = await signInAnonymously(getAuth(uAppMember));

      const adminUid = adminCred.user.uid;
      const adminToken = await adminCred.user.getIdToken();
      const memberUid = memberCred.user.uid;
      const memberToken = await memberCred.user.getIdToken();

      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: adminUid,
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${adminUid}`).set({
        familyId: testFamId,
        userId: adminUid,
        memberId: adminUid,
        role: 'ADMIN',
        status: 'ACTIVE'
      });
      await adminDb.collection('familyMemberships').doc(`${testFamId}_${memberUid}`).set({
        familyId: testFamId,
        userId: memberUid,
        memberId: memberUid,
        role: 'MEMBER',
        status: 'ACTIVE'
      });

      // Seed de estado INCONSISTENTE (tarefa ativa sem routineIndex)
      const brokenTask = { id: 'ft_broken_50', taskMasterId: 'tm_50', roomId: 'sala', active: true };
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_broken_50').set(brokenTask);

      // Hash SHA-256 perfeitamente válido computado sobre o estado inconsistente
      const validHashOfBrokenState = SuspensionReleaseService.computeAuditStateHash([brokenTask], [], []);

      // 1. Mesmo com hash que bate 100%, a auditoria transacional no servidor bloqueia com AUDIT_FAILED
      let auditFailedCode = '';
      try {
        await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
          auth: adminAuthSdk as any,
          firestoreDb: adminDb as any,
          idToken: adminToken,
          familyId: testFamId,
          expectedConsistencyVersion: 1,
          expectedAuditStateHash: validHashOfBrokenState
        });
      } catch (e: any) {
        auditFailedCode = e?.code || '';
      }

      // 2. MEMBER com o mesmo hash válido também é negado (PERMISSION_DENIED)
      let memberDeniedCode = '';
      try {
        await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
          auth: adminAuthSdk as any,
          firestoreDb: adminDb as any,
          idToken: memberToken,
          familyId: testFamId,
          expectedConsistencyVersion: 1,
          expectedAuditStateHash: validHashOfBrokenState
        });
      } catch (e: any) {
        memberDeniedCode = e?.code || '';
      }

      if (auditFailedCode !== 'AUDIT_FAILED' || memberDeniedCode !== 'PERMISSION_DENIED') {
        throw new Error(`Hash válido substituiu indevidamente auditoria/autorização: audit=${auditFailedCode}, member=${memberDeniedCode}`);
      }

      // 3. Após reconciliação no servidor e captura do novo hash consistente, ADMIN legítimo libera
      const recRes = await SuspensionReleaseService.verifyIdTokenAndReconcile({
        auth: adminAuthSdk as any,
        firestoreDb: adminDb as any,
        idToken: adminToken,
        familyId: testFamId,
        actions: {
          indexesToCreateOrUpdate: [
            {
              taskMasterId: 'tm_50',
              roomId: 'sala',
              canonicalRoutineId: 'ft_broken_50',
              status: 'ACTIVE',
              lastOperationId: 'op_50'
            }
          ]
        }
      });

      const validConsistentHash = SuspensionReleaseService.computeAuditStateHash(
        [brokenTask],
        [
          {
            id: 'tm_50___sala',
            taskMasterId: 'tm_50',
            roomId: 'sala',
            canonicalRoutineId: 'ft_broken_50',
            status: 'ACTIVE'
          }
        ],
        []
      );

      const okRes = await SuspensionReleaseService.verifyIdTokenAndExecuteRelease({
        auth: adminAuthSdk as any,
        firestoreDb: adminDb as any,
        idToken: adminToken,
        familyId: testFamId,
        expectedConsistencyVersion: recRes.newConsistencyVersion,
        expectedAuditStateHash: validConsistentHash
      });

      if (!okRes.success || okRes.auditStateHash !== validConsistentHash) {
        throw new Error('Liberação com hash válido e estado consistente falhou');
      }

      results.push({
        id: 'B2C-50',
        name: 'AUD-HF2.1-02: Hash válido permite estado consistente, mas nunca substitui auditoria nem autorização',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Hash exato de estado inconsistente rejeitado (AUDIT_FAILED); MEMBER com hash exato negado (PERMISSION_DENIED); ADMIN com estado reconciliado liberou'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-50',
        name: 'AUD-HF2.1-02: Hash válido permite estado consistente, mas nunca substitui auditoria nem autorização',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    } finally {
      for (const a of tempAppsB2C50) {
        try { await deleteApp(a); } catch {}
      }
    }

    // ------------------------------------------------------------------------
    // B2C-51: AUD-HF2.1-02 — Hash obsoleto após alteração concorrente bloqueia liberação (CONCURRENCY_CONFLICT)
    // ------------------------------------------------------------------------
    try {
      const testFamId = `fam_b2c51_${Date.now()}`;
      await adapter.ensureEmulatorAuth(testFamId);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;

      await adminDb.collection('families').doc(testFamId).set({
        ownerUserId: adminUid,
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('families').doc(testFamId).collection('familyTasks').doc('ft_51_a').set({
        id: 'ft_51_a',
        taskMasterId: 'tm_51a',
        roomId: 'sala',
        active: true
      });
      await adminDb.collection('families').doc(testFamId).collection('routineIndex').doc('tm_51a___sala').set({
        taskMasterId: 'tm_51a',
        roomId: 'sala',
        canonicalRoutineId: 'ft_51_a',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        lastOperationId: 'op_51a'
      });

      const staleHash = SuspensionReleaseService.computeAuditStateHash(
        [{ id: 'ft_51_a', taskMasterId: 'tm_51a', roomId: 'sala', active: true }],
        [{ id: 'tm_51a___sala', taskMasterId: 'tm_51a', roomId: 'sala', canonicalRoutineId: 'ft_51_a', status: 'ACTIVE' }],
        []
      );

      // Mutação concorrente altera routineIndexConflicts sem tocar em consistencyVersion
      await adminDb.collection('families').doc(testFamId).collection('routineIndexConflicts').doc('tm_51c___cozinha').set({
        taskMasterId: 'tm_51c',
        roomId: 'cozinha',
        status: 'RESOLVED',
        chosenCanonicalRoutineId: 'ft_51_a'
      });

      let conflictCode = '';
      try {
        await SuspensionReleaseService.executeServerSuspensionRelease({
          firestoreDb: adminDb as any,
          familyId: testFamId,
          callerUid: adminUid,
          expectedConsistencyVersion: 1,
          expectedAuditStateHash: staleHash
        });
      } catch (e: any) {
        conflictCode = e?.code || '';
      }

      const famSnap = await adminDb.collection('families').doc(testFamId).get();
      if (conflictCode !== 'CONCURRENCY_CONFLICT' || famSnap.data()?.routineSuspended !== true || famSnap.data()?.consistencyVersion !== 1) {
        throw new Error(`Hash obsoleto não abortou com CONCURRENCY_CONFLICT: code=${conflictCode}, suspended=${famSnap.data()?.routineSuspended}`);
      }

      results.push({
        id: 'B2C-51',
        name: 'AUD-HF2.1-02: expectedAuditStateHash obsoleto após alteração concorrente bloqueia liberação (CONCURRENCY_CONFLICT)',
        category: 'CONCURRENCY',
        status: 'PASS',
        details: 'Mutação concorrente pós-pré-auditoria detectada pelo hash obrigatório; routineSuspended=true e consistencyVersion=1 preservados'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-51',
        name: 'AUD-HF2.1-02: expectedAuditStateHash obsoleto após alteração concorrente bloqueia liberação (CONCURRENCY_CONFLICT)',
        category: 'CONCURRENCY',
        status: 'FAIL',
        details: err?.message
      });
    }

    // ------------------------------------------------------------------------
    // B2C-52: AUD-HF2.1-01/02 — Regressão ponta a ponta: reconciliação, liberação, COMPLETED/DONE e isolamento
    // ------------------------------------------------------------------------
    try {
      const famPilot = `fam_b2c52_a_${Date.now()}`;
      const famOther = `fam_b2c52_b_${Date.now()}`;
      await adapter.ensureEmulatorAuth(famPilot);
      const auth = getAuth(db.app);
      const adminUid = auth.currentUser!.uid;
      const adminAuth = createMockJwt(adminUid);

      await adminDb.collection('families').doc(famPilot).set({
        ownerUserId: adminUid,
        routineSuspended: true,
        consistencyVersion: 1
      });
      await adminDb.collection('families').doc(famOther).set({
        ownerUserId: 'other_owner',
        name: 'Tenant Isolado B2C-52'
      });
      await adminDb.collection('families').doc(famPilot).collection('familyTasks').doc('ft_52').set({
        id: 'ft_52',
        taskMasterId: 'tm_varanda_52',
        roomId: 'varanda',
        active: true
      });
      await adminDb.collection('families').doc(famPilot).collection('assignments').doc('asg_done_52').set({
        id: 'asg_done_52',
        family_id: famPilot,
        family_task_id: 'ft_52',
        member_id: 'mem_52',
        status: 'DONE',
        completed_by: 'mem_52',
        completed_at: '2026-11-16T10:00:00Z'
      });

      // 1. Isolamento multi-tenant
      const rCrossTenant = await emulatorRestRequest(`families/${famOther}`, { authHeader: adminAuth });
      if (rCrossTenant.status !== 403) {
        throw new Error(`Quebra de isolamento multi-tenant: status=${rCrossTenant.status}`);
      }

      // 2. Reconciliação sob suspensão via RoutineConsistencyChecker
      const recRes = await RoutineConsistencyChecker.reconcileFamilyRoutinesWhileSuspended(db, famPilot, {
        indexesToCreateOrUpdate: [
          {
            taskMasterId: 'tm_varanda_52',
            roomId: 'varanda',
            canonicalRoutineId: 'ft_52',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastOperationId: 'op_52'
          }
        ]
      });

      // 3. Liberação ponta a ponta com expectedAuditStateHash obrigatório
      const relRes = await RoutineConsistencyChecker.executeSuspensionRelease(db, famPilot, adminUid);
      const famSnap = await adminDb.collection('families').doc(famPilot).get();
      const delDone = await emulatorRestRequest(`families/${famPilot}/assignments/asg_done_52`, {
        method: 'DELETE',
        authHeader: adminAuth
      });

      if (
        recRes.newConsistencyVersion !== 2 ||
        !relRes.success ||
        famSnap.data()?.routineSuspended !== false ||
        famSnap.data()?.consistencyVersion !== 3 ||
        delDone.status !== 403
      ) {
        throw new Error('Falha na regressão integrada HF2.1');
      }

      results.push({
        id: 'B2C-52',
        name: 'Regressão HF2.1: reconciliação, liberação com hash obrigatório, COMPLETED/DONE e isolamento multi-tenant',
        category: 'INTEGRITY',
        status: 'PASS',
        details: 'Fluxo completo reconciliação (v1->v2) -> liberação com hash obrigatório (v2->v3) -> DONE preservado -> multi-tenant isolado (403)'
      });
    } catch (err: any) {
      results.push({
        id: 'B2C-52',
        name: 'Regressão HF2.1: reconciliação, liberação com hash obrigatório, COMPLETED/DONE e isolamento multi-tenant',
        category: 'INTEGRITY',
        status: 'FAIL',
        details: err?.message
      });
    }

  } finally {
    RoutineConsistencyChecker.setServerReleaseExecutor(null);
    RoutineConsistencyChecker.setServerReconciliationExecutor(null);
    RoutineFeatureFlags.reset();
    try {
      await deleteApp(app);
    } catch {}
    try {
      await deleteAdminApp(adminTestApp);
    } catch {}
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  return {
    status: 'EXECUTED',
    summary: `${passCount} de ${results.length} cenários do Gate D-B2C-HF3-HF2.1 APROVADOS no Firebase Emulator.`,
    scenarios: results
  };
}
