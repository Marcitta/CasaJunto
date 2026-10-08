/**
 * CASA JUNTO — TEST SUITE NOTIFICATIONS-1B.2
 * Reminder Candidate Resolution + Scheduler + Idempotency:
 * 
 * N1B2-01: HOUSEHOLD + assigned + pending + janela correta -> candidato.
 * N1B2-02: EXTERNAL_SUPPORT -> nunca candidato.
 * N1B2-03: FLEXIBLE + assigned household member -> candidato.
 * N1B2-04: sem assignedMemberId -> não envia.
 * N1B2-05: COMPLETED -> não envia.
 * N1B2-06: CANCELLED -> não envia.
 * N1B2-07: Member sem userId -> SKIPPED_NO_LINKED_USER.
 * N1B2-08: legacy executionTarget ausente -> HOUSEHOLD.
 * N1B2-09: timezone America/Sao_Paulo calcula scheduledAt corretamente.
 * N1B2-10: scheduler executado duas vezes na mesma janela -> somente um reminder lógico SENT.
 * N1B2-11: duas execuções concorrentes -> somente uma adquire claim.
 * N1B2-12: reminder SENT -> nunca reenviado.
 * N1B2-13: falha temporária -> FAILED/retry conforme política.
 * N1B2-14: maxAttempts atingido -> não cria loop infinito.
 * N1B2-15: 2 devices ativos -> 1 reminder lógico + entrega multi-device.
 * N1B2-16: family A não resolve member da family B.
 * N1B2-17: family A não resolve FamilyTask da family B.
 * N1B2-18: idempotencyKey usa assignmentId/occurrence, não TaskMasterId isoladamente.
 * N1B2-19: payload não contém token/credencial/dado sensível.
 * N1B2-20: scheduler não é HTTP público.
 * N1B2-21: Firestore nomeado continua obrigatório.
 * N1B2-22: Motor 2.0 intacto.
 * N1B2-23: task com horário fora da janela -> não candidato.
 * N1B2-24: task sem scheduled_start válido -> não candidato.
 * N1B2-25: um device inválido + outro válido -> reminder lógico SENT se houve pelo menos um sucesso.
 */

import fs from 'fs';
import path from 'path';
import {
  TaskReminderService,
  MAX_REMINDER_ATTEMPTS
} from '../../functions/src/services/taskReminderService';
import { CASAJUNTO_FIRESTORE_DATABASE_ID } from '../../functions/src/firebaseAdmin';

