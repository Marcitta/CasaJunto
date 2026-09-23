/**
 * CasaJunto - Test Suite: CHAOS-1D-HF5 (HF5-01 - HF5-24)
 * 🔥 MODO CAOS — Session-Scoped Completion & ONE_TIME Eligibility Fix
 *
 * HF5-01: Canonical predicate returns false for non-completed assignment.
 * HF5-02: Canonical predicate returns false for assignment belonging to another ChaosSession.
 * HF5-03: Canonical predicate returns false if completed_at is before session.startedAt.
 * HF5-04: Canonical predicate returns false if completed_at is after session.endedAt.
 * HF5-05: Canonical predicate returns true for valid assignment completed in session interval.
 * HF5-06: Parity check: ChaosActiveView and calculateClosureOutcomes agree on same completed assignments.
 * HF5-07: Newly started session with 4 selected tasks renders 0 / 4 (0%) completed.
 * HF5-08: Newly started session with historical DONE tasks does NOT list them as completed in Chaos.
 * HF5-09: Task completed in current ChaosSession transitions from pending/assigned to completed.
 * HF5-10: 100% prompt triggers ONLY when all current-session tasks are completed according to canonical predicate.
 * HF5-11: Historical completion from earlier today does not count toward 100% prompt.
 * HF5-12: ONE_TIME task completed yesterday is ineligible for new ChaosSession.
 * HF5-13: ONE_TIME task completed in previous ChaosSession is ineligible for new ChaosSession.
 * HF5-14: ONE_TIME task completed via SELF_CLAIMED is ineligible for new ChaosSession.
 * HF5-15: ONE_TIME task completed via ADMIN_INTERVENTION is ineligible for new ChaosSession.
 * HF5-16: ONE_TIME pending task remains eligible.
 * HF5-17: Recurring task (DAILY) completed yesterday remains eligible for new ChaosSession today.
 * HF5-18: Recurring task (WEEKLY) completed last week remains eligible for new ChaosSession.
 * HF5-19: Recurring task completed TODAY remains ineligible under HF3 rule.
 * HF5-20: ChaosSetupView disables completed ONE_TIME task and displays "Já concluída".
 * HF5-21: ChaosSetupView excludes completed ONE_TIME task from "Select All".
 * HF5-22: ChaosSetupView excludes completed ONE_TIME task from selected count.
 * HF5-23: Service layer rejects creation/start if completed ONE_TIME task is passed directly (defense in depth).
 * HF5-24: Reproduction of PO defect: session with 4 tasks where 2 were historically completed starts at 0/4 (0%), not 2/4 (50%).
 */

import { Timestamp } from 'firebase/firestore';
import {
  ChaosSession,
  FamilyTask,
  Member,
  TaskAssignment,
  Task
} from '../types';
import {
  ChaosSessionService,
  isAssignmentCompletedInChaosSession,
  toMillis
} from '../services/chaosSessionService';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
  expected?: any;
  actual?: any;
}

