/**
 * CASA JUNTO — TEST SUITE EXECUTION-TARGET-MOTOR
 * Regras Canônicas de Distribuição por ExecutionTarget e Fronteira Arquitetural do Motor 2.0:
 * 
 * Regra Arquitetural:
 * TaskAssignments / FamilyTasks
 *           ↓
 * APPLICATION / ORCHESTRATION BOUNDARY
 *           ↓
 * filtra EXTERNAL_SUPPORT
 *           ↓
 * somente HOUSEHOLD + FLEXIBLE
 *           ↓
 * MOTOR 2.0 (DistributionEngine / RebalanceService)
 */

import fs from 'fs';
import path from 'path';
import { DistributionService } from '../application/services/DistributionService';
import { DistributionEngine } from '../domain/distribution/DistributionEngine';
import { RebalanceService } from '../domain/distribution/RebalanceService';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { mapAssignmentsToTasks } from '../context/AppContext';
import { Family, Member, Task, FamilyTask, TaskAssignment, Room, TaskMaster } from '../types';
import { DEFAULT_TIMEZONE, getFamilyLocalDate, addDaysToDate } from '../domain/utils/dateTimeUtils';

export async function runExecutionTargetMotorTests(): Promise<{
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
      results.push({ testName: `ExecutionTarget-Motor ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `ExecutionTarget-Motor ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  const today = getFamilyLocalDate(DEFAULT_TIMEZONE);
  const tomorrow = addDaysToDate(today, 1);

  const testFamily: Family = {
    id: 'fam-exec-test',
    name: 'Família Target Test',
    timezone: DEFAULT_TIMEZONE,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z'
  };

  const members: Member[] = [
    {
      id: 'mem-1',
      familyId: testFamily.id,
      name: 'Marina',
      role: 'ADMIN',
      avatar: '👩',
      color: '#5A5A40',
      autonomyLevel: 4,
      points: 100,
      streak: 5,
      tasksCompleted: 10,
      active: true
    },
    {
      id: 'mem-2',
      familyId: testFamily.id,
      name: 'Lucas',
      role: 'MEMBER',
      avatar: '👦',
      color: '#8A8A60',
      autonomyLevel: 3,
      points: 80,
      streak: 4,
      tasksCompleted: 8,
      active: true
    }
  ];

  // 01: HOUSEHOLD entra no input do Motor
  await record('ETM-01', 'HOUSEHOLD entra no input do Motor 2.0 e é elegível para alocação', async () => {
    const taskHousehold: Task = {
      id: 'task-hh-1',
      familyId: testFamily.id,
      title: 'Lavar a louça',
      status: 'PENDING',
      dueDate: today,
      roomId: 'kitchen',
      frequency: 'DAILY',
      executionTarget: 'HOUSEHOLD',
      isUnassigned: true,
      category: 'kitchen',
      durationMinutes: 20,
      effort: 10
    };

    const ctx = DistributionService.buildContext({
      family: testFamily,
      members,
      tasks: [taskHousehold],
      protectedTimes: [],
      targetDate: today
    });

    // Prova de fronteira: entra no context do Motor
    const inFamilyTasks = ctx.familyTasks.some(ft => ft.task_master_id === 'task-hh-1' || ft.id === 'ft-task-hh-1');
    const inAssignments = ctx.existingAssignments.some(asg => asg.id === 'task-hh-1');
    if (!inFamilyTasks || !inAssignments) {
      throw new Error('HOUSEHOLD não entrou no DistributionContext que alimenta o Motor 2.0');
    }

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members,
      tasks: [taskHousehold],
      protectedTimes: [],
      targetDate: today
    });

    const update = taskUpdates['task-hh-1'];
    if (!update || !update.assignedMemberId) {
      throw new Error('HOUSEHOLD deveria ter sido atribuída a um morador pelo Motor');
    }
  });

  // 02: FLEXIBLE entra no input do Motor
  await record('ETM-02', 'FLEXIBLE entra no input do Motor 2.0 e é elegível para alocação', async () => {
    const taskFlexible: Task = {
      id: 'task-flex-1',
      familyId: testFamily.id,
      title: 'Passar pano na sala',
      status: 'PENDING',
      dueDate: today,
      roomId: 'living_room',
      frequency: 'DAILY',
      executionTarget: 'FLEXIBLE',
      isUnassigned: true,
      category: 'cleaning',
      durationMinutes: 20,
      effort: 10
    };

    const ctx = DistributionService.buildContext({
      family: testFamily,
      members,
      tasks: [taskFlexible],
      protectedTimes: [],
      targetDate: today
    });

    // Prova de fronteira: entra no context do Motor
    const inFamilyTasks = ctx.familyTasks.some(ft => ft.task_master_id === 'task-flex-1' || ft.id === 'ft-task-flex-1');
    const inAssignments = ctx.existingAssignments.some(asg => asg.id === 'task-flex-1');
    if (!inFamilyTasks || !inAssignments) {
      throw new Error('FLEXIBLE não entrou no DistributionContext que alimenta o Motor 2.0');
    }

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members,
      tasks: [taskFlexible],
      protectedTimes: [],
      targetDate: today
    });

    const update = taskUpdates['task-flex-1'];
    if (!update || !update.assignedMemberId) {
      throw new Error('FLEXIBLE deveria ter sido atribuída a um morador');
    }
  });

  // 03: EXTERNAL_SUPPORT não entra no input do Motor
  await record('ETM-03', 'EXTERNAL_SUPPORT não entra no input do Motor 2.0 (filtro na fronteira)', async () => {
    const taskExternal: Task = {
      id: 'task-ext-boundary',
      familyId: testFamily.id,
      title: 'Faxina Pesada Externa',
      status: 'PENDING',
      dueDate: today,
      roomId: 'living_room',
      frequency: 'WEEKLY',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'sup-maria',
      isUnassigned: true,
      category: 'cleaning',
      durationMinutes: 120,
      effort: 50
    };

    const ctx = DistributionService.buildContext({
      family: testFamily,
      members,
      tasks: [taskExternal],
      protectedTimes: [],
      targetDate: today
    });

    // Prova estrita da fronteira: NUNCA entra no DistributionContext enviado ao Motor
    const inFamilyTasks = ctx.familyTasks.some(ft => ft.id === 'ft-task-ext-boundary' || ft.task_master_id === 'task-ext-boundary');
    const inAssignments = ctx.existingAssignments.some(asg => asg.id === 'task-ext-boundary');
    if (inFamilyTasks || inAssignments) {
      throw new Error('EXTERNAL_SUPPORT indevidamente entrou no DistributionContext do Motor 2.0');
    }
  });

  // 04: legacy sem executionTarget = HOUSEHOLD
  await record('ETM-04', 'legacy sem executionTarget assume HOUSEHOLD e entra no Motor 2.0', async () => {
    const legacyTask: Task = {
      id: 'task-legacy-1',
      familyId: testFamily.id,
      title: 'Varrer entrada antiga',
      status: 'PENDING',
      dueDate: today,
      roomId: 'corredor',
      frequency: 'DAILY',
      isUnassigned: true,
      // executionTarget omitido intencionalmente
      category: 'cleaning',
      durationMinutes: 15,
      effort: 5
    };

    const resolved = DistributionService.resolveExecutionTarget(legacyTask);
    if (resolved !== 'HOUSEHOLD') {
      throw new Error(`Target padrão esperado HOUSEHOLD, obtido: ${resolved}`);
    }

    const ctx = DistributionService.buildContext({
      family: testFamily,
      members,
      tasks: [legacyTask],
      protectedTimes: [],
      targetDate: today
    });

    const inFamilyTasks = ctx.familyTasks.some(ft => ft.id === 'ft-task-legacy-1' || ft.task_master_id === 'task-legacy-1');
    if (!inFamilyTasks) {
      throw new Error('Tarefa legacy deveria ter entrado no contexto do Motor como HOUSEHOLD');
    }
  });

  // 05: EXTERNAL_SUPPORT continua em Hoje
  await record('ETM-05', 'EXTERNAL_SUPPORT continua presente na agenda de Hoje', async () => {
    const ftExt: FamilyTask = {
      id: 'ft-agenda-ext-today',
      family_id: testFamily.id,
      name: 'Faxina Quinzenal',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'sup-maria',
      active: true
    };

    const asgExt: TaskAssignment = {
      id: `asg-ext-today-01`,
      family_id: testFamily.id,
      family_task_id: ftExt.id,
      task_id: 'clean-1',
      scheduled_date: today,
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asgExt],
      rooms: [],
      familyTasks: [ftExt],
      allMasterTasks: []
    });

    if (tasks.length !== 1) {
      throw new Error(`Esperado 1 tarefa mapeada em Hoje, obtido: ${tasks.length}`);
    }
    if (tasks[0].executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`executionTarget esperado EXTERNAL_SUPPORT, obtido: ${tasks[0].executionTarget}`);
    }
    if (tasks[0].dueDate !== today) {
      throw new Error(`dueDate esperado ${today}, obtido: ${tasks[0].dueDate}`);
    }
  });

  // 06: EXTERNAL_SUPPORT continua na Visão Semanal
  await record('ETM-06', 'EXTERNAL_SUPPORT continua presente na Visão Semanal', async () => {
    const ftExt: FamilyTask = {
      id: 'ft-agenda-ext-week',
      family_id: testFamily.id,
      name: 'Limpeza de Jardins',
      task_master_id: 'out-1',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'sup-jardim',
      active: true
    };

    const asgToday: TaskAssignment = {
      id: `asg-week-1`,
      family_id: testFamily.id,
      family_task_id: ftExt.id,
      task_id: 'out-1',
      scheduled_date: today,
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    const asgTomorrow: TaskAssignment = {
      id: `asg-week-2`,
      family_id: testFamily.id,
      family_task_id: ftExt.id,
      task_id: 'out-1',
      scheduled_date: tomorrow,
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asgToday, asgTomorrow],
      rooms: [],
      familyTasks: [ftExt],
      allMasterTasks: []
    });

    if (tasks.length !== 2) {
      throw new Error(`Esperado 2 ocorrências na Visão Semanal, obtido: ${tasks.length}`);
    }
    const dates = tasks.map(t => t.dueDate).sort();
    const expected = [today, tomorrow].sort();
    if (dates[0] !== expected[0] || dates[1] !== expected[1]) {
      throw new Error(`Datas esperadas [${expected}], obtidas [${dates}]`);
    }
  });

  // 07: MEMBER não recebe EXTERNAL_SUPPORT
  await record('ETM-07', 'MEMBER não recebe EXTERNAL_SUPPORT em rebalanceamento ou distribuição', async () => {
    const onlyMember: Member[] = [
      {
        id: 'mem-user-only',
        familyId: testFamily.id,
        name: 'Lucas Morador',
        role: 'MEMBER',
        active: true,
        autonomyLevel: 4
      }
    ];

    const taskExternal: Task = {
      id: 'task-ext-mem-check',
      familyId: testFamily.id,
      title: 'Serviço de Calhas',
      status: 'PENDING',
      dueDate: today,
      roomId: 'geral',
      frequency: 'WEEKLY',
      executionTarget: 'EXTERNAL_SUPPORT',
      isUnassigned: true,
      durationMinutes: 60,
      effort: 20
    };

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members: onlyMember,
      tasks: [taskExternal],
      protectedTimes: [],
      targetDate: today
    });

    const update = taskUpdates['task-ext-mem-check'];
    if (update && update.assignedMemberId && update.assignedMemberId !== '') {
      throw new Error(`MEMBER recebeu indevidamente a tarefa EXTERNAL_SUPPORT: ${update.assignedMemberId}`);
    }
    const proposed = result.proposedAssignments.find(a => a.id === 'task-ext-mem-check');
    if (proposed && proposed.member_id && proposed.member_id !== '') {
      throw new Error(`EXTERNAL_SUPPORT teve member_id atribuído: ${proposed.member_id}`);
    }
  });

  // 08: ADMIN não recebe EXTERNAL_SUPPORT automaticamente
  await record('ETM-08', 'ADMIN não recebe EXTERNAL_SUPPORT automaticamente pelo Motor', async () => {
    const onlyAdmin: Member[] = [
      {
        id: 'admin-only',
        familyId: testFamily.id,
        name: 'Marina Gestora',
        role: 'ADMIN',
        active: true,
        autonomyLevel: 5
      }
    ];

    const taskExternal: Task = {
      id: 'task-ext-admin-check',
      familyId: testFamily.id,
      title: 'Pintura Fachada',
      status: 'PENDING',
      dueDate: today,
      roomId: 'geral',
      frequency: 'WEEKLY',
      executionTarget: 'EXTERNAL_SUPPORT',
      isUnassigned: true,
      durationMinutes: 180,
      effort: 40
    };

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members: onlyAdmin,
      tasks: [taskExternal],
      protectedTimes: [],
      targetDate: today
    });

    const update = taskUpdates['task-ext-admin-check'];
    if (update && update.assignedMemberId && update.assignedMemberId !== '') {
      throw new Error(`ADMIN recebeu automaticamente EXTERNAL_SUPPORT: ${update.assignedMemberId}`);
    }
    const proposed = result.proposedAssignments.find(a => a.id === 'task-ext-admin-check');
    if (proposed && proposed.member_id && proposed.member_id !== '') {
      throw new Error(`EXTERNAL_SUPPORT não pode ter member_id alocado: ${proposed.member_id}`);
    }
  });

  // 09: FLEXIBLE + domesticSupportId continua elegível
  await record('ETM-09', 'FLEXIBLE + domesticSupportId continua elegível para morador no MVP', async () => {
    const taskFlexWithSupport: Task = {
      id: 'task-flex-sup',
      familyId: testFamily.id,
      title: 'Lavar roupas finas',
      status: 'PENDING',
      dueDate: today,
      roomId: 'lavanderia',
      frequency: 'DAILY',
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'sup-maria-diarista',
      isUnassigned: true,
      durationMinutes: 30,
      effort: 15
    };

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members,
      tasks: [taskFlexWithSupport],
      protectedTimes: [],
      targetDate: today
    });

    const update = taskUpdates['task-flex-sup'];
    if (!update || !update.assignedMemberId) {
      throw new Error('FLEXIBLE com domesticSupportId deve continuar elegível para moradores');
    }
  });

  // 10: mesmo TaskMaster + FamilyTasks com targets diferentes não colidem
  await record('ETM-10', 'mesmo TaskMaster + FamilyTasks com targets diferentes não colidem', async () => {
    const tmId = 'clean-corredor-shared';

    const ftExt: FamilyTask = {
      id: 'ft-ext-shared',
      family_id: testFamily.id,
      name: 'Varrer Corredor (Diarista)',
      task_master_id: tmId,
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'sup-maria',
      active: true
    };

    const ftHh: FamilyTask = {
      id: 'ft-hh-shared',
      family_id: testFamily.id,
      name: 'Varrer Corredor (Família)',
      task_master_id: tmId,
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      executionTarget: 'HOUSEHOLD',
      active: true
    };

    const taskExt: Task = {
      id: 'task-asg-ext-shared',
      familyId: testFamily.id,
      familyTaskId: ftExt.id,
      taskMasterId: tmId,
      title: ftExt.name,
      status: 'PENDING',
      dueDate: today,
      roomId: 'corredor',
      frequency: 'DAILY',
      executionTarget: 'EXTERNAL_SUPPORT',
      isUnassigned: true,
      durationMinutes: 15,
      effort: 5
    };

    const taskHh: Task = {
      id: 'task-asg-hh-shared',
      familyId: testFamily.id,
      familyTaskId: ftHh.id,
      taskMasterId: tmId,
      title: ftHh.name,
      status: 'PENDING',
      dueDate: today,
      roomId: 'corredor',
      frequency: 'DAILY',
      executionTarget: 'HOUSEHOLD',
      isUnassigned: true,
      durationMinutes: 15,
      effort: 5
    };

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members,
      tasks: [taskExt, taskHh],
      familyTasks: [ftExt, ftHh],
      protectedTimes: [],
      targetDate: today
    });

    // taskExt: EXTERNAL_SUPPORT não deve ter membro
    const extUpdate = taskUpdates['task-asg-ext-shared'];
    if (extUpdate && extUpdate.assignedMemberId && extUpdate.assignedMemberId !== '') {
      throw new Error(`taskExt colidiu e recebeu membro: ${extUpdate.assignedMemberId}`);
    }

    // taskHh: HOUSEHOLD deve ser atribuída a um membro
    const hhUpdate = taskUpdates['task-asg-hh-shared'];
    if (!hhUpdate || !hhUpdate.assignedMemberId) {
      throw new Error('taskHh deveria ter sido atribuída normalmente');
    }
  });

  // 11: reload/F5 mantém comportamento
  await record('ETM-11', 'reload/F5 mantém mapeamento consistente sem duplicação', async () => {
    const ftExt: FamilyTask = {
      id: 'ft-reload-ext',
      family_id: testFamily.id,
      name: 'Limpeza Externa Persistente',
      task_master_id: 'clean-pers',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      executionTarget: 'EXTERNAL_SUPPORT',
      active: true
    };

    const ftHh: FamilyTask = {
      id: 'ft-reload-hh',
      family_id: testFamily.id,
      name: 'Louça da Tarde',
      task_master_id: 'kitch-pers',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      executionTarget: 'HOUSEHOLD',
      active: true
    };

    const assignmentsSnapshot: TaskAssignment[] = [
      {
        id: 'asg-f5-1',
        family_id: testFamily.id,
        family_task_id: ftExt.id,
        task_id: 'clean-pers',
        scheduled_date: today,
        status: 'SCHEDULED',
        is_unassigned: true,
        member_id: ''
      },
      {
        id: 'asg-f5-2',
        family_id: testFamily.id,
        family_task_id: ftHh.id,
        task_id: 'kitch-pers',
        scheduled_date: today,
        status: 'SCHEDULED',
        is_unassigned: false,
        member_id: 'mem-1'
      }
    ];

    // Simula primeiro carregamento
    const load1 = mapAssignmentsToTasks({
      assignments: assignmentsSnapshot,
      rooms: [],
      familyTasks: [ftExt, ftHh],
      allMasterTasks: []
    });

    // Simula segundo carregamento (F5 / reload)
    const load2 = mapAssignmentsToTasks({
      assignments: assignmentsSnapshot,
      rooms: [],
      familyTasks: [ftExt, ftHh],
      allMasterTasks: []
    });

    if (load1.length !== 2 || load2.length !== 2) {
      throw new Error(`Contagem inconsistente no F5: load1=${load1.length}, load2=${load2.length}`);
    }

    const tExt1 = load1.find(t => t.id === 'asg-f5-1');
    const tExt2 = load2.find(t => t.id === 'asg-f5-1');
    if (tExt1?.executionTarget !== 'EXTERNAL_SUPPORT' || tExt2?.executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error('F5 corrompeu executionTarget do apoio externo');
    }
  });

  // 12: rebalanceamento preserva EXTERNAL_SUPPORT sem enviá-la ao Motor
  await record('ETM-12', 'rebalanceamento preserva EXTERNAL_SUPPORT sem enviá-la ao Motor', async () => {
    const tasks: Task[] = [
      {
        id: 'reb-hh',
        familyId: testFamily.id,
        title: 'Arrumar mesa',
        status: 'PENDING',
        dueDate: today,
        roomId: 'sala',
        frequency: 'DAILY',
        executionTarget: 'HOUSEHOLD',
        isUnassigned: true,
        durationMinutes: 10,
        effort: 5
      },
      {
        id: 'reb-ext',
        familyId: testFamily.id,
        title: 'Faxina Fachada',
        status: 'PENDING',
        dueDate: today,
        roomId: 'externo',
        frequency: 'WEEKLY',
        executionTarget: 'EXTERNAL_SUPPORT',
        domesticSupportId: 'sup-joao',
        isUnassigned: true,
        durationMinutes: 120,
        effort: 40
      },
      {
        id: 'reb-flex',
        familyId: testFamily.id,
        title: 'Aspirar sofá',
        status: 'PENDING',
        dueDate: today,
        roomId: 'sala',
        frequency: 'DAILY',
        executionTarget: 'FLEXIBLE',
        isUnassigned: true,
        durationMinutes: 20,
        effort: 10
      }
    ];

    // Spy / interceptador no Motor 2.0 para verificar estritamente o input que chega ao Motor
    let motorReceivedExternal = false;
    let motorReceivedHousehold = false;
    let motorReceivedFlexible = false;

    const originalDistribute = DistributionEngine.distributeDailyTasks;
    (DistributionEngine as any).distributeDailyTasks = (ctx: any) => {
      for (const ft of ctx.familyTasks) {
        if ((ft as any).executionTarget === 'EXTERNAL_SUPPORT' || ft.id === 'reb-ext') {
          motorReceivedExternal = true;
        }
        if (ft.id === 'reb-hh') motorReceivedHousehold = true;
        if (ft.id === 'reb-flex') motorReceivedFlexible = true;
      }
      return originalDistribute.call(DistributionEngine, ctx);
    };

    try {
      const { result, taskUpdates } = DistributionService.executeRebalance({
        family: testFamily,
        members,
        tasks,
        protectedTimes: [],
        targetDate: today
      });

      // Validação estrita da fronteira:
      if (motorReceivedExternal) {
        throw new Error('FALHA DE FRONTEIRA: EXTERNAL_SUPPORT foi enviada para o input do Motor 2.0!');
      }

      // Prova de recomposição operacional fora do Motor:
      // proposedAssignments deve conter as 3 tarefas
      const extProposed = result.proposedAssignments.find(a => a.id === 'reb-ext');
      if (!extProposed) {
        throw new Error('EXTERNAL_SUPPORT desapareceu de proposedAssignments no rebalance');
      }
      if (extProposed.member_id && extProposed.member_id !== '') {
        throw new Error(`EXTERNAL_SUPPORT foi indevidamente atribuída ao membro: ${extProposed.member_id}`);
      }
      if (!extProposed.is_unassigned) {
        throw new Error('EXTERNAL_SUPPORT deveria ser preservada com is_unassigned === true');
      }

      // Household e Flexible receberam atribuição
      if (!taskUpdates['reb-hh']?.assignedMemberId) {
        throw new Error('reb-hh deveria ter sido atribuída');
      }
      if (!taskUpdates['reb-flex']?.assignedMemberId) {
        throw new Error('reb-flex deveria ter sido atribuída');
      }
    } finally {
      (DistributionEngine as any).distributeDailyTasks = originalDistribute;
    }
  });

  // 13: TESTE ARQUITETURAL / REGRESSIVO DO MOTOR 2.0
  await record('ETM-13', 'Teste Arquitetural: DistributionEngine e RebalanceService têm ZERO conhecimento de EXTERNAL_SUPPORT', async () => {
    const enginePath = path.resolve('src/domain/distribution/DistributionEngine.ts');
    const rebalancePath = path.resolve('src/domain/distribution/RebalanceService.ts');

    const engineCode = fs.readFileSync(enginePath, 'utf-8');
    const rebalanceCode = fs.readFileSync(rebalancePath, 'utf-8');

    const forbiddenTerms = ['EXTERNAL_SUPPORT', 'executionTarget', 'domesticSupportId', 'DomesticSupport'];

    for (const term of forbiddenTerms) {
      if (engineCode.includes(term)) {
        throw new Error(`VIOLAÇÃO ARQUITETURAL: DistributionEngine.ts contém referência proibida a "${term}"`);
      }
      if (rebalanceCode.includes(term)) {
        throw new Error(`VIOLAÇÃO ARQUITETURAL: RebalanceService.ts contém referência proibida a "${term}"`);
      }
    }
  });

  return { passed, failed, results };
}
