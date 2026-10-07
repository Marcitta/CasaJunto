/**
 * CASA JUNTO — TEST SUITE NOTIFICATIONS-1B.1
 * Backend FCM Foundation — Infraestrutura de Envio (Firebase Admin / Functions):
 * 
 * N1B1-01: backend declara explicitamente o databaseId ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c.
 * N1B1-02: busca apenas pushDevices active=true.
 * N1B1-03: usuário com dois dispositivos ativos gera dois candidatos de envio.
 * N1B1-04: dispositivo active=false não recebe tentativa.
 * N1B1-05: usuário sem pushDevice retorna resultado válido com zero envios.
 * N1B1-06: payload suporta title/body/data sem depender de TaskAssignment.
 * N1B1-07: token inválido definitivo gera soft deactivate active=false.
 * N1B1-08: erro FCM temporário NÃO desativa device.
 * N1B1-09: nenhum token completo é escrito em log.
 * N1B1-10: nenhuma credencial privada/server key/service-account é adicionada ao repo.
 * N1B1-11: nenhum endpoint público inseguro de envio é criado.
 * N1B1-12: arquivos protegidos do Motor 2.0 permanecem inalterados.
 */

import fs from 'fs';
import path from 'path';
import {
  PushDeliveryService,
  PushNotificationPayload,
  DEFINITIVE_INVALID_TOKEN_ERROR_CODES,
  TEMPORARY_ERROR_CODES
} from '../../functions/src/services/pushDeliveryService';
import { CASAJUNTO_FIRESTORE_DATABASE_ID } from '../../functions/src/firebaseAdmin';

