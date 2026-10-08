/**
 * CASA JUNTO — TEST SUITE NOTIFICATIONS-1C-HF3
 * Validação de otimização de consultas Firestore:
 *
 * HF3-01: Cálculo de candidateDates no meio do dia (America/Sao_Paulo).
 * HF3-02: Cálculo de candidateDates na virada da meia-noite (23:55).
 * HF3-03: Cálculo de candidateDates logo após a meia-noite (00:05).
 * HF3-04: formatDateInTimeZone monta formato YYYY-MM-DD via formatToParts sem depender de locale.
 * HF3-05: Deduplicação de assignments com scheduled_date e dueDate idênticos.
 * HF3-06: Compatibilidade legada — assignment contendo apenas dueDate.
 * HF3-07: Assignment moderno contendo apenas scheduled_date.
 * HF3-08: Invariante estrita — NENHUMA consulta executa assignmentsRef.get() sem filtro.
 * HF3-09: Propagação de erro de consulta Firestore (Quota/Network).
 * HF3-10: Consulta vazia retorna resultado normal limpo.
 * HF3-11: Teste de regressão para timezone de família (America/New_York e Asia/Tokyo).
 * HF3-12: Motor 2.0 permanece completamente intocado.
 */

import fs from 'fs';
import path from 'path';
import {
  TaskReminderService,
  DEFAULT_FAMILY_TIMEZONE,
  REMINDER_LEAD_TIME_MS,
  SCHEDULER_WINDOW_BEFORE_MS,
  SCHEDULER_WINDOW_AFTER_MS
} from '../services/taskReminderService';

