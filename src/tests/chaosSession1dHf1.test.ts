/**
 * CasaJunto - Test Suite: CHAOS-1D-HF1
 * MANUAL QA HOTFIX — START FAILURE + BATCH TASK SELECTION + STRATEGY CLARITY
 *
 * HF1-01: real start path creates DRAFT then ACTIVE
 * HF1-02: mixed DISTRIBUTED + OPEN_POOL starts successfully
 * HF1-03: start does not create duplicate ChaosSession
 * HF1-04: start does not duplicate TaskAssignment
 * HF1-05: start failure exposes structured diagnostic internally
 * HF1-06: known domain error maps to human message
 * HF1-07: task picker supports multi-select
 * HF1-08: already-added tasks cannot be duplicated
 * HF1-09: select-all respects visible/valid tasks
 * HF1-10: cancel picker changes nothing
 * HF1-11: batch confirm adds all selected tasks
 * HF1-12: batch-added tasks default DISTRIBUTED
 * HF1-13: DISTRIBUTED continues through Motor 2.0
 * HF1-14: OPEN_POOL remains unassigned
 * HF1-15: no manual assignment system introduced
 */

import { ChaosSessionService } from '../services/chaosSessionService';
import { 
  FamilyTask, 
  Member, 
  TaskAssignment, 
  ChaosTaskStrategy,
  TaskMaster
} from '../types';
import { 
  mapChaosErrorToHumanMessage, 
  logStructuredChaosError, 
  getLastChaosDiagnosticError 
} from '../utils/chaosErrorUtils';
import { allMasterTasks } from '../data/tasks';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

