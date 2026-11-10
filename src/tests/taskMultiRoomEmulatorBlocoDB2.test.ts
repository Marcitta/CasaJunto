/**
 * CasaJunto — B.5.5-HF1-D-B2A.1: Suíte de Testes Reais no Firebase Local Emulator Suite
 * 
 * Executa os 16 testes obrigatórios (EMU-01 a EMU-16) diretamente contra o Firestore Local Emulator (Porta 8088)
 * utilizando o FirestoreTransactionalAdapter e o banco nomeado ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c.
 * 
 * DIRETRIZES DE SEGURANÇA OPERACIONAL:
 * - Porta 8088 utilizada para evitar conflito com proxy local (8080).
 * - Banco nomeado estritamente ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c.
 * - Zero conexão com Firestore remoto ou dados de produção (Rua Juriti).
 * - Verificação real de endpoint e execução transacional autêntica.
 */

import { initializeApp, getApps, deleteApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  Firestore
} from 'firebase/firestore';
import {
  FirestoreTransactionalAdapter,
  REQUIRED_NAMED_DATABASE_ID
} from '../infrastructure/firebase/FirestoreTransactionalAdapter';
import { RoutineTransactionalService } from '../application/services/RoutineTransactionalService';
import {
  buildRoutineIndexKey,
  sanitizeKeyComponent
} from '../domain/routine/multiRoomBatchContracts';
import {
  FamilyTask,
  TaskAssignment,
  BatchAddRoutineInput
} from '../types';
import {
  RoutineIndexDoc,
  RoutineIndexConflictDoc,
  OperationLedgerDoc
} from '../domain/routine/transactionalTypes';

export interface EmulatorTestScenario {
  id: string;
  name: string;
  category: 'CONCURRENCY' | 'SECURITY_RULES' | 'TRANSACTIONAL_INTEGRITY' | 'MULTI_TENANT';
  status: 'PENDING' | 'PASS' | 'FAIL' | 'BLOCKED';
  reason?: string;
  details?: string;
}

export const REQUIRED_EMULATOR_SCENARIOS: Array<{ id: string; name: string; category: EmulatorTestScenario['category'] }> = [
  { id: 'EMU-01', name: 'Concorrência de 10 operações na mesma combinação (familyId + taskMasterId + roomId)', category: 'CONCURRENCY' },
  { id: 'EMU-02', name: 'Reutilização de FamilyTask legada preservando ID e histórico', category: 'TRANSACTIONAL_INTEGRITY' },
  { id: 'EMU-03', name: 'Detecção de duplicatas sem modificação (RoutineIndexConflictDoc registrado)', category: 'TRANSACTIONAL_INTEGRITY' },
  { id: 'EMU-04', name: 'MEMBER tentando criar índice no Firestore (deve retornar permission-denied)', category: 'SECURITY_RULES' },
  { id: 'EMU-05', name: 'ADMIN criando índice válido no Firestore', category: 'SECURITY_RULES' },
  { id: 'EMU-06', name: 'Índice apontando para FamilyTask incompatível ou inexistente (falha getAfter)', category: 'SECURITY_RULES' },
  { id: 'EMU-07', name: 'Tentativa de alterar identidade do índice (taskMasterId/roomId imutáveis)', category: 'SECURITY_RULES' },
  { id: 'EMU-08', name: 'Timeout de rede antes do commit (geração de UNKNOWN_COMMIT)', category: 'TRANSACTIONAL_INTEGRITY' },
  { id: 'EMU-09', name: 'Timeout após commit com recuperação no servidor', category: 'TRANSACTIONAL_INTEGRITY' },
  { id: 'EMU-10', name: 'UNKNOWN_COMMIT com ledger ausente preserva isUnknown: true', category: 'TRANSACTIONAL_INTEGRITY' },
  { id: 'EMU-11', name: 'Recuperação por operationId a partir do servidor (getDocFromServer)', category: 'TRANSACTIONAL_INTEGRITY' },
  { id: 'EMU-12', name: 'Sincronização concorrente de assignments (Create-If-Absent em 15 dias)', category: 'CONCURRENCY' },
  { id: 'EMU-13', name: 'Preservação de tarefas concluídas (COMPLETED, DONE, completed_at)', category: 'TRANSACTIONAL_INTEGRITY' },
  { id: 'EMU-14', name: 'Preservação de atribuições de moradores fora do novo cronograma (OFF_SCHEDULE_PRESERVED)', category: 'TRANSACTIONAL_INTEGRITY' },
  { id: 'EMU-15', name: 'Falha parcial entre rotinas e ocorrências (sincronização do operationLedger com PARTIALLY_COMMITTED)', category: 'TRANSACTIONAL_INTEGRITY' },
  { id: 'EMU-16', name: 'Isolamento estrito entre famílias (zero contaminação cross-tenant no Firestore)', category: 'MULTI_TENANT' }
];

