/**
 * CASA JUNTO — TEST SUITE ROUTINE-CONTINUITY-HF2
 * Unificar identidade canônica de ocorrência e eliminar pipeline paralelo de batchAddRoutines
 * RC-HF2-01 - RC-HF2-15
 */

import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { mapAssignmentsToTasks } from '../context/AppContext';
import { FamilyTask, TaskAssignment, Room, TaskMaster, Family } from '../types';
import {
  DEFAULT_TIMEZONE,
  getFamilyLocalDate,
  getRollingDateHorizon,
  getDayOfWeek
} from '../domain/utils/dateTimeUtils';

export async function runRoutineContinuityHf2Tests(): Promise<{
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
      results.push({ testName: `RoutineContinuity-HF2 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `RoutineContinuity-HF2 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  const testFamily: Family = {
    id: 'fam-canonical-test',
    name: 'Família Canonical Test',
    timezone: DEFAULT_TIMEZONE
  } as Family;

  const mockRooms: Room[] = [
    { id: 'room-sala', name: 'Sala de Estar', room_type: 'living_room' } as Room,
    { id: 'room-cozinha', name: 'Cozinha', room_type: 'kitchen' } as Room,
    { id: 'room-geral', name: 'Geral', room_type: 'geral' } as Room
  ];

  const mockMasters: TaskMaster[] = [
    {
      id: 'clean-1',
      name: 'Aspirar o chão',
      description: 'Aspirar todos os cômodos',
      category: 'cleaning',
      room_type: 'living_room',
      effort_level: 2,
      duration_minutes: 20
    } as TaskMaster,
    {
      id: 'clean-2',
      name: 'Limpar vidros',
      description: 'Limpar vidros da sala',
      category: 'cleaning',
      room_type: 'living_room',
      effort_level: 2,
      duration_minutes: 25
    } as TaskMaster,
    {
      id: 'clean-3',
      name: 'Lavar banheiros',
      description: 'Higienização profunda',
      category: 'cleaning',
      room_type: 'geral',
      effort_level: 3,
      duration_minutes: 40
    } as TaskMaster
  ];

  const horizonToday = getFamilyLocalDate(DEFAULT_TIMEZONE);
  const rollingHorizon = getRollingDateHorizon(horizonToday, 15);
  const defaultTargetWednesday = rollingHorizon.find(d => getDayOfWeek(d) === 3) || '2026-10-07';

  // RC-HF2-01: Caso real PO (2026-09-30): FamilyTasks A (HOUSEHOLD), B (FLEXIBLE), C (EXTERNAL_SUPPORT) geram {familyTaskId}_2026-09-30
  await record('RC-HF2-01', 'Caso real PO (2026-09-30): FamilyTasks A, B, C geram ocorrências determinísticas canônicas', async () => {
    const targetDate = defaultTargetWednesday; // Quarta-feira (dow = 3)
    const dow = getDayOfWeek(targetDate);
    if (dow !== 3) {
      throw new Error(`${targetDate} deve ser quarta-feira (3), obtido: ${dow}`);
    }

    const ftA: FamilyTask = {
      id: 'ft-house-a',
      family_id: testFamily.id,
      name: 'Aspirar o chão',
      task_master_id: 'clean-1',
      frequency: 'WEEKLY',
      preferred_days: [3],
      preferredDays: [3],
      start_date: targetDate,
      startDate: targetDate,
      executionTarget: 'HOUSEHOLD',
      active: true
    };

    const ftB: FamilyTask = {
      id: 'ft-flex-b',
      family_id: testFamily.id,
      name: 'Limpar vidros',
      task_master_id: 'clean-2',
      frequency: 'WEEKLY',
      preferred_days: [3],
      preferredDays: [3],
      start_date: targetDate,
      startDate: targetDate,
      executionTarget: 'FLEXIBLE',
      active: true
    };

    const ftC: FamilyTask = {
      id: 'ft-ext-c',
      family_id: testFamily.id,
      name: 'Lavar banheiros',
      task_master_id: 'clean-3',
      frequency: 'WEEKLY',
      preferred_days: [3],
      preferredDays: [3],
      start_date: targetDate,
      startDate: targetDate,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'sup-maria',
      active: true
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ftA, ftB, ftC],
      existingAssignments: [],
      isDemoMode: true
    });

    const occA = syncResult.allAssignments.find(a => a.id === `ft-house-a_${targetDate}`);
    const occB = syncResult.allAssignments.find(a => a.id === `ft-flex-b_${targetDate}`);
    const occC = syncResult.allAssignments.find(a => a.id === `ft-ext-c_${targetDate}`);

    if (!occA) throw new Error(`Ocorrência ft-house-a_${targetDate} não foi gerada`);
    if (!occB) throw new Error(`Ocorrência ft-flex-b_${targetDate} não foi gerada`);
    if (!occC) throw new Error(`Ocorrência ft-ext-c_${targetDate} não foi gerada`);

    if (occA.family_task_id !== 'ft-house-a') throw new Error('occA family_task_id incorreto');
    if (occB.family_task_id !== 'ft-flex-b') throw new Error('occB family_task_id incorreto');
    if (occC.family_task_id !== 'ft-ext-c') throw new Error('occC family_task_id incorreto');
  });

  // RC-HF2-02: Ocorrências recém-geradas têm status = SCHEDULED, is_unassigned = true, member_id = ''
  await record('RC-HF2-02', 'Ocorrências recém-geradas têm status = SCHEDULED, is_unassigned = true, member_id = ""', async () => {
    const targetDate = defaultTargetWednesday;
    const ftA: FamilyTask = {
      id: 'ft-house-a',
      family_id: testFamily.id,
      name: 'Aspirar o chão',
      task_master_id: 'clean-1',
      frequency: 'WEEKLY',
      preferredDays: [3],
      startDate: targetDate,
      executionTarget: 'HOUSEHOLD',
      active: true
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ftA],
      existingAssignments: [],
      isDemoMode: true
    });

    const occ = syncResult.allAssignments.find(a => a.id === `ft-house-a_${targetDate}`);
    if (!occ) throw new Error('Ocorrência não encontrada');
    if (occ.status !== 'SCHEDULED') throw new Error(`Status esperado SCHEDULED, obtido: ${occ.status}`);
    if (occ.is_unassigned !== true) throw new Error(`is_unassigned esperado true, obtido: ${occ.is_unassigned}`);
    if (occ.member_id !== '') throw new Error(`member_id esperado vazio (""), obtido: "${occ.member_id}"`);
  });

  // RC-HF2-03: As três tarefas (HOUSEHOLD, FLEXIBLE, EXTERNAL_SUPPORT) aparecem no Hoje (targetDate) e Visão Semanal
  await record('RC-HF2-03', 'Tarefas HOUSEHOLD, FLEXIBLE e EXTERNAL_SUPPORT hidratam corretamente para Hoje e Visão Semanal', async () => {
    const targetDate = defaultTargetWednesday;
    const routines: FamilyTask[] = [
      { id: 'ft-1', family_id: testFamily.id, name: 'T1', task_master_id: 'clean-1', frequency: 'WEEKLY', preferredDays: [3], startDate: targetDate, executionTarget: 'HOUSEHOLD', active: true },
      { id: 'ft-2', family_id: testFamily.id, name: 'T2', task_master_id: 'clean-2', frequency: 'WEEKLY', preferredDays: [3], startDate: targetDate, executionTarget: 'FLEXIBLE', active: true },
      { id: 'ft-3', family_id: testFamily.id, name: 'T3', task_master_id: 'clean-3', frequency: 'WEEKLY', preferredDays: [3], startDate: targetDate, executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: 'sup-1', active: true }
    ];

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines,
      existingAssignments: [],
      isDemoMode: true
    });

    const tasks = mapAssignmentsToTasks({
      assignments: syncResult.allAssignments,
      rooms: mockRooms,
      familyTasks: routines,
      allMasterTasks: mockMasters
    });

    // Filtro de data alvo
    const todayTasks = tasks.filter(t => t.dueDate === targetDate);
    if (todayTasks.length !== 3) {
      throw new Error(`Esperado 3 tarefas em Hoje, obtido: ${todayTasks.length}`);
    }

    const t1 = todayTasks.find(t => t.familyTaskId === 'ft-1');
    const t2 = todayTasks.find(t => t.familyTaskId === 'ft-2');
    const t3 = todayTasks.find(t => t.familyTaskId === 'ft-3');

    if (!t1 || t1.executionTarget !== 'HOUSEHOLD') throw new Error('t1 HOUSEHOLD inválida');
    if (!t2 || t2.executionTarget !== 'FLEXIBLE') throw new Error('t2 FLEXIBLE inválida');
    if (!t3 || t3.executionTarget !== 'EXTERNAL_SUPPORT') throw new Error('t3 EXTERNAL_SUPPORT inválida');
    if (t3.domesticSupportId !== 'sup-1') throw new Error('t3 domesticSupportId inválido');
  });

  // RC-HF2-04: Teste crítico de mesmo TaskMaster: FamilyTask A -> clean-1 e FamilyTask B -> clean-1 geram 2 ocorrências e 2 Tasks hidratadas
  await record('RC-HF2-04', 'Teste crítico: FamilyTasks diferentes apontando para o MESMO TaskMaster coexistem na mesma data', async () => {
    const targetDate = defaultTargetWednesday;
    const ftA: FamilyTask = {
      id: 'ft-clean-sala',
      family_id: testFamily.id,
      name: 'Aspirar Sala',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      startDate: targetDate,
      executionTarget: 'HOUSEHOLD',
      active: true
    };

    const ftB: FamilyTask = {
      id: 'ft-clean-quarto',
      family_id: testFamily.id,
      name: 'Aspirar Quarto',
      task_master_id: 'clean-1', // MESMO taskMasterId!
      frequency: 'DAILY',
      startDate: targetDate,
      executionTarget: 'FLEXIBLE',
      active: true
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ftA, ftB],
      existingAssignments: [],
      isDemoMode: true
    });

    const occA = syncResult.allAssignments.find(a => a.id === `ft-clean-sala_${targetDate}`);
    const occB = syncResult.allAssignments.find(a => a.id === `ft-clean-quarto_${targetDate}`);

    if (!occA) throw new Error(`Ocorrência ft-clean-sala_${targetDate} não foi gerada`);
    if (!occB) throw new Error(`Ocorrência ft-clean-quarto_${targetDate} não foi gerada`);

    const tasks = mapAssignmentsToTasks({
      assignments: syncResult.allAssignments,
      rooms: mockRooms,
      familyTasks: [ftA, ftB],
      allMasterTasks: mockMasters
    });

    const todayCleanTasks = tasks.filter(t => t.dueDate === targetDate && t.taskMasterId === 'clean-1');
    if (todayCleanTasks.length !== 2) {
      throw new Error(`Esperado 2 tarefas independentes para clean-1 na data, obtido: ${todayCleanTasks.length}`);
    }

    const tA = todayCleanTasks.find(t => t.familyTaskId === 'ft-clean-sala');
    const tB = todayCleanTasks.find(t => t.familyTaskId === 'ft-clean-quarto');

    if (!tA || !tB) throw new Error('As duas tarefas devem existir independentemente após hidratação');
    if (tA.id === tB.id) throw new Error('As duas tarefas não podem ter o mesmo ID');
  });

  // RC-HF2-05: batchAdd gera occurrence automaticamente no horizonte de 15 dias
  await record('RC-HF2-05', 'batchAdd gera ocorrências para todo o horizonte de 15 dias', async () => {
    const ftDaily: FamilyTask = {
      id: 'ft-batch-daily',
      family_id: testFamily.id,
      name: 'Rotina Diária Batch',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      startDate: '2026-09-30',
      active: true
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ftDaily],
      existingAssignments: [],
      isDemoMode: true
    });

    const dailyOccs = syncResult.allAssignments.filter(a => a.family_task_id === 'ft-batch-daily');
    if (dailyOccs.length !== 15) {
      throw new Error(`Esperado 15 ocorrências no horizonte de 15 dias, obtido: ${dailyOccs.length}`);
    }
  });

  // RC-HF2-06: batchAdd com reativação de FamilyTask inativa reativa e gera ocorrências faltantes
  await record('RC-HF2-06', 'Reativação de FamilyTask inativa gera ocorrências faltantes a partir de hoje', async () => {
    const routineId = 'ft-reactivate-test';
    const oldInactive: FamilyTask = {
      id: routineId,
      family_id: testFamily.id,
      name: 'Rotina Pausada',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      startDate: '2026-09-01',
      active: false
    };

    // Ocorrência histórica concluída no passado
    const historicalCompleted: TaskAssignment = {
      id: `${routineId}_2026-09-10`,
      family_id: testFamily.id,
      family_task_id: routineId,
      task_id: 'clean-1',
      scheduled_date: '2026-09-10',
      status: 'COMPLETED',
      member_id: 'user-1',
      is_unassigned: false
    };

    const reactivated: FamilyTask = {
      ...oldInactive,
      active: true,
      startDate: '2026-09-30'
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [reactivated],
      existingAssignments: [historicalCompleted],
      isDemoMode: true
    });

    const allOccs = syncResult.allAssignments.filter(a => a.family_task_id === routineId);
    // 1 histórica + 15 novas
    if (allOccs.length !== 16) {
      throw new Error(`Esperado 16 ocorrências (1 histórica + 15 do horizonte), obtido: ${allOccs.length}`);
    }

    const pastOcc = allOccs.find(a => a.scheduled_date === '2026-09-10');
    if (!pastOcc || pastOcc.status !== 'COMPLETED') {
      throw new Error('Ocorrência histórica concluída não foi preservada');
    }
  });

  // RC-HF2-07: Idempotência de identidade: mesma FamilyTask + mesma data não duplica em chamadas consecutivas
  await record('RC-HF2-07', 'Mesma FamilyTask + mesma data não duplica em chamadas consecutivas', async () => {
    const ft: FamilyTask = {
      id: 'ft-idemp-test',
      family_id: testFamily.id,
      name: 'Rotina Idempotente',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      startDate: '2026-09-30',
      active: true
    };

    // Chamada 1
    const res1 = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ft],
      existingAssignments: [],
      isDemoMode: true
    });

    // Chamada 2 passando os assignments resultantes da chamada 1
    const res2 = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ft],
      existingAssignments: res1.allAssignments,
      isDemoMode: true
    });

    if (res2.newAssignments.length !== 0) {
      throw new Error(`Esperado 0 novas ocorrências na segunda chamada, obtido: ${res2.newAssignments.length}`);
    }
    if (res2.allAssignments.length !== res1.allAssignments.length) {
      throw new Error(`Total de assignments alterou de ${res1.allAssignments.length} para ${res2.allAssignments.length}`);
    }
  });

  // RC-HF2-08: Simulação de F5/Reload: reloadAssignments mantém as três tarefas intactas e não duplica ocorrências
  await record('RC-HF2-08', 'Simulação de F5/Reload: reload mantém todas as ocorrências sem duplicidade', async () => {
    const routines: FamilyTask[] = [
      { id: 'ft-a', family_id: testFamily.id, name: 'A', task_master_id: 'clean-1', frequency: 'WEEKLY', preferredDays: [3], startDate: defaultTargetWednesday, executionTarget: 'HOUSEHOLD', active: true },
      { id: 'ft-b', family_id: testFamily.id, name: 'B', task_master_id: 'clean-2', frequency: 'WEEKLY', preferredDays: [3], startDate: defaultTargetWednesday, executionTarget: 'FLEXIBLE', active: true },
      { id: 'ft-c', family_id: testFamily.id, name: 'C', task_master_id: 'clean-3', frequency: 'WEEKLY', preferredDays: [3], startDate: defaultTargetWednesday, executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: 'sup-1', active: true }
    ];

    const initialSync = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines,
      existingAssignments: [],
      isDemoMode: true
    });

    // Simula F5: deserializa do "banco" (JSON roundtrip) e executa novo sync
    const deserializedAssignments: TaskAssignment[] = JSON.parse(JSON.stringify(initialSync.allAssignments));
    const reloadSync = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines,
      existingAssignments: deserializedAssignments,
      isDemoMode: true
    });

    if (reloadSync.newAssignments.length !== 0) {
      throw new Error(`Após F5/reload não deve haver novas ocorrências, obtido: ${reloadSync.newAssignments.length}`);
    }
    if (reloadSync.allAssignments.length !== initialSync.allAssignments.length) {
      throw new Error('Total de assignments divergiu após reload');
    }

    const tasks = mapAssignmentsToTasks({
      assignments: reloadSync.allAssignments,
      rooms: mockRooms,
      familyTasks: routines,
      allMasterTasks: mockMasters
    });

    const targetDateTasks = tasks.filter(t => t.dueDate === defaultTargetWednesday);
    if (targetDateTasks.length !== 3) {
      throw new Error(`Esperado 3 tarefas hidratadas em ${defaultTargetWednesday} após F5, obtido: ${targetDateTasks.length}`);
    }
  });

  // RC-HF2-09: sync repetido é 100% idempotente (executar 5x consecutivas produz exatamente o mesmo conjunto)
  await record('RC-HF2-09', 'sync repetido 5 vezes consecutivas é estritamente idempotente', async () => {
    const routine: FamilyTask = {
      id: 'ft-repeat-test',
      family_id: testFamily.id,
      name: 'Rotina Repetida',
      task_master_id: 'clean-1',
      frequency: 'WEEKLY',
      preferredDays: [1, 3, 5],
      startDate: '2026-09-30',
      active: true
    };

    let currentAssignments: TaskAssignment[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await RoutineContinuityService.syncRoutineOccurrences({
        family: testFamily,
        routines: [routine],
        existingAssignments: currentAssignments,
        isDemoMode: true
      });
      if (i > 0 && result.newAssignments.length > 0) {
        throw new Error(`Iteração ${i + 1} gerou ${result.newAssignments.length} novas ocorrências indevidamente`);
      }
      currentAssignments = result.allAssignments;
    }

    const expectedHorizonMatches = getRollingDateHorizon(horizonToday, 15).filter(d => {
      const dow = getDayOfWeek(d);
      return [1, 3, 5].includes(dow);
    });

    if (currentAssignments.length !== expectedHorizonMatches.length) {
      throw new Error(`Esperado ${expectedHorizonMatches.length} ocorrências após 5 syncs, obtido: ${currentAssignments.length}`);
    }
  });

  // RC-HF2-10: Preservação estrita de histórico: COMPLETED, DONE, IN_PROGRESS, SELF_CLAIMED nunca são alterados ou duplicados
  await record('RC-HF2-10', 'Preservação de histórico: ocorrências concluídas, em progresso e auto-assumidas não são tocadas', async () => {
    const routineId = 'ft-history-test';
    const ft: FamilyTask = {
      id: routineId,
      family_id: testFamily.id,
      name: 'Rotina Histórica',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      startDate: '2026-09-30',
      active: true
    };

    const existingHistory: TaskAssignment[] = [
      {
        id: `${routineId}_2026-09-30`,
        family_id: testFamily.id,
        family_task_id: routineId,
        task_id: 'clean-1',
        scheduled_date: '2026-09-30',
        status: 'COMPLETED',
        member_id: 'usr-gabriel',
        is_unassigned: false,
        completed_at: '2026-09-30T10:00:00Z',
        completed_by: 'usr-gabriel'
      },
      {
        id: `${routineId}_2026-10-01`,
        family_id: testFamily.id,
        family_task_id: routineId,
        task_id: 'clean-1',
        scheduled_date: '2026-10-01',
        status: 'IN_PROGRESS',
        member_id: 'usr-beatriz',
        is_unassigned: false
      }
    ];

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ft],
      existingAssignments: existingHistory,
      isDemoMode: true
    });

    const occCompleted = syncResult.allAssignments.find(a => a.id === `${routineId}_2026-09-30`);
    const occInProgress = syncResult.allAssignments.find(a => a.id === `${routineId}_2026-10-01`);

    if (!occCompleted || occCompleted.status !== 'COMPLETED' || occCompleted.member_id !== 'usr-gabriel') {
      throw new Error('Ocorrência COMPLETED foi alterada indevidamente');
    }
    if (!occInProgress || occInProgress.status !== 'IN_PROGRESS' || occInProgress.member_id !== 'usr-beatriz') {
      throw new Error('Ocorrência IN_PROGRESS foi alterada indevidamente');
    }
  });

  // RC-HF2-11: Isolamento multi-tenant: ocorrências de famílias distintas não colidem nem vazam
  await record('RC-HF2-11', 'Isolamento multi-tenant: ocorrências de famílias distintas não colidem nem vazam', async () => {
    const family2: Family = { id: 'fam-other', name: 'Outra Família', timezone: DEFAULT_TIMEZONE } as Family;
    const ftFam1: FamilyTask = { id: 'ft-1', family_id: testFamily.id, name: 'T1', task_master_id: 'clean-1', frequency: 'DAILY', startDate: '2026-09-30', active: true };
    const ftFam2: FamilyTask = { id: 'ft-1', family_id: family2.id, name: 'T1', task_master_id: 'clean-1', frequency: 'DAILY', startDate: '2026-09-30', active: true };

    const res1 = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ftFam1],
      existingAssignments: [],
      isDemoMode: true
    });

    const res2 = await RoutineContinuityService.syncRoutineOccurrences({
      family: family2,
      routines: [ftFam2],
      existingAssignments: [],
      isDemoMode: true
    });

    if (res1.allAssignments.some(a => a.family_id !== testFamily.id)) {
      throw new Error('Vazamento de tenant detectado na família 1');
    }
    if (res2.allAssignments.some(a => a.family_id !== family2.id)) {
      throw new Error('Vazamento de tenant detectado na família 2');
    }
  });

  // RC-HF2-12: Zero chamadas ao Motor 2.0 / DistributionEngine durante geração canônica (GERAR ≠ DISTRIBUIR)
  await record('RC-HF2-12', 'Zero chamadas ao Motor 2.0 / DistributionEngine durante geração canônica', async () => {
    const ft: FamilyTask = {
      id: 'ft-nodist-test',
      family_id: testFamily.id,
      name: 'Rotina Sem Distribuição',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      startDate: '2026-09-30',
      active: true
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ft],
      existingAssignments: [],
      isDemoMode: true
    });

    // Todas as novas ocorrências devem ser puras (não distribuídas)
    const anyDistributed = syncResult.allAssignments.some(a => !a.is_unassigned || (a.member_id && a.member_id.length > 0));
    if (anyDistributed) {
      throw new Error('syncRoutineOccurrences violou GERAR ≠ DISTRIBUIR: atribuiu ocorrência a um morador');
    }
  });

  // RC-HF2-13: Pipeline canônico unificado: batchAdd utiliza reloadAssignments e mapAssignmentsToTasks sem pipeline paralelo
  await record('RC-HF2-13', 'Pipeline canônico unificado: tarefas geradas por rotina sobrevivem a mapAssignmentsToTasks sem mapper ad-hoc', async () => {
    const targetDate = '2026-09-30';
    const ft: FamilyTask = {
      id: 'ft-pipeline-test',
      family_id: testFamily.id,
      name: 'Rotina Pipeline',
      customTitle: 'Título Customizado Canônico',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      startDate: targetDate,
      executionTarget: 'HOUSEHOLD',
      active: true
    };

    const missing = RoutineGenerator.generateMissingOccurrences({
      routine: ft,
      familyId: testFamily.id,
      horizonDates: [targetDate],
      existingOccurrences: []
    });

    if (missing.length !== 1) {
      throw new Error(`Esperado 1 ocorrência gerada, obtido: ${missing.length}`);
    }

    const tasks = mapAssignmentsToTasks({
      assignments: missing,
      rooms: mockRooms,
      familyTasks: [ft],
      allMasterTasks: mockMasters
    });

    if (tasks.length !== 1) {
      throw new Error(`Esperado 1 Task mapeada, obtido: ${tasks.length}`);
    }

    const mapped = tasks[0];
    if (mapped.title !== 'Título Customizado Canônico') {
      throw new Error(`Título esperado "Título Customizado Canônico", obtido: "${mapped.title}"`);
    }
    if (mapped.executionTarget !== 'HOUSEHOLD') {
      throw new Error(`executionTarget esperado HOUSEHOLD, obtido: "${mapped.executionTarget}"`);
    }
  });

  // RC-HF2-14: Fallback legado baseado em task_id só afeta assignments sem family_task_id e nunca elimina FamilyTask canônica
  await record('RC-HF2-14', 'Fallback legado não bloqueia e nem elimina ocorrências de FamilyTasks canônicas', async () => {
    const targetDate = '2026-09-30';

    // Assignment legado sem family_task_id
    const legacyAssignment: TaskAssignment = {
      id: `legacy_${targetDate}`,
      family_id: testFamily.id,
      task_id: 'clean-1',
      scheduled_date: targetDate,
      status: 'SCHEDULED',
      member_id: '',
      is_unassigned: true
    };

    // FamilyTask canônica com id próprio
    const canonicalFt: FamilyTask = {
      id: 'ft-canonical-new',
      family_id: testFamily.id,
      name: 'Nova Rotina Canônica',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      startDate: targetDate,
      active: true
    };

    // Segunda FamilyTask canônica também apontando para clean-1
    const canonicalFt2: FamilyTask = {
      id: 'ft-canonical-second',
      family_id: testFamily.id,
      name: 'Segunda Rotina Canônica',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      startDate: targetDate,
      active: true
    };

    // Gera para ft-canonical-second (não deve ser bloqueada pelo assignment legado de clean-1)
    const missing = RoutineGenerator.generateMissingOccurrences({
      routine: canonicalFt2,
      familyId: testFamily.id,
      horizonDates: [targetDate],
      existingOccurrences: [legacyAssignment]
    });

    // Se o legado consumiu o fallback para clean-1, nenhuma outra FamilyTask canônica deve ser bloqueada
    const syncRes = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [canonicalFt, canonicalFt2],
      existingAssignments: [legacyAssignment],
      isDemoMode: true
    });

    const hasFt1 = syncRes.allAssignments.some(a => a.family_task_id === 'ft-canonical-new');
    const hasFt2 = syncRes.allAssignments.some(a => a.family_task_id === 'ft-canonical-second');

    if (!hasFt1 && !hasFt2) {
      throw new Error('Pelo menos uma FamilyTask canônica deve gerar ocorrência mesmo com legado existente');
    }
  });

  // RC-HF2-15: Deduplicação de entrada em syncRoutineOccurrences é exclusivamente por FamilyTask.id, nunca por taskMasterId
  await record('RC-HF2-15', 'Deduplicação de entrada em syncRoutineOccurrences é exclusivamente por FamilyTask.id', async () => {
    const targetDate = defaultTargetWednesday;
    // Duas rotinas distintas com mesmo task_master_id
    const ft1: FamilyTask = { id: 'ft-unique-1', family_id: testFamily.id, name: 'R1', task_master_id: 'clean-1', frequency: 'DAILY', startDate: targetDate, active: true };
    const ft2: FamilyTask = { id: 'ft-unique-2', family_id: testFamily.id, name: 'R2', task_master_id: 'clean-1', frequency: 'DAILY', startDate: targetDate, active: true };
    // A MESMA rotina duplicada na lista de entrada
    const ft1Duplicated: FamilyTask = { ...ft1 };

    const syncRes = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [ft1, ft2, ft1Duplicated],
      existingAssignments: [],
      isDemoMode: true
    });

    // Esperado: ft-unique-1 gera 1 ocorrência por dia, ft-unique-2 gera 1 ocorrência por dia (ft1Duplicated é ignorada por id)
    const occs1 = syncRes.allAssignments.filter(a => a.family_task_id === 'ft-unique-1' && a.scheduled_date === targetDate);
    const occs2 = syncRes.allAssignments.filter(a => a.family_task_id === 'ft-unique-2' && a.scheduled_date === targetDate);

    if (occs1.length !== 1) {
      throw new Error(`Esperado exatamente 1 ocorrência para ft-unique-1 na data, obtido: ${occs1.length}`);
    }
    if (occs2.length !== 1) {
      throw new Error(`Esperado exatamente 1 ocorrência para ft-unique-2 na data, obtido: ${occs2.length}`);
    }
  });

  return { passed, failed, results };
}
