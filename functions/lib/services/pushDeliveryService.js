"use strict";
/**
 * CASA JUNTO — PUSH DELIVERY SERVICE (BACKEND / FIREBASE ADMIN)
 * Serviço server-side responsável pela entrega de notificações FCM
 * para os dispositivos ativos do usuário.
 *
 * REGRAS CRÍTICAS:
 * 1. Opera exclusivamente no banco Firestore nomeado CASAJUNTO_FIRESTORE_DATABASE_ID.
 * 2. Consulta apenas dispositivos com active == true.
 * 3. Suporta múltiplos dispositivos para o mesmo usuário.
 * 4. Tokens definitivamente inválidos sofrem SOFT DEACTIVATION (active=false, NUNCA delete).
 * 5. Erros temporários NÃO desativam o dispositivo.
 * 6. Nenhum token FCM completo é escrito em logs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushDeliveryService = exports.TEMPORARY_ERROR_CODES = exports.DEFINITIVE_INVALID_TOKEN_ERROR_CODES = void 0;
const firebaseAdmin_1 = require("../firebaseAdmin");
/**
 * Códigos de erro do Firebase Admin / FCM considerados definitivamente inválidos.
 * Tokens com estes erros indicam que o app foi desinstalado ou o token expirou.
 */
exports.DEFINITIVE_INVALID_TOKEN_ERROR_CODES = [
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'messaging/invalid-argument',
    'UNREGISTERED',
    'INVALID_ARGUMENT'
];
/**
 * Códigos de erro temporários conhecidos que NÃO devem desativar o dispositivo.
 */
exports.TEMPORARY_ERROR_CODES = [
    'messaging/server-unavailable',
    'messaging/internal-error',
    'messaging/device-message-rate-exceeded',
    'messaging/quota-exceeded',
    'UNAVAILABLE',
    'RESOURCE_EXHAUSTED',
    'DEADLINE_EXCEEDED'
];
class PushDeliveryService {
    /**
     * Mascara um token FCM para auditoria e logs seguros.
     * Exemplo: 'fcm-abc123456789xyz' -> 'fcm-...9xyz'
     * Garante que nenhum token completo seja exposto em logs.
     */
    static maskToken(token) {
        if (!token || typeof token !== 'string')
            return '[empty-token]';
        const trimmed = token.trim();
        if (trimmed.length <= 8)
            return '***';
        return `${trimmed.substring(0, 4)}...${trimmed.slice(-4)}`;
    }
    /**
     * Avalia se um erro retornado pelo FCM indica token definitivamente inválido.
     */
    static isDefinitiveInvalidToken(errorCode, errorMessage) {
        if (errorCode) {
            if (exports.DEFINITIVE_INVALID_TOKEN_ERROR_CODES.some(c => c.toLowerCase() === errorCode.toLowerCase())) {
                return true;
            }
        }
        if (errorMessage) {
            const msg = errorMessage.toLowerCase();
            if (msg.includes('not registered') ||
                msg.includes('registration-token-not-registered') ||
                msg.includes('invalid registration token') ||
                msg.includes('token is no longer valid')) {
                return true;
            }
        }
        return false;
    }
    /**
     * Envia uma notificação push para todos os dispositivos ativos do usuário.
     */
    static async sendPushToUser(params) {
        const { userId, payload } = params;
        if (!userId || typeof userId !== 'string' || userId.trim() === '') {
            throw new Error('userId é obrigatório para envio de notificação push.');
        }
        if (!payload || !payload.title || !payload.body) {
            throw new Error('Payload com title e body válidos é obrigatório.');
        }
        const db = params.firestoreDb || (0, firebaseAdmin_1.getAdminFirestore)(firebaseAdmin_1.CASAJUNTO_FIRESTORE_DATABASE_ID);
        const messaging = params.messaging || (0, firebaseAdmin_1.getAdminMessaging)();
        // 1. Localizar subcoleção /users/{userId}/pushDevices buscando apenas active == true
        const devicesRef = db.collection('users').doc(userId).collection('pushDevices');
        const snapshot = await devicesRef.where('active', '==', true).get();
        const devicesFound = snapshot.size;
        const result = {
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
            const maskedToken = this.maskToken(token);
            try {
                // Envio via Firebase Admin Messaging
                await messaging.send({
                    token,
                    notification: {
                        title: payload.title,
                        body: payload.body
                    },
                    data: payload.data || {}
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
                }
                catch {
                    // Ignora falha secundária de atualização de timestamp
                }
            }
            catch (fcmErr) {
                const errorCode = fcmErr?.code || fcmErr?.errorInfo?.code || 'UNKNOWN_ERROR';
                const errorMessage = fcmErr?.message || String(fcmErr);
                if (this.isDefinitiveInvalidToken(errorCode, errorMessage)) {
                    // Token definitivamente inválido: SOFT DEACTIVATION (active = false)
                    // NUNCA hard delete
                    result.invalidTokensCount++;
                    result.details.push({
                        deviceId,
                        status: 'INVALID_TOKEN',
                        errorCode,
                        errorMessage
                    });
                    try {
                        await docSnap.ref.update({
                            active: false,
                            updatedAt: new Date().toISOString(),
                            invalidTokenReason: errorCode
                        });
                    }
                    catch (deactivateErr) {
                        console.warn(`[PushDelivery] Falha ao desativar dispositivo ${deviceId}:`, deactivateErr);
                    }
                }
                else {
                    // Erro temporário (rede, quota, servidor indisponível): NÃO desativa
                    result.failureCount++;
                    result.details.push({
                        deviceId,
                        status: 'FAILED',
                        errorCode,
                        errorMessage
                    });
                }
            }
        }
        return result;
    }
}
exports.PushDeliveryService = PushDeliveryService;
//# sourceMappingURL=pushDeliveryService.js.map