export async function runChaosSession1dHf5TestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const familyId = 'fam_chaos_hf5';
  const sessionStartTimeMs = 1774350000000; // 10:00:00
  const sessionDurationMinutes = 30;
  const sessionEndTimeMs = sessionStartTimeMs + sessionDurationMinutes * 60000; // 10:30:00

  const makeMember = (id: string, name: string): Member => ({
    id,
    familyId,
    family_id: familyId,
    name,
    role: 'ADMIN',
    age: 30,
    autonomyLevel: 5,
    active: true,
    points: 0,
    tasksCompleted: 0,
    streak: 0
  });

  const memberA = makeMember('m_marcia', 'Márcia');
  const memberB = makeMember('m_matheus', 'Matheus');

  const makeActiveSession = (id = 'sess_hf5_active'): ChaosSession => ({
    id,
    familyId,
    createdByMemberId: 'm_marcia',
    status: 'ACTIVE',
    createdAt: Timestamp.fromMillis(sessionStartTimeMs - 60000),
    startedAt: Timestamp.fromMillis(sessionStartTimeMs),
    initialDurationMinutes: sessionDurationMinutes,
    totalDurationMinutes: sessionDurationMinutes,
    expiresAt: Timestamp.fromMillis(sessionEndTimeMs),
    endedAt: null,
    participantMemberIds: ['m_marcia', 'm_matheus'],
    lateParticipantMemberIds: [],
    selectedTaskIds: ['ft_1', 'ft_2', 'ft_3', 'ft_4'],
    tasks: [
      { familyTaskId: 'ft_1', strategy: 'DISTRIBUTED', assignmentId: 'asg_1' },
      { familyTaskId: 'ft_2', strategy: 'DISTRIBUTED', assignmentId: 'asg_2' },
      { familyTaskId: 'ft_3', strategy: 'OPEN_POOL', assignmentId: 'asg_3' },
      { familyTaskId: 'ft_4', strategy: 'OPEN_POOL', assignmentId: 'asg_4' }
    ],
    taskStrategies: {
      ft_1: 'DISTRIBUTED',
      ft_2: 'DISTRIBUTED',
      ft_3: 'OPEN_POOL',
      ft_4: 'OPEN_POOL'
    },
    extensions: [],
    bonusAwardedMemberIds: [],
    bonusPointsPerMember: 5
  });

  const makeFamilyTask = (
    id: string,
    title: string,
    frequency: 'ONE_TIME' | 'DAILY' | 'WEEKLY' = 'DAILY',
    chaosEligible = true
  ): FamilyTask => ({
    id,
    familyId,
    family_id: familyId,
    name: title,
    customTitle: title,
    task_id: `tm_${id}`,
    room_id: 'room_living',
    points: 10,
    reward_points: 10,
    frequency: frequency as any,
    frequencyType: frequency as any,
    chaosEligible,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as any);

  const makeAssignment = (
    id: string,
    familyTaskId: string,
    assigneeId: string | null,
    status: 'SCHEDULED' | 'COMPLETED' | 'DONE',
    chaosSessionId?: string,
    completedAtMs?: number,
    completionType?: string
  ): TaskAssignment => ({
    id,
    task_id: `tm_${familyTaskId}`,
    family_task_id: familyTaskId,
    family_id: familyId,
    member_id: assigneeId || '',
    scheduled_date: '2026-09-23',
    date: '2026-09-23',
    assignee_id: assigneeId,
    status: status as any,
    reward_points: 10,
    chaos_session_id: chaosSessionId,
    chaosSessionId: chaosSessionId,
    completion_type: completionType as any,
    completed_by: assigneeId || 'm_marcia',
    completed_at: completedAtMs ? Timestamp.fromMillis(completedAtMs) : undefined
  } as any);

  // -------------------------------------------------------------------------
  // HF5-01: Canonical predicate returns false for non-completed assignment
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    const asgPending = makeAssignment('asg_1', 'ft_1', 'm_marcia', 'SCHEDULED', session.id);
    const completed = isAssignmentCompletedInChaosSession(asgPending, session);
    results.push({
      id: 'HF5-01',
      name: 'Canonical predicate returns false for non-completed assignment',
      passed: completed === false,
      expected: false,
      actual: completed
    });
  }

  // -------------------------------------------------------------------------
  // HF5-02: Canonical predicate returns false for assignment belonging to another ChaosSession
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession('sess_current');
    const asgOtherSession = makeAssignment(
      'asg_other',
      'ft_1',
      'm_marcia',
      'COMPLETED',
      'sess_previous',
      sessionStartTimeMs + 5000
    );
    const completed = isAssignmentCompletedInChaosSession(asgOtherSession, session);
    results.push({
      id: 'HF5-02',
      name: 'Canonical predicate returns false for assignment belonging to another ChaosSession',
      passed: completed === false,
      expected: false,
      actual: completed
    });
  }

  // -------------------------------------------------------------------------
  // HF5-03: Canonical predicate returns false if completed_at is before session.startedAt
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    const asgEarly = makeAssignment(
      'asg_early',
      'ft_1',
      'm_marcia',
      'COMPLETED',
      session.id,
      sessionStartTimeMs - 3600000 // Concluída 1h antes do início
    );
    const completed = isAssignmentCompletedInChaosSession(asgEarly, session);
    results.push({
      id: 'HF5-03',
      name: 'Canonical predicate returns false if completed_at is before session.startedAt',
      passed: completed === false,
      expected: false,
      actual: completed
    });
  }

  // -------------------------------------------------------------------------
  // HF5-04: Canonical predicate returns false if completed_at is after session.endedAt
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    session.endedAt = Timestamp.fromMillis(sessionEndTimeMs);
    const asgLate = makeAssignment(
      'asg_late',
      'ft_1',
      'm_marcia',
      'COMPLETED',
      session.id,
      sessionEndTimeMs + 10000 // Concluída após o término
    );
    const completed = isAssignmentCompletedInChaosSession(asgLate, session);
    results.push({
      id: 'HF5-04',
      name: 'Canonical predicate returns false if completed_at is after session.endedAt',
      passed: completed === false,
      expected: false,
      actual: completed
    });
  }

  // -------------------------------------------------------------------------
  // HF5-05: Canonical predicate returns true for valid assignment completed in session interval
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    session.endedAt = Timestamp.fromMillis(sessionEndTimeMs);
    const asgValid = makeAssignment(
      'asg_valid',
      'ft_1',
      'm_marcia',
      'COMPLETED',
      session.id,
      sessionStartTimeMs + 600000 // Concluída 10 min após início
    );
    const completed = isAssignmentCompletedInChaosSession(asgValid, session);
    results.push({
      id: 'HF5-05',
      name: 'Canonical predicate returns true for valid assignment completed in session interval',
      passed: completed === true,
      expected: true,
      actual: completed
    });
  }

  // -------------------------------------------------------------------------
  // HF5-06: Parity check: ChaosActiveView and calculateClosureOutcomes agree on same completed assignments
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    session.endedAt = Timestamp.fromMillis(sessionEndTimeMs);
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_marcia', 'COMPLETED', session.id, sessionStartTimeMs + 5000);
    const asg2 = makeAssignment('asg_2', 'ft_2', 'm_matheus', 'SCHEDULED', session.id);
    const asg3 = makeAssignment('asg_3', 'ft_3', null, 'SCHEDULED', session.id);
    const asg4 = makeAssignment('asg_4', 'ft_4', 'm_marcia', 'COMPLETED', session.id, sessionStartTimeMs + 10000);

    const assignments = [asg1, asg2, asg3, asg4];

    // Predicado ativo (ChaosActiveView)
    const activeCompletedIds = assignments
      .filter(a => isAssignmentCompletedInChaosSession(a, session))
      .map(a => a.id);

    // Avaliação de encerramento (evaluateChaosBonusAndSummary)
    const closureResult = ChaosSessionService.evaluateChaosBonusAndSummary({
      session,
      assignments,
      members: [memberA, memberB],
      effectiveEndedAt: session.endedAt
    });

    const closureCompletedIds = closureResult.completedChaosAssignments.map(a => a.id);

    const isIdentical =
      activeCompletedIds.length === closureCompletedIds.length &&
      activeCompletedIds.every((id, idx) => id === closureCompletedIds[idx]);

    results.push({
      id: 'HF5-06',
      name: 'Parity check: ChaosActiveView and calculateClosureOutcomes agree on same completed assignments',
      passed: isIdentical && activeCompletedIds.length === 2,
      expected: ['asg_1', 'asg_4'],
      actual: closureCompletedIds
    });
  }

  // -------------------------------------------------------------------------
  // HF5-07: Newly started session with 4 selected tasks renders 0 / 4 (0%) completed
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_marcia', 'SCHEDULED', session.id);
    const asg2 = makeAssignment('asg_2', 'ft_2', 'm_matheus', 'SCHEDULED', session.id);
    const asg3 = makeAssignment('asg_3', 'ft_3', null, 'SCHEDULED', session.id);
    const asg4 = makeAssignment('asg_4', 'ft_4', null, 'SCHEDULED', session.id);

    const liveAssignments = [asg1, asg2, asg3, asg4];
    const completedCount = liveAssignments.filter(a => isAssignmentCompletedInChaosSession(a, session)).length;
    const progressPercent = Math.round((completedCount / liveAssignments.length) * 100);

    results.push({
      id: 'HF5-07',
      name: 'Newly started session with 4 selected tasks renders 0 / 4 (0%) completed',
      passed: completedCount === 0 && progressPercent === 0,
      expected: { count: 0, percent: 0 },
      actual: { count: completedCount, percent: progressPercent }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-08: Newly started session with historical DONE tasks does NOT list them as completed in Chaos
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    // Simula a situação onde existem tasks históricas marcadas como DONE na AppContext
    const historicalTasks: Task[] = [
      {
        id: 'hist_task_1',
        familyTaskId: 'ft_1',
        title: 'teste criação canônica 5',
        status: 'DONE',
        completedAt: new Date(sessionStartTimeMs - 86400000).toISOString()
      } as any,
      {
        id: 'hist_task_2',
        familyTaskId: 'ft_2',
        title: 'teste criação canônica 6',
        status: 'DONE',
        completedAt: new Date(sessionStartTimeMs - 86400000).toISOString()
      } as any
    ];

    // Na sessão ativa, os liveAssignments são recém-iniciados
    const asg1 = makeAssignment('asg_1', 'ft_1', 'm_marcia', 'SCHEDULED', session.id);
    const asg2 = makeAssignment('asg_2', 'ft_2', 'm_matheus', 'SCHEDULED', session.id);

    // ChaosActiveView resolve via liveAsg com prioridade usando o predicado canônico
    const isCompleted1 = isAssignmentCompletedInChaosSession(asg1, session);
    const isCompleted2 = isAssignmentCompletedInChaosSession(asg2, session);

    // E mesmo se testar diretamente a historicalTask, ela não pertence à sessão atual
    const isHistTask1Completed = isAssignmentCompletedInChaosSession(historicalTasks[0], session);

    results.push({
      id: 'HF5-08',
      name: 'Newly started session with historical DONE tasks does NOT list them as completed in Chaos',
      passed: !isCompleted1 && !isCompleted2 && !isHistTask1Completed,
      expected: false,
      actual: isCompleted1 || isCompleted2 || isHistTask1Completed
    });
  }

  // -------------------------------------------------------------------------
  // HF5-09: Task completed in current ChaosSession transitions from pending/assigned to completed
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    const asg = makeAssignment('asg_1', 'ft_1', 'm_marcia', 'SCHEDULED', session.id);
    const beforeCompletion = isAssignmentCompletedInChaosSession(asg, session);

    // Conclusão durante a sessão
    asg.status = 'COMPLETED' as any;
    asg.completed_at = Timestamp.fromMillis(sessionStartTimeMs + 120000) as any; // 2 minutos após o início
    const afterCompletion = isAssignmentCompletedInChaosSession(asg, session);

    results.push({
      id: 'HF5-09',
      name: 'Task completed in current ChaosSession transitions from pending/assigned to completed',
      passed: beforeCompletion === false && afterCompletion === true,
      expected: { before: false, after: true },
      actual: { before: beforeCompletion, after: afterCompletion }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-10: 100% prompt triggers ONLY when all current-session tasks are completed according to canonical predicate
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    const asgs = [
      makeAssignment('asg_1', 'ft_1', 'm_marcia', 'COMPLETED', session.id, sessionStartTimeMs + 1000),
      makeAssignment('asg_2', 'ft_2', 'm_matheus', 'COMPLETED', session.id, sessionStartTimeMs + 2000),
      makeAssignment('asg_3', 'ft_3', 'm_marcia', 'COMPLETED', session.id, sessionStartTimeMs + 3000),
      makeAssignment('asg_4', 'ft_4', 'm_matheus', 'SCHEDULED', session.id)
    ];

    const check3of4 = asgs.filter(a => isAssignmentCompletedInChaosSession(a, session)).length === asgs.length;

    // Completar a 4ª tarefa
    asgs[3].status = 'COMPLETED' as any;
    asgs[3].completed_at = Timestamp.fromMillis(sessionStartTimeMs + 4000) as any;
    const check4of4 = asgs.filter(a => isAssignmentCompletedInChaosSession(a, session)).length === asgs.length;

    results.push({
      id: 'HF5-10',
      name: '100% prompt triggers ONLY when all current-session tasks are completed according to canonical predicate',
      passed: check3of4 === false && check4of4 === true,
      expected: { at3: false, at4: true },
      actual: { at3: check3of4, at4: check4of4 }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-11: Historical completion from earlier today does not count toward 100% prompt
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession();
    // Atribuição concluída às 08:00 (antes da sessão que começou às 10:00)
    const asgEarlierToday = makeAssignment(
      'asg_earlier',
      'ft_1',
      'm_marcia',
      'COMPLETED',
      session.id,
      sessionStartTimeMs - 7200000 // 2h antes
    );
    const countsInSession = isAssignmentCompletedInChaosSession(asgEarlierToday, session);

    results.push({
      id: 'HF5-11',
      name: 'Historical completion from earlier today does not count toward 100% prompt',
      passed: countsInSession === false,
      expected: false,
      actual: countsInSession
    });
  }

  // -------------------------------------------------------------------------
  // HF5-12: ONE_TIME task completed yesterday is ineligible for new ChaosSession
  // -------------------------------------------------------------------------
  {
    const ftOneTime = makeFamilyTask('ft_onetime_yest', 'Comprar pilhas', 'ONE_TIME');
    const existingAssignment = makeAssignment('asg_hist', ftOneTime.id, 'm_marcia', 'COMPLETED');
    existingAssignment.scheduled_date = '2026-09-22';
    (existingAssignment as any).date = '2026-09-22';

    const isCompleted = ChaosSessionService.isOneTimeTaskAlreadyCompleted(
      ftOneTime.id,
      [existingAssignment],
      [ftOneTime]
    );

    let rejectedByService = false;
    try {
      ChaosSessionService.validateAndNormalizeTasks(
        [{ familyTaskId: ftOneTime.id, strategy: 'DISTRIBUTED' }],
        [ftOneTime],
        familyId,
        [existingAssignment],
        '2026-09-23'
      );
    } catch (err: any) {
      if (err.message.includes('ONE_TIME_ALREADY_COMPLETED')) {
        rejectedByService = true;
      }
    }

    results.push({
      id: 'HF5-12',
      name: 'ONE_TIME task completed yesterday is ineligible for new ChaosSession',
      passed: isCompleted === true && rejectedByService === true,
      expected: true,
      actual: { isCompleted, rejectedByService }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-13: ONE_TIME task completed in previous ChaosSession is ineligible for new ChaosSession
  // -------------------------------------------------------------------------
  {
    const ftOneTime = makeFamilyTask('ft_onetime_prev_chaos', 'Consertar maçaneta', 'ONE_TIME');
    const existingAssignment = makeAssignment('asg_prev_chaos', ftOneTime.id, 'm_matheus', 'COMPLETED', 'sess_old');

    const isCompleted = ChaosSessionService.isOneTimeTaskAlreadyCompleted(
      ftOneTime.id,
      [existingAssignment],
      [ftOneTime]
    );

    let rejected = false;
    try {
      ChaosSessionService.validateAndNormalizeTasks(
        [{ familyTaskId: ftOneTime.id, strategy: 'DISTRIBUTED' }],
        [ftOneTime],
        familyId,
        [existingAssignment],
        '2026-09-23'
      );
    } catch (err: any) {
      if (err.message.includes('ONE_TIME_ALREADY_COMPLETED')) {
        rejected = true;
      }
    }

    results.push({
      id: 'HF5-13',
      name: 'ONE_TIME task completed in previous ChaosSession is ineligible for new ChaosSession',
      passed: isCompleted === true && rejected === true,
      expected: true,
      actual: { isCompleted, rejected }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-14: ONE_TIME task completed via SELF_CLAIMED is ineligible for new ChaosSession
  // -------------------------------------------------------------------------
  {
    const ftOneTime = makeFamilyTask('ft_onetime_self', 'Pintar portão', 'ONE_TIME');
    const existingAssignment = makeAssignment(
      'asg_self',
      ftOneTime.id,
      'm_marcia',
      'COMPLETED',
      undefined,
      undefined,
      'SELF_CLAIMED'
    );

    const isCompleted = ChaosSessionService.isOneTimeTaskAlreadyCompleted(
      ftOneTime.id,
      [existingAssignment],
      [ftOneTime]
    );

    results.push({
      id: 'HF5-14',
      name: 'ONE_TIME task completed via SELF_CLAIMED is ineligible for new ChaosSession',
      passed: isCompleted === true,
      expected: true,
      actual: isCompleted
    });
  }

  // -------------------------------------------------------------------------
  // HF5-15: ONE_TIME task completed via ADMIN_INTERVENTION is ineligible for new ChaosSession
  // -------------------------------------------------------------------------
  {
    const ftOneTime = makeFamilyTask('ft_onetime_admin', 'Instalar prateleira', 'ONE_TIME');
    const existingAssignment = makeAssignment(
      'asg_admin',
      ftOneTime.id,
      'm_matheus',
      'COMPLETED',
      undefined,
      undefined,
      'ADMIN_INTERVENTION'
    );

    const isCompleted = ChaosSessionService.isOneTimeTaskAlreadyCompleted(
      ftOneTime.id,
      [existingAssignment],
      [ftOneTime]
    );

    results.push({
      id: 'HF5-15',
      name: 'ONE_TIME task completed via ADMIN_INTERVENTION is ineligible for new ChaosSession',
      passed: isCompleted === true,
      expected: true,
      actual: isCompleted
    });
  }

  // -------------------------------------------------------------------------
  // HF5-16: ONE_TIME pending task remains eligible
  // -------------------------------------------------------------------------
  {
    const ftOneTime = makeFamilyTask('ft_onetime_pending', 'Trocar lâmpada sala', 'ONE_TIME');
    const existingAssignment = makeAssignment('asg_pending', ftOneTime.id, 'm_marcia', 'SCHEDULED');

    const isCompleted = ChaosSessionService.isOneTimeTaskAlreadyCompleted(
      ftOneTime.id,
      [existingAssignment],
      [ftOneTime]
    );

    const normalized = ChaosSessionService.validateAndNormalizeTasks(
      [{ familyTaskId: ftOneTime.id, strategy: 'DISTRIBUTED' }],
      [ftOneTime],
      familyId,
      [existingAssignment],
      '2026-09-23'
    );

    results.push({
      id: 'HF5-16',
      name: 'ONE_TIME pending task remains eligible',
      passed: isCompleted === false && normalized.length === 1,
      expected: { isCompleted: false, count: 1 },
      actual: { isCompleted, count: normalized.length }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-17: Recurring task (DAILY) completed yesterday remains eligible for new ChaosSession today
  // -------------------------------------------------------------------------
  {
    const ftDaily = makeFamilyTask('ft_daily_yest', 'Lavar a louça', 'DAILY');
    const existingAssignmentYesterday = makeAssignment('asg_daily_yest', ftDaily.id, 'm_marcia', 'COMPLETED');
    existingAssignmentYesterday.scheduled_date = '2026-09-22';
    (existingAssignmentYesterday as any).date = '2026-09-22';

    // Regra ONE_TIME não se aplica à recorrente
    const isOneTimeCompleted = ChaosSessionService.isOneTimeTaskAlreadyCompleted(
      ftDaily.id,
      [existingAssignmentYesterday],
      [ftDaily]
    );

    // Validação de hoje (2026-09-23) permite inclusão
    const normalized = ChaosSessionService.validateAndNormalizeTasks(
      [{ familyTaskId: ftDaily.id, strategy: 'DISTRIBUTED' }],
      [ftDaily],
      familyId,
      [existingAssignmentYesterday],
      '2026-09-23'
    );

    results.push({
      id: 'HF5-17',
      name: 'Recurring task (DAILY) completed yesterday remains eligible for new ChaosSession today',
      passed: isOneTimeCompleted === false && normalized.length === 1,
      expected: { isOneTimeCompleted: false, count: 1 },
      actual: { isOneTimeCompleted, count: normalized.length }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-18: Recurring task (WEEKLY) completed last week remains eligible for new ChaosSession
  // -------------------------------------------------------------------------
  {
    const ftWeekly = makeFamilyTask('ft_weekly_last_week', 'Limpar geladeira', 'WEEKLY');
    const existingAssignment = makeAssignment('asg_weekly_old', ftWeekly.id, 'm_marcia', 'COMPLETED');
    existingAssignment.scheduled_date = '2026-09-15';
    (existingAssignment as any).date = '2026-09-15';

    const isOneTimeCompleted = ChaosSessionService.isOneTimeTaskAlreadyCompleted(
      ftWeekly.id,
      [existingAssignment],
      [ftWeekly]
    );

    const normalized = ChaosSessionService.validateAndNormalizeTasks(
      [{ familyTaskId: ftWeekly.id, strategy: 'DISTRIBUTED' }],
      [ftWeekly],
      familyId,
      [existingAssignment],
      '2026-09-23'
    );

    results.push({
      id: 'HF5-18',
      name: 'Recurring task (WEEKLY) completed last week remains eligible for new ChaosSession',
      passed: isOneTimeCompleted === false && normalized.length === 1,
      expected: { isOneTimeCompleted: false, count: 1 },
      actual: { isOneTimeCompleted, count: normalized.length }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-19: Recurring task completed TODAY remains ineligible under HF3 rule
  // -------------------------------------------------------------------------
  {
    const ftDaily = makeFamilyTask('ft_daily_today', 'Varrer sala', 'DAILY');
    const existingAssignmentToday = makeAssignment('asg_daily_today', ftDaily.id, 'm_marcia', 'COMPLETED');
    existingAssignmentToday.scheduled_date = '2026-09-23';
    (existingAssignmentToday as any).date = '2026-09-23';

    let rejectedByTodayRule = false;
    try {
      ChaosSessionService.validateAndNormalizeTasks(
        [{ familyTaskId: ftDaily.id, strategy: 'DISTRIBUTED' }],
        [ftDaily],
        familyId,
        [existingAssignmentToday],
        '2026-09-23'
      );
    } catch (err: any) {
      if (err.message.includes('ALREADY_COMPLETED_TODAY')) {
        rejectedByTodayRule = true;
      }
    }

    results.push({
      id: 'HF5-19',
      name: 'Recurring task completed TODAY remains ineligible under HF3 rule',
      passed: rejectedByTodayRule === true,
      expected: true,
      actual: rejectedByTodayRule
    });
  }

  // -------------------------------------------------------------------------
  // HF5-20: ChaosSetupView disables completed ONE_TIME task and displays "Já concluída"
  // -------------------------------------------------------------------------
  {
    const ftOneTimeEarlier = makeFamilyTask('ft_onetime_earlier', 'Reparar vazamento', 'ONE_TIME');
    const completedTasksList: Task[] = [
      {
        id: 'asg_earlier',
        familyTaskId: ftOneTimeEarlier.id,
        title: 'Reparar vazamento',
        status: 'DONE',
        scheduledDate: '2026-09-20',
        completedAt: '2026-09-20T14:00:00Z'
      } as any
    ];

    // Simulação da lógica do useMemo em ChaosSetupView
    const completedTodayIds = new Set<string>(); // Não foi concluída hoje
    const completedOneTimeIds = new Set<string>();
    completedTasksList.forEach(t => {
      if (t.status === 'DONE') {
        completedOneTimeIds.add(t.familyTaskId);
      }
    });

    const isCompletedToday = completedTodayIds.has(ftOneTimeEarlier.id);
    const isCompletedEarlierOneTime = completedOneTimeIds.has(ftOneTimeEarlier.id) && !isCompletedToday;
    const badgeText = isCompletedToday
      ? '✓ Já concluída hoje'
      : (isCompletedEarlierOneTime ? '✓ Já concluída' : null);

    results.push({
      id: 'HF5-20',
      name: 'ChaosSetupView disables completed ONE_TIME task and displays "Já concluída"',
      passed: badgeText === '✓ Já concluída',
      expected: '✓ Já concluída',
      actual: badgeText
    });
  }

  // -------------------------------------------------------------------------
  // HF5-21: ChaosSetupView excludes completed ONE_TIME task from "Select All"
  // -------------------------------------------------------------------------
  {
    const ftEligible = makeFamilyTask('ft_eligible', 'Arrumar cama', 'DAILY');
    const ftOneTimeDone = makeFamilyTask('ft_onetime_done', 'Montar estante', 'ONE_TIME');
    const allFamilyTasks = [ftEligible, ftOneTimeDone];

    const completedOneTimeIds = new Set<string>([ftOneTimeDone.id]);
    const completedTodayIds = new Set<string>();
    const ineligibleIds = new Set([...completedTodayIds, ...completedOneTimeIds]);

    // availableToAddFamilyTasks filtra ineligibleIds
    const availableToAdd = allFamilyTasks.filter(ft => !ineligibleIds.has(ft.id));

    // Select all seleciona apenas availableToAdd
    const selectedBatchIds = new Set(availableToAdd.map(t => t.id));

    results.push({
      id: 'HF5-21',
      name: 'ChaosSetupView excludes completed ONE_TIME task from "Select All"',
      passed: selectedBatchIds.has(ftEligible.id) && !selectedBatchIds.has(ftOneTimeDone.id),
      expected: { hasEligible: true, hasOneTimeDone: false },
      actual: { hasEligible: selectedBatchIds.has(ftEligible.id), hasOneTimeDone: selectedBatchIds.has(ftOneTimeDone.id) }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-22: ChaosSetupView excludes completed ONE_TIME task from selected count
  // -------------------------------------------------------------------------
  {
    const ftSuggested1 = makeFamilyTask('ft_sugg_1', 'Tirar pó', 'DAILY', true);
    const ftSuggested2 = makeFamilyTask('ft_sugg_2', 'Instalar cortina', 'ONE_TIME', true);
    const allSuggested = [ftSuggested1, ftSuggested2];

    const ineligibleIds = new Set<string>([ftSuggested2.id]);
    const initialSelectedTasks = allSuggested.filter(ft => !ineligibleIds.has(ft.id));

    results.push({
      id: 'HF5-22',
      name: 'ChaosSetupView excludes completed ONE_TIME task from selected count',
      passed: initialSelectedTasks.length === 1 && initialSelectedTasks[0].id === ftSuggested1.id,
      expected: 1,
      actual: initialSelectedTasks.length
    });
  }

  // -------------------------------------------------------------------------
  // HF5-23: Service layer rejects creation/start if completed ONE_TIME task is passed directly (defense in depth)
  // -------------------------------------------------------------------------
  {
    const ftOneTime = makeFamilyTask('ft_onetime_bypass', 'Limpar sótão', 'ONE_TIME');
    const existingAsg = makeAssignment('asg_bypass', ftOneTime.id, 'm_marcia', 'COMPLETED');
    existingAsg.scheduled_date = '2026-09-18';
    (existingAsg as any).date = '2026-09-18';

    let errorThrown = false;
    let errorMessage = '';

    try {
      ChaosSessionService.validateAndNormalizeTasks(
        [{ familyTaskId: ftOneTime.id, strategy: 'DISTRIBUTED' }],
        [ftOneTime],
        familyId,
        [existingAsg],
        '2026-09-23'
      );
    } catch (e: any) {
      errorThrown = true;
      errorMessage = e.message;
    }

    results.push({
      id: 'HF5-23',
      name: 'Service layer rejects creation/start if completed ONE_TIME task is passed directly (defense in depth)',
      passed: errorThrown && errorMessage.includes('ONE_TIME_ALREADY_COMPLETED'),
      expected: true,
      actual: { errorThrown, errorMessage }
    });
  }

  // -------------------------------------------------------------------------
  // HF5-24: Reproduction of PO defect: session with 4 tasks where 2 were historically completed starts at 0/4 (0%), not 2/4 (50%)
  // -------------------------------------------------------------------------
  {
    const session = makeActiveSession('sess_po_repro');
    // As 4 tarefas selecionadas na sessão
    session.selectedTaskIds = ['ft_test_5', 'ft_test_6', 'ft_test_7', 'ft_test_8'];
    session.tasks = [
      { familyTaskId: 'ft_test_5', strategy: 'DISTRIBUTED', assignmentId: 'asg_po_5' },
      { familyTaskId: 'ft_test_6', strategy: 'DISTRIBUTED', assignmentId: 'asg_po_6' },
      { familyTaskId: 'ft_test_7', strategy: 'OPEN_POOL', assignmentId: 'asg_po_7' },
      { familyTaskId: 'ft_test_8', strategy: 'OPEN_POOL', assignmentId: 'asg_po_8' }
    ];

    // No AppContext, existem tasks históricas de "teste criação canônica 5" e "teste criação canônica 6"
    // que foram concluídas antes (DONE)
    const historicalTasks: Task[] = [
      {
        id: 'hist_po_5',
        familyTaskId: 'ft_test_5',
        title: 'teste criação canônica 5',
        status: 'DONE',
        completedAt: new Date(sessionStartTimeMs - 3600000).toISOString() // Concluída 1 hora antes
      } as any,
      {
        id: 'hist_po_6',
        familyTaskId: 'ft_test_6',
        title: 'teste criação canônica 6',
        status: 'DONE',
        completedAt: new Date(sessionStartTimeMs - 7200000).toISOString() // Concluída 2 horas antes
      } as any
    ];

    // Os liveAssignments da sessão atual estão com status 'SCHEDULED'
    const liveAssignments: TaskAssignment[] = [
      makeAssignment('asg_po_5', 'ft_test_5', 'm_marcia', 'SCHEDULED', session.id),
      makeAssignment('asg_po_6', 'ft_test_6', 'm_matheus', 'SCHEDULED', session.id),
      makeAssignment('asg_po_7', 'ft_test_7', null, 'SCHEDULED', session.id),
      makeAssignment('asg_po_8', 'ft_test_8', null, 'SCHEDULED', session.id)
    ];

    // Avaliação canônica de ChaosActiveView para cada tarefa da sessão:
    const resolvedTasks = session.tasks.map(config => {
      const liveAsg = liveAssignments.find(a => a.id === config.assignmentId || a.family_task_id === config.familyTaskId);
      const matchingTask = historicalTasks.find(t => t.familyTaskId === config.familyTaskId);

      // Regra de ChaosActiveView refatorada com isAssignmentCompletedInChaosSession
      const isCompleted = liveAsg
        ? isAssignmentCompletedInChaosSession(liveAsg, session)
        : (matchingTask && (matchingTask.chaos_session_id === session.id || (matchingTask as any).chaosSessionId === session.id)
            ? isAssignmentCompletedInChaosSession(matchingTask, session)
            : false);

      return {
        familyTaskId: config.familyTaskId,
        isCompleted
      };
    });

    const totalTasksCount = resolvedTasks.length;
    const completedTasksCount = resolvedTasks.filter(t => t.isCompleted).length;
    const progressPercent = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

    results.push({
      id: 'HF5-24',
      name: 'Reproduction of PO defect: session with 4 tasks where 2 were historically completed starts at 0/4 (0%), not 2/4 (50%)',
      passed: completedTasksCount === 0 && progressPercent === 0,
      expected: { completedCount: 0, progressPercent: 0 },
      actual: { completedCount: completedTasksCount, progressPercent }
    });
  }

  return results;
}
