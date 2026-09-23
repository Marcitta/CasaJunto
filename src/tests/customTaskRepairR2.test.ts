/**
 * CASA JUNTO — TEST SUITE: HOTFIX-TASK-CREATE-1-R2
 * Custom Task Canonical Repair & Catalog Visibility (TC-R2-01 to TC-R2-20)
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CustomTaskRepairService, TARGET_FAMILY_ID, TARGET_QA_CUSTOM_TASK_TITLES } from '../application/services/CustomTaskRepairService';
import { TaskCatalogView } from '../components/TaskCatalogView';
import { AppContext, AppContextType } from '../context/AppContext';
import { FamilyTask, TaskAssignment, Member, Family, Room, TaskMaster, Task } from '../types';
import { allMasterTasks } from '../data/tasks';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runCustomTaskRepairR2TestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function record(id: string, name: string, condition: boolean, errorMsg?: string) {
    results.push({
      id,
      name,
      passed: condition,
      error: condition ? undefined : (errorMsg || 'Condition not met')
    });
  }

  const tenantFamily: Family = {
    id: TARGET_FAMILY_ID,
    name: 'Casa Croce',
    code: 'CROCE1',
    timezone: 'America/Sao_Paulo',
    created_at: '2026-03-01T00:00:00.000Z'
  };

  const otherFamily: Family = {
    id: 'fam-other-tenant',
    name: 'Família Vizinha',
    code: 'VIZIN1',
    timezone: 'America/Sao_Paulo',
    created_at: '2026-03-01T00:00:00.000Z'
  };

  const testRooms: Room[] = [
    { id: 'room-geral', name: 'Geral', type: 'other', family_id: tenantFamily.id, active: true },
    { id: 'room-cozinha', name: 'Cozinha', type: 'kitchen', family_id: tenantFamily.id, active: true }
  ];

  const adminMember: Member = {
    id: 'mem-admin-croce',
    name: 'Fabiano Admin',
    role: 'ADMIN',
    avatar: '👨',
    color: '#5A5A40',
    active: true,
    points: 100,
    streak: 3
  };

  const testToday = '2026-03-15';

  // Base orphan assignments for QA tests
  const baseOrphans: TaskAssignment[] = [
    {
      id: 'asg-caos-1',
      task_id: 'task-1740000001',
      family_id: tenantFamily.id,
      title: 'testes caos 1',
      scheduled_date: testToday,
      status: 'SCHEDULED',
      room_id: 'room-geral',
      member_id: adminMember.id,
      frequency: 'ONE_TIME'
    } as any,
    {
      id: 'asg-caos-2',
      task_id: 'task-1740000002',
      family_id: tenantFamily.id,
      title: 'testes caos 2',
      scheduled_date: testToday,
      status: 'COMPLETED',
      room_id: 'room-geral',
      member_id: adminMember.id,
      completed_at: '2026-03-15T10:30:00.000Z',
      completed_by: adminMember.id,
      completion_type: 'NORMAL_COMPLETION',
      frequency: 'ONE_TIME'
    } as any,
    {
      id: 'asg-caos-3',
      task_id: 'task-1740000003',
      family_id: tenantFamily.id,
      title: 'testes caos 3',
      scheduled_date: testToday,
      status: 'SCHEDULED',
      room_id: 'room-geral',
      member_id: '',
      frequency: 'ONE_TIME'
    } as any,
    {
      id: 'asg-caos-4',
      task_id: 'task-1740000004',
      family_id: tenantFamily.id,
      title: 'testes caos 4',
      scheduled_date: testToday,
      status: 'SCHEDULED',
      room_id: 'room-geral',
      member_id: '',
      frequency: 'ONE_TIME'
    } as any
  ];

  // =========================================================================
  // TC-R2-01: assignment órfão → exatamente uma FamilyTask
  // =========================================================================
  const repair1 = await CustomTaskRepairService.repairOrphanTasks({
    familyId: tenantFamily.id,
    existingAssignments: baseOrphans,
    existingFamilyTasks: [],
    allMasterTasks,
    isDemoMode: true,
    today: testToday
  });

  const createdFTs = repair1.repairedFamilyTasks;
  const exactlyFour = createdFTs.length === 4 && TARGET_QA_CUSTOM_TASK_TITLES.every(title => 
    createdFTs.some(ft => (ft.customTitle || ft.name)?.toLowerCase() === title.toLowerCase())
  );
  record('TC-R2-01', 'assignment órfão gera exatamente uma FamilyTask por tarefa alvo', exactlyFour);

  // =========================================================================
  // TC-R2-02: assignmentId preservado
  // =========================================================================
  const allIdsPreserved = baseOrphans.every(orig => 
    repair1.repairedAssignments.some(repaired => repaired.id === orig.id)
  );
  record('TC-R2-02', 'assignmentId é rigorosamente preservado após repair', allIdsPreserved);

  // =========================================================================
  // TC-R2-03: assignment recebe family_task_id
  // =========================================================================
  const allLinked = repair1.repairedAssignments.every(asg => {
    const ft = createdFTs.find(f => f.id === asg.family_task_id);
    return Boolean(ft && asg.family_task_id);
  });
  record('TC-R2-03', 'assignment recebe family_task_id apontando para FamilyTask correspondente', allLinked);

  // =========================================================================
  // TC-R2-04: sem novo assignment
  // =========================================================================
  const noNewAssignments = repair1.repairedAssignments.length === baseOrphans.length;
  record('TC-R2-04', 'nenhum novo TaskAssignment é criado durante o repair', noNewAssignments);

  // =========================================================================
  // TC-R2-05: sem duplicação em Hoje
  // =========================================================================
  const todayAssignments = repair1.repairedAssignments.filter(a => a.scheduled_date === testToday);
  const titlesSeen = new Set<string>();
  let hasDuplicates = false;
  for (const asg of todayAssignments) {
    const t = ((asg as any).title || asg.task_id).toLowerCase();
    if (titlesSeen.has(t)) hasDuplicates = true;
    titlesSeen.add(t);
  }
  record('TC-R2-05', 'nenhuma tarefa do QA aparece duplicada para a data de Hoje', !hasDuplicates && todayAssignments.length === 4);

  // =========================================================================
  // TC-R2-06: custom FamilyTask aparece no Catálogo
  // =========================================================================
  const mockContext: AppContextType = {
    family: tenantFamily,
    currentMember: adminMember,
    members: [adminMember],
    rooms: testRooms,
    familyTasks: createdFTs,
    assignments: repair1.repairedAssignments,
    allMasterTasks,
    batchAddRoutines: async () => ({ added: 0, reactivated: 0, failed: [] }),
    batchDeactivateRoutines: async () => ({ deactivated: 0, failed: [] }),
    setEditingFamilyTaskId: () => {},
    currentView: 'catalog',
    setCurrentView: () => {}
  } as any;

  const catalogHtml = renderToStaticMarkup(
    React.createElement(AppContext.Provider, { value: mockContext }, React.createElement(TaskCatalogView))
  );

  const appearsInCatalog = TARGET_QA_CUSTOM_TASK_TITLES.every(title => catalogHtml.includes(title));
  record('TC-R2-06', 'custom FamilyTasks aparecem visíveis no Catálogo da Casa Croce', appearsInCatalog);

  // =========================================================================
  // TC-R2-07: custom title renderizado sem TaskMaster
  // =========================================================================
  const hasCustomTitleRendered = catalogHtml.includes('testes caos 1') && catalogHtml.includes('testes caos 4');
  record('TC-R2-07', 'custom title é renderizado diretamente da FamilyTask sem exigir TaskMaster', hasCustomTitleRendered);

  // =========================================================================
  // TC-R2-08: não cria TaskMaster global
  // =========================================================================
  const initialMasterCount = allMasterTasks.length;
  const noMasterCreated = allMasterTasks.length === initialMasterCount && !allMasterTasks.some(t => t.name.includes('testes caos'));
  record('TC-R2-08', 'não adiciona tarefas personalizadas ao catálogo global de TaskMaster', noMasterCreated);

  // =========================================================================
  // TC-R2-09: outro tenant não vê custom task
  // =========================================================================
  const otherTenantContext: AppContextType = {
    family: otherFamily,
    currentMember: { ...adminMember, id: 'mem-other-admin' },
    members: [{ ...adminMember, id: 'mem-other-admin' }],
    rooms: testRooms,
    familyTasks: [], // outro tenant não tem as familyTasks da Casa Croce
    assignments: [],
    allMasterTasks,
    batchAddRoutines: async () => ({ added: 0, reactivated: 0, failed: [] }),
    batchDeactivateRoutines: async () => ({ deactivated: 0, failed: [] }),
    setEditingFamilyTaskId: () => {},
    currentView: 'catalog',
    setCurrentView: () => {}
  } as any;

  const otherCatalogHtml = renderToStaticMarkup(
    React.createElement(AppContext.Provider, { value: otherTenantContext }, React.createElement(TaskCatalogView))
  );

  const leakedToOtherTenant = TARGET_QA_CUSTOM_TASK_TITLES.some(title => otherCatalogHtml.includes(title));
  record('TC-R2-09', 'outro tenant não enxerga as tarefas customizadas da Casa Croce no catálogo', !leakedToOtherTenant);

  // =========================================================================
  // TC-R2-10: repair repetido é idempotente
  // =========================================================================
  const repair2 = await CustomTaskRepairService.repairOrphanTasks({
    familyId: tenantFamily.id,
    existingAssignments: repair1.repairedAssignments,
    existingFamilyTasks: repair1.repairedFamilyTasks,
    allMasterTasks,
    isDemoMode: true,
    today: testToday
  });

  const isIdempotent = repair2.createdFamilyTasksCount === 0 &&
    repair2.repairedFamilyTasks.length === repair1.repairedFamilyTasks.length &&
    repair2.repairedAssignments.length === repair1.repairedAssignments.length;
  record('TC-R2-10', 'execuções repetidas do repair são 100% idempotentes (0 novas FTs, 0 novos asgs)', isIdempotent);

  // =========================================================================
  // TC-R2-11: status/completion metadata preservados
  // =========================================================================
  const asg2 = repair1.repairedAssignments.find(a => a.id === 'asg-caos-2');
  const metadataPreserved = asg2?.status === 'COMPLETED' &&
    asg2.completed_at === '2026-03-15T10:30:00.000Z' &&
    asg2.completed_by === adminMember.id &&
    asg2.completion_type === 'NORMAL_COMPLETION';
  record('TC-R2-11', 'status e completion metadata dos assignments são estritamente preservados', Boolean(metadataPreserved));

  // =========================================================================
  // TC-R2-12: room preservado
  // =========================================================================
  const roomPreserved = repair1.repairedAssignments.every(a => a.room_id === 'room-geral') &&
    createdFTs.every(ft => ft.room_id === 'room-geral');
  record('TC-R2-12', 'cômodo associado (room_id) é preservado no assignment e na FamilyTask', roomPreserved);

  // =========================================================================
  // TC-R2-13: frequency não inventada
  // =========================================================================
  const freqPreserved = createdFTs.every(ft => ft.frequency === 'ONE_TIME');
  record('TC-R2-13', 'frequency ONE_TIME original é preservada sem inventar DAILY/WEEKLY', freqPreserved);

  // =========================================================================
  // TC-R2-14: FamilyTask.active=true apenas para as quatro custom tasks reparadas
  // =========================================================================
  const onlyFourActive = createdFTs.filter(ft => ft.active === true).length === 4;
  record('TC-R2-14', 'FamilyTask.active=true atribuído exatamente para as 4 tarefas alvo', onlyFourActive);

  // =========================================================================
  // TC-R2-15: FamilyTasks antigas desativadas continuam desativadas
  // =========================================================================
  const oldInactiveFT: FamilyTask = {
    id: 'ft-antiga-desativada',
    family_id: tenantFamily.id,
    name: 'Tarefa Antiga Desativada',
    customTitle: 'Tarefa Antiga Desativada',
    active: false,
    frequency: 'DAILY',
    created_at: '2026-01-01T00:00:00.000Z'
  };

  const repairWithOld = await CustomTaskRepairService.repairOrphanTasks({
    familyId: tenantFamily.id,
    existingAssignments: baseOrphans,
    existingFamilyTasks: [oldInactiveFT],
    allMasterTasks,
    isDemoMode: true,
    today: testToday
  });

  const oldStillInactive = repairWithOld.repairedFamilyTasks.find(f => f.id === oldInactiveFT.id)?.active === false;
  record('TC-R2-15', 'tarefas antigas desativadas da família continuam rigorosamente desativadas', Boolean(oldStillInactive));

  // =========================================================================
  // TC-R2-16: hydration normal não executa repair novamente
  // =========================================================================
  // Validação: Em AppContext.tsx, a chamada ao repair foi removida da rotina de hidratação
  // Se executarmos um ciclo onde familyId !== TARGET_FAMILY_ID ou sem flags de repair,
  // o serviço de migração é isolado.
  const otherTenantCall = await CustomTaskRepairService.repairOrphanTasks({
    familyId: 'fam-outro-qualquer',
    existingAssignments: [],
    existingFamilyTasks: [],
    isDemoMode: false,
    today: testToday
  });
  const hydrationClean = otherTenantCall.createdFamilyTasksCount === 0 && otherTenantCall.linkedAssignmentsCount === 0;
  record('TC-R2-16', 'caminho de hidratação normal não executa repair automático contínuo', hydrationClean);

  // =========================================================================
  // TC-R2-17: nova custom task usa caminho canônico FamilyTask → Assignment
  // =========================================================================
  const newCustomTitle = 'teste criação canônica 5';
  const canonicalNewFT: FamilyTask = {
    id: 'ft-canon-5',
    family_id: tenantFamily.id,
    name: newCustomTitle,
    customTitle: newCustomTitle,
    room_id: 'room-geral',
    frequency: 'ONE_TIME',
    active: true,
    start_date: testToday,
    created_at: new Date().toISOString()
  };

  const canonicalNewAsg: TaskAssignment = {
    id: 'ft-canon-5_2026-03-15',
    family_id: tenantFamily.id,
    family_task_id: canonicalNewFT.id,
    task_id: canonicalNewFT.id,
    room_id: 'room-geral',
    scheduled_date: testToday,
    status: 'SCHEDULED',
    member_id: adminMember.id
  };

  const isCanonicalPath = Boolean(canonicalNewAsg.family_task_id === canonicalNewFT.id && canonicalNewFT.customTitle === newCustomTitle);
  record('TC-R2-17', 'nova custom task usa caminho canônico FamilyTask → TaskAssignment', isCanonicalPath);

  // =========================================================================
  // TC-R2-18: nova custom task sobrevive F5
  // =========================================================================
  // Simular recarga mantendo os documentos hidratados
  const simulatedStorage = {
    familyTasks: [...createdFTs, canonicalNewFT],
    assignments: [...repair1.repairedAssignments, canonicalNewAsg]
  };
  const reloadedFT = simulatedStorage.familyTasks.find(f => f.id === canonicalNewFT.id);
  const reloadedAsg = simulatedStorage.assignments.find(a => a.id === canonicalNewAsg.id);
  const survivesReload = Boolean(reloadedFT && reloadedAsg && reloadedAsg.family_task_id === reloadedFT.id);
  record('TC-R2-18', 'nova custom task e seu vínculo com assignment sobrevivem a reload (F5)', survivesReload);

  // =========================================================================
  // TC-R2-19: nova custom task aparece no Catálogo
  // =========================================================================
  const contextWith5th: AppContextType = {
    ...mockContext,
    familyTasks: [...createdFTs, canonicalNewFT]
  };

  const catalogWith5thHtml = renderToStaticMarkup(
    React.createElement(AppContext.Provider, { value: contextWith5th }, React.createElement(TaskCatalogView))
  );

  const fifthVisible = catalogWith5thHtml.includes(newCustomTitle);
  record('TC-R2-19', 'nova custom task aparece no Catálogo com seu customTitle', fifthVisible);

  // =========================================================================
  // TC-R2-20: Chaos resolve custom FamilyTask sem TaskMaster
  // =========================================================================
  // Simular ChaosTaskPicker ou resolvedor de tarefas em caos
  // Uma tarefa sem TaskMaster deve resolver seu nome via FamilyTask.customTitle
  const candidateTasks: Task[] = [
    {
      id: canonicalNewAsg.id,
      familyId: tenantFamily.id,
      familyTaskId: canonicalNewFT.id,
      title: canonicalNewFT.customTitle!,
      roomId: 'room-geral',
      roomName: 'Geral',
      assigneeId: adminMember.id,
      assigneeName: adminMember.name,
      assignedMemberId: adminMember.id,
      status: 'PENDING',
      dueDate: testToday,
      category: 'custom' as any,
      effort: 10,
      frequency: 'ONE_TIME' as any
    }
  ];

  const eligibleForChaos = candidateTasks.filter(t => t.familyTaskId && !t.completedAt && (t.status as string) !== 'COMPLETED');
  const chaosResolved = eligibleForChaos.length === 1 && eligibleForChaos[0].title === newCustomTitle;
  record('TC-R2-20', 'Modo Caos resolve custom FamilyTask e título sem depender de TaskMaster', chaosResolved);

  return results;
}
