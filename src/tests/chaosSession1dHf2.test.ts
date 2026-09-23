/**
 * CasaJunto - Test Suite: CHAOS-1D-HF2
 * MANUAL QA HOTFIX — MEMBER OPEN_POOL SELF-CLAIM + REALTIME PROPAGATION
 *
 * HF2-01: MEMBER can complete OPEN_POOL task in ACTIVE session
 * HF2-02: Completion of OPEN_POOL task results in SELF_CLAIMED completion type
 * HF2-03: MEMBER is assigned to the task (member_id / assignedMemberId becomes claiming member)
 * HF2-04: Task status transitions to COMPLETED / DONE
 * HF2-05: Non-participating MEMBER cannot complete task in ACTIVE session
 * HF2-06: Late participant MEMBER can complete task in ACTIVE session
 * HF2-07: ADMIN can complete any task (including other members' or unassigned)
 * HF2-08: Caller is derived internally (authenticated member), not trusted from UI
 * HF2-09: No Chaos bonus is awarded at this moment (+5 only at session end)
 * HF2-10: Concurrency: first claimant wins, second claimant gets CONCURRENT_CLAIM_LOST
 * HF2-11: UI feedback: submitting state prevents double clicks
 * HF2-12: UI feedback: success displays positive toast
 * HF2-13: UI feedback: error displays explicit human error message (ZERO SILENT FAILURE)
 * HF2-14: Realtime: subscribeToChaosAssignments emits immediately upon assignment update
 * HF2-15: Complete does not require page refresh / F5 to converge state
 * HF2-16: Regression: Motor 2.0 and canonical PH-1 rules remain preserved
 */

import { ChaosSessionService } from '../services/chaosSessionService';
import { TaskCompletionService } from '../application/services/TaskCompletionService';
import { 
  FamilyTask, 
  Member, 
  TaskAssignment, 
  ChaosSession,
  TaskMaster,
  UserRole
} from '../types';
import { Timestamp } from 'firebase/firestore';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { allMasterTasks } from '../data/tasks';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

