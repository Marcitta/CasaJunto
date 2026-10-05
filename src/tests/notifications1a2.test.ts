/**
 * CASA JUNTO — TEST SUITE NOTIFICATIONS-1A.2
 * Push Permission + Device Activation UX:
 * 
 * N1A2-01: permissão não é solicitada automaticamente.
 * N1A2-02: clique em Ativar solicita permissão.
 * N1A2-03: permission granted obtém token e registra PushDevice.
 * N1A2-04: permission denied não registra token.
 * N1A2-05: VAPID ausente não quebra aplicação e não solicita permissão.
 * N1A2-06: navegador sem suporte recebe estado NOT_SUPPORTED.
 * N1A2-07: ativação repetida é idempotente.
 * N1A2-08: desativação afeta somente dispositivo atual.
 * N1A2-09: FCM token não aparece na UI/logs.
 * N1A2-10: iPhone/iPad em contexto incompatível recebe orientação para Tela de Início e não dispara solicitação indevida.
 * N1A2-11: Android/browser compatível segue fluxo normal.
 * N1A2-12: Motor 2.0 permanece intocado.
 *
 * NOTA DE AUDITORIA:
 * Os testes abaixo combinam análises estáticas de segurança com testes unitários isolados
 * que utilizam mocks das Web APIs (Notification, ServiceWorker, navigator, PushManager),
 * pois o ambiente de build Node.js não possui navegador headless nem hardware Android/iOS real.
 */

import fs from 'fs';
import path from 'path';
import { PushActivationService } from '../services/pushActivationService';
import { PushDevice } from '../types';

