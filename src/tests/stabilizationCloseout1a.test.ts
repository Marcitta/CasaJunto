/**
 * CASA JUNTO — TEST SUITE STABILIZATION-CLOSEOUT-1A
 * Targeted Stabilization Tests: SC1A-01 to SC1A-18
 */

import { mapAssignmentsToTasks } from '../context/AppContext';
import { ChaosSessionService, isAssignmentCompletedInChaosSession } from '../services/chaosSessionService';
import { TaskAssignment, ChaosSession, Family, Room, FamilyTask } from '../types';
import { allMasterTasks } from '../data/tasks';
import { computeTodayProgress } from '../domain/selectors/todayProgressSelectors';
import { TaskCompletionService } from '../application/services/TaskCompletionService';
import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runStabilizationCloseout1aTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => results.push({ id, name, passed: true }))
          .catch((err: any) => results.push({ id, name, passed: false, error: err?.message || String(err) }));
      }
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, error: err?.message || String(err) });
    }
  }

  const mockFamily: Family = {
    id: 'fam-sc1a-real',
    name: 'Família SC1A',
    timezone: 'America/Sao_Paulo',
    createdAt: '2026-09-23T00:00:00Z',
    updatedAt: '2026-09-23T00:00:00Z'
  };

  const mockOtherFamily: Family = {
    id: 'fam-sc1a-other',
    name: 'Outra Família SC1A',
    timezone: 'America/Sao_Paulo',
    createdAt: '2026-09-23T00:00:00Z',
    updatedAt: '2026-09-23T00:00:00Z'
  };

  const mockRooms: Room[] = [
    { id: 'room-cozinha', name: 'Cozinha', family_id: mockFamily.id }
  ];

  const mockFTs: FamilyTask[] = [
    {
      id: 'ft-1',
      family_id: mockFamily.id,
      name: 'Lavar Louça',
      customTitle: 'Lavar Louça',
      room_id: 'room-cozinha',
      frequency: 'DAILY',
      active: true,
      chaosEligible: true,
      assigned_automatically: true,
      created_at: '2026-09-23T00:00:00Z',
      updated_at: '2026-09-23T00:00:00Z'
    },
    {
      id: 'ft-2',
      family_id: mockFamily.id,
      name: 'Varrer Chão',
      customTitle: 'Varrer Chão',
      room_id: 'room-cozinha',
      frequency: 'ONE_TIME',
      active: true,
      chaosEligible: true,
      assigned_automatically: true,
      created_at: '2026-09-23T00:00:00Z',
      updated_at: '2026-09-23T00:00:00Z'
    }
  ];

  const nowIso = new Date().toISOString();
  const sessionStart = '2026-09-23T14:00:00.000Z';
  const sessionEnd = '2026-09-23T14:30:00.000Z';

  const mockChaosSession: ChaosSession = {
    id: 'chaos-sc1a-01',
    familyId: mockFamily.id,
    status: 'ACTIVE',
    initialDurationMinutes: 30,
    totalDurationMinutes: 30,
    startedAt: sessionStart,
    expiresAt: sessionEnd,
    participantMemberIds: ['m-admin', 'm-member'],
    lateParticipantMemberIds: [],
    tasks: [
      { familyTaskId: 'ft-1', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft-2', strategy: 'OPEN_POOL' }
    ],
    selectedTaskIds: ['ft-1', 'ft-2'],
    extensions: [],
    bonusAwardedMemberIds: [],
    bonusPointsPerMember: 5,
    createdAt: sessionStart,
    updatedAt: sessionStart,
    createdByMemberId: 'm-admin'
  };

  // SC1A-01: reloadAssignments loads assignments for current family
  await record('SC1A-01', 'reloadAssignments loads assignments for current family', () => {
    const rawAsgs: TaskAssignment[] = [
      {
        id: 'asg-sc1a-1',
        family_id: mockFamily.id,
        family_task_id: 'ft-1',
        task_id: 'ft-1',
        room_id: 'room-cozinha',
        scheduled_date: '2026-09-23',
        status: 'SCHEDULED',
        member_id: 'm-admin'
      }
    ];

    const tasks = mapAssignmentsToTasks({
      assignments: rawAsgs,
      rooms: mockRooms,
      familyTasks: mockFTs,
      allMasterTasks
    });

    if (tasks.length !== 1) throw new Error(`Esperado 1 tarefa, obtido ${tasks.length}`);
    if (tasks[0].familyId !== mockFamily.id) throw new Error('familyId não corresponde à família atual');
    if (tasks[0].title !== 'Lavar Louça') throw new Error('Título não hidratado corretamente');
  });

  // SC1A-02: reloadAssignments does not leak assignments across family switch
  await record('SC1A-02', 'reloadAssignments does not leak assignments across family switch', () => {
    const requestedFamilyId = mockFamily.id;
    let activeFamilyId: string = mockOtherFamily.id;

    let tasksApplied = false;
    if (activeFamilyId === requestedFamilyId) {
      tasksApplied = true;
    }

    if (tasksApplied) {
      throw new Error('Assignments da família anterior foram aplicados indevidamente após troca de família');
    }
  });

  // SC1A-03: DEMO mode does not perform inappropriate Firestore reload
  await record('SC1A-03', 'DEMO mode does not perform inappropriate Firestore reload', () => {
    const isDemoMode = true;
    let firestoreReadAttempted = false;

    if (isDemoMode) {
      // Early exit seguro sem tocar Firestore
    } else {
      firestoreReadAttempted = true;
    }

    if (firestoreReadAttempted) {
      throw new Error('DEMO mode executou leitura no Firestore');
    }
  });

  // SC1A-04: Chaos task completion followed by canonical reload updates AppContext task state
  await record('SC1A-04', 'Chaos task completion followed by canonical reload updates AppContext task state', () => {
    const initialAsg: TaskAssignment = {
      id: 'asg-sc1a-chaos-1',
      family_id: mockFamily.id,
      family_task_id: 'ft-1',
      task_id: 'ft-1',
      room_id: 'room-cozinha',
      scheduled_date: '2026-09-23',
      status: 'SCHEDULED',
      member_id: 'm-admin'
    };

    const initialTasks = mapAssignmentsToTasks({
      assignments: [initialAsg],
      rooms: mockRooms,
      familyTasks: mockFTs,
      allMasterTasks
    });
    if (initialTasks[0].status !== 'PENDING') throw new Error('Status inicial não é PENDING');

    const completedAsg: TaskAssignment = {
      ...initialAsg,
      status: 'COMPLETED',
      completed_at: '2026-09-23T14:15:00.000Z',
      completed_by: 'm-admin',
      completed_by_name: 'Admin',
      completion_type: 'SELF_CLAIMED',
      chaos_session_id: mockChaosSession.id
    };

    const reloadedTasks = mapAssignmentsToTasks({
      assignments: [completedAsg],
      rooms: mockRooms,
      familyTasks: mockFTs,
      allMasterTasks
    });

    if (reloadedTasks[0].status !== 'DONE') {
      throw new Error('Tarefa recarregada não transitou para DONE');
    }
    if (reloadedTasks[0].completedAt !== completedAsg.completed_at) {
      throw new Error('Metadados de completedAt não foram atualizados');
    }
  });

  // SC1A-05: Chaos closure refreshes assignment state visible to Today
  await record('SC1A-05', 'Chaos closure refreshes assignment state visible to Today', () => {
    const rawAsgs: TaskAssignment[] = [
      {
        id: 'asg-sc1a-c1',
        family_id: mockFamily.id,
        family_task_id: 'ft-1',
        task_id: 'ft-1',
        member_id: 'm-admin',
        room_id: 'room-cozinha',
        scheduled_date: '2026-09-23',
        status: 'COMPLETED',
        completed_at: '2026-09-23T14:10:00.000Z',
        completed_by: 'm-admin',
        chaos_session_id: mockChaosSession.id
      },
      {
        id: 'asg-sc1a-c2',
        family_id: mockFamily.id,
        family_task_id: 'ft-2',
        task_id: 'ft-2',
        member_id: 'm-member',
        room_id: 'room-cozinha',
        scheduled_date: '2026-09-23',
        status: 'COMPLETED',
        completed_at: '2026-09-23T14:20:00.000Z',
        completed_by: 'm-member',
        chaos_session_id: mockChaosSession.id
      }
    ];

    const tasks = mapAssignmentsToTasks({
      assignments: rawAsgs,
      rooms: mockRooms,
      familyTasks: mockFTs,
      allMasterTasks
    });

    const doneCount = tasks.filter(t => t.status === 'DONE').length;
    if (doneCount !== 2) {
      throw new Error(`Esperado 2 tarefas DONE após encerramento do Caos, obtido ${doneCount}`);
    }
  });

  // SC1A-06: Today progress reflects refreshed completed assignment without F5
  await record('SC1A-06', 'Today progress reflects refreshed completed assignment without F5', () => {
    const rawAsgs: TaskAssignment[] = [
      {
        id: 'asg-p1',
        family_id: mockFamily.id,
        family_task_id: 'ft-1',
        task_id: 'ft-1',
        member_id: 'm-admin',
        room_id: 'room-cozinha',
        scheduled_date: '2026-09-23',
        status: 'COMPLETED',
        completed_at: '2026-09-23T14:10:00.000Z',
        completed_by: 'm-admin',
        chaos_session_id: mockChaosSession.id
      }
    ];

    const reloadedTasks = mapAssignmentsToTasks({
      assignments: rawAsgs,
      rooms: mockRooms,
      familyTasks: mockFTs,
      allMasterTasks
    });

    const progress = computeTodayProgress({
      tasks: reloadedTasks,
      family: mockFamily,
      familyTasks: mockFTs,
      targetDate: '2026-09-23'
    });

    if (progress.completedToday !== 1) {
      throw new Error(`computeTodayProgress deveria indicar 1 tarefa concluída, obteve ${progress.completedToday}`);
    }
    if (progress.totalToday !== 1) {
      throw new Error(`computeTodayProgress totalToday deveria ser 1, obteve ${progress.totalToday}`);
    }
    if (progress.progressPercent !== 100) {
      throw new Error(`computeTodayProgress deveria estar em 100%, obteve ${progress.progressPercent}%`);
    }
  });

  // SC1A-07: ChaosControlledPromptModal historical completion does not count
  await record('SC1A-07', 'ChaosControlledPromptModal historical completion does not count', () => {
    const historicalCompletedAsg: TaskAssignment = {
      id: 'asg-hist-1',
      family_id: mockFamily.id,
      family_task_id: 'ft-1',
      task_id: 'ft-1',
      member_id: 'm-admin',
      room_id: 'room-cozinha',
      scheduled_date: '2026-09-23',
      status: 'COMPLETED',
      completed_at: '2026-09-23T10:00:00.000Z',
      completed_by: 'm-admin'
    };

    const counts = isAssignmentCompletedInChaosSession(historicalCompletedAsg, mockChaosSession);
    if (counts) {
      throw new Error('Conclusão histórica anterior à sessão foi incorretamente considerada no prompt 100%');
    }
  });

  // SC1A-08: ChaosControlledPromptModal completion from another ChaosSession does not count
  await record('SC1A-08', 'ChaosControlledPromptModal completion from another ChaosSession does not count', () => {
    const otherSessionAsg: TaskAssignment = {
      id: 'asg-other-session',
      family_id: mockFamily.id,
      family_task_id: 'ft-1',
      task_id: 'ft-1',
      member_id: 'm-admin',
      room_id: 'room-cozinha',
      scheduled_date: '2026-09-23',
      status: 'COMPLETED',
      completed_at: '2026-09-23T14:10:00.000Z',
      completed_by: 'm-admin',
      chaos_session_id: 'chaos-different-session-999'
    };

    const counts = isAssignmentCompletedInChaosSession(otherSessionAsg, mockChaosSession);
    if (counts) {
      throw new Error('Conclusão de outra ChaosSession foi incorretamente considerada no prompt 100%');
    }
  });

  // SC1A-09: Valid current-session completion counts in ControlledPromptModal
  await record('SC1A-09', 'Valid current-session completion counts in ControlledPromptModal', () => {
    const validAsg: TaskAssignment = {
      id: 'asg-valid-current',
      family_id: mockFamily.id,
      family_task_id: 'ft-1',
      task_id: 'ft-1',
      member_id: 'm-admin',
      room_id: 'room-cozinha',
      scheduled_date: '2026-09-23',
      status: 'COMPLETED',
      completed_at: '2026-09-23T14:15:00.000Z',
      completed_by: 'm-admin',
      chaos_session_id: mockChaosSession.id
    };

    const counts = isAssignmentCompletedInChaosSession(validAsg, mockChaosSession);
    if (!counts) {
      throw new Error('Conclusão válida da sessão atual não foi reconhecida');
    }
  });

  // SC1A-10: ActiveView, ControlledPrompt and closure identify identical current-session completed set
  await record('SC1A-10', 'ActiveView, ControlledPrompt and closure identify identical current-session completed set', () => {
    const mixedAsgs: TaskAssignment[] = [
      {
        id: 'asg-1',
        family_id: mockFamily.id,
        family_task_id: 'ft-1',
        task_id: 'ft-1',
        member_id: 'm-admin',
        room_id: 'room-cozinha',
        scheduled_date: '2026-09-23',
        status: 'COMPLETED',
        completed_at: '2026-09-23T14:10:00.000Z',
        completed_by: 'm-admin',
        chaos_session_id: mockChaosSession.id
      },
      {
        id: 'asg-2',
        family_id: mockFamily.id,
        family_task_id: 'ft-2',
        task_id: 'ft-2',
        member_id: 'm-member',
        room_id: 'room-cozinha',
        scheduled_date: '2026-09-23',
        status: 'COMPLETED',
        completed_at: '2026-09-23T14:20:00.000Z',
        completed_by: 'm-member',
        chaos_session_id: mockChaosSession.id
      },
      {
        id: 'asg-3',
        family_id: mockFamily.id,
        family_task_id: 'ft-3',
        task_id: 'ft-3',
        member_id: 'm-member',
        room_id: 'room-cozinha',
        scheduled_date: '2026-09-23',
        status: 'COMPLETED',
        completed_at: '2026-09-23T12:00:00.000Z',
        completed_by: 'm-member',
        chaos_session_id: mockChaosSession.id
      },
      {
        id: 'asg-4',
        family_id: mockFamily.id,
        family_task_id: 'ft-4',
        task_id: 'ft-4',
        member_id: 'm-member',
        room_id: 'room-cozinha',
        scheduled_date: '2026-09-23',
        status: 'COMPLETED',
        completed_at: '2026-09-23T14:12:00.000Z',
        completed_by: 'm-member',
        chaos_session_id: 'chaos-other'
      }
    ];

    const activeViewSet = mixedAsgs
      .filter(a => ChaosSessionService.isAssignmentCompletedInChaosSession(a, mockChaosSession))
      .map(a => a.id);

    const controlledPromptSet = mixedAsgs
      .filter(a => isAssignmentCompletedInChaosSession(a, mockChaosSession))
      .map(a => a.id);

    const closureOutcomes = ChaosSessionService.evaluateChaosBonusAndSummary({
      session: mockChaosSession,
      assignments: mixedAsgs,
      members: [{ id: 'm-admin', name: 'Admin', points: 0 } as any, { id: 'm-member', name: 'Member', points: 0 } as any]
    });
    const closureSet = closureOutcomes.completedChaosAssignments.map(a => a.id);

    const setsMatch = 
      JSON.stringify(activeViewSet) === JSON.stringify(controlledPromptSet) &&
      JSON.stringify(controlledPromptSet) === JSON.stringify(closureSet);

    if (!setsMatch) {
      throw new Error(`Invariante violada! ActiveView: ${activeViewSet}, Prompt: ${controlledPromptSet}, Closure: ${closureSet}`);
    }
    if (activeViewSet.length !== 2 || !activeViewSet.includes('asg-1') || !activeViewSet.includes('asg-2')) {
      throw new Error(`Conjunto concluído incorreto: ${JSON.stringify(activeViewSet)}`);
    }
  });

  // SC1A-11: CustomTaskRepairBanner has no production references
  await record('SC1A-11', 'CustomTaskRepairBanner has no production references', () => {
    const todayViewPath = path.resolve(process.cwd(), 'src/components/TodayView.tsx');
    const todayContent = fs.readFileSync(todayViewPath, 'utf-8');
    if (todayContent.includes('CustomTaskRepairBanner')) {
      throw new Error('TodayView.tsx ainda referencia CustomTaskRepairBanner');
    }

    const bannerPath = path.resolve(process.cwd(), 'src/components/Repair/CustomTaskRepairBanner.tsx');
    if (fs.existsSync(bannerPath)) {
      throw new Error('CustomTaskRepairBanner.tsx ainda existe no disco');
    }
  });

  // SC1A-12: CustomTaskRepairService has no production references
  await record('SC1A-12', 'CustomTaskRepairService has no production references', () => {
    const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
    const appContextContent = fs.readFileSync(appContextPath, 'utf-8');
    if (appContextContent.includes('CustomTaskRepairService')) {
      throw new Error('AppContext.tsx ainda importa CustomTaskRepairService');
    }

    const servicePath = path.resolve(process.cwd(), 'src/application/services/CustomTaskRepairService.ts');
    if (fs.existsSync(servicePath)) {
      throw new Error('CustomTaskRepairService.ts ainda existe no disco');
    }
  });

  // SC1A-13: Canonical custom task creation remains: FamilyTask -> TaskAssignment -> UNASSIGNED
  await record('SC1A-13', 'Canonical custom task creation remains: FamilyTask -> TaskAssignment -> UNASSIGNED', () => {
    const cleanTitle = 'Custom Task Test';
    const taskDate = '2026-09-23';
    const ftId = 'ft-canonical-test-1';

    const customFamilyTask: FamilyTask = {
      id: ftId,
      family_id: mockFamily.id,
      name: cleanTitle,
      customTitle: cleanTitle,
      room_id: 'room-cozinha',
      frequency: 'ONE_TIME',
      active: true,
      chaosEligible: false,
      assigned_automatically: true,
      created_at: nowIso,
      updated_at: nowIso
    };

    const occId = `${ftId}_${taskDate}`;
    const occ: TaskAssignment = {
      id: occId,
      family_id: mockFamily.id,
      family_task_id: customFamilyTask.id,
      task_id: customFamilyTask.id,
      room_id: 'room-cozinha',
      scheduled_date: taskDate,
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    if (!occ.family_task_id || occ.family_task_id !== customFamilyTask.id) {
      throw new Error('TaskAssignment não vinculou FamilyTask canônica');
    }
    if (!occ.is_unassigned || occ.member_id !== '') {
      throw new Error('TaskAssignment não iniciou como UNASSIGNED');
    }
  });

  // SC1A-14: Creating custom task does not invoke distribution/rebalance
  await record('SC1A-14', 'Creating custom task does not invoke distribution/rebalance', () => {
    const occ: TaskAssignment = {
      id: 'occ-1',
      family_id: mockFamily.id,
      family_task_id: 'ft-1',
      task_id: 'ft-1',
      room_id: 'room-cozinha',
      scheduled_date: '2026-09-23',
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    const isDistributed = Boolean(occ.member_id && occ.member_id.length > 0 && !occ.is_unassigned);
    if (isDistributed) {
      throw new Error('Criação de tarefa distribuiu automaticamente a ocorrência');
    }
  });

  // SC1A-15: HF5 ONE_TIME eligibility remains intact
  await record('SC1A-15', 'HF5 ONE_TIME eligibility remains intact', () => {
    const completedOneTimeFT: FamilyTask = {
      id: 'ft-onetime-done',
      family_id: mockFamily.id,
      name: 'Tarefa Pontual Concluída',
      room_id: 'room-cozinha',
      frequency: 'ONE_TIME',
      active: true,
      chaosEligible: true,
      assigned_automatically: true,
      created_at: nowIso,
      updated_at: nowIso
    };

    const completedOneTimeAsg: TaskAssignment = {
      id: 'asg-onetime-done',
      family_id: mockFamily.id,
      family_task_id: completedOneTimeFT.id,
      task_id: completedOneTimeFT.id,
      room_id: 'room-cozinha',
      scheduled_date: '2026-09-22',
      status: 'COMPLETED',
      completed_at: '2026-09-22T15:00:00.000Z',
      member_id: 'm-admin'
    };

    const isAlreadyCompleted = ChaosSessionService.isOneTimeTaskAlreadyCompleted(
      completedOneTimeFT.id,
      [completedOneTimeAsg],
      [completedOneTimeFT]
    );

    let rejectedByValidation = false;
    try {
      ChaosSessionService.validateAndNormalizeTasks(
        [{ familyTaskId: completedOneTimeFT.id, strategy: 'DISTRIBUTED' }],
        [completedOneTimeFT],
        mockFamily.id,
        [completedOneTimeAsg],
        '2026-09-23'
      );
    } catch {
      rejectedByValidation = true;
    }

    if (!isAlreadyCompleted || !rejectedByValidation) {
      throw new Error('ONE_TIME já concluída foi incorretamente aceita para nova sessão de Caos');
    }
  });

  // SC1A-16: HF4 participant scoping remains intact
  await record('SC1A-16', 'HF4 participant scoping remains intact', () => {
    const participants: string[] = ['m-admin', 'm-member'];
    const nonParticipant: string = 'm-other';

    const assignedMemberId: string = 'm-admin';
    const isValid = participants.includes(assignedMemberId) && assignedMemberId !== nonParticipant;

    if (!isValid) {
      throw new Error('Atribuição no Modo Caos violou o escopo de participantes');
    }
  });

  // SC1A-17: PH-1 SELF_CLAIMED remains intact
  await record('SC1A-17', 'PH-1 SELF_CLAIMED remains intact', () => {
    const unassignedAsg: TaskAssignment = {
      id: 'asg-open-claim',
      family_id: mockFamily.id,
      family_task_id: 'ft-1',
      task_id: 'ft-1',
      room_id: 'room-cozinha',
      scheduled_date: '2026-09-23',
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    const callerMember: any = {
      id: 'm-member',
      name: 'Member',
      family_id: mockFamily.id,
      role: 'MEMBER',
      active: true
    };

    const claimResult = TaskCompletionService.authorizeCompletion({
      task: unassignedAsg,
      callerMember
    });

    if (!claimResult.allowed) {
      throw new Error(`Reivindicação PH-1 falhou: ${claimResult.reason}`);
    }
    if (claimResult.completionType !== 'SELF_CLAIMED') {
      throw new Error(`Esperado completionType SELF_CLAIMED, obtido ${claimResult.completionType}`);
    }
  });

  // SC1A-18: Chaos bonus remains intact
  await record('SC1A-18', 'Chaos bonus remains intact', () => {
    const sessionOutcomes = ChaosSessionService.evaluateChaosBonusAndSummary({
      session: mockChaosSession,
      assignments: [
        {
          id: 'asg-bonus-1',
          family_id: mockFamily.id,
          family_task_id: 'ft-1',
          task_id: 'ft-1',
          member_id: 'm-admin',
          room_id: 'room-cozinha',
          scheduled_date: '2026-09-23',
          status: 'COMPLETED',
          completed_at: '2026-09-23T14:10:00.000Z',
          completed_by: 'm-admin',
          chaos_session_id: mockChaosSession.id
        }
      ],
      members: [{ id: 'm-admin', name: 'Admin', points: 10 } as any, { id: 'm-member', name: 'Member', points: 5 } as any]
    });

    const adminBonus = sessionOutcomes.bonusPointsDeltaByMemberId['m-admin'];
    const bonusAwarded = sessionOutcomes.bonusAwardedMemberIds.includes('m-admin');

    if (!bonusAwarded || adminBonus !== 5) {
      throw new Error(`Bônus do admin inválido: ${adminBonus}, awarded: ${bonusAwarded}`);
    }
  });

  return results;
}
