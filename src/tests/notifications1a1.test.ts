/**
 * CASA JUNTO — TEST SUITE NOTIFICATIONS-1A.1
 * FCM Foundation / Device Registration Infrastructure:
 * 
 * N1A1-01: usuário autenticado pode registrar próprio dispositivo.
 * N1A1-02: usuário não pode registrar dispositivo para outro UID.
 * N1A1-03: múltiplos dispositivos são suportados.
 * N1A1-04: renovação de token não gera comportamento inconsistente.
 * N1A1-05: dispositivo pode ser desativado.
 * N1A1-06: nenhum token é armazenado em Member.
 * N1A1-07: Motor 2.0 permanece sem dependências de FCM/Notification.
 * N1A1-08: nenhuma credencial privada/server-side aparece no frontend.
 */

import fs from 'fs';
import path from 'path';
import { PushDeviceService } from '../services/pushDeviceService';
import { PushDevice } from '../types';

export async function runNotifications1a1Tests(): Promise<{
  passed: number;
  failed: number;
  results: { testName: string; passed: boolean; message?: string }[];
}> {
  const results: { testName: string; passed: boolean; message?: string }[] = [];
  let passed = 0;
  let failed = 0;

  async function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      results.push({ testName: `Notifications-1A.1 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `Notifications-1A.1 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  // N1A1-01: usuário autenticado pode registrar próprio dispositivo
  await record('N1A1-01', 'usuário autenticado pode registrar próprio dispositivo com estrutura canônica', async () => {
    const store = new Map<string, PushDevice>();
    const userId = 'auth-uid-marina-01';
    const token = 'fcm-mock-token-xyz-12345';
    const deviceId = 'dev-browser-chrome-01';

    const device = await PushDeviceService.registerDevice({
      userId,
      token,
      deviceId,
      inMemoryStore: store
    });

    if (!device) throw new Error('Dispositivo não foi retornado pelo registro');
    if (device.id !== deviceId) throw new Error(`id esperado ${deviceId}, obtido ${device.id}`);
    if (device.userId !== userId) throw new Error(`userId esperado ${userId}, obtido ${device.userId}`);
    if (device.token !== token) throw new Error(`token esperado ${token}, obtido ${device.token}`);
    if (device.platform !== 'WEB') throw new Error(`platform esperada WEB, obtida ${device.platform}`);
    if (device.active !== true) throw new Error('Dispositivo recém-registrado deve ter active === true');
    if (!device.createdAt || isNaN(new Date(device.createdAt).getTime())) {
      throw new Error('createdAt deve ser timestamp ISO válido');
    }
    if (!device.updatedAt || isNaN(new Date(device.updatedAt).getTime())) {
      throw new Error('updatedAt deve ser timestamp ISO válido');
    }
    if (!device.lastSeenAt || isNaN(new Date(device.lastSeenAt).getTime())) {
      throw new Error('lastSeenAt deve ser timestamp ISO válido');
    }
  });

  // N1A1-02: usuário não pode registrar dispositivo para outro UID
  await record('N1A1-02', 'usuário não pode registrar ou consultar dispositivo para outro UID (fronteira de segurança)', async () => {
    // 1. Validação de rejeição de UID vazio/inválido
    try {
      await PushDeviceService.registerDevice({
        userId: '',
        token: 'token-abc',
        inMemoryStore: new Map()
      });
      throw new Error('Deveria ter rejeitado registro com userId vazio');
    } catch (e: any) {
      if (!e.message.includes('obrigatório')) {
        throw new Error(`Mensagem inesperada: ${e.message}`);
      }
    }

    // 2. Validação estrita nas regras de segurança do Firestore (firestore.rules)
    const rulesPath = path.resolve('firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

    // Verifica que existe regra específica para /users/{userId}/pushDevices/{deviceId}
    if (!rulesContent.includes('match /pushDevices/{deviceId}')) {
      throw new Error('firestore.rules deve conter match /pushDevices/{deviceId}');
    }

    // Verifica que exige request.auth.uid == userId
    const pushRuleBlock = rulesContent.substring(
      rulesContent.indexOf('match /pushDevices/{deviceId}'),
      rulesContent.indexOf('match /pushDevices/{deviceId}') + 200
    );

    if (!pushRuleBlock.includes('request.auth.uid == userId')) {
      throw new Error('Regra de pushDevices deve exigir estritamente request.auth.uid == userId');
    }
  });

  // N1A1-03: múltiplos dispositivos são suportados
  await record('N1A1-03', 'múltiplos dispositivos são suportados para o mesmo UID', async () => {
    const store = new Map<string, PushDevice>();
    const userId = 'auth-uid-multidevice';

    const devLaptop = await PushDeviceService.registerDevice({
      userId,
      token: 'token-laptop-111',
      deviceId: 'dev-laptop',
      inMemoryStore: store
    });

    const devPhone = await PushDeviceService.registerDevice({
      userId,
      token: 'token-phone-222',
      deviceId: 'dev-phone',
      inMemoryStore: store
    });

    const devTablet = await PushDeviceService.registerDevice({
      userId,
      token: 'token-tablet-333',
      deviceId: 'dev-tablet',
      inMemoryStore: store
    });

    const userDevices = await PushDeviceService.getUserDevices(userId, store);
    if (userDevices.length !== 3) {
      throw new Error(`Esperado 3 dispositivos para o usuário, obtido: ${userDevices.length}`);
    }

    const ids = userDevices.map(d => d.id).sort();
    if (ids[0] !== 'dev-laptop' || ids[1] !== 'dev-phone' || ids[2] !== 'dev-tablet') {
      throw new Error(`IDs de dispositivos divergiram: ${ids.join(', ')}`);
    }
  });

  // N1A1-04: renovação de token não gera comportamento inconsistente
  await record('N1A1-04', 'renovação de token atualiza dispositivo existente sem gerar registros duplicados', async () => {
    const store = new Map<string, PushDevice>();
    const userId = 'auth-uid-renewal-user';
    const deviceId = 'dev-persistent-desktop';

    // Registro inicial do token V1
    const initial = await PushDeviceService.registerDevice({
      userId,
      token: 'fcm-token-v1-initial',
      deviceId,
      inMemoryStore: store
    });

    const initialCreatedAt = initial.createdAt;

    // Simula renovação do token FCM para o mesmo dispositivo
    const renewed = await PushDeviceService.registerDevice({
      userId,
      token: 'fcm-token-v2-renewed',
      deviceId,
      inMemoryStore: store
    });

    if (renewed.id !== deviceId) {
      throw new Error(`ID do dispositivo mudou na renovação: ${renewed.id}`);
    }
    if (renewed.token !== 'fcm-token-v2-renewed') {
      throw new Error(`Token renovado não foi salvo: ${renewed.token}`);
    }
    if (renewed.createdAt !== initialCreatedAt) {
      throw new Error('createdAt original deve ser preservado na renovação');
    }

    const userDevices = await PushDeviceService.getUserDevices(userId, store);
    if (userDevices.length !== 1) {
      throw new Error(`Renovação gerou duplicatas! Total de dispositivos: ${userDevices.length}`);
    }
  });

  // N1A1-05: dispositivo pode ser desativado
  await record('N1A1-05', 'dispositivo pode ser desativado (active = false) preservando registro', async () => {
    const store = new Map<string, PushDevice>();
    const userId = 'auth-uid-deactivation';
    const deviceId = 'dev-to-deactivate';

    await PushDeviceService.registerDevice({
      userId,
      token: 'fcm-token-active',
      deviceId,
      inMemoryStore: store
    });

    // Desativação
    await PushDeviceService.deactivateDevice(userId, deviceId, store);

    const devices = await PushDeviceService.getUserDevices(userId, store);
    const deactivated = devices.find(d => d.id === deviceId);

    if (!deactivated) throw new Error('Dispositivo não encontrado após desativação');
    if (deactivated.active !== false) {
      throw new Error('Dispositivo desativado deve ter active === false');
    }
  });

  // N1A1-06: nenhum token é armazenado em Member
  await record('N1A1-06', 'nenhum token FCM é armazenado no modelo Member (pertence estritamente ao Firebase Auth UID)', () => {
    const memberTypesPath = path.resolve('src/types.ts');
    const typesContent = fs.readFileSync(memberTypesPath, 'utf-8');

    // Localizar a interface Member em types.ts
    const memberInterfaceMatch = typesContent.match(/export interface Member \{([\s\S]*?)\}/);
    if (!memberInterfaceMatch) {
      throw new Error('Interface Member não encontrada em src/types.ts');
    }
    const memberBody = memberInterfaceMatch[1];
    const forbiddenMemberFields = ['fcmToken', 'pushToken', 'token', 'pushDevices', 'deviceToken'];
    for (const field of forbiddenMemberFields) {
      if (memberBody.includes(`${field}:`) || memberBody.includes(`${field}?:`)) {
        throw new Error(`Violação: Member em types.ts contém campo indevido de notificação: "${field}"`);
      }
    }
  });

  // N1A1-07: Motor 2.0 permanece sem dependências de FCM/Notification
  await record('N1A1-07', 'Motor 2.0 permanece 100% puro e sem dependências de FCM/Notification', () => {
    const motorFiles = [
      'src/domain/distribution/DistributionEngine.ts',
      'src/domain/distribution/RebalanceService.ts',
      'src/domain/distribution/SafetyService.ts',
      'src/domain/distribution/EligibilityService.ts',
      'src/domain/distribution/AvailabilityService.ts',
      'src/domain/distribution/ScoringService.ts',
      'src/domain/distribution/BalanceService.ts',
      'src/domain/distribution/ExplainabilityService.ts'
    ];

    const forbiddenTerms = [
      'firebase/messaging',
      'pushDevices',
      'PushDevice',
      'fcm',
      'Notification',
      'ServiceWorker',
      'firebase-messaging-sw'
    ];

    for (const file of motorFiles) {
      const filePath = path.resolve(file);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');

      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          throw new Error(`Violação: ${file} contém dependência indevida de notificação: "${term}"`);
        }
      }
    }
  });

  // N1A1-08: nenhuma credencial privada/server-side aparece no frontend
  await record('N1A1-08', 'nenhuma credencial privada/server-side aparece no frontend ou service worker', () => {
    const filesToCheck = [
      'public/firebase-messaging-sw.js',
      'firebase-applet-config.json',
      'src/infrastructure/firebase/firebaseConfig.ts',
      'src/services/pushDeviceService.ts'
    ];

    const serverSidePatterns = [
      'private_key',
      'client_secret',
      'service_account',
      'PRIVATE KEY',
      'BEGIN RSA PRIVATE KEY'
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const pattern of serverSidePatterns) {
        if (content.includes(pattern)) {
          throw new Error(`Segurança: Credencial server-side/privada encontrada em ${relPath}: "${pattern}"`);
        }
      }
    }
  });

  return { passed, failed, results };
}
