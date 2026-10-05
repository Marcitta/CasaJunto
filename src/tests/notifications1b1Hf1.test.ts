/**
 * CASA JUNTO — TEST SUITE NOTIFICATIONS-1B.1-HF1
 * Safe Invalid Token Classification:
 * 
 * HF1-01: registration-token-not-registered -> active=false.
 * HF1-02: invalid-registration-token -> active=false.
 * HF1-03: UNREGISTERED -> active=false.
 * HF1-04: INVALID_ARGUMENT causado por payload inválido -> device permanece active=true.
 * HF1-05: messaging/invalid-argument sem evidência de token inválido -> device permanece active=true.
 * HF1-06: INVALID_ARGUMENT com evidência inequívoca de registration token inválido -> active=false.
 * HF1-07: erro desconhecido -> NÃO desativa device.
 * HF1-08: nenhum hard delete.
 * HF1-09: nenhum token completo em logs ou resultado público de erro (sanitização estrita).
 * HF1-10: Motor 2.0 permanece 100% intocado.
 */

import fs from 'fs';
import path from 'path';
import {
  PushDeliveryService,
  PushNotificationPayload
} from '../../functions/src/services/pushDeliveryService';

export async function runNotifications1b1Hf1Tests(): Promise<{
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
      results.push({ testName: `Notifications-1B.1-HF1 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `Notifications-1B.1-HF1 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  // Mock builder para Firestore
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

  // Mock builder para Firebase Messaging
  function createMockMessaging(behavior: (token: string) => Promise<any> | void) {
    return {
      send: async (msg: any) => {
        await behavior(msg.token);
        return `projects/trusty-coder-386311/messages/mock_${Date.now()}`;
      }
    };
  }

  const samplePayload: PushNotificationPayload = {
    title: 'Lembrete',
    body: 'Teste de classificação de erro'
  };

  // HF1-01: registration-token-not-registered -> active=false
  await record('HF1-01', 'registration-token-not-registered desativa o dispositivo (active=false)', async () => {
    const userId = 'user-hf1-01';
    const deviceDoc = { id: 'dev-01', active: true, token: 'fcm-token-01', _deleted: false };
    const mockDb = createMockFirestore({ [userId]: [deviceDoc] });
    const mockMessaging = createMockMessaging(() => {
      const err: any = new Error('Requested entity was not found.');
      err.code = 'messaging/registration-token-not-registered';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: samplePayload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.invalidTokensCount !== 1) throw new Error('Deveria contar 1 invalidToken');
    if (deviceDoc.active !== false) throw new Error('Dispositivo deve terminar active=false');
    if (deviceDoc._deleted === true) throw new Error('Violação: hard delete não permitido');
  });

  // HF1-02: invalid-registration-token -> active=false
  await record('HF1-02', 'invalid-registration-token desativa o dispositivo (active=false)', async () => {
    const userId = 'user-hf1-02';
    const deviceDoc = { id: 'dev-02', active: true, token: 'fcm-token-02', _deleted: false };
    const mockDb = createMockFirestore({ [userId]: [deviceDoc] });
    const mockMessaging = createMockMessaging(() => {
      const err: any = new Error('Invalid registration token provided.');
      err.code = 'messaging/invalid-registration-token';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: samplePayload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.invalidTokensCount !== 1) throw new Error('Deveria contar 1 invalidToken');
    if (deviceDoc.active !== false) throw new Error('Dispositivo deve terminar active=false');
  });

  // HF1-03: UNREGISTERED -> active=false
  await record('HF1-03', 'código canônico UNREGISTERED desativa o dispositivo (active=false)', async () => {
    const userId = 'user-hf1-03';
    const deviceDoc = { id: 'dev-03', active: true, token: 'fcm-token-03', _deleted: false };
    const mockDb = createMockFirestore({ [userId]: [deviceDoc] });
    const mockMessaging = createMockMessaging(() => {
      const err: any = new Error('The registration token has been unregistered.');
      err.code = 'UNREGISTERED';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: samplePayload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.invalidTokensCount !== 1) throw new Error('Deveria contar 1 invalidToken');
    if (deviceDoc.active !== false) throw new Error('Dispositivo deve terminar active=false');
  });

  // HF1-04: INVALID_ARGUMENT causado por payload inválido -> device permanece active=true
  await record('HF1-04', 'INVALID_ARGUMENT com erro de payload NÃO desativa o dispositivo', async () => {
    const userId = 'user-hf1-04';
    const deviceDoc = { id: 'dev-04', active: true, token: 'fcm-token-04', _deleted: false };
    const mockDb = createMockFirestore({ [userId]: [deviceDoc] });
    const mockMessaging = createMockMessaging(() => {
      const err: any = new Error('Invalid payload: data payload size exceeds limit of 4096 bytes.');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: samplePayload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.invalidTokensCount !== 0) throw new Error('Erro de payload NÃO pode contar como invalidTokens');
    if (res.failureCount !== 1) throw new Error('Deveria ser computado como failureCount');
    if (deviceDoc.active !== true) throw new Error('Dispositivo com erro de payload DEVE continuar active=true');
  });

  // HF1-05: messaging/invalid-argument sem evidência de token inválido -> device permanece active=true
  await record('HF1-05', 'messaging/invalid-argument sem menção de token NÃO desativa o dispositivo', async () => {
    const userId = 'user-hf1-05';
    const deviceDoc = { id: 'dev-05', active: true, token: 'fcm-token-05', _deleted: false };
    const mockDb = createMockFirestore({ [userId]: [deviceDoc] });
    const mockMessaging = createMockMessaging(() => {
      const err: any = new Error('Title parameter must not exceed maximum length.');
      err.code = 'messaging/invalid-argument';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: samplePayload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.invalidTokensCount !== 0) throw new Error('Sem evidência inequívoca de token, invalidTokensCount deve ser 0');
    if (res.failureCount !== 1) throw new Error('Deveria ser computado como failureCount');
    if (deviceDoc.active !== true) throw new Error('Dispositivo DEVE permanecer active=true');
  });

  // HF1-06: INVALID_ARGUMENT com evidência inequívoca de registration token inválido -> active=false
  await record('HF1-06', 'INVALID_ARGUMENT com evidência inequívoca de registration token desativa (active=false)', async () => {
    const userId = 'user-hf1-06';
    const deviceDoc = { id: 'dev-06', active: true, token: 'fcm-token-06', _deleted: false };
    const mockDb = createMockFirestore({ [userId]: [deviceDoc] });
    const mockMessaging = createMockMessaging(() => {
      const err: any = new Error('The registration token is not a valid FCM registration token.');
      err.code = 'INVALID_ARGUMENT';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: samplePayload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.invalidTokensCount !== 1) throw new Error('Evidência inequívoca de registration token deve desativar');
    if (deviceDoc.active !== false) throw new Error('Dispositivo com token inválido deve terminar active=false');
  });

  // HF1-07: erro desconhecido -> NÃO desativa device
  await record('HF1-07', 'erro desconhecido ou transitório NÃO desativa o dispositivo', async () => {
    const userId = 'user-hf1-07';
    const deviceDoc = { id: 'dev-07', active: true, token: 'fcm-token-07', _deleted: false };
    const mockDb = createMockFirestore({ [userId]: [deviceDoc] });
    const mockMessaging = createMockMessaging(() => {
      const err: any = new Error('Internal server timeout');
      err.code = 'UNKNOWN_INTERNAL_ERROR';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: samplePayload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (res.invalidTokensCount !== 0) throw new Error('Erro desconhecido não pode contar como invalidTokens');
    if (res.failureCount !== 1) throw new Error('Deveria contar em failureCount');
    if (deviceDoc.active !== true) throw new Error('Dispositivo DEVE permanecer active=true');
  });

  // HF1-08: nenhum hard delete
  await record('HF1-08', 'operações de desativação utilizam exclusivamente soft deactivation (active=false)', async () => {
    const userId = 'user-hf1-08';
    const deviceDoc = { id: 'dev-08', active: true, token: 'fcm-token-08', _deleted: false };
    const mockDb = createMockFirestore({ [userId]: [deviceDoc] });
    const mockMessaging = createMockMessaging(() => {
      const err: any = new Error('The registration token has been unregistered.');
      err.code = 'UNREGISTERED';
      throw err;
    });

    await PushDeliveryService.sendPushToUser({
      userId,
      payload: samplePayload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    if (deviceDoc.active !== false) throw new Error('Dispositivo deve estar active=false');
    if (deviceDoc._deleted === true) throw new Error('Violação grave: Método delete() foi invocado no documento!');
  });

  // HF1-09: nenhum token completo em logs ou resultado público de erro
  await record('HF1-09', 'mensagens de erro com tokens são estritamente sanitizadas antes de expostas', async () => {
    const rawSecretToken = 'fcm-super-secret-production-token-9876543210-abcdef';
    const rawError = `Failed to deliver message to registration token "${rawSecretToken}": invalid format`;

    const sanitized = PushDeliveryService.sanitizeErrorMessage(rawError, rawSecretToken);

    if (sanitized.includes(rawSecretToken)) {
      throw new Error('Token secreto completo ainda está presente na mensagem sanitizada!');
    }
    if (!sanitized.includes('...')) {
      throw new Error('Mensagem sanitizada deve conter o token devidamente mascarado');
    }

    // Teste integrado de sanitização em details
    const userId = 'user-hf1-09';
    const deviceDoc = { id: 'dev-09', active: true, token: rawSecretToken, _deleted: false };
    const mockDb = createMockFirestore({ [userId]: [deviceDoc] });
    const mockMessaging = createMockMessaging(() => {
      const err: any = new Error(rawError);
      err.code = 'INVALID_ARGUMENT';
      throw err;
    });

    const res = await PushDeliveryService.sendPushToUser({
      userId,
      payload: samplePayload,
      firestoreDb: mockDb,
      messaging: mockMessaging
    });

    const detailMsg = res.details[0]?.errorMessage || '';
    if (detailMsg.includes(rawSecretToken)) {
      throw new Error('result.details contém o token completo não sanitizado!');
    }
  });

  // HF1-10: Motor 2.0 permanece intocado
  await record('HF1-10', 'Motor 2.0 permanece completamente intocado', () => {
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
      'isDefinitiveInvalidToken',
      'UNCONDITIONAL_INVALID_TOKEN_ERROR_CODES',
      'sanitizeErrorMessage'
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
