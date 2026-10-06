/**
 * CASA JUNTO — TASK REMINDER SERVICE (BACKEND / FIREBASE ADMIN)
 * Responsável por:
 * 1. Identificar ocorrências de tarefas que precisam de lembrete (15 min antes).
 * 2. Validar elegibilidade e executionTarget (HOUSEHOLD / FLEXIBLE / EXTERNAL_SUPPORT).
 * 3. Resolver destinatário (assignment -> member -> Firebase UID).
 * 4. Respeitar o horário local/timezone da família (padrão: America/Sao_Paulo).
 * 5. Garantir idempotência e claim atômico via Firestore (/notificationReminders/{idempotencyKey}).
 * 6. Invocar o PushDeliveryService existente com payload seguro e desacoplado.
 * 7. Política estrita de tenant isolation por familyId.
 *
 * PROIBIDO:
 * - Alterar Motor 2.0.
 * - Enviar push para tarefas EXTERNAL_SUPPORT, canceladas ou concluídas.
 * - Usar banco (default) — usar exclusivamente CASAJUNTO_FIRESTORE_DATABASE_ID.
 * - Expor credenciais ou tokens FCM em logs.
 */

import { getAdminFirestore, CASAJUNTO_FIRESTORE_DATABASE_ID } from '../firebaseAdmin';
import { PushDeliveryService, PushNotificationPayload } from './pushDeliveryService';

export const DEFAULT_FAMILY_TIMEZONE = 'America/Sao_Paulo';
export const REMINDER_LEAD_TIME_MS = 15 * 60 * 1000; // 15 minutos
export const MAX_REMINDER_ATTEMPTS = 3;
export const LEASE_DURATION_MS = 5 * 60 * 1000; // 5 minutos de trava de claim
export const SCHEDULER_WINDOW_BEFORE_MS = 10 * 60 * 1000; // tolera até 10 min de atraso no scheduler
export const SCHEDULER_WINDOW_AFTER_MS = 5 * 60 * 1000; // lookahead de até 5 min para a próxima janela

export type ReminderStatus =
  | 'CLAIMED'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED_NO_ACTIVE_DEVICE'
  | 'SKIPPED_NO_LINKED_USER'
  | 'SKIPPED_EXTERNAL_SUPPORT'
  | 'SKIPPED_UNASSIGNED'
  | 'SKIPPED_ALREADY_COMPLETED'
  | 'SKIPPED_OUT_OF_WINDOW';

export interface NotificationReminderDoc {
  id: string; // e.g. TASK_REMINDER_15M:${familyId}:${assignmentId}
  familyId: string;
  assignmentId: string;
  userId?: string;
  type: 'TASK_REMINDER_15M';
  status: ReminderStatus;
  scheduledAt: string; // ISO
  reminderAt: string; // ISO
  claimedAt: string; // ISO
  sentAt?: string; // ISO
  updatedAt: string; // ISO
  attemptCount: number;
  lastError?: string;
}

export interface ReminderCandidate {
  familyId: string;
  assignmentId: string;
  familyTaskId?: string;
  taskName: string;
  scheduledDate: string;
  scheduledStart: string;
  scheduledAt: Date;
  reminderAt: Date;
  assignedMemberId: string;
  userId: string;
  executionTarget: 'HOUSEHOLD' | 'FLEXIBLE';
}

export interface ProcessRemindersDetail {
  idempotencyKey: string;
  familyId: string;
  assignmentId: string;
  status: ReminderStatus;
  reason?: string;
}

export interface ProcessRemindersResult {
  candidatesEvaluated: number;
  remindersClaimed: number;
  remindersSent: number;
  remindersFailed: number;
  remindersSkipped: number;
  details: ProcessRemindersDetail[];
}

export interface ProcessTaskRemindersParams {
  firestoreDb?: any;
  messaging?: any;
  referenceTime?: Date;
  targetFamilyId?: string;
}

export class TaskReminderService {
  /**
   * Converte data ('YYYY-MM-DD') e hora ('HH:MM') no timezone especificado
   * em um objeto Date UTC exato usando APIs nativas (Intl).
   */
  public static calculateScheduledInstant(
    dateStr: string,
    timeStr: string,
    timeZone = DEFAULT_FAMILY_TIMEZONE
  ): Date {
    if (!dateStr || typeof dateStr !== 'string' || !dateStr.includes('-')) {
      throw new Error(`Data inválida fornecida para cálculo de agendamento: ${dateStr}`);
    }
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
      throw new Error(`Horário inválido fornecido para cálculo de agendamento: ${timeStr}`);
    }

