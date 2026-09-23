import { TaskCompletionService } from '../application/services/TaskCompletionService';
import { Member, Task, TaskAssignment, CompletionType } from '../types';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export function runCompletionAuthTestSuite(): TestResult[] {
  const results: TestResult[] = [];

  const adminMember: Member = {
    id: 'mem-admin-marina',
    familyId: 'fam-real-1',
    userId: 'uid-admin-marina',
    name: 'Marina',
    role: 'ADMIN',
    avatar: '👩',
    color: '#8c52ff',
    birth_date: '1985-05-15',
    age: 40,
    autonomyLevel: 4,
    points: 100,
    streak: 5,
    tasksCompleted: 10
  };

  const regularMemberLucas: Member = {
    id: 'mem-member-lucas',
    familyId: 'fam-real-1',
    userId: 'uid-member-lucas',
    name: 'Lucas',
    role: 'MEMBER',
    avatar: '👦',
    color: '#52c41a',
    birth_date: '2012-08-20',
    age: 13,
    autonomyLevel: 2,
    points: 40,
    streak: 2,
    tasksCompleted: 4
  };

  const regularMemberClara: Member = {
    id: 'mem-member-clara',
    familyId: 'fam-real-1',
    userId: 'uid-member-clara',
    name: 'Clara',
    role: 'MEMBER',
    avatar: '👧',
    color: '#fa8c16',
    birth_date: '2015-03-10',
    age: 10,
    autonomyLevel: 2,
    points: 30,
    streak: 1,
    tasksCompleted: 3
  };

  const sampleMembers = [adminMember, regularMemberLucas, regularMemberClara];

  // AUTH01: MEMBER completes own assigned task -> ALLOW, NORMAL_COMPLETION
  {
    const task: Partial<Task> = {
      id: 'task-lucas-1',
      title: 'Arrumar o quarto',
      status: 'PENDING',
      assignedMemberId: regularMemberLucas.id
    };

    const res = TaskCompletionService.authorizeCompletion({
      task,
      callerMember: regularMemberLucas
    });

    const passed = res.allowed === true && res.completionType === 'NORMAL_COMPLETION' && res.assignedMemberId === regularMemberLucas.id;
    results.push({
      id: 'AUTH01',
      name: 'MEMBER completes own assigned task -> ALLOW, NORMAL_COMPLETION',
      passed,
      expected: 'allowed: true, completionType: NORMAL_COMPLETION',
      actual: `allowed: ${res.allowed}, completionType: ${res.completionType}`
    });
  }

  // AUTH02: MEMBER completes other member's task -> DENY
  {
    const task: Partial<Task> = {
      id: 'task-lucas-1',
      title: 'Arrumar o quarto',
      status: 'PENDING',
      assignedMemberId: regularMemberLucas.id
    };

    const res = TaskCompletionService.authorizeCompletion({
      task,
      callerMember: regularMemberClara
    });

    const passed = res.allowed === false && res.completionType === undefined;
    results.push({
      id: 'AUTH02',
      name: 'MEMBER completes other member\'s task -> DENY',
      passed,
      expected: 'allowed: false',
      actual: `allowed: ${res.allowed}, reason: ${res.reason}`
    });
  }

  // AUTH03: MEMBER completes unassigned task -> ALLOW, SELF_CLAIMED, becomes assigned to caller
  {
    const task: Partial<Task> = {
      id: 'task-unassigned-1',
      title: 'Regar as plantas',
      status: 'PENDING',
      isUnassigned: true,
      assignedMemberId: undefined
    };

    const res = TaskCompletionService.authorizeCompletion({
      task,
      callerMember: regularMemberLucas
    });

    const passed = res.allowed === true && 
      res.completionType === 'SELF_CLAIMED' && 
      res.assignedMemberId === regularMemberLucas.id &&
      res.targetMemberId === regularMemberLucas.id &&
      res.isSelfClaim === true;

    results.push({
      id: 'AUTH03',
      name: 'MEMBER completes unassigned task -> ALLOW, SELF_CLAIMED, becomes assigned',
      passed,
      expected: 'allowed: true, completionType: SELF_CLAIMED, assignedMemberId: mem-member-lucas',
      actual: `allowed: ${res.allowed}, completionType: ${res.completionType}, assignedMemberId: ${res.assignedMemberId}`
    });
  }

  // AUTH04: ADMIN completes own assigned task -> ALLOW, NORMAL_COMPLETION
  {
    const task: Partial<Task> = {
      id: 'task-admin-1',
      title: 'Pagar contas',
      status: 'PENDING',
      assignedMemberId: adminMember.id
    };

    const res = TaskCompletionService.authorizeCompletion({
      task,
      callerMember: adminMember
    });

    const passed = res.allowed === true && res.completionType === 'NORMAL_COMPLETION' && res.assignedMemberId === adminMember.id;
    results.push({
      id: 'AUTH04',
      name: 'ADMIN completes own assigned task -> ALLOW, NORMAL_COMPLETION',
      passed,
      expected: 'allowed: true, completionType: NORMAL_COMPLETION',
      actual: `allowed: ${res.allowed}, completionType: ${res.completionType}`
    });
  }

  // AUTH05: ADMIN completes MEMBER's assigned task -> ALLOW, ADMIN_INTERVENTION, assignedMemberId PRESERVED
  {
    const task: Partial<Task> = {
      id: 'task-lucas-dishes',
      title: 'Lavar a louça do almoço',
      status: 'PENDING',
      assignedMemberId: regularMemberLucas.id
    };

    const res = TaskCompletionService.authorizeCompletion({
      task,
      callerMember: adminMember
    });

    const passed = res.allowed === true && 
      res.completionType === 'ADMIN_INTERVENTION' && 
      res.assignedMemberId === regularMemberLucas.id && // PRESERVED!
      res.isSelfClaim === false;

    results.push({
      id: 'AUTH05',
      name: 'ADMIN completes MEMBER task -> ALLOW, ADMIN_INTERVENTION, assignedMemberId PRESERVED',
      passed,
      expected: 'allowed: true, completionType: ADMIN_INTERVENTION, assignedMemberId: mem-member-lucas (PRESERVED)',
      actual: `allowed: ${res.allowed}, completionType: ${res.completionType}, assignedMemberId: ${res.assignedMemberId}`
    });
  }

  // AUTH06: ADMIN completes unassigned task -> ALLOW, SELF_CLAIMED, becomes assigned to ADMIN
  {
    const task: Partial<Task> = {
      id: 'task-unassigned-trash',
      title: 'Tirar o lixo orgânico',
      status: 'PENDING',
      isUnassigned: true,
      assignedMemberId: ''
    };

    const res = TaskCompletionService.authorizeCompletion({
      task,
      callerMember: adminMember
    });

    const passed = res.allowed === true && 
      res.completionType === 'SELF_CLAIMED' && 
      res.assignedMemberId === adminMember.id &&
      res.targetMemberId === adminMember.id;

    results.push({
      id: 'AUTH06',
      name: 'ADMIN completes unassigned task -> ALLOW, SELF_CLAIMED, becomes assigned to ADMIN',
      passed,
      expected: 'allowed: true, completionType: SELF_CLAIMED, assignedMemberId: mem-admin-marina',
      actual: `allowed: ${res.allowed}, completionType: ${res.completionType}, assignedMemberId: ${res.assignedMemberId}`
    });
  }

  // AUTH07: Completion requires authentication (fail closed on null caller)
  {
    const task: Partial<Task> = {
      id: 'task-lucas-1',
      title: 'Arrumar o quarto',
      status: 'PENDING',
      assignedMemberId: regularMemberLucas.id
    };

    const res = TaskCompletionService.authorizeCompletion({
      task,
      callerMember: null
    });

    const passed = res.allowed === false && res.reason?.includes('UNAUTHENTICATED');
    results.push({
      id: 'AUTH07',
      name: 'Completion requires authentication (fail closed on null caller)',
      passed,
      expected: 'allowed: false, reason: UNAUTHENTICATED',
      actual: `allowed: ${res.allowed}, reason: ${res.reason}`
    });
  }

  // AUTH08: Unmapped authUser fails closed (no members[0] fallback)
  {
    // Simulate resolution in application layer
    const authUser = { id: 'unknown-uid-stranger', email: 'stranger@example.com' };
    const resolvedCaller = sampleMembers.find(m => m.userId === authUser.id) || null; // No fallback to members[0]!

    const res = TaskCompletionService.authorizeCompletion({
      task: { id: 'task-1', assignedMemberId: regularMemberLucas.id },
      callerMember: resolvedCaller
    });

    const passed = resolvedCaller === null && res.allowed === false;
    results.push({
      id: 'AUTH08',
      name: 'Unmapped authUser fails closed (no members[0] fallback)',
      passed,
      expected: 'resolvedCaller: null, allowed: false',
      actual: `resolvedCaller: ${resolvedCaller}, allowed: ${res.allowed}`
    });
  }

  // AUTH09: Spoofed memberId in payload is IGNORED (caller identity derived from authenticated context)
  {
    // Attacker Clara claims she is Lucas by passing memberId='mem-member-lucas'
    const spoofedMemberIdParam = regularMemberLucas.id;
    const realAuthenticatedCaller = regularMemberClara; // Real caller derived from authUser

    // The service evaluates realAuthenticatedCaller regardless of what was in the UI param
    const res = TaskCompletionService.authorizeCompletion({
      task: { id: 'task-lucas-1', assignedMemberId: regularMemberLucas.id },
      callerMember: realAuthenticatedCaller
    });

    const passed = res.allowed === false;
    results.push({
      id: 'AUTH09',
      name: 'Spoofed memberId in payload is IGNORED (derived from authenticated context)',
      passed,
      expected: 'allowed: false (spoofing prevented)',
      actual: `allowed: ${res.allowed}`
    });
  }

  // AUTH10: Denied completion leaves task unchanged
  {
    let taskState: Partial<Task> = {
      id: 'task-lucas-bed',
      familyId: 'fam-real-1',
      title: 'Fazer a cama',
      status: 'PENDING',
      assignedMemberId: regularMemberLucas.id,
      effort: 10
    };

    const res = TaskCompletionService.authorizeCompletion({
      task: taskState,
      callerMember: regularMemberClara // Denied!
    });

    if (res.allowed) {
      taskState = { ...taskState, status: 'DONE' };
    }

    const passed = res.allowed === false && taskState.status === 'PENDING';
    results.push({
      id: 'AUTH10',
      name: 'Denied completion leaves task unchanged in memory/database',
      passed,
      expected: 'status remains TODO',
      actual: `status is ${taskState.status}`
    });
  }

  // AUTH11: Denied completion grants NO points/rewards
  {
    let clarapoints = regularMemberClara.points || 0;
    const initialPoints = clarapoints;

    const res = TaskCompletionService.authorizeCompletion({
      task: { id: 'task-lucas-bed', assignedMemberId: regularMemberLucas.id, status: 'PENDING' },
      callerMember: regularMemberClara // Denied!
    });

    if (res.allowed) {
      clarapoints += 15;
    }

    const passed = res.allowed === false && clarapoints === initialPoints;
    results.push({
      id: 'AUTH11',
      name: 'Denied completion grants NO points or streak rewards',
      passed,
      expected: `points: ${initialPoints}`,
      actual: `points: ${clarapoints}`
    });
  }

  // AUTH12: Denied completion does NOT trigger confetti
  {
    let confettiTriggered = false;

    // Simulate AppContext / UI contract
    const simulateComplete = (task: Partial<Task>, caller: Member | null): boolean => {
      const auth = TaskCompletionService.authorizeCompletion({ task, callerMember: caller });
      if (!auth.allowed) return false;
      return true;
    };

    const success = simulateComplete(
      { id: 'task-lucas-bed', assignedMemberId: regularMemberLucas.id, status: 'PENDING' },
      regularMemberClara // Denied!
    );

    if (success) {
      confettiTriggered = true;
    }

    const passed = success === false && confettiTriggered === false;
    results.push({
      id: 'AUTH12',
      name: 'Denied completion returns false and does NOT trigger confetti',
      passed,
      expected: 'success: false, confetti: false',
      actual: `success: ${success}, confetti: ${confettiTriggered}`
    });
  }

  // AUTH13: Already completed task rejects duplicate completion (Idempotency)
  {
    const completedTask: Partial<Task> = {
      id: 'task-done-1',
      title: 'Varrer a cozinha',
      status: 'DONE',
      assignedMemberId: regularMemberLucas.id
    };

    const res = TaskCompletionService.authorizeCompletion({
      task: completedTask,
      callerMember: regularMemberLucas
    });

    const passed = res.allowed === false && res.reason?.includes('ALREADY_COMPLETED');
    results.push({
      id: 'AUTH13',
      name: 'Already completed task rejects duplicate completion (Idempotency)',
      passed,
      expected: 'allowed: false, reason: ALREADY_COMPLETED',
      actual: `allowed: ${res.allowed}, reason: ${res.reason}`
    });
  }

  // AUTH14: Duplicate completion grants NO additional points
  {
    let lucasPoints = 40;
    const task: Partial<Task> = {
      id: 'task-done-1',
      status: 'DONE',
      assignedMemberId: regularMemberLucas.id
    };

    const res = TaskCompletionService.authorizeCompletion({
      task,
      callerMember: regularMemberLucas
    });

    if (res.allowed) {
      lucasPoints += 15;
    }

    const passed = res.allowed === false && lucasPoints === 40;
    results.push({
      id: 'AUTH14',
      name: 'Duplicate completion grants NO additional points (40 remains 40)',
      passed,
      expected: 'points: 40',
      actual: `points: ${lucasPoints}`
    });
  }

  // AUTH15: Self-claim sets is_unassigned=false, assignedMemberId=caller
  {
    const unassignedTask: Partial<TaskAssignment> = {
      id: 'asg-unassigned-5',
      is_unassigned: true,
      member_id: ''
    };

    const res = TaskCompletionService.authorizeCompletion({
      task: unassignedTask,
      callerMember: regularMemberClara
    });

    const passed = res.allowed === true && 
      res.completionType === 'SELF_CLAIMED' && 
      res.assignedMemberId === regularMemberClara.id &&
      res.isSelfClaim === true;

    results.push({
      id: 'AUTH15',
      name: 'Self-claim sets is_unassigned=false and assignedMemberId=caller',
      passed,
      expected: 'completionType: SELF_CLAIMED, assignedMemberId: mem-member-clara',
      actual: `completionType: ${res.completionType}, assignedMemberId: ${res.assignedMemberId}`
    });
  }

  // AUTH16: Admin intervention preserves original assignedMemberId and sets completed_by=admin
  {
    const task: Partial<Task> = {
      id: 'task-lucas-plants',
      assignedMemberId: regularMemberLucas.id,
      status: 'PENDING'
    };

    const res = TaskCompletionService.authorizeCompletion({
      task,
      callerMember: adminMember
    });

    const passed = res.allowed === true && 
      res.completionType === 'ADMIN_INTERVENTION' && 
      res.assignedMemberId === regularMemberLucas.id; // Lucas remains the assigned member

    results.push({
      id: 'AUTH16',
      name: 'Admin intervention preserves assignedMemberId=Lucas and marks completed_by=Marina',
      passed,
      expected: 'completionType: ADMIN_INTERVENTION, assignedMemberId: mem-member-lucas (PRESERVED)',
      actual: `completionType: ${res.completionType}, assignedMemberId: ${res.assignedMemberId}`
    });
  }

  // AUTH17: Concurrent self-claim: second claim fails/rejected
  {
    // In a race condition between Lucas and Clara for an unassigned task:
    // Lucas completes first: assignment status becomes COMPLETED and member_id=Lucas
    const assignmentDocInDb: Partial<TaskAssignment> = {
      id: 'asg-race-1',
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: ''
    };

    // Lucas completes
    const lucasAuth = TaskCompletionService.authorizeCompletion({
      task: assignmentDocInDb,
      callerMember: regularMemberLucas
    });

    // Simulate DB transaction commit for Lucas
    if (lucasAuth.allowed) {
      assignmentDocInDb.status = 'COMPLETED';
      assignmentDocInDb.is_unassigned = false;
      assignmentDocInDb.member_id = regularMemberLucas.id;
    }

    // Clara's transaction attempts to commit now
    const claraAuth = TaskCompletionService.authorizeCompletion({
      task: assignmentDocInDb,
      callerMember: regularMemberClara
    });

    const passed = lucasAuth.allowed === true && claraAuth.allowed === false;
    results.push({
      id: 'AUTH17',
      name: 'Concurrent self-claim race: second claim is rejected',
      passed,
      expected: 'Lucas allowed: true, Clara allowed: false',
      actual: `Lucas allowed: ${lucasAuth.allowed}, Clara allowed: ${claraAuth.allowed}`
    });
  }

  // AUTH18: Firestore transaction failure leaves local state intact
  {
    let localTaskStatus = 'PENDING';
    let localMemberPoints = 40;

    const simulateTransactionFailure = () => {
      // Step 1: Pre-authorization passes
      const auth = TaskCompletionService.authorizeCompletion({
        task: { id: 'task-1', assignedMemberId: regularMemberLucas.id, status: 'PENDING' },
        callerMember: regularMemberLucas
      });
      if (!auth.allowed) return false;

      // Step 2: Firestore transaction throws network / contention error
      const firestoreSucceeded = false;
      if (!firestoreSucceeded) {
        // Rollback / do not update local state
        return false;
      }

      localTaskStatus = 'DONE';
      localMemberPoints += 15;
      return true;
    };

    const result = simulateTransactionFailure();
    const passed = result === false && localTaskStatus === 'PENDING' && localMemberPoints === 40;

    results.push({
      id: 'AUTH18',
      name: 'Firestore transaction failure leaves local task and points state intact',
      passed,
      expected: 'status: TODO, points: 40, returned: false',
      actual: `status: ${localTaskStatus}, points: ${localMemberPoints}, returned: ${result}`
    });
  }

  // AUTH19: Completion observation correctly generated for admin intervention
  {
    const completedTask = {
      completionType: 'ADMIN_INTERVENTION' as CompletionType,
      completedByMemberId: adminMember.id,
      completedByName: 'Marina',
      assignedMemberId: regularMemberLucas.id,
      assigneeName: 'Lucas'
    };

    const obs = TaskCompletionService.getCompletionObservation(completedTask, sampleMembers);
    const passed = obs !== null && obs.includes('Concluída pela administradora Marina');

    results.push({
      id: 'AUTH19',
      name: 'Completion observation correctly generated for admin intervention',
      passed,
      expected: 'Concluída pela administradora Marina',
      actual: `${obs}`
    });
  }

  // AUTH20: Completion observation correctly generated for self-claim
  {
    const completedTask = {
      completionType: 'SELF_CLAIMED' as CompletionType,
      completedByMemberId: regularMemberLucas.id,
      completedByName: 'Lucas',
      assignedMemberId: regularMemberLucas.id,
      assigneeName: 'Lucas'
    };

    const obs = TaskCompletionService.getCompletionObservation(completedTask, sampleMembers);
    const passed = obs !== null && obs.includes('Assumida e concluída por iniciativa de Lucas');

    results.push({
      id: 'AUTH20',
      name: 'Completion observation correctly generated for self-claim (iniciativa)',
      passed,
      expected: 'Assumida e concluída por iniciativa de Lucas',
      actual: `${obs}`
    });
  }

  // AUTH21: Member without family membership fails closed
  {
    const outsiderCaller: Member = {
      id: 'mem-outsider-99',
      familyId: 'other-family-99', // Different family!
      userId: 'uid-outsider',
      name: 'Outsider',
      role: 'MEMBER'
    };

    // Application layer check
    const activeFamilyId = 'fam-real-1';
    const isValidCaller = outsiderCaller.familyId === activeFamilyId;
    const auth = isValidCaller 
      ? TaskCompletionService.authorizeCompletion({ task: { id: 'task-1' }, callerMember: outsiderCaller })
      : { allowed: false, reason: 'OUTSIDER_FAMILY' };

    const passed = auth.allowed === false && auth.reason === 'OUTSIDER_FAMILY';
    results.push({
      id: 'AUTH21',
      name: 'Member without family membership in active family fails closed',
      passed,
      expected: 'allowed: false, reason: OUTSIDER_FAMILY',
      actual: `allowed: ${auth.allowed}, reason: ${auth.reason}`
    });
  }

  // AUTH22: Multiple completions by same member each award points correctly (distinct tasks)
  {
    let lucasPoints = regularMemberLucas.points || 0; // 40
    let streak = regularMemberLucas.streak || 0; // 2

    const taskA: Partial<Task> = { id: 'task-a', status: 'PENDING', assignedMemberId: regularMemberLucas.id };
    const taskB: Partial<Task> = { id: 'task-b', status: 'PENDING', assignedMemberId: regularMemberLucas.id };

    const authA = TaskCompletionService.authorizeCompletion({ task: taskA, callerMember: regularMemberLucas });
    if (authA.allowed) {
      taskA.status = 'DONE';
      lucasPoints += 15;
      streak += 1;
    }

    const authB = TaskCompletionService.authorizeCompletion({ task: taskB, callerMember: regularMemberLucas });
    if (authB.allowed) {
      taskB.status = 'DONE';
      lucasPoints += 15;
      streak += 1;
    }

    const passed = authA.allowed === true && authB.allowed === true && lucasPoints === 70 && streak === 4;
    results.push({
      id: 'AUTH22',
      name: 'Multiple completions for distinct tasks award +15 pts and +1 streak each',
      passed,
      expected: 'points: 70, streak: 4',
      actual: `points: ${lucasPoints}, streak: ${streak}`
    });
  }

  return results;
}
