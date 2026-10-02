/**
 * CASA JUNTO — TEST SUITE EXECUTION-TARGET-MOTOR
 * Regras Canônicas de Distribuição por ExecutionTarget:
 * 
 * HOUSEHOLD:
 * → tarefa destinada às pessoas da casa
 * → pode entrar no pool do Motor 2.0
 * 
 * EXTERNAL_SUPPORT:
 * → tarefa destinada à ajuda externa
 * → aparece normalmente na agenda
 * → NÃO entra no pool do Motor 2.0
 * → NÃO é atribuída a MEMBER
 * 
 * FLEXIBLE:
 * → pode ser feita pela família ou pela ajuda externa
 * → continua elegível para a família no MVP
 * → preferência por ajuda externa NÃO deve ainda excluir do Motor
 */

import { DistributionService } from '../application/services/DistributionService';
import { DistributionEngine } from '../domain/distribution/DistributionEngine';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { mapAssignmentsToTasks } from '../context/AppContext';
import { Family, Member, Task, FamilyTask, TaskAssignment, Room, TaskMaster } from '../types';
import { DEFAULT_TIMEZONE, getFamilyLocalDate } from '../domain/utils/dateTimeUtils';

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

  // ETM-01: HOUSEHOLD entra no pool do Motor 2.0 e pode ser atribuída a um morador
  await record('ETM-01', 'HOUSEHOLD entra no pool do Motor 2.0 e é atribuída a membro', async () => {
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

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members,
      tasks: [taskHousehold],
      protectedTimes: [],
      targetDate: today
    });

    const update = taskUpdates['task-hh-1'];
    if (!update) throw new Error('task-hh-1 deveria estar em taskUpdates');
    if (!update.assignedMemberId || update.assignedMemberId === '') {
      throw new Error('HOUSEHOLD deveria ter sido atribuída a um morador disponível');
    }
    if (update.isUnassigned) {
      throw new Error('HOUSEHOLD não deveria permanecer isUnassigned quando há membros elegíveis');
    }
  });

  // ETM-02: EXTERNAL_SUPPORT NÃO entra no pool do Motor 2.0 e NÃO é atribuída a MEMBER
  await record('ETM-02', 'EXTERNAL_SUPPORT NÃO entra no pool do Motor 2.0 e NÃO é atribuída a MEMBER', async () => {
    const taskExternal: Task = {
      id: 'task-ext-1',
      familyId: testFamily.id,
      title: 'Faxina Pesada com Diarista',
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

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members,
      tasks: [taskExternal],
      protectedTimes: [],
      targetDate: today
    });

    // Não deve haver proposta de atribuição para membro para tarefa EXTERNAL_SUPPORT
    const update = taskUpdates['task-ext-1'];
    if (update && update.assignedMemberId && update.assignedMemberId !== '') {
      throw new Error(`EXTERNAL_SUPPORT foi indevidamente atribuída ao membro: ${update.assignedMemberId}`);
    }

    const proposed = result.proposedAssignments.find(a => a.id === 'task-ext-1');
    if (proposed && proposed.member_id && proposed.member_id !== '') {
      throw new Error(`EXTERNAL_SUPPORT teve member_id atribuído: ${proposed.member_id}`);
    }
  });

  // ETM-03: FLEXIBLE entra no pool do Motor 2.0 no MVP mesmo com preferência por ajuda externa
  await record('ETM-03', 'FLEXIBLE entra no pool do Motor 2.0 mesmo com preferência por ajuda externa', async () => {
    const taskFlexible: Task = {
      id: 'task-flex-1',
      familyId: testFamily.id,
      title: 'Passar pano na sala',
      status: 'PENDING',
      dueDate: today,
      roomId: 'living_room',
      frequency: 'DAILY',
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'sup-maria', // preferência definida, mas flexível
      isUnassigned: true,
      category: 'cleaning',
      durationMinutes: 20,
      effort: 10
    };

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members,
      tasks: [taskFlexible],
      protectedTimes: [],
      targetDate: today
    });

    const update = taskUpdates['task-flex-1'];
    if (!update) throw new Error('task-flex-1 deveria estar em taskUpdates');
    if (!update.assignedMemberId || update.assignedMemberId === '') {
      throw new Error('FLEXIBLE deveria ser atribuída a morador no MVP mesmo com preferência externa');
    }
  });

  // ETM-04: Mix de tarefas (HOUSEHOLD + EXTERNAL_SUPPORT + FLEXIBLE)
  // Somente HOUSEHOLD e FLEXIBLE são distribuídas; EXTERNAL_SUPPORT é preservada intacta
  await record('ETM-04', 'Mix de tarefas: apenas HOUSEHOLD e FLEXIBLE são distribuídas aos moradores', async () => {
    const tasks: Task[] = [
      {
        id: 'mix-hh',
        familyId: testFamily.id,
        title: 'Arrumar camas',
        status: 'PENDING',
        dueDate: today,
        roomId: 'bedroom',
        frequency: 'DAILY',
        executionTarget: 'HOUSEHOLD',
        isUnassigned: true,
        durationMinutes: 15,
        effort: 5
      },
      {
        id: 'mix-ext',
        familyId: testFamily.id,
        title: 'Limpar vidros externos',
        status: 'PENDING',
        dueDate: today,
        roomId: 'living_room',
        frequency: 'WEEKLY',
        executionTarget: 'EXTERNAL_SUPPORT',
        domesticSupportId: 'sup-pedro',
        isUnassigned: true,
        durationMinutes: 60,
        effort: 30
      },
      {
        id: 'mix-flex',
        familyId: testFamily.id,
        title: 'Organizar despensa',
        status: 'PENDING',
        dueDate: today,
        roomId: 'kitchen',
        frequency: 'DAILY',
        executionTarget: 'FLEXIBLE',
        isUnassigned: true,
        durationMinutes: 25,
        effort: 15
      }
    ];

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: testFamily,
      members,
      tasks,
      protectedTimes: [],
      targetDate: today
    });

    // mix-hh: atribuída
    if (!taskUpdates['mix-hh']?.assignedMemberId) {
      throw new Error('mix-hh deveria ser atribuída a um membro');
    }

    // mix-flex: atribuída
    if (!taskUpdates['mix-flex']?.assignedMemberId) {
      throw new Error('mix-flex deveria ser atribuída a um membro');
    }

    // mix-ext: NÃO atribuída
    const extUpdate = taskUpdates['mix-ext'];
    if (extUpdate && extUpdate.assignedMemberId && extUpdate.assignedMemberId !== '') {
      throw new Error(`mix-ext NÃO deveria ser atribuída a membro, recebeu: ${extUpdate.assignedMemberId}`);
    }
  });

  // ETM-05: EXTERNAL_SUPPORT aparece normalmente na agenda (TodayView e WeeklyView)
  await record('ETM-05', 'EXTERNAL_SUPPORT aparece normalmente na agenda de Hoje e Semanal', async () => {
    const ftExt: FamilyTask = {
      id: 'ft-agenda-ext',
      family_id: testFamily.id,
      name: 'Manutenção Mensal Ar Condicionado',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'sup-tecnico',
      active: true
    };

    const asgExt: TaskAssignment = {
      id: `ft-agenda-ext_${today}`,
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
      throw new Error(`Esperado 1 tarefa mapeada na agenda, obtido: ${tasks.length}`);
    }

    const t = tasks[0];
    if (t.executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`executionTarget esperado EXTERNAL_SUPPORT, obtido: ${t.executionTarget}`);
    }
    if (t.dueDate !== today) {
      throw new Error(`dueDate esperado ${today}, obtido: ${t.dueDate}`);
    }
  });

  // ETM-06: distributeEligibleOccurrences no RoutineContinuityService ignora EXTERNAL_SUPPORT
  await record('ETM-06', 'distributeEligibleOccurrences ignora ocorrências EXTERNAL_SUPPORT', async () => {
    const ftExt: FamilyTask = {
      id: 'ft-rcs-ext',
      family_id: testFamily.id,
      name: 'Lavagem de Estofados',
      task_master_id: 'clean-2',
      frequency: 'DAILY',
      executionTarget: 'EXTERNAL_SUPPORT',
      active: true
    };

    const ftHh: FamilyTask = {
      id: 'ft-rcs-hh',
      family_id: testFamily.id,
      name: 'Varrer Cozinha',
      task_master_id: 'clean-1',
      frequency: 'DAILY',
      executionTarget: 'HOUSEHOLD',
      active: true
    };

    const asgExt: TaskAssignment = {
      id: `ft-rcs-ext_${today}`,
      family_id: testFamily.id,
      family_task_id: ftExt.id,
      task_id: 'clean-2',
      scheduled_date: today,
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    const asgHh: TaskAssignment = {
      id: `ft-rcs-hh_${today}`,
      family_id: testFamily.id,
      family_task_id: ftHh.id,
      task_id: 'clean-1',
      scheduled_date: today,
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    const distResult = await RoutineContinuityService.distributeEligibleOccurrences({
      family: testFamily,
      assignments: [asgExt, asgHh],
      members,
      protectedTimes: [],
      targetDates: [today],
      routines: [ftExt, ftHh],
      isDemoMode: true
    });

    // asgExt não deve ser atribuído a membro
    const resExt = distResult.allAssignments.find(a => a.id === asgExt.id);
    if (resExt && resExt.member_id && resExt.member_id !== '') {
      throw new Error(`asgExt EXTERNAL_SUPPORT foi indevidamente atribuído ao membro: ${resExt.member_id}`);
    }

    // asgHh deve ser atribuído a um membro
    const resHh = distResult.allAssignments.find(a => a.id === asgHh.id);
    if (!resHh || !resHh.member_id) {
      throw new Error('asgHh HOUSEHOLD deveria ter sido distribuído para um membro');
    }
  });

  return { passed, failed, results };
}
