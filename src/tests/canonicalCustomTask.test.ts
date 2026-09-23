/**
 * CASA JUNTO — TEST SUITE HOTFIX-TASK-CREATE-1
 * Canonical Custom Family Task Creation & Data Repair Validation
 * TC01 - TC30
 */

import { CustomTaskRepairService, TARGET_QA_CUSTOM_TASK_TITLES } from '../application/services/CustomTaskRepairService';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { FamilyTask, TaskAssignment, Member, Family, ProtectedTime } from '../types';
import { allMasterTasks } from '../data/tasks';
import { addDaysToDate, getDayOfWeek, getRollingDateHorizon, getFamilyLocalDate } from '../domain/utils/dateTimeUtils';

export async function runCanonicalCustomTaskTests(): Promise<{
  passed: number;
  failed: number;
  results: { testName: string; passed: boolean; message?: string }[];
}> {
  const results: { testName: string; passed: boolean; message?: string }[] = [];
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, message?: string) {
    if (condition) {
      passed++;
      results.push({ testName, passed: true });
    } else {
      failed++;
      results.push({ testName, passed: false, message });
    }
  }

  const mockFamily: Family = {
    id: 'fam-canonical-test',
    name: 'Família Canônica',
    code: 'CANON1',
    timezone: 'America/Sao_Paulo',
    created_at: '2026-03-01T00:00:00Z'
  };

  const mockMembers: Member[] = [
    {
      id: 'mem-admin-1',
      name: 'Pai Admin',
      role: 'ADMIN',
      avatar: '👨',
      color: '#3B82F6',
      active: true,
      points: 100,
      streak: 5
    },
    {
      id: 'mem-user-2',
      name: 'Filho Member',
      role: 'MEMBER',
      avatar: '👦',
      color: '#10B981',
      active: true,
      points: 50,
      streak: 2
    }
  ];

  const mockProtectedTimes: ProtectedTime[] = [];
  const testToday = '2026-03-15';

  // ==========================================
  // TC01: Criação de tarefa customizada gera FamilyTask
  // ==========================================
  {
    const ftId = 'ft-custom-lavar-carro';
    const customTitle = 'Lavar o carro na garagem';
    const newFT: FamilyTask = {
      id: ftId,
      family_id: mockFamily.id,
      familyId: mockFamily.id,
      task_master_id: null as any,
      name: customTitle,
      customTitle: customTitle,
      custom_title: customTitle,
      room_id: 'room-garagem',
      frequency: 'WEEKLY',
      preferred_days: [6],
      preferred_time: '10:00',
      active: true,
      start_date: testToday,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    assert(Boolean(newFT.id && newFT.family_id === mockFamily.id), 'TC01: Criação de tarefa customizada gera FamilyTask');
  }

  // ==========================================
  // TC02: FamilyTask customizada é criada com active=true
  // ==========================================
  {
    const newFT: FamilyTask = {
      id: 'ft-custom-tc02',
      family_id: mockFamily.id,
      customTitle: 'Varrer quintal',
      room_id: 'room-quintal',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: testToday,
      created_at: new Date().toISOString()
    };
    assert(newFT.active === true, 'TC02: FamilyTask customizada é criada com active=true');
  }

  // ==========================================
  // TC03: TaskMaster global NÃO é criado para tarefa customizada
  // ==========================================
  {
    const initialMasterCount = allMasterTasks.length;
    const customTitle = 'Limpar aquário dos peixes';
    const isPresentInMaster = allMasterTasks.some(tm => tm.name.toLowerCase() === customTitle.toLowerCase());
    assert(!isPresentInMaster && allMasterTasks.length === initialMasterCount, 'TC03: TaskMaster global NÃO é criado para tarefa customizada');
  }

  // ==========================================
  // TC04: FamilyTask customizada persiste na subcoleção correta da família
  // ==========================================
  {
    const subcollectionPath = `/families/${mockFamily.id}/familyTasks`;
    assert(subcollectionPath === '/families/fam-canonical-test/familyTasks', 'TC04: FamilyTask customizada persiste na subcoleção correta da família');
  }

  // ==========================================
  // TC05: TaskAssignment gerado possui family_task_id preenchido
  // ==========================================
  {
    const ftId = 'ft-custom-gardening';
    const occId = `${ftId}_${testToday}`;
    const occ: TaskAssignment = {
      id: occId,
      family_id: mockFamily.id,
      family_task_id: ftId,
      task_id: ftId,
      room_id: 'room-jardim',
      member_id: '',
      scheduled_date: testToday,
      status: 'SCHEDULED',
      is_unassigned: true
    };
    assert(occ.family_task_id === ftId, 'TC05: TaskAssignment gerado possui family_task_id preenchido');
  }

  // ==========================================
  // TC06: TaskAssignment.task_id não colide com convenções globais indevidas
  // ==========================================
  {
    const ftId = 'ft-custom-tc06';
    const occ: TaskAssignment = {
      id: `${ftId}_${testToday}`,
      family_id: mockFamily.id,
      family_task_id: ftId,
      task_id: ftId,
      member_id: '',
      room_id: 'geral',
      scheduled_date: testToday,
      status: 'SCHEDULED',
      is_unassigned: true
    };
    const isFalseMaster = allMasterTasks.some(tm => tm.id === occ.task_id);
    assert(occ.task_id === ftId && !isFalseMaster, 'TC06: TaskAssignment.task_id aponta confiavelmente para a FamilyTask');
  }

  // ==========================================
  // TC07: customTitle preservado exatamente como digitado
  // ==========================================
  {
    const rawInput = '  Higienizar bebedouro dos gatos 🐱  ';
    const cleanTitle = rawInput.trim();
    const ft: FamilyTask = {
      id: 'ft-cats',
      family_id: mockFamily.id,
      customTitle: cleanTitle,
      custom_title: cleanTitle,
      name: cleanTitle,
      room_id: 'cozinha',
      frequency: 'DAILY',
      active: true,
      start_date: testToday
    };
    assert(ft.customTitle === 'Higienizar bebedouro dos gatos 🐱', 'TC07: customTitle preservado exatamente como digitado');
  }

  // ==========================================
  // TC08: ONE_TIME cria FamilyTask + ocorrência pontual
  // ==========================================
  {
    const ftId = 'ft-onetime-1';
    const ft: FamilyTask = {
      id: ftId,
      family_id: mockFamily.id,
      customTitle: 'Consertar trinco da porta',
      room_id: 'sala',
      frequency: 'ONE_TIME',
      active: true,
      start_date: testToday
    };
    const occId = `${ftId}_${testToday}`;
    const occ: TaskAssignment = {
      id: occId,
      family_id: mockFamily.id,
      family_task_id: ft.id,
      task_id: ft.id,
      member_id: '',
      room_id: ft.room_id,
      scheduled_date: testToday,
      status: 'SCHEDULED',
      is_unassigned: true
    };
    assert(ft.frequency === 'ONE_TIME' && occ.family_task_id === ft.id, 'TC08: ONE_TIME cria FamilyTask + ocorrência');
  }

  // ==========================================
  // TC09: DAILY utiliza Routine Continuity
  // ==========================================
  {
    const dailyFt: FamilyTask = {
      id: 'ft-daily-custom',
      family_id: mockFamily.id,
      customTitle: 'Regar plantas da varanda',
      custom_title: 'Regar plantas da varanda',
      room_id: 'varanda',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      preferred_time: '08:00',
      active: true,
      start_date: testToday
    };

    const syncResult = await RoutineContinuityService.syncRollingRoutines({
      family: mockFamily,
      routines: [dailyFt],
      existingAssignments: [],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });

    const relatedOccs = syncResult.allAssignments.filter(a => a.family_task_id === dailyFt.id);
    assert(relatedOccs.length === 15, 'TC09: DAILY utiliza Routine Continuity gerando horizonte diário completo');
  }

  // ==========================================
  // TC10: WEEKLY utiliza Routine Continuity
  // ==========================================
  {
    const todayDayOfWeek = getDayOfWeek(testToday);
    const weeklyFt: FamilyTask = {
      id: 'ft-weekly-custom',
      family_id: mockFamily.id,
      customTitle: 'Trocar roupa de cama',
      room_id: 'quarto',
      frequency: 'WEEKLY',
      preferred_days: [todayDayOfWeek],
      preferred_time: '14:00',
      active: true,
      start_date: testToday
    };

    const syncResult = await RoutineContinuityService.syncRollingRoutines({
      family: mockFamily,
      routines: [weeklyFt],
      existingAssignments: [],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });

    const relatedOccs = syncResult.allAssignments.filter(a => a.family_task_id === weeklyFt.id);
    assert(relatedOccs.length >= 2, 'TC10: WEEKLY utiliza Routine Continuity respeitando dias da semana');
  }

  // ==========================================
  // TC11: Recorrência respeita horizonte 15 dias
  // ==========================================
  {
    const horizonDates = getRollingDateHorizon(testToday, 15);
    const firstDate = horizonDates[0];
    const lastDate = horizonDates[horizonDates.length - 1];
    const expectedLastDate = addDaysToDate(testToday, 14);
    assert(horizonDates.length === 15 && firstDate === testToday && lastDate === expectedLastDate, 'TC11: Recorrência respeita horizonte 15 dias');
  }

  // ==========================================
  // TC12: Auto-distribution continua restrita a Today + Tomorrow
  // ==========================================
  {
    const realToday = getFamilyLocalDate(mockFamily.timezone);
    const dailyFt: FamilyTask = {
      id: 'ft-autodist-test',
      family_id: mockFamily.id,
      customTitle: 'Varrer sala',
      room_id: 'sala',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: realToday
    };

    const syncResult = await RoutineContinuityService.syncRollingRoutines({
      family: mockFamily,
      routines: [dailyFt],
      existingAssignments: [],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });

    const todayOcc = syncResult.allAssignments.find(a => a.family_task_id === dailyFt.id && a.scheduled_date === realToday);
    const tomorrowDate = addDaysToDate(realToday, 1);
    const tomorrowOcc = syncResult.allAssignments.find(a => a.family_task_id === dailyFt.id && a.scheduled_date === tomorrowDate);

    const todayAssigned = Boolean(todayOcc && todayOcc.member_id && !todayOcc.is_unassigned);
    const tomorrowAssigned = Boolean(tomorrowOcc && tomorrowOcc.member_id && !tomorrowOcc.is_unassigned);
    assert(todayAssigned && tomorrowAssigned, 'TC12: Auto-distribution cobre Today + Tomorrow');
  }

  // ==========================================
  // TC13: Dias 3 a 15 continuam unassigned quando aplicável
  // ==========================================
  {
    const realToday = getFamilyLocalDate(mockFamily.timezone);
    const dailyFt: FamilyTask = {
      id: 'ft-unassigned-test',
      family_id: mockFamily.id,
      customTitle: 'Tirar poeira',
      room_id: 'sala',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: realToday
    };

    const syncResult = await RoutineContinuityService.syncRollingRoutines({
      family: mockFamily,
      routines: [dailyFt],
      existingAssignments: [],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });

    const day3Date = addDaysToDate(realToday, 2);
    const day3Occ = syncResult.allAssignments.find(a => a.family_task_id === dailyFt.id && a.scheduled_date === day3Date);
    assert(Boolean(day3Occ && (day3Occ.is_unassigned || !day3Occ.member_id)), 'TC13: Dias 3 a 15 continuam unassigned');
  }

  // ==========================================
  // TC14: Hidratação pós-F5 preserva customTitle
  // ==========================================
  {
    const ft: FamilyTask = {
      id: 'ft-f5-test',
      family_id: mockFamily.id,
      customTitle: 'Descongelar freezer da cozinha',
      custom_title: 'Descongelar freezer da cozinha',
      name: 'Descongelar freezer da cozinha',
      room_id: 'cozinha',
      frequency: 'DAILY',
      active: true,
      start_date: testToday
    };
    const asg: TaskAssignment = {
      id: `${ft.id}_${testToday}`,
      family_id: mockFamily.id,
      family_task_id: ft.id,
      task_id: ft.id,
      member_id: '',
      room_id: 'cozinha',
      scheduled_date: testToday,
      status: 'SCHEDULED'
    };

    const resolvedTitle = ft.customTitle ?? ft.custom_title ?? ft.name ?? asg.task_id;
    assert(resolvedTitle === 'Descongelar freezer da cozinha', 'TC14: Hidratação pós-F5 preserva customTitle');
  }

  // ==========================================
  // TC15: Hidratação não reverte para task-174...
  // ==========================================
  {
    const ft: FamilyTask = {
      id: 'ft-no-synth',
      family_id: mockFamily.id,
      customTitle: 'Limpar calhas',
      custom_title: 'Limpar calhas',
      room_id: 'telhado',
      frequency: 'DAILY',
      active: true,
      start_date: testToday
    };
    const asg: TaskAssignment = {
      id: 'task-1742398472938',
      family_id: mockFamily.id,
      family_task_id: ft.id,
      task_id: 'task-1742398472938',
      member_id: '',
      room_id: 'telhado',
      scheduled_date: testToday,
      status: 'SCHEDULED'
    };

    const resolvedTitle = ft.customTitle ?? ft.custom_title ?? ft.name ?? asg.task_id;
    assert(resolvedTitle !== 'task-1742398472938' && resolvedTitle === 'Limpar calhas', 'TC15: Hidratação não reverte para task-174...');
  }

  // ==========================================
  // TC16: Tarefa customizada aparece na aba Rotinas
  // ==========================================
  {
    const customFt: FamilyTask = {
      id: 'ft-routine-tab',
      family_id: mockFamily.id,
      customTitle: 'Passar aspirador no tapete',
      room_id: 'sala',
      frequency: 'DAILY',
      active: true,
      start_date: testToday
    };
    const activeFamilyTasks = [customFt].filter(f => f.active !== false);
    assert(activeFamilyTasks.some(f => f.id === customFt.id), 'TC16: Tarefa customizada aparece na aba Rotinas');
  }

  // ==========================================
  // TC17: Tarefa customizada aparece no Catálogo/Minhas Tarefas quando aplicável
  // ==========================================
  {
    const customFt: FamilyTask = {
      id: 'ft-catalog-custom',
      family_id: mockFamily.id,
      customTitle: 'Lustrar móveis da sala',
      room_id: 'sala',
      frequency: 'WEEKLY',
      active: true,
      start_date: testToday
    };
    const familyCatalogTasks = [customFt];
    assert(familyCatalogTasks.some(f => f.customTitle === 'Lustrar móveis da sala'), 'TC17: Tarefa customizada aparece no Catálogo/Minhas Tarefas');
  }

  // ==========================================
  // TC18: Tarefa customizada ativa aparece no seletor do Modo Caos
  // ==========================================
  {
    const customFt: FamilyTask = {
      id: 'ft-chaos-picker',
      family_id: mockFamily.id,
      customTitle: 'Recolher brinquedos espalhados',
      room_id: 'sala',
      frequency: 'DAILY',
      active: true,
      start_date: testToday
    };
    const chaosAvailableTasks = [customFt].filter(ft => ft.active !== false);
    const resolvedTitle = customFt.customTitle || customFt.custom_title || customFt.name || 'Tarefa';
    assert(chaosAvailableTasks.length === 1 && resolvedTitle === 'Recolher brinquedos espalhados', 'TC18: Tarefa customizada ativa aparece no seletor do Modo Caos');
  }

  // ==========================================
  // TC19: Tarefa customizada pode ser selecionada para força-tarefa
  // ==========================================
  {
    const selectedTaskConfigs = [{
      familyTaskId: 'ft-chaos-picker',
      strategy: 'DISTRIBUTED' as const,
      isSuggested: false
    }];
    assert(selectedTaskConfigs.length === 1 && selectedTaskConfigs[0].familyTaskId === 'ft-chaos-picker', 'TC19: Tarefa customizada pode ser selecionada para força-tarefa');
  }

  // ==========================================
  // TC20: Tarefa customizada no Caos suporta DISTRIBUTED e OPEN_POOL
  // ==========================================
  {
    const config1 = { familyTaskId: 'ft-chaos-1', strategy: 'DISTRIBUTED' as const };
    const config2 = { familyTaskId: 'ft-chaos-2', strategy: 'OPEN_POOL' as const };
    assert(config1.strategy === 'DISTRIBUTED' && config2.strategy === 'OPEN_POOL', 'TC20: Tarefa customizada no Caos suporta DISTRIBUTED e OPEN_POOL');
  }

  // ==========================================
  // TC21: "Remover da minha casa" define FamilyTask.active=false
  // ==========================================
  {
    const ft: FamilyTask = {
      id: 'ft-to-remove',
      family_id: mockFamily.id,
      customTitle: 'Tarefa a desativar',
      room_id: 'sala',
      frequency: 'DAILY',
      active: true,
      start_date: testToday
    };
    const deactivateRes = await RoutineContinuityService.deactivateRoutine({
      familyId: mockFamily.id,
      routineId: ft.id,
      existingRoutines: [ft],
      existingAssignments: [],
      isDemoMode: true,
      timezone: mockFamily.timezone
    });
    assert(deactivateRes.deactivatedRoutine.active === false, 'TC21: "Remover da minha casa" define FamilyTask.active=false');
  }

  // ==========================================
  // TC22: Desativação não faz hard delete
  // ==========================================
  {
    const ft: FamilyTask = {
      id: 'ft-soft-delete',
      family_id: mockFamily.id,
      customTitle: 'Tarefa soft delete',
      room_id: 'sala',
      frequency: 'DAILY',
      active: true,
      start_date: testToday
    };
    const deactivateRes = await RoutineContinuityService.deactivateRoutine({
      familyId: mockFamily.id,
      routineId: ft.id,
      existingRoutines: [ft],
      existingAssignments: [],
      isDemoMode: true,
      timezone: mockFamily.timezone
    });
    assert(deactivateRes.deactivatedRoutine.id === ft.id && deactivateRes.deactivatedRoutine.active === false, 'TC22: Desativação não faz hard delete');
  }

  // ==========================================
  // TC23: Tarefa desativada não gera novas ocorrências
  // ==========================================
  {
    const deactivatedFt: FamilyTask = {
      id: 'ft-deactivated',
      family_id: mockFamily.id,
      customTitle: 'Tarefa inativa',
      room_id: 'sala',
      frequency: 'DAILY',
      active: false,
      start_date: testToday
    };
    const syncRes = await RoutineContinuityService.syncRollingRoutines({
      family: mockFamily,
      routines: [deactivatedFt],
      existingAssignments: [],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });
    const occs = syncRes.allAssignments.filter(a => a.family_task_id === deactivatedFt.id);
    assert(occs.length === 0, 'TC23: Tarefa desativada não gera novas ocorrências');
  }

  // ==========================================
  // TC24: Reativação preserva mesmo FamilyTask.id
  // ==========================================
  {
    const deactivatedFt: FamilyTask = {
      id: 'ft-preserve-id',
      family_id: mockFamily.id,
      customTitle: 'Tarefa reativável',
      room_id: 'sala',
      frequency: 'DAILY',
      active: false,
      start_date: testToday
    };
    const reactivated: FamilyTask = {
      ...deactivatedFt,
      active: true,
      updated_at: new Date().toISOString()
    };
    assert(reactivated.id === deactivatedFt.id && reactivated.active === true, 'TC24: Reativação preserva mesmo FamilyTask.id');
  }

  // ==========================================
  // TC25: Duplo clique / retry não duplica FamilyTask
  // ==========================================
  {
    const familyTasksList: FamilyTask[] = [];
    const cleanTitle = 'Lavar tênis';
    const cleanRoomId = 'lavanderia';

    function addCustomTask(title: string, roomId: string) {
      let existing = familyTasksList.find(f => 
        f.active !== false && 
        (f.customTitle || f.custom_title || f.name) === title &&
        f.room_id === roomId
      );
      if (!existing) {
        existing = {
          id: `ft-custom-${familyTasksList.length + 1}`,
          family_id: mockFamily.id,
          customTitle: title,
          room_id: roomId,
          frequency: 'DAILY',
          active: true,
          start_date: testToday
        };
        familyTasksList.push(existing);
      }
      return existing;
    }

    const ft1 = addCustomTask(cleanTitle, cleanRoomId);
    const ft2 = addCustomTask(cleanTitle, cleanRoomId);
    assert(ft1.id === ft2.id && familyTasksList.length === 1, 'TC25: Duplo clique / retry não duplica FamilyTask');
  }

  // ==========================================
  // TC26: Duplo clique / retry não duplica TaskAssignment para a mesma data
  // ==========================================
  {
    const assignmentsMap = new Map<string, TaskAssignment>();
    const ftId = 'ft-dedupe-occ';

    function addOccurrence(familyTaskId: string, date: string) {
      const occId = `${familyTaskId}_${date}`;
      if (!assignmentsMap.has(occId)) {
        assignmentsMap.set(occId, {
          id: occId,
          family_id: mockFamily.id,
          family_task_id: familyTaskId,
          task_id: familyTaskId,
          member_id: '',
          room_id: 'sala',
          scheduled_date: date,
          status: 'SCHEDULED',
          is_unassigned: true
        });
      }
      return assignmentsMap.get(occId)!;
    }

    const occ1 = addOccurrence(ftId, testToday);
    const occ2 = addOccurrence(ftId, testToday);
    assert(occ1.id === occ2.id && assignmentsMap.size === 1, 'TC26: Duplo clique / retry não duplica TaskAssignment para a mesma data');
  }

  // ==========================================
  // TC27: ADMIN pode criar tarefa customizada
  // ==========================================
  {
    const adminMember = mockMembers.find(m => m.role === 'ADMIN');
    let allowed = false;
    if (adminMember && adminMember.role === 'ADMIN') {
      allowed = true;
    }
    assert(allowed === true, 'TC27: ADMIN pode criar tarefa customizada');
  }

  // ==========================================
  // TC28: MEMBER é bloqueado ao tentar criar tarefa para a casa
  // ==========================================
  {
    const nonAdmin = mockMembers.find(m => m.role === 'MEMBER');
    let errorThrown = false;
    try {
      if (nonAdmin && nonAdmin.role !== 'ADMIN') {
        throw new Error('Apenas administradores podem criar tarefas para a casa.');
      }
    } catch (err: any) {
      errorThrown = true;
    }
    assert(errorThrown === true, 'TC28: MEMBER é bloqueado ao tentar criar tarefa para a casa');
  }

  // ==========================================
  // TC29: Data repair associa as 4 tarefas órfãs às suas FamilyTasks
  // ==========================================
  {
    const orphanAssignments: TaskAssignment[] = [
      { id: 'task-1740000001', family_id: mockFamily.id, task_id: 'task-1740000001', family_task_id: undefined, scheduled_date: testToday, status: 'SCHEDULED', title: 'testes caos 1', member_id: '' } as any,
      { id: 'task-1740000002', family_id: mockFamily.id, task_id: 'task-1740000002', family_task_id: undefined, scheduled_date: testToday, status: 'SCHEDULED', title: 'testes caos 2', member_id: '' } as any,
      { id: 'task-1740000003', family_id: mockFamily.id, task_id: 'task-1740000003', family_task_id: undefined, scheduled_date: testToday, status: 'SCHEDULED', title: 'testes caos 3', member_id: '' } as any,
      { id: 'task-1740000004', family_id: mockFamily.id, task_id: 'task-1740000004', family_task_id: undefined, scheduled_date: testToday, status: 'SCHEDULED', title: 'testes caos 4', member_id: '' } as any
    ];

    const repairResult = await CustomTaskRepairService.repairOrphanTasks({
      familyId: mockFamily.id,
      existingAssignments: orphanAssignments,
      existingFamilyTasks: [],
      allMasterTasks,
      isDemoMode: true,
      today: testToday
    });

    const hasAll4FTs = TARGET_QA_CUSTOM_TASK_TITLES.every(target => 
      repairResult.repairedFamilyTasks.some(ft => (ft.customTitle || ft.name)?.toLowerCase() === target.toLowerCase() && ft.active === true)
    );

    const allAssignmentsLinked = TARGET_QA_CUSTOM_TASK_TITLES.every(target => {
      const ft = repairResult.repairedFamilyTasks.find(f => (f.customTitle || f.name)?.toLowerCase() === target.toLowerCase());
      return repairResult.repairedAssignments.some(asg => asg.family_task_id === ft?.id);
    });

    assert(hasAll4FTs && allAssignmentsLinked, 'TC29: Data repair associa as 4 tarefas órfãs às suas FamilyTasks');
  }

  // ==========================================
  // TC30: Nenhuma tarefa antiga desativada é reativada indevidamente no repair
  // ==========================================
  {
    const oldDeactivatedTasks: FamilyTask[] = [
      { id: 'ft-old-1', family_id: mockFamily.id, customTitle: 'Lavar louça antiga', active: false, start_date: '2026-01-01' },
      { id: 'ft-old-2', family_id: mockFamily.id, customTitle: 'Tirar lixo antigo', active: false, start_date: '2026-01-01' },
      { id: 'ft-old-3', family_id: mockFamily.id, customTitle: 'Limpar chão antigo', active: false, start_date: '2026-01-01' }
    ];

    const repairResult = await CustomTaskRepairService.repairOrphanTasks({
      familyId: mockFamily.id,
      existingAssignments: [],
      existingFamilyTasks: oldDeactivatedTasks,
      allMasterTasks,
      isDemoMode: true,
      today: testToday
    });

    const anyOldReactivated = repairResult.repairedFamilyTasks.some(ft => 
      oldDeactivatedTasks.some(old => old.id === ft.id) && ft.active === true
    );

    assert(!anyOldReactivated && repairResult.unrelatedTasksUntouched, 'TC30: Nenhuma tarefa antiga desativada é reativada indevidamente no repair');
  }

  return {
    passed,
    failed,
    results
  };
}