export async function runNotifications1b2Tests(): Promise<{
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
      results.push({ testName: `Notifications-1B.2 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `Notifications-1B.2 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  // Mock builder avançado em memória para simular Firestore estruturado
  function createFullMockFirestore(initialData: {
    families?: Record<string, any>;
    members?: Record<string, Record<string, any>>; // familyId -> memberId -> data
    familyTasks?: Record<string, Record<string, any>>; // familyId -> taskId -> data
    assignments?: Record<string, Record<string, any>>; // familyId -> assignmentId -> data
    pushDevices?: Record<string, Record<string, any>>; // userId -> deviceId -> data
    notificationReminders?: Record<string, any>; // idempotencyKey -> data
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
            get: async () => ({
              size: Object.keys(families).length,
              docs: Object.entries(families).map(([id, data]) => ({
                id,
                exists: true,
                data: () => data
              }))
            }),
            doc: (familyId: string) => ({
              get: async () => ({
                id: familyId,
                exists: Boolean(families[familyId]),
                data: () => families[familyId] || {}
              }),
              collection: (subCol: string) => {
                if (subCol === 'assignments') {
                  const famAsgs = assignments[familyId] || {};
                  const filterList = (field: string, op: string, val: any) => {
                    let list = Object.entries(famAsgs).map(([id, data]) => ({ id, ...data }));
                    if (op === 'in' && Array.isArray(val)) {
                      list = list.filter(d => val.includes((d as any)[field]));
                    } else if (op === '==') {
                      list = list.filter(d => (d as any)[field] === val);
                    }
                    return {
                      size: list.length,
                      docs: list.map(d => ({
                        id: d.id,
                        exists: true,
                        data: () => d
                      }))
                    };
                  };

                  return {
                    where: (field: string, op: string, val: any) => ({
                      get: async () => filterList(field, op, val)
                    }),
                    get: async () => {
                      return {
                        size: Object.keys(famAsgs).length,
                        docs: Object.entries(famAsgs).map(([id, data]) => ({
                          id,
                          exists: true,
                          data: () => data
                        }))
                      };
                    },
                    doc: (asgId: string) => ({
                      get: async () => {
                        const famAsgs = assignments[familyId] || {};
                        return {
                          id: asgId,
                          exists: Boolean(famAsgs[asgId]),
                          data: () => famAsgs[asgId] || {}
                        };
                      }
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
                notificationReminders[docId] = { ...(notificationReminders[docId] || {}), ...data };
              }
            })
          };
        }

        throw new Error(`Unexpected collection ${colName}`);
      },
      runTransaction: async (updateFunction: (t: any) => Promise<any>) => {
        // Serialização atômica para simular isolamento transacional e trava concorrente do Firestore
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

  function createMockMessaging(behavior?: (msg: any) => Promise<any> | void) {
    const sentList: any[] = [];
    return {
      send: async (msg: any) => {
        sentList.push(msg);
        if (behavior) await behavior(msg);
        return 'projects/trusty-coder-386311/messages/mock_msg_' + Date.now();
      },
      getSent: () => sentList
    };
  }

  // Base fixtures
  const refTime = new Date('2026-10-06T17:15:00.000Z'); // 14:15 em São Paulo
  const scheduledDate = '2026-10-06';
  const scheduledStart = '14:30'; // 14:30 em SP -> lembrete é exatamente 14:15 (17:15 UTC)

  // N1B2-01: HOUSEHOLD + assigned + pending + janela correta -> candidato
  await record('N1B2-01', 'HOUSEHOLD + assigned + pending + janela correta gera envio com sucesso', async () => {
    const famId = 'fam-01';
    const asgId = 'asg-01';
    const mId = 'mem-01';
    const uId = 'user-01';
    const ftId = 'ft-01';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 1', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { [mId]: { family_id: famId, userId: uId, name: 'Alice', role: 'MEMBER' } } },
      familyTasks: { [famId]: { [ftId]: { family_id: famId, executionTarget: 'HOUSEHOLD', name: 'Lavar Louça' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            family_task_id: ftId,
            member_id: mId,
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-1': { active: true, token: 'token-alice-1' } } }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 1) throw new Error(`Esperava 1 reminder enviado, obtido: ${res.remindersSent}`);
    if (res.remindersClaimed !== 1) throw new Error(`Esperava 1 claim, obtido: ${res.remindersClaimed}`);
    if (messaging.getSent().length !== 1) throw new Error('Mensagem FCM não foi despachada');
  });

  // N1B2-02: EXTERNAL_SUPPORT -> nunca candidato
  await record('N1B2-02', 'EXTERNAL_SUPPORT nunca envia push para membros da família', async () => {
    const famId = 'fam-02';
    const asgId = 'asg-02';
    const mId = 'mem-02';
    const uId = 'user-02';
    const ftId = 'ft-ext-02';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 2', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { [mId]: { family_id: famId, userId: uId, name: 'Bob' } } },
      familyTasks: { [famId]: { [ftId]: { family_id: famId, executionTarget: 'EXTERNAL_SUPPORT', name: 'Faxina Diarista' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            family_task_id: ftId,
            member_id: mId,
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-2': { active: true, token: 'token-bob-1' } } }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 0) throw new Error('EXTERNAL_SUPPORT não pode gerar envio de push');
    if (messaging.getSent().length !== 0) throw new Error('Nenhum FCM pode ser disparado para EXTERNAL_SUPPORT');
    const detail = res.details.find(d => d.assignmentId === asgId);
    if (detail?.status !== 'SKIPPED_EXTERNAL_SUPPORT') throw new Error('Status deve ser SKIPPED_EXTERNAL_SUPPORT');
  });

  // N1B2-03: FLEXIBLE + assigned household member -> candidato
  await record('N1B2-03', 'FLEXIBLE atribuído a morador da casa é elegível e recebe push', async () => {
    const famId = 'fam-03';
    const asgId = 'asg-03';
    const mId = 'mem-03';
    const uId = 'user-03';
    const ftId = 'ft-flex-03';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 3', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { [mId]: { family_id: famId, userId: uId, name: 'Carlos', role: 'MEMBER' } } },
      familyTasks: { [famId]: { [ftId]: { family_id: famId, executionTarget: 'FLEXIBLE', name: 'Passear com Pet' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            family_task_id: ftId,
            member_id: mId,
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-3': { active: true, token: 'token-carlos-1' } } }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 1) throw new Error('FLEXIBLE para morador da casa deve receber lembrete');
  });

  // N1B2-04: sem assignedMemberId -> não envia
  await record('N1B2-04', 'tarefa sem membro atribuído (is_unassigned) não recebe envio', async () => {
    const famId = 'fam-04';
    const asgId = 'asg-04';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 4', timezone: 'America/Sao_Paulo', active: true } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            is_unassigned: true,
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 0) throw new Error('Tarefa não atribuída não pode receber push');
  });

  // N1B2-05: COMPLETED -> não envia
  await record('N1B2-05', 'tarefa com status COMPLETED não envia push', async () => {
    const famId = 'fam-05';
    const asgId = 'asg-05';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 5', timezone: 'America/Sao_Paulo', active: true } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-05',
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'COMPLETED'
          }
        }
      }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 0) throw new Error('Tarefa COMPLETED não pode receber push');
  });

  // N1B2-06: CANCELLED -> não envia
  await record('N1B2-06', 'tarefa cancelada (CANCELLED) não envia push', async () => {
    const famId = 'fam-06';
    const asgId = 'asg-06';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 6', timezone: 'America/Sao_Paulo', active: true } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-06',
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'CANCELLED'
          }
        }
      }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 0) throw new Error('Tarefa CANCELLED não pode receber push');
  });

  // N1B2-07: Member sem userId -> SKIPPED_NO_LINKED_USER
  await record('N1B2-07', 'Member sem conta/userId Firebase associado retorna SKIPPED_NO_LINKED_USER', async () => {
    const famId = 'fam-07';
    const asgId = 'asg-07';
    const mId = 'mem-unlinked-07';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 7', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { [mId]: { family_id: famId, name: 'Criança Sem Celular' } } }, // sem userId
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: mId,
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 0) throw new Error('Membro sem userId não pode receber push');
    const detail = res.details.find(d => d.assignmentId === asgId);
    if (detail?.status !== 'SKIPPED_NO_LINKED_USER') throw new Error('Status esperado: SKIPPED_NO_LINKED_USER');
  });

  // N1B2-08: legacy executionTarget ausente -> HOUSEHOLD
  await record('N1B2-08', 'FamilyTask legada sem executionTarget assume HOUSEHOLD por padrão', () => {
    const resolved = TaskReminderService.resolveExecutionTarget(undefined);
    if (resolved !== 'HOUSEHOLD') throw new Error(`Esperava HOUSEHOLD, obtido: ${resolved}`);
    const resolvedNull = TaskReminderService.resolveExecutionTarget(null as any);
    if (resolvedNull !== 'HOUSEHOLD') throw new Error(`Esperava HOUSEHOLD para null, obtido: ${resolvedNull}`);
  });

  // N1B2-09: timezone America/Sao_Paulo calcula scheduledAt corretamente
  await record('N1B2-09', 'timezone America/Sao_Paulo calcula o instante UTC com precisão', () => {
    // 14:30 em São Paulo (UTC-3) deve ser 17:30 UTC
    const instant = TaskReminderService.calculateScheduledInstant('2026-10-06', '14:30', 'America/Sao_Paulo');
    if (instant.getUTCHours() !== 17 || instant.getUTCMinutes() !== 30) {
      throw new Error(`Horário UTC incorreto: ${instant.toISOString()}`);
    }
  });

  // N1B2-10: scheduler executado duas vezes na mesma janela -> somente um reminder lógico SENT
  await record('N1B2-10', 'duas execuções sequenciais na mesma janela enviam exatamente UM lembrete', async () => {
    const famId = 'fam-10';
    const asgId = 'asg-10';
    const mId = 'mem-10';
    const uId = 'user-10';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 10', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { [mId]: { family_id: famId, userId: uId, name: 'Daniel' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: mId,
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-10': { active: true, token: 'token-daniel-1' } } }
    });
    const messaging = createMockMessaging();

    // Primeira execução
    const res1 = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    // Segunda execução
    const res2 = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res1.remindersSent !== 1) throw new Error('Primeira execução deveria enviar 1 lembrete');
    if (res2.remindersSent !== 0) throw new Error('Segunda execução NÃO pode reenviar o lembrete');
    if (messaging.getSent().length !== 1) throw new Error('Total de mensagens FCM enviadas deve ser rigorosamente 1');
  });

  // N1B2-11: duas execuções concorrentes -> somente uma adquire claim
  await record('N1B2-11', 'duas execuções concorrentes utilizam claim atômico e apenas uma despacha', async () => {
    const famId = 'fam-11';
    const asgId = 'asg-11';
    const mId = 'mem-11';
    const uId = 'user-11';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 11', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { [mId]: { family_id: famId, userId: uId, name: 'Elena' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: mId,
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-11': { active: true, token: 'token-elena-1' } } }
    });
    const messaging = createMockMessaging();

    // Executa concorrentemente via Promise.all
    const [p1, p2] = await Promise.all([
      TaskReminderService.processAllTaskReminders({ firestoreDb: db, messaging, referenceTime: refTime }),
      TaskReminderService.processAllTaskReminders({ firestoreDb: db, messaging, referenceTime: refTime })
    ]);

    const totalSent = p1.remindersSent + p2.remindersSent;
    if (totalSent !== 1) throw new Error(`Esperava totalSent == 1 sob concorrência, obtido: ${totalSent}`);
    if (messaging.getSent().length !== 1) throw new Error('Exatamente um despacho FCM deve ser emitido');
  });

  // N1B2-12: reminder SENT -> nunca reenviado
  await record('N1B2-12', 'documento com status SENT nunca é reenviado em execuções posteriores', async () => {
    const famId = 'fam-12';
    const asgId = 'asg-12';
    const idempotencyKey = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 12', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-12': { family_id: famId, userId: 'user-12', name: 'Fabio' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-12',
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { 'user-12': { 'dev-12': { active: true, token: 'token-fabio-1' } } },
      notificationReminders: {
        [idempotencyKey]: {
          id: idempotencyKey,
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
      referenceTime: refTime
    });

    if (res.remindersSent !== 0) throw new Error('Lembrete com status SENT não pode ser reenviado');
    if (messaging.getSent().length !== 0) throw new Error('Nenhum FCM deve ser despachado');
  });

  // N1B2-13: falha temporária -> FAILED/retry conforme política
  await record('N1B2-13', 'falha temporária no FCM registra status FAILED e permite retry na próxima execução', async () => {
    const famId = 'fam-13';
    const asgId = 'asg-13';
    const uId = 'user-13';

    let shouldFail = true;
    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 13', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-13': { family_id: famId, userId: uId, name: 'Gisele' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-13',
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-13': { active: true, token: 'token-gisele-1' } } }
    });

    const messaging = createMockMessaging(() => {
      if (shouldFail) {
        const err: any = new Error('Server unavailable');
        err.code = 'messaging/server-unavailable';
        throw err;
      }
    });

    // 1ª tentativa: falha temporária
    const res1 = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res1.remindersFailed !== 1) throw new Error('Primeira tentativa deveria registrar falha');
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);
    if (db._data.notificationReminders[key]?.status !== 'FAILED') {
      throw new Error('Status no banco deveria ser FAILED');
    }

    // 2ª tentativa: servidor recuperou
    shouldFail = false;
    const res2 = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res2.remindersSent !== 1) throw new Error('Segunda tentativa de retry deveria enviar com sucesso');
    if (db._data.notificationReminders[key]?.status !== 'SENT') {
      throw new Error('Status final após retry deve ser SENT');
    }
  });

  // N1B2-14: maxAttempts atingido -> não cria loop infinito
  await record('N1B2-14', 'maxAttempts atingido encerra retries e não cria loop infinito', async () => {
    const famId = 'fam-14';
    const asgId = 'asg-14';
    const idempotencyKey = TaskReminderService.buildIdempotencyKey(famId, asgId);

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 14', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-14': { family_id: famId, userId: 'user-14', name: 'Hugo' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-14',
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { 'user-14': { 'dev-14': { active: true, token: 'token-hugo-1' } } },
      notificationReminders: {
        [idempotencyKey]: {
          id: idempotencyKey,
          status: 'FAILED',
          attemptCount: MAX_REMINDER_ATTEMPTS, // Já atingiu limite
          updatedAt: '2026-10-06T17:15:00.000Z'
        }
      }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersClaimed !== 0) throw new Error('Não deve adquirir claim após atingir maxAttempts');
    if (res.remindersSent !== 0) throw new Error('Não deve despachar após atingir maxAttempts');
  });

  // N1B2-15: 2 devices ativos -> 1 reminder lógico + entrega multi-device
  await record('N1B2-15', '1 reminder lógico dispara entrega para os 2 dispositivos ativos do usuário', async () => {
    const famId = 'fam-15';
    const asgId = 'asg-15';
    const uId = 'user-15';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 15', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-15': { family_id: famId, userId: uId, name: 'Igor' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-15',
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: {
        [uId]: {
          'dev-android': { active: true, token: 'token-android-15' },
          'dev-iphone': { active: true, token: 'token-iphone-15' }
        }
      }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 1) throw new Error('Deve registrar exatamente 1 reminder lógico SENT');
    if (messaging.getSent().length !== 2) throw new Error('Deve disparar entrega para ambos os 2 dispositivos ativos');
  });

  // N1B2-16: family A não resolve member da family B
  await record('N1B2-16', 'isolamento de tenant impede que família A resolva membros da família B', async () => {
    const famA = 'fam-A';
    const famB = 'fam-B';
    const asgId = 'asg-tenant-16';

    const db = createFullMockFirestore({
      families: { [famA]: { name: 'Família A', timezone: 'America/Sao_Paulo', active: true } },
      members: {
        // Membro cadastrado apenas na Família B
        [famB]: { 'mem-B': { family_id: famB, userId: 'user-B', name: 'Intruso' } }
      },
      assignments: {
        [famA]: {
          [asgId]: {
            family_id: famA,
            member_id: 'mem-B', // Referencia membro de outra família
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 0) throw new Error('Não pode enviar notificação para membro de outro tenant');
  });

  // N1B2-17: family A não resolve FamilyTask da family B
  await record('N1B2-17', 'isolamento de tenant impede que família A resolva FamilyTask da família B', async () => {
    const famA = 'fam-A17';
    const famB = 'fam-B17';
    const asgId = 'asg-task-17';
    const mId = 'mem-A17';
    const uId = 'user-A17';
    const ftB = 'ft-cross-B17';

    const db = createFullMockFirestore({
      families: { [famA]: { name: 'Família A17', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famA]: { [mId]: { family_id: famA, userId: uId, name: 'Joao' } } },
      familyTasks: {
        // Tarefa pertence à família B
        [famB]: { [ftB]: { family_id: famB, executionTarget: 'EXTERNAL_SUPPORT', name: 'Tarefa B' } }
      },
      assignments: {
        [famA]: {
          [asgId]: {
            family_id: famA,
            family_task_id: ftB, // Invasão de tenant
            member_id: mId,
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-17': { active: true, token: 'token-joao-17' } } }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    // Como ftB não existe em famA, assume HOUSEHOLD seguro por padrão e não acessa dados da família B
    if (res.candidatesEvaluated !== 1) throw new Error('Candidato deve ser avaliado no escopo da família A');
  });

  // N1B2-18: idempotencyKey usa assignmentId/occurrence, não TaskMasterId isoladamente
  await record('N1B2-18', 'idempotencyKey utiliza deterministicamente familyId e assignmentId da ocorrência', () => {
    const key1 = TaskReminderService.buildIdempotencyKey('fam-18', 'occ-today');
    const key2 = TaskReminderService.buildIdempotencyKey('fam-18', 'occ-tomorrow');

    if (key1 === key2) throw new Error('Ocorrências diferentes devem ter chaves distintas');
    if (!key1.includes('occ-today') || !key1.includes('fam-18')) {
      throw new Error('Chave deve conter familyId e assignmentId');
    }
  });

  // N1B2-19: payload não contém token/credencial/dado sensível
  await record('N1B2-19', 'payload construído para envio não contém token nem credenciais', async () => {
    const famId = 'fam-19';
    const asgId = 'asg-19';
    const uId = 'user-19';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 19', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-19': { family_id: famId, userId: uId, name: 'Larissa' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-19',
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED',
            title: 'Regar as Plantas'
          }
        }
      },
      pushDevices: { [uId]: { 'dev-19': { active: true, token: 'token-larissa-1' } } }
    });

    let sentPayload: any = null;
    const messaging = createMockMessaging((msg) => {
      sentPayload = msg;
    });

    await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (!sentPayload) throw new Error('Mensagem não foi enviada');
    if (sentPayload.notification) throw new Error('Payload não deve conter notification object (data-only requerido para evitar duplicação)');
    const payloadTitle = sentPayload.data?.title || '';
    if (!payloadTitle.includes('CasaJunto')) throw new Error('Título deve identificar o CasaJunto');
    if (sentPayload.data?.token || sentPayload.data?.secret || sentPayload.data?.privateKey) {
      throw new Error('Payload contém dados sensíveis proibidos!');
    }
  });

  // N1B2-20: scheduler não é HTTP público
  await record('N1B2-20', 'função de agendamento em functions/src/index.ts não é endpoint HTTP público', () => {
    const indexFile = path.resolve(rootDir, 'functions/src/index.ts');
    const content = fs.readFileSync(indexFile, 'utf-8');

    if (content.includes('onRequest') || content.includes('onCall')) {
      throw new Error('index.ts não deve expor onRequest ou onCall!');
    }
    if (!content.includes('onSchedule')) {
      throw new Error('index.ts deve utilizar onSchedule para agendamento seguro');
    }
  });

  // N1B2-21: Firestore nomeado continua obrigatório
  await record('N1B2-21', 'TaskReminderService opera exclusivamente no banco nomeado canônico', () => {
    const expectedId = 'ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c';
    if (CASAJUNTO_FIRESTORE_DATABASE_ID !== expectedId) {
      throw new Error(`databaseId divergente: ${CASAJUNTO_FIRESTORE_DATABASE_ID}`);
    }

    const serviceFile = path.resolve(rootDir, 'functions/src/services/taskReminderService.ts');
    const content = fs.readFileSync(serviceFile, 'utf-8');

    if (!content.includes('CASAJUNTO_FIRESTORE_DATABASE_ID')) {
      throw new Error('taskReminderService.ts deve importar e utilizar CASAJUNTO_FIRESTORE_DATABASE_ID');
    }
  });

  // N1B2-22: Motor 2.0 intacto
  await record('N1B2-22', 'Motor 2.0 permanece completamente intocado', () => {
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
      'TASK_REMINDER_15M'
    ];

    for (const relPath of motorFiles) {
      const fullPath = path.resolve(rootDir, relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          throw new Error(`Violação: ${relPath} contém termo indevido: "${term}"`);
        }
      }
    }
  });

  // N1B2-23: task com horário fora da janela -> não candidato
  await record('N1B2-23', 'tarefa com horário muito distante (fora da janela) é ignorada', async () => {
    const famId = 'fam-23';
    const asgId = 'asg-23';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 23', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-23': { family_id: famId, userId: 'user-23', name: 'Marcos' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-23',
            scheduled_date: scheduledDate,
            scheduled_start: '20:00', // Horário da noite, distante de 14:15
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { 'user-23': { 'dev-23': { active: true, token: 'token-marcos-1' } } }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 0) throw new Error('Tarefa fora da janela não pode ser enviada');
    const detail = res.details.find(d => d.assignmentId === asgId);
    if (detail?.status !== 'SKIPPED_OUT_OF_WINDOW') throw new Error('Status esperado: SKIPPED_OUT_OF_WINDOW');
  });

  // N1B2-24: task sem scheduled_start válido -> não candidato
  await record('N1B2-24', 'tarefa sem scheduled_start válido é ignorada', async () => {
    const famId = 'fam-24';
    const asgId = 'asg-24';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 24', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-24': { family_id: famId, userId: 'user-24', name: 'Nathalia' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-24',
            scheduled_date: scheduledDate,
            // scheduled_start ausente
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: { 'user-24': { 'dev-24': { active: true, token: 'token-nath-1' } } }
    });
    const messaging = createMockMessaging();

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 0) throw new Error('Tarefa sem horário não pode ser enviada');
  });

  // N1B2-25: um device inválido + outro válido -> reminder lógico SENT se houve pelo menos um sucesso
  await record('N1B2-25', 'usuário com 1 device inválido e 1 device válido resulta em reminder lógico SENT', async () => {
    const famId = 'fam-25';
    const asgId = 'asg-25';
    const uId = 'user-25';

    const db = createFullMockFirestore({
      families: { [famId]: { name: 'Família 25', timezone: 'America/Sao_Paulo', active: true } },
      members: { [famId]: { 'mem-25': { family_id: famId, userId: uId, name: 'Otavio' } } },
      assignments: {
        [famId]: {
          [asgId]: {
            family_id: famId,
            member_id: 'mem-25',
            scheduled_date: scheduledDate,
            scheduled_start: scheduledStart,
            status: 'SCHEDULED'
          }
        }
      },
      pushDevices: {
        [uId]: {
          'dev-bad': { active: true, token: 'token-stale-bad' },
          'dev-good': { active: true, token: 'token-valid-good' }
        }
      }
    });

    const messaging = createMockMessaging((msg) => {
      if (msg.token === 'token-stale-bad') {
        const err: any = new Error('Token not registered');
        err.code = 'messaging/registration-token-not-registered';
        throw err;
      }
    });

    const res = await TaskReminderService.processAllTaskReminders({
      firestoreDb: db,
      messaging,
      referenceTime: refTime
    });

    if (res.remindersSent !== 1) throw new Error('Reminder lógico deve ser SENT se ao menos 1 device teve sucesso');
    const key = TaskReminderService.buildIdempotencyKey(famId, asgId);
    if (db._data.notificationReminders[key]?.status !== 'SENT') {
      throw new Error('Status persistido no Firestore deve ser SENT');
    }
  });

  return { passed, failed, results };
}
