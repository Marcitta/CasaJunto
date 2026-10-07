/**
 * CASA JUNTO — TEST SUITE NOTIFICATIONS-1B.2-HF1
 * Delivery Finalization Safety + Clock Consistency:
 *
 * HF1-01: claim válido -> persiste DELIVERING antes de chamar FCM.
 * HF1-02: DELIVERING ativo -> segunda execução não envia.
 * HF1-03: DELIVERING expirado -> DELIVERY_UNKNOWN -> zero novo envio.
 * HF1-04: FCM success + gravação SENT success -> SENT.
 * HF1-05: FCM success + gravação SENT falha -> documento permanece DELIVERING -> após lease expirar vira DELIVERY_UNKNOWN -> zero segundo envio.
 * HF1-06: FCM falha total conhecida -> FAILED.
 * HF1-07: FAILED + attempts disponíveis -> retry permitido.
 * HF1-08: FAILED + maxAttempts -> sem retry.
 * HF1-09: SENT -> nunca retry.
 * HF1-10: SKIPPED_NO_ACTIVE_DEVICE -> nunca retry automático.
 * HF1-11: um device success + outro failure -> SENT -> zero retry.
 * HF1-12: referenceTime controla claim/lease deterministicamente nos testes.
 * HF1-13: SKIPPED_EXTERNAL_SUPPORT não cria reminder doc.
 * HF1-14: SKIPPED_NO_LINKED_USER não cria reminder doc.
 * HF1-15: SKIPPED_OUT_OF_WINDOW não cria reminder doc.
 * HF1-16: Motor 2.0 intacto.
 * HF1-17: functions/lib continua não versionado.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import {
  TaskReminderService,
  MAX_REMINDER_ATTEMPTS,
  LEASE_DURATION_MS
} from '../../functions/src/services/taskReminderService';

export async function runNotifications1b2Hf1Tests(): Promise<{
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
      results.push({ testName: `Notifications-1B.2-HF1 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `Notifications-1B.2-HF1 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  function createFullMockFirestore(initialData: {
    families?: Record<string, any>;
    members?: Record<string, Record<string, any>>;
    familyTasks?: Record<string, Record<string, any>>;
    assignments?: Record<string, Record<string, any>>;
    pushDevices?: Record<string, Record<string, any>>;
    notificationReminders?: Record<string, any>;
  }, hooks?: {
    beforeReminderUpdate?: (docId: string, patch: any) => void;
  }) {
    const families = initialData.families || {};
    const members = initialData.members || {};
    const familyTasks = initialData.familyTasks || {};
    const assignments = initialData.assignments || {};
    const pushDevices = initialData.pushDevices || {};
    const notificationReminders = initialData.notificationReminders || {};
    let transactionLock: Promise<void> = Promise.resolve();

    const db: any = {
      collection: (colName: string) => {
        if (colName === 'families') {
          return {
            doc: (familyId: string) => ({
              get: async () => ({
                id: familyId,
                exists: Boolean(families[familyId]),
                data: () => families[familyId] || {}
              }),
              collection: (subCol: string) => {
                if (subCol === 'assignments') {
                  const famAsgs = assignments[familyId] || {};
                  return {
                    get: async () => ({
                      size: Object.keys(famAsgs).length,
                      docs: Object.entries(famAsgs).map(([id, data]) => ({
                        id,
                        exists: true,
                        data: () => data
                      }))
                    })
                  };
                }
                if (subCol === 'familyTasks') {
                  return {
                    doc: (ftId: string) => ({
                      get: async () => {
                        const famFts = familyTasks[familyId] || {};
                        return {
                          id: ftId,
                          exists: Boolean(famFts[ftId]),
                          data: () => famFts[ftId] || {}
                        };
                      }
                    })
                  };
                }
                if (subCol === 'members') {
                  return {
                    doc: (mId: string) => ({
                      get: async () => {
                        const famMembers = members[familyId] || {};
                        return {
                          id: mId,
                          exists: Boolean(famMembers[mId]),
                          data: () => famMembers[mId] || {}
                        };
                      }
                    })
                  };
                }
                throw new Error(`Unexpected subcollection ${subCol}`);
              }
            }),
            get: async () => ({
              size: Object.keys(families).length,
              docs: Object.entries(families).map(([id, data]) => ({
                id,
                exists: true,
                data: () => data
              }))
            })
          };
        }

        if (colName === 'users') {
          return {
            doc: (userId: string) => ({
              collection: (subCol: string) => {
                if (subCol === 'pushDevices') {
                  const userDevs = pushDevices[userId] || {};
                  return {
                    where: (field: string, op: string, val: any) => ({
                      get: async () => {
                        let list = Object.entries(userDevs).map(([id, data]) => ({ id, ...data }));
                        if (field === 'active' && op === '==') {
                          list = list.filter(d => d.active === val);
                        }
                        return {
                          size: list.length,
                          docs: list.map(d => ({
                            id: d.id,
                            exists: true,
                            data: () => d,
                            ref: {
                              update: async (patch: any) => {
                                Object.assign(userDevs[d.id], patch);
                              }
                            }
                          }))
                        };
                      }
                    })
                  };
                }
                throw new Error(`Unexpected subcollection ${subCol} under users`);
              }
            })
          };
        }

        if (colName === 'notificationReminders') {
          return {
            doc: (docId: string) => ({
              get: async () => ({
                id: docId,
                exists: Boolean(notificationReminders[docId]),
                data: () => notificationReminders[docId] || {}
              }),
              set: async (data: any) => {
                notificationReminders[docId] = { ...data };
              },
              update: async (data: any) => {
                if (hooks?.beforeReminderUpdate) {
                  hooks.beforeReminderUpdate(docId, data);
                }
                notificationReminders[docId] = { ...(notificationReminders[docId] || {}), ...data };
              }
            })
          };
        }

        throw new Error(`Unexpected collection ${colName}`);
      },
      runTransaction: async (updateFunction: (t: any) => Promise<any>) => {
        const prevLock = transactionLock;
        let releaseLock: () => void;
        transactionLock = new Promise<void>((resolve) => { releaseLock = resolve; });
        await prevLock;

        try {
          const transaction = {
            get: async (docRef: any) => {
              return docRef.get();
            },
            set: (docRef: any, data: any) => {
              return docRef.set(data);
            },
            update: (docRef: any, data: any) => {
              return docRef.update(data);
            }
          };
          return await updateFunction(transaction);
        } finally {
          releaseLock!();
        }
      },
      _data: {
        families,
        members,
        familyTasks,
        assignments,
        pushDevices,
        notificationReminders
      }
    };

    return db;
  }

  function createMockMessaging(customSend?: (msg: any) => any) {
    const sentMessages: any[] = [];
    return {
      send: async (msg: any) => {
        if (customSend) {
          return customSend(msg);
        }
        sentMessages.push(msg);
        return 'projects/test/messages/msg-' + Math.random().toString(36).substring(7);
      },
      getSent: () => sentMessages
    };
  }

  const baseScheduledDate = '2026-10-06';
  const baseScheduledStart = '14:30';
  // Instante UTC de 14:30 em SP (UTC-3): 17:30 UTC
  // Lembrete (15 min antes): 17:15 UTC
  const baseRefTime = new Date('2026-10-06T17:15:00.000Z');

  // HF1-01: claim válido -> persiste DELIVERING antes de chamar FCM
  await record('HF1-01', 'claim válido persiste DELIVERING antes de chamar FCM', async () => {
    const famId = 'fam-hf1-01';
    const asgId = 'asg-hf1-01';
    const uId = 'user-hf1-01';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    let statusWhenFcmCalled: string | undefined;
    let deliveringAtWhenFcmCalled: string | undefined;

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF1', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-01': { family_id: famId, userId: uId, name: 'Alice' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-01',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-01': { active: true, token: 'token-alice-1' } } }
    });

    const messaging = createMockMessaging(() => {
      // Inspeciona o estado em Firestore no momento exato em que o FCM é chamado
      statusWhenFcmCalled = db._data.notificationReminders[key]?.status;
      deliveringAtWhenFcmCalled = db._data.notificationReminders[key]?.deliveringAt;
      return 'fcm-msg-id-1';
    });

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersSent !== 1) throw new Error(`Esperava 1 envio com sucesso, obtido: ${res.remindersSent}`);
    if (statusWhenFcmCalled !== 'DELIVERING') {
      throw new Error(`Status no Firestore no momento da chamada FCM deveria ser DELIVERING, obtido: ${statusWhenFcmCalled}`);
    }
    if (!deliveringAtWhenFcmCalled) {
      throw new Error('deliveringAt deveria estar registrado no documento antes da chamada FCM');
    }
  });

  // HF1-02: DELIVERING ativo -> segunda execução não envia
  await record('HF1-02', 'DELIVERING ativo impede segunda execução concorrente', async () => {
    const famId = 'fam-hf1-02';
    const asgId = 'asg-hf1-02';
    const uId = 'user-hf1-02';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    // Pre-popula doc com DELIVERING ativo há 2 minutos (dentro do lease de 5 min)
    const t0 = new Date('2026-10-06T17:15:00.000Z');
    const tPlus2Min = new Date('2026-10-06T17:17:00.000Z');

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF2', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-02': { family_id: famId, userId: uId, name: 'Bruno' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-02',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-02': { active: true, token: 'token-bruno-1' } } },
      notificationReminders: {
        [key]: {
          id: key,
          status: 'DELIVERING',
          claimedAt: t0.toISOString(),
          deliveringAt: t0.toISOString(),
          updatedAt: t0.toISOString(),
          attemptCount: 1
        }
      }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: tPlus2Min
    });

    if (res.remindersSent !== 0) throw new Error('Não pode enviar enquanto DELIVERING estiver ativo');
    if (messaging.getSent().length !== 0) throw new Error('Nenhuma mensagem FCM deve ser despachada');
    if (db._data.notificationReminders[key]?.status !== 'DELIVERING') {
      throw new Error('Documento deve permanecer DELIVERING durante lease ativo');
    }
  });

  // HF1-03: DELIVERING expirado -> DELIVERY_UNKNOWN -> zero novo envio
  await record('HF1-03', 'DELIVERING expirado é convertido para DELIVERY_UNKNOWN sem novo envio', async () => {
    const famId = 'fam-hf1-03';
    const asgId = 'asg-hf1-03';
    const uId = 'user-hf1-03';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    // Pre-popula doc com DELIVERING criado há 6 minutos (lease de 5 min expirado)
    const t0 = new Date('2026-10-06T17:15:00.000Z');
    const tPlus6Min = new Date('2026-10-06T17:21:00.000Z');

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF3', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-03': { family_id: famId, userId: uId, name: 'Clara' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-03',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-03': { active: true, token: 'token-clara-1' } } },
      notificationReminders: {
        [key]: {
          id: key,
          status: 'DELIVERING',
          claimedAt: t0.toISOString(),
          deliveringAt: t0.toISOString(),
          updatedAt: t0.toISOString(),
          attemptCount: 1
        }
      }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: tPlus6Min
    });

    if (res.remindersSent !== 0) throw new Error('DELIVERING expirado não pode disparar envio de push');
    if (messaging.getSent().length !== 0) throw new Error('Zero novo envio para DELIVERING expirado');
    if (db._data.notificationReminders[key]?.status !== 'DELIVERY_UNKNOWN') {
      throw new Error(`Documento deveria ser convertido para DELIVERY_UNKNOWN, obtido: ${db._data.notificationReminders[key]?.status}`);
    }
  });

  // HF1-04: FCM success + gravação SENT success -> SENT
  await record('HF1-04', 'FCM success e gravação SENT com sucesso resulta em SENT', async () => {
    const famId = 'fam-hf1-04';
    const asgId = 'asg-hf1-04';
    const uId = 'user-hf1-04';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF4', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-04': { family_id: famId, userId: uId, name: 'Diego' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-04',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-04': { active: true, token: 'token-diego-1' } } }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersSent !== 1) throw new Error('Esperava 1 envio com sucesso');
    const doc = db._data.notificationReminders[key];
    if (doc?.status !== 'SENT') throw new Error(`Status deveria ser SENT, obtido: ${doc?.status}`);
    if (!doc?.sentAt) throw new Error('sentAt deve ser registrado');
  });

  // HF1-05: FCM success + gravação SENT falha -> documento permanece DELIVERING -> após lease expirar vira DELIVERY_UNKNOWN -> zero segundo envio
  await record('HF1-05', 'falha na gravação final de SENT preserva DELIVERING e transiciona para DELIVERY_UNKNOWN sem duplicação', async () => {
    const famId = 'fam-hf1-05';
    const asgId = 'asg-hf1-05';
    const uId = 'user-hf1-05';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    let simulateSentWriteFailure = true;

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF5', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-05': { family_id: famId, userId: uId, name: 'Eva' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-05',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-05': { active: true, token: 'token-eva-1' } } }
    }, {
      beforeReminderUpdate: (_docId, patch) => {
        if (simulateSentWriteFailure && patch.status === 'SENT') {
          throw new Error('Simulated Firestore write failure for status SENT');
        }
      }
    });

    const messaging = createMockMessaging();

    // 1ª execução: FCM despacha, mas a escrita final de SENT falha
    const t0 = new Date('2026-10-06T17:15:00.000Z');
    await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: t0
    });

    if (messaging.getSent().length !== 1) throw new Error('Primeira execução deveria ter chamado o FCM');
    if (db._data.notificationReminders[key]?.status !== 'DELIVERING') {
      throw new Error(`Documento deveria permanecer DELIVERING após falha na escrita de SENT, obtido: ${db._data.notificationReminders[key]?.status}`);
    }

    // 2ª execução após expiração do lease (t0 + 6 minutos)
    simulateSentWriteFailure = false;
    const tPlus6Min = new Date('2026-10-06T17:21:00.000Z');
    const res2 = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: tPlus6Min
    });

    if (res2.remindersSent !== 0) throw new Error('Segunda execução NÃO pode reenviar FCM');
    if (messaging.getSent().length !== 1) throw new Error('Total de mensagens FCM enviadas deve ser rigorosamente 1 (zero duplicação)');
    if (db._data.notificationReminders[key]?.status !== 'DELIVERY_UNKNOWN') {
      throw new Error(`Documento deveria ter sido convertido para DELIVERY_UNKNOWN, obtido: ${db._data.notificationReminders[key]?.status}`);
    }
  });

  // HF1-06: FCM falha total conhecida -> FAILED
  await record('HF1-06', 'falha total conhecida no FCM registra status FAILED', async () => {
    const famId = 'fam-hf1-06';
    const asgId = 'asg-hf1-06';
    const uId = 'user-hf1-06';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF6', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-06': { family_id: famId, userId: uId, name: 'Fernando' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-06',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-06': { active: true, token: 'token-fernando-1' } } }
    });

    const messaging = createMockMessaging(() => {
      const err: any = new Error('Connection reset');
      err.code = 'messaging/server-unavailable';
      throw err;
    });

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersFailed !== 1) throw new Error('Esperava 1 falha registrada');
    const doc = db._data.notificationReminders[key];
    if (doc?.status !== 'FAILED') throw new Error(`Status deveria ser FAILED, obtido: ${doc?.status}`);
    if (!doc?.lastError) throw new Error('lastError deve estar documentado');
  });

  // HF1-07: FAILED + attempts disponíveis -> retry permitido
  await record('HF1-07', 'FAILED com tentativas restantes permite retry na execução seguinte', async () => {
    const famId = 'fam-hf1-07';
    const asgId = 'asg-hf1-07';
    const uId = 'user-hf1-07';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF7', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-07': { family_id: famId, userId: uId, name: 'Gabriela' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-07',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-07': { active: true, token: 'token-gabriela-1' } } },
      notificationReminders: {
        [key]: {
          id: key,
          status: 'FAILED',
          attemptCount: 1,
          lastError: 'Temporary failure'
        }
      }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersSent !== 1) throw new Error('Retry deveria ter enviado com sucesso');
    const doc = db._data.notificationReminders[key];
    if (doc?.status !== 'SENT') throw new Error(`Status após retry deve ser SENT, obtido: ${doc?.status}`);
    if (doc?.attemptCount !== 2) throw new Error(`attemptCount deveria ser 2, obtido: ${doc?.attemptCount}`);
  });

  // HF1-08: FAILED + maxAttempts -> sem retry
  await record('HF1-08', 'FAILED com maxAttempts atingido não executa novo retry', async () => {
    const famId = 'fam-hf1-08';
    const asgId = 'asg-hf1-08';
    const uId = 'user-hf1-08';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF8', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-08': { family_id: famId, userId: uId, name: 'Hugo' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-08',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-08': { active: true, token: 'token-hugo-1' } } },
      notificationReminders: {
        [key]: {
          id: key,
          status: 'FAILED',
          attemptCount: MAX_REMINDER_ATTEMPTS,
          lastError: 'Max attempts reached'
        }
      }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersSent !== 0) throw new Error('Não pode reenviar se maxAttempts foi atingido');
    if (messaging.getSent().length !== 0) throw new Error('Nenhuma chamada FCM deve ser feita');
  });

  // HF1-09: SENT -> nunca retry
  await record('HF1-09', 'documento SENT nunca sofre novo retry', async () => {
    const famId = 'fam-hf1-09';
    const asgId = 'asg-hf1-09';
    const uId = 'user-hf1-09';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF9', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-09': { family_id: famId, userId: uId, name: 'Isabela' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-09',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-09': { active: true, token: 'token-isabela-1' } } },
      notificationReminders: {
        [key]: {
          id: key,
          status: 'SENT',
          sentAt: '2026-10-06T17:15:00.000Z',
          attemptCount: 1
        }
      }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersSent !== 0) throw new Error('Status SENT não pode enviar push');
    if (messaging.getSent().length !== 0) throw new Error('Zero FCM enviado');
  });

  // HF1-10: SKIPPED_NO_ACTIVE_DEVICE -> nunca retry automático
  await record('HF1-10', 'documento SKIPPED_NO_ACTIVE_DEVICE nunca sofre retry automático', async () => {
    const famId = 'fam-hf1-10';
    const asgId = 'asg-hf1-10';
    const uId = 'user-hf1-10';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF10', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-10': { family_id: famId, userId: uId, name: 'Joao' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-10',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: {} },
      notificationReminders: {
        [key]: {
          id: key,
          status: 'SKIPPED_NO_ACTIVE_DEVICE',
          attemptCount: 1
        }
      }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersSent !== 0) throw new Error('SKIPPED_NO_ACTIVE_DEVICE não pode reenviar');
    if (messaging.getSent().length !== 0) throw new Error('Zero FCM enviado');
  });

  // HF1-11: um device success + outro failure -> SENT -> zero retry
  await record('HF1-11', 'um device success e outro failure gera reminder SENT e encerra retries', async () => {
    const famId = 'fam-hf1-11';
    const asgId = 'asg-hf1-11';
    const uId = 'user-hf1-11';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF11', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-11': { family_id: famId, userId: uId, name: 'Lucas' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-11',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: {
        [uId]: {
          'dev-11-good': { active: true, token: 'token-lucas-good' },
          'dev-11-bad': { active: true, token: 'token-lucas-bad' }
        }
      }
    });

    const messaging = createMockMessaging((msg) => {
      if (msg.token === 'token-lucas-bad') {
        const err: any = new Error('Device network error');
        err.code = 'messaging/server-unavailable';
        throw err;
      }
      return 'fcm-msg-good';
    });

    // 1ª execução: 1 sucesso + 1 falha -> resultado deve ser SENT
    const res1 = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res1.remindersSent !== 1) throw new Error('Deveria registrar reminder SENT');
    const doc = db._data.notificationReminders[key];
    if (doc?.status !== 'SENT') throw new Error(`Status gravado deveria ser SENT, obtido: ${doc?.status}`);

    // 2ª execução subsequente: status é SENT, zero retry
    const res2 = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res2.remindersSent !== 0) throw new Error('Não pode reenviar se o reminder lógico já está SENT');
  });

  // HF1-12: referenceTime controla claim/lease deterministicamente nos testes
  await record('HF1-12', 'referenceTime controla avaliação de janela e expiração de lease sem sleep', async () => {
    const famId = 'fam-hf1-12';
    const asgId = 'asg-hf1-12';
    const uId = 'user-hf1-12';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const t0 = new Date('2026-10-06T17:15:00.000Z');
    const tActive = new Date(t0.getTime() + LEASE_DURATION_MS - 60000); // 4 min depois (< 5 min)
    const tExpired = new Date(t0.getTime() + LEASE_DURATION_MS + 60000); // 6 min depois (> 5 min)

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF12', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-12': { family_id: famId, userId: uId, name: 'Marina' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-12',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-12': { active: true, token: 'token-marina-1' } } },
      notificationReminders: {
        [key]: {
          id: key,
          status: 'DELIVERING',
          claimedAt: t0.toISOString(),
          deliveringAt: t0.toISOString(),
          updatedAt: t0.toISOString(),
          attemptCount: 1
        }
      }
    });

    const messaging = createMockMessaging();

    // Com tActive: ainda dentro do lease -> não mexe no status
    await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: tActive
    });
    if (db._data.notificationReminders[key]?.status !== 'DELIVERING') {
      throw new Error('Deveria permanecer DELIVERING em tActive');
    }

    // Com tExpired: fora do lease -> converte para DELIVERY_UNKNOWN
    await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: tExpired
    });
    if (db._data.notificationReminders[key]?.status !== 'DELIVERY_UNKNOWN') {
      throw new Error('Deveria ser convertido para DELIVERY_UNKNOWN em tExpired');
    }
  });

  // HF1-13: SKIPPED_EXTERNAL_SUPPORT não cria reminder doc
  await record('HF1-13', 'SKIPPED_EXTERNAL_SUPPORT não cria documento notificationReminders', async () => {
    const famId = 'fam-hf1-13';
    const asgId = 'asg-hf1-13';
    const uId = 'user-hf1-13';
    const ftId = 'ft-hf1-13';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF13', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-13': { family_id: famId, userId: uId, name: 'Nelson' } } },
      familyTasks: { [famId]: { [ftId]: { family_id: famId, executionTarget: 'EXTERNAL_SUPPORT' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            family_task_id: ftId,
            member_id: 'mem-13',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-13': { active: true, token: 'token-nelson-1' } } }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersSent !== 0) throw new Error('Não pode enviar push para EXTERNAL_SUPPORT');
    if (db._data.notificationReminders[key] !== undefined) {
      throw new Error('SKIPPED_EXTERNAL_SUPPORT não deve criar documento em notificationReminders');
    }
  });

  // HF1-14: SKIPPED_NO_LINKED_USER não cria reminder doc
  await record('HF1-14', 'SKIPPED_NO_LINKED_USER não cria documento notificationReminders', async () => {
    const famId = 'fam-hf1-14';
    const asgId = 'asg-hf1-14';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF14', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-14': { family_id: famId, name: 'Olivia sem conta' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-14',
            scheduled_date: baseScheduledDate,
            scheduled_start: baseScheduledStart,
            status: 'SCHEDULED'
          }
        }
      }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersSent !== 0) throw new Error('Não pode enviar');
    if (db._data.notificationReminders[key] !== undefined) {
      throw new Error('SKIPPED_NO_LINKED_USER não deve criar documento em notificationReminders');
    }
  });

  // HF1-15: SKIPPED_OUT_OF_WINDOW não cria reminder doc
  await record('HF1-15', 'SKIPPED_OUT_OF_WINDOW não cria documento notificationReminders', async () => {
    const famId = 'fam-hf1-15';
    const asgId = 'asg-hf1-15';
    const uId = 'user-hf1-15';
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família HF15', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-15': { family_id: famId, userId: uId, name: 'Pedro' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-15',
            scheduled_date: baseScheduledDate,
            scheduled_start: '23:59', // muito no futuro em relação a 14:30
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-15': { active: true, token: 'token-pedro-1' } } }
    });

    const messaging = createMockMessaging();
    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: baseRefTime
    });

    if (res.remindersSent !== 0) throw new Error('Não pode enviar');
    if (db._data.notificationReminders[key] !== undefined) {
      throw new Error('SKIPPED_OUT_OF_WINDOW não deve criar documento em notificationReminders');
    }
  });

  // HF1-16: Motor 2.0 intacto
  await record('HF1-16', 'Motor 2.0 permanece completamente intocado', () => {
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
      'TaskReminderService',
      'notificationReminders',
      'processTaskReminders',
      'TASK_REMINDER_15M',
      'DELIVERING',
      'DELIVERY_UNKNOWN'
    ];

    for (const relPath of motorFiles) {
      const fullPath = path.resolve(rootDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          throw new Error(`Motor 2.0 violado em ${relPath}: contém "${term}"`);
        }
      }
    }
  });

  // HF1-17: functions/lib continua não versionado
  await record('HF1-17', 'functions/lib permanece estritamente não rastreado no git', () => {
    try {
      const output = execSync('git ls-files functions/lib', { cwd: rootDir, encoding: 'utf-8' }).trim();
      if (output.length > 0) {
        throw new Error(`Arquivos compilados sob functions/lib ainda estão rastreados:\n${output}`);
      }
    } catch (err: any) {
      if (err.message?.includes('ainda estão rastreados')) throw err;
    }
  });

  return { passed, failed, results };
}
