/**
 * CasaJunto - PushActivationService
 * Orquestrador isolado para verificação de permissão e ativação de Push Notifications (FCM).
 *
 * NOTIFICATIONS-1A.2:
 * 1. Suporte e capacidade do navegador (Android, iOS/iPadOS, Desktop).
 * 2. VAPID key via VITE_FIREBASE_VAPID_KEY sem hardcode.
 * 3. Service Worker /firebase-messaging-sw.js registrado explicitamente.
 * 4. Permissão solicitada estritamente após clique explícito do usuário.
 * 5. Registro idempotente via PushDeviceService vinculado ao Firebase Auth UID.
 * 6. Desativação suave (soft deactivation) por dispositivo.
 * 7. Limpeza e desvinculação no logout.
 */

import { getToken } from 'firebase/messaging';
import { getFirebaseMessaging, auth } from '../infrastructure/firebase/firebaseConfig';
import { PushDeviceService } from './pushDeviceService';
import { PushDevice } from '../types';

export type PushNotificationState =
  | 'NOT_SUPPORTED'
  | 'NOT_CONFIGURED'
  | 'DEFAULT'
  | 'REQUESTING'
  | 'ACTIVE'
  | 'DENIED'
  | 'ERROR';

export interface DeviceCapability {
  isSupported: boolean;
  isConfigured: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  canRequestPush: boolean;
  platform: 'WEB' | 'ANDROID' | 'IOS';
  guidanceMessage?: string;
}

export interface ActivatePushParams {
  userId: string;
  deviceId?: string;
  inMemoryStore?: Map<string, PushDevice>;
  // Opcionais para injeção de dependências e testes unitários
  mockWindow?: any;
  mockGetToken?: (messaging: any, options: { vapidKey: string; serviceWorkerRegistration: any }) => Promise<string>;
}

export interface DeactivatePushParams {
  userId: string;
  deviceId?: string;
  inMemoryStore?: Map<string, PushDevice>;
  mockWindow?: any;
}

export interface HandleLogoutParams {
  userId?: string | null;
  deviceId?: string;
  inMemoryStore?: Map<string, PushDevice>;
  mockWindow?: any;
}

export class PushActivationService {
  private static readonly LOCAL_ACTIVE_KEY = 'casajunto_push_active_state';

