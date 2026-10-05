/**
 * CASA JUNTO — FIREBASE CLOUD FUNCTIONS ENTRYPOINT
 * Camada backend server-side (NOTIFICATIONS-1B.1).
 *
 * PROIBIDO:
 * 1. Não criar endpoints HTTP públicos sem autenticação.
 * 2. Não expor rota para acionamento arbitrário de notificações de outros usuários.
 * 3. Operar exclusivamente no Firestore canônico ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c.
 */

export {
  CASAJUNTO_FIRESTORE_DATABASE_ID,
  getAdminApp,
  getAdminFirestore,
  getAdminMessaging
} from './firebaseAdmin';

export {
  PushDeliveryService,
  PushNotificationPayload,
  PushDeliveryResult,
  PushDeliveryDeviceDetail,
  DeliveryStatus,
  DEFINITIVE_INVALID_TOKEN_ERROR_CODES,
  TEMPORARY_ERROR_CODES
} from './services/pushDeliveryService';