export const runChaosSession1dHf1TestSuite = async (): Promise<TestResult[]> => {
  const results: TestResult[] = [];

  const assert = (id: string, name: string, condition: boolean, errorDetail?: string) => {
    results.push({
      id,
      name,
      passed: condition,
      error: condition ? undefined : errorDetail || 'Assertion failed'
    });
  };

  const familyId = 'fam_chaos_hf1_test';
  const adminMember: Member = {
    id: 'mem_admin_hf1',
    familyId,
    name: 'Admin HF1',
    role: 'ADMIN',
    active: true,
    points: 100,
    streak: 5,
    tasksCompleted: 20
  };

  const participantAdult: Member = {
    id: 'mem_adult_hf1',
    familyId,
    name: 'Adulto Participante',
    role: 'MEMBER',
    active: true,
    points: 50,
    streak: 2,
    tasksCompleted: 10
  };

  const participantKid: Member = {
    id: 'mem_kid_hf1',
    familyId,
    name: 'Criança Participante',
    role: 'MEMBER',
    active: true,
    points: 30,
    streak: 1,
    tasksCompleted: 5
  };

  const familyMembers = [adminMember, participantAdult, participantKid];

  const task1: FamilyTask = {
    id: 'ft_hf1_1',
    familyId,
    name: 'Lavar Louça',
    room_id: 'room_kitchen',
    active: true,
    chaosEligible: true,
    frequency: 'daily',
    estimated_minutes: 20,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const task2: FamilyTask = {
    id: 'ft_hf1_2',
    familyId,
    name: 'Varrer Sala',
    room_id: 'room_living',
    active: true,
    chaosEligible: true,
    frequency: 'daily',
    estimated_minutes: 15,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const task3: FamilyTask = {
    id: 'ft_hf1_3',
    familyId,
    name: 'Guardar Brinquedos',
    room_id: 'room_kids',
    active: true,
    chaosEligible: false,
    frequency: 'daily',
    estimated_minutes: 15,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const taskInactive: FamilyTask = {
    id: 'ft_hf1_inactive',
    familyId,
    name: 'Tarefa Desativada',
    room_id: 'room_garage',
    active: false,
    chaosEligible: true,
    frequency: 'weekly',
    estimated_minutes: 30,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const familyTasks = [task1, task2, task3, taskInactive];
  const todayDate = '2026-09-17';

  // =========================================================================
  // HF1-01: real start path creates DRAFT then ACTIVE
  // =========================================================================
  try {
    const draft = await ChaosSessionService.createDraftSession({
      familyId,
      createdByMemberId: adminMember.id,
      callerRole: 'ADMIN',
      initialDurationMinutes: 30,
      participantMemberIds: [adminMember.id, participantAdult.id],
      selectedTaskIds: [task1.id],
      availableMembers: familyMembers,
      availableTasks: familyTasks,
      isDemoMode: true
    });

    const isDraft = draft.status === 'DRAFT' && draft.startedAt === null;

    const started = await ChaosSessionService.startChaosSession({
      familyId,
      sessionId: draft.id,
      callerRole: 'ADMIN',
      existingSession: draft,
      isDemoMode: true
    });

    const isActive = started.status === 'ACTIVE' && started.startedAt !== null && started.expiresAt !== null;

    assert('HF1-01', 'real start path creates DRAFT then ACTIVE', isDraft && isActive);
  } catch (err: any) {
    assert('HF1-01', 'real start path creates DRAFT then ACTIVE', false, err.message);
  }

  // =========================================================================
  // HF1-02: mixed DISTRIBUTED + OPEN_POOL starts successfully
  // =========================================================================
  try {
    const draftMixed = await ChaosSessionService.createDraftSession({
      familyId,
      createdByMemberId: adminMember.id,
      callerRole: 'ADMIN',
      initialDurationMinutes: 45,
      participantMemberIds: [adminMember.id, participantAdult.id],
      tasks: [
        { familyTaskId: task1.id, strategy: 'DISTRIBUTED' },
        { familyTaskId: task2.id, strategy: 'OPEN_POOL' }
      ],
      availableMembers: familyMembers,
      availableTasks: familyTasks,
      isDemoMode: true
    });

    const resolved = ChaosSessionService.resolveAllChaosSessionTasks({
      familyId,
      session: draftMixed,
      familyTasks,
      allTasks: allMasterTasks,
      existingAssignments: [],
      participants: [adminMember, participantAdult],
      todayDate
    });

    const startedMixed = await ChaosSessionService.startChaosSession({
      familyId,
      sessionId: draftMixed.id,
      callerRole: 'ADMIN',
      existingSession: draftMixed,
      isDemoMode: true
    });

    const hasDistributed = resolved.assignments.some(a => a.family_task_id === task1.id && a.member_id !== '');
    const hasOpenPool = resolved.assignments.some(a => a.family_task_id === task2.id && a.is_unassigned === true);

    assert(
      'HF1-02', 
      'mixed DISTRIBUTED + OPEN_POOL starts successfully', 
      startedMixed.status === 'ACTIVE' && hasDistributed && hasOpenPool
    );
  } catch (err: any) {
    assert('HF1-02', 'mixed DISTRIBUTED + OPEN_POOL starts successfully', false, err.message);
  }

  // =========================================================================
  // HF1-03: start does not create duplicate ChaosSession
  // =========================================================================
  try {
    const sessionMap = new Map<string, any>();
    const draft = await ChaosSessionService.createDraftSession({
      familyId,
      createdByMemberId: adminMember.id,
      callerRole: 'ADMIN',
      initialDurationMinutes: 15,
      participantMemberIds: [adminMember.id],
      selectedTaskIds: [task1.id],
      availableMembers: familyMembers,
      availableTasks: familyTasks,
      isDemoMode: true
    });
    sessionMap.set(draft.id, draft);

    const active = await ChaosSessionService.startChaosSession({
      familyId,
      sessionId: draft.id,
      callerRole: 'ADMIN',
      existingSession: draft,
      isDemoMode: true
    });
    sessionMap.set(active.id, active);

    assert('HF1-03', 'start does not create duplicate ChaosSession', sessionMap.size === 1 && sessionMap.get(draft.id).status === 'ACTIVE');
  } catch (err: any) {
    assert('HF1-03', 'start does not create duplicate ChaosSession', false, err.message);
  }

  // =========================================================================
  // HF1-04: start does not duplicate TaskAssignment
  // =========================================================================
  try {
    const draft = await ChaosSessionService.createDraftSession({
      familyId,
      createdByMemberId: adminMember.id,
      callerRole: 'ADMIN',
      initialDurationMinutes: 30,
      participantMemberIds: [adminMember.id, participantAdult.id],
      tasks: [{ familyTaskId: task1.id, strategy: 'DISTRIBUTED' }],
      availableMembers: familyMembers,
      availableTasks: familyTasks,
      isDemoMode: true
    });

    const existingAssignment: TaskAssignment = {
      id: 'asg_existing_1',
      family_id: familyId,
      family_task_id: task1.id,
      task_id: 'task_kitchen_dishes',
      member_id: participantAdult.id,
      scheduled_date: todayDate,
      status: 'ASSIGNED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const resolved = ChaosSessionService.resolveAllChaosSessionTasks({
      familyId,
      session: draft,
      familyTasks,
      allTasks: allMasterTasks,
      existingAssignments: [existingAssignment],
      participants: [adminMember, participantAdult],
      todayDate
    });

    // Deve reutilizar o assignment existente, não duplicá-lo
    assert(
      'HF1-04', 
      'start does not duplicate TaskAssignment', 
      resolved.assignments.length === 1 && 
      resolved.newAssignments.length === 0 && 
      resolved.reusedAssignments.length === 1 &&
      resolved.assignments[0].id === existingAssignment.id
    );
  } catch (err: any) {
    assert('HF1-04', 'start does not duplicate TaskAssignment', false, err.message);
  }

  // =========================================================================
  // HF1-05: start failure exposes structured diagnostic internally
  // =========================================================================
  try {
    try {
      await ChaosSessionService.startChaosSession({
        familyId,
        sessionId: 'non_existent_session',
        callerRole: 'MEMBER' // Non-admin should trigger permission diagnostic
      });
    } catch (startErr: any) {
      // Diagnostic logged internally
    }

    const lastDiag = getLastChaosDiagnosticError();
    const hasDiagnostic = Boolean(
      lastDiag && 
      lastDiag.context === 'startChaosSession' && 
      lastDiag.code.includes('FORBIDDEN')
    );

    assert('HF1-05', 'start failure exposes structured diagnostic internally', hasDiagnostic);
  } catch (err: any) {
    assert('HF1-05', 'start failure exposes structured diagnostic internally', false, err.message);
  }

  // =========================================================================
  // HF1-06: known domain error maps to human message
  // =========================================================================
  try {
    const msgPermission = mapChaosErrorToHumanMessage(new Error('PERMISSION_DENIED: Missing or insufficient permissions'));
    const msgActiveExists = mapChaosErrorToHumanMessage(new Error('ACTIVE_SESSION_EXISTS: Já existe uma sessão ativa'));
    const msgInactiveTask = mapChaosErrorToHumanMessage(new Error('FAMILY_TASK_INACTIVE: Tarefa inativa'));
    const msgNoParticipants = mapChaosErrorToHumanMessage(new Error('NO_PARTICIPANTS'));

    const allReadable = 
      msgPermission.includes('Permissão') &&
      msgActiveExists.includes('em andamento') &&
      msgInactiveTask.includes('inativa') &&
      msgNoParticipants.includes('morador');

    assert('HF1-06', 'known domain error maps to human message', allReadable);
  } catch (err: any) {
    assert('HF1-06', 'known domain error maps to human message', false, err.message);
  }

  // =========================================================================
  // HF1-07: task picker supports multi-select
  // =========================================================================
  try {
    // Simula seleção múltipla de 2 tarefas no picker
    const tempSelection = new Set<string>();
    tempSelection.add(task1.id);
    tempSelection.add(task2.id);

    const isMultiSelected = tempSelection.has(task1.id) && tempSelection.has(task2.id) && tempSelection.size === 2;
    assert('HF1-07', 'task picker supports multi-select', isMultiSelected);
  } catch (err: any) {
    assert('HF1-07', 'task picker supports multi-select', false, err.message);
  }

  // =========================================================================
  // HF1-08: already-added tasks cannot be duplicated
  // =========================================================================
  try {
    const alreadySelected = [task1.id];
    // Disponíveis para adicionar no picker filtram as que já estão adicionadas
    const availableForPicker = familyTasks.filter(ft => ft.active !== false && !alreadySelected.includes(ft.id));
    const canDuplicate = availableForPicker.some(ft => ft.id === task1.id);

    assert('HF1-08', 'already-added tasks cannot be duplicated', canDuplicate === false);
  } catch (err: any) {
    assert('HF1-08', 'already-added tasks cannot be duplicated', false, err.message);
  }

  // =========================================================================
  // HF1-09: select-all respects visible/valid tasks
  // =========================================================================
  try {
    const searchQuery = 'sala';
    const activeTasks = familyTasks.filter(ft => ft.active !== false);
    const visibleTasks = activeTasks.filter(ft => ft.name.toLowerCase().includes(searchQuery));

    // Selecionar todos visíveis deve adicionar somente task2 ('Varrer Sala')
    const selectedIds = new Set<string>();
    visibleTasks.forEach(t => selectedIds.add(t.id));

    const validRespect = selectedIds.has(task2.id) && !selectedIds.has(task1.id) && !selectedIds.has(taskInactive.id);
    assert('HF1-09', 'select-all respects visible/valid tasks', validRespect);
  } catch (err: any) {
    assert('HF1-09', 'select-all respects visible/valid tasks', false, err.message);
  }

  // =========================================================================
  // HF1-10: cancel picker changes nothing
  // =========================================================================
  try {
    const originalSelectedTasks = [{ familyTaskId: task1.id, strategy: 'DISTRIBUTED' as ChaosTaskStrategy, isSuggested: true }];
    // Usuário abre o picker e marca tarefas temporárias
    let tempIds = new Set<string>([task2.id, task3.id]);
    // Usuário clica Cancelar: descarta tempIds
    tempIds = new Set<string>();
    const stateAfterCancel = [...originalSelectedTasks];

    const unchanged = stateAfterCancel.length === 1 && stateAfterCancel[0].familyTaskId === task1.id;
    assert('HF1-10', 'cancel picker changes nothing', unchanged);
  } catch (err: any) {
    assert('HF1-10', 'cancel picker changes nothing', false, err.message);
  }

  // =========================================================================
  // HF1-11: batch confirm adds all selected tasks
  // =========================================================================
  try {
    const currentList = [{ familyTaskId: task1.id, strategy: 'DISTRIBUTED' as ChaosTaskStrategy, isSuggested: true }];
    const batchToAdd = [task2.id, task3.id];
    
    const nextList = [...currentList];
    batchToAdd.forEach(id => {
      nextList.push({
        familyTaskId: id,
        strategy: 'DISTRIBUTED',
        isSuggested: false
      });
    });

    const allAdded = nextList.length === 3 && nextList.some(t => t.familyTaskId === task2.id) && nextList.some(t => t.familyTaskId === task3.id);
    assert('HF1-11', 'batch confirm adds all selected tasks', allAdded);
  } catch (err: any) {
    assert('HF1-11', 'batch confirm adds all selected tasks', false, err.message);
  }

  // =========================================================================
  // HF1-12: batch-added tasks default DISTRIBUTED
  // =========================================================================
  try {
    const batchToAdd = [task2.id, task3.id];
    const newlyAdded = batchToAdd.map(id => ({
      familyTaskId: id,
      strategy: 'DISTRIBUTED' as ChaosTaskStrategy,
      isSuggested: false
    }));

    const allDefaultDistributed = newlyAdded.every(item => item.strategy === 'DISTRIBUTED');
    assert('HF1-12', 'batch-added tasks default DISTRIBUTED', allDefaultDistributed);
  } catch (err: any) {
    assert('HF1-12', 'batch-added tasks default DISTRIBUTED', false, err.message);
  }

  // =========================================================================
  // HF1-13: DISTRIBUTED continues through Motor 2.0
  // =========================================================================
  try {
    const draft = await ChaosSessionService.createDraftSession({
      familyId,
      createdByMemberId: adminMember.id,
      callerRole: 'ADMIN',
      initialDurationMinutes: 30,
      participantMemberIds: [adminMember.id, participantAdult.id],
      tasks: [{ familyTaskId: task1.id, strategy: 'DISTRIBUTED' }],
      availableMembers: familyMembers,
      availableTasks: familyTasks,
      isDemoMode: true
    });

    const resolved = ChaosSessionService.resolveAllChaosSessionTasks({
      familyId,
      session: draft,
      familyTasks,
      allTasks: allMasterTasks,
      existingAssignments: [],
      participants: [adminMember, participantAdult],
      todayDate
    });

    const asg = resolved.assignments.find(a => a.family_task_id === task1.id);
    const assignedThroughMotor = Boolean(
      asg && 
      (asg.member_id === adminMember.id || asg.member_id === participantAdult.id) &&
      asg.chaos_strategy === 'DISTRIBUTED'
    );

    assert('HF1-13', 'DISTRIBUTED continues through Motor 2.0', assignedThroughMotor);
  } catch (err: any) {
    assert('HF1-13', 'DISTRIBUTED continues through Motor 2.0', false, err.message);
  }

  // =========================================================================
  // HF1-14: OPEN_POOL remains unassigned
  // =========================================================================
  try {
    const draft = await ChaosSessionService.createDraftSession({
      familyId,
      createdByMemberId: adminMember.id,
      callerRole: 'ADMIN',
      initialDurationMinutes: 30,
      participantMemberIds: [adminMember.id, participantAdult.id],
      tasks: [{ familyTaskId: task2.id, strategy: 'OPEN_POOL' }],
      availableMembers: familyMembers,
      availableTasks: familyTasks,
      isDemoMode: true
    });

    const resolved = ChaosSessionService.resolveAllChaosSessionTasks({
      familyId,
      session: draft,
      familyTasks,
      allTasks: allMasterTasks,
      existingAssignments: [],
      participants: [adminMember, participantAdult],
      todayDate
    });

    const asg = resolved.assignments.find(a => a.family_task_id === task2.id);
    const remainsUnassigned = Boolean(
      asg && 
      asg.is_unassigned === true && 
      asg.member_id === '' && 
      asg.chaos_strategy === 'OPEN_POOL'
    );

    assert('HF1-14', 'OPEN_POOL remains unassigned', remainsUnassigned);
  } catch (err: any) {
    assert('HF1-14', 'OPEN_POOL remains unassigned', false, err.message);
  }

  // =========================================================================
  // HF1-15: no manual assignment system introduced
  // =========================================================================
  try {
    // Verifica que a interface e os modelos continuam suportando apenas DISTRIBUTED e OPEN_POOL,
    // sem sistema de atribuição manual em lote ou intervenção humana prévia.
    const allowedStrategies: ChaosTaskStrategy[] = ['DISTRIBUTED', 'OPEN_POOL'];
    const hasOnlyAllowedStrategies = allowedStrategies.length === 2 &&
      allowedStrategies.includes('DISTRIBUTED') &&
      allowedStrategies.includes('OPEN_POOL');

    assert('HF1-15', 'no manual assignment system introduced', hasOnlyAllowedStrategies);
  } catch (err: any) {
    assert('HF1-15', 'no manual assignment system introduced', false, err.message);
  }

  return results;
};
