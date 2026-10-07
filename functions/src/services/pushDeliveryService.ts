/**
 * CASA JUNTO — PUSH DELIVERY SERVICE (BACKEND / FIREBASE ADMIN)
 * Serviço server-side responsável pela entrega de notificações FCM
 * para os dispositivos ativos do usuário.
 *
 * REGRAS CRÍTICAS (1B.1-HF1):
 * 1. Opera exclusivamente no banco Firestore nomeado CASAJUNTO_FIRESTORE_DATABASE_ID.
 * 2. Consulta apenas dispositivos com active == true.
 * 3. Suporta múltiplos dispositivos para o mesmo usuário.
 * 4. Tokens definitivamente inválidos sofrem SOFT DEACTIVATION (active=false, NUNCA delete).
 * 5. INVALID_ARGUMENT e messaging/invalid-argument NÃO desativam sozinhos (exigem evidência inequívoca de token inválido).
 * 6. Erros temporários, payload inválido e erros desconhecidos NÃO desativam o dispositivo (active permanece true).
 * 7. Nenhum token FCM completo é escrito em logs ou retornado em mensagens de erro (sanitização estrita).
 */

import { getAdminFirestore, getAdminMessaging, CASAJUNTO_FIRESTORE_DATABASE_ID } from '../firebaseAdmin';

/**
 * Contrato de payload de notificação independente (desacoplado de TaskAssignment).
 */
export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export type DeliveryStatus = 'SUCCESS' | 'FAILED' | 'INVALID_TOKEN' | 'SKIPPED_INACTIVE';

export interface PushDeliveryDeviceDetail {
  deviceId: string;
  status: DeliveryStatus;
  errorCode?: string;
  errorMessage?: string;
}

export interface PushDeliveryResult {
  userId: string;
  devicesFound: number;
  deliveriesAttempted: number;
  successCount: number;
  failureCount: number;
  invalidTokensCount: number;
  details: PushDeliveryDeviceDetail[];
}

/**
 * Códigos de erro do Firebase Admin / FCM considerados incondicionalmente
 * como token definitivamente inválido (app desinstalado ou token revogado).
 */
export const UNCONDITIONAL_INVALID_TOKEN_ERROR_CODES = [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'UNREGISTERED'
] as const;

/**
 * Alias de compatibilidade com versões anteriores.
 */
export const DEFINITIVE_INVALID_TOKEN_ERROR_CODES = UNCONDITIONAL_INVALID_TOKEN_ERROR_CODES;

/**
 * Códigos de erro que podem indicar erro de payload OU de token.
 * NUNCA desativam sozinhos — requerem evidência inequívoca no corpo do erro.
 */
export const CONDITIONAL_ARGUMENT_ERROR_CODES = [
  'messaging/invalid-argument',
  'INVALID_ARGUMENT'
] as const;

/**
 * Códigos de erro temporários conhecidos que NÃO devem desativar o dispositivo.
 */
export const TEMPORARY_ERROR_CODES = [
  'messaging/server-unavailable',
  'messaging/internal-error',
  'messaging/device-message-rate-exceeded',
  'messaging/quota-exceeded',
  'UNAVAILABLE',
  'RESOURCE_EXHAUSTED',
  'DEADLINE_EXCEEDED'
] as const;

export interface SendPushParams {
  userId: string;
  payload: PushNotificationPayload;
  // Injeção de dependências para testes e mocks
  firestoreDb?: any;
  messaging?: any;
}

export class PushDeliveryService {
  /**
   * Mascara um token FCM para auditoria e logs seguros.
   * Exemplo: 'fcm-abc123456789xyz' -> 'fcm-...9xyz'
   * Garante que nenhum token completo seja exposto em logs.
   */
  public static maskToken(token: string): string {
    if (!token || typeof token !== 'string') return '[empty-token]';
    const trimmed = token.trim();
    if (trimmed.length <= 8) return '***';
    return `${trimmed.substring(0, 4)}...${trimmed.slice(-4)}`;
  }