export async function runNotifications1cHf3Tests(): Promise<{
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
      results.push({ testName: `Notifications-1C-HF3 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({
        testName: `Notifications-1C-HF3 ${id}: ${name}`,
        passed: false,
        message: err?.message || String(err)
      });
    }
  }

  // HF3-01: Cálculo de candidateDates no meio do dia (America/Sao_Paulo)
  await record('HF3-01', 'cálculo de candidateDates no meio do dia (America/Sao_Paulo)', () => {
    // 14:15 em São Paulo (UTC-3) -> 17:15 UTC
    const refTime = new Date('2026-10-08T17:15:00.000Z');
    const dates = TaskReminderService.getCandidateDates(
      refTime,
      'America/Sao_Paulo',
      REMINDER_LEAD_TIME_MS,
      SCHEDULER_WINDOW_BEFORE_MS,
      SCHEDULER_WINDOW_AFTER_MS
    );

    if (dates.length !== 1 || dates[0] !== '2026-10-08') {
      throw new Error(`Esperado ['2026-10-08'], obtido: ${JSON.stringify(dates)}`);
    }
  });

  // HF3-02: Cálculo de candidateDates na virada da meia-noite (23:55)
  await record('HF3-02', 'cálculo de candidateDates na virada da meia-noite (23:55 em São Paulo)', () => {
    // 23:55 em São Paulo no dia 2026-10-08 -> 2026-10-09T02:55:00.000Z
    const refTime = new Date('2026-10-09T02:55:00.000Z');
    const dates = TaskReminderService.getCandidateDates(
      refTime,
      'America/Sao_Paulo',
      REMINDER_LEAD_TIME_MS,
      SCHEDULER_WINDOW_BEFORE_MS,
      SCHEDULER_WINDOW_AFTER_MS
    );

    if (!dates.includes('2026-10-08') || !dates.includes('2026-10-09')) {
      throw new Error(`Esperado conter '2026-10-08' e '2026-10-09', obtido: ${JSON.stringify(dates)}`);
    }
    if (dates.length !== 2) {
      throw new Error(`Esperado exatamente 2 datas na transição de meia-noite, obtido: ${JSON.stringify(dates)}`);
    }
  });

  // HF3-03: Cálculo de candidateDates logo após a meia-noite (00:05)
  await record('HF3-03', 'cálculo de candidateDates logo após a meia-noite (00:05 em São Paulo)', () => {
    // 00:05 em São Paulo no dia 2026-10-09 -> 2026-10-09T03:05:00.000Z
    const refTime = new Date('2026-10-09T03:05:00.000Z');
    const dates = TaskReminderService.getCandidateDates(
      refTime,
      'America/Sao_Paulo',
      REMINDER_LEAD_TIME_MS,
      SCHEDULER_WINDOW_BEFORE_MS,
      SCHEDULER_WINDOW_AFTER_MS
    );

    // O início da janela (refTime - 10 min) é 23:55 de 2026-10-08
    if (!dates.includes('2026-10-08') || !dates.includes('2026-10-09')) {
      throw new Error(`Esperado conter '2026-10-08' e '2026-10-09', obtido: ${JSON.stringify(dates)}`);
    }
    if (dates.length !== 2) {
      throw new Error(`Esperado exatamente 2 datas na transição de meia-noite, obtido: ${JSON.stringify(dates)}`);
    }
  });

  // HF3-04: formatDateInTimeZone monta formato YYYY-MM-DD via formatToParts sem depender de locale
  await record('HF3-04', 'formatDateInTimeZone monta formato YYYY-MM-DD via formatToParts', () => {
    const d1 = new Date('2026-01-05T12:00:00.000Z'); // mês e dia de um dígito
    const str1 = TaskReminderService.formatDateInTimeZone(d1, 'UTC');
    if (str1 !== '2026-01-05') {
      throw new Error(`Esperado '2026-01-05', obtido: ${str1}`);
    }

    const regexIso = /^\d{4}-\d{2}-\d{2}$/;
    if (!regexIso.test(str1)) {
      throw new Error(`Formato não aderente a YYYY-MM-DD: ${str1}`);
    }

    // Fuso com offset positivo
    const dTokyo = new Date('2026-10-08T15:30:00.000Z'); // 00:30 do dia 09 em Tóquio (UTC+9)
    const strTokyo = TaskReminderService.formatDateInTimeZone(dTokyo, 'Asia/Tokyo');
    if (strTokyo !== '2026-10-09') {
      throw new Error(`Esperado '2026-10-09' em Tóquio, obtido: ${strTokyo}`);
    }
  });

  function createHf3MockDb(options: {
    assignments: any[];
    onWhereQuery?: (field: string, op: string, val: any) => void;
  }) {
    const remindersStore: Record<string, any> = {};

    return {
      collection: (col: string) => {
        if (col === 'families') {
          return {
            doc: (fId: string) => ({
              collection: (subCol: string) => {
                if (subCol === 'assignments') {
                  return {
                    where: (field: string, op: string, val: any) => {
                      if (options.onWhereQuery) {
                        options.onWhereQuery(field, op, val);
                      }
                      let matching = options.assignments.filter(asg => {
                        const v = asg[field];
                        if (op === 'in' && Array.isArray(val)) return val.includes(v);
                        if (op === '==') return v === val;
                        return false;
                      });
                      return {
                        get: async () => ({
                          size: matching.length,
                          docs: matching.map(d => ({
                            id: d.id,
                            data: () => d
                          }))
                        })
                      };
                    }
                  };
                }
                if (subCol === 'members') {
                  return {
                    doc: () => ({
                      get: async () => ({
                        exists: true,
                        data: () => ({ userId: 'user-mock-1', name: 'Mock Member' })
                      })
                    })
                  };
                }
                if (subCol === 'familyTasks') {
                  return {
                    doc: () => ({
                      get: async () => ({
                        exists: true,
                        data: () => ({ title: 'Mock Task' })
                      })
                    })
                  };
                }
                throw new Error(`Unexpected subcol ${subCol}`);
              }
            })
          };
        }
        if (col === 'users') {
          return {
            doc: () => ({
              collection: () => ({
                where: () => ({
                  get: async () => ({
                    size: 1,
                    docs: [{ id: 'dev-1', exists: true, data: () => ({ active: true, token: 'tok-mock' }) }]
                  })
                })
              })
            })
          };
        }
        if (col === 'notificationReminders') {
          return {
            doc: (docId: string) => ({
              get: async () => ({
                id: docId,
                exists: Boolean(remindersStore[docId]),
                data: () => remindersStore[docId] || {}
              }),
              set: async (data: any) => {
                remindersStore[docId] = { ...data };
              },
              update: async (data: any) => {
                remindersStore[docId] = { ...(remindersStore[docId] || {}), ...data };
              }
            })
          };
        }
        throw new Error(`Unexpected collection ${col}`);
      },
      runTransaction: async (updateFn: any) => {
        const tx = {
          get: async (docRef: any) => docRef.get(),
          set: (docRef: any, data: any) => docRef.set(data),
          update: (docRef: any, data: any) => docRef.update(data)
        };
        return updateFn(tx);
      }
    };
  }

  // HF3-05: Deduplicação de assignments com scheduled_date e dueDate idênticos
  await record('HF3-05', 'deduplicação de assignments com scheduled_date e dueDate idênticos', async () => {
    const famId = 'fam-dup-01';
    const asgId = 'asg-dup-01';
    const refTime = new Date('2026-10-08T17:15:00.000Z'); // 14:15 em SP

    let scheduledQueryCount = 0;
    let dueDateQueryCount = 0;

    const mockDb = createHf3MockDb({
      assignments: [
        {
          id: asgId,
          family_id: famId,
          member_id: 'mem-dup',
          scheduled_date: '2026-10-08',
          dueDate: '2026-10-08',
          scheduled_start: '14:30',
          status: 'SCHEDULED'
        }
      ],
      onWhereQuery: (field) => {
        if (field === 'scheduled_date') scheduledQueryCount++;
        if (field === 'dueDate') dueDateQueryCount++;
      }
    });

    const mockMessaging: any = {
      send: async () => 'fcm-msg-id-123'
    };

    const res = await TaskReminderService.processFamilyReminders({
      familyId: famId,
      familyData: { timezone: 'America/Sao_Paulo', active: true },
      firestoreDb: mockDb,
      messaging: mockMessaging,
      referenceTime: refTime
    });

    if (scheduledQueryCount !== 1 || dueDateQueryCount !== 1) {
      throw new Error(`Esperado 1 query de scheduled_date e 1 de dueDate. Obtido: scheduled=${scheduledQueryCount}, dueDate=${dueDateQueryCount}`);
    }

    if (res.candidatesEvaluated !== 1) {
      throw new Error(`Esperado exatamente 1 candidato avaliado após deduplicação, obtido: ${res.candidatesEvaluated}`);
    }

    if (res.remindersSent !== 1) {
      throw new Error(`Esperado 1 reminder enviado, obtido: ${res.remindersSent}`);
    }
  });

  // HF3-06: Compatibilidade legada — assignment contendo apenas dueDate
  await record('HF3-06', 'compatibilidade legada com assignment contendo apenas dueDate', async () => {
    const famId = 'fam-legacy-01';
    const asgId = 'asg-legacy-01';
    const refTime = new Date('2026-10-08T17:15:00.000Z'); // 14:15 em SP

    const mockDb = createHf3MockDb({
      assignments: [
        {
          id: asgId,
          family_id: famId,
          member_id: 'mem-leg',
          dueDate: '2026-10-08',
          // Sem scheduled_date
          scheduled_start: '14:30',
          status: 'SCHEDULED'
        }
      ]
    });

    const mockMessaging: any = { send: async () => 'fcm-legacy-ok' };

    const res = await TaskReminderService.processFamilyReminders({
      familyId: famId,
      familyData: { timezone: 'America/Sao_Paulo', active: true },
      firestoreDb: mockDb,
      messaging: mockMessaging,
      referenceTime: refTime
    });

    if (res.candidatesEvaluated !== 1) {
      throw new Error(`Esperado 1 candidato avaliado via dueDate legada, obtido: ${res.candidatesEvaluated}`);
    }
    if (res.remindersSent !== 1) {
      throw new Error(`Esperado 1 reminder enviado para dueDate legada, obtido: ${res.remindersSent}`);
    }
  });

  // HF3-07: Assignment moderno contendo apenas scheduled_date
  await record('HF3-07', 'assignment moderno contendo apenas scheduled_date', async () => {
    const famId = 'fam-mod-01';
    const asgId = 'asg-mod-01';
    const refTime = new Date('2026-10-08T17:15:00.000Z');

    const mockDb = createHf3MockDb({
      assignments: [
        {
          id: asgId,
          family_id: famId,
          member_id: 'mem-mod',
          scheduled_date: '2026-10-08',
          // Sem dueDate
          scheduled_start: '14:30',
          status: 'SCHEDULED'
        }
      ]
    });

    const mockMessaging: any = { send: async () => 'fcm-mod-ok' };

    const res = await TaskReminderService.processFamilyReminders({
      familyId: famId,
      familyData: { timezone: 'America/Sao_Paulo', active: true },
      firestoreDb: mockDb,
      messaging: mockMessaging,
      referenceTime: refTime
    });

    if (res.candidatesEvaluated !== 1) {
      throw new Error(`Esperado 1 candidato moderno avaliado, obtido: ${res.candidatesEvaluated}`);
    }
    if (res.remindersSent !== 1) {
      throw new Error(`Esperado 1 reminder enviado, obtido: ${res.remindersSent}`);
    }
  });

  // HF3-08: Invariante estrita — NENHUMA consulta executa assignmentsRef.get() sem filtro
  await record('HF3-08', 'invariante estrita: nenhuma consulta executa assignmentsRef.get() sem filtro', async () => {
    let unfilteredGetCalled = false;
    let filteredQueryCount = 0;

    const mockDb: any = {
      collection: (col: string) => {
        if (col === 'families') {
          return {
            doc: () => ({
              collection: (subCol: string) => {
                if (subCol === 'assignments') {
                  return {
                    // SE for chamado sem filtro, sinaliza violação e lança erro!
                    get: async () => {
                      unfilteredGetCalled = true;
                      throw new Error('VIOLAÇÃO CRÍTICA: assignmentsRef.get() sem filtro foi invocado!');
                    },
                    where: (field: string, op: string, val: any) => {
                      filteredQueryCount++;
                      if (op !== 'in' || !Array.isArray(val)) {
                        throw new Error(`Operador inválido na consulta filtrada: op=${op}`);
                      }
                      return {
                        get: async () => ({ size: 0, docs: [] })
                      };
                    }
                  };
                }
                return {};
              }
            })
          };
        }
        return {};
      }
    };

    await TaskReminderService.processFamilyReminders({
      familyId: 'fam-trap',
      familyData: { timezone: 'America/Sao_Paulo', active: true },
      firestoreDb: mockDb,
      referenceTime: new Date()
    });

    if (unfilteredGetCalled) {
      throw new Error('assignmentsRef.get() sem filtro foi invocado durante a execução!');
    }

    if (filteredQueryCount !== 2) {
      throw new Error(`Esperado exatamente 2 consultas filtradas (.where), obtido: ${filteredQueryCount}`);
    }
  });

  // HF3-09: Propagação de erro de consulta Firestore
  await record('HF3-09', 'propagação de erro de consulta Firestore (Quota/Network)', async () => {
    const quotaError = new Error('RESOURCE_EXHAUSTED: Quota exceeded for firestore read operations');

    const mockDb: any = {
      collection: (col: string) => {
        if (col === 'families') {
          return {
            doc: () => ({
              collection: (subCol: string) => {
                if (subCol === 'assignments') {
                  return {
                    where: () => ({
                      get: async () => {
                        throw quotaError;
                      }
                    })
                  };
                }
                return {};
              }
            })
          };
        }
        return {};
      }
    };

    let caughtError: any = null;
    try {
      await TaskReminderService.processFamilyReminders({
        familyId: 'fam-err',
        familyData: { timezone: 'America/Sao_Paulo', active: true },
        firestoreDb: mockDb,
        referenceTime: new Date()
      });
    } catch (err: any) {
      caughtError = err;
    }

    if (!caughtError || !caughtError.message.includes('RESOURCE_EXHAUSTED')) {
      throw new Error(`Esperado erro de quota propagado, obtido: ${caughtError}`);
    }
  });

  // HF3-10: Consulta vazia retorna resultado normal limpo
  await record('HF3-10', 'consulta vazia retorna resultado normal limpo sem exceções', async () => {
    const mockDb: any = {
      collection: (col: string) => {
        if (col === 'families') {
          return {
            doc: () => ({
              collection: (subCol: string) => {
                if (subCol === 'assignments') {
                  return {
                    where: () => ({
                      get: async () => ({ size: 0, docs: [] })
                    })
                  };
                }
                return {};
              }
            })
          };
        }
        return {};
      }
    };

    const res = await TaskReminderService.processFamilyReminders({
      familyId: 'fam-empty',
      familyData: { timezone: 'America/Sao_Paulo', active: true },
      firestoreDb: mockDb,
      referenceTime: new Date()
    });

    if (res.candidatesEvaluated !== 0 || res.remindersSent !== 0 || res.remindersFailed !== 0) {
      throw new Error(`Esperado resultado 100% zerado para consulta vazia, obtido: ${JSON.stringify(res)}`);
    }
  });

  // HF3-11: Teste de regressão para timezone de família (America/New_York e Asia/Tokyo)
  await record('HF3-11', 'teste de regressão para timezone de família (America/New_York e Asia/Tokyo)', async () => {
    // 2026-10-08T15:00:00Z:
    // Em Nova York (UTC-4 no horário de verão): 11:00 AM -> data 2026-10-08
    // Em Tóquio (UTC+9): 00:00 AM (dia seguinte) -> data 2026-10-09
    const testInstant = new Date('2026-10-08T15:00:00.000Z');

    const nyDates = TaskReminderService.getCandidateDates(testInstant, 'America/New_York');
    const tokyoDates = TaskReminderService.getCandidateDates(testInstant, 'Asia/Tokyo');

    if (!nyDates.includes('2026-10-08')) {
      throw new Error(`Esperado que Nova York contenha '2026-10-08', obtido: ${JSON.stringify(nyDates)}`);
    }

    if (!tokyoDates.includes('2026-10-09')) {
      throw new Error(`Esperado que Tóquio contenha '2026-10-09', obtido: ${JSON.stringify(tokyoDates)}`);
    }
  });

  // HF3-12: Motor 2.0 permanece completamente intocado
  await record('HF3-12', 'Motor 2.0 permanece completamente intocado', () => {
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

  return { passed, failed, results };
}
