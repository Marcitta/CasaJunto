import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TodayView } from '../components/TodayView';
import { AppContext, AppContextType } from '../context/AppContext';
import { Task, Member, Family, Room } from '../types';
import { getFamilyLocalDate, addDaysToDate } from '../domain/utils/dateTimeUtils';
import { TaskCompletionService } from '../application/services/TaskCompletionService';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

const mockFamily: Family = {
  id: 'fam-hf1-real',
  name: 'Família Oliveira',
  timezone: 'America/Sao_Paulo',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

const adminMarina: Member = {
  id: 'mem-admin-marina',
  familyId: 'fam-hf1-real',
  userId: 'uid-admin-marina',
  name: 'Marina',
  role: 'ADMIN',
  avatar: '👩',
  color: '#8c52ff'
};

const memberLucas: Member = {
  id: 'mem-member-lucas',
  familyId: 'fam-hf1-real',
  userId: 'uid-member-lucas',
  name: 'Lucas',
  role: 'MEMBER',
  avatar: '👦',
  color: '#52c41a'
};

const memberClara: Member = {
  id: 'mem-member-clara',
  familyId: 'fam-hf1-real',
  userId: 'uid-member-clara',
  name: 'Clara',
  role: 'MEMBER',
  avatar: '👧',
  color: '#fa8c16'
};

const mockRooms: Room[] = [
  { id: 'room-cozinha', name: 'Cozinha' },
  { id: 'room-quarto', name: 'Quarto' },
  { id: 'room-banheiro', name: 'Banheiro' }
];

function createMockContext(overrides: Partial<AppContextType> = {}): AppContextType {
  return {
    currentView: 'today',
    setCurrentView: () => {},
    selectedDate: '2026-09-10',
    setSelectedDate: () => {},
    family: mockFamily,
    members: [adminMarina, memberLucas, memberClara],
    activeMembers: [adminMarina, memberLucas, memberClara],
    getActiveMembers: (list) => list ? list.filter(m => m.active !== false) : [adminMarina, memberLucas, memberClara],
    rooms: mockRooms,
    tasks: [],
    protectedTimes: [],
    isDemoMode: false,
    isOnboarding: false,
    setIsOnboarding: () => {},
    isDevSimulatorOpen: false,
    openDevSimulator: () => {},
    closeDevSimulator: () => {},
    isAuthModalOpen: false,
    openAuthModal: () => {},
    closeAuthModal: () => {},
    isCreateFamilyModalOpen: false,
    openCreateFamilyModal: () => {},
    closeCreateFamilyModal: () => {},
    isFamilySelectorOpen: false,
    openFamilySelector: () => {},
    closeFamilySelector: () => {},
    isMemberProfileModalOpen: false,
    activeMemberForProfile: null,
    openMemberProfile: () => {},
    closeMemberProfile: () => {},
    updateMemberProfile: async () => {},
    loadProtectedTimes: async () => {},
    addProtectedTime: async () => {},
    updateProtectedTime: async () => {},
    deleteProtectedTime: async () => {},
    loadRealRooms: async () => {},
    addRoom: async () => ({} as Room),
    updateRoom: async () => {},
    deactivateRoom: async () => {},
    reactivateRoom: async () => {},
    cloudSyncStatus: 'synced',
    addTask: () => {},
    completeTask: async () => true,
    deleteTask: () => {},
    updateTask: () => {},
    addMember: () => {},
    updateMemberRole: () => {},
    removeMember: () => {},
    loadDemoFamily: () => {},
    currentMember: adminMarina,
    activeTaskForExecution: null,
    setActiveTaskForExecution: () => {},
    activeTaskForInspect: null,
    setActiveTaskForInspect: () => {},
    activeTaskForReschedule: null,
    setActiveTaskForReschedule: () => {},
    isBlitzModalOpen: false,
    setIsBlitzModalOpen: () => {},
    isRebalanceModalOpen: false,
    setIsRebalanceModalOpen: () => {},
    rebalanceTasksWithEngine: async () => ({
      success: true,
      proposedAssignments: [],
      changesCount: 0,
      message: 'OK'
    }),
    familyTasks: [],
    syncRollingRoutines: async () => {},
    addRoutine: async () => ({} as any),
    updateRoutine: async () => {},
    deactivateRoutine: async () => {},
    reactivateRoutine: async () => {},
    batchAddRoutines: async () => ({ added: 0, reactivated: 0, skipped: 0, failed: [] }),
    batchDeactivateRoutines: async () => ({ deactivated: 0, failed: [] }),
    applyRebalanceUpdates: async () => {},
    assignTaskManually: async () => ({ success: true }),
    ...overrides
  };
}

function renderTodayViewWithContext(
  contextValue: AppContextType,
  targetDate?: string,
  initialFilter?: 'mine' | 'all' | 'available'
): string {
  return renderToStaticMarkup(
    React.createElement(
      AppContext.Provider,
      { value: contextValue },
      React.createElement(TodayView, { targetDate, initialFilter })
    )
  );
}

export function runTodayViewScopeTestSuite(): TestResult[] {
  const results: TestResult[] = [];
  const TODAY = '2026-09-10';
  const TOMORROW = '2026-09-11';
  const YESTERDAY = '2026-09-09';

  // Helper para criar tarefa
  const makeTask = (id: string, title: string, dueDate: string, status: Task['status'] = 'PENDING', memberId: string = 'mem-member-lucas'): Task => ({
    id,
    familyId: 'fam-hf1-real',
    title,
    roomId: 'room-cozinha',
    frequency: 'DAILY',
    effort: 10,
    status,
    dueDate,
    scheduledDate: dueDate,
    assignedMemberId: memberId,
    assigneeId: memberId,
    isUnassigned: !memberId,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z'
  });

  // TV01: TodayView displays today's SCHEDULED task.
  {
    const todayTask = makeTask('task-today-1', 'Lavar Louça do Almoço', TODAY, 'PENDING', 'mem-member-lucas');
    const ctx = createMockContext({ tasks: [todayTask], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const passed = html.includes('Lavar Louça do Almoço') &&
      html.includes('id="today-task-task-today-1"') &&
      html.includes('id="today-pending-count"') &&
      html.includes('>1</span>');

    results.push({
      id: 'TV01',
      name: 'TodayView displays today SCHEDULED task',
      passed,
      expected: 'Tarefa de hoje visível na lista de pendentes e contador = 1',
      actual: passed ? 'Renderizada com sucesso com contador 1' : 'Tarefa de hoje não encontrada'
    });
  }

  // TV02: Tomorrow task is NOT shown in Today.
  {
    const todayTask = makeTask('task-today-1', 'Lavar Louça de Hoje', TODAY, 'PENDING');
    const tomorrowTask = makeTask('task-tomorrow-1', 'Regar Plantas de Amanhã', TOMORROW, 'PENDING');
    const ctx = createMockContext({ tasks: [todayTask, tomorrowTask], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const passed = html.includes('Lavar Louça de Hoje') &&
      !html.includes('Regar Plantas de Amanhã') &&
      !html.includes('task-tomorrow-1');

    results.push({
      id: 'TV02',
      name: 'Tomorrow task is NOT shown in Today',
      passed,
      expected: 'Tarefa de amanhã estritamente excluída de Today',
      actual: passed ? 'Tarefa de amanhã não exibida na tela de hoje' : 'Falha: tarefa de amanhã exibida'
    });
  }

  // TV03: D2–D14 tasks are NOT shown in Today.
  {
    const allTasks: Task[] = [
      makeTask('task-d0', 'Tarefa de Hoje D0', TODAY, 'PENDING')
    ];
    // Adiciona tarefas de D1 a D14 (14 dias além de hoje)
    for (let i = 1; i <= 14; i++) {
      const dStr = addDaysToDate(TODAY, i);
      allTasks.push(makeTask(`task-future-${i}`, `Tarefa Futura Dia +${i}`, dStr, 'PENDING'));
    }

    const ctx = createMockContext({ tasks: allTasks, selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const hasAnyFuture = allTasks.slice(1).some(t => html.includes(t.title) || html.includes(t.id));
    const passed = html.includes('Tarefa de Hoje D0') && !hasAnyFuture;

    results.push({
      id: 'TV03',
      name: 'D2–D14 tasks are NOT shown in Today',
      passed,
      expected: 'Nenhuma das 14 tarefas futuras de D1-D14 aparece em Today',
      actual: passed ? '0 tarefas futuras renderizadas em Today' : 'Falha: tarefas futuras vazaram para Today'
    });
  }

  // TV04: Yesterday task is NOT shown in Today pending list.
  {
    const yesterdayTask = makeTask('task-yesterday-1', 'Varrer Chão Ontem', YESTERDAY, 'PENDING');
    const todayTask = makeTask('task-today-1', 'Varrer Chão Hoje', TODAY, 'PENDING');
    const ctx = createMockContext({ tasks: [yesterdayTask, todayTask], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const passed = html.includes('Varrer Chão Hoje') &&
      !html.includes('Varrer Chão Ontem') &&
      !html.includes('task-yesterday-1');

    results.push({
      id: 'TV04',
      name: 'Yesterday task is NOT shown in Today pending list',
      passed,
      expected: 'Tarefa de ontem não aparece nas pendências de hoje',
      actual: passed ? 'Tarefa de ontem excluída' : 'Falha: tarefa de ontem visível'
    });
  }

  // TV05: Today's COMPLETED task is not shown as pending.
  {
    const completedToday = makeTask('task-comp-today', 'Tirar Lixo', TODAY, 'DONE');
    const pendingToday = makeTask('task-pend-today', 'Passar Aspirador', TODAY, 'PENDING');
    const ctx = createMockContext({ tasks: [completedToday, pendingToday], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    // Deve estar no pending list apenas a pendingToday
    const pendingSectionHtml = html.split('id="today-completed-section"')[0];
    const passed = pendingSectionHtml.includes('Passar Aspirador') &&
      !pendingSectionHtml.includes('Tirar Lixo');

    results.push({
      id: 'TV05',
      name: 'Today COMPLETED task is not shown as pending',
      passed,
      expected: 'Tarefa concluída de hoje não aparece na lista de pendentes',
      actual: passed ? 'Excluída da seção de pendentes' : 'Falha: tarefa concluída presente em pendentes'
    });
  }

  // TV06: Today's completed section contains only today's completed tasks.
  {
    const completedToday = makeTask('task-comp-today', 'Tirar Lixo', TODAY, 'DONE');
    const completedYesterday = makeTask('task-comp-yest', 'Arrumar Cama Ontem', YESTERDAY, 'DONE');
    const ctx = createMockContext({ tasks: [completedToday, completedYesterday], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const passed = html.includes('Tirar Lixo') &&
      !html.includes('Arrumar Cama Ontem') &&
      html.includes('id="today-completed-count"') &&
      html.includes('>1</span>');

    results.push({
      id: 'TV06',
      name: 'Today completed section contains only today completed tasks',
      passed,
      expected: 'Apenas a tarefa concluída de hoje na seção concluídas',
      actual: passed ? 'Apenas concluída de hoje exibida (contador 1)' : 'Falha no filtro de concluídas'
    });
  }

  // TV07: Future COMPLETED task does not appear in today's completed section.
  {
    const completedFuture = makeTask('task-comp-future', 'Adiantada Para Semana Que Vem', TOMORROW, 'DONE');
    const ctx = createMockContext({ tasks: [completedFuture], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const passed = !html.includes('Adiantada Para Semana Que Vem') &&
      !html.includes('id="today-completed-section"');

    results.push({
      id: 'TV07',
      name: 'Future COMPLETED task does not appear in today completed section',
      passed,
      expected: 'Tarefa concluída de data futura não aparece em concluídas de hoje',
      actual: passed ? 'Seção de concluídas oculta / tarefa futura ausente' : 'Falha: concluída futura exibida'
    });
  }

  // TV08: CANCELLED future occurrence not shown.
  {
    const cancelledFuture = makeTask('task-cancelled-future', 'Tarefa Cancelada Amanhã', TOMORROW, 'CANCELLED');
    const cancelledToday = makeTask('task-cancelled-today', 'Tarefa Cancelada Hoje', TODAY, 'CANCELLED');
    const ctx = createMockContext({ tasks: [cancelledFuture, cancelledToday], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const passed = !html.includes('Tarefa Cancelada Amanhã') &&
      !html.includes('Tarefa Cancelada Hoje') &&
      html.includes('Tudo concluído por hoje!');

    results.push({
      id: 'TV08',
      name: 'CANCELLED future occurrence not shown',
      passed,
      expected: 'Tarefas canceladas não aparecem em pendentes nem concluídas',
      actual: passed ? 'Ocorrências canceladas devidamente ignoradas' : 'Falha: cancelada renderizada'
    });
  }

  // TV09: IN_PROGRESS today's task follows existing canonical Today behavior.
  {
    const inProgressTask = makeTask('task-in-prog', 'Limpando o Fogão', TODAY, 'IN_PROGRESS');
    const ctx = createMockContext({ tasks: [inProgressTask], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const passed = html.includes('Limpando o Fogão') &&
      html.includes('id="today-task-task-in-prog"') &&
      html.includes('>1</span>');

    results.push({
      id: 'TV09',
      name: 'IN_PROGRESS today task follows existing canonical Today behavior',
      passed,
      expected: 'Tarefa IN_PROGRESS de hoje tratada como pendente acionável',
      actual: passed ? 'Renderizada em pendentes de hoje' : 'Falha: IN_PROGRESS não exibida'
    });
  }

  // TV10: family-local date is used at UTC boundary.
  {
    // Simula fronteira UTC: 01:30 UTC do dia 11 de Setembro = 22:30 BRT do dia 10 de Setembro
    const utcDateBoundary = new Date('2026-09-11T01:30:00Z');
    const localDateCalculated = getFamilyLocalDate('America/Sao_Paulo', utcDateBoundary);
    
    // localDateCalculated deve ser 2026-09-10
    const taskSept10 = makeTask('task-sept10', 'Tarefa da Noite de 10/09', '2026-09-10', 'PENDING');
    const taskSept11 = makeTask('task-sept11', 'Tarefa da Manhã de 11/09', '2026-09-11', 'PENDING');

    const ctx = createMockContext({
      family: { ...mockFamily, timezone: 'America/Sao_Paulo' },
      tasks: [taskSept10, taskSept11],
      selectedDate: localDateCalculated
    });
    const html = renderTodayViewWithContext(ctx, localDateCalculated);

    const passed = localDateCalculated === '2026-09-10' &&
      html.includes('Tarefa da Noite de 10/09') &&
      !html.includes('Tarefa da Manhã de 11/09');

    results.push({
      id: 'TV10',
      name: 'family-local date is used at UTC boundary',
      passed,
      expected: 'Data local America/Sao_Paulo (2026-09-10) usada na fronteira UTC',
      actual: passed ? `Corretamente escopado para ${localDateCalculated}` : `Falha: ${localDateCalculated}`
    });
  }

  // TV11: F5 leaves Today filtering correct.
  {
    const todayTask = makeTask('task-f5-today', 'Tarefa Pós-Recarregamento', TODAY, 'PENDING');
    const futureTask = makeTask('task-f5-fut', 'Tarefa Futura Pós-F5', TOMORROW, 'PENDING');
    
    // Estado inicial
    const ctx1 = createMockContext({ tasks: [todayTask, futureTask], selectedDate: TODAY });
    const html1 = renderTodayViewWithContext(ctx1);

    // Simula reload (reidratação de novo array idêntico)
    const rehydratedTasks: Task[] = JSON.parse(JSON.stringify([todayTask, futureTask]));
    const ctx2 = createMockContext({ tasks: rehydratedTasks, selectedDate: TODAY });
    const html2 = renderTodayViewWithContext(ctx2);

    const passed = html1 === html2 &&
      html2.includes('Tarefa Pós-Recarregamento') &&
      !html2.includes('Tarefa Futura Pós-F5');

    results.push({
      id: 'TV11',
      name: 'F5 leaves Today filtering correct',
      passed,
      expected: 'Marcação HTML e contagem idênticas após reload (idempotência de visualização)',
      actual: passed ? 'Marcação idêntica confirmada' : 'Falha na idoneidade pós-reload'
    });
  }

  // TV12: 15-day occurrence dataset remains intact after UI rendering.
  {
    const dataset: Task[] = [];
    for (let i = 0; i < 15; i++) {
      const d = addDaysToDate(TODAY, i);
      dataset.push(makeTask(`t-ds-${i}`, `Tarefa Dia +${i}`, d, 'PENDING'));
    }
    const originalLength = dataset.length;
    const ctx = createMockContext({ tasks: dataset, selectedDate: TODAY });

    renderTodayViewWithContext(ctx);

    const passed = dataset.length === originalLength &&
      dataset.filter(t => t.dueDate > TODAY).length === 14;

    results.push({
      id: 'TV12',
      name: '15-day occurrence dataset remains intact after UI rendering',
      passed,
      expected: 'Dataset de 15 dias permanece 100% íntegro sem mutação/remoção no estado',
      actual: passed ? `${dataset.length} tarefas preservadas intactas` : 'Falha: tarefas mutadas'
    });
  }

  // TV13: Member authorization still works after filtering.
  {
    const taskLucas = makeTask('t-own', 'Minha Tarefa (Lucas)', TODAY, 'PENDING', 'mem-member-lucas');
    const taskClara = makeTask('t-other', 'Tarefa da Clara', TODAY, 'PENDING', 'mem-member-clara');
    
    // Caller é Lucas (MEMBER)
    const ctx = createMockContext({
      currentMember: memberLucas,
      tasks: [taskLucas, taskClara],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithContext(ctx);

    const hasCompleteBtnOwn = html.includes('id="complete-btn-t-own"');
    const notHasOtherTask = !html.includes('id="today-task-t-other"');
    const passed = hasCompleteBtnOwn && notHasOtherTask;

    results.push({
      id: 'TV13',
      name: 'Member authorization still works after filtering',
      passed,
      expected: 'Própria tarefa habilitada, tarefa de outro morador oculta',
      actual: passed ? 'Botão próprio ativo e tarefa de terceiro oculta' : 'Falha nas regras de RBAC'
    });
  }

  // TV14: SELF_CLAIMED still works.
  {
    const unassignedTask = makeTask('t-unassigned', 'Tarefa Voluntária na Sala', TODAY, 'PENDING', '');
    unassignedTask.isUnassigned = true;
    unassignedTask.assignedMemberId = '';

    const ctx = createMockContext({
      currentMember: memberLucas,
      tasks: [unassignedTask],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithContext(ctx, undefined, 'available');

    // Botão de assumir/concluir deve estar ativo
    const hasCompleteBtn = html.includes('id="complete-btn-t-unassigned"');

    // Validação funcional do serviço
    const auth = TaskCompletionService.authorizeCompletion({
      task: unassignedTask,
      callerMember: memberLucas
    });

    const passed = hasCompleteBtn && auth.allowed && auth.completionType === 'SELF_CLAIMED';

    results.push({
      id: 'TV14',
      name: 'SELF_CLAIMED still works',
      passed,
      expected: 'Tarefa desatribuída permite conclusão e gera SELF_CLAIMED para o morador',
      actual: passed ? 'Botão ativo e conclusão autorizada como SELF_CLAIMED' : 'Falha em self-claim'
    });
  }

  // TV15: ADMIN_INTERVENTION still works.
  {
    const taskLucas = makeTask('t-lucas-adm', 'Tarefa do Lucas', TODAY, 'PENDING', 'mem-member-lucas');
    
    // Caller é Marina (ADMIN)
    const ctx = createMockContext({
      currentMember: adminMarina,
      tasks: [taskLucas],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithContext(ctx);

    const hasCompleteBtn = html.includes('id="complete-btn-t-lucas-adm"');

    const auth = TaskCompletionService.authorizeCompletion({
      task: taskLucas,
      callerMember: adminMarina
    });

    const passed = hasCompleteBtn && auth.allowed && auth.completionType === 'ADMIN_INTERVENTION';

    results.push({
      id: 'TV15',
      name: 'ADMIN_INTERVENTION still works',
      passed,
      expected: 'Admin pode concluir tarefa de morador gerando ADMIN_INTERVENTION',
      actual: passed ? 'Botão ativo e conclusão autorizada como ADMIN_INTERVENTION' : 'Falha na intervenção de admin'
    });
  }

  // TV16: "Tudo concluído" appears only when today's actionable tasks are exhausted.
  {
    const doneToday = makeTask('t-done-1', 'Tarefa Pronta', TODAY, 'DONE');
    const futurePending = makeTask('t-fut-1', 'Tarefa de Amanhã', TOMORROW, 'PENDING');
    
    const ctx = createMockContext({ tasks: [doneToday, futurePending], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const passed = html.includes('Tudo concluído por hoje!') &&
      !html.includes('id="today-pending-list"') &&
      html.includes('id="today-completed-section"');

    results.push({
      id: 'TV16',
      name: 'Tudo concluído appears only when today actionable tasks are exhausted',
      passed,
      expected: 'Mensagem de tudo concluído exibida mesmo com tarefas futuras no horizonte',
      actual: passed ? 'Tudo concluído exibido com sucesso' : 'Falha: tarefas futuras impediram tudo concluído'
    });
  }

  // TV17: Today's tasks existing prevents false "Tudo concluído".
  {
    const pendingToday = makeTask('t-pend-1', 'Tarefa Ainda Pendente', TODAY, 'PENDING');
    const ctx = createMockContext({ tasks: [pendingToday], selectedDate: TODAY });
    const html = renderTodayViewWithContext(ctx);

    const passed = !html.includes('Tudo concluído por hoje!') &&
      html.includes('id="today-pending-list"') &&
      html.includes('Tarefa Ainda Pendente');

    results.push({
      id: 'TV17',
      name: 'Today tasks existing prevents false Tudo concluído',
      passed,
      expected: 'Existência de pendência de hoje impede falso "Tudo concluído"',
      actual: passed ? 'Lista de pendências exibida corretamente' : 'Falha: falso positivo de tudo concluído'
    });
  }

  return results;
}