  /**
   * Sanitiza a mensagem de erro retornada pelo FCM ou SDK,
   * removendo ou mascarando qualquer token FCM presente no texto.
   * Impede vazamento de tokens brutos em result.details, logs ou banco de dados.
   */
  public static sanitizeErrorMessage(rawMessage: string, token?: string): string {
    if (!rawMessage || typeof rawMessage !== 'string') return '';
    let sanitized = rawMessage;

    // 1. Substitui ocorrências do token fornecido
    if (token && token.trim().length > 0) {
      sanitized = sanitized.split(token).join(this.maskToken(token));
    }

    // 2. Remove/mascara tokens longos entre aspas ou delimitadores no texto
    sanitized = sanitized.replace(/['"]([A-Za-z0-9_\-:]{20,})['"]/g, (_match, p1) => {
      return `"${this.maskToken(p1)}"`;
    });

    return sanitized;
  }

  /**
   * Avalia se a mensagem de erro contém evidência inequívoca
   * de que o registration token é estritamente o argumento inválido.
   */
  public static hasUnambiguousTokenInvalidEvidence(errorMessage: string): boolean {
    if (!errorMessage || typeof errorMessage !== 'string') return false;
    const msg = errorMessage.toLowerCase();

    const tokenKeywords = [
      'registration token',
      'registration-token',
      'fcm registration token',
      'fcm token',
      'device token'
    ];

    const invalidKeywords = [
      'not a valid',
      'is not valid',
      'not valid',
      'invalid',
      'not registered',
      'unregistered',
      'malformed'
    ];

    const mentionsToken = tokenKeywords.some(tk => msg.includes(tk));
    const mentionsInvalid = invalidKeywords.some(ik => msg.includes(ik));

    return mentionsToken && mentionsInvalid;
  }

  /**
   * Avalia se um erro retornado pelo FCM indica token definitivamente inválido.
   * REGRA CRÍTICA (1B.1-HF1):
   * 1. Códigos incondicionais (UNREGISTERED, registration-token-not-registered, invalid-registration-token) -> true.
   * 2. INVALID_ARGUMENT e messaging/invalid-argument sozinhos -> FALSE (podem ser erro de payload).
   * 3. INVALID_ARGUMENT apenas vira true se houver evidência inequívoca no erro de que o token é inválido.
   * 4. Na dúvida: false (não desativa).
   */
  public static isDefinitiveInvalidToken(errorCode?: string, errorMessage?: string): boolean {
    const code = (errorCode || '').trim();
    const msg = (errorMessage || '').trim();

    // 1. Incondicionalmente inválido
    if (code) {
      if (UNCONDITIONAL_INVALID_TOKEN_ERROR_CODES.some(c => c.toLowerCase() === code.toLowerCase())) {
        return true;
      }
    }

    // Se o código for explicitamente de argumento condicional
    const isConditionalCode = CONDITIONAL_ARGUMENT_ERROR_CODES.some(c => c.toLowerCase() === code.toLowerCase());

    if (isConditionalCode) {
      // Requer evidência inequívoca no texto
      return this.hasUnambiguousTokenInvalidEvidence(msg);
    }

    // Se a mensagem contiver menção explícita de registration token not registered
    const lowerMsg = msg.toLowerCase();
    if (
      lowerMsg.includes('registration-token-not-registered') ||
      lowerMsg.includes('requested entity was not found') ||
      (lowerMsg.includes('registration token') && lowerMsg.includes('not registered'))
    ) {
      return true;
    }

    // Na dúvida: NÃO desativa
    return false;
  }

  /**
   * Envia uma notificação push para todos os dispositivos ativos do usuário.
   */
  public static async sendPushToUser(params: SendPushParams): Promise<PushDeliveryResult> {
    const { userId, payload } = params;

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('userId é obrigatório para envio de notificação push.');
    }

