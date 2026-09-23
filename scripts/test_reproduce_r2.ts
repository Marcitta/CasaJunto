import { ChaosSessionService } from '../src/services/chaosSessionService';
import { Member, FamilyTask, TaskAssignment, TaskMaster } from '../src/types';
import { allMasterTasks } from '../src/data/tasks';

async function run() {
  console.log('=== TEST REPRODUCE R2: fam-croce-2026 ===\n');

  const familyId = 'fam-croce-2026';
  const todayDate = '2026-09-22';

  const marcia: Member = {
    id: 'mem_marcia',
    familyId,
    name: 'Márcia',
    role: 'ADMIN',
    avatar: '👩',
    color: '#8c52ff',
    birth_date: '1980-01-01',
    age: 46,
    autonomyLevel: 4,
    points: 100,
    streak: 5,
    tasksCompleted: 10,
    active: true
  };

  const matheus: Member = {
    id: 'mem_matheus',
    familyId,
    name: 'Matheus',
    role: 'MEMBER',
    avatar: '👦',
    color: '#52c41a',
    birth_date: '2005-01-01',
    age: 21,
    autonomyLevel: 3,
    points: 50,
    streak: 3,
    tasksCompleted: 5,
    active: true
  };

  const lucas: Member = {
    id: 'mem_lucas',
    familyId,
    name: 'Lucas',
    role: 'MEMBER',
    avatar: '👦',
    color: '#fa8c16',
    birth_date: '2008-01-01',
    age: 18,
    autonomyLevel: 3,
    points: 40,
    streak: 2,
    tasksCompleted: 4,
    active: true
  };

  const daniel: Member = {
    id: 'mem_daniel',
    familyId,
    name: 'Daniel',
    role: 'MEMBER',
    avatar: '👨',
    color: '#1890ff',
    birth_date: '1978-01-01',
    age: 48,
    autonomyLevel: 4,
    points: 80,
    streak: 4,
    tasksCompleted: 8,
    active: true
  };

  const allMembers = [marcia, matheus, lucas, daniel];
  const participants = [marcia, matheus];
  const participantMemberIds = ['mem_marcia', 'mem_matheus'];

  // Tarefas: testes caos 3 e testes caos 4
  const ftCaos3: FamilyTask = {
    id: 'ft_testes_caos_3',
    familyId,
    name: 'testes caos 3',
    room_id: 'room_sala',
    active: true,
    chaosEligible: true,
    estimated_minutes: 20
  };

  const ftCaos4: FamilyTask = {
    id: 'ft_testes_caos_4',
    familyId,
    name: 'testes caos 4',
    room_id: 'room_cozinha',
    active: true,
    chaosEligible: true,
    estimated_minutes: 20
  };

  const familyTasks = [ftCaos3, ftCaos4];

  // Ocorrência de testes caos 4: pre-assigned to Daniel!
  const asgCaos4: TaskAssignment = {
    id: `asg_caos_4_${todayDate}`,
    family_id: familyId,
    family_task_id: ftCaos4.id,
    task_id: ftCaos4.id,
    member_id: daniel.id,
    scheduled_date: todayDate,
    scheduled_start: '09:00',
    scheduled_end: '09:20',
    status: 'SCHEDULED',
    is_unassigned: false
  };

  // Ocorrência de testes caos 3: suponha que esteja com Márcia ou unassigned
  const asgCaos3: TaskAssignment = {
    id: `asg_caos_3_${todayDate}`,
    family_id: familyId,
    family_task_id: ftCaos3.id,
    task_id: ftCaos3.id,
    member_id: marcia.id,
    scheduled_date: todayDate,
    scheduled_start: '10:00',
    scheduled_end: '10:20',
    status: 'SCHEDULED',
    is_unassigned: false
  };

  const existingAssignments = [asgCaos3, asgCaos4];

  console.log('--- TEST 1: createDraftSession in demo/local mode ---');
  try {
    const draft = await ChaosSessionService.createDraftSession({
      familyId,
      createdByMemberId: marcia.id,
      callerRole: 'ADMIN',
      initialDurationMinutes: 30,
      participantMemberIds,
      tasks: [
        { familyTaskId: ftCaos3.id, strategy: 'DISTRIBUTED' },
        { familyTaskId: ftCaos4.id, strategy: 'DISTRIBUTED' }
      ],
      availableMembers: allMembers,
      availableTasks: familyTasks,
      existingAssignments,
      todayDate,
      isDemoMode: true
    });
    console.log('Draft created successfully:', draft.id);

    console.log('--- TEST 2: resolveAllChaosSessionTasks ---');
    const resolved = ChaosSessionService.resolveAllChaosSessionTasks({
      familyId,
      session: draft,
      familyTasks,
      allTasks: allMasterTasks,
      existingAssignments,
      participants,
      todayDate
    });

    console.log('Resolved successfully!');
    console.log('Resolved assignments count:', resolved.assignments.length);
    for (const a of resolved.assignments) {
      console.log(`Task: ${a.family_task_id}, member_id: ${a.member_id}, is_unassigned: ${a.is_unassigned}, strategy: ${a.chaos_strategy}`);
    }
  } catch (err: any) {
    console.error('ERROR in pure execution:', err);
  }
}

run();