    const [year, month, day] = dateStr.trim().split('-').map(Number);
    const [hours, minutes] = timeStr.trim().split(':').map(Number);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      throw new Error(`Valores numéricos inválidos em data/hora: ${dateStr} ${timeStr}`);
    }

    // Criamos uma estimativa inicial em UTC
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));

    // Formatador para inspecionar como utcGuess se projeta no timezone desejado
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || DEFAULT_FAMILY_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(utcGuess);
    const partMap: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        partMap[part.type] = Number(part.value);
      }
    }

    const tzHour = partMap.hour === 24 ? 0 : partMap.hour;
    const tzAsUtc = Date.UTC(
      partMap.year,
      partMap.month - 1,
      partMap.day,
      tzHour,
      partMap.minute,
      partMap.second
    );

    // O offset em milissegundos
    const offsetMs = tzAsUtc - utcGuess.getTime();

    // O instante real UTC
    return new Date(utcGuess.getTime() - offsetMs);
  }

  /**
   * Avalia se a hora prevista do lembrete (reminderAt) está dentro da janela do scheduler.
   * Tolerância: entre [referenceTime - 10 min] e [referenceTime + 5 min].
   */
  public static isWithinReminderWindow(
    reminderAt: Date,
    referenceTime = new Date()
  ): boolean {
    const reminderTimeMs = reminderAt.getTime();
    const refTimeMs = referenceTime.getTime();

    const minAllowed = refTimeMs - SCHEDULER_WINDOW_BEFORE_MS;
    const maxAllowed = refTimeMs + SCHEDULER_WINDOW_AFTER_MS;

    return reminderTimeMs >= minAllowed && reminderTimeMs <= maxAllowed;
  }

  /**
   * Gera a chave de idempotência canônica determinística para o lembrete de ocorrência.
   * Invariante N1B2-18: baseada no assignmentId e familyId, NUNCA em TaskMasterId isolado.
   */
  public static buildIdempotencyKey(
    familyId: string,
    assignmentId: string,
    type = 'TASK_REMINDER_15M'
  ): string {
    if (!familyId || !assignmentId) {
      throw new Error('familyId e assignmentId são obrigatórios para idempotencyKey');
    }
    return `${type}:${familyId.trim()}:${assignmentId.trim()}`;
  }

  /**
   * Normaliza o executionTarget legado ou ausente.
   * Invariante N1B2-08: ausente -> 'HOUSEHOLD'.
   */
  public static resolveExecutionTarget(
    rawTarget?: string
  ): 'HOUSEHOLD' | 'EXTERNAL_SUPPORT' | 'FLEXIBLE' {
    if (!rawTarget || typeof rawTarget !== 'string') return 'HOUSEHOLD';
    const normalized = rawTarget.trim().toUpperCase();
    if (normalized === 'EXTERNAL_SUPPORT') return 'EXTERNAL_SUPPORT';
    if (normalized === 'FLEXIBLE') return 'FLEXIBLE';
    return 'HOUSEHOLD';
  }

  /**
   * Executa a rotina completa de resolução e despacho de lembretes para todas as famílias ativas.
   */
  public static async processAllTaskReminders(
    params?: ProcessTaskRemindersParams
  ): Promise<ProcessRemindersResult> {
    const db = params?.firestoreDb || getAdminFirestore(CASAJUNTO_FIRESTORE_DATABASE_ID);
    const messaging = params?.messaging;
    const referenceTime = params?.referenceTime || new Date();

    const aggregatedResult: ProcessRemindersResult = {
      candidatesEvaluated: 0,
      remindersClaimed: 0,
      remindersSent: 0,
      remindersFailed: 0,
      remindersSkipped: 0,
      details: []
    };

    // 1. Localizar famílias candidatas
    let familiesSnapshot: any;
    if (params?.targetFamilyId) {
      const famDoc = await db.collection('families').doc(params.targetFamilyId).get();
      familiesSnapshot = {
        size: famDoc.exists ? 1 : 0,
        docs: famDoc.exists ? [famDoc] : []
      };
    } else {
      familiesSnapshot = await db.collection('families').get();
    }

    if (familiesSnapshot.size === 0) {
      return aggregatedResult;
    }

    // 2. Iterar por família respeitando isolamento total de tenant
    for (const famDoc of familiesSnapshot.docs) {
      const familyData = famDoc.data() || {};
      const familyId = famDoc.id;

      if (familyData.active === false || familyData.status === 'ARCHIVED') {
        continue;
      }

      const famResult = await this.processFamilyReminders({
        familyId,
        familyData,
        firestoreDb: db,
        messaging,
        referenceTime
      });

      aggregatedResult.candidatesEvaluated += famResult.candidatesEvaluated;
      aggregatedResult.remindersClaimed += famResult.remindersClaimed;
      aggregatedResult.remindersSent += famResult.remindersSent;
      aggregatedResult.remindersFailed += famResult.remindersFailed;
      aggregatedResult.remindersSkipped += famResult.remindersSkipped;
      aggregatedResult.details.push(...famResult.details);
    }

    return aggregatedResult;
  }

  /**
   * Processa os lembretes para uma família específica, garantindo isolamento total de tenant.
   */
  public static async processFamilyReminders(options: {
    familyId: string;
    familyData: any;
    firestoreDb: any;
    messaging?: any;
    referenceTime: Date;
  }): Promise<ProcessRemindersResult> {
    const { familyId, familyData, firestoreDb, messaging, referenceTime } = options;
    const familyTz = familyData?.timezone || DEFAULT_FAMILY_TIMEZONE;

    const result: ProcessRemindersResult = {
      candidatesEvaluated: 0,
      remindersClaimed: 0,
      remindersSent: 0,
      remindersFailed: 0,
      remindersSkipped: 0,
      details: []
    };

    // Busca assignments da família
    const assignmentsRef = firestoreDb.collection('families').doc(familyId).collection('assignments');
    const assignmentsSnap = await assignmentsRef.get();

    if (assignmentsSnap.size === 0) {
      return result;
    }

    for (const asgDoc of assignmentsSnap.docs) {
      result.candidatesEvaluated++;
      const asg = asgDoc.data() || {};
      const assignmentId = asgDoc.id;

      // Invariante de tenant isolation estrito:
      const docFamilyId = asg.family_id || asg.familyId || familyId;
      if (docFamilyId !== familyId) {
        continue; // Descarta dados corrompidos de outro tenant
      }

      // Regra A: Validação de data e horário programado
      const scheduledDate = asg.scheduled_date || asg.dueDate;
      const scheduledStart = asg.scheduled_start || asg.scheduledStart;

      if (!scheduledDate || !scheduledStart || typeof scheduledStart !== 'string' || !scheduledStart.includes(':')) {
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_OUT_OF_WINDOW',
          reason: 'Sem scheduled_start válido'
        });
        continue;
      }

      // Regra B: Possui assignedMemberId e não é unassigned
      const memberId = asg.member_id || asg.assignedMemberId || asg.assigneeId;
      if (!memberId || asg.is_unassigned === true || asg.isUnassigned === true) {
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_UNASSIGNED',
          reason: 'Sem membro atribuído'
        });
        continue;
      }

      // Regra D: Ainda está pendente (não COMPLETED / DONE / CANCELLED)
      const rawStatus = (asg.status || 'SCHEDULED').toUpperCase();
      if (rawStatus === 'COMPLETED' || rawStatus === 'DONE' || asg.completed_at) {
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_ALREADY_COMPLETED',
          reason: 'Tarefa já concluída'
        });
        continue;
      }

      if (rawStatus === 'CANCELLED' || rawStatus === 'REMOVED') {
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_ALREADY_COMPLETED',
          reason: 'Tarefa cancelada ou removida'
        });
        continue;
      }

      // Regra F: Calcular instante e avaliar janela de 15 minutos
      let scheduledAt: Date;
      try {
        scheduledAt = this.calculateScheduledInstant(scheduledDate, scheduledStart, familyTz);
      } catch (err: any) {
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_OUT_OF_WINDOW',
          reason: `Erro no cálculo de timezone: ${err?.message}`
        });
        continue;
      }

      const reminderAt = new Date(scheduledAt.getTime() - REMINDER_LEAD_TIME_MS);

      if (!this.isWithinReminderWindow(reminderAt, referenceTime)) {
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_OUT_OF_WINDOW',
          reason: 'Fora da janela de lembrete'
        });
        continue;
      }

      // Regra E: Resolver executionTarget da FamilyTask correspondente dentro do mesmo tenant
      const familyTaskId = asg.family_task_id || asg.familyTaskId;
      let taskName = asg.task_name || asg.title || 'Sua tarefa';
      let executionTarget: 'HOUSEHOLD' | 'EXTERNAL_SUPPORT' | 'FLEXIBLE' = 'HOUSEHOLD';

      if (familyTaskId) {
        const ftDoc = await firestoreDb.collection('families').doc(familyId).collection('familyTasks').doc(familyTaskId).get();
        if (ftDoc.exists) {
          const ftData = ftDoc.data() || {};
          // Tenant isolation check
          const ftFamilyId = ftData.family_id || ftData.familyId || familyId;
          if (ftFamilyId === familyId) {
            executionTarget = this.resolveExecutionTarget(ftData.executionTarget || ftData.execution_target);
            if (ftData.customTitle || ftData.custom_title || ftData.name) {
              taskName = ftData.customTitle || ftData.custom_title || ftData.name;
            }
          }
        }
      }

      // Invariante N1B2-02: EXTERNAL_SUPPORT nunca recebe notificação de morador
      if (executionTarget === 'EXTERNAL_SUPPORT') {
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_EXTERNAL_SUPPORT',
          reason: 'executionTarget é EXTERNAL_SUPPORT'
        });
        continue;
      }

      // Regra C: Resolver Member -> userId (Firebase UID) estritamente no mesmo tenant
      const memberDoc = await firestoreDb.collection('families').doc(familyId).collection('members').doc(memberId).get();
      if (!memberDoc.exists) {
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_NO_LINKED_USER',
          reason: 'Membro não encontrado no tenant da família'
        });
        continue;
      }

      const memberData = memberDoc.data() || {};
      const memberFamilyId = memberData.family_id || memberData.familyId || familyId;
      if (memberFamilyId !== familyId) {
        // Violação de isolamento entre famílias
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_NO_LINKED_USER',
          reason: 'Membro pertence a outra família'
        });
        continue;
      }

      const linkedUserId = memberData.userId || memberData.user_id;
      if (!linkedUserId || typeof linkedUserId !== 'string' || linkedUserId.trim() === '') {
        // Invariante N1B2-07: Member sem userId -> SKIPPED_NO_LINKED_USER
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
          familyId,
          assignmentId,
          status: 'SKIPPED_NO_LINKED_USER',
          reason: 'Membro sem conta/userId Firebase associado'
        });
        continue;
      }

      // Se executionTarget for FLEXIBLE, confirma que o membro é morador da casa
      if (executionTarget === 'FLEXIBLE') {
        // Moradores da casa (ADMIN / MEMBER) são elegíveis
        const memberRole = (memberData.role || 'MEMBER').toUpperCase();
        if (memberRole !== 'ADMIN' && memberRole !== 'MEMBER') {
          result.remindersSkipped++;
          result.details.push({
            idempotencyKey: this.buildIdempotencyKey(familyId, assignmentId),
            familyId,
            assignmentId,
            status: 'SKIPPED_EXTERNAL_SUPPORT',
            reason: 'FLEXIBLE atribuído a não-membro'
          });
          continue;
        }
      }

      // 7. Reserva Atômica de Idempotência (/notificationReminders/{idempotencyKey})
      const idempotencyKey = this.buildIdempotencyKey(familyId, assignmentId);
      const reminderRef = firestoreDb.collection('notificationReminders').doc(idempotencyKey);

      let canProceedWithDelivery = false;
      const nowIso = new Date().toISOString();

      // Execução da reserva atômica (transação ou create-if-absent)
      try {
        if (typeof firestoreDb.runTransaction === 'function') {
          await firestoreDb.runTransaction(async (transaction: any) => {
            const snap = await transaction.get(reminderRef);

            if (!snap.exists) {
              // Primeiro claim: adquire com sucesso
              const newReminder: NotificationReminderDoc = {
                id: idempotencyKey,
                familyId,
                assignmentId,
                userId: linkedUserId,
                type: 'TASK_REMINDER_15M',
                status: 'CLAIMED',
                scheduledAt: scheduledAt.toISOString(),
                reminderAt: reminderAt.toISOString(),
                claimedAt: nowIso,
                updatedAt: nowIso,
                attemptCount: 1
              };
              transaction.set(reminderRef, newReminder);
              canProceedWithDelivery = true;
            } else {
              const current = snap.data() as NotificationReminderDoc;

              // Se já foi enviado com sucesso, nunca reenvia
              if (current.status === 'SENT' || current.status === 'SKIPPED_NO_ACTIVE_DEVICE') {
                canProceedWithDelivery = false;
                return;
              }

              // Se está CLAIMED por outro processo recente (lease ativo), não interfere
              const claimedAtMs = current.claimedAt ? new Date(current.claimedAt).getTime() : 0;
              const isLeaseActive = Date.now() - claimedAtMs < LEASE_DURATION_MS;

              if (current.status === 'CLAIMED' && isLeaseActive) {
                canProceedWithDelivery = false;
                return;
              }

              // Se atingiu maxAttempts, não cria loop infinito
              if (current.attemptCount >= MAX_REMINDER_ATTEMPTS) {
                canProceedWithDelivery = false;
                return;
              }

              // Permite retry controlado se estiver FAILED ou claim expirado
              const nextAttempt = (current.attemptCount || 0) + 1;
              transaction.update(reminderRef, {
                status: 'CLAIMED',
                claimedAt: nowIso,
                updatedAt: nowIso,
                attemptCount: nextAttempt
              });
              canProceedWithDelivery = true;
            }
          });
        } else {
          // Fallback para ambientes sem runTransaction completo
          const snap = await reminderRef.get();
          if (!snap.exists) {
            const newReminder: NotificationReminderDoc = {
              id: idempotencyKey,
              familyId,
              assignmentId,
              userId: linkedUserId,
              type: 'TASK_REMINDER_15M',
              status: 'CLAIMED',
              scheduledAt: scheduledAt.toISOString(),
              reminderAt: reminderAt.toISOString(),
              claimedAt: nowIso,
              updatedAt: nowIso,
              attemptCount: 1
            };
            await reminderRef.set(newReminder);
            canProceedWithDelivery = true;
          } else {
            const current = snap.data();
            if (current.status === 'SENT' || current.status === 'SKIPPED_NO_ACTIVE_DEVICE' || current.attemptCount >= MAX_REMINDER_ATTEMPTS) {
              canProceedWithDelivery = false;
            } else {
              await reminderRef.update({
                status: 'CLAIMED',
                claimedAt: nowIso,
                updatedAt: nowIso,
                attemptCount: (current.attemptCount || 0) + 1
              });
              canProceedWithDelivery = true;
            }
          }
        }
      } catch (claimErr: any) {
        // Conflito transacional de concorrência ou erro de escrita
        canProceedWithDelivery = false;
      }

      if (!canProceedWithDelivery) {
        result.remindersSkipped++;
        result.details.push({
          idempotencyKey,
          familyId,
          assignmentId,
          status: 'SKIPPED_ALREADY_COMPLETED',
          reason: 'Já processado ou em processamento concorrente'
        });
        continue;
      }

      result.remindersClaimed++;

      // 8. Construção do Payload Seguro MVP (desacoplado de TaskAssignment)
      const payload: PushNotificationPayload = {
        title: 'CasaJunto · tarefa em 15 minutos',
        body: `${taskName} começa às ${scheduledStart}`,
        data: {
          type: 'TASK_REMINDER',
          assignmentId,
          familyId
        }
      };

      // 9. Despacho Multi-Dispositivo via PushDeliveryService existente
      let deliveryOutcome: ReminderStatus = 'FAILED';
      let errorReason: string | undefined;

      try {
        const pushResult = await PushDeliveryService.sendPushToUser({
          userId: linkedUserId,
          payload,
          firestoreDb,
          messaging
        });

        // Semântica de sucesso multi-device: ao menos 1 dispositivo com sucesso -> SENT
        if (pushResult.successCount > 0) {
          deliveryOutcome = 'SENT';
          result.remindersSent++;
        } else if (pushResult.devicesFound === 0 || pushResult.invalidTokensCount === pushResult.devicesFound) {
          // Usuário não possui dispositivos ativos
          deliveryOutcome = 'SKIPPED_NO_ACTIVE_DEVICE';
          result.remindersSkipped++;
        } else {
          // Falha em todos os envios
          deliveryOutcome = 'FAILED';
          result.remindersFailed++;
          errorReason = pushResult.details[0]?.errorMessage || 'Falha no envio FCM';
        }
      } catch (sendErr: any) {
        deliveryOutcome = 'FAILED';
        result.remindersFailed++;
        errorReason = sendErr?.message || String(sendErr);
      }

      // 10. Atualização do estado no Firestore
      const updateData: Record<string, any> = {
        status: deliveryOutcome,
        updatedAt: new Date().toISOString()
      };
      if (deliveryOutcome === 'SENT') {
        updateData.sentAt = new Date().toISOString();
      }
      if (errorReason) {
        updateData.lastError = errorReason;
      }

      try {
        await reminderRef.update(updateData);
      } catch (updateErr) {
        console.warn(`[TaskReminder] Falha ao atualizar status final do lembrete ${idempotencyKey}:`, updateErr);
      }

      result.details.push({
        idempotencyKey,
        familyId,
        assignmentId,
        status: deliveryOutcome,
        reason: errorReason
      });
    }

    return result;
  }
}
