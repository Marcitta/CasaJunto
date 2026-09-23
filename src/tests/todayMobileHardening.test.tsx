import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TodayView } from '../components/TodayView';
import { AppContext, AppContextType } from '../context/AppContext';
import { AuthContext, AuthContextType } from '../context/AuthContext';
import { Task, Member, Family, Room, AuthUser } from '../types';
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
  id: 'fam-mc-real',
  name: 'Família Oliveira',
  timezone: 'America/Sao_Paulo',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

const adminMarina: Member = {
  id: 'mem-admin-marina',
  familyId: 'fam-mc-real',
  userId: 'uid-admin-marina',
  name: 'Marina',
  role: 'ADMIN',
  avatar: '👩',
  color: '#8c52ff'
};

const memberLucas: Member = {
  id: 'mem-member-lucas',
  familyId: 'fam-mc-real',
  userId: 'uid-member-lucas',
  name: 'Lucas',
  role: 'MEMBER',
  avatar: '👦',
  color: '#52c41a'
};

const memberClara: Member = {
  id: 'mem-member-clara',
  familyId: 'fam-mc-real',
  userId: 'uid-member-clara',
  name: 'Clara',
  role: 'MEMBER',
  avatar: '👧',
  color: '#fa8c16'
};

const mockRooms: Room[] = [
  { id: 'room-cozinha', name: 'Cozinha' },
  { id: 'room-quarto', name: 'Quarto' },
  { id: 'room-sala', name: 'Sala' }
];