    if (!payload || !payload.title || !payload.body) {
      throw new Error('Payload com title e body válidos é obrigatório.');
    }

    const db = params.firestoreDb || getAdminFirestore(CASAJUNTO_FIRESTORE_DATABASE_ID);
    const messaging = params.messaging || getAdminMessaging();

    // 1. Localizar subcoleção /users/{userId}/pushDevices buscando apenas active == true
    const devicesRef = db.collection('users').doc(userId).collection('pushDevices');
    const snapshot = await devicesRef.where('active', '==', true).get();

    const devicesFound = snapshot.size;

    const result: PushDeliveryResult = {
      userId,
      devicesFound,
      deliveriesAttempted: 0,
      successCount: 0,
      failureCount: 0,
      invalidTokensCount: 0,
      details: []
    };

    if (devicesFound === 0) {
      return result;
    }

    // 2. Iterar sobre todos os dispositivos ativos candidatos
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const deviceId = docSnap.id;
      const token = data.token;

      // Proteção adicional: se o campo active estiver falso no documento, pula
      if (data.active !== true) {
        result.details.push({
          deviceId,
          status: 'SKIPPED_INACTIVE'
        });
        continue;
      }

      if (!token || typeof token !== 'string' || token.trim() === '') {
        // Token vazio em dispositivo ativo: desativação preventiva
        const nowIso = new Date().toISOString();
        await docSnap.ref.update({
          active: false,
          updatedAt: nowIso,
          deactivationReason: 'EMPTY_TOKEN'
        });
        result.invalidTokensCount++;
        result.details.push({
          deviceId,
          status: 'INVALID_TOKEN',
          errorCode: 'EMPTY_TOKEN',
          errorMessage: 'Token ausente ou vazio no documento de dispositivo'
        });
        continue;
      }

      result.deliveriesAttempted++;

      try {
        // Envio via Firebase Admin Messaging com DATA-ONLY payload
        // para evitar que o SDK Android/iOS gere notificação visual automática
        // duplicando a exibição do Service Worker (onBackgroundMessage).
        const fcmData: Record<string, string> = {
          ...(payload.data || {}),
          title: payload.title,
          body: payload.body
        };

        await messaging.send({
          token,
          data: fcmData
        });

        // Sucesso na entrega
        result.successCount++;
        result.details.push({
          deviceId,
          status: 'SUCCESS'
        });

        // Atualização de lastSeenAt (opcional/não-bloqueante)
        try {
          await docSnap.ref.update({
            lastSeenAt: new Date().toISOString()
          });
        } catch {
          // Ignora falha secundária de atualização de timestamp
        }
      } catch (fcmErr: any) {
        const errorCode = fcmErr?.code || fcmErr?.errorInfo?.code || 'UNKNOWN_ERROR';
        const rawErrorMessage = fcmErr?.message || String(fcmErr);
        const sanitizedError = this.sanitizeErrorMessage(rawErrorMessage, token);

        if (this.isDefinitiveInvalidToken(errorCode, rawErrorMessage)) {
          // Token definitivamente inválido: SOFT DEACTIVATION (active = false)
          // NUNCA hard delete
          result.invalidTokensCount++;
          result.details.push({
            deviceId,
            status: 'INVALID_TOKEN',
            errorCode,
            errorMessage: sanitizedError
          });

          try {
            await docSnap.ref.update({
              active: false,
              updatedAt: new Date().toISOString(),
              invalidTokenReason: errorCode
            });
          } catch (deactivateErr) {
            console.warn(`[PushDelivery] Falha ao desativar dispositivo ${deviceId}:`, deactivateErr);
          }
        } else {
          // Erro temporário, payload inválido ou desconhecido: NÃO desativa
          result.failureCount++;
          result.details.push({
            deviceId,
            status: 'FAILED',
            errorCode,
            errorMessage: sanitizedError
          });
        }
      }
    }

    return result;
  }
}
