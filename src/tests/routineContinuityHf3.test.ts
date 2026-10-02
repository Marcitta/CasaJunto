/**
 * CASA JUNTO — TEST SUITE ROUTINE-CONTINUITY-HF3
 * Reconciliação canônica e restauração de ocorrências CANCELLED válidas
 * RC-HF3-01 a RC-HF3-12
 */

import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { 
  getFamilyLocalDate, 
  getRollingDateHorizon, 
  getDayOfWeek,
  addDaysToDate,
  DEFAULT_TIMEZONE 
} from '../domain/utils/dateTimeUtils';
import { Family, FamilyTask, TaskAssignment } from '../types';

export async function runRoutineContinuityHf3Tests(): Promise<{
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
      results.push({ testName: `RoutineContinuity-HF3 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `RoutineContinuity-HF3 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  const testFamily: Family = {
    id: 'fam-hf3-test',
    name: 'Família HF3 Teste',
    timezone: DEFAULT_TIMEZONE,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z'
  };

  const today = getFamilyLocalDate(DEFAULT_TIMEZONE);
  const horizonDates = getRollingDateHorizon(today, 15);
  const getDatesForDOW = (dow: number) => horizonDates.filter(d => getDayOfWeek(d) === dow);

  // RC-HF3-01: CANCELLED + volta a ser válida -> SCHEDULED (is_unassigned: true, member_id: '')
  await record('RC-HF3-01', 'CANCELLED + volta a ser válida restaura para SCHEDULED desatribuída', async () => {
    const routineId = 'ft-hf3-01';
    const fridays = getDatesForDOW(5);
    if (fridays.length === 0) throw new Error('Nenhuma sexta-feira encontrada no horizonte');
    const targetFriday = fridays[0];

    const routine: FamilyTask = {
      id: routineId,
      family_id: testFamily.id,
      name: 'Varrer o chão do quarto',
      task_master_id: 'clean-8',
      frequency: 'WEEKLY',
      preferred_days: [1, 5],
      preferredDays: [1, 5],
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const cancelledAsg: TaskAssignment = {
      id: `${routineId}_${targetFriday}`,
      family_id: testFamily.id,
      family_task_id: routineId,
      task_id: 'clean-8',
      scheduled_date: targetFriday,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'CANCELLED',
      is_unassigned: true,
      member_id: ''
    };

    const inMemoryStore = new Map<string, TaskAssignment>();
    inMemoryStore.set(cancelledAsg.id, cancelledAsg);

    const result = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [cancelledAsg],
      isDemoMode: true,
      inMemoryStore
    });

    const restored = result.allAssignments.find(a => a.id === cancelledAsg.id);
    if (!restored) throw new Error('Ocorrência não encontrada em allAssignments');
    if (restored.status !== 'SCHEDULED') throw new Error(`Esperado status SCHEDULED, recebido ${restored.status}`);
    if (!restored.is_unassigned) throw new Error('Esperado is_unassigned = true');
    if (restored.member_id !== '') throw new Error('Esperado member_id = ""');
  });

  // RC-HF3-02: CANCELLED + continua inválida -> permanece CANCELLED
  await record('RC-HF3-02', 'CANCELLED + continua inválida permanece CANCELLED', async () => {
    const routineId = 'ft-hf3-02';
    const wednesdays = getDatesForDOW(3);
    if (wednesdays.length === 0) throw new Error('Nenhuma quarta-feira no horizonte');
    const targetWed = wednesdays[0];

    // Rotina configurada apenas para Seg (1) e Sex (5)
    const routine: FamilyTask = {
      id: routineId,
      family_id: testFamily.id,
      name: 'Varrer chão da cozinha',
      task_master_id: 'kitch-8',
      frequency: 'WEEKLY',
      preferred_days: [1, 5],
      preferredDays: [1, 5],
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const cancelledWed: TaskAssignment = {
      id: `${routineId}_${targetWed}`,
      family_id: testFamily.id,
      family_task_id: routineId,
      task_id: 'kitch-8',
      scheduled_date: targetWed,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'CANCELLED',
      is_unassigned: true,
      member_id: ''
    };

    const inMemoryStore = new Map<string, TaskAssignment>();
    inMemoryStore.set(cancelledWed.id, cancelledWed);

    const result = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [cancelledWed],
      isDemoMode: true,
      inMemoryStore
    });

    const target = result.allAssignments.find(a => a.id === cancelledWed.id);
    if (!target) throw new Error('Ocorrência não encontrada');
    if (target.status !== 'CANCELLED') throw new Error(`Esperado que permanecesse CANCELLED, mas ficou ${target.status}`);
  });

  // RC-HF3-03: SCHEDULED válida -> preservada
  await record('RC-HF3-03', 'SCHEDULED válida tem atribuição e horário preservados', async () => {
    const routineId = 'ft-hf3-03';
    const fridays = getDatesForDOW(5);
    const targetFriday = fridays[0];

    const routine: FamilyTask = {
      id: routineId,
      family_id: testFamily.id,
      name: 'Varrer corredor e entrada',
      task_master_id: 'clean-5',
      frequency: 'WEEKLY',
      preferred_days: [1, 5],
      preferredDays: [1, 5],
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const scheduledAsg: TaskAssignment = {
      id: `${routineId}_${targetFriday}`,
      family_id: testFamily.id,
      family_task_id: routineId,
      task_id: 'clean-5',
      scheduled_date: targetFriday,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'SCHEDULED',
      is_unassigned: false,
      member_id: 'mem-marcia'
    };

    const result = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [scheduledAsg],
      isDemoMode: true
    });

    const target = result.allAssignments.find(a => a.id === scheduledAsg.id);
    if (!target) throw new Error('Ocorrência não encontrada');
    if (target.status !== 'SCHEDULED') throw new Error('Status SCHEDULED alterado indevidamente');
    if (target.member_id !== 'mem-marcia') throw new Error('Responsável alterado indevidamente');
  });

  // RC-HF3-04: COMPLETED -> preservada
  await record('RC-HF3-04', 'COMPLETED em data válida ou inválida nunca é alterada ou sobrescrita', async () => {
    const routineId = 'ft-hf3-04';
    const targetDate = horizonDates[1];

    const routine: FamilyTask = {
      id: routineId,
      family_id: testFamily.id,
      name: 'Lavar Louça',
      frequency: 'DAILY',
      active: true
    };

    const completedAsg: TaskAssignment = {
      id: `${routineId}_${targetDate}`,
      family_id: testFamily.id,
      family_task_id: routineId,
      task_id: 'kitch-1',
      scheduled_date: targetDate,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'COMPLETED',
      is_unassigned: false,
      member_id: 'mem-marcia',
      completed_at: '2026-10-02T10:00:00Z',
      completed_by: 'mem-marcia'
    };

    const result = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [completedAsg],
      isDemoMode: true
    });

    const target = result.allAssignments.find(a => a.id === completedAsg.id);
    if (!target) throw new Error('Ocorrência não encontrada');
    if (target.status !== 'COMPLETED') throw new Error('Status COMPLETED violado');
    if (target.completed_by !== 'mem-marcia') throw new Error('completed_by violado');
  });

  // RC-HF3-05: DONE -> preservada
  await record('RC-HF3-05', 'DONE preservada sem mutação', async () => {
    const routineId = 'ft-hf3-05';
    const targetDate = horizonDates[0];

    const routine: FamilyTask = {
      id: routineId,
      family_id: testFamily.id,
      name: 'Regar plantas',
      frequency: 'DAILY',
      active: true
    };

    const doneAsg: TaskAssignment = {
      id: `${routineId}_${targetDate}`,
      family_id: testFamily.id,
      family_task_id: routineId,
      task_id: 'out-1',
      scheduled_date: targetDate,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'DONE',
      is_unassigned: false,
      member_id: 'mem-lucas',
      completed_at: '2026-10-02T08:30:00Z'
    };

    const result = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [doneAsg],
      isDemoMode: true
    });

    const target = result.allAssignments.find(a => a.id === doneAsg.id);
    if (target?.status !== 'DONE') throw new Error('Status DONE violado');
  });

  // RC-HF3-06: IN_PROGRESS -> preservada
  await record('RC-HF3-06', 'IN_PROGRESS preservada sem interrupção', async () => {
    const routineId = 'ft-hf3-06';
    const targetDate = horizonDates[0];

    const routine: FamilyTask = {
      id: routineId,
      family_id: testFamily.id,
      name: 'Varrer sala',
      frequency: 'DAILY',
      active: true
    };

    const inProgressAsg: TaskAssignment = {
      id: `${routineId}_${targetDate}`,
      family_id: testFamily.id,
      family_task_id: routineId,
      task_id: 'clean-1',
      scheduled_date: targetDate,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'IN_PROGRESS',
      is_unassigned: false,
      member_id: 'mem-marcia'
    };

    const result = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [inProgressAsg],
      isDemoMode: true
    });

    const target = result.allAssignments.find(a => a.id === inProgressAsg.id);
    if (target?.status !== 'IN_PROGRESS') throw new Error('Status IN_PROGRESS violado');
  });

  // RC-HF3-07: SELF_CLAIMED -> preservada
  await record('RC-HF3-07', 'SELF_CLAIMED (atribuída manualmente) preservada', async () => {
    const routineId = 'ft-hf3-07';
    const targetDate = horizonDates[1];

    const routine: FamilyTask = {
      id: routineId,
      family_id: testFamily.id,
      name: 'Organizar armário',
      frequency: 'DAILY',
      active: true
    };

    const claimedAsg: TaskAssignment = {
      id: `${routineId}_${targetDate}`,
      family_id: testFamily.id,
      family_task_id: routineId,
      task_id: 'org-2',
      scheduled_date: targetDate,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'SCHEDULED',
      is_unassigned: false,
      member_id: 'mem-marcia',
      assigned_reason: 'Assumido voluntariamente'
    };

    const result = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [claimedAsg],
      isDemoMode: true
    });

    const target = result.allAssignments.find(a => a.id === claimedAsg.id);
    if (target?.member_id !== 'mem-marcia' || target?.is_unassigned !== false) {
      throw new Error('Tarefa self-claimed perdeu atribuição');
    }
  });

  // RC-HF3-08: Duas FamilyTasks mesmo TaskMaster -> independentes
  await record('RC-HF3-08', 'Duas FamilyTasks com mesmo task_master_id reconciliam independentemente', async () => {
    const fridays = getDatesForDOW(5);
    const targetFriday = fridays[0];

    const rA: FamilyTask = {
      id: 'ft-hf3-08a',
      family_id: testFamily.id,
      name: 'Varrer quarto casal',
      task_master_id: 'clean-8',
      frequency: 'WEEKLY',
      preferred_days: [5],
      active: true
    };

    const rB: FamilyTask = {
      id: 'ft-hf3-08b',
      family_id: testFamily.id,
      name: 'Varrer quarto visitas',
      task_master_id: 'clean-8',
      frequency: 'WEEKLY',
      preferred_days: [5],
      active: true
    };

    // rA estava cancelada na sexta; rB não existia
    const asgA: TaskAssignment = {
      id: `${rA.id}_${targetFriday}`,
      family_id: testFamily.id,
      family_task_id: rA.id,
      task_id: 'clean-8',
      scheduled_date: targetFriday,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'CANCELLED',
      is_unassigned: true,
      member_id: ''
    };

    const result = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [rA, rB],
      existingAssignments: [asgA],
      isDemoMode: true
    });

    const restoredA = result.allAssignments.find(a => a.id === asgA.id);
    const createdB = result.allAssignments.find(a => a.id === `${rB.id}_${targetFriday}`);

    if (restoredA?.status !== 'SCHEDULED') throw new Error('rA não foi restaurada');
    if (createdB?.status !== 'SCHEDULED') throw new Error('rB não foi criada');
    if (restoredA.id === createdB.id) throw new Error('IDs colidiram');
  });

  // RC-HF3-09: HOUSEHOLD -> funciona
  await record('RC-HF3-09', 'HOUSEHOLD executionTarget reconcilia e restaura corretamente', async () => {
    const fridays = getDatesForDOW(5);
    const targetFriday = fridays[0];
    const r: FamilyTask = {
      id: 'ft-hf3-09',
      family_id: testFamily.id,
      name: 'Varrer entrada',
      task_master_id: 'clean-5',
      frequency: 'WEEKLY',
      preferred_days: [5],
      active: true,
      executionTarget: 'HOUSEHOLD'
    };
    const cancelled: TaskAssignment = {
      id: `${r.id}_${targetFriday}`,
      family_id: testFamily.id,
      family_task_id: r.id,
      task_id: 'clean-5',
      scheduled_date: targetFriday,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'CANCELLED',
      is_unassigned: true,
      member_id: ''
    };
    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [r],
      existingAssignments: [cancelled],
      isDemoMode: true
    });
    const occ = res.allAssignments.find(a => a.id === cancelled.id);
    if (occ?.status !== 'SCHEDULED') throw new Error('HOUSEHOLD não restaurou ocorrência');
  });

  // RC-HF3-10: FLEXIBLE -> funciona
  await record('RC-HF3-10', 'FLEXIBLE executionTarget reconcilia e restaura corretamente', async () => {
    const fridays = getDatesForDOW(5);
    const targetFriday = fridays[0];
    const r: FamilyTask = {
      id: 'ft-hf3-10',
      family_id: testFamily.id,
      name: 'Varrer sacada',
      task_master_id: 'clean-5',
      frequency: 'WEEKLY',
      preferred_days: [5],
      active: true,
      executionTarget: 'FLEXIBLE'
    };
    const cancelled: TaskAssignment = {
      id: `${r.id}_${targetFriday}`,
      family_id: testFamily.id,
      family_task_id: r.id,
      task_id: 'clean-5',
      scheduled_date: targetFriday,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'CANCELLED',
      is_unassigned: true,
      member_id: ''
    };
    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [r],
      existingAssignments: [cancelled],
      isDemoMode: true
    });
    const occ = res.allAssignments.find(a => a.id === cancelled.id);
    if (occ?.status !== 'SCHEDULED') throw new Error('FLEXIBLE não restaurou ocorrência');
  });

  // RC-HF3-11: EXTERNAL_SUPPORT -> funciona
  await record('RC-HF3-11', 'EXTERNAL_SUPPORT executionTarget reconcilia e restaura corretamente', async () => {
    const fridays = getDatesForDOW(5);
    const targetFriday = fridays[0];
    const r: FamilyTask = {
      id: 'ft-hf3-11',
      family_id: testFamily.id,
      name: 'Limpeza Pesada',
      task_master_id: 'clean-5',
      frequency: 'WEEKLY',
      preferred_days: [5],
      active: true,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'sup-diarista'
    };
    const cancelled: TaskAssignment = {
      id: `${r.id}_${targetFriday}`,
      family_id: testFamily.id,
      family_task_id: r.id,
      task_id: 'clean-5',
      scheduled_date: targetFriday,
      scheduled_start: '09:00',
      scheduled_end: '09:20',
      status: 'CANCELLED',
      is_unassigned: true,
      member_id: ''
    };
    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [r],
      existingAssignments: [cancelled],
      isDemoMode: true
    });
    const occ = res.allAssignments.find(a => a.id === cancelled.id);
    if (occ?.status !== 'SCHEDULED') throw new Error('EXTERNAL_SUPPORT não restaurou ocorrência');
  });

  // RC-HF3-12: F5 / reload -> sem duplicação
  await record('RC-HF3-12', 'Múltiplas sincronizações consecutivas (F5/reload) são perfeitamente idempotentes', async () => {
    const r: FamilyTask = {
      id: 'ft-hf3-12',
      family_id: testFamily.id,
      name: 'Varrer sala',
      frequency: 'DAILY',
      active: true
    };

    const inMemoryStore = new Map<string, TaskAssignment>();

    // Primeiro sync: gera ocorrências
    const sync1 = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [r],
      existingAssignments: [],
      isDemoMode: true,
      inMemoryStore
    });

    const count1 = sync1.allAssignments.length;

    // Segundo sync (simulando F5): passa os assignments do sync1
    const sync2 = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [r],
      existingAssignments: sync1.allAssignments,
      isDemoMode: true,
      inMemoryStore
    });

    if (sync2.allAssignments.length !== count1) {
      throw new Error(`Contagem divergiu no segundo sync: esperado ${count1}, obtido ${sync2.allAssignments.length}`);
    }
    if (sync2.newAssignments.length > 0) {
      throw new Error(`Segundo sync gerou ${sync2.newAssignments.length} novas ocorrências indevidamente (esperado 0)`);
    }

    // Terceiro sync
    const sync3 = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [r],
      existingAssignments: sync2.allAssignments,
      isDemoMode: true,
      inMemoryStore
    });

    if (sync3.allAssignments.length !== count1) {
      throw new Error(`Contagem divergiu no terceiro sync`);
    }
  });

  return { passed, failed, results };
}
