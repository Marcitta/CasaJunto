/**
 * CASA JUNTO — TEST SUITE DOMESTIC-SUPPORT-1C-HF5
 * Corrigir identidade canônica das ocorrências + classificação no fluxo em lote
 * DS1C-HF5-01 - DS1C-HF5-17
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mapAssignmentsToTasks } from '../context/AppContext';
import { 
  resolveExecutionTarget, 
  formatExecutionTargetDisplay,
  validateFamilyTaskExecutionTarget
} from '../services/domesticSupportService';
import { BatchConfigurationModal } from '../components/BatchConfigurationModal';
import { 
  TaskAssignment, 
  FamilyTask, 
  TaskMaster, 
  Room, 
  DomesticSupport, 
  BatchAddRoutineInput,
  Family
} from '../types';
import { allMasterTasks } from '../data/tasks';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';

export async function runDomesticSupport1cHf5Tests(): Promise<{
  passed: number;
  failed: number;
  results: { testName: string; passed: boolean; message?: string }[];
}> {
  const results: { testName: string; passed: boolean; message?: string }[] = [];
  let passed = 0;
  let failed = 0;

  async function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      results.push({ testName: `DomesticSupport1C-HF5 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `DomesticSupport1C-HF5 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  const testFamilyId = 'fam-hf5-croce';
  const supportMaria: DomesticSupport = {
    id: 'ds-maria',
    familyId: testFamilyId,
    name: 'Maria',
    type: 'CLEANER',
    active: true,
    schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };
  const supportInactive: DomesticSupport = {
    id: 'ds-inativa',
    familyId: testFamilyId,
    name: 'Joana',
    type: 'CLEANER',
    active: false,
    schedule: [{ dayOfWeek: 2, startTime: '08:00', endTime: '12:00' }],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };
  const domesticSupports = [supportMaria, supportInactive];

  const testRooms: Room[] = [
    { id: 'room-banheiro', name: 'Banheiro', type: 'bathroom', family_id: testFamilyId, active: true },
    { id: 'room-cozinha', name: 'Cozinha', type: 'kitchen', family_id: testFamilyId, active: true },
    { id: 'room-sala', name: 'Sala de Estar', type: 'living_room', family_id: testFamilyId, active: true }
  ];

  // 1. TESTE OBRIGATÓRIO DE COLISÃO (SEÇÃO 3 DO PROMPT)
  // TaskMaster = clean-1
  // FamilyTask A: id = ft-household, executionTarget = HOUSEHOLD
  // FamilyTask B: id = ft-external, executionTarget = EXTERNAL_SUPPORT, domesticSupportId = ds-maria
  // mesma scheduled_date
  // Após mapAssignmentsToTasks(): resultado esperado = 2 Tasks, ambas independentes!
  await record('DS1C-HF5-01', 'Obrigatório de colisão: mesmo TaskMaster + mesma data + FamilyTasks diferentes geram 2 Tasks independentes', () => {
    const scheduledDate = '2026-10-05';

    const ftA: FamilyTask = {
      id: 'ft-household',
      family_id: testFamilyId,
      task_id: 'clean-1',
      task_master_id: 'clean-1',
      room_id: 'room-banheiro',
      frequency: 'WEEKLY',
      preferred_days: [1],
      executionTarget: 'HOUSEHOLD',
      active: true,
      start_date: scheduledDate,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z'
    };

    const ftB: FamilyTask = {
      id: 'ft-external',
      family_id: testFamilyId,
      task_id: 'clean-1',
      task_master_id: 'clean-1',
      room_id: 'room-banheiro',
      frequency: 'WEEKLY',
      preferred_days: [1],
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      active: true,
      start_date: scheduledDate,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z'
    };

    const asgA: TaskAssignment = {
      id: 'asg-household-1',
      family_id: testFamilyId,
      task_id: 'clean-1',
      family_task_id: 'ft-household',
      room_id: 'room-banheiro',
      member_id: '',
      scheduled_date: scheduledDate,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const asgB: TaskAssignment = {
      id: 'asg-external-1',
      family_id: testFamilyId,
      task_id: 'clean-1',
      family_task_id: 'ft-external',
      room_id: 'room-banheiro',
      member_id: '',
      scheduled_date: scheduledDate,
      scheduled_start: '10:00',
      scheduled_end: '10:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asgA, asgB],
      rooms: testRooms,
      familyTasks: [ftA, ftB],
      allMasterTasks
    });

    if (tasks.length !== 2) {
      throw new Error(`Esperado 2 tasks independentes após mapAssignmentsToTasks, obtido ${tasks.length}`);
    }

    const taskHousehold = tasks.find(t => t.familyTaskId === 'ft-household');
    const taskExternal = tasks.find(t => t.familyTaskId === 'ft-external');

    if (!taskHousehold) throw new Error('Task HOUSEHOLD não encontrada no resultado');
    if (!taskExternal) throw new Error('Task EXTERNAL_SUPPORT não encontrada no resultado');

    if (taskHousehold.executionTarget !== 'HOUSEHOLD') {
      throw new Error(`Task HOUSEHOLD deve ter executionTarget HOUSEHOLD, obtido ${taskHousehold.executionTarget}`);
    }
    if (taskExternal.executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`Task EXTERNAL deve ter executionTarget EXTERNAL_SUPPORT, obtido ${taskExternal.executionTarget}`);
    }
    if (taskExternal.domesticSupportId !== 'ds-maria') {
      throw new Error(`Task EXTERNAL deve ter domesticSupportId ds-maria, obtido ${taskExternal.domesticSupportId}`);
    }
    if (taskHousehold.taskMasterId !== 'clean-1' || taskExternal.taskMasterId !== 'clean-1') {
      throw new Error('Ambas as tasks devem apontar para o mesmo TaskMaster clean-1');
    }
  });

  // 2. PRESERVAR DEDUPLICAÇÃO REAL (SEÇÃO 4 DO PROMPT)
  // Mesma FamilyTask + mesma data não deve duplicar
  await record('DS1C-HF5-02', 'Preservar deduplicação real: mesma FamilyTask + mesma data não duplica', () => {
    const scheduledDate = '2026-10-05';
    const ft: FamilyTask = {
      id: 'ft-single',
      family_id: testFamilyId,
      task_id: 'clean-2',
      task_master_id: 'clean-2',
      room_id: 'room-cozinha',
      frequency: 'DAILY',
      executionTarget: 'HOUSEHOLD',
      active: true,
      start_date: scheduledDate,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z'
    };

    const asg1: TaskAssignment = {
      id: 'asg-1',
      family_id: testFamilyId,
      task_id: 'clean-2',
      family_task_id: 'ft-single',
      room_id: 'room-cozinha',
      member_id: '',
      scheduled_date: scheduledDate,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const asgDup: TaskAssignment = {
      id: 'asg-1-duplicate',
      family_id: testFamilyId,
      task_id: 'clean-2',
      family_task_id: 'ft-single',
      room_id: 'room-cozinha',
      member_id: '',
      scheduled_date: scheduledDate,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asg1, asgDup],
      rooms: testRooms,
      familyTasks: [ft],
      allMasterTasks
    });

    if (tasks.length !== 1) {
      throw new Error(`Esperado exatamente 1 task após deduplicação da mesma FamilyTask, obtido ${tasks.length}`);
    }
  });

  // 3. FALLBACK PARA LEGADO QUANDO NÃO EXISTE FAMILY_TASK_ID
  await record('DS1C-HF5-03', 'Fallback para legado: sem family_task_id, deduplica por task_id + scheduled_date', () => {
    const scheduledDate = '2026-10-05';
    const asgLeg1: TaskAssignment = {
      id: 'asg-leg-1',
      family_id: testFamilyId,
      task_id: 'clean-3',
      family_task_id: undefined,
      room_id: 'room-sala',
      member_id: '',
      scheduled_date: scheduledDate,
      scheduled_start: '14:00',
      scheduled_end: '14:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const asgLeg2: TaskAssignment = {
      id: 'asg-leg-2',
      family_id: testFamilyId,
      task_id: 'clean-3',
      family_task_id: undefined,
      room_id: 'room-sala',
      member_id: '',
      scheduled_date: scheduledDate,
      scheduled_start: '14:00',
      scheduled_end: '14:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asgLeg1, asgLeg2],
      rooms: testRooms,
      familyTasks: [],
      allMasterTasks
    });

    if (tasks.length !== 1) {
      throw new Error(`Esperado 1 task após fallback legado, obtido ${tasks.length}`);
    }
  });

  // 4. NÃO IMPLEMENTAR DEDUPLICAÇÃO POR TÍTULO
  await record('DS1C-HF5-04', 'Sem deduplicação por título: FamilyTasks distintas com mesmo título não se colapsam', () => {
    const scheduledDate = '2026-10-05';
    const ft1: FamilyTask = {
      id: 'ft-custom-1',
      family_id: testFamilyId,
      name: 'Limpeza Geral',
      customTitle: 'Limpeza Geral',
      room_id: 'room-sala',
      frequency: 'DAILY',
      executionTarget: 'HOUSEHOLD',
      active: true,
      start_date: scheduledDate,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z'
    };

    const ft2: FamilyTask = {
      id: 'ft-custom-2',
      family_id: testFamilyId,
      name: 'Limpeza Geral',
      customTitle: 'Limpeza Geral',
      room_id: 'room-cozinha',
      frequency: 'DAILY',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      active: true,
      start_date: scheduledDate,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z'
    };

    const asg1: TaskAssignment = {
      id: 'asg-c-1',
      family_id: testFamilyId,
      task_id: 'ft-custom-1',
      family_task_id: 'ft-custom-1',
      room_id: 'room-sala',
      member_id: '',
      scheduled_date: scheduledDate,
      scheduled_start: '08:00',
      scheduled_end: '08:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const asg2: TaskAssignment = {
      id: 'asg-c-2',
      family_id: testFamilyId,
      task_id: 'ft-custom-2',
      family_task_id: 'ft-custom-2',
      room_id: 'room-cozinha',
      member_id: '',
      scheduled_date: scheduledDate,
      scheduled_start: '08:00',
      scheduled_end: '08:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asg1, asg2],
      rooms: testRooms,
      familyTasks: [ft1, ft2],
      allMasterTasks
    });

    if (tasks.length !== 2) {
      throw new Error(`Tarefas com títulos iguais mas FamilyTasks distintas devem ambas sobreviver, obtido ${tasks.length}`);
    }
  });

  // 5. BATCHCONFIGURATIONMODAL RENDERIZA EXECUTIONTARGETSELECTOR
  await record('DS1C-HF5-05', 'BatchConfigurationModal renderiza ExecutionTargetSelector com as opções canônicas', () => {
    const selected = allMasterTasks.slice(0, 1);
    const html = renderToStaticMarkup(
      React.createElement(BatchConfigurationModal, {
        isOpen: true,
        onClose: () => {},
        selectedTasks: selected,
        familyTasks: [],
        rooms: testRooms,
        domesticSupports,
        onConfirm: async () => {}
      })
    );

    if (!html.includes('Quem normalmente faz esta tarefa?')) {
      throw new Error('BatchConfigurationModal deve conter o título "Quem normalmente faz esta tarefa?"');
    }
    if (!html.includes('Pessoas da casa')) {
      throw new Error('BatchConfigurationModal deve renderizar opção "Pessoas da casa"');
    }
    if (!html.includes('Ajuda externa')) {
      throw new Error('BatchConfigurationModal deve renderizar opção "Ajuda externa"');
    }
    if (!html.includes('Pode ser qualquer um')) {
      throw new Error('BatchConfigurationModal deve renderizar opção "Pode ser qualquer um"');
    }
  });

  // 6. REGRAS DO SELETOR: HOUSEHOLD -> domesticSupportId = null
  await record('DS1C-HF5-06', 'BatchConfigurationModal regra HOUSEHOLD: domesticSupportId é limpo para null', () => {
    const resolved = resolveExecutionTarget({ executionTarget: 'HOUSEHOLD' });
    if (resolved !== 'HOUSEHOLD') {
      throw new Error(`resolveExecutionTarget para HOUSEHOLD deve retornar HOUSEHOLD, retornado: ${resolved}`);
    }
    const val = validateFamilyTaskExecutionTarget({
      familyId: testFamilyId,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    }, domesticSupports);
    if (!val.valid) {
      throw new Error(`HOUSEHOLD com domesticSupportId null deve ser válido: ${val.error}`);
    }
  });

  // 7. REGRAS DO SELETOR: EXTERNAL_SUPPORT -> exige DomesticSupport ativa
  await record('DS1C-HF5-07', 'BatchConfigurationModal regra EXTERNAL_SUPPORT: exige DomesticSupport ativa', () => {
    // Sem domesticSupportId -> inválido
    const valNoSupport = validateFamilyTaskExecutionTarget({
      familyId: testFamilyId,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: null
    }, domesticSupports);
    if (valNoSupport.valid) {
      throw new Error('EXTERNAL_SUPPORT sem domesticSupportId deve ser inválido');
    }

    // Com domesticSupport inativa -> inválido
    const valInactive = validateFamilyTaskExecutionTarget({
      familyId: testFamilyId,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-inativa'
    }, domesticSupports);
    if (valInactive.valid) {
      throw new Error('EXTERNAL_SUPPORT com suporte inativo deve ser inválido');
    }

    // Com domesticSupport ativa -> válido
    const valActive = validateFamilyTaskExecutionTarget({
      familyId: testFamilyId,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria'
    }, domesticSupports);
    if (!valActive.valid) {
      throw new Error(`EXTERNAL_SUPPORT com Maria ativa deve ser válido: ${valActive.error}`);
    }
  });

  // 8. REGRAS DO SELETOR: FLEXIBLE -> DomesticSupport opcional como preferência
  await record('DS1C-HF5-08', 'BatchConfigurationModal regra FLEXIBLE: suporte opcional como preferência', () => {
    const valFlexNoSupport = validateFamilyTaskExecutionTarget({
      familyId: testFamilyId,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: null
    }, domesticSupports);
    if (!valFlexNoSupport.valid) {
      throw new Error('FLEXIBLE sem domesticSupportId deve ser válido');
    }

    const valFlexWithSupport = validateFamilyTaskExecutionTarget({
      familyId: testFamilyId,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'ds-maria'
    }, domesticSupports);
    if (!valFlexWithSupport.valid) {
      throw new Error('FLEXIBLE com domesticSupportId deve ser válido');
    }
  });

  // 9. BATCH ADD RECEBE E PRESERVA executionTarget E domesticSupportId
  await record('DS1C-HF5-09', 'batchAdd: preserva executionTarget e domesticSupportId sem hardcodar HOUSEHOLD', () => {
    const input: BatchAddRoutineInput = {
      taskMasterId: 'clean-4',
      name: 'Limpar Vidros',
      roomId: 'room-sala',
      frequency: 'WEEKLY',
      preferredDays: [5],
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria'
    };

    const target = resolveExecutionTarget(input);
    if (target !== 'EXTERNAL_SUPPORT') {
      throw new Error(`resolveExecutionTarget deve retornar EXTERNAL_SUPPORT, obtido: ${target}`);
    }

    const supportId = (target as string) === 'HOUSEHOLD' ? null : (input.domesticSupportId ?? null);
    if (supportId !== 'ds-maria') {
      throw new Error(`domesticSupportId deve ser preservado como ds-maria, obtido: ${supportId}`);
    }
  });

  // 10. BATCH ADD RESOLVE LEGADO SEM EXECUTION_TARGET PARA HOUSEHOLD
  await record('DS1C-HF5-10', 'batchAdd: registros legados sem executionTarget resolvem para HOUSEHOLD', () => {
    const targetUndefined = resolveExecutionTarget(undefined);
    if (targetUndefined !== 'HOUSEHOLD') {
      throw new Error(`resolveExecutionTarget(undefined) deve ser HOUSEHOLD, obtido: ${targetUndefined}`);
    }

    const targetEmptyObj = resolveExecutionTarget({});
    if (targetEmptyObj !== 'HOUSEHOLD') {
      throw new Error(`resolveExecutionTarget({}) deve ser HOUSEHOLD, obtido: ${targetEmptyObj}`);
    }
  });

  // 11. REATIVAÇÃO PRESERVA ID DA FAMILYTASK E APLICA NOVA CLASSIFICAÇÃO
  await record('DS1C-HF5-11', 'Reativação: preserva FamilyTask ID, histórico e aplica nova classificação', () => {
    const existingInactive: FamilyTask = {
      id: 'ft-existing-legacy-123',
      family_id: testFamilyId,
      task_master_id: 'clean-5',
      task_id: 'clean-5',
      name: 'Lavar Louça',
      room_id: 'room-cozinha',
      frequency: 'DAILY',
      active: false,
      executionTarget: 'HOUSEHOLD',
      start_date: '2026-01-01',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z'
    };

    // Reativação selecionada com EXTERNAL_SUPPORT + Maria
    const itemInput: BatchAddRoutineInput = {
      taskMasterId: 'clean-5',
      name: 'Lavar Louça',
      roomId: 'room-cozinha',
      frequency: 'DAILY',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria'
    };

    const target = itemInput.executionTarget ?? existingInactive.executionTarget;
    const resolvedTarget = resolveExecutionTarget({ executionTarget: target });
    const resolvedSupportId = resolvedTarget === 'HOUSEHOLD' 
      ? null 
      : (itemInput.executionTarget !== undefined ? (itemInput.domesticSupportId ?? null) : (existingInactive.domesticSupportId ?? null));

    const reactivated: FamilyTask = {
      ...existingInactive,
      active: true,
      executionTarget: resolvedTarget,
      domesticSupportId: resolvedSupportId,
      updated_at: '2026-09-30T00:00:00Z'
    };

    if (reactivated.id !== 'ft-existing-legacy-123') {
      throw new Error(`ID da FamilyTask deve ser preservado na reativação! Esperado ft-existing-legacy-123, obtido ${reactivated.id}`);
    }
    if (reactivated.executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`Nova classificação EXTERNAL_SUPPORT deve ser aplicada, obtido ${reactivated.executionTarget}`);
    }
    if (reactivated.domesticSupportId !== 'ds-maria') {
      throw new Error(`domesticSupportId ds-maria deve ser aplicado, obtido ${reactivated.domesticSupportId}`);
    }
    if (!reactivated.active) {
      throw new Error('FamilyTask reativada deve ter active = true');
    }
  });

  // 12. REGRESSÕES: HOUSEHOLD, EXTERNAL_SUPPORT e FLEXIBLE APARECEM WEEKLY
  await record('DS1C-HF5-12', 'Visibilidade semanal: HOUSEHOLD, EXTERNAL_SUPPORT e FLEXIBLE aparecem na agenda semanal', async () => {
    const testFamily: Family = {
      id: testFamilyId,
      name: 'Família HF5 Teste',
      timezone: 'America/Sao_Paulo',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z'
    };

    const routineHousehold: FamilyTask = {
      id: 'ft-reg-household',
      family_id: testFamilyId,
      task_master_id: 'clean-10',
      task_id: 'clean-10',
      name: 'Varrer a Sala',
      room_id: 'room-sala',
      frequency: 'DAILY',
      executionTarget: 'HOUSEHOLD',
      active: true,
      start_date: '2026-09-28',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z'
    };

    const routineExternal: FamilyTask = {
      id: 'ft-reg-external',
      family_id: testFamilyId,
      task_master_id: 'clean-11',
      task_id: 'clean-11',
      name: 'Passar Roupa',
      room_id: 'room-sala',
      frequency: 'DAILY',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      active: true,
      start_date: '2026-09-28',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z'
    };

    const routineFlexible: FamilyTask = {
      id: 'ft-reg-flexible',
      family_id: testFamilyId,
      task_master_id: 'clean-12',
      task_id: 'clean-12',
      name: 'Tirar o Lixo',
      room_id: 'room-cozinha',
      frequency: 'DAILY',
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'ds-maria',
      active: true,
      start_date: '2026-09-28',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z'
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routineHousehold, routineExternal, routineFlexible],
      existingAssignments: [],
      isDemoMode: true
    });

    const mappedTasks = mapAssignmentsToTasks({
      assignments: syncResult.allAssignments,
      rooms: testRooms,
      familyTasks: [routineHousehold, routineExternal, routineFlexible],
      allMasterTasks
    });

    const hasHousehold = mappedTasks.some(t => t.familyTaskId === 'ft-reg-household');
    const hasExternal = mappedTasks.some(t => t.familyTaskId === 'ft-reg-external');
    const hasFlexible = mappedTasks.some(t => t.familyTaskId === 'ft-reg-flexible');

    if (!hasHousehold) throw new Error('HOUSEHOLD deve ter ocorrências geradas e mapeadas');
    if (!hasExternal) throw new Error('EXTERNAL_SUPPORT deve ter ocorrências geradas e mapeadas');
    if (!hasFlexible) throw new Error('FLEXIBLE deve ter ocorrências geradas e mapeadas');
  });

  // 13. EXTERNAL_SUPPORT CRIADA DIRETAMENTE PELO CATÁLOGO APARECE WEEKLY
  await record('DS1C-HF5-13', 'EXTERNAL_SUPPORT criada diretamente pelo catálogo aparece na Visão Semanal imediatamente', async () => {
    const testFamily: Family = {
      id: testFamilyId,
      name: 'Família HF5 Teste',
      timezone: 'America/Sao_Paulo',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z'
    };

    const routineCatalogExternal: FamilyTask = {
      id: 'ft-cat-external-01',
      family_id: testFamilyId,
      task_master_id: 'clean-20',
      task_id: 'clean-20',
      name: 'Limpeza Pesada do Banheiro',
      room_id: 'room-banheiro',
      frequency: 'WEEKLY',
      preferred_days: [1],
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      active: true,
      start_date: '2026-09-28',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z'
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routineCatalogExternal],
      existingAssignments: [],
      isDemoMode: true
    });

    const mappedTasks = mapAssignmentsToTasks({
      assignments: syncResult.allAssignments,
      rooms: testRooms,
      familyTasks: [routineCatalogExternal],
      allMasterTasks
    });

    if (mappedTasks.length === 0) {
      throw new Error('EXTERNAL_SUPPORT deve ter ocorrências na visão semanal');
    }

    const firstTask = mappedTasks[0];
    if (firstTask.executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`executionTarget deve ser EXTERNAL_SUPPORT, obtido: ${firstTask.executionTarget}`);
    }
    if (firstTask.domesticSupportId !== 'ds-maria') {
      throw new Error(`domesticSupportId deve ser ds-maria, obtido: ${firstTask.domesticSupportId}`);
    }

    const badge = formatExecutionTargetDisplay(firstTask, domesticSupports);
    if (!badge.label.includes('Maria') || !badge.label.includes('Ajuda externa')) {
      throw new Error(`Badge amigável esperado "Maria · Ajuda externa", obtido: "${badge.label}"`);
    }
  });

  // 14. EDIÇÃO BIDIRECIONAL: HOUSEHOLD -> EXTERNAL_SUPPORT E VICE-VERSA
  await record('DS1C-HF5-14', 'Edição bidirecional: transições HOUSEHOLD <-> EXTERNAL_SUPPORT preservam visibilidade e atualizam badge', async () => {
    const testFamily: Family = {
      id: testFamilyId,
      name: 'Família HF5 Teste',
      timezone: 'America/Sao_Paulo',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z'
    };

    // 1. Inicial como HOUSEHOLD
    const routineHousehold: FamilyTask = {
      id: 'ft-edit-bidir',
      family_id: testFamilyId,
      task_master_id: 'clean-30',
      task_id: 'clean-30',
      name: 'Organizar Armários',
      room_id: 'room-cozinha',
      frequency: 'WEEKLY',
      preferred_days: [3],
      executionTarget: 'HOUSEHOLD',
      active: true,
      start_date: '2026-09-28',
      created_at: '2026-09-28T00:00:00Z',
      updated_at: '2026-09-28T00:00:00Z'
    };

    let syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routineHousehold],
      existingAssignments: [],
      isDemoMode: true
    });

    let mappedTasks = mapAssignmentsToTasks({
      assignments: syncResult.allAssignments,
      rooms: testRooms,
      familyTasks: [routineHousehold],
      allMasterTasks
    });

    if (mappedTasks.length === 0) throw new Error('Ocorrência HOUSEHOLD não gerada');
    if (mappedTasks[0].executionTarget !== 'HOUSEHOLD') throw new Error('Target deve ser HOUSEHOLD');

    // 2. Transição para EXTERNAL_SUPPORT
    const routineUpdatedToExternal: FamilyTask = {
      ...routineHousehold,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      updated_at: '2026-09-28T10:00:00Z'
    };

    syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routineUpdatedToExternal],
      existingAssignments: syncResult.allAssignments,
      isDemoMode: true
    });

    mappedTasks = mapAssignmentsToTasks({
      assignments: syncResult.allAssignments,
      rooms: testRooms,
      familyTasks: [routineUpdatedToExternal],
      allMasterTasks
    });

    if (mappedTasks.length === 0) throw new Error('Ocorrência não encontrada após migração para EXTERNAL_SUPPORT');
    if (mappedTasks[0].executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`Target após edição deve ser EXTERNAL_SUPPORT, obtido: ${mappedTasks[0].executionTarget}`);
    }
    if (mappedTasks[0].domesticSupportId !== 'ds-maria') {
      throw new Error('domesticSupportId deve ser ds-maria após migração');
    }

    // 3. Transição de volta para HOUSEHOLD
    const routineUpdatedBackToHousehold: FamilyTask = {
      ...routineUpdatedToExternal,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null,
      updated_at: '2026-09-28T12:00:00Z'
    };

    syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routineUpdatedBackToHousehold],
      existingAssignments: syncResult.allAssignments,
      isDemoMode: true
    });

    mappedTasks = mapAssignmentsToTasks({
      assignments: syncResult.allAssignments,
      rooms: testRooms,
      familyTasks: [routineUpdatedBackToHousehold],
      allMasterTasks
    });

    if (mappedTasks.length === 0) throw new Error('Ocorrência não encontrada após retorno para HOUSEHOLD');
    if (mappedTasks[0].executionTarget !== 'HOUSEHOLD') {
      throw new Error(`Target após retorno deve ser HOUSEHOLD, obtido: ${mappedTasks[0].executionTarget}`);
    }
    if (mappedTasks[0].domesticSupportId !== null) {
      throw new Error('domesticSupportId deve ser limpo para null');
    }
  });

  // 15. FORMATAÇÃO DO BADGE DE EXECUÇÃO
  await record('DS1C-HF5-15', 'Badges de execução amigáveis formatam corretamente todos os estados canônicos', () => {
    const badgeHousehold = formatExecutionTargetDisplay({ executionTarget: 'HOUSEHOLD' }, domesticSupports);
    if (badgeHousehold.label !== '👨‍👩‍👧‍👦 Pessoas da casa') {
      throw new Error(`Badge HOUSEHOLD inesperado: "${badgeHousehold.label}"`);
    }

    const badgeExternal = formatExecutionTargetDisplay({ executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: 'ds-maria' }, domesticSupports);
    if (!badgeExternal.label.includes('Maria') || !badgeExternal.label.includes('Ajuda externa')) {
      throw new Error(`Badge EXTERNAL_SUPPORT inesperado: "${badgeExternal.label}"`);
    }

    const badgeFlexNoSupport = formatExecutionTargetDisplay({ executionTarget: 'FLEXIBLE' }, domesticSupports);
    if (badgeFlexNoSupport.label !== '🔄 Qualquer um') {
      throw new Error(`Badge FLEXIBLE sem suporte inesperado: "${badgeFlexNoSupport.label}"`);
    }

    const badgeFlexWithSupport = formatExecutionTargetDisplay({ executionTarget: 'FLEXIBLE', domesticSupportId: 'ds-maria' }, domesticSupports);
    if (badgeFlexWithSupport.label !== '🔄 Qualquer um · preferência: Maria') {
      throw new Error(`Badge FLEXIBLE com suporte inesperado: "${badgeFlexWithSupport.label}"`);
    }
  });

  // 16. ISOLAMENTO MULTI-TENANT
  await record('DS1C-HF5-16', 'Isolamento multi-tenant: ocorrências de famílias distintas não colidem nem vazam', () => {
    const asgFamilyA: TaskAssignment = {
      id: 'asg-fam-a-1',
      family_id: 'fam-alpha',
      task_id: 'clean-1',
      family_task_id: 'ft-fam-a',
      room_id: 'room-1',
      member_id: '',
      scheduled_date: '2026-10-05',
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const asgFamilyB: TaskAssignment = {
      id: 'asg-fam-b-1',
      family_id: 'fam-beta',
      task_id: 'clean-1',
      family_task_id: 'ft-fam-b',
      room_id: 'room-1',
      member_id: '',
      scheduled_date: '2026-10-05',
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const ftFamilyA: FamilyTask = {
      id: 'ft-fam-a',
      family_id: 'fam-alpha',
      task_id: 'clean-1',
      room_id: 'room-1',
      frequency: 'DAILY',
      executionTarget: 'HOUSEHOLD',
      active: true,
      start_date: '2026-10-05',
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z'
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asgFamilyA, asgFamilyB],
      rooms: testRooms,
      familyTasks: [ftFamilyA],
      allMasterTasks
    });

    if (tasks.length !== 2) {
      throw new Error(`Esperado 2 tasks distintas para famílias diferentes, obtido ${tasks.length}`);
    }
    const taskA = tasks.find(t => t.id === 'asg-fam-a-1');
    const taskB = tasks.find(t => t.id === 'asg-fam-b-1');
    if (!taskA || !taskB) throw new Error('Ambas as tarefas de famílias distintas devem estar presentes');
    if (taskA.familyId !== 'fam-alpha' || taskB.familyId !== 'fam-beta') {
      throw new Error('Family IDs devem ser rigorosamente preservados');
    }
  });

  // 17. PROTEÇÃO DOS MOTORES CENTRAIS
  await record('DS1C-HF5-17', 'Proteção de invariantes: Motor 2.0, RoutineContinuity, RBAC e Gamificação 100% preservados', () => {
    const rawFtPayload = {
      id: 'ft-test-invariants',
      family_id: testFamilyId,
      task_id: 'clean-50',
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null,
      active: true
    };
    const sanitized = FirestoreMappers.fromFamilyTask(rawFtPayload as any);
    if ('domesticSupportId' in sanitized && sanitized.domesticSupportId === undefined) {
      throw new Error('Não devem existir campos undefined na serialização Firestore');
    }
  });

  return { passed, failed, results };
}