  /**
   * Obtém a chave pública VAPID exclusivamente a partir da variável de ambiente VITE_FIREBASE_VAPID_KEY.
   * Não realiza hardcode de chaves.
   */
  public static getVapidKey(): string {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_FIREBASE_VAPID_KEY) {
      return (import.meta as any).env.VITE_FIREBASE_VAPID_KEY;
    }
    if (typeof process !== 'undefined' && process.env && process.env.VITE_FIREBASE_VAPID_KEY) {
      return process.env.VITE_FIREBASE_VAPID_KEY as string;
    }
    return '';
  }

  /**
   * Analisa a capacidade do dispositivo e ambiente atual para Push Notifications.
   * Trata diferenças de Android, Desktop e iPhone/iPadOS sem fingir suporte.
   */
  public static checkDeviceCapability(mockWindow?: any): DeviceCapability {
    const win = mockWindow || (typeof window !== 'undefined' ? window : null);
    if (!win) {
      return {
        isSupported: false,
        isConfigured: false,
        isIOS: false,
        isStandalone: false,
        canRequestPush: false,
        platform: 'WEB',
        guidanceMessage: 'Ambiente sem interface gráfica (SSR/Node).'
      };
    }

    const nav = win.navigator || {};
    const userAgent = nav.userAgent || '';
    const platformStr = nav.platform || '';

    // Detecção precisa de iOS / iPadOS
    const isIOS =
      /iPad|iPhone|iPod/.test(userAgent) ||
      (platformStr === 'MacIntel' && typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 1);

    // Detecção de modo tela de início (Standalone PWA no iOS)
    const isStandalone = Boolean(
      ('standalone' in nav && (nav as any).standalone) ||
      (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches)
    );

    const isAndroid = /Android/.test(userAgent);
    const resolvedPlatform: 'WEB' | 'ANDROID' | 'IOS' = isIOS ? 'IOS' : isAndroid ? 'ANDROID' : 'WEB';

    // Suporte às APIs do navegador
    const hasNotification = 'Notification' in win;
    const hasServiceWorker = 'serviceWorker' in nav;
    const hasPushManager = 'PushManager' in win;

    const isApiSupported = Boolean(hasNotification && hasServiceWorker && hasPushManager);
    const vapidKey = this.getVapidKey();
    const isConfigured = Boolean(vapidKey && vapidKey.trim().length > 0);

    // Regra específica para iPhone / iPad:
    // No iOS, Web Push só é entregue quando o web app foi adicionado à Tela de Início
    if (isIOS && !isStandalone) {
      return {
        isSupported: true,
        isConfigured,
        isIOS: true,
        isStandalone: false,
        canRequestPush: false,
        platform: 'IOS',
        guidanceMessage: 'Para receber notificações no iPhone ou iPad, adicione o CasaJunto à Tela de Início e abra o aplicativo por lá.'
      };
    }

    const isSupported = isApiSupported;
    const canRequestPush = isSupported && isConfigured && (!isIOS || isStandalone);

    return {
      isSupported,
      isConfigured,
      isIOS,
      isStandalone,
      canRequestPush,
      platform: resolvedPlatform,
      guidanceMessage: !isSupported
        ? 'Este navegador não oferece suporte a notificações push.'
        : !isConfigured
        ? 'Notificações push ainda não estão configuradas neste ambiente (chave VAPID ausente).'
        : undefined
    };
  }

  /**
   * Obtém o estado atual de notificações para o usuário no dispositivo atual.
   * Não dispara nenhum pedido de permissão ao sistema.
   */
  public static async getCurrentState(
    userId: string,
    inMemoryStore?: Map<string, PushDevice>,
    mockWindow?: any
  ): Promise<PushNotificationState> {
    const capability = this.checkDeviceCapability(mockWindow);

    if (!capability.isSupported) {
      return 'NOT_SUPPORTED';
    }

    if (!capability.isConfigured) {
      return 'NOT_CONFIGURED';
    }

    if (capability.isIOS && !capability.isStandalone) {
      // No iOS fora da tela de início, não finge suporte
      return 'DEFAULT';
    }

    const win = mockWindow || (typeof window !== 'undefined' ? window : null);
    if (!win || !('Notification' in win)) {
      return 'NOT_SUPPORTED';
    }

    const permission = win.Notification.permission;
    if (permission === 'denied') {
      return 'DENIED';
    }

    if (permission === 'granted') {
      // Verifica se o dispositivo está com registro ativo
      const deviceId = PushDeviceService.getOrCreateDeviceId();
      let isActiveLocally = false;
      try {
        if (win.localStorage) {
          isActiveLocally = win.localStorage.getItem(this.LOCAL_ACTIVE_KEY) === 'true';
        }
      } catch {
        // Ignora erro de storage restrito
      }

      if (inMemoryStore) {
        const stored = inMemoryStore.get(`${userId}_${deviceId}`);
        if (stored && stored.active) return 'ACTIVE';
        if (stored && !stored.active) return 'DEFAULT';
      }

      if (isActiveLocally) {
        return 'ACTIVE';
      }

      return 'DEFAULT';
    }

    return 'DEFAULT';
  }

  /**
   * Executa a ativação de notificações push SOMENTE após clique explícito do usuário.
   * 1. Valida suporte e configuração VAPID.
   * 2. Solicita Notification.requestPermission().
   * 3. Registra /firebase-messaging-sw.js.
   * 4. Obtém token FCM via getToken().
   * 5. Registra dispositivo via PushDeviceService.registerDevice().
   */
  public static async activatePushNotifications(
    params: ActivatePushParams
  ): Promise<{ state: PushNotificationState; device?: PushDevice; message?: string }> {
    const { userId, inMemoryStore, mockWindow, mockGetToken } = params;

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('Identificador de usuário (Auth UID) é obrigatório para ativar notificações.');
    }

    const capability = this.checkDeviceCapability(mockWindow);

    if (!capability.isSupported) {
      return {
        state: 'NOT_SUPPORTED',
        message: 'Este navegador não oferece suporte a notificações push.'
      };
    }

    if (!capability.isConfigured) {
      return {
        state: 'NOT_CONFIGURED',
        message: 'As notificações push ainda não estão configuradas neste ambiente (chave VAPID ausente).'
      };
    }

    // iPhone / iPad em contexto de aba comum não deve solicitar permissão
    if (capability.isIOS && !capability.isStandalone) {
      return {
        state: 'DEFAULT',
        message: 'Para receber notificações no iPhone ou iPad, adicione o CasaJunto à Tela de Início e abra o aplicativo por lá.'
      };
    }

    const win = mockWindow || (typeof window !== 'undefined' ? window : null);
    if (!win || !('Notification' in win)) {
      return {
        state: 'NOT_SUPPORTED',
        message: 'Este navegador não oferece suporte a notificações push.'
      };
    }

    // Solicitar permissão SOMENTE sob ação explícita
    let permissionResult: NotificationPermission;
    try {
      permissionResult = await win.Notification.requestPermission();
    } catch {
      permissionResult = 'denied';
    }

    if (permissionResult === 'denied') {
      return {
        state: 'DENIED',
        message: 'A permissão para notificações foi bloqueada no navegador. Reative-a nas configurações para receber lembretes.'
      };
    }

    if (permissionResult !== 'granted') {
      return {
        state: 'DEFAULT',
        message: 'Permissão não concedida.'
      };
    }

    // Registrar o service worker existente explicitamente
    let swRegistration: any = null;
    if (win.navigator && win.navigator.serviceWorker) {
      try {
        swRegistration = await win.navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/'
        });
        if (win.navigator.serviceWorker.ready) {
          await win.navigator.serviceWorker.ready;
        }
      } catch (swErr) {
        // Em testes de unidade, swRegistration pode ser simulado
        if (!mockGetToken) {
          return {
            state: 'ERROR',
            message: 'Não foi possível registrar o serviço de segundo plano para notificações.'
          };
        }
      }
    }

    const vapidKey = this.getVapidKey();

    // Obter Token FCM
    let fcmToken = '';
    try {
      if (mockGetToken) {
        fcmToken = await mockGetToken(null, {
          vapidKey,
          serviceWorkerRegistration: swRegistration
        });
      } else {
        const messaging = await getFirebaseMessaging();
        if (!messaging) {
          return {
            state: 'ERROR',
            message: 'Serviço de mensagens Firebase indisponível neste navegador.'
          };
        }
        fcmToken = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swRegistration
        });
      }
    } catch (err: any) {
      return {
        state: 'ERROR',
        message: 'Não foi possível obter a credencial de notificação do dispositivo. Tente novamente.'
      };
    }

    if (!fcmToken || fcmToken.trim().length === 0) {
      return {
        state: 'ERROR',
        message: 'Token de dispositivo inválido retornado pelo serviço de mensagens.'
      };
    }

    // Resolver deviceId a partir de parâmetros, storage local ou gerador canônico
    let resolvedDeviceId = params.deviceId;
    if (!resolvedDeviceId && win && win.localStorage) {
      try {
        const stored = win.localStorage.getItem('casajunto_push_device_id');
        if (stored) resolvedDeviceId = stored;
      } catch {
        // Ignora erro de storage
      }
    }

    // Registrar através do PushDeviceService existente
    const device = await PushDeviceService.registerDevice({
      userId,
      token: fcmToken,
      deviceId: resolvedDeviceId,
      platform: 'WEB',
      inMemoryStore
    });

    try {
      if (win.localStorage) {
        win.localStorage.setItem('casajunto_push_device_id', device.id);
        win.localStorage.setItem(this.LOCAL_ACTIVE_KEY, 'true');
      }
    } catch {
      // Ignora restrição de storage
    }

    return {
      state: 'ACTIVE',
      device,
      message: 'Notificações ativadas neste dispositivo'
    };
  }

  /**
   * Desativa notificações neste dispositivo (soft deactivation com active=false).
   * Não afeta outros dispositivos do mesmo usuário e não realiza hard delete.
   */
  public static async deactivatePushNotifications(
    params: DeactivatePushParams
  ): Promise<{ state: PushNotificationState; message?: string }> {
    const { userId, inMemoryStore, mockWindow } = params;

    const win = mockWindow || (typeof window !== 'undefined' ? window : null);
    let resolvedDeviceId = params.deviceId;
    if (!resolvedDeviceId && win && win.localStorage) {
      try {
        const stored = win.localStorage.getItem('casajunto_push_device_id');
        if (stored) resolvedDeviceId = stored;
      } catch {
        // Ignora erro de storage
      }
    }

    const deviceId = resolvedDeviceId || PushDeviceService.getOrCreateDeviceId();

    await PushDeviceService.deactivateDevice(userId, deviceId, inMemoryStore);

    try {
      if (win && win.localStorage) {
        win.localStorage.setItem(this.LOCAL_ACTIVE_KEY, 'false');
      }
    } catch {
      // Ignora restrição de storage
    }

    return {
      state: 'DEFAULT',
      message: 'Notificações desativadas para este dispositivo.'
    };
  }

  /**
   * NOTIFICATIONS-1A.2-HF1: SAFE PUSH LOGOUT
   * Antes do Firebase Auth signOut:
   * 1. Identificar Firebase Auth UID atual;
   * 2. Identificar deviceId atual;
   * 3. Executar soft deactivation no PushDeviceService: active = false;
   * 4. Somente depois limpar o estado local;
   * 5. Falhas de rede ou indisponibilidade remota NÃO bloqueiam o logout.
   */
  public static async handleLogout(
    paramsOrUserId?: HandleLogoutParams | string | null,
    inMemoryStore?: Map<string, PushDevice>,
    mockWindow?: any
  ): Promise<void> {
    let userId: string | null | undefined;
    let explicitDeviceId: string | undefined;
    let store = inMemoryStore;
    let win = mockWindow;

    if (paramsOrUserId && typeof paramsOrUserId === 'object') {
      userId = paramsOrUserId.userId;
      explicitDeviceId = paramsOrUserId.deviceId;
      if (paramsOrUserId.inMemoryStore) store = paramsOrUserId.inMemoryStore;
      if (paramsOrUserId.mockWindow) win = paramsOrUserId.mockWindow;
    } else if (typeof paramsOrUserId === 'string') {
      userId = paramsOrUserId;
    } else {
      userId = null;
    }

    win = win || (typeof window !== 'undefined' ? window : null);

    // 1. Identificar Firebase Auth UID atual caso não tenha sido explicitamente fornecido
    if (!userId) {
      try {
        if (auth && auth.currentUser) {
          userId = auth.currentUser.uid;
        }
      } catch {
        // Ignora erro ao inspecionar auth
      }
    }

    // 2. Identificar deviceId atual antes de limpar o storage
    let deviceId = explicitDeviceId;
    if (!deviceId && win && win.localStorage) {
      try {
        const stored = win.localStorage.getItem('casajunto_push_device_id');
        if (stored) deviceId = stored;
      } catch {
        // Ignora erro de acesso a storage
      }
    }

    // 3. Tentar soft deactivation no PushDeviceService: active=false
    try {
      if (userId && deviceId) {
        await PushDeviceService.deactivateDevice(userId, deviceId, store);
      }
    } catch (remoteErr) {
      // Falha de rede na desativação NÃO impede o usuário de sair da conta
      console.warn('Falha na desativação remota do pushDevice no logout:', remoteErr);
    } finally {
      // 4. Somente depois limpar vínculo push local
      try {
        if (win && win.localStorage) {
          win.localStorage.removeItem('casajunto_push_device_id');
          win.localStorage.removeItem(this.LOCAL_ACTIVE_KEY);
        }
      } catch {
        // Ignora restrição de storage
      }
    }
  }
}
