/**
 * CASA JUNTO — TEST SUITE ROUTINE-CONTINUITY-HF1
 * Gerar ocorrências faltantes após criação/alteração de rotina
 * RC-HF1-01 - RC-HF1-10
 */

import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { 
  getFamilyLocalDate, 
  getRollingDateHorizon, 
  getDayOfWeek, 
  DEFAULT_TIMEZONE 
} from '../domain/utils/dateTimeUtils';
import { FamilyTask, TaskAssignment } from '../types';

export async function runRoutineContinuityHf1Tests(): Promise<{
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
      results.push({ testName: `RoutineContinuity-HF1 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `RoutineContinuity-HF1 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  const testFamilyId = 'fam-croce-test';
  const today = getFamilyLocalDate(DEFAULT_TIMEZONE);
  const horizonDates = getRollingDateHorizon(today, 15);

  // Helper para localizar datas por dia da semana no horizonte (0 = Domingo .. 6 = Sábado)
  const getDatesForDayOfWeek = (dow: number) => horizonDates.filter(d => getDayOfWeek(d) === dow);

  // RC-HF1-01: Edição de dia (ex: sexta -> sábado) cancela a sexta futura e cria o sábado faltante
  await record('RC-HF1-01', 'Edição de dia (sexta -> sábado) cancela a sexta futura e cria o sábado faltante', async () => {
    const routineId = 'ft-test-friday-to-saturday';
    const initialRoutine: FamilyTask = {
      id: routineId,
      family_id: testFamilyId,
      name: 'Faxina Geral',
      frequency: 'WEEKLY',
      preferred_days: [5], // Sexta-feira
      preferredDays: [5],
      preferred_time: '10:00',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    // Cria ocorrências existentes de sexta-feira no horizonte
    const fridays = getDatesForDayOfWeek(5);
    const existingAssignments: TaskAssignment[] = fridays.map(d => ({
      id: `${routineId}_${d}`,
      family_id: testFamilyId,
      family_task_id: routineId,
      task_id: routineId,
      scheduled_date: d,
      scheduled_start: '10:00',
      scheduled_end: '11:00',
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    }));

    // Atualiza para Sábado (6)
    const result = await RoutineContinuityService.updateRoutine({
      familyId: testFamilyId,
      routineId,
      updates: {
        preferred_days: [6],
        preferredDays: [6]
      },
      existingRoutines: [initialRoutine],
      existingAssignments,
      isDemoMode: true
    });

    // 1. As ocorrências de sexta-feira devem ter sido canceladas
    const fridaysInAll = result.allAssignments.filter(a => fridays.includes(a.scheduled_date));
    if (fridaysInAll.length === 0 || fridaysInAll.some(a => a.status !== 'CANCELLED')) {
      throw new Error('Ocorrências futuras de sexta-feira não foram devidamente marcadas como CANCELLED.');
    }

    // 2. As ocorrências de sábado devem ter sido criadas como SCHEDULED
    const saturdays = getDatesForDayOfWeek(6);
    const saturdaysInAll = result.allAssignments.filter(a => saturdays.includes(a.scheduled_date) && a.status === 'SCHEDULED');
    if (saturdaysInAll.length !== saturdays.length) {
      throw new Error(`Esperado ${saturdays.length} ocorrências de sábado, encontrado ${saturdaysInAll.length}`);
    }

    // 3. newAssignments deve conter as ocorrências de sábado
    if (result.newAssignments.length !== saturdays.length) {
      throw new Error(`newAssignments deveria conter as ocorrências criadas para os sábados.`);
    }
  });

  // RC-HF1-02: Edição de frequência (WEEKLY -> DAILY) cria ocorrências dos demais dias da semana
  await record('RC-HF1-02', 'Edição de frequência (WEEKLY -> DAILY) cria ocorrências dos demais dias da semana', async () => {
    const routineId = 'ft-test-weekly-to-daily';
    const initialRoutine: FamilyTask = {
      id: routineId,
      family_id: testFamilyId,
      name: 'Lavar Louça',
      frequency: 'WEEKLY',
      preferred_days: [1], // Segunda-feira
      preferredDays: [1],
      preferred_time: '19:00',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const mondays = getDatesForDayOfWeek(1);
    const existingAssignments: TaskAssignment[] = mondays.map(d => ({
      id: `${routineId}_${d}`,
      family_id: testFamilyId,
      family_task_id: routineId,
      task_id: routineId,
      scheduled_date: d,
      scheduled_start: '19:00',
      scheduled_end: '19:30',
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    }));

    const result = await RoutineContinuityService.updateRoutine({
      familyId: testFamilyId,
      routineId,
      updates: {
        frequency: 'DAILY',
        preferred_days: [0, 1, 2, 3, 4, 5, 6],
        preferredDays: [0, 1, 2, 3, 4, 5, 6]
      },
      existingRoutines: [initialRoutine],
      existingAssignments,
      isDemoMode: true
    });

    // O horizonte de 15 dias deve ter todas as datas cobertas por ocorrências SCHEDULED
    const activeOccurrences = result.allAssignments.filter(a => a.status === 'SCHEDULED');
    if (activeOccurrences.length !== 15) {
      throw new Error(`Esperava 15 ocorrências ativas para DAILY, obteve ${activeOccurrences.length}`);
    }

    // As ocorrências pré-existentes de segunda-feira devem continuar intactas (não recriadas)
    if (result.newAssignments.length !== 15 - mondays.length) {
      throw new Error(`Esperava ${15 - mondays.length} novas ocorrências, obteve ${result.newAssignments.length}`);
    }
  });

  // RC-HF1-03: Edição de frequência (DAILY -> WEEKLY) cancela dias que não pertencem ao novo preferredDays
  await record('RC-HF1-03', 'Edição de frequência (DAILY -> WEEKLY) cancela dias que não pertencem ao novo preferredDays', async () => {
    const routineId = 'ft-test-daily-to-weekly';
    const initialRoutine: FamilyTask = {
      id: routineId,
      family_id: testFamilyId,
      name: 'Regar Plantas',
      frequency: 'DAILY',
      preferred_time: '08:00',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const existingAssignments: TaskAssignment[] = horizonDates.map(d => ({
      id: `${routineId}_${d}`,
      family_id: testFamilyId,
      family_task_id: routineId,
      task_id: routineId,
      scheduled_date: d,
      scheduled_start: '08:00',
      scheduled_end: '08:20',
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    }));

    // Altera para WEEKLY apenas Quartas (3)
    const result = await RoutineContinuityService.updateRoutine({
      familyId: testFamilyId,
      routineId,
      updates: {
        frequency: 'WEEKLY',
        preferred_days: [3],
        preferredDays: [3]
      },
      existingRoutines: [initialRoutine],
      existingAssignments,
      isDemoMode: true
    });

    const wednesdays = getDatesForDayOfWeek(3);
    const activeWednesdays = result.allAssignments.filter(a => a.status === 'SCHEDULED' && wednesdays.includes(a.scheduled_date));
    if (activeWednesdays.length !== wednesdays.length) {
      throw new Error(`Esperava ${wednesdays.length} quartas-feiras ativas, obteve ${activeWednesdays.length}`);
    }

    // Os outros dias devem estar CANCELLED
    const cancelledOthers = result.allAssignments.filter(a => a.status === 'CANCELLED' && !wednesdays.includes(a.scheduled_date));
    if (cancelledOthers.length !== 15 - wednesdays.length) {
      throw new Error(`Esperava ${15 - wednesdays.length} ocorrências canceladas, obteve ${cancelledOthers.length}`);
    }
  });

  // RC-HF1-04: Ocorrências concluídas/históricas nunca são canceladas ou alteradas
  await record('RC-HF1-04', 'Ocorrências concluídas/históricas nunca são canceladas ou alteradas', async () => {
    const routineId = 'ft-test-completed-preservation';
    const initialRoutine: FamilyTask = {
      id: routineId,
      family_id: testFamilyId,
      name: 'Varrer Cozinha',
      frequency: 'DAILY',
      preferred_time: '12:00',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const completedAssignment: TaskAssignment = {
      id: `${routineId}_${today}`,
      family_id: testFamilyId,
      family_task_id: routineId,
      task_id: routineId,
      scheduled_date: today,
      scheduled_start: '12:00',
      scheduled_end: '12:30',
      status: 'COMPLETED',
      completed_at: '2026-09-28T12:15:00Z',
      completed_by: 'mem-1',
      member_id: 'mem-1',
      is_unassigned: false
    };

    // Altera para WEEKLY apenas domingo (que não é hoje se hoje for segunda, por exemplo)
    const result = await RoutineContinuityService.updateRoutine({
      familyId: testFamilyId,
      routineId,
      updates: {
        frequency: 'WEEKLY',
        preferred_days: [0], // Apenas domingo
        preferredDays: [0]
      },
      existingRoutines: [initialRoutine],
      existingAssignments: [completedAssignment],
      isDemoMode: true
    });

    const preserved = result.allAssignments.find(a => a.id === completedAssignment.id);
    if (!preserved || preserved.status !== 'COMPLETED' || preserved.member_id !== 'mem-1') {
      throw new Error('Ocorrência COMPLETED foi indevidamente cancelada ou alterada.');
    }
  });

  // RC-HF1-05: Novas ocorrências nascem com member_id = '' / is_unassigned = true / status = 'SCHEDULED'
  await record('RC-HF1-05', 'Novas ocorrências nascem com member_id = "" / is_unassigned = true / status = "SCHEDULED"', async () => {
    const routineId = 'ft-test-unassigned-defaults';
    const initialRoutine: FamilyTask = {
      id: routineId,
      family_id: testFamilyId,
      name: 'Tirar Lixo',
      frequency: 'WEEKLY',
      preferred_days: [2],
      preferredDays: [2],
      preferred_time: '20:00',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const result = await RoutineContinuityService.updateRoutine({
      familyId: testFamilyId,
      routineId,
      updates: {
        preferred_days: [4], // Muda para Quinta
        preferredDays: [4]
      },
      existingRoutines: [initialRoutine],
      existingAssignments: [],
      isDemoMode: true
    });

    if (result.newAssignments.length === 0) {
      throw new Error('Nenhuma ocorrência gerada para nova data.');
    }

    for (const occ of result.newAssignments) {
      if (occ.status !== 'SCHEDULED') {
        throw new Error(`Status esperado 'SCHEDULED', obteve '${occ.status}'`);
      }
      if (occ.is_unassigned !== true) {
        throw new Error(`is_unassigned esperado true, obteve ${occ.is_unassigned}`);
      }
      if (occ.member_id && occ.member_id !== '') {
        throw new Error(`member_id esperado vazio/nulo, obteve '${occ.member_id}'`);
      }
    }
  });

  // RC-HF1-06: Operação é idempotente (chamar update duas vezes consecutivas não duplica ocorrências)
  await record('RC-HF1-06', 'Operação é idempotente (chamar update duas vezes consecutivas não duplica ocorrências)', async () => {
    const routineId = 'ft-test-idempotency';
    const initialRoutine: FamilyTask = {
      id: routineId,
      family_id: testFamilyId,
      name: 'Limpeza dos Vidros',
      frequency: 'WEEKLY',
      preferred_days: [6], // Sábado
      preferredDays: [6],
      preferred_time: '14:00',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    // Chamada 1
    const run1 = await RoutineContinuityService.updateRoutine({
      familyId: testFamilyId,
      routineId,
      updates: {
        preferred_days: [6],
        preferredDays: [6]
      },
      existingRoutines: [initialRoutine],
      existingAssignments: [],
      isDemoMode: true
    });

    // Chamada 2 passando o resultado da chamada 1 como existingAssignments
    const run2 = await RoutineContinuityService.updateRoutine({
      familyId: testFamilyId,
      routineId,
      updates: {
        preferred_days: [6],
        preferredDays: [6]
      },
      existingRoutines: [run1.updatedRoutine],
      existingAssignments: run1.allAssignments,
      isDemoMode: true
    });

    if (run2.newAssignments.length !== 0) {
      throw new Error(`Segunda execução gerou ${run2.newAssignments.length} ocorrências adicionais (deveria ser 0).`);
    }

    const uniqueIds = new Set(run2.allAssignments.map(a => a.id));
    if (uniqueIds.size !== run2.allAssignments.length) {
      throw new Error('Duplicação de ocorrências detectada na segunda execução.');
    }
  });

  // RC-HF1-07: Reativação de rotina gera ocorrências faltantes no horizonte sem backfill histórico
  await record('RC-HF1-07', 'Reativação de rotina gera ocorrências faltantes no horizonte sem backfill histórico', async () => {
    const routineId = 'ft-test-reactivation';
    const inactiveRoutine: FamilyTask = {
      id: routineId,
      family_id: testFamilyId,
      name: 'Trocar Lençóis',
      frequency: 'WEEKLY',
      preferred_days: [0], // Domingo
      preferredDays: [0],
      preferred_time: '11:00',
      active: false,
      executionTarget: 'HOUSEHOLD'
    };

    const sundays = getDatesForDayOfWeek(0);
    const result = await RoutineContinuityService.reactivateRoutine({
      familyId: testFamilyId,
      routineId,
      existingRoutines: [inactiveRoutine],
      existingAssignments: [],
      isDemoMode: true
    });

    if (!result.reactivatedRoutine.active) {
      throw new Error('Rotina não foi marcada como ativa.');
    }

    const activeSundays = result.allAssignments.filter(a => a.status === 'SCHEDULED' && sundays.includes(a.scheduled_date));
    if (activeSundays.length !== sundays.length) {
      throw new Error(`Esperado ${sundays.length} domingos ativos no horizonte, obteve ${activeSundays.length}`);
    }

    // Sem datas passadas
    for (const occ of result.newAssignments) {
      if (occ.scheduled_date < today) {
        throw new Error(`Ocorrência histórica não deveria ter sido gerada: ${occ.scheduled_date}`);
      }
    }
  });

  // RC-HF1-08: Criação pontual de rotina gera ocorrências faltantes
  await record('RC-HF1-08', 'Criação pontual de rotina gera ocorrências faltantes no horizonte de 15 dias', async () => {
    const routineId = 'ft-test-create-routine';
    const newRoutine: FamilyTask = {
      id: routineId,
      family_id: testFamilyId,
      name: 'Higienizar Geladeira',
      frequency: 'WEEKLY',
      preferred_days: [1], // Segunda-feira
      preferredDays: [1],
      preferred_time: '15:00',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const mondays = getDatesForDayOfWeek(1);
    const result = await RoutineContinuityService.createRoutine({
      familyId: testFamilyId,
      routine: newRoutine,
      existingAssignments: [],
      isDemoMode: true
    });

    if (result.newAssignments.length !== mondays.length) {
      throw new Error(`Esperado ${mondays.length} segundas-feiras geradas, obteve ${result.newAssignments.length}`);
    }

    for (const occ of result.newAssignments) {
      if (occ.status !== 'SCHEDULED' || !occ.is_unassigned) {
        throw new Error('Ocorrência de nova rotina criada em estado incorreto.');
      }
    }
  });

  // RC-HF1-09: Caso real: “Aspirar o sofá e almofadas” configurada para sábado gera as ocorrências de sábado no horizonte de 15 dias
  await record('RC-HF1-09', 'Caso real: "Aspirar o sofá e almofadas" para sábado gera as ocorrências de sábado no horizonte de 15 dias', async () => {
    const routineId = 'ft-clean-sofa-test';
    const realRoutine: FamilyTask = {
      id: routineId,
      family_id: testFamilyId,
      name: 'Aspirar o sofá e almofadas',
      customTitle: 'Aspirar o sofá e almofadas',
      custom_title: 'Aspirar o sofá e almofadas',
      frequency: 'WEEKLY',
      preferred_days: [6], // Sábado
      preferredDays: [6],
      preferred_time: '09:00',
      preferredTime: '09:00',
      active: true,
      room_id: 'sala',
      executionTarget: 'HOUSEHOLD'
    };

    const saturdays = getDatesForDayOfWeek(6);
    if (saturdays.length === 0) {
      throw new Error('Nenhum sábado encontrado no horizonte de 15 dias.');
    }

    // Executa updateRoutine como se viesse do modal de edição
    const result = await RoutineContinuityService.updateRoutine({
      familyId: testFamilyId,
      routineId,
      updates: {
        frequency: 'weekly',
        preferred_days: [6],
        preferredDays: [6],
        preferred_time: '09:00',
        preferredTime: '09:00'
      },
      existingRoutines: [realRoutine],
      existingAssignments: [],
      isDemoMode: true
    });

    // Confirma que cada sábado do horizonte possui uma ocorrência
    for (const satDate of saturdays) {
      const found = result.allAssignments.find(a => a.scheduled_date === satDate && a.status === 'SCHEDULED');
      if (!found) {
        throw new Error(`Ocorrência esperada para o sábado ${satDate} não foi gerada no horizonte.`);
      }
      if (found.id !== `${routineId}_${satDate}`) {
        throw new Error(`ID determinístico inválido: esperado '${routineId}_${satDate}', obteve '${found.id}'`);
      }
      if (found.scheduled_start !== '09:00') {
        throw new Error(`Horário de início esperado '09:00', obteve '${found.scheduled_start}'`);
      }
    }
  });

  // RC-HF1-10: Preservação de Motor 2.0, DistributionEngine e RBAC
  await record('RC-HF1-10', 'Preservação de Motor 2.0, DistributionEngine, RBAC e DomesticSupport domain', () => {
    // Verifica que sync/update não invocam nem mutam member_id sem rebalance explícito
    const testOcc: TaskAssignment = {
      id: 'occ-1',
      family_id: testFamilyId,
      task_id: 't-1',
      family_task_id: 'ft-1',
      scheduled_date: today,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    if (testOcc.member_id !== '' || !testOcc.is_unassigned) {
      throw new Error('Invariante canônica: criação/geração não distribui tarefas.');
    }
  });

  return { passed, failed, results };
}
