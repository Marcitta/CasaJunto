/**
 * CASA JUNTO — TEST SUITE NOTIFICATIONS-1A.2-HF1
 * Safe Push Logout:
 * 
 * HF1-01: logout com PushDevice ativo chama deactivateDevice para UID e deviceId corretos.
 * HF1-02: PushDevice termina active=false.
 * HF1-03: estado local é removido após tentativa de desativação.
 * HF1-04: falha na desativação remota NÃO impede Firebase Auth logout.
 * HF1-05: logout sem dispositivo push registrado continua funcionando.
 * HF1-06: outros dispositivos do mesmo usuário permanecem ativos.
 * HF1-07: nenhum token é logado ou exibido.
 * HF1-08: Motor 2.0 permanece intocado.
 */

import fs from 'fs';
import path from 'path';
import { PushActivationService } from '../services/pushActivationService';
import { PushDevice } from '../types';

export async function runNotifications1a2Hf1Tests(): Promise<{
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
      results.push({ testName: `Notifications-1A.2-HF1 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `Notifications-1A.2-HF1 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  function createMockStorageWindow(initialStorage: Record<string, string> = {}) {
    const map = new Map<string, string>(Object.entries(initialStorage));
    return {
      localStorage: {
        getItem: (k: string) => map.get(k) || null,
        setItem: (k: string, v: string) => map.set(k, v),
        removeItem: (k: string) => map.delete(k)
      }
    };
  }

  // HF1-01: logout com PushDevice ativo chama deactivateDevice para UID e deviceId corretos
  await record('HF1-01', 'logout com PushDevice ativo desativa UID e deviceId corretos', async () => {
    const userId = 'user-hf1-01';
    const deviceId = 'dev-active-chrome-01';
    const store = new Map<string, PushDevice>();

    store.set(`${userId}_${deviceId}`, {
      id: deviceId,
      userId,
      token: 'fcm-token-01',
      platform: 'WEB',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    });

    const mockWin = createMockStorageWindow({
      casajunto_push_device_id: deviceId,
      casajunto_push_active_state: 'true'
    });

    await PushActivationService.handleLogout({
      userId,
      inMemoryStore: store,
      mockWindow: mockWin
    });

    const dev = store.get(`${userId}_${deviceId}`);
    if (!dev) throw new Error('Dispositivo não encontrado no store');
    if (dev.active !== false) throw new Error('Dispositivo deveria ter sido desativado (active: false)');
  });

  // HF1-02: PushDevice termina active=false (soft deactivation, sem hard delete)
  await record('HF1-02', 'PushDevice termina active=false sem hard delete', async () => {
    const userId = 'user-hf1-02';
    const deviceId = 'dev-soft-deactivate-02';
    const store = new Map<string, PushDevice>();

    const createdAt = '2026-10-01T10:00:00.000Z';
    store.set(`${userId}_${deviceId}`, {
      id: deviceId,
      userId,
      token: 'fcm-token-02',
      platform: 'WEB',
      active: true,
      createdAt,
      updatedAt: createdAt,
      lastSeenAt: createdAt
    });

    const mockWin = createMockStorageWindow({
      casajunto_push_device_id: deviceId
    });

    await PushActivationService.handleLogout({
      userId,
      inMemoryStore: store,
      mockWindow: mockWin
    });

    // O registro ainda deve existir (soft deactivation)
    if (!store.has(`${userId}_${deviceId}`)) {
      throw new Error('Violação: Registro foi excluído (hard delete) em vez de soft deactivation');
    }

    const dev = store.get(`${userId}_${deviceId}`)!;
    if (dev.active !== false) {
      throw new Error(`Esperado active === false, obtido: ${dev.active}`);
    }
    if (dev.createdAt !== createdAt) {
      throw new Error('createdAt original deve ser preservado');
    }
    if (dev.updatedAt === createdAt) {
      throw new Error('updatedAt deve ter sido atualizado no momento da desativação');
    }
  });

  // HF1-03: estado local é removido após tentativa de desativação
  await record('HF1-03', 'estado local é removido do localStorage após tentativa de desativação', async () => {
    const userId = 'user-hf1-03';
    const deviceId = 'dev-local-cleanup-03';
    const store = new Map<string, PushDevice>();

    store.set(`${userId}_${deviceId}`, {
      id: deviceId,
      userId,
      token: 'fcm-token-03',
      platform: 'WEB',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    });

    const mockWin = createMockStorageWindow({
      casajunto_push_device_id: deviceId,
      casajunto_push_active_state: 'true'
    });

    await PushActivationService.handleLogout({
      userId,
      inMemoryStore: store,
      mockWindow: mockWin
    });

    if (mockWin.localStorage.getItem('casajunto_push_device_id') !== null) {
      throw new Error('casajunto_push_device_id ainda está presente no localStorage após logout');
    }
    if (mockWin.localStorage.getItem('casajunto_push_active_state') !== null) {
      throw new Error('casajunto_push_active_state ainda está presente no localStorage após logout');
    }
  });

  // HF1-04: falha na desativação remota NÃO impede Firebase Auth logout
  await record('HF1-04', 'falha na desativação remota NÃO impede logout nem bloqueia limpeza local', async () => {
    const userId = 'user-hf1-04';
    const deviceId = 'dev-fail-04';

    // Cria store cujo set/get lança erro simulando falha de rede/Firestore
    const failingStore: any = {
      get: () => {
        throw new Error('Network timeout: Firestore inacessível');
      },
      set: () => {
        throw new Error('Network timeout: Firestore inacessível');
      }
    };

    const mockWin = createMockStorageWindow({
      casajunto_push_device_id: deviceId,
      casajunto_push_active_state: 'true'
    });

    // Não deve lançar exceção
    let threw = false;
    try {
      await PushActivationService.handleLogout({
        userId,
        inMemoryStore: failingStore,
        mockWindow: mockWin
      });
    } catch {
      threw = true;
    }

    if (threw) {
      throw new Error('handleLogout não deve propagar erro de rede (logout não pode ser bloqueado)');
    }

    // Mesmo com erro remoto, a limpeza local deve ter ocorrido (bloco finally)
    if (mockWin.localStorage.getItem('casajunto_push_device_id') !== null) {
      throw new Error('Limpeza local deve ser executada no bloco finally mesmo em caso de erro');
    }
    if (mockWin.localStorage.getItem('casajunto_push_active_state') !== null) {
      throw new Error('casajunto_push_active_state deve ser limpo no bloco finally mesmo em caso de erro');
    }
  });

  // HF1-05: logout sem dispositivo push registrado continua funcionando
  await record('HF1-05', 'logout sem dispositivo push registrado continua funcionando normalmente', async () => {
    const mockWin = createMockStorageWindow({});
    const store = new Map<string, PushDevice>();

    // Usuário sem dispositivo prévio
    await PushActivationService.handleLogout({
      userId: 'user-without-device',
      inMemoryStore: store,
      mockWindow: mockWin
    });

    // Também deve suportar chamada sem parâmetros
    await PushActivationService.handleLogout(null, store, mockWin);
  });

  // HF1-06: outros dispositivos do mesmo usuário permanecem ativos
  await record('HF1-06', 'outros dispositivos do mesmo usuário permanecem ativos', async () => {
    const userId = 'user-multi-device-06';
    const currentDevId = 'dev-browser-current';
    const otherDevId = 'dev-tablet-secondary';
    const store = new Map<string, PushDevice>();

    store.set(`${userId}_${currentDevId}`, {
      id: currentDevId,
      userId,
      token: 'fcm-token-curr',
      platform: 'WEB',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    });

    store.set(`${userId}_${otherDevId}`, {
      id: otherDevId,
      userId,
      token: 'fcm-token-other',
      platform: 'WEB',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    });

    const mockWin = createMockStorageWindow({
      casajunto_push_device_id: currentDevId,
      casajunto_push_active_state: 'true'
    });

    await PushActivationService.handleLogout({
      userId,
      inMemoryStore: store,
      mockWindow: mockWin
    });

    const curr = store.get(`${userId}_${currentDevId}`);
    const other = store.get(`${userId}_${otherDevId}`);

    if (!curr || curr.active !== false) {
      throw new Error('Dispositivo atual deve ter active: false');
    }
    if (!other || other.active !== true) {
      throw new Error('Outro dispositivo do usuário DEVE permanecer active: true');
    }
  });

  // HF1-07: nenhum token é logado ou exibido
  await record('HF1-07', 'nenhum token FCM é logado ou exibido na rotina de logout', () => {
    const filesToCheck = [
      'src/services/pushActivationService.ts',
      'src/context/AuthContext.tsx'
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      if (content.includes('console.log(token)') || content.includes('console.warn(token)') || content.includes('console.log(fcmToken)')) {
        throw new Error(`Violação: Log de token encontrado em ${relPath}`);
      }
    }
  });

  // HF1-08: Motor 2.0 permanece intocado
  await record('HF1-08', 'Motor 2.0 permanece estritamente puro e intocado', () => {
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
      'handleLogout',
      'PushActivationService',
      'PushNotificationSettings',
      'pushDevices',
      'Notification',
      'VAPID'
    ];

    for (const relPath of motorFiles) {
      const fullPath = path.resolve(relPath);
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