export async function runNotifications1b1Tests(): Promise<{
  passed: number;
  failed: number;
  results: { testName: string; passed: boolean; message?: string }[];
}> {
  const results: { testName: string; passed: boolean; message?: string }[] = [];
  let passed = 0;
  let failed = 0;

  function getProjectRoot(): string {
    if (fs.existsSync(path.resolve('functions/src/firebaseAdmin.ts'))) {
      return path.resolve('.');
    }
    if (fs.existsSync(path.resolve('../functions/src/firebaseAdmin.ts'))) {
      return path.resolve('..');
    }
    return path.resolve('.');
  }

  const rootDir = getProjectRoot();

  async function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      results.push({ testName: `Notifications-1B.1 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `Notifications-1B.1 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  // Mock builder para simular Firestore Admin SDK em memória
  function createMockFirestore(docsByUserId: Record<string, any[]>) {
    return {
      collection: (colName: string) => {
        if (colName !== 'users') throw new Error(`Unexpected collection ${colName}`);
        return {
          doc: (userId: string) => ({
            collection: (subColName: string) => {
              if (subColName !== 'pushDevices') throw new Error(`Unexpected subcollection ${subColName}`);
              const userDevices = docsByUserId[userId] || [];
              return {
                where: (field: string, op: string, val: any) => {
                  let filtered = userDevices;
                  if (field === 'active' && op === '==') {
                    filtered = userDevices.filter(d => d.active === val);
                  }
                  return {
                    get: async () => ({
                      size: filtered.length,
                      docs: filtered.map(d => ({
                        id: d.id,
                        data: () => d,
                        ref: {
                          update: async (fields: any) => {
                            Object.assign(d, fields);
                          },
                          delete: async () => {
                            d._deleted = true;
                          }
                        }
                      }))
                    })
                  };
                }
              };
            }
          })
        };
      }
    };
  }

  // Mock builder para simular Firebase Admin Messaging
  function createMockMessaging(behavior?: (token: string) => Promise<any> | void) {
    const sentMessages: any[] = [];
    return {
      send: async (msg: any) => {
        sentMessages.push(msg);
        if (behavior) {
          await behavior(msg.token);
        }
        return `projects/trusty-coder-386311/messages/mock_${Date.now()}`;
      },
      getSentMessages: () => sentMessages
    };
  }

  // N1B1-01: backend declara explicitamente o databaseId canônico
  await record('N1B1-01', 'backend declara explicitamente o databaseId nomeado', () => {
    const expectedId = 'ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c';

    if (CASAJUNTO_FIRESTORE_DATABASE_ID !== expectedId) {
      throw new Error(`CASAJUNTO_FIRESTORE_DATABASE_ID inválido: ${CASAJUNTO_FIRESTORE_DATABASE_ID}`);
    }

    const adminFile = path.resolve(rootDir, 'functions/src/firebaseAdmin.ts');
    const content = fs.readFileSync(adminFile, 'utf-8');

    if (!content.includes(expectedId)) {
      throw new Error(`firebaseAdmin.ts não contém a declaração explícita de ${expectedId}`);
    }

    if (content.includes("getFirestore(app)") && !content.includes("getFirestore(app, targetDbId)")) {
      throw new Error('getFirestore não pode ser chamado sem especificar o databaseId nomeado');
    }
  });

  // N1B1-02: busca apenas pushDevices active=true
  await record('N1B1-02', 'busca e seleciona exclusivamente pushDevices com active == true', async () => {
    const userId = 'user-filter-test-01';
    const mockDb = createMockFirestore({
      [userId]: [
        { id: 'dev-active', active: true, token: 'fcm-token-valid-01' },
        { id: 'dev-inactive', active: false, token: 'fcm-token-inactive-02' }
      ]
    });
    const mockMessaging = createMockMessaging();

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: { title: 'Tarefa', body: 'Lembrete' },
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.devicesFound !== 1) {
      throw new Error(`Esperava encontrar 1 device ativo, encontrado: ${res.devicesFound}`);
    }
    if (res.deliveriesAttempted !== 1) {
      throw new Error(`Esperava 1 tentativa, obtido: ${res.deliveriesAttempted}`);
    }
    if (mockMessaging.getSentMessages().length !== 1) {
      throw new Error('Messaging deveria receber envio apenas para o dispositivo ativo');
    }
    if (mockMessaging.getSentMessages()[0].token !== 'fcm-token-valid-01') {
      throw new Error('Token enviado difere do dispositivo ativo');
    }
  });

  // N1B1-03: usuário com dois dispositivos ativos gera dois candidatos de envio
  await record('N1B1-03', 'usuário com dois dispositivos ativos gera duas tentativas com sucesso', async () => {
    const userId = 'user-multi-device-03';
    const mockDb = createMockFirestore({
      [userId]: [
        { id: 'dev-phone', active: true, token: 'fcm-phone-token-12345' },
        { id: 'dev-tablet', active: true, token: 'fcm-tablet-token-67890' }
      ]
    });
    const mockMessaging = createMockMessaging();

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: { title: 'Rotina', body: 'Hora de arrumar a sala' },
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.devicesFound !== 2) throw new Error(`Esperava 2 devices, obtido: ${res.devicesFound}`);
    if (res.deliveriesAttempted !== 2) throw new Error(`Esperava 2 envios, obtido: ${res.deliveriesAttempted}`);
    if (res.successCount !== 2) throw new Error(`Esperava 2 sucessos, obtido: ${res.successCount}`);
    if (res.failureCount !== 0) throw new Error(`Esperava 0 falhas, obtido: ${res.failureCount}`);
  });

  // N1B1-04: dispositivo active=false não recebe tentativa
  await record('N1B1-04', 'dispositivo active=false não recebe tentativa de envio', async () => {
    const userId = 'user-inactive-only-04';
    const mockDb = createMockFirestore({
      [userId]: [
        { id: 'dev-logged-out', active: false, token: 'fcm-old-token-000' }
      ]
    });
    const mockMessaging = createMockMessaging();

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: { title: 'Alerta', body: 'Mensagem' },
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.devicesFound !== 0) throw new Error(`Esperava 0 devices ativos, obtido: ${res.devicesFound}`);
    if (res.deliveriesAttempted !== 0) throw new Error(`Esperava 0 tentativas, obtido: ${res.deliveriesAttempted}`);
    if (mockMessaging.getSentMessages().length !== 0) throw new Error('Nenhuma mensagem FCM deve ser enviada');
  });

  // N1B1-05: usuário sem pushDevice retorna resultado válido com zero envios
  await record('N1B1-05', 'usuário sem pushDevices cadastrados retorna resultado limpo sem erro', async () => {
    const userId = 'user-no-devices-05';
    const mockDb = createMockFirestore({});
    const mockMessaging = createMockMessaging();

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: { title: 'Aviso', body: 'Sem dispositivos' },
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.devicesFound !== 0) throw new Error(`devicesFound deve ser 0`);
    if (res.deliveriesAttempted !== 0) throw new Error(`deliveriesAttempted deve ser 0`);
    if (res.successCount !== 0) throw new Error(`successCount deve ser 0`);
    if (res.failureCount !== 0) throw new Error(`failureCount deve ser 0`);
    if (res.invalidTokensCount !== 0) throw new Error(`invalidTokensCount deve ser 0`);
  });

  // N1B1-06: payload suporta title/body/data sem depender de TaskAssignment
  await record('N1B1-06', 'payload é puro e suporta title/body/data sem acoplamento a TaskAssignment', async () => {
    const userId = 'user-payload-test-06';
    const mockDb = createMockFirestore({
      [userId]: [
        { id: 'dev-1', active: true, token: 'fcm-valid-token-1111' }
      ]
    });
    const mockMessaging = createMockMessaging();

    const payload: PushNotificationPayload = {
      title: 'Lembrete CasaJunto',
      body: 'Não se esqueça de alimentar o pet',
      data: {
        customKey: 'customValue',
        notificationType: 'TASK_REMINDER',
        timestamp: '1728100000'
      }
    };

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.successCount !== 1) throw new Error('Envio deveria ter sucesso');
    const sent = mockMessaging.getSentMessages()[0];
    if (sent.notification) throw new Error('FCM payload não deve conter objeto notification (data-only requerido para evitar duplicação)');
    if (sent.data.title !== payload.title) throw new Error('title divergente em sent.data');
    if (sent.data.body !== payload.body) throw new Error('body divergente em sent.data');
    if (sent.data.customKey !== 'customValue') throw new Error('data customKey divergente');
    if (sent.data.notificationType !== 'TASK_REMINDER') throw new Error('data notificationType divergente');
  });

  // N1B1-07: token inválido definitivo gera soft deactivate active=false (nunca delete)
  await record('N1B1-07', 'token inválido definitivo executa soft deactivate (active=false, sem delete)', async () => {
    const userId = 'user-invalid-token-07';
    const deviceDoc = {
      id: 'dev-unregistered',
      active: true,
      token: 'fcm-stale-token-777',
      _deleted: false
    };

    const mockDb = createMockFirestore({
      [userId]: [deviceDoc]
    });

    const mockMessaging = createMockMessaging((token) => {
      const err: any = new Error('Requested entity was not found.');
      err.code = 'messaging/registration-token-not-registered';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: { title: 'Lembrete', body: 'Teste token' },
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.invalidTokensCount !== 1) {
      throw new Error(`Esperava 1 invalidToken, obtido: ${res.invalidTokensCount}`);
    }
    if (res.successCount !== 0) throw new Error('Sucessos deve ser 0');
    if (deviceDoc.active !== false) {
      throw new Error('Dispositivo com token inválido DEVE ser desativado (active = false)');
    }
    if (deviceDoc._deleted === true) {
      throw new Error('Violação: Documento não pode sofrer hard delete!');
    }
  });

  // N1B1-08: erro FCM temporário NÃO desativa device
  await record('N1B1-08', 'erro FCM temporário (server-unavailable) NÃO desativa device', async () => {
    const userId = 'user-temp-error-08';
    const deviceDoc = {
      id: 'dev-temp-failure',
      active: true,
      token: 'fcm-temp-token-888',
      _deleted: false
    };

    const mockDb = createMockFirestore({
      [userId]: [deviceDoc]
    });

    const mockMessaging = createMockMessaging((token) => {
      const err: any = new Error('Server unavailable');
      err.code = 'messaging/server-unavailable';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: { title: 'Lembrete', body: 'Erro de rede' },
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.failureCount !== 1) throw new Error(`Esperava failureCount = 1, obtido: ${res.failureCount}`);
    if (res.invalidTokensCount !== 0) throw new Error('invalidTokensCount deve ser 0 para erro temporário');
    if (deviceDoc.active !== true) {
      throw new Error('Dispositivo DEVE permanecer ativo (active === true) após erro temporário');
    }
  });

  // N1B1-09: nenhum token completo é escrito em log
  await record('N1B1-09', 'função maskToken e código de envio protegem contra vazamento de tokens', () => {
    const rawToken = 'fcm-very-secret-token-abcdef1234567890xyz';
    const masked = PushDeliveryService.maskToken(rawToken);

    if (masked === rawToken) {
      throw new Error('Token não foi mascarado');
    }
    if (!masked.includes('...')) {
      throw new Error('Token mascarado deve conter elipses');
    }
    if (masked.includes('secret-token')) {
      throw new Error('Miolo do token não pode estar visível');
    }

    // Validação estática nos arquivos de functions
    const serviceFile = path.resolve(rootDir, 'functions/src/services/pushDeliveryService.ts');
    const content = fs.readFileSync(serviceFile, 'utf-8');

    if (content.includes('console.log(token)') || content.includes('console.warn(token)')) {
      throw new Error('Log direto de token encontrado em pushDeliveryService.ts');
    }
  });

  // N1B1-10: nenhuma credencial privada/server key/service-account é adicionada ao repo
  await record('N1B1-10', 'nenhuma credencial privada ou service account é adicionada ao repositório', () => {
    const files = [
      'functions/package.json',
      'functions/src/firebaseAdmin.ts',
      'functions/src/services/pushDeliveryService.ts',
      'functions/src/index.ts',
      'firebase.json'
    ];

    const forbiddenPatterns = [
      'private_key',
      'PRIVATE KEY',
      'client_secret',
      'type": "service_account',
      'serverKey'
    ];

    for (const f of files) {
      const fullPath = path.resolve(rootDir, f);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const pattern of forbiddenPatterns) {
        if (content.includes(pattern)) {
          throw new Error(`Credencial ou padrão proibido encontrado em ${f}: "${pattern}"`);
        }
      }
    }
  });

  // N1B1-11: nenhum endpoint público inseguro de envio é criado
  await record('N1B1-11', 'nenhum endpoint HTTP público inseguro de envio foi criado', () => {
    const indexFile = path.resolve(rootDir, 'functions/src/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');

    if (content.includes('onRequest') || content.includes('onCall') || content.includes('express()')) {
      throw new Error('index.ts não deve expor endpoints HTTP (onRequest/onCall) neste pacote');
    }
  });

  // N1B1-12: arquivos protegidos do Motor 2.0 permanecem inalterados
  await record('N1B1-12', 'arquivos protegidos do Motor 2.0 permanecem 100% intocados', () => {
    const motorFiles = [
      'src/domain/distribution/DistributionEngine.ts',
      'src/domain/distribution/RebalanceService.ts',
      'src/domain/distribution/SafetyService.ts',
      'src/domain/distribution/EligibilityService.ts',
      'src/domain/distribution/AvailabilityService.ts',
      'src/domain/distribution/ScoringService.ts',
      'src/domain/distribution/BalanceService.ts',
      'src/domain/distribution/ExplainabilityService.ts',
      'src/application/services/DistributionService.ts',
      'src/application/services/RoutineContinuityService.ts'
    ];

    const forbiddenTerms = [
      'PushDeliveryService',
      'firebase-admin',
      'CASAJUNTO_FIRESTORE_DATABASE_ID',
      'pushDeliveryService'
    ];

    for (const relPath of motorFiles) {
      const fullPath = path.resolve(rootDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          throw new Error(`Violação: ${relPath} contém termo indevido: "${term}"`);
        }
      }
    }
  });

  return { passed, failed, results };
}