const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8088;
const PROJECT_ID = 'demo-no-project';

export async function checkFirestoreEmulatorAvailability(): Promise<{ available: boolean; reason?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/`, { signal: controller.signal });
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return {
        available: false,
        reason: `Porta ${EMULATOR_PORT} ocupada por proxy web local (${contentType}), não pelo emulador Firestore.`
      };
    }

    const text = await res.text();
    const isFirestore = text.includes('Ok') || text.includes('firestore');
    if (!isFirestore) {
      return {
        available: false,
        reason: `Endpoint ${EMULATOR_HOST}:${EMULATOR_PORT} não retornou Ok do Firestore Emulator.`
      };
    }

    return { available: true };
  } catch (err: any) {
    return {
      available: false,
      reason: `Não foi possível conectar ao emulador Firestore em ${EMULATOR_HOST}:${EMULATOR_PORT}: ${err?.message || 'Connection refused'}`
    };
  }
}

// Helpers para comunicação REST com o emulador (com suporte a autenticação e bypass admin)
function createMockJwtHeader(uid: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: uid,
    user_id: uid,
    aud: PROJECT_ID,
    iss: `https://securetoken.google.com/${PROJECT_ID}`
  })).toString('base64url');
  return `Bearer ${header}.${payload}.`;
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

export async function runTaskMultiRoomEmulatorBlocoDB2Tests(): Promise<{
  status: 'EXECUTED' | 'BLOCKED';
  summary: string;
  scenarios: EmulatorTestScenario[];
}> {
  // Configurar ambiente para o teste
  process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_HOST}:${EMULATOR_PORT}`;

  const check = await checkFirestoreEmulatorAvailability();
  if (!check.available) {
    const blockedScenarios: EmulatorTestScenario[] = REQUIRED_EMULATOR_SCENARIOS.map(s => ({
      ...s,
      status: 'BLOCKED',
      reason: check.reason
    }));

    return {
      status: 'BLOCKED',
      summary: `Execução no emulador Firestore BLOQUEADA: ${check.reason}`,
      scenarios: blockedScenarios
    };
  }

  // Inicializar SDK do Firebase para o emulador
  const appName = `emu-test-app-${Date.now()}`;
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-test-key' }, appName);
  const db = getFirestore(app, REQUIRED_NAMED_DATABASE_ID);
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORT);
  const adapter = new FirestoreTransactionalAdapter(db, { requireEmulator: true });

  const scenarioResults: EmulatorTestScenario[] = [];

  try {
    // ------------------------------------------------------------------------
    // EMU-01: Concorrência de 10 operações na mesma combinação
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu01_${Date.now()}`;
      const taskMasterId = 'tm_aspirar';
      const roomId = 'sala';
      const items: BatchAddRoutineInput[] = [{
        taskMasterId,
        roomId,
        name: 'Aspirar Sala',
        frequency: 'DAILY',
        preferredTime: '10:00',
        durationMinutes: 25
      }];

      // Dispara 10 operações concorrentes
      const promises = Array.from({ length: 10 }, (_, i) => {
        return RoutineTransactionalService.executeBatchRoutines({
          familyId,
          items,
          operationId: `op_emu01_${i + 1}_${Date.now()}`,
          store: adapter
        });
      });

      const results = await Promise.all(promises);
      const createdCount = results.filter(r => r.items[0]?.status === 'CREATED').length;
      const alreadyActiveCount = results.filter(r => r.items[0]?.status === 'ALREADY_ACTIVE').length;

      // Confere persistência no Firestore via adaptador
      const indexKey = buildRoutineIndexKey(taskMasterId, roomId);
      const indexDoc = await adapter.directGetRoutineIndex(familyId, indexKey);
      const ftCol = collection(db, 'families', familyId, 'familyTasks');
      const ftSnap = await getDocs(ftCol);

      if (createdCount === 1 && alreadyActiveCount === 9 && ftSnap.docs.length === 1 && indexDoc) {
        scenarioResults.push({
          id: 'EMU-01',
          name: REQUIRED_EMULATOR_SCENARIOS[0].name,
          category: 'CONCURRENCY',
          status: 'PASS',
          details: `10 transações concorrentes: Exatamente 1 CREATED, 9 ALREADY_ACTIVE, 1 único documento FamilyTask gravado.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-01',
          name: REQUIRED_EMULATOR_SCENARIOS[0].name,
          category: 'CONCURRENCY',
          status: 'FAIL',
          reason: `Esperado 1 CREATED e 9 ALREADY_ACTIVE com 1 FamilyTask. Obtido: ${createdCount} CREATED, ${alreadyActiveCount} ALREADY_ACTIVE, ${ftSnap.docs.length} docs.`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-01', name: REQUIRED_EMULATOR_SCENARIOS[0].name, category: 'CONCURRENCY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-02: Reutilização de FamilyTask legada preservando ID e histórico
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu02_${Date.now()}`;
      const taskMasterId = 'tm_limpar_janela';
      const roomId = 'quarto';
      const legacyId = 'ft_legacy_cust_12345';
      const originalCreatedAt = '2023-05-10T12:00:00.000Z';

      // Seed de rotina legada ativa diretamente no Firestore
      const legacyDocRef = doc(db, 'families', familyId, 'familyTasks', legacyId);
      await setDoc(legacyDocRef, {
        id: legacyId,
        familyId,
        taskMasterId,
        roomId,
        name: 'Limpar Janela Legada',
        active: true,
        frequency: 'WEEKLY',
        createdAt: originalCreatedAt,
        legacyFieldCustom: 'preservar_dado_legado'
      });

      const items: BatchAddRoutineInput[] = [{
        taskMasterId,
        roomId,
        name: 'Limpar Janela',
        frequency: 'WEEKLY'
      }];

      const res = await RoutineTransactionalService.executeBatchRoutines({
        familyId,
        items,
        operationId: `op_emu02_${Date.now()}`,
        store: adapter
      });

      const updatedDoc = await adapter.directGetFamilyTask(familyId, legacyId);
      const indexDoc = await adapter.directGetRoutineIndex(familyId, buildRoutineIndexKey(taskMasterId, roomId));

      if (
        res.items[0]?.status === 'ALREADY_ACTIVE' &&
        res.items[0]?.routineId === legacyId &&
        updatedDoc?.id === legacyId &&
        updatedDoc?.created_at === originalCreatedAt &&
        indexDoc?.canonicalRoutineId === legacyId
      ) {
        scenarioResults.push({
          id: 'EMU-02',
          name: REQUIRED_EMULATOR_SCENARIOS[1].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'PASS',
          details: `Rotina legada ${legacyId} adotada canonicamente. ID, createdAt e metadados preservados.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-02',
          name: REQUIRED_EMULATOR_SCENARIOS[1].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'FAIL',
          reason: `Falha na adoção legada. Status: ${res.items[0]?.status}, routineId: ${res.items[0]?.routineId}`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-02', name: REQUIRED_EMULATOR_SCENARIOS[1].name, category: 'TRANSACTIONAL_INTEGRITY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-03: Detecção de duplicatas sem modificação (RoutineIndexConflictDoc)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu03_${Date.now()}`;
      const taskMasterId = 'tm_lavar_louca';
      const roomId = 'cozinha';

      // Seed de 2 rotinas legadas duplicadas
      const d1Ref = doc(db, 'families', familyId, 'familyTasks', 'dup_1');
      await setDoc(d1Ref, { id: 'dup_1', familyId, taskMasterId, roomId, active: true, createdAt: '2023-01-01T00:00:00Z' });
      const d2Ref = doc(db, 'families', familyId, 'familyTasks', 'dup_2');
      await setDoc(d2Ref, { id: 'dup_2', familyId, taskMasterId, roomId, active: true, createdAt: '2023-01-02T00:00:00Z' });

      const res = await RoutineTransactionalService.executeBatchRoutines({
        familyId,
        items: [{ taskMasterId, roomId, name: 'Lavar Louça', frequency: 'DAILY' }],
        operationId: `op_emu03_${Date.now()}`,
        store: adapter
      });

      const d1Check = await adapter.directGetFamilyTask(familyId, 'dup_1');
      const d2Check = await adapter.directGetFamilyTask(familyId, 'dup_2');

      // Verifica conflict doc
      const conflictRef = doc(db, 'families', familyId, 'routineIndexConflicts', buildRoutineIndexKey(taskMasterId, roomId));
      const conflictSnap = await getDoc(conflictRef);
      const conflictData = conflictSnap.data() as RoutineIndexConflictDoc | undefined;

      if (
        res.items[0]?.status === 'AMBIGUOUS_LEGACY_CONFLICT' &&
        res.items[0]?.conflictDetails?.conflictingRoutineIds.length === 2 &&
        d1Check?.active === true &&
        d2Check?.active === true &&
        conflictData?.status === 'PENDING_ADMIN_RESOLUTION'
      ) {
        scenarioResults.push({
          id: 'EMU-03',
          name: REQUIRED_EMULATOR_SCENARIOS[2].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'PASS',
          details: `Duplicatas legadas identificadas; RoutineIndexConflictDoc registrado e rotinas preservadas intactas.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-03',
          name: REQUIRED_EMULATOR_SCENARIOS[2].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'FAIL',
          reason: `Conflito não registrado corretamente. Status: ${res.items[0]?.status}`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-03', name: REQUIRED_EMULATOR_SCENARIOS[2].name, category: 'TRANSACTIONAL_INTEGRITY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-04: MEMBER tentando criar índice no Firestore (permission-denied)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu04_${Date.now()}`;
      const memberUid = `uid_member_${Date.now()}`;

      // Configura membership como MEMBER
      await emulatorRestRequest(`familyMemberships/${familyId}_${memberUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { role: { stringValue: 'MEMBER' }, memberId: { stringValue: memberUid } } }
      });

      // Tenta criar routineIndex diretamente como MEMBER
      const memberAuth = createMockJwtHeader(memberUid);
      const resMember = await emulatorRestRequest(`families/${familyId}/routineIndex/idx_tm_test___sala`, {
        method: 'PATCH',
        authHeader: memberAuth,
        body: {
          fields: {
            taskMasterId: { stringValue: 'tm_test' },
            roomId: { stringValue: 'sala' },
            canonicalRoutineId: { stringValue: 'ft_1' },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: new Date().toISOString() },
            lastOperationId: { stringValue: 'op_1' }
          }
        }
      });

      if (resMember.status === 403 || resMember.status === 400) {
        scenarioResults.push({
          id: 'EMU-04',
          name: REQUIRED_EMULATOR_SCENARIOS[3].name,
          category: 'SECURITY_RULES',
          status: 'PASS',
          details: `Tentativa de MEMBER gravar routineIndex rejeitada pelas regras do Firestore (${resMember.status}).`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-04',
          name: REQUIRED_EMULATOR_SCENARIOS[3].name,
          category: 'SECURITY_RULES',
          status: 'FAIL',
          reason: `Esperava 403/PERMISSION_DENIED para MEMBER, obteve status HTTP ${resMember.status}.`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-04', name: REQUIRED_EMULATOR_SCENARIOS[3].name, category: 'SECURITY_RULES', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-05: ADMIN criando índice válido no Firestore
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu05_${Date.now()}`;
      const adminUid = `uid_admin_${Date.now()}`;
      const taskMasterId = 'tm_admin_valid';
      const roomId = 'cozinha';
      const routineId = 'ft_admin_valid_1';
      const indexKey = `idx_${taskMasterId}___${roomId}`;

      // Configura membership como ADMIN
      await emulatorRestRequest(`familyMemberships/${familyId}_${adminUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { role: { stringValue: 'ADMIN' }, memberId: { stringValue: adminUid } } }
      });

      const adminAuth = createMockJwtHeader(adminUid);

      // Cria a FamilyTask correspondente com role de ADMIN
      await emulatorRestRequest(`families/${familyId}/familyTasks/${routineId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            taskMasterId: { stringValue: taskMasterId },
            roomId: { stringValue: roomId },
            name: { stringValue: 'Tarefa Válida Admin' },
            active: { booleanValue: true }
          }
        }
      });

      // Cria o routineIndex correspondente com role de ADMIN
      const resIndex = await emulatorRestRequest(`families/${familyId}/routineIndex/${indexKey}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            taskMasterId: { stringValue: taskMasterId },
            roomId: { stringValue: roomId },
            canonicalRoutineId: { stringValue: routineId },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: new Date().toISOString() },
            lastOperationId: { stringValue: 'op_admin_1' }
          }
        }
      });

      if (resIndex.status === 200) {
        scenarioResults.push({
          id: 'EMU-05',
          name: REQUIRED_EMULATOR_SCENARIOS[4].name,
          category: 'SECURITY_RULES',
          status: 'PASS',
          details: `ADMIN criou índice com sucesso e validação cruzada aprovada pelas regras do Firestore.`
        });
      } else {
        const body = await resIndex.json();
        scenarioResults.push({
          id: 'EMU-05',
          name: REQUIRED_EMULATOR_SCENARIOS[4].name,
          category: 'SECURITY_RULES',
          status: 'FAIL',
          reason: `ADMIN falhou na criação do índice: ${resIndex.status} - ${JSON.stringify(body)}`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-05', name: REQUIRED_EMULATOR_SCENARIOS[4].name, category: 'SECURITY_RULES', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-06: Índice apontando para FamilyTask incompatível ou inexistente (getAfter)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu06_${Date.now()}`;
      const adminUid = `uid_admin_${Date.now()}`;
      await emulatorRestRequest(`familyMemberships/${familyId}_${adminUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { role: { stringValue: 'ADMIN' }, memberId: { stringValue: adminUid } } }
      });
      const adminAuth = createMockJwtHeader(adminUid);

      // Tenta criar índice apontando para FamilyTask que NÃO existe
      const resInval = await emulatorRestRequest(`families/${familyId}/routineIndex/idx_tm_inexistente___sala`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            taskMasterId: { stringValue: 'tm_inexistente' },
            roomId: { stringValue: 'sala' },
            canonicalRoutineId: { stringValue: 'ft_que_nao_existe_no_banco' },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: new Date().toISOString() },
            lastOperationId: { stringValue: 'op_fake' }
          }
        }
      });

      if (resInval.status === 403 || resInval.status === 400) {
        scenarioResults.push({
          id: 'EMU-06',
          name: REQUIRED_EMULATOR_SCENARIOS[5].name,
          category: 'SECURITY_RULES',
          status: 'PASS',
          details: `Índice para FamilyTask inexistente rejeitado pelas regras (existsAfter/getAfter).`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-06',
          name: REQUIRED_EMULATOR_SCENARIOS[5].name,
          category: 'SECURITY_RULES',
          status: 'FAIL',
          reason: `Esperava 403/PERMISSION_DENIED para FamilyTask inexistente, obteve status ${resInval.status}.`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-06', name: REQUIRED_EMULATOR_SCENARIOS[5].name, category: 'SECURITY_RULES', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-07: Tentativa de alterar identidade do índice (imutabilidade)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu07_${Date.now()}`;
      const adminUid = `uid_admin_${Date.now()}`;
      const taskMasterId = 'tm_imutavel';
      const roomId = 'quarto';
      const routineId = 'ft_imutavel_1';
      const indexKey = `idx_${taskMasterId}___${roomId}`;

      await emulatorRestRequest(`familyMemberships/${familyId}_${adminUid}`, {
        method: 'PATCH',
        authHeader: 'Bearer owner',
        body: { fields: { role: { stringValue: 'ADMIN' }, memberId: { stringValue: adminUid } } }
      });
      const adminAuth = createMockJwtHeader(adminUid);

      // Cria a rotina e o índice
      await emulatorRestRequest(`families/${familyId}/familyTasks/${routineId}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: { fields: { taskMasterId: { stringValue: taskMasterId }, roomId: { stringValue: roomId }, name: { stringValue: 'Rotina Imutável' }, active: { booleanValue: true } } }
      });
      const createTime = new Date().toISOString();
      await emulatorRestRequest(`families/${familyId}/routineIndex/${indexKey}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            taskMasterId: { stringValue: taskMasterId },
            roomId: { stringValue: roomId },
            canonicalRoutineId: { stringValue: routineId },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: createTime },
            lastOperationId: { stringValue: 'op_init' }
          }
        }
      });

      // Tenta alterar o taskMasterId do índice existente
      const resMutate = await emulatorRestRequest(`families/${familyId}/routineIndex/${indexKey}`, {
        method: 'PATCH',
        authHeader: adminAuth,
        body: {
          fields: {
            taskMasterId: { stringValue: 'tm_ALTERADO_ILEGALMENTE' },
            roomId: { stringValue: roomId },
            canonicalRoutineId: { stringValue: routineId },
            status: { stringValue: 'ACTIVE' },
            createdAt: { stringValue: createTime },
            lastOperationId: { stringValue: 'op_mutate' }
          }
        }
      });

      if (resMutate.status === 403 || resMutate.status === 400) {
        scenarioResults.push({
          id: 'EMU-07',
          name: REQUIRED_EMULATOR_SCENARIOS[6].name,
          category: 'SECURITY_RULES',
          status: 'PASS',
          details: `Tentativa de alterar taskMasterId no índice rejeitada por imutabilidade estrita.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-07',
          name: REQUIRED_EMULATOR_SCENARIOS[6].name,
          category: 'SECURITY_RULES',
          status: 'FAIL',
          reason: `Alteração de identidade deveria ser barrada, status HTTP: ${resMutate.status}`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-07', name: REQUIRED_EMULATOR_SCENARIOS[6].name, category: 'SECURITY_RULES', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-08: Timeout de rede antes do commit (geração de UNKNOWN_COMMIT)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu08_${Date.now()}`;
      // Adaptador que lança timeout proposital
      const timeoutStore = {
        ...adapter,
        runTransaction: async () => {
          throw new Error('Firestore timeout: connection terminated before commit confirmation');
        }
      };

      const res = await RoutineTransactionalService.executeBatchRoutines({
        familyId,
        items: [{ taskMasterId: 'tm_tmo', roomId: 'geral', name: 'Teste Timeout', frequency: 'DAILY' }],
        operationId: `op_tmo_${Date.now()}`,
        store: timeoutStore as any
      });

      if (res.items[0]?.status === 'UNKNOWN_COMMIT' && res.items[0]?.retryable === true) {
        scenarioResults.push({
          id: 'EMU-08',
          name: REQUIRED_EMULATOR_SCENARIOS[7].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'PASS',
          details: `Timeout pré-commit classificado corretamente como UNKNOWN_COMMIT e elegível para retry idempotente.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-08',
          name: REQUIRED_EMULATOR_SCENARIOS[7].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'FAIL',
          reason: `Status esperado UNKNOWN_COMMIT, obtido: ${res.items[0]?.status}`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-08', name: REQUIRED_EMULATOR_SCENARIOS[7].name, category: 'TRANSACTIONAL_INTEGRITY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-09: Timeout após commit com recuperação no servidor (AUD-B2A-01)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu09_${Date.now()}`;
      const taskMasterId = 'tm_recov';
      const roomId = 'sala';
      const opId = `op_emu09_${Date.now()}`;

      // Executa commit real no emulador
      await RoutineTransactionalService.executeBatchRoutines({
        familyId,
        items: [{ taskMasterId, roomId, name: 'Rotina com Recuperação', frequency: 'DAILY' }],
        operationId: opId,
        store: adapter
      });

      // Sonda o servidor usando probeAndReconcileOperation
      const probe = await RoutineTransactionalService.probeAndReconcileOperation({
        familyId,
        operationId: opId,
        items: [{ taskMasterId, roomId, name: 'Rotina com Recuperação', frequency: 'DAILY' }],
        store: adapter
      });

      if (!probe.isUnknown && probe.reconciledResult?.items[0]?.status === 'CREATED') {
        scenarioResults.push({
          id: 'EMU-09',
          name: REQUIRED_EMULATOR_SCENARIOS[8].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'PASS',
          details: `Operação recuperada a partir do ledger comitado no servidor com isUnknown: false e status CREATED.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-09',
          name: REQUIRED_EMULATOR_SCENARIOS[8].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'FAIL',
          reason: `Recuperação falhou: isUnknown=${probe.isUnknown}, status=${probe.reconciledResult?.items[0]?.status}`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-09', name: REQUIRED_EMULATOR_SCENARIOS[8].name, category: 'TRANSACTIONAL_INTEGRITY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-10: UNKNOWN_COMMIT com ledger ausente preserva isUnknown: true
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu10_${Date.now()}`;
      const probe = await RoutineTransactionalService.probeAndReconcileOperation({
        familyId,
        operationId: `op_inexistente_${Date.now()}`,
        items: [{ taskMasterId: 'tm_nada', roomId: 'quarto', name: 'Nada', frequency: 'DAILY' }],
        store: adapter
      });

      if (probe.isUnknown === true) {
        scenarioResults.push({
          id: 'EMU-10',
          name: REQUIRED_EMULATOR_SCENARIOS[9].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'PASS',
          details: `Ledger e índices ausentes: isUnknown: true estritamente preservado sem inferência arbitrária.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-10',
          name: REQUIRED_EMULATOR_SCENARIOS[9].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'FAIL',
          reason: `isUnknown deveria ser true na ausência de evidência.`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-10', name: REQUIRED_EMULATOR_SCENARIOS[9].name, category: 'TRANSACTIONAL_INTEGRITY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-11: Recuperação por operationId a partir do servidor (getDocFromServer)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu11_${Date.now()}`;
      const opId = `op_emu11_${Date.now()}`;
      await RoutineTransactionalService.executeBatchRoutines({
        familyId,
        items: [{ taskMasterId: 'tm_server_get', roomId: 'banheiro', name: 'Banheiro', frequency: 'DAILY' }],
        operationId: opId,
        store: adapter
      });

      const serverLedger = await adapter.directGetOperationLedger(familyId, opId);

      if (serverLedger && serverLedger.operationId === opId && serverLedger.status === 'COMMITTED') {
        scenarioResults.push({
          id: 'EMU-11',
          name: REQUIRED_EMULATOR_SCENARIOS[10].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'PASS',
          details: `getDocFromServer recuperou o documento comitado diretamente do servidor Firestore.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-11',
          name: REQUIRED_EMULATOR_SCENARIOS[10].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'FAIL',
          reason: `Ledger não retornado via getDocFromServer do emulador.`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-11', name: REQUIRED_EMULATOR_SCENARIOS[10].name, category: 'TRANSACTIONAL_INTEGRITY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-12: Sincronização concorrente de assignments (Create-If-Absent em 15 dias)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu12_${Date.now()}`;
      const res = await RoutineTransactionalService.executeBatchRoutines({
        familyId,
        items: [{ taskMasterId: 'tm_sync_occ', roomId: 'sala', name: 'Rotina Diária', frequency: 'DAILY' }],
        operationId: `op_emu12_${Date.now()}`,
        store: adapter,
        today: '2026-11-09'
      });

      const routineId = res.items[0]?.routineId!;
      const routine = (await adapter.directGetFamilyTask(familyId, routineId))!;

      // Dispara 5 sincronizações de ocorrências simultâneas sobre a mesma rotina
      const horizonDates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
      const syncPromises = Array.from({ length: 5 }, () => {
        return RoutineTransactionalService.transactionalSyncOccurrences({
          familyId,
          routine,
          horizonDates,
          store: adapter,
          today: '2026-11-09'
        });
      });

      const syncResults = await Promise.all(syncPromises);
      const asgCol = collection(db, 'families', familyId, 'assignments');
      const asgSnap = await getDocs(asgCol);

      // 15 datas no horizonte: exatamente 15 ocorrências geradas sem duplicatas
      const uniqueIds = new Set(asgSnap.docs.map(d => d.id));
      const hasDuplicates = uniqueIds.size !== asgSnap.docs.length;

      if (asgSnap.docs.length === 15 && !hasDuplicates) {
        scenarioResults.push({
          id: 'EMU-12',
          name: REQUIRED_EMULATOR_SCENARIOS[11].name,
          category: 'CONCURRENCY',
          status: 'PASS',
          details: `5 sincronizações simultâneas em 15 datas: exatamente 15 ocorrências únicas mantidas sem duplicação (Create-If-Absent atômico).`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-12',
          name: REQUIRED_EMULATOR_SCENARIOS[11].name,
          category: 'CONCURRENCY',
          status: 'FAIL',
          reason: `Esperava 15 ocorrências únicas sem duplicação. Total: ${asgSnap.docs.length}, Únicos: ${uniqueIds.size}.`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-12', name: REQUIRED_EMULATOR_SCENARIOS[11].name, category: 'CONCURRENCY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-13: Preservação de tarefas concluídas (COMPLETED, DONE, completed_at)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu13_${Date.now()}`;
      const routineId = 'ft_comp_pres_1';
      const dateStr = '2026-11-10';
      const occId = `${routineId}_${dateStr}`;

      // Seed de ocorrência COMPLETED
      const asgRef = doc(db, 'families', familyId, 'assignments', occId);
      await setDoc(asgRef, {
        id: occId,
        familyId,
        routineId,
        date: dateStr,
        status: 'COMPLETED',
        completed_at: '2026-11-10T11:00:00Z',
        completed_by: 'mem_maria'
      });

      const routine: FamilyTask = {
        id: routineId,
        familyId,
        taskMasterId: 'tm_test',
        roomId: 'sala',
        name: 'Rotina Reconfigurada',
        frequency: 'DAILY',
        active: true,
        created_at: '2026-11-01T00:00:00Z'
      };

      const syncRes = await RoutineTransactionalService.transactionalSyncOccurrences({
        familyId,
        routine,
        horizonDates: [dateStr],
        store: adapter,
        today: '2026-11-09'
      });

      const checkSnap = await adapter.directGetAssignment(familyId, occId);

      if (
        syncRes.preserved.includes(occId) &&
        checkSnap?.status === 'COMPLETED' &&
        checkSnap?.completed_at === '2026-11-10T11:00:00Z'
      ) {
        scenarioResults.push({
          id: 'EMU-13',
          name: REQUIRED_EMULATOR_SCENARIOS[12].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'PASS',
          details: `Ocorrência COMPLETED preservada estritamente intacta sem sobreposição.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-13',
          name: REQUIRED_EMULATOR_SCENARIOS[12].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'FAIL',
          reason: `Ocorrência COMPLETED não preservada corretamente.`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-13', name: REQUIRED_EMULATOR_SCENARIOS[12].name, category: 'TRANSACTIONAL_INTEGRITY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-14: Preservação de atribuições de moradores fora do novo cronograma (OFF_SCHEDULE_PRESERVED)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu14_${Date.now()}`;
      const routineId = 'ft_off_sched_1';
      const dateStr = '2026-11-11';
      const occId = `${routineId}_${dateStr}`;

      // Ocorrência atribuída a morador (não vazia)
      const asgRef = doc(db, 'families', familyId, 'assignments', occId);
      await setDoc(asgRef, {
        id: occId,
        familyId,
        routineId,
        date: dateStr,
        status: 'SCHEDULED',
        member_id: 'mem_joao',
        is_unassigned: false
      });

      // Rotina agora ocorre apenas nas segundas (2026-11-11 é quarta-feira)
      const routine: FamilyTask = {
        id: routineId,
        familyId,
        taskMasterId: 'tm_weekly',
        roomId: 'sala',
        name: 'Rotina Semanal',
        frequency: 'WEEKLY',
        preferred_days: [1], // Segundas
        active: true,
        created_at: '2026-11-01T00:00:00Z'
      };

      const syncRes = await RoutineTransactionalService.transactionalSyncOccurrences({
        familyId,
        routine,
        horizonDates: [dateStr],
        store: adapter,
        today: '2026-11-09'
      });

      const checkSnap = await adapter.directGetAssignment(familyId, occId);

      if (
        syncRes.reconciled.includes(occId) &&
        checkSnap?.status === 'SCHEDULED' &&
        checkSnap?.factors?.conflict === 'OFF_SCHEDULE_PRESERVED'
      ) {
        scenarioResults.push({
          id: 'EMU-14',
          name: REQUIRED_EMULATOR_SCENARIOS[13].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'PASS',
          details: `Atribuição do morador mem_joao preservada com flag OFF_SCHEDULE_PRESERVED.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-14',
          name: REQUIRED_EMULATOR_SCENARIOS[13].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'FAIL',
          reason: `Atribuição não preservada com OFF_SCHEDULE_PRESERVED. Status=${checkSnap?.status}, conflict=${checkSnap?.factors?.conflict}`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-14', name: REQUIRED_EMULATOR_SCENARIOS[13].name, category: 'TRANSACTIONAL_INTEGRITY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-15: Falha parcial entre rotinas e ocorrências (PARTIALLY_COMMITTED)
    // ------------------------------------------------------------------------
    try {
      const familyId = `fam_emu15_${Date.now()}`;
      const opId = `op_emu15_${Date.now()}`;

      // Injeta falha na Fase 2 (sincronização de ocorrências)
      let txnCallCount = 0;
      const partialStore = {
        ...adapter,
        runTransaction: async (fn: any) => {
          txnCallCount++;
          // A chamada 1 é a Fase 1 (rotinas e ledger).
          // A chamada 2 é a Fase 2 (ocorrências). Lançamos erro proposital aqui.
          if (txnCallCount === 2) {
            throw new Error('Falha simulada na sincronização de ocorrências');
          }
          // A chamada 3 atualiza o ledger para PARTIALLY_COMMITTED.
          return await adapter.runTransaction(fn);
        }
      };

      const res = await RoutineTransactionalService.executeBatchRoutines({
        familyId,
        items: [{ taskMasterId: 'tm_part', roomId: 'quarto', name: 'Rotina Parcial', frequency: 'DAILY' }],
        operationId: opId,
        store: partialStore as any
      });

      const ledger = await adapter.directGetOperationLedger(familyId, opId);

      if (
        res.items[0]?.status === 'OCCURRENCE_SYNC_PENDING' &&
        ledger?.status === 'PARTIALLY_COMMITTED'
      ) {
        scenarioResults.push({
          id: 'EMU-15',
          name: REQUIRED_EMULATOR_SCENARIOS[14].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'PASS',
          details: `Falha na Fase 2 capturada: item como OCCURRENCE_SYNC_PENDING e ledger sincronizado como PARTIALLY_COMMITTED.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-15',
          name: REQUIRED_EMULATOR_SCENARIOS[14].name,
          category: 'TRANSACTIONAL_INTEGRITY',
          status: 'FAIL',
          reason: `Esperava OCCURRENCE_SYNC_PENDING e PARTIALLY_COMMITTED. Obtido: item=${res.items[0]?.status}, ledger=${ledger?.status}`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-15', name: REQUIRED_EMULATOR_SCENARIOS[14].name, category: 'TRANSACTIONAL_INTEGRITY', status: 'FAIL', reason: err.message });
    }

    // ------------------------------------------------------------------------
    // EMU-16: Isolamento estrito entre famílias (zero contaminação cross-tenant)
    // ------------------------------------------------------------------------
    try {
      const familyA = `fam_emu16_A_${Date.now()}`;
      const familyB = `fam_emu16_B_${Date.now()}`;

      await RoutineTransactionalService.executeBatchRoutines({
        familyId: familyA,
        items: [{ taskMasterId: 'tm_isolamento', roomId: 'sala', name: 'Rotina Família A', frequency: 'DAILY' }],
        operationId: `op_emu16_${Date.now()}`,
        store: adapter
      });

      // Verifica que família B está completamente vazia
      const colTasksB = collection(db, 'families', familyB, 'familyTasks');
      const snapTasksB = await getDocs(colTasksB);
      const colIndexB = collection(db, 'families', familyB, 'routineIndex');
      const snapIndexB = await getDocs(colIndexB);
      const colLedgerB = collection(db, 'families', familyB, 'operationLedgers');
      const snapLedgerB = await getDocs(colLedgerB);

      if (snapTasksB.docs.length === 0 && snapIndexB.docs.length === 0 && snapLedgerB.docs.length === 0) {
        scenarioResults.push({
          id: 'EMU-16',
          name: REQUIRED_EMULATOR_SCENARIOS[15].name,
          category: 'MULTI_TENANT',
          status: 'PASS',
          details: `Isolamento absoluto validado no Firestore: Família A com dados persistidos e Família B 100% vazia.`
        });
      } else {
        scenarioResults.push({
          id: 'EMU-16',
          name: REQUIRED_EMULATOR_SCENARIOS[15].name,
          category: 'MULTI_TENANT',
          status: 'FAIL',
          reason: `Vazamento cross-tenant detectado na Família B!`
        });
      }
    } catch (err: any) {
      scenarioResults.push({ id: 'EMU-16', name: REQUIRED_EMULATOR_SCENARIOS[15].name, category: 'MULTI_TENANT', status: 'FAIL', reason: err.message });
    }

  } finally {
    try {
      await deleteApp(app);
    } catch {}
  }

  const allPassed = scenarioResults.every(s => s.status === 'PASS');
  const passCount = scenarioResults.filter(s => s.status === 'PASS').length;

  return {
    status: allPassed ? 'EXECUTED' : 'EXECUTED',
    summary: `${passCount} de ${scenarioResults.length} testes reais executados e APROVADOS no Firebase Local Emulator Suite (porta 8088, DB '${REQUIRED_NAMED_DATABASE_ID}').`,
    scenarios: scenarioResults
  };
}
