/**
 * CASA JUNTO — TEST SUITE: CHAOS-1D-HF4-R3
 * RUNTIME FIRESTORE SERIALIZATION FIX — TASK ASSIGNMENT
 * 
 * Verifies canonical serialization boundary:
 * TaskAssignment domain object -> toTaskAssignmentPersistencePayload -> sanitizePayload -> Firestore
 * 
 * Test cases:
 * R3-01: TaskAssignment with unassignedReason === undefined is serialized without the property
 * R3-02: Firestore assignment payload recursively contains ZERO undefined values
 * R3-03: null values remain null
 * R3-04: false and 0 are preserved
 * R3-05: Timestamp values remain valid
 * R3-06: Nested completion metadata is preserved
 * R3-07: Nested Chaos metadata is preserved
 * R3-08: DISTRIBUTED task previously assigned to non-participant serializes successfully after reassignment
 * R3-09: DISTRIBUTED task with no eligible participant persists as unassigned without undefined Firestore fields
 * R3-10: OPEN_POOL persists member_id='' / is_unassigned=true without invalid undefined payload
 * R3-11: Previously persisted unassignedReason is correctly cleared (canonical null) when transitioning to assigned
 * R3-12: Completed assignment metadata is not altered
 * R3-13: Existing assigned task outside the selected Chaos tasks remains untouched
 * R3-14: Repeated serialization is deterministic/idempotent and does not mutate input
 * R3-15: Reproduction of the exact PO runtime scenario:
 *        Márcia + Matheus, 4 DISTRIBUTED tasks, pre-assigned to Daniel
 *        -> resolution & serialization succeeds without undefined Firestore fields
 *        -> zero Daniel assignments in Chaos session
 */

import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { TaskAssignment, Member, TaskMaster } from '../domain/models';
import { ChaosSessionService } from '../services/chaosSessionService';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  error?: string;
}

/**
 * Função utilitária para verificar recursivamente se algum campo é estritamente undefined.
 */
function findUndefinedFields(obj: any, currentPath: string = ''): string[] {
  const undefinedPaths: string[] = [];
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    if (obj === undefined) undefinedPaths.push(currentPath || 'ROOT');
    return undefinedPaths;
  }
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = currentPath ? `${currentPath}.${key}` : key;
    if (value === undefined) {
      undefinedPaths.push(fieldPath);
    } else if (value !== null && typeof value === 'object') {
      undefinedPaths.push(...findUndefinedFields(value, fieldPath));
    }
  }
  return undefinedPaths;
}

