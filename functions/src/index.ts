/**
 * CASA JUNTO — FIREBASE CLOUD FUNCTIONS ENTRYPOINT
 * Camada backend server-side (NOTIFICATIONS-1B.1 & 1B.2).
 *
 * PROIBIDO:
 * 1. Não criar endpoints HTTP públicos sem autenticação.
 * 2. Não expor rota para acionamento arbitrário de notificações de outros usuários.
 * 3. Operar exclusivamente no Firestore canônico ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { TaskReminderService } from './services/taskReminderService';

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

export {
  TaskReminderService,
  DEFAULT_FAMILY_TIMEZONE,
  REMINDER_LEAD_TIME_MS,
  MAX_REMINDER_ATTEMPTS,
  NotificationReminderDoc,
  ReminderCandidate,
  ReminderStatus,
  PersistedReminderStatus,
  EphemeralReminderStatus,
  ProcessRemindersResult,
  ProcessRemindersDetail
} from './services/taskReminderService';

/**
 * Cloud Function agendada (Scheduler v2).
 * Executa periodicamente a cada 5 minutos no fuso horário canônico America/Sao_Paulo.
 * Segurança: Não é um endpoint HTTP público; apenas o Cloud Scheduler do GCP pode acionar.
 */
export const processTaskReminders = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Sao_Paulo',
    region: 'us-central1'
  },
  async () => {
    try {
      const result = await TaskReminderService.processAllTaskReminders();
      console.log('[processTaskReminders] Concluído com sucesso:', {
        avaliados: result.candidatesEvaluated,
        reservados: result.remindersClaimed,
        enviados: result.remindersSent,
        falhas: result.remindersFailed,
        ignorados: result.remindersSkipped
      });
    } catch (err: any) {
      console.error('[processTaskReminders] Erro não tratado durante ciclo de lembretes:', err?.message || err);
    }
  }
);