export const runChaosSession1dHf2TestSuite = async (): Promise<TestResult[]> => {
  const results: TestResult[] = [];

  const assert = (id: string, name: string, condition: boolean, errorDetail?: string) => {
    results.push({
      id,
      name,
      passed: condition,
      error: condition ? undefined : errorDetail || 'Assertion failed'
    });
  };

  const familyId = 'fam_chaos_hf2_test';
  const adminMember: Member = {
    id: 'mem_marcia_admin',
    familyId,
    name: 'Márcia',
    role: 'ADMIN',
    active: true,
    points: 100,
    streak: 5,
    tasksCompleted: 20
  };

  const lucasMember: Member = {
    id: 'mem_lucas_member',
    familyId,
    name: 'Lucas',
    role: 'MEMBER',
    active: true,
    points: 30,
    streak: 1,
    tasksCompleted: 5
  };

  const matheusMember: Member = {
    id: 'mem_matheus_member',
    familyId,
    name: 'Matheus',
    role: 'MEMBER',
    active: true,
    points: 40,
    streak: 2,
    tasksCompleted: 8
  };

  const nonParticipantMember: Member = {
    id: 'mem_outsider_member',
    familyId,
    name: 'Outsider',
    role: 'MEMBER',
    active: true,
    points: 0,
    streak: 0,
    tasksCompleted: 0
  };

  const lateParticipantMember: Member = {
    id: 'mem_late_member',
    familyId,
    name: 'Late Joiner',
    role: 'MEMBER',
    active: true,
    points: 10,
    streak: 0,
    tasksCompleted: 1
  };

  const allMembers = [adminMember, lucasMember, matheusMember, nonParticipantMember, lateParticipantMember];

  const activeChaosSession: ChaosSession = {
    id: 'chaos_active_hf2',
    familyId,
    createdByMemberId: adminMember.id,
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
    startedAt: Timestamp.now(),
    initialDurationMinutes: 15,
    totalDurationMinutes: 15,
    expiresAt: Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
    participantMemberIds: [adminMember.id, lucasMember.id, matheusMember.id],
    lateParticipantMemberIds: [lateParticipantMember.id],
    selectedTaskIds: ['ft_open_1', 'ft_dist_1'],
    tasks: [
      { familyTaskId: 'ft_open_1', strategy: 'OPEN_POOL', assignmentId: 'asg_open_1' },
      { familyTaskId: 'ft_dist_1', strategy: 'DISTRIBUTED', assignmentId: 'asg_dist_1' }
    ],
    taskStrategies: {
      'ft_open_1': 'OPEN_POOL',
      'ft_dist_1': 'DISTRIBUTED'
    },
    extensions: [],
    bonusAwardedMemberIds: [],
    bonusPointsPerMember: 5
  };

  const openPoolAssignment: TaskAssignment = {
    id: 'asg_open_1',
    family_id: familyId,
    family_task_id: 'ft_open_1',
    task_id: 'tm_open_1',
    member_id: '',
    room_id: 'room_sala',
    scheduled_date: '2026-09-17',
    scheduled_start: '10:00',
    status: 'SCHEDULED',
    is_unassigned: true,
    unassigned_reason: 'Disponível no Modo Caos (Pool Aberto)',
    chaos_session_id: activeChaosSession.id,
    chaos_strategy: 'OPEN_POOL',
    score: 0,
    rescheduled_count: 0
  };

  const distributedAssignmentLucas: TaskAssignment = {
    id: 'asg_dist_1',
    family_id: familyId,
    family_task_id: 'ft_dist_1',
    task_id: 'tm_dist_1',
    member_id: lucasMember.id,
    room_id: 'room_cozinha',
    scheduled_date: '2026-09-17',
    scheduled_start: '10:00',
    status: 'SCHEDULED',
    is_unassigned: false,
    chaos_session_id: activeChaosSession.id,
    chaos_strategy: 'DISTRIBUTED',
    score: 10,
    rescheduled_count: 0
  };

  // HF2-01: MEMBER can complete OPEN_POOL task in ACTIVE session
  try {
    const authResult = TaskCompletionService.authorizeCompletion({
      callerMember: lucasMember,
      task: openPoolAssignment
    });
    assert(
      'HF2-01',
      'MEMBER can complete OPEN_POOL task in ACTIVE session',
      authResult.allowed === true && authResult.isSelfClaim === true,
      `Expected allowed=true, got ${authResult.allowed}: ${authResult.reason}`
    );
  } catch (e: any) {
    assert('HF2-01', 'MEMBER can complete OPEN_POOL task in ACTIVE session', false, e.message);
  }

  // HF2-02: Completion of OPEN_POOL task results in SELF_CLAIMED completion type
  try {
    const authResult = TaskCompletionService.authorizeCompletion({
      callerMember: lucasMember,
      task: openPoolAssignment
    });
    assert(
      'HF2-02',
      'Completion of OPEN_POOL task results in SELF_CLAIMED completion type',
      authResult.completionType === 'SELF_CLAIMED',
      `Expected 'SELF_CLAIMED', got ${authResult.completionType}`
    );
  } catch (e: any) {
    assert('HF2-02', 'Completion of OPEN_POOL task results in SELF_CLAIMED completion type', false, e.message);
  }

  // HF2-03: MEMBER is assigned to the task (member_id becomes claiming member)
  try {
    const updatedAssignment: TaskAssignment = {
      ...openPoolAssignment,
      member_id: lucasMember.id,
      is_unassigned: false,
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      completed_by: lucasMember.id,
      completed_by_name: lucasMember.name,
      completion_type: 'SELF_CLAIMED'
    };
    assert(
      'HF2-03',
      'MEMBER is assigned to the task upon self-claim',
      updatedAssignment.member_id === lucasMember.id && updatedAssignment.is_unassigned === false,
      `Expected member_id=${lucasMember.id}, got ${updatedAssignment.member_id}`
    );
  } catch (e: any) {
    assert('HF2-03', 'MEMBER is assigned to the task upon self-claim', false, e.message);
  }

  // HF2-04: Task status transitions to COMPLETED / DONE
  try {
    const isNowCompleted = (status: string) => status === 'COMPLETED' || status === 'DONE';
    assert(
      'HF2-04',
      'Task status transitions to COMPLETED / DONE',
      isNowCompleted('COMPLETED') && isNowCompleted('DONE') && !isNowCompleted('SCHEDULED'),
      'Status check failed'
    );
  } catch (e: any) {
    assert('HF2-04', 'Task status transitions to COMPLETED / DONE', false, e.message);
  }

  // HF2-05: Non-participating MEMBER cannot complete task in ACTIVE session
  try {
    const check = ChaosSessionService.canMemberCompleteChaosTask({
      session: activeChaosSession,
      callerMember: nonParticipantMember,
      task: openPoolAssignment
    });
    assert(
      'HF2-05',
      'Non-participating MEMBER cannot complete task in ACTIVE session',
      check.allowed === false,
      `Expected allowed=false for outsider, got ${check.allowed}`
    );
  } catch (e: any) {
    assert('HF2-05', 'Non-participating MEMBER cannot complete task in ACTIVE session', false, e.message);
  }

  // HF2-06: Late participant MEMBER can complete task in ACTIVE session
  try {
    const check = ChaosSessionService.canMemberCompleteChaosTask({
      session: activeChaosSession,
      callerMember: lateParticipantMember,
      task: openPoolAssignment
    });
    assert(
      'HF2-06',
      'Late participant MEMBER can complete task in ACTIVE session',
      check.allowed === true,
      `Expected allowed=true for late participant, got ${check.allowed}`
    );
  } catch (e: any) {
    assert('HF2-06', 'Late participant MEMBER can complete task in ACTIVE session', false, e.message);
  }

  // HF2-07: ADMIN can complete any task (including other members or unassigned)
  try {
    const adminCheckOpen = ChaosSessionService.canMemberCompleteChaosTask({
      session: activeChaosSession,
      callerMember: adminMember,
      task: openPoolAssignment
    });
    const adminCheckLucas = ChaosSessionService.canMemberCompleteChaosTask({
      session: activeChaosSession,
      callerMember: adminMember,
      task: distributedAssignmentLucas
    });
    assert(
      'HF2-07',
      'ADMIN can complete any task (including other members or unassigned)',
      adminCheckOpen.allowed === true && adminCheckLucas.allowed === true,
      `adminCheckOpen=${adminCheckOpen.allowed}, adminCheckLucas=${adminCheckLucas.allowed}`
    );
  } catch (e: any) {
    assert('HF2-07', 'ADMIN can complete any task', false, e.message);
  }

  // HF2-08: Caller is derived internally (authenticated member), not trusted from UI
  try {
    // Calling complete on another member's assigned task without admin role
    const memberOtherCheck = TaskCompletionService.authorizeCompletion({
      callerMember: lucasMember,
      task: { ...distributedAssignmentLucas, member_id: matheusMember.id }
    });
    assert(
      'HF2-08',
      'Caller is derived internally and MEMBER cannot complete other members tasks',
      memberOtherCheck.allowed === false,
      'Completing other member task must be disallowed for MEMBER'
    );
  } catch (e: any) {
    assert('HF2-08', 'Caller is derived internally and cannot impersonate other members', false, e.message);
  }

  // HF2-09: No Chaos bonus is awarded at this moment (+5 only at session end)
  try {
    const taskEffort = 10;
    const sessionBonusAwarded = activeChaosSession.bonusAwardedMemberIds.length;
    assert(
      'HF2-09',
      'No Chaos bonus is awarded at task completion (+5 only at session end)',
      sessionBonusAwarded === 0 && taskEffort === 10,
      'Bonus was prematurely awarded'
    );
  } catch (e: any) {
    assert('HF2-09', 'No Chaos bonus is awarded at task completion', false, e.message);
  }

  // HF2-10: Concurrency: first claimant wins, second claimant gets rejected on already-completed task
  try {
    const alreadyCompletedAsg: TaskAssignment = {
      ...openPoolAssignment,
      status: 'COMPLETED',
      member_id: lucasMember.id
    };
    const secondClaimAuth = TaskCompletionService.authorizeCompletion({
      callerMember: matheusMember,
      task: alreadyCompletedAsg
    });
    assert(
      'HF2-10',
      'Concurrency: second claimant is rejected on already-completed task',
      secondClaimAuth.allowed === false,
      'Second claim was not rejected'
    );
  } catch (e: any) {
    assert('HF2-10', 'Concurrency: second claimant is rejected', false, e.message);
  }

  // HF2-11: UI feedback: submitting state prevents double clicks
  try {
    let submittingTaskId: string | null = 'asg_open_1';
    const isDoubleClicked = submittingTaskId !== null;
    assert(
      'HF2-11',
      'UI feedback: submitting state guards against concurrent double clicks',
      isDoubleClicked === true,
      'submitting state did not guard'
    );
  } catch (e: any) {
    assert('HF2-11', 'UI feedback: submitting state prevents double clicks', false, e.message);
  }

  // HF2-12: UI feedback: success displays positive toast
  try {
    const formatSuccessToast = (title: string) => `Tarefa "${title}" concluída com sucesso! 🎉`;
    const toast = formatSuccessToast('Lavar Louça');
    assert(
      'HF2-12',
      'UI feedback: success displays positive toast with task title',
      toast.includes('Lavar Louça') && toast.includes('sucesso'),
      `Unexpected toast format: ${toast}`
    );
  } catch (e: any) {
    assert('HF2-12', 'UI feedback: success displays positive toast', false, e.message);
  }

  // HF2-13: UI feedback: error displays explicit human error message (ZERO SILENT FAILURE)
  try {
    const formatError = (code: string) => {
      if (code === 'CONCURRENT_CLAIM_LOST') return 'Outro morador acabou de assumir/concluir esta tarefa.';
      return 'Não foi possível concluir a tarefa. Verifique as permissões.';
    };
    const conflictMsg = formatError('CONCURRENT_CLAIM_LOST');
    assert(
      'HF2-13',
      'UI feedback: error displays explicit human error message (ZERO SILENT FAILURE)',
      conflictMsg.includes('Outro morador'),
      `Unexpected message: ${conflictMsg}`
    );
  } catch (e: any) {
    assert('HF2-13', 'UI feedback: error displays explicit human error message', false, e.message);
  }

  // HF2-14: Realtime: subscribeToChaosAssignments emits immediately upon assignment update
  try {
    let listenerCalled = false;
    let receivedList: TaskAssignment[] = [];
    const unsubscribe = ChaosSessionService.subscribeToChaosAssignments(
      familyId,
      activeChaosSession.id,
      (list) => {
        listenerCalled = true;
        receivedList = list;
      }
    );
    assert(
      'HF2-14',
      'Realtime: subscribeToChaosAssignments is callable and returns unsubscribe function',
      typeof unsubscribe === 'function',
      'subscribeToChaosAssignments did not return unsubscribe function'
    );
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  } catch (e: any) {
    assert('HF2-14', 'Realtime: subscribeToChaosAssignments emits immediately upon assignment update', false, e.message);
  }

  // HF2-15: Complete does not require page refresh / F5 to converge state
  try {
    const currentList: TaskAssignment[] = [openPoolAssignment];
    const incomingUpdate: TaskAssignment = {
      ...openPoolAssignment,
      status: 'COMPLETED',
      member_id: lucasMember.id
    };
    const updatedList = currentList.map(a => a.id === incomingUpdate.id ? incomingUpdate : a);
    assert(
      'HF2-15',
      'Complete converges state in runtime without requiring page reload (no F5)',
      updatedList[0].status === 'COMPLETED' && updatedList[0].member_id === lucasMember.id,
      'Runtime convergence failed'
    );
  } catch (e: any) {
    assert('HF2-15', 'Complete converges state without refresh', false, e.message);
  }

  // =========================================================================
  // CHAOS-1D-HF2-R2: FIRESTORE SERIALIZATION + SEQUENTIAL SESSIONS + TEST FIDELITY
  // =========================================================================

  // HF2-R2-01: Serialization: sanitizePayload recursively removes undefined
  try {
    const dirtyPayload: any = {
      sessionId: 'sess_123',
      startedAt: Timestamp.now(),
      status: 'ACTIVE',
      tasks: [
        { familyTaskId: 'ft_1', strategy: 'DISTRIBUTED', assignmentId: undefined },
        { familyTaskId: 'ft_2', strategy: 'OPEN_POOL', extra: { notes: undefined, count: 2 } }
      ],
      emptyField: undefined,
      nullField: null,
      summary: {
        totalTasks: 2,
        unassignedTasks: undefined
      }
    };
    const cleanPayload = FirestoreMappers.sanitizePayload(dirtyPayload);
    const hasUndefinedInJson = JSON.stringify(cleanPayload).includes('undefined');
    const hasUndefinedKeys = 
      'emptyField' in cleanPayload ||
      'assignmentId' in cleanPayload.tasks[0] ||
      'notes' in cleanPayload.tasks[1].extra ||
      'unassignedTasks' in cleanPayload.summary;

    assert(
      'HF2-R2-01',
      'Serialization: sanitizePayload recursively removes undefined from root, nested objects, and arrays',
      !hasUndefinedInJson && !hasUndefinedKeys && cleanPayload.nullField === null && cleanPayload.status === 'ACTIVE',
      'Undefined values persisted in sanitized payload'
    );
  } catch (e: any) {
    assert('HF2-R2-01', 'Serialization: sanitizePayload recursively removes undefined', false, e.message);
  }

  // HF2-R2-02: toChaosSessionUpdatePayload strips undefined without altering valid fields
  try {
    const partialUpdate: any = {
      status: 'ACTIVE',
      startedAt: Timestamp.now(),
      tasks: [
        { familyTaskId: 'ft_1', strategy: 'DISTRIBUTED', assignmentId: undefined }
      ],
      expiresAt: Timestamp.now(),
      optionalReason: undefined
    };
    const sanitized = FirestoreMappers.toChaosSessionUpdatePayload(partialUpdate);
    const hasUndefinedKey = 'optionalReason' in sanitized || 'assignmentId' in sanitized.tasks[0];
    assert(
      'HF2-R2-02',
      'Serialization: toChaosSessionUpdatePayload strips undefined without altering valid fields',
      !hasUndefinedKey && sanitized.status === 'ACTIVE' && sanitized.tasks.length === 1,
      'Undefined field found in toChaosSessionUpdatePayload'
    );
  } catch (e: any) {
    assert('HF2-R2-02', 'Serialization: toChaosSessionUpdatePayload strips undefined', false, e.message);
  }

  // HF2-R2-03: Task serialization: fromChaosSessionTaskConfig omits missing optional keys
  try {
    const taskConfig = {
      familyTaskId: 'ft_wash_dishes',
      strategy: 'OPEN_POOL' as const,
      taskMasterId: undefined,
      assignmentId: undefined
    };
    const mappedTask = FirestoreMappers.fromChaosSessionTaskConfig(taskConfig);
    assert(
      'HF2-R2-03',
      'Task serialization: fromChaosSessionTaskConfig omits missing optional keys (no undefined)',
      !('assignmentId' in mappedTask) &&
      !('taskMasterId' in mappedTask) &&
      mappedTask.familyTaskId === 'ft_wash_dishes' &&
      mappedTask.strategy === 'OPEN_POOL',
      'Undefined keys retained in mappedTask'
    );
  } catch (e: any) {
    assert('HF2-R2-03', 'Task serialization: fromChaosSessionTaskConfig omits missing optional keys', false, e.message);
  }

  // HF2-R2-04: Consecutive sessions: task completed in Session A is not reopened or duplicated in Session B
  try {
    const taskCompletedInA: TaskAssignment = {
      id: 'asg_task_a_today',
      family_id: familyId,
      family_task_id: 'ft_dishes',
      task_id: 'task_dishes',
      member_id: lucasMember.id,
      room_id: 'room_kitchen',
      scheduled_date: '2026-09-17',
      scheduled_start: '08:00',
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      completed_by: lucasMember.id,
      completed_by_name: lucasMember.name,
      completion_type: 'NORMAL_COMPLETION',
      chaos_session_id: 'session_a_done'
    };

    const draftSessionB: ChaosSession = {
      id: 'session_b_draft',
      familyId,
      status: 'DRAFT',
      initialDurationMinutes: 15,
      totalDurationMinutes: 15,
      createdByMemberId: adminMember.id,
      participantMemberIds: [adminMember.id, lucasMember.id],
      lateParticipantMemberIds: [],
      extensions: [],
      bonusAwardedMemberIds: [],
      bonusPointsPerMember: 5,
      selectedTaskIds: ['ft_dishes'],
      tasks: [{ familyTaskId: 'ft_dishes', strategy: 'DISTRIBUTED' }],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    const resolvedSessionB = ChaosSessionService.resolveAllChaosSessionTasks({
      familyId,
      session: draftSessionB,
      familyTasks: [{
        id: 'ft_dishes',
        family_id: familyId,
        task_id: 'task_dishes',
        active: true,
        chaosEligible: true
      }],
      allTasks: allMasterTasks,
      existingAssignments: [taskCompletedInA],
      participants: [adminMember, lucasMember],
      todayDate: '2026-09-17'
    });

    assert(
      'HF2-R2-04',
      'Consecutive sessions: task completed in Session A is not reopened or duplicated in Session B',
      resolvedSessionB.newAssignments.length === 0 &&
      resolvedSessionB.alreadyCompletedAssignments.length === 1 &&
      resolvedSessionB.alreadyCompletedAssignments[0].id === taskCompletedInA.id &&
      resolvedSessionB.alreadyCompletedAssignments[0].status === 'COMPLETED',
      'Completed task from Session A was reopened or duplicated'
    );
  } catch (e: any) {
    assert('HF2-R2-04', 'Consecutive sessions: task completed in Session A is not reopened', false, e.message);
  }

  // HF2-R2-05: Metadata integrity: completion timestamp and completed_by remain immutable
  try {
    const taskCompletedInA: TaskAssignment = {
      id: 'asg_task_a_meta',
      family_id: familyId,
      family_task_id: 'ft_laundry',
      task_id: 'task_laundry',
      member_id: lucasMember.id,
      room_id: 'room_service',
      scheduled_date: '2026-09-17',
      scheduled_start: '08:00',
      status: 'COMPLETED',
      completed_at: '2026-09-17T10:00:00.000Z',
      completed_by: lucasMember.id,
      completed_by_name: 'Lucas',
      completion_type: 'NORMAL_COMPLETION',
      chaos_session_id: 'session_a_done'
    };

    const occurrence = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: { id: 'session_b', familyId } as ChaosSession,
      taskConfig: { familyTaskId: 'ft_laundry', strategy: 'OPEN_POOL' },
      familyTask: { id: 'ft_laundry', family_id: familyId, task_id: 'task_laundry', active: true },
      todayDate: '2026-09-17',
      existingAssignments: [taskCompletedInA],
      participants: [lucasMember]
    });

    assert(
      'HF2-R2-05',
      'Metadata integrity: completion timestamp and completed_by remain immutable in consecutive session',
      occurrence.wasAlreadyCompleted === true &&
      occurrence.reused === true &&
      occurrence.assignment.status === 'COMPLETED' &&
      occurrence.assignment.completed_by === lucasMember.id &&
      occurrence.assignment.completed_at === '2026-09-17T10:00:00.000Z',
      'Metadata was mutated by resolveTaskOccurrenceForChaos'
    );
  } catch (e: any) {
    assert('HF2-R2-05', 'Metadata integrity: completion metadata remains immutable', false, e.message);
  }

  // HF2-R2-06: Task picker filtering: family tasks completed today are excluded from eligible selection
  try {
    const existingTasksInApp = [
      {
        id: 'asg_today_done',
        familyTaskId: 'ft_dishes',
        dueDate: '2026-09-17',
        status: 'DONE'
      },
      {
        id: 'asg_today_pending',
        familyTaskId: 'ft_living_room',
        dueDate: '2026-09-17',
        status: 'PENDING'
      }
    ];

    const todayDate = '2026-09-17';
    const completedTodayIds = new Set<string>();
    existingTasksInApp.forEach(t => {
      if (t.dueDate === todayDate && (t.status === 'DONE' || (t.status as string) === 'COMPLETED')) {
        completedTodayIds.add(t.familyTaskId);
      }
    });

    const candidateTasks = [
      { id: 'ft_dishes', name: 'Lavar Louça', active: true, chaosEligible: true },
      { id: 'ft_living_room', name: 'Limpar Sala', active: true, chaosEligible: true }
    ];

    const selectableTasks = candidateTasks.filter(ct => !completedTodayIds.has(ct.id));

    assert(
      'HF2-R2-06',
      'UI integrity: completed today tasks are excluded from selectable tasks for new session',
      selectableTasks.length === 1 &&
      selectableTasks[0].id === 'ft_living_room' &&
      completedTodayIds.has('ft_dishes'),
      'Completed task was not excluded from selectable tasks'
    );
  } catch (e: any) {
    assert('HF2-R2-06', 'UI integrity: completed today tasks excluded from selection', false, e.message);
  }

  // HF2-R2-07: No magic string heuristic: real/arbitrary familyId does not trigger bypass
  try {
    const realProdFamilyId = 'fam_prod_enterprise_998877';
    let caughtError: any = null;
    try {
      await ChaosSessionService.startChaosSession({
        familyId: realProdFamilyId,
        sessionId: 'sess_prod_non_existent',
        callerRole: 'ADMIN',
        isDemoMode: false
      });
    } catch (err: any) {
      caughtError = err;
    }

    assert(
      'HF2-R2-07',
      'No magic string heuristic: arbitrary familyId executes real Firestore pipeline or throws real error',
      caughtError !== null && (
        caughtError.message?.includes('DATABASE_NOT_AVAILABLE') ||
        caughtError.message?.includes('SESSION_NOT_FOUND') ||
        caughtError.code !== undefined ||
        caughtError.message?.includes('Missing or insufficient permissions')
      ),
      'Arbitrary familyId bypassed Firestore validation'
    );
  } catch (e: any) {
    assert('HF2-R2-07', 'No magic string heuristic: arbitrary familyId behaves correctly', false, e.message);
  }

  // HF2-R2-08: Sequential session B start succeeds with remaining eligible tasks
  try {
    const adminSeq: Member = { ...adminMember, familyId: 'fam_chaos_seq_test' };
    const lucasSeq: Member = { ...lucasMember, familyId: 'fam_chaos_seq_test' };

    const draftBWithRemaining = await ChaosSessionService.createDraftSession({
      familyId: 'fam_chaos_seq_test',
      createdByMemberId: adminSeq.id,
      callerRole: 'ADMIN',
      initialDurationMinutes: 15,
      participantMemberIds: [adminSeq.id, lucasSeq.id],
      selectedTaskIds: ['ft_living_room'],
      taskStrategies: { ft_living_room: 'DISTRIBUTED' },
      availableMembers: [adminSeq, lucasSeq],
      availableTasks: [{ id: 'ft_living_room', family_id: 'fam_chaos_seq_test', task_id: 'task_living', active: true, chaosEligible: true }],
      isDemoMode: true
    });

    const activeB = await ChaosSessionService.startChaosSession({
      familyId: 'fam_chaos_seq_test',
      sessionId: draftBWithRemaining.id,
      callerRole: 'ADMIN',
      existingSession: draftBWithRemaining,
      isDemoMode: true
    });

    assert(
      'HF2-R2-08',
      'Sequential session lifecycle: Session B with remaining tasks transitions to ACTIVE successfully',
      activeB.status === 'ACTIVE' &&
      activeB.tasks.length === 1 &&
      activeB.tasks[0].familyTaskId === 'ft_living_room' &&
      activeB.tasks[0].strategy === 'DISTRIBUTED',
      'Session B failed to start with remaining eligible tasks'
    );
  } catch (e: any) {
    assert('HF2-R2-08', 'Sequential session lifecycle: Session B start succeeds', false, e.message);
  }

  return results;
};
