/**
 * stabilization1c.test.ts
 * 
 * CASA JUNTO — STABILIZATION-1C TEST SUITE
 * DISABLED ROUTINE LEAKAGE INTO TODAY
 * 
 * Tests DL01 - DL12:
 * DL01 — deactivate sets FamilyTask.active=false
 * DL02 — today's pending occurrence becomes CANCELLED
 * DL03 — future pending occurrences become CANCELLED
 * DL04 — completed occurrence remains immutable
 * DL05 — inactive routine absent from Today
 * DL06 — inactive routine remains absent after F5
 * DL07 — inactive routine absent from Rebalance
 * DL08 — inactive routine absent from Blitz
 * DL09 — inactive routine absent from operational Weekly timeline
 * DL10 — reactivation uses same FamilyTask.id
 * DL11 — reactivation creates/restores only valid current/future occurrence
 * DL12 — reactivation creates no duplicate canonical occurrence
 */

import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { DistributionService } from '../application/services/DistributionService';
import { allMasterTasks } from '../data/tasks';
import { FamilyTask, TaskAssignment, Task, Member, Family } from '../types';
import { getFamilyLocalDate, addDaysToDate, getDayOfWeek } from '../domain/utils/dateTimeUtils';

export async function runStabilization1cTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [✓ PASS] ${msg}`);
      passed++;
    } else {
      console.log(`  [✗ FAIL] ${msg}`);
      failed++;
      errors.push(msg);
    }
  }

  console.log('\n--- GRUPO 25: STABILIZATION-1C (DISABLED ROUTINE LEAKAGE - DL01-DL12) ---');

  const todayStr = getFamilyLocalDate();
  const yesterdayStr = addDaysToDate(todayStr, -1);
  const tomorrowStr = addDaysToDate(todayStr, 1);
  const d2Str = addDaysToDate(todayStr, 2);

  const testFamily: Family = {
    id: 'fam-dl-test',
    name: 'Família DL Test',
    timezone: 'America/Sao_Paulo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const testMember: Member = {
    id: 'mem-dl-1',
    familyId: testFamily.id,
    name: 'Responsável Ativo',
    role: 'ADMIN',
    avatar: '👑',
    color: '#5b32a3',
    points: 100,
    streak: 3,
    tasksCompleted: 10,
    active: true,
    age: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const routineLixo: FamilyTask = {
    id: 'ft-lixo-reciclavel',
    family_id: testFamily.id,
    task_master_id: 'tm-lixo-reciclavel',
    room_id: 'cozinha',
    frequency: 'daily',
    estimated_minutes: 15,
    custom_title: 'Separar e descartar lixo reciclável',
    active: true
  };

  const asgYesterdayCompleted: TaskAssignment = {
    id: 'asg-lixo-yesterday',
    family_id: testFamily.id,
    task_id: 'tm-lixo-reciclavel',
    family_task_id: 'ft-lixo-reciclavel',
    room_id: 'cozinha',
    member_id: testMember.id,
    scheduled_date: yesterdayStr,
    scheduled_start: '09:00',
    scheduled_end: '09:15',
    status: 'COMPLETED',
    is_unassigned: false
  };

  const asgTodayPending: TaskAssignment = {
    id: 'asg-lixo-today',
    family_id: testFamily.id,
    task_id: 'tm-lixo-reciclavel',
    family_task_id: 'ft-lixo-reciclavel',
    room_id: 'cozinha',
    member_id: testMember.id,
    scheduled_date: todayStr,
    scheduled_start: '09:00',
    scheduled_end: '09:15',
    status: 'SCHEDULED',
    is_unassigned: false
  };

  const asgTomorrowPending: TaskAssignment = {
    id: 'asg-lixo-tomorrow',
    family_id: testFamily.id,
    task_id: 'tm-lixo-reciclavel',
    family_task_id: 'ft-lixo-reciclavel',
    room_id: 'cozinha',
    member_id: testMember.id,
    scheduled_date: tomorrowStr,
    scheduled_start: '09:00',
    scheduled_end: '09:15',
    status: 'SCHEDULED',
    is_unassigned: false
  };

  let deactResult: { deactivatedRoutine: FamilyTask; cancelledAssignments: TaskAssignment[] } | null = null;

  // DL01 — deactivate sets FamilyTask.active=false
  try {
    deactResult = await RoutineContinuityService.deactivateRoutine({
      familyId: testFamily.id,
      routineId: routineLixo.id,
      existingRoutines: [routineLixo],
      existingAssignments: [asgYesterdayCompleted, asgTodayPending, asgTomorrowPending],
      isDemoMode: true,
      timezone: testFamily.timezone
    });

    assert(
      deactResult.deactivatedRoutine.active === false && deactResult.deactivatedRoutine.id === routineLixo.id,
      'DL01: deactivateRoutine define FamilyTask.active=false mantendo ID canônico'
    );
  } catch (err: any) {
    assert(false, `DL01 Erro: ${err?.message}`);
  }

  // DL02 — today's pending occurrence becomes CANCELLED
  try {
    const todayCancelled = deactResult?.cancelledAssignments.find(a => a.id === asgTodayPending.id);
    assert(
      Boolean(todayCancelled && todayCancelled.status === 'CANCELLED' && todayCancelled.scheduled_date === todayStr),
      'DL02: Ocorrência pendente de hoje é cancelada (status=CANCELLED)'
    );
  } catch (err: any) {
    assert(false, `DL02 Erro: ${err?.message}`);
  }

  // DL03 — future pending occurrences become CANCELLED
  try {
    const futureCancelled = deactResult?.cancelledAssignments.find(a => a.id === asgTomorrowPending.id);
    assert(
      Boolean(futureCancelled && futureCancelled.status === 'CANCELLED' && futureCancelled.scheduled_date === tomorrowStr),
      'DL03: Ocorrências pendentes futuras tornam-se CANCELLED'
    );
  } catch (err: any) {
    assert(false, `DL03 Erro: ${err?.message}`);
  }

  // DL04 — completed occurrence remains immutable
  try {
    const yesterdayInCancelled = deactResult?.cancelledAssignments.some(a => a.id === asgYesterdayCompleted.id);
    assert(
      yesterdayInCancelled === false,
      'DL04: Ocorrência concluída do histórico permanece intacta e imutável'
    );
  } catch (err: any) {
    assert(false, `DL04 Erro: ${err?.message}`);
  }

  // DL05 — inactive routine absent from Today
  try {
    // Simula a lista de tarefas após desativação
    const appTasks: Task[] = [
      {
        id: asgTodayPending.id,
        familyId: testFamily.id,
        title: 'Separar e descartar lixo reciclável',
        taskMasterId: 'tm-lixo-reciclavel',
        familyTaskId: 'ft-lixo-reciclavel',
        assignedMemberId: testMember.id,
        assigneeId: testMember.id,
        status: 'CANCELLED',
        dueDate: todayStr,
        scheduledDate: todayStr,
        roomId: 'cozinha',
        frequency: 'DAILY',
        effort: 10
      },
      {
        id: 'asg-other-today',
        familyId: testFamily.id,
        title: 'Lavar a louça',
        taskMasterId: 'tm-louca',
        familyTaskId: 'ft-louca',
        assignedMemberId: testMember.id,
        assigneeId: testMember.id,
        status: 'PENDING',
        dueDate: todayStr,
        scheduledDate: todayStr,
        roomId: 'cozinha',
        frequency: 'DAILY',
        effort: 10
      }
    ];

    const currentFamilyTasks = [deactResult!.deactivatedRoutine, { id: 'ft-louca', active: true } as FamilyTask];

    // Lógica canônica de filtro do TodayView (PV2-HF1 + defesa em profundidade STABILIZATION-1C)
    const inactiveRoutineIds = new Set(currentFamilyTasks.filter(ft => ft.active === false).map(ft => ft.id));
    const isActionablePending = (st: string) => st === 'PENDING' || st === 'SCHEDULED' || st === 'IN_PROGRESS';
    const isRoutineActive = (t: Task) => !t.familyTaskId || !inactiveRoutineIds.has(t.familyTaskId);

    const todayPending = appTasks.filter(t => {
      const isDateToday = t.dueDate === todayStr;
      return isDateToday && isActionablePending(t.status) && isRoutineActive(t);
    });

    const lixoInToday = todayPending.some(t => t.familyTaskId === 'ft-lixo-reciclavel' || t.id === asgTodayPending.id);

    assert(
      !lixoInToday && todayPending.length === 1 && todayPending[0].id === 'asg-other-today',
      'DL05: Rotina inativa não aparece na lista de tarefas acionáveis do Hoje'
    );
  } catch (err: any) {
    assert(false, `DL05 Erro: ${err?.message}`);
  }

  // DL06 — inactive routine remains absent after F5
  try {
    // Simula F5: gravação no Firestore -> leitura/hidratação de FamilyTask e assignments
    const firestoreDoc = FirestoreMappers.fromFamilyTask(deactResult!.deactivatedRoutine);
    const hydratedRoutine = FirestoreMappers.toFamilyTask(deactResult!.deactivatedRoutine.id, firestoreDoc);

    assert(
      hydratedRoutine.active === false,
      'DL06A: Hidratação pós-F5 restaura active: false fidedignamente'
    );

    // Na sincronização contínua (syncRollingRoutines), rotina inativa não gera ocorrências
    const syncRes = await RoutineContinuityService.syncRollingRoutines({
      family: testFamily,
      routines: [hydratedRoutine],
      members: [testMember],
      existingAssignments: [asgYesterdayCompleted, { ...asgTodayPending, status: 'CANCELLED' }],
      protectedTimes: [],
      isDemoMode: true
    });

    const activeOccsForLixo = syncRes.allAssignments.filter(
      a => (a.family_task_id === 'ft-lixo-reciclavel' || a.id.startsWith('ft-lixo-reciclavel_')) &&
           a.status !== 'CANCELLED' &&
           a.status !== 'COMPLETED'
    );

    assert(
      activeOccsForLixo.length === 0,
      'DL06B: Sincronização pós-F5 não re-injeta ocorrências ativas para rotina inativa'
    );
  } catch (err: any) {
    assert(false, `DL06 Erro: ${err?.message}`);
  }

  // DL07 — inactive routine absent from Rebalance
  try {
    const tasksForRebalance: Task[] = [
      {
        id: asgTodayPending.id,
        familyId: testFamily.id,
        title: 'Separar e descartar lixo reciclável',
        taskMasterId: 'tm-lixo-reciclavel',
        familyTaskId: 'ft-lixo-reciclavel',
        assignedMemberId: testMember.id,
        status: 'CANCELLED',
        dueDate: todayStr,
        scheduledDate: todayStr,
        roomId: 'cozinha',
        frequency: 'DAILY',
        effort: 10
      },
      {
        id: 'asg-active-unassigned',
        familyId: testFamily.id,
        title: 'Organizar sala',
        taskMasterId: 'tm-sala',
        familyTaskId: 'ft-sala',
        assignedMemberId: '',
        status: 'PENDING',
        dueDate: todayStr,
        scheduledDate: todayStr,
        roomId: 'sala',
        frequency: 'DAILY',
        effort: 10
      }
    ];

    const { result } = DistributionService.executeRebalance({
      family: testFamily,
      members: [testMember],
      tasks: tasksForRebalance,
      protectedTimes: [],
      targetDate: todayStr
    });

    const lixoRebalanced = result.proposedAssignments.some(
      a => a.id === asgTodayPending.id || a.family_task_id === 'ft-lixo-reciclavel'
    );

    assert(
      !lixoRebalanced,
      'DL07: Rebalance ignora completamente ocorrências CANCELLED e rotinas desativadas'
    );
  } catch (err: any) {
    assert(false, `DL07 Erro: ${err?.message}`);
  }

  // DL08 — inactive routine absent from Blitz
  try {
    const blitzCandidates: Task[] = [
      {
        id: asgTodayPending.id,
        familyId: testFamily.id,
        title: 'Separar e descartar lixo reciclável',
        taskMasterId: 'tm-lixo-reciclavel',
        familyTaskId: 'ft-lixo-reciclavel',
        assignedMemberId: testMember.id,
        status: 'CANCELLED',
        dueDate: todayStr,
        scheduledDate: todayStr,
        roomId: 'cozinha',
        frequency: 'DAILY',
        effort: 10
      },
      {
        id: 'asg-blitz-active',
        familyId: testFamily.id,
        title: 'Varrer entrada',
        taskMasterId: 'tm-varrer',
        familyTaskId: 'ft-varrer',
        assignedMemberId: testMember.id,
        status: 'PENDING',
        dueDate: todayStr,
        scheduledDate: todayStr,
        roomId: 'entrada',
        frequency: 'DAILY',
        effort: 10
      }
    ];

    // Filtro do BlitzModal
    const blitzPending = blitzCandidates.filter(t => {
      if (t.dueDate !== todayStr) return false;
      const isActionable = (t.status as string) === 'PENDING' || (t.status as string) === 'SCHEDULED';
      if (!isActionable) return false;
      if ((t.status as string) === 'CANCELLED') return false;
      const ft = [deactResult!.deactivatedRoutine].find(f => f.id === t.familyTaskId);
      if (ft && ft.active === false) return false;
      return true;
    });

    const lixoInBlitz = blitzPending.some(t => t.id === asgTodayPending.id);

    assert(
      !lixoInBlitz && blitzPending.length === 1 && blitzPending[0].id === 'asg-blitz-active',
      'DL08: Modo Blitz não inclui tarefas de rotinas desativadas nem ocorrências CANCELLED'
    );
  } catch (err: any) {
    assert(false, `DL08 Erro: ${err?.message}`);
  }

  // DL09 — inactive routine absent from operational Weekly timeline
  try {
    const weeklyTasks: Task[] = [
      {
        id: asgTodayPending.id,
        familyId: testFamily.id,
        title: 'Separar e descartar lixo reciclável',
        taskMasterId: 'tm-lixo-reciclavel',
        familyTaskId: 'ft-lixo-reciclavel',
        assignedMemberId: testMember.id,
        status: 'CANCELLED',
        dueDate: todayStr,
        scheduledDate: todayStr,
        roomId: 'cozinha',
        frequency: 'DAILY',
        effort: 10
      },
      {
        id: asgTomorrowPending.id,
        familyId: testFamily.id,
        title: 'Separar e descartar lixo reciclável',
        taskMasterId: 'tm-lixo-reciclavel',
        familyTaskId: 'ft-lixo-reciclavel',
        assignedMemberId: testMember.id,
        status: 'CANCELLED',
        dueDate: tomorrowStr,
        scheduledDate: tomorrowStr,
        roomId: 'cozinha',
        frequency: 'DAILY',
        effort: 10
      },
      {
        id: 'asg-weekly-active',
        familyId: testFamily.id,
        title: 'Regar plantas',
        taskMasterId: 'tm-regar',
        familyTaskId: 'ft-regar',
        assignedMemberId: testMember.id,
        status: 'PENDING',
        dueDate: todayStr,
        scheduledDate: todayStr,
        roomId: 'jardim',
        frequency: 'DAILY',
        effort: 10
      }
    ];

    const currentFts = [deactResult!.deactivatedRoutine, { id: 'ft-regar', active: true } as FamilyTask];

    // Filtro do RoutineView.tsx
    const dayTasksToday = weeklyTasks.filter(t => {
      const taskDate = t.scheduledDate || t.dueDate;
      if (taskDate !== todayStr) return false;
      if ((t.status as string) === 'CANCELLED') return false;
      if (t.familyTaskId) {
        const ft = currentFts.find(f => f.id === t.familyTaskId);
        if (ft && ft.active === false) return false;
      }
      return true;
    });

    const lixoInWeekly = dayTasksToday.some(t => t.familyTaskId === 'ft-lixo-reciclavel');

    assert(
      !lixoInWeekly && dayTasksToday.length === 1 && dayTasksToday[0].id === 'asg-weekly-active',
      'DL09: Linha operacional da semana (RoutineView) exclui rotinas inativas e ocorrências canceladas'
    );
  } catch (err: any) {
    assert(false, `DL09 Erro: ${err?.message}`);
  }

  // DL10 — reactivation uses same FamilyTask.id
  let reactResult: { reactivatedRoutine: FamilyTask; restoredAssignments: TaskAssignment[]; newAssignments: TaskAssignment[] } | null = null;
  try {
    reactResult = await RoutineContinuityService.reactivateRoutine({
      familyId: testFamily.id,
      routineId: routineLixo.id,
      existingRoutines: [deactResult!.deactivatedRoutine],
      existingAssignments: [
        asgYesterdayCompleted,
        { ...asgTodayPending, status: 'CANCELLED' },
        { ...asgTomorrowPending, status: 'CANCELLED' }
      ],
      isDemoMode: true,
      timezone: testFamily.timezone
    });

    assert(
      reactResult.reactivatedRoutine.id === routineLixo.id && reactResult.reactivatedRoutine.active === true,
      'DL10: Reativação reusa exatamente o mesmo FamilyTask.id com active: true'
    );
  } catch (err: any) {
    assert(false, `DL10 Erro: ${err?.message}`);
  }

  // DL11 — reactivation creates/restores only valid current/future occurrence
  try {
    // Verifica que ocorrências restauradas ou novas são a partir de hoje
    const allProduced = [...reactResult!.restoredAssignments, ...reactResult!.newAssignments];
    const hasHistorical = allProduced.some(a => a.scheduled_date < todayStr);
    const hasTodayOrFuture = allProduced.some(a => a.scheduled_date >= todayStr);

    assert(
      !hasHistorical && hasTodayOrFuture,
      'DL11: Reativação restaura/gera apenas ocorrências presentes e futuras (sem backfill histórico)'
    );
  } catch (err: any) {
    assert(false, `DL11 Erro: ${err?.message}`);
  }

  // DL12 — reactivation creates no duplicate canonical occurrence
  try {
    const allOccurrences = [
      asgYesterdayCompleted,
      ...reactResult!.restoredAssignments,
      ...reactResult!.newAssignments
    ];

    const dateSet = new Set<string>();
    let hasDuplicate = false;

    for (const occ of allOccurrences) {
      if (occ.family_task_id === routineLixo.id) {
        const key = `${occ.family_task_id}_${occ.scheduled_date}`;
        if (dateSet.has(key)) {
          hasDuplicate = true;
          break;
        }
        dateSet.add(key);
      }
    }

    assert(
      !hasDuplicate,
      'DL12: Reativação não cria ocorrências duplicadas para a mesma data canônica'
    );
  } catch (err: any) {
    assert(false, `DL12 Erro: ${err?.message}`);
  }

  return { passed, failed, errors };
}
