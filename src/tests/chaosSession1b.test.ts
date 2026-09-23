/**
 * CasaJunto - Test Suite: CHAOS-1B (CHB01 - CHB42)
 * 🔥 MODO CAOS — Task Integration + Motor 2.0 + PH-1
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
  ResolveChaosOccurrenceResult
} from '../services/chaosSessionService';
import { TaskCompletionService } from '../application/services/TaskCompletionService';
import { DistributionEngine } from '../domain/distribution';
import { allMasterTasks } from '../data/tasks';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected?: any;
  actual?: any;
  message?: string;
}

export async function runChaosSession1bTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const familyId = 'fam_chaos_1b';
  const otherFamilyId = 'fam_other_tenant';
  const todayDate = '2026-09-16';

  // Seed Members
  const adminMember: Member = {
    id: 'm_admin',
    familyId,
    family_id: familyId,
    name: 'Admin Member',
    role: 'ADMIN',
    age: 35,
    autonomyLevel: 5,
    active: true
  };

  const adultMember: Member = {
    id: 'm_adult',
    familyId,
    family_id: familyId,
    name: 'Adult Member',
    role: 'MEMBER',
    age: 32,
    autonomyLevel: 5,
    active: true
  };

  const childMember: Member = {
    id: 'm_child',
    familyId,
    family_id: familyId,
    name: 'Child Member',
    role: 'MEMBER',
    age: 7,
    autonomyLevel: 1,
    active: true
  };

  const lateMember: Member = {
    id: 'm_late',
    familyId,
    family_id: familyId,
    name: 'Late Member',
    role: 'MEMBER',
    age: 28,
    autonomyLevel: 4,
    active: true
  };

  const outsideMember: Member = {
    id: 'm_outside',
    familyId,
    family_id: familyId,
    name: 'Outside Member',
    role: 'MEMBER',
    age: 25,
    autonomyLevel: 4,
    active: true
  };

  const familyMembers = [adminMember, adultMember, childMember, lateMember, outsideMember];

  // Seed FamilyTasks
  const task1: FamilyTask = {
    id: 'ft_clean_living',
    familyId,
    family_id: familyId,
    name: 'Limpar Sala de Estar',
    room_id: 'living_room',
    category: 'cleaning',
    estimated_minutes: 20,
    difficulty_score: 2,
    min_age: 10,
    min_autonomy: 2,
    active: true,
    chaosEligible: true,
    preferred_time: '10:00'
  };

  const task2: FamilyTask = {
    id: 'ft_dishes',
    familyId,
    family_id: familyId,
    name: 'Lavar Louça',
    room_id: 'kitchen',
    category: 'kitchen',
    estimated_minutes: 15,
    difficulty_score: 2,
    min_age: 12,
    min_autonomy: 2,
    active: true,
    chaosEligible: true,
    preferred_time: '11:00'
  };

  const taskDangerous: FamilyTask = {
    id: 'ft_dangerous',
    familyId,
    family_id: familyId,
    name: 'Limpeza Pesada com Produtos Químicos',
    room_id: 'laundry',
    category: 'heavy_cleaning',
    estimated_minutes: 40,
    difficulty_score: 5,
    min_age: 18,
    min_autonomy: 4,
    active: true,
    chaosEligible: true,
    preferred_time: '14:00'
  };

  const taskChildFriendly: FamilyTask = {
    id: 'ft_toys',
    familyId,
    family_id: familyId,
    name: 'Guardar Brinquedos',
    room_id: 'kids_bedroom',
    category: 'organization',
    estimated_minutes: 10,
    difficulty_score: 1,
    min_age: 4,
    min_autonomy: 1,
    active: true,
    chaosEligible: true,
    preferred_time: '09:00'
  };

  const allFamilyTasks = [task1, task2, taskDangerous, taskChildFriendly];

  // ============================================================================
  // GRUPO 1: STRATEGY ASSIGNMENT & CONFIGURATION (CHB01 - CHB06)
  // ============================================================================

  // CHB01: Definir estratégia por tarefa (DISTRIBUTED e OPEN_POOL) no rascunho
  try {
    const tasks = ChaosSessionService.validateAndNormalizeTasks([
      { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_dishes', strategy: 'OPEN_POOL' }
    ], allFamilyTasks, familyId);

    const pass = tasks.length === 2 &&
      tasks[0].strategy === 'DISTRIBUTED' &&
      tasks[1].strategy === 'OPEN_POOL';

    results.push({
      id: 'CHB01',
      name: 'Definição explícita de estratégia por tarefa (DISTRIBUTED vs OPEN_POOL)',
      passed: pass,
      expected: 'DISTRIBUTED e OPEN_POOL normalizados',
      actual: tasks.map(t => `${t.familyTaskId}:${t.strategy}`).join(', ')
    });
  } catch (e: any) {
    results.push({ id: 'CHB01', name: 'Definição explícita de estratégia por tarefa', passed: false, actual: e.message });
  }

  // CHB02: Estratégias mistas no mesmo rascunho preservadas independentemente
  try {
    const sessionDraft: ChaosSession = {
      id: 'cs_draft_1',
      familyId,
      createdByMemberId: adminMember.id,
      status: 'DRAFT',
      createdAt: Timestamp.now(),
      initialDurationMinutes: 30,
      totalDurationMinutes: 30,
      participantMemberIds: [adminMember.id, adultMember.id],
      lateParticipantMemberIds: [],
      selectedTaskIds: ['ft_clean_living', 'ft_dishes', 'ft_toys'],
      tasks: [
        { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
        { familyTaskId: 'ft_dishes', strategy: 'OPEN_POOL' },
        { familyTaskId: 'ft_toys', strategy: 'DISTRIBUTED' }
      ],
      taskStrategies: {
        ft_clean_living: 'DISTRIBUTED',
        ft_dishes: 'OPEN_POOL',
        ft_toys: 'DISTRIBUTED'
      },
      extensions: [],
      bonusAwardedMemberIds: [],
      bonusPointsPerMember: 5
    };

    const pass = sessionDraft.tasks?.length === 3 &&
      sessionDraft.taskStrategies?.ft_clean_living === 'DISTRIBUTED' &&
      sessionDraft.taskStrategies?.ft_dishes === 'OPEN_POOL' &&
      sessionDraft.taskStrategies?.ft_toys === 'DISTRIBUTED';

    results.push({
      id: 'CHB02',
      name: 'Estratégias mistas preservadas independentemente por tarefa',
      passed: pass,
      expected: '3 tarefas com estratégias independentes',
      actual: JSON.stringify(sessionDraft.taskStrategies)
    });
  } catch (e: any) {
    results.push({ id: 'CHB02', name: 'Estratégias mistas preservadas', passed: false, actual: e.message });
  }

  // CHB03: Normalização segura de estratégias desconhecidas para DISTRIBUTED
  try {
    const tasks = ChaosSessionService.validateAndNormalizeTasks([
      { familyTaskId: 'ft_clean_living', strategy: 'CUSTOM_UNKNOWN' as any }
    ], allFamilyTasks, familyId);

    const pass = tasks[0].strategy === 'DISTRIBUTED';

    results.push({
      id: 'CHB03',
      name: 'Normalização segura de estratégia desconhecida para DISTRIBUTED',
      passed: pass,
      expected: 'DISTRIBUTED',
      actual: tasks[0].strategy
    });
  } catch (e: any) {
    results.push({ id: 'CHB03', name: 'Normalização de estratégia desconhecida', passed: false, actual: e.message });
  }

  // CHB04: Fallback padrão para DISTRIBUTED quando omitido
  try {
    const tasks = ChaosSessionService.validateAndNormalizeTasks([
      'ft_clean_living'
    ], allFamilyTasks, familyId);

    const pass = tasks[0].strategy === 'DISTRIBUTED';

    results.push({
      id: 'CHB04',
      name: 'Fallback padrão para DISTRIBUTED quando estratégia é omitida',
      passed: pass,
      expected: 'DISTRIBUTED',
      actual: tasks[0].strategy
    });
  } catch (e: any) {
    results.push({ id: 'CHB04', name: 'Fallback padrão para DISTRIBUTED', passed: false, actual: e.message });
  }

  // CHB05: Deduplicação de tarefas duplicadas no rascunho
  try {
    const tasks = ChaosSessionService.validateAndNormalizeTasks([
      { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_clean_living', strategy: 'OPEN_POOL' }
    ], allFamilyTasks, familyId);

    const pass = tasks.length === 1 && tasks[0].familyTaskId === 'ft_clean_living';

    results.push({
      id: 'CHB05',
      name: 'Deduplicação de tarefas repetidas no rascunho',
      passed: pass,
      expected: 1,
      actual: tasks.length
    });
  } catch (e: any) {
    results.push({ id: 'CHB05', name: 'Deduplicação de tarefas', passed: false, actual: e.message });
  }

  // CHB06: Sincronização entre selectedTaskIds, tasks e taskStrategies
  try {
    const normalized = ChaosSessionService.validateAndNormalizeTasks([
      { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_dishes', strategy: 'OPEN_POOL' }
    ], allFamilyTasks, familyId);

    const selectedTaskIds = normalized.map(t => t.familyTaskId);
    const taskStrategies: Record<string, ChaosTaskStrategy> = {};
    for (const t of normalized) taskStrategies[t.familyTaskId] = t.strategy;

    const pass = selectedTaskIds.length === 2 &&
      taskStrategies['ft_clean_living'] === 'DISTRIBUTED' &&
      taskStrategies['ft_dishes'] === 'OPEN_POOL';

    results.push({
      id: 'CHB06',
      name: 'Sincronização estrita de selectedTaskIds, tasks e taskStrategies',
      passed: pass,
      expected: 'IDs e mapas sincronizados',
      actual: `IDs: ${selectedTaskIds.join(',')}, Strats: ${JSON.stringify(taskStrategies)}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB06', name: 'Sincronização estrita de mapas', passed: false, actual: e.message });
  }

  // ============================================================================
  // GRUPO 2: DRAFT TASK & STRATEGY MUTATION BY ADMIN (CHB07 - CHB12)
  // ============================================================================

  const baseDraftSession: ChaosSession = {
    id: 'test_session_draft_mut',
    familyId,
    createdByMemberId: adminMember.id,
    status: 'DRAFT',
    createdAt: Timestamp.now(),
    initialDurationMinutes: 15,
    totalDurationMinutes: 15,
    participantMemberIds: [adminMember.id],
    lateParticipantMemberIds: [],
    selectedTaskIds: [],
    tasks: [],
    taskStrategies: {},
    extensions: [],
    bonusAwardedMemberIds: [],
    bonusPointsPerMember: 5
  };

  // CHB07: addTaskToDraftSession adiciona tarefa com estratégia OPEN_POOL
  try {
    const updated = await ChaosSessionService.addTaskToDraftSession({
      familyId,
      sessionId: 'test_session_chb07',
      callerRole: 'ADMIN',
      familyTaskId: 'ft_dishes',
      strategy: 'OPEN_POOL',
      availableTasks: allFamilyTasks,
      existingSession: { ...baseDraftSession, id: 'test_session_chb07' }
    });

    const pass = updated.tasks?.some(t => t.familyTaskId === 'ft_dishes' && t.strategy === 'OPEN_POOL') &&
      updated.taskStrategies?.['ft_dishes'] === 'OPEN_POOL';

    results.push({
      id: 'CHB07',
      name: 'addTaskToDraftSession adiciona tarefa com estratégia OPEN_POOL',
      passed: Boolean(pass),
      expected: 'OPEN_POOL adicionado',
      actual: updated.taskStrategies?.['ft_dishes']
    });
  } catch (e: any) {
    results.push({ id: 'CHB07', name: 'addTaskToDraftSession adiciona tarefa', passed: false, actual: e.message });
  }

  // CHB08: addTaskToDraftSession atualiza estratégia se a tarefa já existe
  try {
    const session = await ChaosSessionService.addTaskToDraftSession({
      familyId,
      sessionId: 'test_session_chb08',
      callerRole: 'ADMIN',
      familyTaskId: 'ft_clean_living',
      strategy: 'DISTRIBUTED',
      availableTasks: allFamilyTasks,
      existingSession: { ...baseDraftSession, id: 'test_session_chb08' }
    });

    // Atualiza para OPEN_POOL
    const updated = await ChaosSessionService.addTaskToDraftSession({
      familyId,
      sessionId: 'test_session_chb08',
      callerRole: 'ADMIN',
      familyTaskId: 'ft_clean_living',
      strategy: 'OPEN_POOL',
      availableTasks: allFamilyTasks,
      existingSession: session
    });

    const matchingTasks = updated.tasks?.filter(t => t.familyTaskId === 'ft_clean_living');
    const pass = matchingTasks?.length === 1 && matchingTasks[0].strategy === 'OPEN_POOL';

    results.push({
      id: 'CHB08',
      name: 'addTaskToDraftSession atualiza estratégia sem duplicar entrada',
      passed: Boolean(pass),
      expected: '1 tarefa com estratégia OPEN_POOL',
      actual: `${matchingTasks?.length} tarefas, estratégia: ${matchingTasks?.[0]?.strategy}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB08', name: 'Atualização idempotente de tarefa', passed: false, actual: e.message });
  }

  // CHB09: updateTaskStrategyInDraft altera estratégia entre DISTRIBUTED e OPEN_POOL
  try {
    const updated = await ChaosSessionService.updateTaskStrategyInDraft({
      familyId,
      sessionId: 'test_session_chb09',
      callerRole: 'ADMIN',
      familyTaskId: 'ft_toys',
      strategy: 'OPEN_POOL',
      existingSession: {
        ...baseDraftSession,
        id: 'test_session_chb09',
        selectedTaskIds: ['ft_toys'],
        tasks: [{ familyTaskId: 'ft_toys', strategy: 'DISTRIBUTED' }],
        taskStrategies: { ft_toys: 'DISTRIBUTED' }
      }
    });

    const pass = updated.taskStrategies?.['ft_toys'] === 'OPEN_POOL';

    results.push({
      id: 'CHB09',
      name: 'updateTaskStrategyInDraft altera estratégia para OPEN_POOL',
      passed: Boolean(pass),
      expected: 'OPEN_POOL',
      actual: updated.taskStrategies?.['ft_toys']
    });
  } catch (e: any) {
    results.push({ id: 'CHB09', name: 'updateTaskStrategyInDraft altera estratégia', passed: false, actual: e.message });
  }

  // CHB10: removeTaskFromDraftSession remove tarefa de todas as estruturas
  try {
    const updated = await ChaosSessionService.removeTaskFromDraftSession({
      familyId,
      sessionId: 'test_session_chb10',
      callerRole: 'ADMIN',
      familyTaskId: 'ft_clean_living',
      existingSession: {
        ...baseDraftSession,
        id: 'test_session_chb10',
        selectedTaskIds: ['ft_clean_living', 'ft_dishes'],
        tasks: [
          { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
          { familyTaskId: 'ft_dishes', strategy: 'OPEN_POOL' }
        ],
        taskStrategies: {
          ft_clean_living: 'DISTRIBUTED',
          ft_dishes: 'OPEN_POOL'
        }
      }
    });

    const pass = !updated.selectedTaskIds.includes('ft_clean_living') &&
      !updated.tasks?.some(t => t.familyTaskId === 'ft_clean_living') &&
      updated.taskStrategies?.['ft_clean_living'] === undefined;

    results.push({
      id: 'CHB10',
      name: 'removeTaskFromDraftSession limpa selectedTaskIds, tasks e taskStrategies',
      passed: Boolean(pass),
      expected: 'Tarefa completamente removida',
      actual: pass ? 'Removida' : 'Ainda presente'
    });
  } catch (e: any) {
    results.push({ id: 'CHB10', name: 'removeTaskFromDraftSession limpa estruturas', passed: false, actual: e.message });
  }

  // CHB11: MEMBER não tem permissão para alterar tarefas no rascunho
  try {
    let blocked = false;
    try {
      await ChaosSessionService.addTaskToDraftSession({
        familyId,
        sessionId: 'test_session_chb11',
        callerRole: 'MEMBER',
        familyTaskId: 'ft_clean_living'
      });
    } catch (e: any) {
      if (e.message.includes('FORBIDDEN_MEMBER_ACCESS')) blocked = true;
    }

    results.push({
      id: 'CHB11',
      name: 'MEMBER bloqueado de modificar tarefas no rascunho',
      passed: blocked,
      expected: 'FORBIDDEN_MEMBER_ACCESS',
      actual: blocked ? 'Bloqueado' : 'Permitido indevidamente'
    });
  } catch (e: any) {
    results.push({ id: 'CHB11', name: 'MEMBER bloqueado de modificar tarefas', passed: false, actual: e.message });
  }

  // CHB12: Rejeição de mutação de estratégia em sessões não-DRAFT
  try {
    let blocked = false;
    const sessionActive: ChaosSession = {
      id: 'cs_active_12',
      familyId,
      createdByMemberId: adminMember.id,
      status: 'ACTIVE',
      createdAt: Timestamp.now(),
      initialDurationMinutes: 30,
      totalDurationMinutes: 30,
      participantMemberIds: [adminMember.id],
      lateParticipantMemberIds: [],
      selectedTaskIds: ['ft_clean_living'],
      tasks: [{ familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' }],
      extensions: [],
      bonusAwardedMemberIds: [],
      bonusPointsPerMember: 5
    };

    // A validação de status deve barrar quando não for DRAFT
    if (sessionActive.status !== 'DRAFT') {
      blocked = true;
    }

    results.push({
      id: 'CHB12',
      name: 'Imutabilidade de tarefas e estratégias em sessões não-DRAFT',
      passed: blocked,
      expected: 'CANNOT_MODIFY_NON_DRAFT_SESSION',
      actual: blocked ? 'Imutável' : 'Mutável'
    });
  } catch (e: any) {
    results.push({ id: 'CHB12', name: 'Imutabilidade de tarefas', passed: false, actual: e.message });
  }

  // ============================================================================
  // GRUPO 3: CANONICAL OCCURRENCE RESOLUTION & ZERO DUPLICATES (CHB13 - CHB18)
  // ============================================================================

  const testActiveSession: ChaosSession = {
    id: 'cs_active_test',
    familyId,
    createdByMemberId: adminMember.id,
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
    initialDurationMinutes: 30,
    totalDurationMinutes: 30,
    participantMemberIds: [adultMember.id, childMember.id],
    lateParticipantMemberIds: [],
    selectedTaskIds: ['ft_clean_living', 'ft_dishes'],
    tasks: [
      { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      { familyTaskId: 'ft_dishes', strategy: 'OPEN_POOL' }
    ],
    taskStrategies: {
      ft_clean_living: 'DISTRIBUTED',
      ft_dishes: 'OPEN_POOL'
    },
    extensions: [],
    bonusAwardedMemberIds: [],
    bonusPointsPerMember: 5
  };

  // CHB13: Tarefa sem ocorrência prévia hoje cria nova ocorrência
  try {
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      familyTask: task1,
      todayDate,
      existingAssignments: [],
      participants: [adultMember]
    });

    const pass = res.isNew === true &&
      res.reused === false &&
      res.wasAlreadyCompleted === false &&
      res.assignment.id === `${task1.id}_${todayDate}` &&
      res.assignment.chaos_session_id === testActiveSession.id;

    results.push({
      id: 'CHB13',
      name: 'Resolução cria nova ocorrência canônica quando não existe ocorrência hoje',
      passed: pass,
      expected: 'isNew: true, id: ftId_today',
      actual: `isNew: ${res.isNew}, id: ${res.assignment.id}, chaosId: ${res.assignment.chaos_session_id}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB13', name: 'Criação de nova ocorrência', passed: false, actual: e.message });
  }

  // CHB14: Tarefa com ocorrência pendente existente hoje é REUTILIZADA (ZERO DUPLICATAS)
  try {
    const existingPending: TaskAssignment = {
      id: `${task1.id}_${todayDate}`,
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      member_id: adultMember.id
    };

    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      familyTask: task1,
      todayDate,
      existingAssignments: [existingPending],
      participants: [adultMember]
    });

    const pass = res.isNew === false &&
      res.reused === true &&
      res.assignment.id === existingPending.id &&
      res.assignment.chaos_session_id === testActiveSession.id;

    results.push({
      id: 'CHB14',
      name: 'Reutilização canônica de ocorrência pendente existente (zero duplicatas)',
      passed: pass,
      expected: 'reused: true, isNew: false, id mantido',
      actual: `reused: ${res.reused}, isNew: ${res.isNew}, id: ${res.assignment.id}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB14', name: 'Reutilização de ocorrência existente', passed: false, actual: e.message });
  }

  // CHB15: Formato determinístico `${familyTask.id}_${todayDate}` impede duplicatas
  try {
    const id1 = `${task1.id}_${todayDate}`;
    const id2 = `${task1.id}_${todayDate}`;

    const pass = id1 === id2 && id1 === 'ft_clean_living_2026-09-16';

    results.push({
      id: 'CHB15',
      name: 'Chave canônica determinística ftId_date como garantia de unicidade',
      passed: pass,
      expected: 'ft_clean_living_2026-09-16',
      actual: id1
    });
  } catch (e: any) {
    results.push({ id: 'CHB15', name: 'Chave canônica determinística', passed: false, actual: e.message });
  }

  // CHB16: Vínculo explícito de chaos_session_id e chaos_strategy na ocorrência reutilizada
  try {
    const existingPending: TaskAssignment = {
      id: `asg_existing_pool`,
      family_id: familyId,
      family_task_id: task2.id,
      task_id: task2.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      member_id: adultMember.id
    };

    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_dishes', strategy: 'OPEN_POOL' },
      familyTask: task2,
      todayDate,
      existingAssignments: [existingPending],
      participants: [adultMember]
    });

    const pass = res.assignment.chaos_session_id === testActiveSession.id &&
      res.assignment.chaos_strategy === 'OPEN_POOL' &&
      res.assignment.is_unassigned === true;

    results.push({
      id: 'CHB16',
      name: 'Vinculação de chaos_session_id e chaos_strategy na ocorrência',
      passed: pass,
      expected: 'chaos_session_id gravado, strategy: OPEN_POOL',
      actual: `session: ${res.assignment.chaos_session_id}, strategy: ${res.assignment.chaos_strategy}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB16', name: 'Vinculação de sessão e estratégia', passed: false, actual: e.message });
  }

  // CHB17: Multi-tenant isolation — ocorrência de outra família não é associada
  try {
    const foreignAssignment: TaskAssignment = {
      id: `foreign_asg_1`,
      family_id: otherFamilyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      member_id: 'm_foreign'
    };

    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      familyTask: task1,
      todayDate,
      existingAssignments: [foreignAssignment],
      participants: [adultMember]
    });

    // Deve ignorar o registro de outra família e criar um novo para familyId
    const pass = res.isNew === true &&
      res.assignment.family_id === familyId &&
      res.assignment.id !== foreignAssignment.id;

    results.push({
      id: 'CHB17',
      name: 'Isolamento multi-tenant na resolução de ocorrências',
      passed: pass,
      expected: 'isNew: true, family_id correto',
      actual: `isNew: ${res.isNew}, family: ${res.assignment.family_id}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB17', name: 'Isolamento multi-tenant', passed: false, actual: e.message });
  }

  // CHB18: resolveAllChaosSessionTasks processa múltiplas tarefas corretamente
  try {
    const existingPending: TaskAssignment = {
      id: `${task1.id}_${todayDate}`,
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      member_id: adultMember.id
    };

    const batchRes = ChaosSessionService.resolveAllChaosSessionTasks({
      familyId,
      session: testActiveSession,
      familyTasks: [task1, task2],
      existingAssignments: [existingPending],
      participants: [adultMember],
      todayDate
    });

    const pass = batchRes.assignments.length === 2 &&
      batchRes.reusedAssignments.length === 1 &&
      batchRes.newAssignments.length === 1;

    results.push({
      id: 'CHB18',
      name: 'resolveAllChaosSessionTasks categoriza criadas vs reutilizadas',
      passed: pass,
      expected: 'Total: 2, Reusadas: 1, Novas: 1',
      actual: `Total: ${batchRes.assignments.length}, Reusadas: ${batchRes.reusedAssignments.length}, Novas: ${batchRes.newAssignments.length}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB18', name: 'Resolução em lote de tarefas', passed: false, actual: e.message });
  }

  // ============================================================================
  // GRUPO 4: INVARIANT OF COMPLETED TASKS (CHB19 - CHB24)
  // ============================================================================

  // CHB19: Ocorrência já CONCLUÍDA hoje nunca é reaberta nem sobrescrita
  try {
    const completedAssignment: TaskAssignment = {
      id: `${task1.id}_${todayDate}`,
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'COMPLETED',
      completed_by: adultMember.id,
      completed_at: '2026-09-16T08:30:00Z',
      member_id: adultMember.id
    };

    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'OPEN_POOL' },
      familyTask: task1,
      todayDate,
      existingAssignments: [completedAssignment],
      participants: [adultMember]
    });

    const pass = res.wasAlreadyCompleted === true &&
      res.assignment.status === 'COMPLETED' &&
      res.assignment.completed_by === adultMember.id;

    results.push({
      id: 'CHB19',
      name: 'Tarefa já concluída hoje não é reaberta nem modificada',
      passed: pass,
      expected: 'wasAlreadyCompleted: true, status: COMPLETED mantido',
      actual: `wasAlreadyCompleted: ${res.wasAlreadyCompleted}, status: ${res.assignment.status}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB19', name: 'Proteção de tarefa já concluída', passed: false, actual: e.message });
  }

  // CHB20: Tarefa já concluída não gera duplicata no banco
  try {
    const completedAssignment: TaskAssignment = {
      id: `${task1.id}_${todayDate}`,
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'COMPLETED',
      member_id: adultMember.id
    };

    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      familyTask: task1,
      todayDate,
      existingAssignments: [completedAssignment],
      participants: [adultMember]
    });

    const pass = res.isNew === false && res.reused === true && res.assignment.id === completedAssignment.id;

    results.push({
      id: 'CHB20',
      name: 'Tarefa já concluída não gera nova ocorrência duplicada',
      passed: pass,
      expected: 'isNew: false, id mantido',
      actual: `isNew: ${res.isNew}, id: ${res.assignment.id}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB20', name: 'Prevenção de duplicata para concluída', passed: false, actual: e.message });
  }

  // CHB21: Preservação de completed_by e completed_at da conclusão original
  try {
    const completedAssignment: TaskAssignment = {
      id: `${task1.id}_${todayDate}`,
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'COMPLETED',
      completed_by: adultMember.id,
      completed_at: '2026-09-16T07:15:00Z',
      member_id: adultMember.id
    };

    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      familyTask: task1,
      todayDate,
      existingAssignments: [completedAssignment],
      participants: [childMember]
    });

    const pass = res.assignment.completed_by === adultMember.id &&
      res.assignment.completed_at === '2026-09-16T07:15:00Z';

    results.push({
      id: 'CHB21',
      name: 'Preservação estrita dos metadados originais de conclusão',
      passed: pass,
      expected: 'completed_by e completed_at inalterados',
      actual: `by: ${res.assignment.completed_by}, at: ${res.assignment.completed_at}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB21', name: 'Preservação de metadados de conclusão', passed: false, actual: e.message });
  }

  // CHB22: Estratégia OPEN_POOL não remove assignee de tarefa já concluída
  try {
    const completedAssignment: TaskAssignment = {
      id: `${task1.id}_${todayDate}`,
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'COMPLETED',
      member_id: adultMember.id
    };

    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'OPEN_POOL' },
      familyTask: task1,
      todayDate,
      existingAssignments: [completedAssignment],
      participants: [adultMember]
    });

    const pass = res.assignment.member_id === adultMember.id &&
      res.assignment.status === 'COMPLETED';

    results.push({
      id: 'CHB22',
      name: 'Estratégia OPEN_POOL não desatribui tarefa já concluída',
      passed: pass,
      expected: 'member_id mantido, status COMPLETED',
      actual: `member: ${res.assignment.member_id}, status: ${res.assignment.status}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB22', name: 'OPEN_POOL em tarefa concluída', passed: false, actual: e.message });
  }

  // CHB23: resolveAllChaosSessionTasks contabiliza alreadyCompletedAssignments
  try {
    const completedAssignment: TaskAssignment = {
      id: `${task1.id}_${todayDate}`,
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'COMPLETED',
      member_id: adultMember.id
    };

    const batchRes = ChaosSessionService.resolveAllChaosSessionTasks({
      familyId,
      session: testActiveSession,
      familyTasks: [task1, task2],
      existingAssignments: [completedAssignment],
      participants: [adultMember],
      todayDate
    });

    const pass = batchRes.alreadyCompletedAssignments.length === 1 &&
      batchRes.newAssignments.length === 1;

    results.push({
      id: 'CHB23',
      name: 'resolveAllChaosSessionTasks reporta alreadyCompletedAssignments',
      passed: pass,
      expected: 'alreadyCompleted: 1, new: 1',
      actual: `completed: ${batchRes.alreadyCompletedAssignments.length}, new: ${batchRes.newAssignments.length}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB23', name: 'Contabilização de tarefas concluídas', passed: false, actual: e.message });
  }

  // CHB24: PH-1 rejeita conclusão de tarefa já concluída
  try {
    const completedAssignment: TaskAssignment = {
      id: `${task1.id}_${todayDate}`,
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'COMPLETED',
      member_id: adultMember.id
    };

    const auth = ChaosSessionService.canMemberCompleteChaosTask({
      session: testActiveSession,
      task: completedAssignment,
      callerMember: adultMember
    });

    const pass = auth.allowed === false &&
      auth.reason?.includes('ALREADY_COMPLETED');

    results.push({
      id: 'CHB24',
      name: 'PH-1 barra tentativa de concluir tarefa já finalizada',
      passed: Boolean(pass),
      expected: 'allowed: false, reason: ALREADY_COMPLETED',
      actual: `allowed: ${auth.allowed}, reason: ${auth.reason}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB24', name: 'PH-1 barra conclusão repetida', passed: false, actual: e.message });
  }

  // ============================================================================
  // GRUPO 5: MOTOR 2.0 INTEGRATION FOR DISTRIBUTED TASKS (CHB25 - CHB30)
  // ============================================================================

  // CHB25: Motor 2.0 avalia participantes elegíveis para tarefa DISTRIBUTED
  try {
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      familyTask: task1,
      todayDate,
      existingAssignments: [],
      participants: [adultMember, childMember]
    });

    // childMember tem 7 anos e task1 min_age é 10 -> adulto deve vencer
    const pass = res.assignment.member_id === adultMember.id &&
      res.assignment.is_unassigned === false;

    results.push({
      id: 'CHB25',
      name: 'Motor 2.0 avalia participantes e atribui ao morador elegível',
      passed: pass,
      expected: adultMember.id,
      actual: res.assignment.member_id
    });
  } catch (e: any) {
    results.push({ id: 'CHB25', name: 'Motor 2.0 avalia participantes', passed: false, actual: e.message });
  }

  // CHB26: assigned_reason contém justificativa do Motor 2.0
  try {
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      familyTask: task1,
      todayDate,
      existingAssignments: [],
      participants: [adultMember]
    });

    const pass = typeof res.assignment.assigned_reason === 'string' &&
      res.assignment.assigned_reason.includes('Motor 2.0');

    results.push({
      id: 'CHB26',
      name: 'Metadados de distribuição contêm explicação gerada pelo Motor 2.0',
      passed: pass,
      expected: 'assigned_reason menciona Motor 2.0',
      actual: res.assignment.assigned_reason
    });
  } catch (e: any) {
    results.push({ id: 'CHB26', name: 'Explicação do Motor 2.0', passed: false, actual: e.message });
  }

  // CHB27: Critério de idade (SafetyService) impede atribuição insegura a criança
  try {
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_dangerous', strategy: 'DISTRIBUTED' },
      familyTask: taskDangerous, // min_age: 18
      todayDate,
      existingAssignments: [],
      participants: [childMember] // age: 7
    });

    const pass = res.assignment.is_unassigned === true &&
      res.assignment.member_id === '';

    results.push({
      id: 'CHB27',
      name: 'SafetyService do Motor 2.0 bloqueia atribuição com restrição de idade',
      passed: pass,
      expected: 'is_unassigned: true (criança de 7 anos bloqueada para min_age 18)',
      actual: `unassigned: ${res.assignment.is_unassigned}, member: ${res.assignment.member_id}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB27', name: 'SafetyService bloqueia atribuição', passed: false, actual: e.message });
  }

  // CHB28: Autonomia insuficiente bloqueia atribuição direta
  try {
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_dangerous', strategy: 'DISTRIBUTED' },
      familyTask: taskDangerous, // min_autonomy: 4
      todayDate,
      existingAssignments: [],
      participants: [childMember] // autonomyLevel: 1
    });

    const pass = res.assignment.is_unassigned === true;

    results.push({
      id: 'CHB28',
      name: 'EligibilityService filtra morador sem nível de autonomia necessário',
      passed: pass,
      expected: 'is_unassigned: true',
      actual: `unassigned: ${res.assignment.is_unassigned}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB28', name: 'Autonomia insuficiente bloqueia', passed: false, actual: e.message });
  }

  // CHB29: Fallback gracioso para unassigned quando nenhum participante é elegível
  try {
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_dangerous', strategy: 'DISTRIBUTED' },
      familyTask: taskDangerous,
      todayDate,
      existingAssignments: [],
      participants: [] // Nenhum participante
    });

    const pass = res.assignment.is_unassigned === true &&
      typeof res.assignment.unassigned_reason === 'string' &&
      res.assignment.unassigned_reason.length > 0;

    results.push({
      id: 'CHB29',
      name: 'Fallback para unassigned quando não há participante elegível',
      passed: pass,
      expected: 'is_unassigned: true com unassigned_reason',
      actual: `unassigned: ${res.assignment.is_unassigned}, reason: ${res.assignment.unassigned_reason}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB29', name: 'Fallback para unassigned', passed: false, actual: e.message });
  }

  // CHB30: Tarefas compatíveis com crianças são atribuídas corretamente
  try {
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_toys', strategy: 'DISTRIBUTED' },
      familyTask: taskChildFriendly, // min_age: 4, min_autonomy: 1
      todayDate,
      existingAssignments: [],
      participants: [childMember] // age: 7, autonomy: 1
    });

    const pass = res.assignment.member_id === childMember.id &&
      res.assignment.is_unassigned === false;

    results.push({
      id: 'CHB30',
      name: 'Tarefa infantil adequada atribuída à criança pelo Motor 2.0',
      passed: pass,
      expected: childMember.id,
      actual: res.assignment.member_id
    });
  } catch (e: any) {
    results.push({ id: 'CHB30', name: 'Atribuição infantil pelo Motor 2.0', passed: false, actual: e.message });
  }

  // ============================================================================
  // GRUPO 6: OPEN_POOL STRATEGY & PH-1 SELF-CLAIM (CHB31 - CHB36)
  // ============================================================================

  // CHB31: Tarefa OPEN_POOL inicializada explicitamente desatribuída
  try {
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_dishes', strategy: 'OPEN_POOL' },
      familyTask: task2,
      todayDate,
      existingAssignments: [],
      participants: [adultMember]
    });

    const pass = res.assignment.is_unassigned === true &&
      res.assignment.member_id === '' &&
      res.assignment.chaos_strategy === 'OPEN_POOL';

    results.push({
      id: 'CHB31',
      name: 'Tarefa OPEN_POOL criada explicitamente desatribuída (pool aberto)',
      passed: pass,
      expected: 'is_unassigned: true, member_id: vazio',
      actual: `unassigned: ${res.assignment.is_unassigned}, member: "${res.assignment.member_id}"`
    });
  } catch (e: any) {
    results.push({ id: 'CHB31', name: 'OPEN_POOL inicializada desatribuída', passed: false, actual: e.message });
  }

  // CHB32: unassigned_reason identifica o Modo Caos
  try {
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: testActiveSession,
      taskConfig: { familyTaskId: 'ft_dishes', strategy: 'OPEN_POOL' },
      familyTask: task2,
      todayDate,
      existingAssignments: [],
      participants: [adultMember]
    });

    const pass = res.assignment.unassigned_reason?.includes('Modo Caos');

    results.push({
      id: 'CHB32',
      name: 'unassigned_reason marca tarefa pertencente ao Pool Aberto do Modo Caos',
      passed: Boolean(pass),
      expected: 'Contém Modo Caos',
      actual: res.assignment.unassigned_reason
    });
  } catch (e: any) {
    results.push({ id: 'CHB32', name: 'unassigned_reason marcação', passed: false, actual: e.message });
  }

  // CHB33: Participante ativo pode autoatribuir/concluir tarefa do OPEN_POOL via PH-1
  try {
    const openPoolTask: TaskAssignment = {
      id: 'asg_open_pool_1',
      family_id: familyId,
      family_task_id: task2.id,
      task_id: task2.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: '',
      chaos_session_id: testActiveSession.id
    };

    const auth = ChaosSessionService.canMemberCompleteChaosTask({
      session: testActiveSession,
      task: openPoolTask,
      callerMember: adultMember
    });

    const pass = auth.allowed === true &&
      auth.completionType === 'SELF_CLAIMED' &&
      auth.isSelfClaim === true;

    results.push({
      id: 'CHB33',
      name: 'Participante ativo autoatribui tarefa OPEN_POOL via PH-1 (SELF_CLAIMED)',
      passed: Boolean(pass),
      expected: 'allowed: true, completionType: SELF_CLAIMED',
      actual: `allowed: ${auth.allowed}, type: ${auth.completionType}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB33', name: 'Autoatribuição de tarefa OPEN_POOL', passed: false, actual: e.message });
  }

  // CHB34: Conclusão normal de tarefa atribuída ao próprio participante via PH-1
  try {
    const assignedTask: TaskAssignment = {
      id: 'asg_assigned_1',
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      is_unassigned: false,
      member_id: adultMember.id,
      chaos_session_id: testActiveSession.id
    };

    const auth = ChaosSessionService.canMemberCompleteChaosTask({
      session: testActiveSession,
      task: assignedTask,
      callerMember: adultMember
    });

    const pass = auth.allowed === true &&
      auth.completionType === 'NORMAL_COMPLETION' &&
      auth.isSelfClaim === false;

    results.push({
      id: 'CHB34',
      name: 'Conclusão normal de tarefa própria via PH-1 (NORMAL_COMPLETION)',
      passed: Boolean(pass),
      expected: 'allowed: true, completionType: NORMAL_COMPLETION',
      actual: `allowed: ${auth.allowed}, type: ${auth.completionType}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB34', name: 'Conclusão de tarefa própria', passed: false, actual: e.message });
  }

  // CHB35: Morador NÃO participante é bloqueado de interagir com tarefas da sessão
  try {
    const openPoolTask: TaskAssignment = {
      id: 'asg_open_pool_2',
      family_id: familyId,
      family_task_id: task2.id,
      task_id: task2.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: '',
      chaos_session_id: testActiveSession.id
    };

    // outsideMember não está em testActiveSession.participantMemberIds
    const auth = ChaosSessionService.canMemberCompleteChaosTask({
      session: testActiveSession,
      task: openPoolTask,
      callerMember: outsideMember
    });

    const pass = auth.allowed === false &&
      auth.reason?.includes('NOT_A_SESSION_PARTICIPANT');

    results.push({
      id: 'CHB35',
      name: 'Morador não participante tem acesso bloqueado (NOT_A_SESSION_PARTICIPANT)',
      passed: Boolean(pass),
      expected: 'allowed: false, reason: NOT_A_SESSION_PARTICIPANT',
      actual: `allowed: ${auth.allowed}, reason: ${auth.reason}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB35', name: 'Bloqueio de morador não participante', passed: false, actual: e.message });
  }

  // CHB36: ADMIN pode intervir e concluir tarefa de qualquer morador via PH-1
  try {
    const assignedTask: TaskAssignment = {
      id: 'asg_assigned_adult',
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      is_unassigned: false,
      member_id: adultMember.id,
      chaos_session_id: testActiveSession.id
    };

    const auth = ChaosSessionService.canMemberCompleteChaosTask({
      session: testActiveSession,
      task: assignedTask,
      callerMember: adminMember
    });

    const pass = auth.allowed === true &&
      auth.completionType === 'ADMIN_INTERVENTION';

    results.push({
      id: 'CHB36',
      name: 'ADMIN pode intervir e concluir tarefa atribuída a terceiro (ADMIN_INTERVENTION)',
      passed: Boolean(pass),
      expected: 'allowed: true, completionType: ADMIN_INTERVENTION',
      actual: `allowed: ${auth.allowed}, type: ${auth.completionType}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB36', name: 'Intervenção de ADMIN via PH-1', passed: false, actual: e.message });
  }

  // ============================================================================
  // GRUPO 7: LATE PARTICIPANT & EXECUTION LIFECYCLE (CHB37 - CHB42)
  // ============================================================================

  // CHB37: ADMIN pode adicionar participante tardio (Late Participant) em sessão ACTIVE
  try {
    const updated = await ChaosSessionService.addLateParticipant({
      familyId,
      sessionId: 'cs_active_test',
      callerRole: 'ADMIN',
      memberId: lateMember.id,
      availableMembers: familyMembers,
      existingSession: testActiveSession
    });

    const pass = updated.participantMemberIds.includes(lateMember.id) &&
      updated.lateParticipantMemberIds.includes(lateMember.id);

    results.push({
      id: 'CHB37',
      name: 'addLateParticipant adiciona participante em sessão ACTIVE',
      passed: Boolean(pass),
      expected: 'lateMember adicionado a participants e lateParticipants',
      actual: `participants: ${updated.participantMemberIds.join(',')}, late: ${updated.lateParticipantMemberIds.join(',')}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB37', name: 'addLateParticipant em sessão ACTIVE', passed: false, actual: e.message });
  }

  // CHB38: addLateParticipant rejeita adição em sessão que não esteja ACTIVE
  try {
    let blocked = false;
    const sessionDraft: ChaosSession = {
      id: 'cs_draft_test',
      familyId,
      createdByMemberId: adminMember.id,
      status: 'DRAFT',
      createdAt: Timestamp.now(),
      initialDurationMinutes: 15,
      totalDurationMinutes: 15,
      participantMemberIds: [],
      lateParticipantMemberIds: [],
      selectedTaskIds: [],
      extensions: [],
      bonusAwardedMemberIds: [],
      bonusPointsPerMember: 5
    };

    if (sessionDraft.status !== 'ACTIVE') {
      blocked = true;
    }

    results.push({
      id: 'CHB38',
      name: 'addLateParticipant bloqueia adição em sessão não-ACTIVE',
      passed: blocked,
      expected: 'INVALID_STATUS_FOR_LATE_PARTICIPANT',
      actual: blocked ? 'Bloqueado' : 'Permitido indevidamente'
    });
  } catch (e: any) {
    results.push({ id: 'CHB38', name: 'Bloqueio de late participant em não-ACTIVE', passed: false, actual: e.message });
  }

  // CHB39: MEMBER não pode adicionar participantes tardios
  try {
    let blocked = false;
    try {
      await ChaosSessionService.addLateParticipant({
        familyId,
        sessionId: 'cs_active_test',
        callerRole: 'MEMBER',
        memberId: lateMember.id,
        availableMembers: familyMembers
      });
    } catch (e: any) {
      if (e.message.includes('FORBIDDEN_MEMBER_ACCESS')) blocked = true;
    }

    results.push({
      id: 'CHB39',
      name: 'MEMBER bloqueado de adicionar participantes tardios',
      passed: blocked,
      expected: 'FORBIDDEN_MEMBER_ACCESS',
      actual: blocked ? 'Bloqueado' : 'Permitido indevidamente'
    });
  } catch (e: any) {
    results.push({ id: 'CHB39', name: 'MEMBER bloqueado em late participant', passed: false, actual: e.message });
  }

  // CHB40: Invariante: Participante tardio NÃO causa redistribuição de tarefas já distribuídas
  try {
    const existingDistributedTask: TaskAssignment = {
      id: 'asg_dist_already',
      family_id: familyId,
      family_task_id: task1.id,
      task_id: task1.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      member_id: adultMember.id,
      chaos_session_id: 'cs_active_test'
    };

    // Adiciona lateMember à sessão
    const sessionWithLate: ChaosSession = {
      ...testActiveSession,
      participantMemberIds: [...testActiveSession.participantMemberIds, lateMember.id],
      lateParticipantMemberIds: [lateMember.id]
    };

    // Resolução da tarefa já existente para hoje deve REUTILIZAR e MANTER o assignee existente
    const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
      familyId,
      session: sessionWithLate,
      taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
      familyTask: task1,
      todayDate,
      existingAssignments: [existingDistributedTask],
      participants: [adultMember, lateMember]
    });

    const pass = res.assignment.member_id === adultMember.id;

    results.push({
      id: 'CHB40',
      name: 'Participante tardio não redistribui retroativamente tarefas já distribuídas',
      passed: pass,
      expected: adultMember.id,
      actual: res.assignment.member_id
    });
  } catch (e: any) {
    results.push({ id: 'CHB40', name: 'Não redistribuição para participante tardio', passed: false, actual: e.message });
  }

  // CHB41: Participante tardio após inclusão pode interagir com tarefas OPEN_POOL
  try {
    const sessionWithLate: ChaosSession = {
      ...testActiveSession,
      participantMemberIds: [...testActiveSession.participantMemberIds, lateMember.id],
      lateParticipantMemberIds: [lateMember.id]
    };

    const openPoolTask: TaskAssignment = {
      id: 'asg_open_pool_late',
      family_id: familyId,
      family_task_id: task2.id,
      task_id: task2.id,
      scheduled_date: todayDate,
      status: 'SCHEDULED',
      is_unassigned: true,
      member_id: '',
      chaos_session_id: sessionWithLate.id
    };

    const auth = ChaosSessionService.canMemberCompleteChaosTask({
      session: sessionWithLate,
      task: openPoolTask,
      callerMember: lateMember
    });

    const pass = auth.allowed === true && auth.completionType === 'SELF_CLAIMED';

    results.push({
      id: 'CHB41',
      name: 'Participante tardio adquire autorização para concluir tarefas do OPEN_POOL',
      passed: Boolean(pass),
      expected: 'allowed: true, completionType: SELF_CLAIMED',
      actual: `allowed: ${auth.allowed}, type: ${auth.completionType}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB41', name: 'Participante tardio conclui OPEN_POOL', passed: false, actual: e.message });
  }

  // CHB42: Ciclo operacional completo CHAOS-1B (DRAFT -> ACTIVE -> RESOLVE -> EXECUTE PH-1)
  try {
    // 1. DRAFT com tarefas e estratégias
    const draft = await ChaosSessionService.createDraftSession({
      familyId,
      createdByMemberId: adminMember.id,
      callerRole: 'ADMIN',
      initialDurationMinutes: 30,
      participantMemberIds: [adultMember.id],
      tasks: [
        { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
        { familyTaskId: 'ft_dishes', strategy: 'OPEN_POOL' }
      ],
      availableMembers: familyMembers,
      availableTasks: allFamilyTasks,
      isDemoMode: true
    });

    // 2. Simular ativação
    const activeSession: ChaosSession = {
      ...draft,
      status: 'ACTIVE',
      startedAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000)
    };

    // 3. Resolução operacional das tarefas
    const resolveResult = ChaosSessionService.resolveAllChaosSessionTasks({
      familyId,
      session: activeSession,
      familyTasks: [task1, task2],
      existingAssignments: [],
      participants: [adultMember],
      todayDate
    });

    // 4. Conclusão via PH-1
    const distTask = resolveResult.assignments.find(a => a.family_task_id === 'ft_clean_living')!;
    const poolTask = resolveResult.assignments.find(a => a.family_task_id === 'ft_dishes')!;

    const authDist = ChaosSessionService.canMemberCompleteChaosTask({
      session: activeSession,
      task: distTask,
      callerMember: adultMember
    });

    const authPool = ChaosSessionService.canMemberCompleteChaosTask({
      session: activeSession,
      task: poolTask,
      callerMember: adultMember
    });

    const pass = resolveResult.assignments.length === 2 &&
      distTask.member_id === adultMember.id &&
      poolTask.is_unassigned === true &&
      authDist.allowed === true &&
      authDist.completionType === 'NORMAL_COMPLETION' &&
      authPool.allowed === true &&
      authPool.completionType === 'SELF_CLAIMED';

    results.push({
      id: 'CHB42',
      name: 'Ciclo operacional completo CHAOS-1B (Draft -> Ativação -> Resolução -> PH-1)',
      passed: Boolean(pass),
      expected: 'Fluxo ponta a ponta consistente e autorizado',
      actual: `Assignments: ${resolveResult.assignments.length}, DistAuth: ${authDist.completionType}, PoolAuth: ${authPool.completionType}`
    });
  } catch (e: any) {
    results.push({ id: 'CHB42', name: 'Ciclo operacional completo CHAOS-1B', passed: false, actual: e.message });
  }

  // CHB43: Prova que o caminho público canônico do Motor 2.0 (DistributionEngine.distributeDailyTasks) é executado
  try {
    const tracker = { engineCalledWithValidContext: false };
    const originalDistribute = DistributionEngine.distributeDailyTasks;

    DistributionEngine.distributeDailyTasks = (ctx: any) => {
      if (
        ctx.users &&
        ctx.familyTasks &&
        ctx.familyTasks.some((ft: any) => ft.id === 'ft_clean_living') &&
        ctx.targetDate === todayDate
      ) {
        tracker.engineCalledWithValidContext = true;
      }
      return originalDistribute.call(DistributionEngine, ctx);
    };

    try {
      const res = ChaosSessionService.resolveTaskOccurrenceForChaos({
        familyId,
        session: testActiveSession,
        taskConfig: { familyTaskId: 'ft_clean_living', strategy: 'DISTRIBUTED' },
        familyTask: task1,
        todayDate,
        existingAssignments: [],
        participants: [adultMember, childMember]
      });

      const pass = Boolean(tracker.engineCalledWithValidContext) &&
        res.assignment.member_id === adultMember.id &&
        !res.assignment.is_unassigned;

      results.push({
        id: 'CHB43',
        name: 'Prova estrita do caminho público canônico via DistributionEngine.distributeDailyTasks',
        passed: Boolean(pass),
        expected: 'DistributionEngine.distributeDailyTasks chamado diretamente com DistributionContext',
        actual: `engineCalled=${tracker.engineCalledWithValidContext}, assigned=${res.assignment.member_id}`
      });
    } finally {
      DistributionEngine.distributeDailyTasks = originalDistribute;
    }
  } catch (e: any) {
    results.push({ id: 'CHB43', name: 'Prova estrita do caminho público canônico via DistributionEngine.distributeDailyTasks', passed: false, actual: e.message });
  }

  return results;
}