export async function runChaosSession1dHf4R3TestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const marcia: Member = {
    id: 'mem-marcia',
    familyId: 'fam-mtm1580s',
    name: 'Márcia',
    role: 'ADMIN',
    avatar: '👩',
    color: '#ec4899',
    points: 100,
    streak: 3,
    tasksCompleted: 10,
    active: true,
    joinedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  } as any;

  const matheus: Member = {
    id: 'mem-matheus',
    familyId: 'fam-mtm1580s',
    name: 'Matheus',
    role: 'MEMBER',
    avatar: '👦',
    color: '#3b82f6',
    points: 80,
    streak: 2,
    tasksCompleted: 8,
    active: true,
    joinedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  } as any;

  const daniel: Member = {
    id: 'mem-daniel',
    familyId: 'fam-mtm1580s',
    name: 'Daniel',
    role: 'MEMBER',
    avatar: '👨',
    color: '#10b981',
    points: 60,
    streak: 1,
    tasksCompleted: 5,
    active: true,
    joinedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  } as any;

  const baseTasks: TaskMaster[] = ([
    {
      id: 'task-1',
      title: 'Lavar Louça',
      description: 'Lavar pratos e talheres',
      category: 'KITCHEN',
      effort_score: 2,
      priority: 'MEDIUM',
      frequency: 'DAILY',
      estimated_duration_minutes: 20,
      active: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z'
    },
    {
      id: 'task-2',
      title: 'Tirar Lixo',
      description: 'Esvaziar lixeiras',
      category: 'CLEANING',
      effort_score: 1,
      priority: 'HIGH',
      frequency: 'DAILY',
      estimated_duration_minutes: 10,
      active: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z'
    },
    {
      id: 'task-3',
      title: 'Limpar Banheiro',
      description: 'Higienizar pia e vaso',
      category: 'BATHROOM',
      effort_score: 3,
      priority: 'HIGH',
      frequency: 'WEEKLY',
      estimated_duration_minutes: 30,
      active: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z'
    },
    {
      id: 'task-4',
      title: 'Varrer Sala',
      description: 'Passar vassoura na sala e corredor',
      category: 'LIVING_ROOM',
      effort_score: 2,
      priority: 'MEDIUM',
      frequency: 'DAILY',
      estimated_duration_minutes: 15,
      active: true,
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-01T00:00:00Z'
    }
  ] as any);

  // R3-01: TaskAssignment with unassignedReason === undefined is serialized without the property
  try {
    const rawAssignment: Partial<TaskAssignment> = {
      id: '4SCnl1jzyHhNNTfLzrn2_2026-09-23',
      family_id: 'fam-mtm1580s',
      task_id: 'task-1',
      member_id: 'mem-matheus',
      status: 'PENDING',
      is_unassigned: false,
      unassigned_reason: undefined,
      assigned_reason: 'Atribuído no Modo Caos via Motor 2.0'
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(rawAssignment);

    // O payload não deve conter chave com valor undefined
    const undefs = findUndefinedFields(payload);
    const passed = !('unassigned_reason' in payload && payload.unassigned_reason === undefined) &&
                   undefs.length === 0;

    results.push({
      id: 'R3-01',
      name: 'TaskAssignment with unassignedReason === undefined is serialized without undefined property',
      passed,
      expected: 'No undefined values in payload',
      actual: `unassigned_reason in payload: ${'unassigned_reason' in payload ? payload.unassigned_reason : 'omitted'}, undefined count: ${undefs.length}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-01', name: 'TaskAssignment with unassignedReason === undefined', passed: false, error: e.message });
  }

  // R3-02: Firestore assignment payload recursively contains ZERO undefined values
  try {
    const deepAssignment: any = {
      id: 'asg-deep',
      family_id: 'fam-mtm1580s',
      task_id: 'task-2',
      member_id: 'mem-marcia',
      status: 'SCHEDULED',
      factors: {
        skills: 10,
        preference: 5,
        streak: 0,
        workload: undefined,
        deepNested: {
          validProp: 'ok',
          invalidProp: undefined
        }
      },
      notes: undefined,
      feedback_difficulty: undefined,
      unassigned_reason: undefined
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(deepAssignment);
    const undefs = findUndefinedFields(payload);

    results.push({
      id: 'R3-02',
      name: 'Firestore assignment payload recursively contains ZERO undefined values',
      passed: undefs.length === 0,
      expected: '0 undefined fields',
      actual: `${undefs.length} undefined fields: ${undefs.join(', ')}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-02', name: 'Payload contains ZERO undefined values', passed: false, error: e.message });
  }

  // R3-03: null values remain null
  try {
    const nullAssignment: Partial<TaskAssignment> = {
      id: 'asg-null',
      family_id: 'fam-mtm1580s',
      task_id: 'task-3',
      member_id: 'mem-matheus',
      notes: null as any,
      room_id: null as any,
      feedback_difficulty: null as any,
      unassigned_reason: null as any
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(nullAssignment);
    const passed = payload.notes === null &&
                   payload.room_id === null &&
                   payload.feedback_difficulty === null &&
                   payload.unassigned_reason === null;

    results.push({
      id: 'R3-03',
      name: 'null values remain null',
      passed,
      expected: 'All specified null fields preserved as null',
      actual: `notes=${payload.notes}, room_id=${payload.room_id}, feedback_difficulty=${payload.feedback_difficulty}, unassigned_reason=${payload.unassigned_reason}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-03', name: 'null values remain null', passed: false, error: e.message });
  }

  // R3-04: false and 0 are preserved
  try {
    const zeroFalseAssignment: Partial<TaskAssignment> = {
      id: 'asg-zero-false',
      family_id: 'fam-mtm1580s',
      task_id: 'task-1',
      member_id: 'mem-marcia',
      score: 0,
      rescheduled_count: 0,
      is_unassigned: false,
      is_blitz: false
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(zeroFalseAssignment);
    const passed = payload.score === 0 &&
                   payload.rescheduled_count === 0 &&
                   payload.is_unassigned === false &&
                   payload.is_blitz === false;

    results.push({
      id: 'R3-04',
      name: 'false and 0 are preserved',
      passed,
      expected: 'score=0, rescheduled_count=0, is_unassigned=false, is_blitz=false',
      actual: `score=${payload.score}, count=${payload.rescheduled_count}, unassigned=${payload.is_unassigned}, blitz=${payload.is_blitz}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-04', name: 'false and 0 are preserved', passed: false, error: e.message });
  }

  // R3-05: Timestamp values remain valid
  try {
    const mockTimestamp = {
      seconds: 1727088000,
      nanoseconds: 0,
      toMillis: () => 1727088000000,
      isEqual: () => true
    };

    const timestampAssignment: any = {
      id: 'asg-timestamp',
      family_id: 'fam-mtm1580s',
      task_id: 'task-1',
      updatedAt: mockTimestamp
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(timestampAssignment);
    const passed = payload.updatedAt === mockTimestamp;

    results.push({
      id: 'R3-05',
      name: 'Timestamp values remain valid',
      passed,
      expected: 'Timestamp object preserved untouched',
      actual: `updatedAt.toMillis()=${typeof payload.updatedAt?.toMillis === 'function' ? payload.updatedAt.toMillis() : 'none'}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-05', name: 'Timestamp values remain valid', passed: false, error: e.message });
  }

  // R3-06: Nested completion metadata is preserved
  try {
    const completedAssignment: Partial<TaskAssignment> = {
      id: 'asg-completed',
      family_id: 'fam-mtm1580s',
      task_id: 'task-4',
      member_id: 'mem-matheus',
      status: 'DONE',
      completed_at: '2026-09-23T10:30:00Z',
      completed_by: 'mem-matheus',
      completed_by_name: 'Matheus',
      completion_type: 'ASSIGNED' as any,
      completion_duration: 15
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(completedAssignment);
    const passed = payload.status === 'DONE' &&
                   payload.completed_at === '2026-09-23T10:30:00Z' &&
                   payload.completed_by === 'mem-matheus' &&
                   payload.completed_by_name === 'Matheus' &&
                   payload.completion_type === 'ASSIGNED' &&
                   payload.completion_duration === 15;

    results.push({
      id: 'R3-06',
      name: 'Nested completion metadata is preserved',
      passed,
      expected: 'All completion metadata properties intact',
      actual: `status=${payload.status}, completed_by=${payload.completed_by}, type=${payload.completion_type}, duration=${payload.completion_duration}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-06', name: 'Nested completion metadata is preserved', passed: false, error: e.message });
  }

  // R3-07: Nested Chaos metadata is preserved
  try {
    const chaosAssignment: Partial<TaskAssignment> = {
      id: 'asg-chaos',
      family_id: 'fam-mtm1580s',
      task_id: 'task-1',
      member_id: 'mem-marcia',
      chaos_session_id: 'chaos-session-789',
      chaos_strategy: 'DISTRIBUTED'
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(chaosAssignment);
    const passed = payload.chaos_session_id === 'chaos-session-789' &&
                   payload.chaos_strategy === 'DISTRIBUTED';

    results.push({
      id: 'R3-07',
      name: 'Nested Chaos metadata is preserved',
      passed,
      expected: 'chaos_session_id and chaos_strategy preserved',
      actual: `session=${payload.chaos_session_id}, strategy=${payload.chaos_strategy}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-07', name: 'Nested Chaos metadata is preserved', passed: false, error: e.message });
  }

  // R3-08: DISTRIBUTED task previously assigned to non-participant serializes successfully after reassignment
  try {
    const reassignedTask: Partial<TaskAssignment> = {
      id: '4SCnl1jzyHhNNTfLzrn2_2026-09-23',
      family_id: 'fam-mtm1580s',
      task_id: 'task-1',
      member_id: 'mem-matheus', // previously daniel, now matheus
      is_unassigned: false,
      unassigned_reason: undefined,
      chaos_session_id: 'chaos-session-po',
      chaos_strategy: 'DISTRIBUTED'
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(reassignedTask);
    const undefs = findUndefinedFields(payload);
    const passed = payload.member_id === 'mem-matheus' &&
                   payload.is_unassigned === false &&
                   payload.unassigned_reason === null && // cleared canonically
                   undefs.length === 0;

    results.push({
      id: 'R3-08',
      name: 'DISTRIBUTED task previously assigned to non-participant serializes successfully after reassignment',
      passed,
      expected: 'member_id=mem-matheus, unassigned_reason=null, 0 undefined fields',
      actual: `member_id=${payload.member_id}, unassigned_reason=${payload.unassigned_reason}, undefs=${undefs.length}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-08', name: 'DISTRIBUTED task reassignment serialization', passed: false, error: e.message });
  }

  // R3-09: DISTRIBUTED task with no eligible participant persists as unassigned without undefined Firestore fields
  try {
    const unassignedDistributed: Partial<TaskAssignment> = {
      id: 'asg-unassigned-dist',
      family_id: 'fam-mtm1580s',
      task_id: 'task-3',
      member_id: '',
      is_unassigned: true,
      unassigned_reason: 'Nenhum participante disponível no momento',
      chaos_session_id: 'chaos-session-po',
      chaos_strategy: 'DISTRIBUTED'
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(unassignedDistributed);
    const undefs = findUndefinedFields(payload);
    const passed = payload.member_id === '' &&
                   payload.is_unassigned === true &&
                   payload.unassigned_reason === 'Nenhum participante disponível no momento' &&
                   undefs.length === 0;

    results.push({
      id: 'R3-09',
      name: 'DISTRIBUTED task with no eligible participant persists as unassigned without undefined Firestore fields',
      passed,
      expected: 'is_unassigned=true, reason preserved, 0 undefs',
      actual: `is_unassigned=${payload.is_unassigned}, reason=${payload.unassigned_reason}, undefs=${undefs.length}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-09', name: 'DISTRIBUTED task unassigned serialization', passed: false, error: e.message });
  }

  // R3-10: OPEN_POOL persists member_id='' / is_unassigned=true without invalid undefined payload
  try {
    const openPoolTask: Partial<TaskAssignment> = {
      id: 'asg-open-pool',
      family_id: 'fam-mtm1580s',
      task_id: 'task-2',
      member_id: '',
      is_unassigned: true,
      unassigned_reason: 'Disponível no Modo Caos (Pool Aberto)',
      chaos_session_id: 'chaos-session-po',
      chaos_strategy: 'OPEN_POOL'
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(openPoolTask);
    const undefs = findUndefinedFields(payload);
    const passed = payload.member_id === '' &&
                   payload.is_unassigned === true &&
                   payload.unassigned_reason === 'Disponível no Modo Caos (Pool Aberto)' &&
                   payload.chaos_strategy === 'OPEN_POOL' &&
                   undefs.length === 0;

    results.push({
      id: 'R3-10',
      name: 'OPEN_POOL persists member_id="" / is_unassigned=true without invalid undefined payload',
      passed,
      expected: 'member_id="", is_unassigned=true, strategy=OPEN_POOL, 0 undefs',
      actual: `member_id=${payload.member_id}, strategy=${payload.chaos_strategy}, undefs=${undefs.length}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-10', name: 'OPEN_POOL serialization', passed: false, error: e.message });
  }

  // R3-11: Previously persisted unassignedReason is correctly cleared (canonical null) when transitioning to assigned
  try {
    // Cenário: A tarefa estava unassigned com motivo no Firestore. Agora é atribuída a Matheus.
    // O chamador passa { member_id: 'mem-matheus', is_unassigned: false } sem especificar unassigned_reason (ou undefined).
    const assignmentTransition: Partial<TaskAssignment> = {
      id: 'asg-transition',
      family_id: 'fam-mtm1580s',
      task_id: 'task-1',
      member_id: 'mem-matheus',
      is_unassigned: false
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(assignmentTransition);
    const passed = payload.unassigned_reason === null &&
                   payload.is_unassigned === false &&
                   payload.member_id === 'mem-matheus';

    results.push({
      id: 'R3-11',
      name: 'Previously persisted unassignedReason is correctly cleared (canonical null) when transitioning to assigned',
      passed,
      expected: 'unassigned_reason === null (explicit clearing)',
      actual: `unassigned_reason=${payload.unassigned_reason}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-11', name: 'unassignedReason clearing semantics', passed: false, error: e.message });
  }

  // R3-12: Completed assignment metadata is not altered
  try {
    const completedAssignment: Partial<TaskAssignment> = {
      id: 'asg-completed-stable',
      family_id: 'fam-mtm1580s',
      task_id: 'task-1',
      member_id: 'mem-marcia',
      status: 'COMPLETED',
      completed_at: '2026-09-23T08:00:00Z',
      completed_by: 'mem-marcia',
      completed_by_name: 'Márcia',
      completion_type: 'ASSIGNED' as any,
      completion_duration: 20,
      score: 15,
      is_unassigned: false
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(completedAssignment);
    const passed = payload.status === 'COMPLETED' &&
                   payload.completed_at === '2026-09-23T08:00:00Z' &&
                   payload.completed_by === 'mem-marcia' &&
                   payload.completed_by_name === 'Márcia' &&
                   payload.completion_type === 'ASSIGNED' &&
                   payload.completion_duration === 20 &&
                   payload.score === 15 &&
                   payload.is_unassigned === false;

    results.push({
      id: 'R3-12',
      name: 'Completed assignment metadata is not altered during serialization',
      passed,
      expected: 'All completion metadata completely preserved',
      actual: `status=${payload.status}, completed_by=${payload.completed_by}, score=${payload.score}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-12', name: 'Completed assignment metadata preservation', passed: false, error: e.message });
  }

  // R3-13: Existing assigned task outside the selected Chaos tasks remains untouched
  try {
    const nonChaosAssignment: TaskAssignment = {
      id: 'asg-outside-chaos',
      family_id: 'fam-mtm1580s',
      task_id: 'task-daniel-regular',
      member_id: 'mem-daniel',
      scheduled_date: '2026-09-23',
      status: 'PENDING',
      is_unassigned: false,
      score: 10,
      assigned_reason: 'Atribuição diária de Daniel'
    };

    const payload = FirestoreMappers.toTaskAssignmentPersistencePayload(nonChaosAssignment);
    const passed = payload.member_id === 'mem-daniel' &&
                   payload.chaos_session_id === undefined &&
                   !('chaos_session_id' in payload) &&
                   payload.status === 'PENDING';

    results.push({
      id: 'R3-13',
      name: 'Existing assigned task outside the selected Chaos tasks remains untouched',
      passed,
      expected: 'Non-chaos task retains original member and has no chaos metadata',
      actual: `member_id=${payload.member_id}, hasChaos=${'chaos_session_id' in payload}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-13', name: 'Task outside chaos remains untouched', passed: false, error: e.message });
  }

  // R3-14: Repeated serialization is deterministic/idempotent and does not mutate input
  try {
    const originalInput: Partial<TaskAssignment> = {
      id: 'asg-idempotent',
      family_id: 'fam-mtm1580s',
      task_id: 'task-1',
      member_id: 'mem-matheus',
      is_unassigned: false,
      unassigned_reason: undefined,
      notes: 'Nota de teste'
    };

    const inputSnapshot = JSON.stringify(originalInput);

    const payload1 = FirestoreMappers.toTaskAssignmentPersistencePayload(originalInput);
    const payload2 = FirestoreMappers.toTaskAssignmentPersistencePayload(originalInput);

    // Verificação de não-mutação
    const notMutated = JSON.stringify(originalInput) === inputSnapshot;

    // Verificação de igualdade determinística (excluindo updatedAt se gerado no timestamp)
    const passed = notMutated &&
                   payload1.id === payload2.id &&
                   payload1.member_id === payload2.member_id &&
                   payload1.unassigned_reason === payload2.unassigned_reason &&
                   payload1.notes === payload2.notes;

    results.push({
      id: 'R3-14',
      name: 'Repeated serialization is deterministic/idempotent and does not mutate input',
      passed,
      expected: 'notMutated=true, payload1 == payload2',
      actual: `notMutated=${notMutated}, p1.unassigned_reason=${payload1.unassigned_reason}, p2.unassigned_reason=${payload2.unassigned_reason}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-14', name: 'Idempotency and immutability', passed: false, error: e.message });
  }

  // R3-15: Reproduction of the exact PO runtime scenario:
  // Márcia + Matheus, 4 DISTRIBUTED tasks, pre-assigned to Daniel
  // -> resolution & serialization succeeds without undefined Firestore fields
  // -> zero Daniel assignments in Chaos session
  try {
    // Configura 4 ocorrências:
    // Tarefa 1 estava atribuída a Daniel (morador fora da sessão do Caos)
    // Tarefas 2, 3, 4 com diferentes estados iniciais
    const occurrences: TaskAssignment[] = [
      {
        id: '4SCnl1jzyHhNNTfLzrn2_2026-09-23',
        family_id: 'fam-mtm1580s',
        task_id: 'task-1',
        member_id: daniel.id, // Daniel fora do escopo!
        scheduled_date: '2026-09-23',
        status: 'PENDING',
        is_unassigned: false,
        score: 10
      },
      {
        id: 'task2_occ_2026-09-23',
        family_id: 'fam-mtm1580s',
        task_id: 'task-2',
        member_id: daniel.id,
        scheduled_date: '2026-09-23',
        status: 'PENDING',
        is_unassigned: false,
        score: 10
      },
      {
        id: 'task3_occ_2026-09-23',
        family_id: 'fam-mtm1580s',
        task_id: 'task-3',
        member_id: marcia.id,
        scheduled_date: '2026-09-23',
        status: 'PENDING',
        is_unassigned: false,
        score: 10
      },
      {
        id: 'task4_occ_2026-09-23',
        family_id: 'fam-mtm1580s',
        task_id: 'task-4',
        member_id: '',
        scheduled_date: '2026-09-23',
        status: 'PENDING',
        is_unassigned: true,
        unassigned_reason: 'Rotina livre',
        score: 10
      }
    ];

    const familyTasks = [
      {
        id: 'task-1',
        familyId: 'fam-mtm1580s',
        family_id: 'fam-mtm1580s',
        name: 'Lavar Louça',
        active: true,
        chaosEligible: true,
        difficulty_score: 2
      },
      {
        id: 'task-2',
        familyId: 'fam-mtm1580s',
        family_id: 'fam-mtm1580s',
        name: 'Tirar Lixo',
        active: true,
        chaosEligible: true,
        difficulty_score: 1
      },
      {
        id: 'task-3',
        familyId: 'fam-mtm1580s',
        family_id: 'fam-mtm1580s',
        name: 'Limpar Banheiro',
        active: true,
        chaosEligible: true,
        difficulty_score: 3
      },
      {
        id: 'task-4',
        familyId: 'fam-mtm1580s',
        family_id: 'fam-mtm1580s',
        name: 'Varrer Sala',
        active: true,
        chaosEligible: true,
        difficulty_score: 2
      }
    ];

    const draftSession = {
      id: 'chaos-session-po-real',
      familyId: 'fam-mtm1580s',
      status: 'DRAFT' as const,
      durationMinutes: 15,
      participantMemberIds: [marcia.id, matheus.id], // Somente Márcia e Matheus
      selectedTaskIds: familyTasks.map(t => t.id),
      tasks: familyTasks.map(t => ({
        familyTaskId: t.id,
        strategy: 'DISTRIBUTED' as const
      })),
      createdAt: '2026-09-23T10:00:00Z',
      updatedAt: '2026-09-23T10:00:00Z'
    };

    // 1. Executa resolução de tarefas no ChaosSessionService
    const resolution = await ChaosSessionService.resolveAllChaosSessionTasks({
      familyId: 'fam-mtm1580s',
      session: draftSession as any,
      familyTasks: familyTasks as any,
      todayDate: '2026-09-23',
      participants: [marcia, matheus], // Somente participantes selecionados
      existingAssignments: occurrences
    });

    // 2. Serializa todas as tarefas resolvidas através da fronteira canônica
    const serializedPayloads = resolution.assignments.map(asg => {
      // Simula exatamente o que ChaosSetupView passa para updateTask e saveAssignments
      const updateObj = {
        assignedMemberId: asg.is_unassigned ? '' : asg.member_id,
        assigneeId: asg.is_unassigned ? '' : asg.member_id,
        isUnassigned: asg.is_unassigned,
        unassignedReason: asg.unassigned_reason,
        assignedReason: asg.assigned_reason,
        factors: asg.factors,
        status: (asg.status === 'COMPLETED' || asg.status === 'DONE') ? 'DONE' : 'PENDING',
        chaos_session_id: draftSession.id,
        chaosSessionId: draftSession.id,
        chaos_strategy: asg.chaos_strategy,
        chaosStrategy: asg.chaos_strategy
      };

      const payload1 = FirestoreMappers.toTaskAssignmentPersistencePayload({
        id: asg.id,
        family_id: 'fam-mtm1580s',
        ...updateObj
      });

      const payload2 = FirestoreMappers.fromTaskAssignment(asg);

      return { payload1, payload2, asg };
    });

    // 3. Validação rigorosa dos resultados
    let anyUndefined = false;
    let anyDanielAssigned = false;
    let allInParticipantsOrUnassigned = true;

    for (const item of serializedPayloads) {
      const undefs1 = findUndefinedFields(item.payload1);
      const undefs2 = findUndefinedFields(item.payload2);
      if (undefs1.length > 0 || undefs2.length > 0) {
        anyUndefined = true;
      }

      if (item.asg.member_id === daniel.id || item.payload1.member_id === daniel.id) {
        anyDanielAssigned = true;
      }

      if (!item.asg.is_unassigned && item.asg.member_id !== marcia.id && item.asg.member_id !== matheus.id) {
        allInParticipantsOrUnassigned = false;
      }
    }

    const passed = !anyUndefined && !anyDanielAssigned && allInParticipantsOrUnassigned && serializedPayloads.length === 4;

    results.push({
      id: 'R3-15',
      name: 'Reproduction of the exact PO runtime scenario (Márcia + Matheus, 4 DISTRIBUTED tasks)',
      passed,
      expected: 'No undefined Firestore fields, zero Daniel assignments, all tasks in [marcia, matheus] or unassigned',
      actual: `anyUndefined=${anyUndefined}, anyDaniel=${anyDanielAssigned}, allInParticipants=${allInParticipantsOrUnassigned}, count=${serializedPayloads.length}`
    });
  } catch (e: any) {
    results.push({ id: 'R3-15', name: 'Reproduction of PO runtime scenario', passed: false, error: e.message });
  }

  return results;
}
