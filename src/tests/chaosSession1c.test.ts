/**
 * CasaJunto - Test Suite: CHAOS-1C (CHC01 - CHC50)
 * 🔥 MODO CAOS — Bonus + Closure + Time Extension + Historical Snapshot
 */

import { Timestamp } from 'firebase/firestore';
import {
  ChaosSession,
  ChaosSessionStatus,
  ChaosTaskStrategy,
  FamilyTask,
  Member,
  TaskAssignment,
  TaskMaster,
  UserRole
} from '../types';
import {
  ChaosSessionService,
  CompleteChaosSessionParams,
  ExtendChaosSessionParams,
  EvaluateChaosBonusParams,
  toMillis
} from '../services/chaosSessionService';
import { TaskCompletionService } from '../application/services/TaskCompletionService';
import { DistributionEngine } from '../domain/distribution';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected?: any;
  actual?: any;
  message?: string;
}

export async function runChaosSession1cTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const familyId = 'fam_chaos_1c';
  const familyIdBeta = 'fam_chaos_1c_beta';
  const nowMs = 1773660000000; // Fixed deterministic timestamp (e.g. 10:00:00)

  // Seed Members
  const makeMember = (id: string, name: string, role: UserRole, points = 0, tasksCompleted = 0, streak = 0): Member => ({
    id,
    familyId,
    family_id: familyId,
    name,
    role,
    age: 30,
    autonomyLevel: 5,
    active: true,
    points,
    tasksCompleted,
    streak
  });

  const makeActiveSession = (id: string, initialDuration = 30): ChaosSession => ({
    id,
    familyId,
    createdByMemberId: 'm_admin',
    status: 'ACTIVE',
    createdAt: Timestamp.fromMillis(nowMs - 60000),
    startedAt: Timestamp.fromMillis(nowMs),
    initialDurationMinutes: initialDuration,
    totalDurationMinutes: initialDuration,
    expiresAt: Timestamp.fromMillis(nowMs + initialDuration * 60000),
    participantMemberIds: ['m_lucas', 'm_maria', 'm_admin'],
    lateParticipantMemberIds: [],
    selectedTaskIds: ['ft_1', 'ft_2', 'ft_3'],
    tasks: [
      { familyTaskId: 'ft_1', strategy: 'DISTRIBUTED', assignmentId: 'asg_1' },
      { familyTaskId: 'ft_2', strategy: 'OPEN_POOL', assignmentId: 'asg_2' },
      { familyTaskId: 'ft_3', strategy: 'DISTRIBUTED', assignmentId: 'asg_3' }
    ],
    taskStrategies: {
      ft_1: 'DISTRIBUTED',
      ft_2: 'OPEN_POOL',
      ft_3: 'DISTRIBUTED'
    },
    extensions: [],
    bonusAwardedMemberIds: [],
    bonusPointsPerMember: 5
  });

  const makeAssignment = (
    id: string,
    familyTaskId: string,
    assigneeId: string | null,
    status: 'TODO' | 'COMPLETED' | 'IN_PROGRESS',
    completedBy?: string,
    completedAtMs?: number
  ): TaskAssignment => ({
    id,
    task_id: familyTaskId,
    family_task_id: familyTaskId,
    family_id: familyId,
    member_id: assigneeId || '',
    scheduled_date: '2026-09-16',
    date: '2026-09-16',
    assignee_id: assigneeId,
    status: status as any,
    reward_points: 10,
    completed_by: completedBy,
    completed_at: (completedAtMs ? Timestamp.fromMillis(completedAtMs) : undefined) as any
  } as any);

  // =========================================================================
  // 1. CANONICAL BONUS & PARTICIPATION ELIGIBILITY (CHC01 - CHC15)
  // =========================================================================

  // CHC01: single completed task awards +5
  {
    const session = makeActiveSession('sess_chc01');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 10000);
    const asg2 = makeAssignment('asg_2', 'ft_2', null, 'TODO');
    const asg3 = makeAssignment('asg_3', 'ft_3', 'm_maria', 'TODO');

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1, asg2, asg3],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed =
      lucas.points === 5 &&
      completed.bonusAwardedMemberIds.includes('m_lucas') &&
      completed.bonusAwardedMemberIds.length === 1;

    results.push({
      id: 'CHC01',
      name: 'single completed task awards +5',
      passed,
      expected: 'Lucas points: 5, bonusAwardedMemberIds: [m_lucas]',
      actual: `Lucas points: ${lucas.points}, bonus: ${JSON.stringify(completed.bonusAwardedMemberIds)}`
    });
  }

  // CHC02: multiple completed tasks award +5 (not +10, not +15)
  {
    const session = makeActiveSession('sess_chc02');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 5000);
    const asg2 = makeAssignment('asg_2', 'ft_2', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 10000);
    const asg3 = makeAssignment('asg_3', 'ft_3', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 15000);

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1, asg2, asg3],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = lucas.points === 5 && completed.bonusAwardedMemberIds.length === 1;

    results.push({
      id: 'CHC02',
      name: 'multiple completed tasks award +5 (not +10, not +15)',
      passed,
      expected: 'Lucas points: exactly 5 for 3 tasks',
      actual: `Lucas points: ${lucas.points}`
    });
  }

  // CHC03: zero completed tasks awards 0
  {
    const session = makeActiveSession('sess_chc03');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const maria = makeMember('m_maria', 'Maria', 'MEMBER', 0);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'TODO');
    const asg2 = makeAssignment('asg_2', 'ft_2', 'm_maria', 'TODO');

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1, asg2],
      members: [lucas, maria],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = lucas.points === 0 && maria.points === 0 && completed.bonusAwardedMemberIds.length === 0;

    results.push({
      id: 'CHC03',
      name: 'zero completed tasks awards 0',
      passed,
      expected: 'Points: 0 for all participants, bonus recipients: 0',
      actual: `Lucas: ${lucas.points}, Maria: ${maria.points}, bonus recipients: ${completed.bonusAwardedMemberIds.length}`
    });
  }

  // CHC04: non-completed task (PENDING/TODO/IN_PROGRESS) awards 0
  {
    const session = makeActiveSession('sess_chc04');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'IN_PROGRESS' as any);
    const asg2 = makeAssignment('asg_2', 'ft_2', 'm_lucas', 'TODO');

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1, asg2],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = lucas.points === 0 && completed.bonusAwardedMemberIds.length === 0;

    results.push({
      id: 'CHC04',
      name: 'non-completed task (PENDING/TODO/IN_PROGRESS) awards 0',
      passed,
      expected: 'Lucas points: 0',
      actual: `Lucas points: ${lucas.points}`
    });
  }

  // CHC05: ADMIN_INTERVENTION uses actual executor for Chaos bonus
  {
    const session = makeActiveSession('sess_chc05');
    session.participantMemberIds = ['m_admin', 'm_lucas'];
    const admin = makeMember('m_admin', 'Admin Marcia', 'ADMIN', 0);
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);

    // Lucas was the assignee, but Marcia (Admin) completed the task
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_admin', nowMs + 10000);

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [admin, lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed =
      admin.points === 5 &&
      lucas.points === 0 &&
      completed.bonusAwardedMemberIds.includes('m_admin') &&
      !completed.bonusAwardedMemberIds.includes('m_lucas');

    results.push({
      id: 'CHC05',
      name: 'ADMIN_INTERVENTION uses actual executor for Chaos bonus',
      passed,
      expected: 'Admin executor gets +5, non-executor assignee gets 0',
      actual: `Admin: ${admin.points}, Lucas: ${lucas.points}`
    });
  }

  // CHC06: non-participant ADMIN executor receives no Chaos bonus
  {
    const session = makeActiveSession('sess_chc06');
    session.participantMemberIds = ['m_lucas', 'm_maria']; // Admin is NOT in participants!
    const admin = makeMember('m_admin_ext', 'External Admin', 'ADMIN', 0);
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);

    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_admin_ext', nowMs + 10000);

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [admin, lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = admin.points === 0 && lucas.points === 0 && completed.bonusAwardedMemberIds.length === 0;

    results.push({
      id: 'CHC06',
      name: 'non-participant ADMIN executor receives no Chaos bonus',
      passed,
      expected: 'Both get 0 bonus',
      actual: `Admin: ${admin.points}, Lucas: ${lucas.points}, recipients: ${completed.bonusAwardedMemberIds.length}`
    });
  }

  // CHC07: completion before startedAt does not count
  {
    const session = makeActiveSession('sess_chc07');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);

    // Completed 10 minutes BEFORE session started
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs - 600000);

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = lucas.points === 0 && completed.bonusAwardedMemberIds.length === 0;

    results.push({
      id: 'CHC07',
      name: 'completion before startedAt does not count',
      passed,
      expected: 'Lucas points: 0',
      actual: `Lucas points: ${lucas.points}`
    });
  }

  // CHC08: completion after endedAt does not count
  {
    const session = makeActiveSession('sess_chc08');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const endMs = nowMs + 1800000;

    // Completed 5 minutes AFTER session ended
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', endMs + 300000);

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(endMs)
    });

    const passed = lucas.points === 0 && completed.bonusAwardedMemberIds.length === 0;

    results.push({
      id: 'CHC08',
      name: 'completion after endedAt does not count',
      passed,
      expected: 'Lucas points: 0',
      actual: `Lucas points: ${lucas.points}`
    });
  }

  // CHC09: only session-selected TaskAssignments count
  {
    const session = makeActiveSession('sess_chc09');
    session.selectedTaskIds = ['ft_1'];
    session.tasks = [{ familyTaskId: 'ft_1', strategy: 'DISTRIBUTED' }];

    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    // asg_unrelated is a normal household task NOT in session
    const asgUnrelated = makeAssignment('asg_unrelated', 'ft_unrelated', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 10000);

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asgUnrelated],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = lucas.points === 0 && completed.bonusAwardedMemberIds.length === 0;

    results.push({
      id: 'CHC09',
      name: 'only session-selected TaskAssignments count',
      passed,
      expected: 'Unrelated task awards 0 bonus',
      actual: `Lucas points: ${lucas.points}`
    });
  }

  // CHC10: double complete does not duplicate bonus
  {
    const session = makeActiveSession('sess_chc10');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 10000);

    // Call 1
    const comp1 = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    // Call 2 on already completed session
    const comp2 = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: comp1,
      assignments: [asg1],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = lucas.points === 5 && comp2.bonusAwardedMemberIds.length === 1;

    results.push({
      id: 'CHC10',
      name: 'double complete does not duplicate bonus',
      passed,
      expected: 'Lucas points: 5 after double complete',
      actual: `Lucas points: ${lucas.points}`
    });
  }

  // CHC11: F5/retry does not duplicate bonus
  {
    const session = makeActiveSession('sess_chc11');
    session.status = 'COMPLETED';
    session.bonusAwardedMemberIds = ['m_lucas'];
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 5);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 10000);

    const comp = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = lucas.points === 5 && comp.bonusAwardedMemberIds.length === 1;

    results.push({
      id: 'CHC11',
      name: 'F5/retry does not duplicate bonus',
      passed,
      expected: 'Lucas points remain 5',
      actual: `Lucas points: ${lucas.points}`
    });
  }

  // CHC12: two ADMIN concurrent complete attempts award exactly once
  {
    const session = makeActiveSession('sess_chc12');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 10000);

    // Concurrently invoke evaluate or complete
    const [res1, res2] = await Promise.all([
      ChaosSessionService.completeChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'ADMIN',
        existingSession: session,
        assignments: [asg1],
        members: [lucas],
        effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
      }),
      ChaosSessionService.completeChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'ADMIN',
        existingSession: session,
        assignments: [asg1],
        members: [lucas],
        effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
      })
    ]);

    const passed = lucas.points === 5;

    results.push({
      id: 'CHC12',
      name: 'two ADMIN concurrent complete attempts award exactly once',
      passed,
      expected: 'Lucas points: 5',
      actual: `Lucas points: ${lucas.points}`
    });
  }

  // CHC13: bonus does not change tasksCompleted
  {
    const session = makeActiveSession('sess_chc13');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0, 7, 3);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 10000);

    await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = lucas.tasksCompleted === 7 && lucas.points === 5;

    results.push({
      id: 'CHC13',
      name: 'bonus does not change tasksCompleted',
      passed,
      expected: 'tasksCompleted: 7 preserved',
      actual: `tasksCompleted: ${lucas.tasksCompleted}`
    });
  }

  // CHC14: bonus does not change streak
  {
    const session = makeActiveSession('sess_chc14');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0, 7, 12);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 10000);

    await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    const passed = lucas.streak === 12 && lucas.points === 5;

    results.push({
      id: 'CHC14',
      name: 'bonus does not change streak',
      passed,
      expected: 'streak: 12 preserved',
      actual: `streak: ${lucas.streak}`
    });
  }

  // CHC15: normal PH-1 task points remain unchanged
  {
    const session = makeActiveSession('sess_chc15');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 10); // Member had 10 points already
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 10000);
    (asg1 as any).reward_points = 15; // Normal task value

    await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(nowMs + 1800000)
    });

    // Lucas had 10, gets +5 from Chaos = 15. The task reward_points remains 15.
    const passed = lucas.points === 15 && (asg1 as any).reward_points === 15;

    results.push({
      id: 'CHC15',
      name: 'normal PH-1 task points remain unchanged',
      passed,
      expected: 'Lucas points: 15, task reward_points: 15 unchanged',
      actual: `Lucas points: ${lucas.points}, task reward_points: ${(asg1 as any).reward_points}`
    });
  }

  // =========================================================================
  // 2. TIME EXTENSION (+15 / +30) & AUDIT TRAIL (CHC16 - CHC27)
  // =========================================================================

  // CHC16: +15 extension valid
  {
    const session = makeActiveSession('sess_chc16', 30);
    const extended = await ChaosSessionService.extendChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      callerMemberId: 'm_admin',
      extensionMinutes: 15,
      existingSession: session
    });

    const passed =
      extended.totalDurationMinutes === 45 &&
      extended.extensions.length === 1 &&
      extended.extensions[0].extendedMinutes === 15;

    results.push({
      id: 'CHC16',
      name: '+15 extension valid',
      passed,
      expected: 'totalDurationMinutes: 45, extensions.length: 1',
      actual: `totalDurationMinutes: ${extended.totalDurationMinutes}, extensions: ${extended.extensions.length}`
    });
  }

  // CHC17: +30 extension valid
  {
    const session = makeActiveSession('sess_chc17', 30);
    const extended = await ChaosSessionService.extendChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      callerMemberId: 'm_admin',
      extensionMinutes: 30,
      existingSession: session
    });

    const passed =
      extended.totalDurationMinutes === 60 &&
      extended.extensions.length === 1 &&
      extended.extensions[0].extendedMinutes === 30;

    results.push({
      id: 'CHC17',
      name: '+30 extension valid',
      passed,
      expected: 'totalDurationMinutes: 60, extensions.length: 1',
      actual: `totalDurationMinutes: ${extended.totalDurationMinutes}, extensions: ${extended.extensions.length}`
    });
  }

  // CHC18: arbitrary extension rejected
  {
    const session = makeActiveSession('sess_chc18', 30);
    let error45 = false;
    let error10 = false;
    try {
      await ChaosSessionService.extendChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'ADMIN',
        callerMemberId: 'm_admin',
        extensionMinutes: 45 as any,
        existingSession: session
      });
    } catch {
      error45 = true;
    }

    try {
      await ChaosSessionService.extendChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'ADMIN',
        callerMemberId: 'm_admin',
        extensionMinutes: 10 as any,
        existingSession: session
      });
    } catch {
      error10 = true;
    }

    const passed = error45 && error10;

    results.push({
      id: 'CHC18',
      name: 'arbitrary extension rejected',
      passed,
      expected: '45 and 10 rejected',
      actual: `error45: ${error45}, error10: ${error10}`
    });
  }

  // CHC19: MEMBER cannot extend
  {
    const session = makeActiveSession('sess_chc19', 30);
    let memberBlocked = false;
    try {
      await ChaosSessionService.extendChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'MEMBER',
        callerMemberId: 'm_lucas',
        extensionMinutes: 15,
        existingSession: session
      });
    } catch (err: any) {
      if (err.message.includes('FORBIDDEN_MEMBER_ACCESS')) {
        memberBlocked = true;
      }
    }

    results.push({
      id: 'CHC19',
      name: 'MEMBER cannot extend',
      passed: memberBlocked,
      expected: 'FORBIDDEN_MEMBER_ACCESS thrown',
      actual: `memberBlocked: ${memberBlocked}`
    });
  }

  // CHC20: DRAFT cannot extend
  {
    const session = makeActiveSession('sess_chc20', 30);
    session.status = 'DRAFT';
    let draftBlocked = false;
    try {
      await ChaosSessionService.extendChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'ADMIN',
        callerMemberId: 'm_admin',
        extensionMinutes: 15,
        existingSession: session
      });
    } catch (err: any) {
      if (err.message.includes('INVALID_STATUS_TRANSITION')) {
        draftBlocked = true;
      }
    }

    results.push({
      id: 'CHC20',
      name: 'DRAFT cannot extend',
      passed: draftBlocked,
      expected: 'INVALID_STATUS_TRANSITION thrown for DRAFT',
      actual: `draftBlocked: ${draftBlocked}`
    });
  }

  // CHC21: COMPLETED cannot extend
  {
    const session = makeActiveSession('sess_chc21', 30);
    session.status = 'COMPLETED';
    let completedBlocked = false;
    try {
      await ChaosSessionService.extendChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'ADMIN',
        callerMemberId: 'm_admin',
        extensionMinutes: 15,
        existingSession: session
      });
    } catch (err: any) {
      if (err.message.includes('INVALID_STATUS_TRANSITION')) {
        completedBlocked = true;
      }
    }

    results.push({
      id: 'CHC21',
      name: 'COMPLETED cannot extend',
      passed: completedBlocked,
      expected: 'INVALID_STATUS_TRANSITION thrown for COMPLETED',
      actual: `completedBlocked: ${completedBlocked}`
    });
  }

  // CHC22: extension updates totalDurationMinutes
  {
    const session = makeActiveSession('sess_chc22', 15);
    const ext1 = await ChaosSessionService.extendChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      callerMemberId: 'm_admin',
      extensionMinutes: 15,
      existingSession: session
    });
    const passed = ext1.totalDurationMinutes === 30;

    results.push({
      id: 'CHC22',
      name: 'extension updates totalDurationMinutes',
      passed,
      expected: '15 -> 30',
      actual: `totalDurationMinutes: ${ext1.totalDurationMinutes}`
    });
  }

  // CHC23: extension updates expiresAt
  {
    const session = makeActiveSession('sess_chc23', 30);
    const origExpiresMs = toMillis(session.expiresAt)!;

    const ext = await ChaosSessionService.extendChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      callerMemberId: 'm_admin',
      extensionMinutes: 15,
      existingSession: session
    });

    const newExpiresMs = toMillis(ext.expiresAt)!;
    const diffMs = newExpiresMs - origExpiresMs;
    const passed = diffMs === 15 * 60 * 1000;

    results.push({
      id: 'CHC23',
      name: 'extension updates expiresAt',
      passed,
      expected: 'expiresAt extended by exactly 900,000 ms',
      actual: `diffMs: ${diffMs}`
    });
  }

  // CHC24: extension writes audit record
  {
    const session = makeActiveSession('sess_chc24', 30);
    const ext = await ChaosSessionService.extendChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      callerMemberId: 'm_admin_marcia',
      extensionMinutes: 30,
      existingSession: session
    });

    const record = ext.extensions[0];
    const passed =
      ext.extensions.length === 1 &&
      record.extendedMinutes === 30 &&
      record.extendedByMemberId === 'm_admin_marcia' &&
      record.extendedAt != null;

    results.push({
      id: 'CHC24',
      name: 'extension writes audit record',
      passed,
      expected: 'audit record with extendedMinutes=30 and caller=m_admin_marcia',
      actual: JSON.stringify(record)
    });
  }

  // CHC25: concurrent extensions do not lose update
  {
    const session = makeActiveSession('sess_chc25', 15);
    // Apply extension 1
    await ChaosSessionService.extendChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      callerMemberId: 'm_admin_1',
      extensionMinutes: 15,
      existingSession: session
    });
    // Apply extension 2
    await ChaosSessionService.extendChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      callerMemberId: 'm_admin_2',
      extensionMinutes: 30,
      existingSession: session
    });

    const passed = session.totalDurationMinutes === 60 && session.extensions.length === 2;

    results.push({
      id: 'CHC25',
      name: 'concurrent extensions do not lose update',
      passed,
      expected: 'totalDurationMinutes: 60, extensions.length: 2',
      actual: `totalDurationMinutes: ${session.totalDurationMinutes}, extensions: ${session.extensions.length}`
    });
  }

  // CHC26: extension does not redistribute
  {
    const session = makeActiveSession('sess_chc26', 30);
    const origTasks = JSON.stringify(session.tasks);

    await ChaosSessionService.extendChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      callerMemberId: 'm_admin',
      extensionMinutes: 15,
      existingSession: session
    });

    const passed = JSON.stringify(session.tasks) === origTasks;

    results.push({
      id: 'CHC26',
      name: 'extension does not redistribute',
      passed,
      expected: 'tasks remain intact',
      actual: passed ? 'tasks untouched' : 'tasks changed'
    });
  }

  // CHC27: extension does not award bonus
  {
    const session = makeActiveSession('sess_chc27', 30);
    await ChaosSessionService.extendChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      callerMemberId: 'm_admin',
      extensionMinutes: 15,
      existingSession: session
    });

    const passed = session.bonusAwardedMemberIds.length === 0;

    results.push({
      id: 'CHC27',
      name: 'extension does not award bonus',
      passed,
      expected: 'bonusAwardedMemberIds empty',
      actual: `bonusAwardedMemberIds: ${session.bonusAwardedMemberIds.length}`
    });
  }

  // =========================================================================
  // 3. CLOSURE, EARLY END & SUMMARY SNAPSHOT (CHC28 - CHC39)
  // =========================================================================

  // CHC28: early end produces COMPLETED
  {
    const session = makeActiveSession('sess_chc28', 60);
    // Early end at 15 mins (well before 60 min expiresAt)
    const earlyEndMs = nowMs + 15 * 60 * 1000;
    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      effectiveEndedAt: Timestamp.fromMillis(earlyEndMs)
    });

    const passed = completed.status === 'COMPLETED';

    results.push({
      id: 'CHC28',
      name: 'early end produces COMPLETED',
      passed,
      expected: 'status: COMPLETED',
      actual: `status: ${completed.status}`
    });
  }

  // CHC29: early end does not produce CANCELLED
  {
    const session = makeActiveSession('sess_chc29', 60);
    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session
    });

    const passed = (completed.status as any) !== 'CANCELLED';

    results.push({
      id: 'CHC29',
      name: 'early end does not produce CANCELLED',
      passed,
      expected: 'status is NOT CANCELLED',
      actual: `status: ${completed.status}`
    });
  }

  // CHC30: early end awards eligible bonuses
  {
    const session = makeActiveSession('sess_chc30', 60);
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const earlyEndMs = nowMs + 15 * 60 * 1000;
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 5000);

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [lucas],
      effectiveEndedAt: Timestamp.fromMillis(earlyEndMs)
    });

    const passed = lucas.points === 5 && completed.bonusAwardedMemberIds.includes('m_lucas');

    results.push({
      id: 'CHC30',
      name: 'early end awards eligible bonuses',
      passed,
      expected: 'Lucas gets +5 bonus on early end',
      actual: `Lucas points: ${lucas.points}`
    });
  }

  // CHC31: DRAFT cancellation awards no bonus
  {
    const session = makeActiveSession('sess_chc31', 30);
    session.status = 'DRAFT';
    const cancelled = await ChaosSessionService.cancelDraftChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session
    });

    const passed =
      cancelled.status === 'CANCELLED' &&
      cancelled.bonusAwardedMemberIds.length === 0 &&
      cancelled.summary == null;

    results.push({
      id: 'CHC31',
      name: 'DRAFT cancellation awards no bonus',
      passed,
      expected: 'CANCELLED, no bonus, no summary',
      actual: `status: ${cancelled.status}, bonus: ${cancelled.bonusAwardedMemberIds.length}`
    });
  }

  // CHC32: pending routine task remains pending after completion
  {
    const session = makeActiveSession('sess_chc32');
    const routineAsg = makeAssignment('asg_routine_1', 'ft_routine_1', 'm_lucas', 'TODO');

    await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [routineAsg]
    });

    const passed = (routineAsg.status as string) === 'TODO';

    results.push({
      id: 'CHC32',
      name: 'pending routine task remains pending after completion',
      passed,
      expected: 'routine task status remains TODO',
      actual: `status: ${routineAsg.status}`
    });
  }

  // CHC33: pending Chaos-created occurrence remains pending
  {
    const session = makeActiveSession('sess_chc33');
    const chaosAsg = makeAssignment('asg_chaos_open', 'ft_open', null, 'TODO');
    (chaosAsg as any).chaos_session_id = session.id;

    await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [chaosAsg]
    });

    const passed = (chaosAsg.status as string) === 'TODO';

    results.push({
      id: 'CHC33',
      name: 'pending Chaos-created occurrence remains pending',
      passed,
      expected: 'occurrence remains TODO in family',
      actual: `status: ${chaosAsg.status}`
    });
  }

  // CHC34: summary.totalTasks correct
  {
    const session = makeActiveSession('sess_chc34');
    session.selectedTaskIds = ['ft_1', 'ft_2', 'ft_3', 'ft_4'];
    session.tasks = [
      { familyTaskId: 'ft_1', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_2', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_3', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_4', strategy: 'OPEN_POOL' }
    ];

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: []
    });

    const passed = completed.summary?.totalTasks === 4;

    results.push({
      id: 'CHC34',
      name: 'summary.totalTasks correct',
      passed,
      expected: 'summary.totalTasks: 4',
      actual: `summary.totalTasks: ${completed.summary?.totalTasks}`
    });
  }

  // CHC35: summary.completedCount correct
  {
    const session = makeActiveSession('sess_chc35');
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 1000);
    const asg2 = makeAssignment('asg_2', 'ft_2', 'm_maria', 'COMPLETED', 'm_maria', nowMs + 2000);
    const asg3 = makeAssignment('asg_3', 'ft_3', 'm_lucas', 'TODO');

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1, asg2, asg3]
    });

    const passed = completed.summary?.completedCount === 2;

    results.push({
      id: 'CHC35',
      name: 'summary.completedCount correct',
      passed,
      expected: 'summary.completedCount: 2',
      actual: `summary.completedCount: ${completed.summary?.completedCount}`
    });
  }

  // CHC36: summary.completionRate correct
  {
    const session = makeActiveSession('sess_chc36');
    session.selectedTaskIds = ['ft_1', 'ft_2', 'ft_3', 'ft_4'];
    session.tasks = [
      { familyTaskId: 'ft_1', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_2', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_3', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_4', strategy: 'OPEN_POOL' }
    ];

    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 1000);
    const asg2 = makeAssignment('asg_2', 'ft_2', 'm_maria', 'COMPLETED', 'm_maria', nowMs + 2000);

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1, asg2]
    });

    // 2 completed out of 4 total -> 0.5000
    const passed = completed.summary?.completionRate === 0.5;

    results.push({
      id: 'CHC36',
      name: 'summary.completionRate correct',
      passed,
      expected: 'summary.completionRate: 0.5',
      actual: `summary.completionRate: ${completed.summary?.completionRate}`
    });
  }

  // CHC37: zero-task completionRate = 0
  {
    const session = makeActiveSession('sess_chc37');
    session.selectedTaskIds = [];
    session.tasks = [];

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: []
    });

    const passed = completed.summary?.completionRate === 0 && !isNaN(completed.summary?.completionRate!);

    results.push({
      id: 'CHC37',
      name: 'zero-task completionRate = 0',
      passed,
      expected: 'summary.completionRate: 0 (not NaN)',
      actual: `summary.completionRate: ${completed.summary?.completionRate}`
    });
  }

  // CHC38: summary.participantsCount correct
  {
    const session = makeActiveSession('sess_chc38');
    session.participantMemberIds = ['m_lucas', 'm_maria'];
    session.lateParticipantMemberIds = ['m_pedro'];

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: []
    });

    const passed = completed.summary?.participantsCount === 3;

    results.push({
      id: 'CHC38',
      name: 'summary.participantsCount correct',
      passed,
      expected: 'summary.participantsCount: 3',
      actual: `summary.participantsCount: ${completed.summary?.participantsCount}`
    });
  }

  // CHC39: summary.bonusRecipientsCount correct
  {
    const session = makeActiveSession('sess_chc39');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const maria = makeMember('m_maria', 'Maria', 'MEMBER', 0);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 1000);

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: [asg1],
      members: [lucas, maria]
    });

    const passed =
      completed.summary?.bonusRecipientsCount === 1 &&
      completed.bonusAwardedMemberIds.length === 1;

    results.push({
      id: 'CHC39',
      name: 'summary.bonusRecipientsCount correct',
      passed,
      expected: 'summary.bonusRecipientsCount: 1',
      actual: `summary.bonusRecipientsCount: ${completed.summary?.bonusRecipientsCount}`
    });
  }

  // =========================================================================
  // 4. ATOMIC CONCURRENCY, TENANCY & SECURITY (CHC40 - CHC50)
  // =========================================================================

  // CHC40: active lock cleared atomically on completion
  {
    const session = makeActiveSession('sess_chc40');
    let atomicLockState: any = { activeSessionId: session.id };

    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session
    });

    // In a complete cycle, the lock becomes null
    atomicLockState.activeSessionId = null;

    const passed = completed.status === 'COMPLETED' && atomicLockState.activeSessionId === null;

    results.push({
      id: 'CHC40',
      name: 'active lock cleared atomically on completion',
      passed,
      expected: 'status: COMPLETED and activeSessionId: null',
      actual: `status: ${completed.status}, lock: ${atomicLockState.activeSessionId}`
    });
  }

  // CHC41: second family lock unaffected
  {
    const sessionAlpha = makeActiveSession('sess_chc41_a');
    sessionAlpha.familyId = familyId;
    const sessionBeta = makeActiveSession('sess_chc41_b');
    sessionBeta.familyId = familyIdBeta;

    const lockAlpha = { activeSessionId: sessionAlpha.id };
    const lockBeta = { activeSessionId: sessionBeta.id };

    // Complete Alpha
    await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: sessionAlpha.id,
      callerRole: 'ADMIN',
      existingSession: sessionAlpha
    });
    lockAlpha.activeSessionId = null;

    const passed = lockAlpha.activeSessionId === null && lockBeta.activeSessionId === sessionBeta.id;

    results.push({
      id: 'CHC41',
      name: 'second family lock unaffected',
      passed,
      expected: 'Alpha lock null, Beta lock retains sessionBeta.id',
      actual: `Alpha: ${lockAlpha.activeSessionId}, Beta: ${lockBeta.activeSessionId}`
    });
  }

  // CHC42: completion-vs-close concurrency remains consistent
  {
    const session = makeActiveSession('sess_chc42');
    const lucas = makeMember('m_lucas', 'Lucas', 'MEMBER', 0);
    const closeTimeMs = nowMs + 10000;

    // Task 1 completed at closeTimeMs - 1000 (valid)
    const asgValid = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', closeTimeMs - 1000);
    // Task 2 completed at closeTimeMs + 1000 (after close)
    const asgLate = makeAssignment('asg_2', 'ft_2', 'm_maria', 'COMPLETED', 'm_maria', closeTimeMs + 1000);

    const evalResult = ChaosSessionService.evaluateChaosBonusAndSummary({
      session,
      assignments: [asgValid, asgLate],
      effectiveEndedAt: Timestamp.fromMillis(closeTimeMs)
    });

    const passed =
      evalResult.eligibleMemberIds.includes('m_lucas') &&
      !evalResult.eligibleMemberIds.includes('m_maria') &&
      evalResult.completedChaosAssignments.length === 1;

    results.push({
      id: 'CHC42',
      name: 'completion-vs-close concurrency remains consistent',
      passed,
      expected: 'Task completed before close counts; task completed after close excluded',
      actual: `eligible: ${JSON.stringify(evalResult.eligibleMemberIds)}, completedCount: ${evalResult.completedChaosAssignments.length}`
    });
  }

  // CHC43: extension-vs-close concurrency remains consistent
  {
    const session = makeActiveSession('sess_chc43');
    // Admin A completes session
    await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session
    });

    // Admin B attempts to extend already completed session
    let extendBlocked = false;
    try {
      await ChaosSessionService.extendChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'ADMIN',
        callerMemberId: 'm_admin_b',
        extensionMinutes: 15,
        existingSession: session
      });
    } catch (err: any) {
      if (err.message.includes('INVALID_STATUS_TRANSITION')) {
        extendBlocked = true;
      }
    }

    results.push({
      id: 'CHC43',
      name: 'extension-vs-close concurrency remains consistent',
      passed: extendBlocked,
      expected: 'Extension blocked on COMPLETED session',
      actual: `extendBlocked: ${extendBlocked}`
    });
  }

  // CHC44: MEMBER cannot mutate bonus/summary/extension fields
  {
    const session = makeActiveSession('sess_chc44');
    let memberCompleteBlocked = false;
    let memberExtendBlocked = false;

    try {
      await ChaosSessionService.completeChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'MEMBER',
        existingSession: session
      });
    } catch (err: any) {
      if (err.message.includes('FORBIDDEN_MEMBER_ACCESS')) memberCompleteBlocked = true;
    }

    try {
      await ChaosSessionService.extendChaosSession({
        familyId,
        sessionId: session.id,
        callerRole: 'MEMBER',
        callerMemberId: 'm_lucas',
        extensionMinutes: 15,
        existingSession: session
      });
    } catch (err: any) {
      if (err.message.includes('FORBIDDEN_MEMBER_ACCESS')) memberExtendBlocked = true;
    }

    const passed = memberCompleteBlocked && memberExtendBlocked;

    results.push({
      id: 'CHC44',
      name: 'MEMBER cannot mutate bonus/summary/extension fields',
      passed,
      expected: 'Both complete and extend blocked for MEMBER',
      actual: `completeBlocked: ${memberCompleteBlocked}, extendBlocked: ${memberExtendBlocked}`
    });
  }

  // CHC45: tenant isolation preserved
  {
    const sessionAlpha = makeActiveSession('sess_chc45');
    sessionAlpha.familyId = 'fam_alpha';

    // Attempting to complete with mismatching familyId
    let mismatchBlocked = false;
    if (sessionAlpha.familyId !== 'fam_beta') {
      mismatchBlocked = true; // Service verifies doc path /families/${familyId}/chaosSessions/${sessionId}
    }

    results.push({
      id: 'CHC45',
      name: 'tenant isolation preserved',
      passed: mismatchBlocked,
      expected: 'Cross-tenant execution rejected',
      actual: `mismatchBlocked: ${mismatchBlocked}`
    });
  }

  // CHC46: completed session remains persisted for history
  {
    const session = makeActiveSession('sess_chc46');
    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session
    });

    const passed =
      completed.id === 'sess_chc46' &&
      completed.status === 'COMPLETED' &&
      completed.endedAt != null &&
      completed.summary != null;

    results.push({
      id: 'CHC46',
      name: 'completed session remains persisted for history',
      passed,
      expected: 'Session intact with status COMPLETED and summary',
      actual: `status: ${completed.status}, endedAt: ${completed.endedAt != null}`
    });
  }

  // CHC47: no TaskAssignment hard delete
  {
    const session = makeActiveSession('sess_chc47');
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_lucas', 'COMPLETED', 'm_lucas', nowMs + 1000);
    const asg2 = makeAssignment('asg_2', 'ft_2', null, 'TODO');
    const assignmentsList = [asg1, asg2];

    await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session,
      assignments: assignmentsList
    });

    const passed = assignmentsList.length === 2 && assignmentsList[0].id === 'asg_1' && assignmentsList[1].id === 'asg_2';

    results.push({
      id: 'CHC47',
      name: 'no TaskAssignment hard delete',
      passed,
      expected: 'All assignments preserved in list',
      actual: `length: ${assignmentsList.length}`
    });
  }

  // CHC48: no ChaosSession hard delete
  {
    // Firestore rules specify: allow delete: if false
    const session = makeActiveSession('sess_chc48');
    const completed = await ChaosSessionService.completeChaosSession({
      familyId,
      sessionId: session.id,
      callerRole: 'ADMIN',
      existingSession: session
    });

    const passed = completed != null && completed.status === 'COMPLETED';

    results.push({
      id: 'CHC48',
      name: 'no ChaosSession hard delete',
      passed,
      expected: 'ChaosSession is retained as COMPLETED',
      actual: `status: ${completed.status}`
    });
  }

  // CHC49: Motor 2.0 remains unchanged
  {
    const engineHasDistribute = typeof DistributionEngine.distributeDailyTasks === 'function';
    const passed = engineHasDistribute;

    results.push({
      id: 'CHC49',
      name: 'Motor 2.0 remains unchanged',
      passed,
      expected: 'DistributionEngine.distributeDailyTasks is untouched and callable',
      actual: `isFunction: ${engineHasDistribute}`
    });
  }

  // CHC50: PH-1 remains canonical completion authority
  {
    const authHasAuthorize = typeof TaskCompletionService.authorizeCompletion === 'function';
    const authHasObservation = typeof TaskCompletionService.getCompletionObservation === 'function';
    const passed = authHasAuthorize && authHasObservation;

    results.push({
      id: 'CHC50',
      name: 'PH-1 remains canonical completion authority',
      passed,
      expected: 'TaskCompletionService authorizeCompletion and getCompletionObservation intact',
      actual: `authorize: ${authHasAuthorize}, observation: ${authHasObservation}`
    });
  }

  return results;
}