export async function runNotifications1a2Tests(): Promise<{
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
      results.push({ testName: `Notifications-1A.2 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `Notifications-1A.2 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  // Helper para criar mock de window compatível com Desktop/Android
  function createMockBrowserWindow(overrides: Partial<any> = {}) {
    let requestPermissionCount = 0;
    let permissionState: NotificationPermission = 'default';

    const win: any = {
      Notification: {
        get permission() {
          return permissionState;
        },
        set permission(val: NotificationPermission) {
          permissionState = val;
        },
        requestPermission: async () => {
          requestPermissionCount++;
          return permissionState === 'default' ? 'granted' : permissionState;
        }
      },
      navigator: {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
        platform: 'Win32',
        serviceWorker: {
          register: async () => ({ scope: '/' }),
          ready: Promise.resolve({ scope: '/' })
        }
      },
      PushManager: {},
      localStorage: (() => {
        const map = new Map<string, string>();
        return {
          getItem: (k: string) => map.get(k) || null,
          setItem: (k: string, v: string) => map.set(k, v),
          removeItem: (k: string) => map.delete(k)
        };
      })(),
      matchMedia: () => ({ matches: false }),
      getRequestPermissionCount: () => requestPermissionCount,
      ...overrides
    };

    return win;
  }

  // N1A2-01: permissão não é solicitada automaticamente (Unitário com Mock)
  await record('N1A2-01', 'permissão não é solicitada automaticamente na inspeção de estado [Mock]', async () => {
    const mockWin = createMockBrowserWindow();
    const userId = 'user-auto-check-01';

    // Chama getCurrentState e checkDeviceCapability
    PushActivationService.checkDeviceCapability(mockWin);
    await PushActivationService.getCurrentState(userId, undefined, mockWin);

    if (mockWin.getRequestPermissionCount() > 0) {
      throw new Error(`Permissão foi solicitada indevidamente ${mockWin.getRequestPermissionCount()} vez(es)`);
    }
  });

  // N1A2-02: clique em Ativar solicita permissão (Unitário com Mock)
  await record('N1A2-02', 'clique em Ativar solicita permissão explicitamente [Mock]', async () => {
    const mockWin = createMockBrowserWindow();
    const userId = 'user-click-activate-02';

    // Mock VAPID key para simular ambiente configurado
    const originalEnv = process.env.VITE_FIREBASE_VAPID_KEY;
    process.env.VITE_FIREBASE_VAPID_KEY = 'BEl6X-mock-vapid-key-test-12345';

    try {
      await PushActivationService.activatePushNotifications({
        userId,
        inMemoryStore: new Map(),
        mockWindow: mockWin,
        mockGetToken: async () => 'mock-fcm-token-123'
      });

      if (mockWin.getRequestPermissionCount() !== 1) {
        throw new Error(`Esperava 1 chamada a requestPermission, obtido: ${mockWin.getRequestPermissionCount()}`);
      }
    } finally {
      process.env.VITE_FIREBASE_VAPID_KEY = originalEnv;
    }
  });

  // N1A2-03: permission granted obtém token e registra PushDevice (Unitário com Mock)
  await record('N1A2-03', 'permission granted obtém token e registra PushDevice [Mock]', async () => {
    const mockWin = createMockBrowserWindow();
    const store = new Map<string, PushDevice>();
    const userId = 'user-granted-03';

    const originalEnv = process.env.VITE_FIREBASE_VAPID_KEY;
    process.env.VITE_FIREBASE_VAPID_KEY = 'BEl6X-mock-vapid-key-test-12345';

    try {
      let tokenRequested = false;
      const res = await PushActivationService.activatePushNotifications({
        userId,
        inMemoryStore: store,
        mockWindow: mockWin,
        mockGetToken: async (_, opts) => {
          tokenRequested = true;
          if (!opts.vapidKey) throw new Error('VAPID key ausente na chamada de getToken');
          return 'token-fcm-granted-987';
        }
      });

      if (!tokenRequested) throw new Error('getToken não foi executado após permissão concedida');
      if (res.state !== 'ACTIVE') throw new Error(`Estado esperado ACTIVE, obtido: ${res.state}`);
      if (!res.device) throw new Error('Dispositivo não foi retornado no registro');
      if (res.device.token !== 'token-fcm-granted-987') throw new Error('Token divergente do gerado');
      if (res.device.active !== true) throw new Error('Dispositivo deve estar ativo');
    } finally {
      process.env.VITE_FIREBASE_VAPID_KEY = originalEnv;
    }
  });

  // N1A2-04: permission denied não registra token (Unitário com Mock)
  await record('N1A2-04', 'permission denied não registra token nem consulta messaging [Mock]', async () => {
    const mockWin = createMockBrowserWindow();
    // Simula permissão negada pelo usuário
    mockWin.Notification.permission = 'denied';
    mockWin.Notification.requestPermission = async () => 'denied';

    const store = new Map<string, PushDevice>();
    const userId = 'user-denied-04';

    const originalEnv = process.env.VITE_FIREBASE_VAPID_KEY;
    process.env.VITE_FIREBASE_VAPID_KEY = 'BEl6X-mock-vapid-key-test-12345';

    try {
      let tokenRequested = false;
      const res = await PushActivationService.activatePushNotifications({
        userId,
        inMemoryStore: store,
        mockWindow: mockWin,
        mockGetToken: async () => {
          tokenRequested = true;
          return 'unexpected-token';
        }
      });

      if (tokenRequested) throw new Error('getToken NÃO deve ser chamado quando permissão é negada');
      if (res.state !== 'DENIED') throw new Error(`Estado esperado DENIED, obtido: ${res.state}`);
      if (store.size > 0) throw new Error('Nenhum dispositivo deve ser salvo no store em caso de recusa');
    } finally {
      process.env.VITE_FIREBASE_VAPID_KEY = originalEnv;
    }
  });

  // N1A2-05: VAPID ausente não quebra aplicação e não solicita permissão (Unitário com Mock)
  await record('N1A2-05', 'VAPID ausente não quebra aplicação e não solicita permissão [Mock]', async () => {
    const mockWin = createMockBrowserWindow();
    const store = new Map<string, PushDevice>();
    const userId = 'user-no-vapid-05';

    // Garante VAPID ausente
    const originalEnv = process.env.VITE_FIREBASE_VAPID_KEY;
    delete process.env.VITE_FIREBASE_VAPID_KEY;

    try {
      const capability = PushActivationService.checkDeviceCapability(mockWin);
      if (capability.isConfigured !== false) {
        throw new Error('isConfigured deve ser false quando VAPID está ausente');
      }

      const res = await PushActivationService.activatePushNotifications({
        userId,
        inMemoryStore: store,
        mockWindow: mockWin
      });

      if (res.state !== 'NOT_CONFIGURED') {
        throw new Error(`Estado esperado NOT_CONFIGURED, obtido: ${res.state}`);
      }

      if (mockWin.getRequestPermissionCount() > 0) {
        throw new Error('requestPermission não deve ser chamado quando VAPID está ausente');
      }
    } finally {
      if (originalEnv) process.env.VITE_FIREBASE_VAPID_KEY = originalEnv;
    }
  });

  // N1A2-06: navegador sem suporte recebe estado NOT_SUPPORTED (Unitário com Mock)
  await record('N1A2-06', 'navegador sem suporte recebe estado NOT_SUPPORTED [Mock]', async () => {
    // Janela sem Notification e sem PushManager
    const unsupportedWin = {
      navigator: { userAgent: 'LegacyBrowser/1.0' }
    };

    const capability = PushActivationService.checkDeviceCapability(unsupportedWin);
    if (capability.isSupported !== false) {
      throw new Error('Deveria identificar navegador sem suporte');
    }

    const state = await PushActivationService.getCurrentState('user-unsupported', undefined, unsupportedWin);
    if (state !== 'NOT_SUPPORTED') {
      throw new Error(`Estado esperado NOT_SUPPORTED, obtido: ${state}`);
    }
  });

  // N1A2-07: ativação repetida é idempotente (Unitário com Mock)
  await record('N1A2-07', 'ativação repetida é idempotente no mesmo dispositivo [Mock]', async () => {
    const mockWin = createMockBrowserWindow();
    const store = new Map<string, PushDevice>();
    const userId = 'user-idempotent-07';

    const originalEnv = process.env.VITE_FIREBASE_VAPID_KEY;
    process.env.VITE_FIREBASE_VAPID_KEY = 'BEl6X-mock-vapid-key-test-12345';

    try {
      // Primeira ativação
      const res1 = await PushActivationService.activatePushNotifications({
        userId,
        inMemoryStore: store,
        mockWindow: mockWin,
        mockGetToken: async () => 'token-fcm-same-01'
      });

      // Segunda ativação consecutiva (mesmo dispositivo e token)
      const res2 = await PushActivationService.activatePushNotifications({
        userId,
        inMemoryStore: store,
        mockWindow: mockWin,
        mockGetToken: async () => 'token-fcm-same-01'
      });

      if (res1.state !== 'ACTIVE' || res2.state !== 'ACTIVE') {
        throw new Error('Ambas as ativações devem resultar em estado ACTIVE');
      }

      if (store.size !== 1) {
        throw new Error(`Store deveria conter exatamente 1 registro, encontrado: ${store.size}`);
      }

      const dev = Array.from(store.values())[0];
      if (dev.active !== true) throw new Error('Dispositivo deve permanecer ativo');
    } finally {
      process.env.VITE_FIREBASE_VAPID_KEY = originalEnv;
    }
  });

  // N1A2-08: desativação afeta somente dispositivo atual (Unitário com Mock)
  await record('N1A2-08', 'desativação afeta somente o dispositivo atual [Mock]', async () => {
    const mockWin = createMockBrowserWindow();
    const store = new Map<string, PushDevice>();
    const userId = 'user-deactivate-08';

    // Simula dois dispositivos para o mesmo usuário
    const devCurrentId = 'dev-current-laptop';
    const devOtherPhoneId = 'dev-other-phone';

    store.set(`${userId}_${devCurrentId}`, {
      id: devCurrentId,
      userId,
      token: 'token-laptop-1',
      platform: 'WEB',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    });

    store.set(`${userId}_${devOtherPhoneId}`, {
      id: devOtherPhoneId,
      userId,
      token: 'token-phone-2',
      platform: 'WEB',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    });

    // Simula deviceId atual no localStorage
    mockWin.localStorage.setItem('casajunto_push_device_id', devCurrentId);

    // Desativa dispositivo atual
    const res = await PushActivationService.deactivatePushNotifications({
      userId,
      inMemoryStore: store,
      mockWindow: mockWin
    });

    if (res.state !== 'DEFAULT') {
      throw new Error(`Estado esperado DEFAULT após desativação, obtido: ${res.state}`);
    }

    const currentDev = store.get(`${userId}_${devCurrentId}`);
    const otherDev = store.get(`${userId}_${devOtherPhoneId}`);

    if (!currentDev || currentDev.active !== false) {
      throw new Error('Dispositivo atual deveria estar desativado (active: false)');
    }

    if (!otherDev || otherDev.active !== true) {
      throw new Error('Outro dispositivo do mesmo usuário NÃO deve ser alterado (deve permanecer active: true)');
    }
  });

  // N1A2-09: FCM token não aparece na UI/logs (Estático)
  await record('N1A2-09', 'FCM token não aparece na UI, strings de renderização ou logs [Estático]', () => {
    const filesToCheck = [
      'src/components/MemberProfile/PushNotificationSettings.tsx',
      'src/components/MemberProfile/MemberProfileModal.tsx'
    ];

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(relPath);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Verifica se há vazamento acidental de token para a interface
      if (content.includes('{device?.token}') || content.includes('{device.token}') || content.includes('{token}')) {
        throw new Error(`Violação: Possível exibição de token detectada no arquivo UI ${relPath}`);
      }

      if (content.includes('console.log(token)') || content.includes('console.log(fcmToken)')) {
        throw new Error(`Violação: Log de token encontrado em ${relPath}`);
      }
    }
  });

  // N1A2-10: iPhone/iPad em contexto incompatível recebe orientação para Tela de Início (Unitário com Mock)
  await record('N1A2-10', 'iPhone/iPad sem Tela de Início recebe orientação e não dispara permissão [Mock]', async () => {
    // Simula Safari no iPhone (não standalone)
    const mockIPhoneWin = createMockBrowserWindow({
      navigator: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        standalone: false,
        serviceWorker: {
          register: async () => ({ scope: '/' }),
          ready: Promise.resolve({ scope: '/' })
        }
      },
      matchMedia: () => ({ matches: false })
    });

    const capability = PushActivationService.checkDeviceCapability(mockIPhoneWin);

    if (capability.platform !== 'IOS' || capability.isIOS !== true) {
      throw new Error('Deveria identificar plataforma iOS');
    }

    if (capability.isStandalone !== false) {
      throw new Error('isStandalone deveria ser false no Safari padrão');
    }

    if (capability.canRequestPush !== false) {
      throw new Error('canRequestPush deve ser false quando iOS não está na Tela de Início');
    }

    if (!capability.guidanceMessage || !capability.guidanceMessage.includes('Tela de Início')) {
      throw new Error('Deveria orientar o usuário a adicionar o CasaJunto à Tela de Início');
    }

    // Tentar ativar não deve disparar requestPermission
    const res = await PushActivationService.activatePushNotifications({
      userId: 'user-ios-01',
      mockWindow: mockIPhoneWin
    });

    if (mockIPhoneWin.getRequestPermissionCount() > 0) {
      throw new Error('requestPermission NÃO pode ser chamado no iOS fora da Tela de Início');
    }

    if (!res.message || !res.message.includes('Tela de Início')) {
      throw new Error('Mensagem de retorno deve conter orientação da Tela de Início');
    }
  });

  // N1A2-11: Android/browser compatível segue fluxo normal (Unitário com Mock)
  await record('N1A2-11', 'Android em navegador compatível segue fluxo normal de ativação [Mock]', async () => {
    // Simula Chrome no Android
    const mockAndroidWin = createMockBrowserWindow({
      navigator: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        platform: 'Linux armv8l',
        serviceWorker: {
          register: async () => ({ scope: '/' }),
          ready: Promise.resolve({ scope: '/' })
        }
      }
    });

    const originalEnv = process.env.VITE_FIREBASE_VAPID_KEY;
    process.env.VITE_FIREBASE_VAPID_KEY = 'BEl6X-mock-vapid-key-test-12345';

    try {
      const capability = PushActivationService.checkDeviceCapability(mockAndroidWin);
      if (capability.platform !== 'ANDROID') {
        throw new Error(`Plataforma esperada ANDROID, obtido: ${capability.platform}`);
      }

      if (!capability.canRequestPush) {
        throw new Error('canRequestPush deveria ser true para Android compatível');
      }

      const res = await PushActivationService.activatePushNotifications({
        userId: 'user-android-01',
        inMemoryStore: new Map(),
        mockWindow: mockAndroidWin,
        mockGetToken: async () => 'android-fcm-token-555'
      });

      if (res.state !== 'ACTIVE') {
        throw new Error(`Estado esperado ACTIVE para Android, obtido: ${res.state}`);
      }
    } finally {
      process.env.VITE_FIREBASE_VAPID_KEY = originalEnv;
    }
  });

  // N1A2-12: Motor 2.0 permanece intocado (Estático)
  await record('N1A2-12', 'Motor 2.0 permanece estritamente puro e intocado [Estático]', () => {
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
      'PushActivationService',
      'PushNotificationSettings',
      'Notification',
      'PushManager',
      'VAPID',
      'firebase-messaging-sw',
      'firebase/messaging',
      'pushDevices'
    ];

    for (const relPath of motorFiles) {
      const fullPath = path.resolve(relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          throw new Error(`Violação: ${relPath} contém termo indevido de notificação: "${term}"`);
        }
      }
    }
  });

  return { passed, failed, results };
}