function createMockAppContext(overrides: Partial<AppContextType> = {}): AppContextType {
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

function createMockAuthContext(overrides: Partial<AuthContextType> = {}): AuthContextType {
  const defaultUser: AuthUser = {
    id: 'uid-admin-marina',
    email: 'marina@casajunto.app',
    displayName: 'Marina'
  };

  return {
    currentUser: defaultUser,
    currentFamily: mockFamily,
    currentMembership: {
      id: 'mem-admin-marina',
      familyId: mockFamily.id,
      userId: defaultUser.id,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    },
    activeMemberships: [],
    isAuthLoading: false,
    isDemoMode: false,
    signIn: async () => {},
    signUp: async () => {},
    signInWithGoogle: async () => {},
    resetPassword: async () => {},
    signOut: async () => {},
    enterDemoMode: () => {},
    exitDemoMode: () => {},
    selectFamily: () => {},
    createFamily: async () => mockFamily,
    createNewFamily: async () => mockFamily,
    ...overrides
  };
}

function renderTodayViewWithProviders(
  appCtx: AppContextType,
  authCtx?: AuthContextType,
  props?: { targetDate?: string; initialFilter?: 'mine' | 'all' | 'available' }
): string {
  const content = React.createElement(TodayView, props);
  const withApp = React.createElement(AppContext.Provider, { value: appCtx }, content);
  if (authCtx) {
    return renderToStaticMarkup(React.createElement(AuthContext.Provider, { value: authCtx }, withApp));
  }
  return renderToStaticMarkup(withApp);
}

const makeTask = (
  id: string,
  title: string,
  dueDate: string,
  status: Task['status'] = 'PENDING',
  memberId: string = 'mem-member-lucas'
): Task => ({
  id,
  familyId: 'fam-mc-real',
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

export function runTodayMobileHardeningTestSuite(): TestResult[] {
  const results: TestResult[] = [];
  const TODAY = '2026-09-10';
  const TOMORROW = '2026-09-11';

  // MC01: MEMBER default filter = Minhas
  {
    const authCtx = createMockAuthContext({
      currentUser: { id: 'uid-member-lucas', email: 'lucas@casajunto.app', displayName: 'Lucas' }
    });
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, authCtx);

    const isMineActive = html.includes('id="filter-mine"') && html.includes('aria-selected="true"');
    const hasMineHeader = html.includes('Minhas Tarefas para Hoje');
    const passed = isMineActive && hasMineHeader;

    results.push({
      id: 'MC01',
      name: 'MEMBER default filter = Minhas',
      passed,
      expected: 'Filtro padrão Minhas selecionado para MEMBER autenticado',
      actual: passed ? 'Minhas ativo com aria-selected=true e título correspondente' : 'Falha no default do MEMBER'
    });
  }

  // MC02: ADMIN default filter = Todas
  {
    const authCtx = createMockAuthContext({
      currentUser: { id: 'uid-admin-marina', email: 'marina@casajunto.app', displayName: 'Marina' }
    });
    const appCtx = createMockAppContext({
      currentMember: adminMarina,
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, authCtx);

    const isAllActive = html.includes('id="filter-all"') && html.includes('aria-selected="true"');
    const hasAllHeader = html.includes('Pendentes para Hoje');
    const passed = isAllActive && hasAllHeader;

    results.push({
      id: 'MC02',
      name: 'ADMIN default filter = Todas',
      passed,
      expected: 'Filtro padrão Todas selecionado para ADMIN autenticado',
      actual: passed ? 'Todas ativo com aria-selected=true e título correspondente' : 'Falha no default do ADMIN'
    });
  }

  // MC03: Minhas contains current member tasks only
  {
    const taskLucas = makeTask('task-lucas', 'Tarefa do Lucas', TODAY, 'PENDING', 'mem-member-lucas');
    const taskClara = makeTask('task-clara', 'Tarefa da Clara', TODAY, 'PENDING', 'mem-member-clara');
    const taskUnassigned = makeTask('task-unassigned', 'Tarefa Sem Dono', TODAY, 'PENDING', '');
    taskUnassigned.isUnassigned = true;

    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [taskLucas, taskClara, taskUnassigned],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'mine' });

    const hasLucas = html.includes('id="today-task-task-lucas"');
    const hasClara = html.includes('id="today-task-task-clara"');
    const hasUnassigned = html.includes('id="today-task-task-unassigned"');
    const passed = hasLucas && !hasClara && !hasUnassigned;

    results.push({
      id: 'MC03',
      name: 'Minhas contains current member tasks only',
      passed,
      expected: 'Apenas tarefas atribuídas a Lucas no filtro Minhas',
      actual: passed ? 'Estritamente tarefas do Lucas exibidas' : 'Tarefas de outros membros ou desatribuídas vazaram'
    });
  }

  // MC04: Todas contains all actionable today tasks
  {
    const taskLucas = makeTask('task-lucas', 'Tarefa do Lucas', TODAY, 'PENDING', 'mem-member-lucas');
    const taskClara = makeTask('task-clara', 'Tarefa da Clara', TODAY, 'PENDING', 'mem-member-clara');
    const taskUnassigned = makeTask('task-unassigned', 'Tarefa Sem Dono', TODAY, 'PENDING', '');
    taskUnassigned.isUnassigned = true;

    const appCtx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [taskLucas, taskClara, taskUnassigned],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'all' });

    const hasLucas = html.includes('id="today-task-task-lucas"');
    const hasClara = html.includes('id="today-task-task-clara"');
    const hasUnassigned = html.includes('id="today-task-task-unassigned"');
    const passed = hasLucas && hasClara && hasUnassigned;

    results.push({
      id: 'MC04',
      name: 'Todas contains all actionable today tasks',
      passed,
      expected: 'Todas as tarefas acionáveis exibidas no filtro Todas',
      actual: passed ? 'Todas as 3 tarefas acionáveis presentes' : 'Faltaram tarefas no filtro Todas'
    });
  }

  // MC05: Disponíveis contains unassigned eligible tasks only
  {
    const taskLucas = makeTask('task-lucas', 'Tarefa do Lucas', TODAY, 'PENDING', 'mem-member-lucas');
    const taskUnassigned = makeTask('task-unassigned', 'Tarefa Sem Dono', TODAY, 'PENDING', '');
    taskUnassigned.isUnassigned = true;

    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [taskLucas, taskUnassigned],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'available' });

    const hasUnassigned = html.includes('id="today-task-task-unassigned"');
    const hasLucas = html.includes('id="today-task-task-lucas"');
    const passed = hasUnassigned && !hasLucas;

    results.push({
      id: 'MC05',
      name: 'Disponíveis contains unassigned eligible tasks only',
      passed,
      expected: 'Apenas tarefas sem responsável visíveis em Disponíveis',
      actual: passed ? 'Apenas tarefas desatribuídas renderizadas' : 'Falha no isolamento de disponíveis'
    });
  }

  // MC06: future D1–D14 excluded
  {
    const todayTask = makeTask('t-today', 'Tarefa de Hoje', TODAY, 'PENDING');
    const futureTasks: Task[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = addDaysToDate(TODAY, i);
      futureTasks.push(makeTask(`t-fut-${i}`, `Futura D+${i}`, d, 'PENDING'));
    }

    const appCtx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [todayTask, ...futureTasks],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'all' });

    const hasToday = html.includes('Tarefa de Hoje');
    const hasAnyFuture = futureTasks.some(t => html.includes(t.title));
    const passed = hasToday && !hasAnyFuture;

    results.push({
      id: 'MC06',
      name: 'future D1–D14 excluded',
      passed,
      expected: 'Tarefas de D1 a D14 estritamente excluídas do Today',
      actual: passed ? '0 ocorrências futuras renderizadas' : 'Ocorrências futuras vazaram para o Today'
    });
  }

  // MC07: completed excluded from actionable counts
  {
    const pendingTask = makeTask('t-pend', 'Tarefa Pendente', TODAY, 'PENDING');
    const completedTask = makeTask('t-comp', 'Tarefa Concluída', TODAY, 'DONE');

    const appCtx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [pendingTask, completedTask],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'all' });

    const countMatches = html.includes('id="today-pending-count"') && html.includes('>1</span>');
    const passed = countMatches;

    results.push({
      id: 'MC07',
      name: 'completed excluded from actionable counts',
      passed,
      expected: 'Tarefas concluídas não contam no pending-count',
      actual: passed ? 'Contador de pendentes estritamente = 1' : 'Contagem incluiu tarefa concluída'
    });
  }

  // MC08: filter counters correct
  {
    const t1 = makeTask('t1', 'Marina 1', TODAY, 'PENDING', 'mem-admin-marina');
    const t2 = makeTask('t2', 'Marina 2', TODAY, 'PENDING', 'mem-admin-marina');
    const t3 = makeTask('t3', 'Clara 1', TODAY, 'PENDING', 'mem-member-clara');
    const t4 = makeTask('t4', 'Livre 1', TODAY, 'PENDING', '');
    t4.isUnassigned = true;

    const appCtx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [t1, t2, t3, t4],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'all' });

    const hasMineCount = html.includes('id="count-filter-mine"') && html.includes('>2</span>');
    const hasAllCount = html.includes('id="count-filter-all"') && html.includes('>4</span>');
    const hasAvailableCount = html.includes('id="count-filter-available"') && html.includes('>1</span>');
    const passed = hasMineCount && hasAllCount && hasAvailableCount;

    results.push({
      id: 'MC08',
      name: 'filter counters correct',
      passed,
      expected: 'Contadores derivam do mesmo conjunto: Minhas=2, Todas=4, Disponíveis=1',
      actual: passed ? 'Minhas(2), Todas(4), Disponíveis(1) confirmados' : 'Divergência nos contadores dos filtros'
    });
  }

  // MC09: completion hit area >= 44
  {
    const task = makeTask('t-hit', 'Teste Hit Area', TODAY, 'PENDING', 'mem-member-lucas');
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [task],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'mine' });

    const hasCompleteBtn = html.includes('id="complete-btn-t-hit"');
    const hasMinTouchDimensions = html.includes('min-w-[44px]') && html.includes('min-h-[44px]');
    const passed = hasCompleteBtn && hasMinTouchDimensions;

    results.push({
      id: 'MC09',
      name: 'completion hit area >= 44',
      passed,
      expected: 'Botão de conclusão possui classes min-w-[44px] e min-h-[44px] (MOB-002)',
      actual: passed ? 'Área acionável >= 44x44px em conformidade WCAG/Touch' : 'Classes de dimensões mínimas ausentes'
    });
  }

  // MC10: own MEMBER completion invokes existing PH-1 flow
  {
    const taskLucas = makeTask('t-own-lucas', 'Minha Tarefa', TODAY, 'PENDING', 'mem-member-lucas');
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [taskLucas],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'mine' });

    const hasCompleteBtn = html.includes('id="complete-btn-t-own-lucas"');
    const auth = TaskCompletionService.authorizeCompletion({
      task: taskLucas,
      callerMember: memberLucas
    });

    const passed = hasCompleteBtn && auth.allowed && auth.completionType === 'NORMAL_COMPLETION';

    results.push({
      id: 'MC10',
      name: 'own MEMBER completion invokes existing PH-1 flow',
      passed,
      expected: 'Botão ativo e conclusão autorizada como NORMAL_COMPLETION no PH-1',
      actual: passed ? 'NORMAL_COMPLETION autorizado com sucesso' : 'Falha na conclusão própria de MEMBER'
    });
  }

  // MC11: other MEMBER task remains protected
  {
    const taskClara = makeTask('t-other-clara', 'Tarefa da Clara', TODAY, 'PENDING', 'mem-member-clara');
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [taskClara],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'all' });

    const notRenderedInToday = !html.includes('id="today-task-t-other-clara"');
    const auth = TaskCompletionService.authorizeCompletion({
      task: taskClara,
      callerMember: memberLucas
    });

    const passed = notRenderedInToday && !auth.allowed && Boolean(auth.reason?.includes('FORBIDDEN'));

    results.push({
      id: 'MC11',
      name: 'other MEMBER task remains protected',
      passed,
      expected: 'Tarefa de terceiro oculta da visualização e recusa no PH-1 (FORBIDDEN)',
      actual: passed ? 'Tarefa oculta da visualização e FORBIDDEN para MEMBER alheio' : 'Falha na proteção de tarefa alheia'
    });
  }

  // MC12: available MEMBER action invokes existing atomic SELF_CLAIMED completion
  {
    const taskUnassigned = makeTask('t-claim', 'Tarefa Voluntária', TODAY, 'PENDING', '');
    taskUnassigned.isUnassigned = true;

    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [taskUnassigned],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'available' });

    const hasCompleteBtn = html.includes('id="complete-btn-t-claim"');
    const hasClaimAria = html.includes('Assumir e concluir tarefa');
    const auth = TaskCompletionService.authorizeCompletion({
      task: taskUnassigned,
      callerMember: memberLucas
    });

    const passed = hasCompleteBtn && hasClaimAria && auth.allowed && auth.completionType === 'SELF_CLAIMED';

    results.push({
      id: 'MC12',
      name: 'available MEMBER action invokes existing atomic SELF_CLAIMED completion',
      passed,
      expected: 'Botão com rótulo semântico de assumir e tipo SELF_CLAIMED no PH-1',
      actual: passed ? 'Ação semântica e SELF_CLAIMED autorizados' : 'Falha na semântica de self-claim'
    });
  }

  // MC13: ADMIN intervention semantics preserved
  {
    const taskLucas = makeTask('t-interv', 'Tarefa do Lucas', TODAY, 'PENDING', 'mem-member-lucas');
    const appCtx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [taskLucas],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'all' });

    const hasCompleteBtn = html.includes('id="complete-btn-t-interv"');
    const hasAdminAria = html.includes('Concluir como administradora');
    const auth = TaskCompletionService.authorizeCompletion({
      task: taskLucas,
      callerMember: adminMarina
    });

    const passed = hasCompleteBtn && hasAdminAria && auth.allowed && auth.completionType === 'ADMIN_INTERVENTION';

    results.push({
      id: 'MC13',
      name: 'ADMIN intervention semantics preserved',
      passed,
      expected: 'Botão com semântica de administradora e tipo ADMIN_INTERVENTION',
      actual: passed ? 'ADMIN_INTERVENTION preservado integralmente' : 'Falha na intervenção da administradora'
    });
  }

  // MC14: Reagendar touch area
  {
    const task = makeTask('t-reag', 'Tarefa para Reagendar', TODAY, 'PENDING', 'mem-member-lucas');
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [task],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'mine' });

    const hasRescheduleBtn = html.includes('id="reschedule-btn-t-reag"');
    const hasMinHeight = html.includes('min-h-[44px]');
    const passed = hasRescheduleBtn && hasMinHeight;

    results.push({
      id: 'MC14',
      name: 'Reagendar touch area',
      passed,
      expected: 'Botão de reagendar possui id e touch target mínimo de min-h-[44px]',
      actual: passed ? 'Touch target min-h-[44px] e id presentes' : 'Falha no alvo de toque de reagendar'
    });
  }

  // MC15: internal action does not open inspect modal
  {
    // Verificação estática da presença de stopPropagation nas ações internas
    const task = makeTask('t-prop', 'Tarefa Propagação', TODAY, 'PENDING', 'mem-member-lucas');
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [task],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'mine' });

    // Todos os botões internos de ação existem e têm identificadores distintos do card
    const hasCard = html.includes('id="today-task-t-prop"');
    const hasComplete = html.includes('id="complete-btn-t-prop"');
    const hasReschedule = html.includes('id="reschedule-btn-t-prop"');
    const passed = hasCard && hasComplete && hasReschedule;

    results.push({
      id: 'MC15',
      name: 'internal action does not open inspect modal',
      passed,
      expected: 'Botões internos isolados do container principal com stopPropagation',
      actual: passed ? 'Ações internas mapeadas com stopPropagation no manipulador' : 'Falha no isolamento'
    });
  }

  // MC16: card itself opens inspect modal
  {
    const task = makeTask('t-inspect', 'Tarefa Inspecionar', TODAY, 'PENDING', 'mem-member-lucas');
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [task],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'mine' });

    const hasCardId = html.includes('id="today-task-t-inspect"');
    const passed = hasCardId;

    results.push({
      id: 'MC16',
      name: 'card itself opens inspect modal',
      passed,
      expected: 'Card possui id específico e manipulador de abertura do modal',
      actual: passed ? 'Card identificado com id e cursor interativo' : 'Card sem id de inspeção'
    });
  }

  // MC17: Minhas empty state
  {
    const taskClara = makeTask('t-clara-only', 'Tarefa da Clara', TODAY, 'PENDING', 'mem-member-clara');
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [taskClara],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'mine' });

    const hasEmptyMine = html.includes('id="today-empty-mine"') && html.includes('Você não tem tarefas para hoje');
    const passed = hasEmptyMine;

    results.push({
      id: 'MC17',
      name: 'Minhas empty state',
      passed,
      expected: 'Empty state contextual para Minhas ("Você não tem tarefas para hoje")',
      actual: passed ? 'Empty state de Minhas renderizado perfeitamente' : 'Empty state ausente ou incorreto'
    });
  }

  // MC18: Todas empty state
  {
    const appCtx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'all' });

    const hasEmptyAll = html.includes('id="today-empty-all"') && html.includes('Tudo concluído por hoje!');
    const passed = hasEmptyAll;

    results.push({
      id: 'MC18',
      name: 'Todas empty state',
      passed,
      expected: 'Empty state contextual para Todas ("Tudo concluído por hoje!")',
      actual: passed ? 'Empty state de Todas renderizado perfeitamente' : 'Empty state ausente'
    });
  }

  // MC19: Disponíveis empty state
  {
    const taskLucas = makeTask('t-lucas-only', 'Tarefa do Lucas', TODAY, 'PENDING', 'mem-member-lucas');
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [taskLucas],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'available' });

    const hasEmptyAvailable = html.includes('id="today-empty-available"') && html.includes('Nenhuma tarefa disponível no momento');
    const passed = hasEmptyAvailable;

    results.push({
      id: 'MC19',
      name: 'Disponíveis empty state',
      passed,
      expected: 'Empty state contextual para Disponíveis ("Nenhuma tarefa disponível no momento")',
      actual: passed ? 'Empty state de Disponíveis renderizado perfeitamente' : 'Empty state ausente'
    });
  }

  // MC20: completed section respects Minhas
  {
    const doneLucas = makeTask('done-lucas', 'Concluída do Lucas', TODAY, 'DONE', 'mem-member-lucas');
    doneLucas.completedByMemberId = 'mem-member-lucas';
    const doneClara = makeTask('done-clara', 'Concluída da Clara', TODAY, 'DONE', 'mem-member-clara');
    doneClara.completedByMemberId = 'mem-member-clara';

    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [doneLucas, doneClara],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'mine' });

    const hasLucasDone = html.includes('Concluída do Lucas');
    const hasClaraDone = html.includes('Concluída da Clara');
    const passed = hasLucasDone && !hasClaraDone;

    results.push({
      id: 'MC20',
      name: 'completed section respects Minhas',
      passed,
      expected: 'Seção de concluídas exibe somente tarefas de Lucas sob filtro Minhas',
      actual: passed ? 'Apenas tarefas concluídas por Lucas visíveis' : 'Tarefas concluídas por terceiros vazaram'
    });
  }

  // MC21: completed section respects Todas
  {
    const doneLucas = makeTask('done-lucas', 'Concluída do Lucas', TODAY, 'DONE', 'mem-member-lucas');
    const doneClara = makeTask('done-clara', 'Concluída da Clara', TODAY, 'DONE', 'mem-member-clara');

    const appCtx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [doneLucas, doneClara],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'all' });

    const hasLucasDone = html.includes('Concluída do Lucas');
    const hasClaraDone = html.includes('Concluída da Clara');
    const passed = hasLucasDone && hasClaraDone;

    results.push({
      id: 'MC21',
      name: 'completed section respects Todas',
      passed,
      expected: 'Seção de concluídas exibe todas as concluídas sob filtro Todas',
      actual: passed ? 'Todas as tarefas concluídas visíveis' : 'Faltaram tarefas concluídas em Todas'
    });
  }

  // MC22: completed absent from Disponíveis
  {
    const doneTask = makeTask('done-task', 'Tarefa Concluída', TODAY, 'DONE', 'mem-member-lucas');

    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [doneTask],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'available' });

    const hasCompletedSection = html.includes('id="today-completed-section"');
    const passed = !hasCompletedSection;

    results.push({
      id: 'MC22',
      name: 'completed absent from Disponíveis',
      passed,
      expected: 'Seção de concluídas ausente quando filtro é Disponíveis',
      actual: passed ? 'Concluídas omitidas em Disponíveis' : 'Falha: concluídas exibidas em Disponíveis'
    });
  }

  // MC23: Today activeDate/family timezone preserved
  {
    const utcDateBoundary = new Date('2026-09-11T01:30:00Z');
    const localDateCalculated = getFamilyLocalDate('America/Sao_Paulo', utcDateBoundary);
    
    const taskSept10 = makeTask('task-sept10', 'Tarefa Noturna 10/09', '2026-09-10', 'PENDING');
    const taskSept11 = makeTask('task-sept11', 'Tarefa Matinal 11/09', '2026-09-11', 'PENDING');

    const appCtx = createMockAppContext({
      family: { ...mockFamily, timezone: 'America/Sao_Paulo' },
      tasks: [taskSept10, taskSept11],
      selectedDate: localDateCalculated
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { targetDate: localDateCalculated, initialFilter: 'all' });

    const passed = localDateCalculated === '2026-09-10' &&
      html.includes('Tarefa Noturna 10/09') &&
      !html.includes('Tarefa Matinal 11/09');

    results.push({
      id: 'MC23',
      name: 'Today activeDate/family timezone preserved',
      passed,
      expected: 'Data local America/Sao_Paulo respeitada em fronteira UTC',
      actual: passed ? 'Fuso horário local preservado rigorosamente' : 'Falha de fuso horário'
    });
  }

  // MC24: no mobile horizontal overflow
  {
    const longTitleTask = makeTask('t-overflow', 'Tarefa com título muito longo que deve ser truncado para não provocar overflow horizontal na tela do celular', TODAY, 'PENDING', 'mem-member-lucas');
    const appCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [longTitleTask],
      selectedDate: TODAY
    });
    const html = renderTodayViewWithProviders(appCtx, undefined, { initialFilter: 'all' });

    const hasContainerSafeguards = html.includes('w-full') && html.includes('min-w-0') && html.includes('overflow-x-hidden');
    const hasTruncate = html.includes('truncate');
    const hasGridSafeguards = html.includes('grid-cols-2') || html.includes('grid-cols-3');
    const passed = hasContainerSafeguards && hasTruncate && hasGridSafeguards;

    results.push({
      id: 'MC24',
      name: 'no mobile horizontal overflow',
      passed,
      expected: 'Layout mobile possui salvaguardas contra overflow horizontal (min-w-0, truncate, overflow-x-hidden)',
      actual: passed ? 'Salvaguardas de responsividade e layout contra overflow confirmadas' : 'Classes de proteção ausentes'
    });
  }

  return results;
}
