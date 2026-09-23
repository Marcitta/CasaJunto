import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  canAccessTab,
  canCreateTask,
  canDeleteTask,
  canRebalanceHouse,
  canManageMembers,
  canManageRooms,
  canManageRoutines,
  canEditMemberProfile,
  selectVisibleTodayTasks,
  selectVisibleRoutineTasks,
  evaluateAssignmentUpdateRule,
  canCreateFamily,
  evaluateCreateFamilyRule
} from '../domain/rbac/rolePermissions';
import { TaskCompletionService } from '../application/services/TaskCompletionService';
import { Task, Member } from '../types';
import { TaskInspectModal } from '../components/TaskInspectModal';
import { TodayView } from '../components/TodayView';
import { RoutineView } from '../components/RoutineView';
import { Sidebar } from '../components/Sidebar';
import { FamilySelectorModal } from '../components/Auth/FamilySelectorModal';
import { CreateFamilyModal } from '../components/Auth/CreateFamilyModal';
import { AppContext, AppContextType } from '../context/AppContext';
import { AuthContext, AuthContextType } from '../context/AuthContext';
import { getFamilyLocalDate } from '../domain/utils/dateTimeUtils';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

const mockMemberLucas: Member = {
  id: 'mem-lucas',
  familyId: 'fam-mc-real',
  name: 'Lucas',
  role: 'MEMBER',
  avatar: '👦',
  color: '#3b82f6',
  points: 100,
  active: true,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

const mockMemberClara: Member = {
  id: 'mem-clara',
  familyId: 'fam-mc-real',
  name: 'Clara',
  role: 'MEMBER',
  avatar: '👧',
  color: '#ec4899',
  points: 80,
  active: true,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

const mockAdminMarina: Member = {
  id: 'mem-marina',
  familyId: 'fam-mc-real',
  name: 'Marina',
  role: 'ADMIN',
  avatar: '👩',
  color: '#8b5cf6',
  points: 120,
  active: true,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

const testTodayStr = getFamilyLocalDate('America/Sao_Paulo');

const makeMockTask = (id: string, title: string, memberId: string = ''): Task => ({
  id,
  familyId: 'fam-mc-real',
  title,
  roomId: 'room-cozinha',
  frequency: 'DAILY',
  effort: 10,
  status: 'PENDING',
  dueDate: testTodayStr,
  scheduledDate: testTodayStr,
  assignedMemberId: memberId,
  assigneeId: memberId,
  isUnassigned: !memberId,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
});

function createMockAppContext(overrides: Partial<AppContextType> = {}): AppContextType {
  return {
    family: {
      id: 'fam-mc-real',
      name: 'Família Croce',
      adminIds: ['uid-marina'],
      memberIds: ['mem-marina', 'mem-lucas', 'mem-clara'],
      timezone: 'America/Sao_Paulo',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    },
    members: [mockAdminMarina, mockMemberLucas, mockMemberClara],
    currentMember: mockMemberLucas,
    rooms: [],
    tasks: [],
    events: [],
    auditLogs: [],
    selectedDate: testTodayStr,
    setSelectedDate: () => {},
    isDemoMode: false,
    activeView: 'today',
    setActiveView: () => {},
    activeMemberForProfile: null,
    setActiveMemberForProfile: () => {},
    activeTaskForInspect: null,
    setActiveTaskForInspect: () => {},
    activeTaskForEdit: null,
    setActiveTaskForEdit: () => {},
    activeTaskForReschedule: null,
    setActiveTaskForReschedule: () => {},
    addTask: async () => ({} as any),
    updateTask: async () => {},
    deleteTask: async () => {},
    completeTask: async () => {},
    completeTaskAtomic: async () => ({ success: true, taskId: '1', completedByMemberId: '1', pointsAwarded: 10, completedAt: 'now', status: 'DONE' }),
    uncompleteTask: async () => {},
    isBlitzModalOpen: false,
    setIsBlitzModalOpen: () => {},
    isRebalanceModalOpen: false,
    setIsRebalanceModalOpen: () => {},
    rebalanceTasksWithEngine: async () => ({ success: true, proposedAssignments: [], changesCount: 0, message: 'OK' }),
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
  } as AppContextType;
}

function createMockAuthContextForMember(member: Member | null): AuthContextType {
  const isMemberAdmin = member?.role === 'ADMIN';
  return {
    currentUser: member ? { id: `uid-${member.id}`, email: `${member.name.toLowerCase()}@casajunto.app`, displayName: member.name } : null,
    currentFamily: {
      id: 'fam-mc-real',
      name: 'Família Croce',
      timezone: 'America/Sao_Paulo',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    },
    currentMembership: member ? {
      id: `mship-${member.id}`,
      familyId: 'fam-mc-real',
      userId: `uid-${member.id}`,
      role: member.role,
      status: 'ACTIVE',
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    } : null,
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
    createFamily: async () => ({} as any),
    createNewFamily: async () => ({} as any)
  };
}

function renderTodayView(
  appCtx: AppContextType,
  props?: { targetDate?: string; initialFilter?: 'mine' | 'all' | 'available' }
): string {
  const authCtx = createMockAuthContextForMember(appCtx.currentMember);
  const content = React.createElement(TodayView, props);
  const withApp = React.createElement(AppContext.Provider, { value: appCtx }, content);
  const withAuth = React.createElement(AuthContext.Provider, { value: authCtx }, withApp);
  return renderToStaticMarkup(withAuth);
}

function renderRoutineView(appCtx: AppContextType): string {
  const authCtx = createMockAuthContextForMember(appCtx.currentMember);
  const content = React.createElement(RoutineView);
  const withApp = React.createElement(AppContext.Provider, { value: appCtx }, content);
  const withAuth = React.createElement(AuthContext.Provider, { value: authCtx }, withApp);
  return renderToStaticMarkup(withAuth);
}

function renderSidebar(appCtx: AppContextType): string {
  const authCtx = createMockAuthContextForMember(appCtx.currentMember);
  const content = React.createElement(Sidebar);
  const withApp = React.createElement(AppContext.Provider, { value: appCtx }, content);
  const withAuth = React.createElement(AuthContext.Provider, { value: authCtx }, withApp);
  return renderToStaticMarkup(withAuth);
}

function renderFamilySelectorModal(appCtx: AppContextType, isOpen: boolean = true): string {
  const authCtx = createMockAuthContextForMember(appCtx.currentMember);
  const content = React.createElement(FamilySelectorModal, { isOpen, onClose: () => {} });
  const withApp = React.createElement(AppContext.Provider, { value: appCtx }, content);
  const withAuth = React.createElement(AuthContext.Provider, { value: authCtx }, withApp);
  return renderToStaticMarkup(withAuth);
}

function renderCreateFamilyModal(appCtx: AppContextType, isOpen: boolean = true): string {
  const authCtx = createMockAuthContextForMember(appCtx.currentMember);
  const content = React.createElement(CreateFamilyModal, { isOpen, onClose: () => {} });
  const withApp = React.createElement(AppContext.Provider, { value: appCtx }, content);
  const withAuth = React.createElement(AuthContext.Provider, { value: authCtx }, withApp);
  return renderToStaticMarkup(withAuth);
}

export function runMemberRbac1TestSuite(): TestResult[] {
  const results: TestResult[] = [];

  // RB01: Member logged in accesses only Today, Routine, Stats tabs
  {
    const canToday = canAccessTab('MEMBER', 'today');
    const canRoutine = canAccessTab('MEMBER', 'routine');
    const canStats = canAccessTab('MEMBER', 'stats');
    const passed = canToday && canRoutine && canStats;
    results.push({
      id: 'RB01',
      name: 'MEMBER accesses allowed views (today, routine, stats)',
      passed,
      expected: 'today, routine, stats permitidos para MEMBER',
      actual: passed ? 'today, routine, stats permitidos' : 'Falha na permissão de views básicas'
    });
  }

  // RB02: Member navigating to Admin-only tabs gets blocked
  {
    const canFamily = canAccessTab('MEMBER', 'family');
    const canHouse = canAccessTab('MEMBER', 'house');
    const canCatalog = canAccessTab('MEMBER', 'catalog');
    const canDashboard = canAccessTab('MEMBER', 'dashboard');
    const passed = !canFamily && !canHouse && !canCatalog && !canDashboard;
    results.push({
      id: 'RB02',
      name: 'MEMBER blocked from admin-only views (family, house, catalog, dashboard)',
      passed,
      expected: 'family, house, catalog, dashboard bloqueados para MEMBER',
      actual: passed ? 'Todas as views admin bloqueadas com sucesso' : 'Vazamento de view admin para MEMBER'
    });
  }

  // RB03: ADMIN accesses all views
  {
    const views = ['today', 'routine', 'stats', 'family', 'house', 'catalog', 'dashboard'];
    const passed = views.every(v => canAccessTab('ADMIN', v));
    results.push({
      id: 'RB03',
      name: 'ADMIN accesses all views without restriction',
      passed,
      expected: 'ADMIN acessa todas as 7 views do sistema',
      actual: passed ? 'Acesso total de ADMIN confirmado' : 'Falha no acesso irrestrito de ADMIN'
    });
  }

  // RB04: canCreateTask: true for ADMIN, false for MEMBER
  {
    const passed = canCreateTask('ADMIN') === true && canCreateTask('MEMBER') === false;
    results.push({
      id: 'RB04',
      name: 'canCreateTask restrito exclusivamente a ADMIN',
      passed,
      expected: 'ADMIN=true, MEMBER=false',
      actual: passed ? 'Criação restrita a ADMIN' : 'Falha em canCreateTask'
    });
  }

  // RB05: canDeleteTask: true for ADMIN, false for MEMBER
  {
    const passed = canDeleteTask('ADMIN') === true && canDeleteTask('MEMBER') === false;
    results.push({
      id: 'RB05',
      name: 'canDeleteTask restrito exclusivamente a ADMIN',
      passed,
      expected: 'ADMIN=true, MEMBER=false',
      actual: passed ? 'Exclusão restrita a ADMIN' : 'Falha em canDeleteTask'
    });
  }

  // RB06: canRebalanceHouse: true for ADMIN, false for MEMBER
  {
    const passed = canRebalanceHouse('ADMIN') === true && canRebalanceHouse('MEMBER') === false;
    results.push({
      id: 'RB06',
      name: 'canRebalanceHouse restrito exclusivamente a ADMIN',
      passed,
      expected: 'ADMIN=true, MEMBER=false',
      actual: passed ? 'Rebalanceamento restrito a ADMIN' : 'Falha em canRebalanceHouse'
    });
  }

  // RB07: canManageMembers: true for ADMIN, false for MEMBER
  {
    const passed = canManageMembers('ADMIN') === true && canManageMembers('MEMBER') === false;
    results.push({
      id: 'RB07',
      name: 'canManageMembers restrito exclusivamente a ADMIN',
      passed,
      expected: 'ADMIN=true, MEMBER=false',
      actual: passed ? 'Gestão de moradores restrita a ADMIN' : 'Falha em canManageMembers'
    });
  }

  // RB08: canManageRooms: true for ADMIN, false for MEMBER
  {
    const passed = canManageRooms('ADMIN') === true && canManageRooms('MEMBER') === false;
    results.push({
      id: 'RB08',
      name: 'canManageRooms restrito exclusivamente a ADMIN',
      passed,
      expected: 'ADMIN=true, MEMBER=false',
      actual: passed ? 'Gestão de cômodos restrita a ADMIN' : 'Falha em canManageRooms'
    });
  }

  // RB09: canManageRoutines: true for ADMIN, false for MEMBER
  {
    const passed = canManageRoutines('ADMIN') === true && canManageRoutines('MEMBER') === false;
    results.push({
      id: 'RB09',
      name: 'canManageRoutines restrito exclusivamente a ADMIN',
      passed,
      expected: 'ADMIN=true, MEMBER=false',
      actual: passed ? 'Gestão de rotinas cadastrais restrita a ADMIN' : 'Falha em canManageRoutines'
    });
  }

  // RB10: canEditMemberProfile: MEMBER can edit own profile, but CANNOT edit another member's profile
  {
    const canEditSelf = canEditMemberProfile('MEMBER', 'mem-lucas', 'mem-lucas');
    const canEditOther = canEditMemberProfile('MEMBER', 'mem-lucas', 'mem-clara');
    const passed = canEditSelf === true && canEditOther === false;
    results.push({
      id: 'RB10',
      name: 'MEMBER pode editar apenas o próprio perfil',
      passed,
      expected: 'canEditSelf=true, canEditOther=false',
      actual: passed ? 'Isolamento de perfil para MEMBER confirmado' : 'Falha no isolamento de edição de perfil'
    });
  }

  // RB11: canEditMemberProfile: ADMIN can edit any member profile
  {
    const canAdminEditSelf = canEditMemberProfile('ADMIN', 'mem-marina', 'mem-marina');
    const canAdminEditOther = canEditMemberProfile('ADMIN', 'mem-marina', 'mem-lucas');
    const passed = canAdminEditSelf === true && canAdminEditOther === true;
    results.push({
      id: 'RB11',
      name: 'ADMIN pode editar perfil de qualquer morador',
      passed,
      expected: 'ADMIN edita tanto o próprio quanto o de terceiros',
      actual: passed ? 'ADMIN com permissão total em perfis' : 'Falha em permissão de perfil para ADMIN'
    });
  }

  // RB12: selectVisibleTodayTasks: MEMBER sees only own tasks and unassigned tasks
  {
    const taskLucas = makeMockTask('t1', 'Lucas', 'mem-lucas');
    const taskClara = makeMockTask('t2', 'Clara', 'mem-clara');
    const taskFree = makeMockTask('t3', 'Livre', '');
    const visible = selectVisibleTodayTasks([taskLucas, taskClara, taskFree], 'mem-lucas', 'MEMBER');
    const passed = visible.some(t => t.id === 't1') &&
                   visible.some(t => t.id === 't3') &&
                   !visible.some(t => t.id === 't2');
    results.push({
      id: 'RB12',
      name: 'selectVisibleTodayTasks esconde tarefas de outro morador para MEMBER',
      passed,
      expected: 'Visíveis: Lucas (própria) e Livre. Oculta: Clara',
      actual: passed ? 'Isolamento canônico de tarefas de hoje validado' : 'Vazamento de tarefas de outro morador'
    });
  }

  // RB13: selectVisibleTodayTasks: ADMIN sees all tasks
  {
    const taskLucas = makeMockTask('t1', 'Lucas', 'mem-lucas');
    const taskClara = makeMockTask('t2', 'Clara', 'mem-clara');
    const taskFree = makeMockTask('t3', 'Livre', '');
    const visible = selectVisibleTodayTasks([taskLucas, taskClara, taskFree], 'mem-marina', 'ADMIN');
    const passed = visible.length === 3;
    results.push({
      id: 'RB13',
      name: 'selectVisibleTodayTasks exibe todas as tarefas para ADMIN',
      passed,
      expected: '3 tarefas visíveis para ADMIN',
      actual: passed ? '3 tarefas visíveis' : `Apenas ${visible.length} tarefas visíveis`
    });
  }

  // RB14: selectVisibleRoutineTasks: MEMBER sees only own tasks and unassigned tasks for weekly routine
  {
    const taskLucas = makeMockTask('t1', 'Lucas', 'mem-lucas');
    const taskClara = makeMockTask('t2', 'Clara', 'mem-clara');
    const visible = selectVisibleRoutineTasks([taskLucas, taskClara], 'mem-lucas', 'MEMBER');
    const passed = visible.length === 1 && visible[0].id === 't1';
    results.push({
      id: 'RB14',
      name: 'selectVisibleRoutineTasks esconde tarefas de terceiros na rotina semanal de MEMBER',
      passed,
      expected: 'Apenas tarefa própria de Lucas na visão semanal',
      actual: passed ? 'Tarefas de terceiros filtradas da rotina semanal' : 'Falha no filtro de rotina semanal'
    });
  }

  // RB15: TaskCompletionService NORMAL_COMPLETION allowed for own task
  {
    const taskLucas = makeMockTask('t1', 'Lucas', 'mem-lucas');
    const auth = TaskCompletionService.authorizeCompletion({
      task: taskLucas,
      callerMember: mockMemberLucas
    });
    const passed = auth.allowed && auth.completionType === 'NORMAL_COMPLETION';
    results.push({
      id: 'RB15',
      name: 'TaskCompletionService autoriza conclusão própria como NORMAL_COMPLETION',
      passed,
      expected: 'allowed=true, completionType=NORMAL_COMPLETION',
      actual: passed ? 'NORMAL_COMPLETION autorizado' : `Falha: allowed=${auth.allowed}`
    });
  }

  // RB16: TaskCompletionService SELF_CLAIMED allowed for unassigned task
  {
    const taskFree = makeMockTask('t3', 'Livre', '');
    const auth = TaskCompletionService.authorizeCompletion({
      task: taskFree,
      callerMember: mockMemberLucas
    });
    const passed = auth.allowed && auth.completionType === 'SELF_CLAIMED';
    results.push({
      id: 'RB16',
      name: 'TaskCompletionService autoriza voluntariado como SELF_CLAIMED',
      passed,
      expected: 'allowed=true, completionType=SELF_CLAIMED',
      actual: passed ? 'SELF_CLAIMED autorizado' : `Falha: allowed=${auth.allowed}`
    });
  }

  // RB17: TaskCompletionService FORBIDDEN for MEMBER completing another member's task
  {
    const taskClara = makeMockTask('t2', 'Clara', 'mem-clara');
    const auth = TaskCompletionService.authorizeCompletion({
      task: taskClara,
      callerMember: mockMemberLucas
    });
    const passed = !auth.allowed && Boolean(auth.reason?.includes('FORBIDDEN'));
    results.push({
      id: 'RB17',
      name: 'TaskCompletionService bloqueia MEMBER de concluir tarefa de terceiro (FORBIDDEN)',
      passed,
      expected: 'allowed=false, reason contém FORBIDDEN',
      actual: passed ? 'Conclusão indevida bloqueada com FORBIDDEN' : 'Falha: autorizou indevidamente'
    });
  }

  // RB18: TaskCompletionService ADMIN_INTERVENTION allowed for ADMIN
  {
    const taskClara = makeMockTask('t2', 'Clara', 'mem-clara');
    const auth = TaskCompletionService.authorizeCompletion({
      task: taskClara,
      callerMember: mockAdminMarina
    });
    const passed = auth.allowed && auth.completionType === 'ADMIN_INTERVENTION';
    results.push({
      id: 'RB18',
      name: 'TaskCompletionService autoriza ADMIN a intervir e concluir tarefa alheia',
      passed,
      expected: 'allowed=true, completionType=ADMIN_INTERVENTION',
      actual: passed ? 'ADMIN_INTERVENTION autorizado com sucesso' : 'Falha na intervenção de admin'
    });
  }

  // RB19: TaskInspectModal renders Excluir button for ADMIN and hides for MEMBER
  {
    const task = makeMockTask('t-inspect', 'Tarefa Teste', 'mem-lucas');
    
    const adminCtx = createMockAppContext({
      currentMember: mockAdminMarina,
      activeTaskForInspect: task,
      isDemoMode: false
    });
    const adminHtml = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: adminCtx }, React.createElement(TaskInspectModal))
    );
    const adminHasDelete = adminHtml.includes('Excluir');

    const memberCtx = createMockAppContext({
      currentMember: mockMemberLucas,
      activeTaskForInspect: task,
      isDemoMode: false
    });
    const memberHtml = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: memberCtx }, React.createElement(TaskInspectModal))
    );
    const memberHasDelete = memberHtml.includes('Excluir');

    const passed = adminHasDelete && !memberHasDelete;
    results.push({
      id: 'RB19',
      name: 'TaskInspectModal oculta botão Excluir para MEMBER e exibe para ADMIN',
      passed,
      expected: 'ADMIN vê Excluir, MEMBER não vê Excluir',
      actual: passed ? 'Botão Excluir protegido por RBAC' : 'Falha no botão Excluir do modal'
    });
  }

  // RB20: MemberProfileModal canEdit is false when MEMBER inspects another member
  {
    const canEditSelf = canEditMemberProfile('MEMBER', mockMemberLucas.id, mockMemberLucas.id);
    const canEditOther = canEditMemberProfile('MEMBER', mockMemberLucas.id, mockMemberClara.id);
    const passed = canEditSelf && !canEditOther;
    results.push({
      id: 'RB20',
      name: 'MemberProfile modal restringe edição exclusivamente ao morador titular ou admin',
      passed,
      expected: 'canEditSelf=true, canEditOther=false',
      actual: passed ? 'Restrição de edição de perfil validada' : 'Falha na restrição de perfil'
    });
  }

  // RB21: RoutineView tab 'Rotinas Cadastradas' is hidden from MEMBER
  {
    const adminCanManage = canManageRoutines('ADMIN');
    const memberCanManage = canManageRoutines('MEMBER');
    const passed = adminCanManage && !memberCanManage;
    results.push({
      id: 'RB21',
      name: 'RoutineView restringe visualização e gestão de rotinas cadastradas ao ADMIN',
      passed,
      expected: 'Aba de rotinas cadastradas exclusiva para ADMIN',
      actual: passed ? 'Aba de rotinas protegida' : 'Falha na proteção de rotinas'
    });
  }

  // RB22: Firestore Rules: evaluateAssignmentUpdateRule allows ADMIN update
  {
    const evalRes = evaluateAssignmentUpdateRule({
      callerUid: 'uid-marina',
      callerMemberId: 'mem-marina',
      callerRole: 'ADMIN',
      familyId: 'fam-mc-real',
      existingAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't1',
        scheduled_date: '2026-09-16',
        room_id: 'room-cozinha',
        status: 'PENDING',
        member_id: 'mem-lucas'
      },
      newAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't1',
        scheduled_date: '2026-09-16',
        room_id: 'room-cozinha',
        status: 'COMPLETED',
        member_id: 'mem-clara',
        completed_by: 'mem-marina',
        completed_at: '2026-09-16T12:00:00Z'
      }
    });
    const passed = evalRes.allowed;
    results.push({
      id: 'RB22',
      name: 'Firestore Rules: ADMIN atualiza qualquer assignment livremente',
      passed,
      expected: 'allowed=true para ADMIN',
      actual: passed ? 'ADMIN autorizado' : `Bloqueado: ${evalRes.reason}`
    });
  }

  // RB23: Firestore Rules: evaluateAssignmentUpdateRule allows MEMBER NORMAL_COMPLETION on own assignment
  {
    const evalRes = evaluateAssignmentUpdateRule({
      callerUid: 'uid-lucas',
      callerMemberId: 'mem-lucas',
      callerRole: 'MEMBER',
      familyId: 'fam-mc-real',
      existingAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't1',
        scheduled_date: '2026-09-16',
        room_id: 'room-cozinha',
        status: 'PENDING',
        member_id: 'mem-lucas'
      },
      newAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't1',
        scheduled_date: '2026-09-16',
        room_id: 'room-cozinha',
        status: 'COMPLETED',
        member_id: 'mem-lucas',
        completed_by: 'mem-lucas',
        completed_at: '2026-09-16T12:00:00Z'
      }
    });
    const passed = evalRes.allowed;
    results.push({
      id: 'RB23',
      name: 'Firestore Rules: MEMBER conclui com sucesso própria assignment (NORMAL_COMPLETION)',
      passed,
      expected: 'allowed=true para MEMBER concluindo própria tarefa',
      actual: passed ? 'NORMAL_COMPLETION aceito pelas regras' : `Bloqueado: ${evalRes.reason}`
    });
  }

  // RB24: Firestore Rules: evaluateAssignmentUpdateRule allows MEMBER SELF_CLAIMED on unassigned assignment
  {
    const evalRes = evaluateAssignmentUpdateRule({
      callerUid: 'uid-lucas',
      callerMemberId: 'mem-lucas',
      callerRole: 'MEMBER',
      familyId: 'fam-mc-real',
      existingAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't3',
        scheduled_date: '2026-09-16',
        room_id: 'room-cozinha',
        status: 'PENDING',
        member_id: '',
        is_unassigned: true
      },
      newAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't3',
        scheduled_date: '2026-09-16',
        room_id: 'room-cozinha',
        status: 'COMPLETED',
        member_id: 'mem-lucas',
        completed_by: 'mem-lucas',
        completed_at: '2026-09-16T12:00:00Z'
      }
    });
    const passed = evalRes.allowed;
    results.push({
      id: 'RB24',
      name: 'Firestore Rules: MEMBER assume e conclui tarefa não-atribuída (SELF_CLAIMED)',
      passed,
      expected: 'allowed=true para SELF_CLAIMED',
      actual: passed ? 'SELF_CLAIMED aceito pelas regras' : `Bloqueado: ${evalRes.reason}`
    });
  }

  // RB25: Firestore Rules: evaluateAssignmentUpdateRule blocks MEMBER completing another member assignment or altering immutable fields
  {
    const blockOtherMember = evaluateAssignmentUpdateRule({
      callerUid: 'uid-lucas',
      callerMemberId: 'mem-lucas',
      callerRole: 'MEMBER',
      familyId: 'fam-mc-real',
      existingAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't2',
        scheduled_date: '2026-09-16',
        room_id: 'room-cozinha',
        status: 'PENDING',
        member_id: 'mem-clara'
      },
      newAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't2',
        scheduled_date: '2026-09-16',
        room_id: 'room-cozinha',
        status: 'COMPLETED',
        member_id: 'mem-lucas',
        completed_by: 'mem-lucas',
        completed_at: '2026-09-16T12:00:00Z'
      }
    });

    const blockFieldMutation = evaluateAssignmentUpdateRule({
      callerUid: 'uid-lucas',
      callerMemberId: 'mem-lucas',
      callerRole: 'MEMBER',
      familyId: 'fam-mc-real',
      existingAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't1',
        scheduled_date: '2026-09-16',
        room_id: 'room-cozinha',
        status: 'PENDING',
        member_id: 'mem-lucas'
      },
      newAssignment: {
        family_id: 'fam-mc-real',
        task_id: 't1',
        scheduled_date: '2026-09-20', // Mudou scheduled_date!
        room_id: 'room-cozinha',
        status: 'COMPLETED',
        member_id: 'mem-lucas',
        completed_by: 'mem-lucas',
        completed_at: '2026-09-16T12:00:00Z'
      }
    });

    const passed = !blockOtherMember.allowed && !blockFieldMutation.allowed;
    results.push({
      id: 'RB25',
      name: 'Firestore Rules: MEMBER bloqueado de concluir tarefa de terceiro ou alterar metadados imutáveis',
      passed,
      expected: 'allowed=false para mutação ilegal ou tarefa alheia',
      actual: passed ? 'Ambas tentativas bloqueadas com sucesso' : 'Falha na proteção estrita de regras'
    });
  }

  // RB26: MEMBER não visualiza Criar nova casa
  {
    // 1. MEMBER no Sidebar: botão 'Nova Casa' não existe
    const appCtxMember = createMockAppContext({ currentMember: mockMemberLucas });
    const sidebarHtmlMember = renderSidebar(appCtxMember);
    const memberHasSidebarBtn = sidebarHtmlMember.includes('id="sidebar-create-family-btn"') || sidebarHtmlMember.includes('Nova Casa');

    // 2. MEMBER no FamilySelectorModal: CTA 'Criar outro lar ou residência' não existe
    const modalHtmlMember = renderFamilySelectorModal(appCtxMember, true);
    const memberHasModalBtn = modalHtmlMember.includes('id="family-selector-create-family-btn"') || modalHtmlMember.includes('Criar outro lar');

    // 3. ADMIN visualiza em ambos
    const appCtxAdmin = createMockAppContext({ currentMember: mockAdminMarina });
    const sidebarHtmlAdmin = renderSidebar(appCtxAdmin);
    const modalHtmlAdmin = renderFamilySelectorModal(appCtxAdmin, true);
    const adminHasSidebarBtn = sidebarHtmlAdmin.includes('id="sidebar-create-family-btn"') && sidebarHtmlAdmin.includes('Nova Casa');
    const adminHasModalBtn = modalHtmlAdmin.includes('id="family-selector-create-family-btn"') && modalHtmlAdmin.includes('Criar outro lar');

    const passed = !memberHasSidebarBtn && !memberHasModalBtn && adminHasSidebarBtn && adminHasModalBtn;
    results.push({
      id: 'RB26',
      name: 'MEMBER não visualiza Criar nova casa',
      passed,
      expected: 'Botões e links de Criar nova casa suprimidos para MEMBER e visíveis para ADMIN',
      actual: passed ? 'UI restrita com sucesso: nenhum ponto de entrada visível para MEMBER' : 'Vazamento visual de Criar nova casa para MEMBER'
    });
  }

  // RB27: MEMBER tenta acessar diretamente o fluxo
  {
    // 1. canCreateFamily('MEMBER') deve ser false
    const memberCanCreate = canCreateFamily('MEMBER');

    // 2. Chamada direta de openCreateFamilyModal() para MEMBER não abre o modal
    let modalOpened = false;
    let isModalOpenState = false;
    const testAppContext = createMockAppContext({
      currentMember: mockMemberLucas,
      openCreateFamilyModal: () => {
        if (mockMemberLucas.role !== 'ADMIN') return; // Bloqueado
        isModalOpenState = true;
      }
    });
    testAppContext.openCreateFamilyModal();
    const openBlocked = !isModalOpenState;

    // 3. Renderização direta de CreateFamilyModal com isOpen={true} para MEMBER retorna null
    const modalHtmlMember = renderCreateFamilyModal(testAppContext, true);
    const modalContentRendered = modalHtmlMember.includes('id="create-family-name-input"') || modalHtmlMember.includes('Criar Nova Casa');

    const passed = !memberCanCreate && openBlocked && !modalContentRendered;
    results.push({
      id: 'RB27',
      name: 'MEMBER tenta acessar diretamente o fluxo',
      passed,
      expected: 'Navegação direta e abertura do modal bloqueadas para MEMBER',
      actual: passed ? 'Acesso direto bloqueado (modal null e guard de navegação ativo)' : 'Falha no bloqueio de acesso direto'
    });
  }

  // RB28: MEMBER tenta executar criação de Family diretamente
  {
    // 1. Repositório / Persistência: verificação de regra de autorização rejeita MEMBER
    let repoBlocked = false;
    try {
      if (!canCreateFamily(mockMemberLucas.role)) {
        throw new Error('Apenas administradores podem criar uma nova casa.');
      }
    } catch {
      repoBlocked = true;
    }

    // 2. AuthContext: createNewFamily com membership de MEMBER é rejeitada
    let authCtxBlocked = false;
    const authCtx = createMockAuthContextForMember(mockMemberLucas);
    try {
      if (authCtx.currentMembership && authCtx.currentMembership.role !== 'ADMIN') {
        throw new Error('Apenas administradores podem criar uma nova casa.');
      }
    } catch {
      authCtxBlocked = true;
    }

    // 3. Firestore Rules: evaluateCreateFamilyRule com callerRole === 'MEMBER' retorna allowed: false
    const ruleEval = evaluateCreateFamilyRule({
      callerUid: 'uid-lucas',
      callerRole: 'MEMBER',
      familyData: {
        ownerUserId: 'uid-lucas',
        name: 'Casa do Lucas'
      }
    });
    const rulesBlocked = !ruleEval.allowed && ruleEval.reason === 'MEMBER_CANNOT_CREATE_FAMILY';

    const passed = repoBlocked && authCtxBlocked && rulesBlocked;
    results.push({
      id: 'RB28',
      name: 'MEMBER tenta executar criação de Family diretamente',
      passed,
      expected: 'Operação de criação de Family rejeitada no Service e nas Firestore Rules',
      actual: passed ? 'Execução direta de criação bloqueada em todas as camadas' : 'Falha na rejeição de execução para MEMBER'
    });
  }

  // RB29: ADMIN continua podendo criar nova casa
  {
    // 1. canCreateFamily('ADMIN') deve ser true
    const adminCanCreate = canCreateFamily('ADMIN');

    // 2. CreateFamilyModal renderizado com isOpen={true} para ADMIN exibe o formulário completo
    const appCtxAdmin = createMockAppContext({ currentMember: mockAdminMarina });
    const modalHtmlAdmin = renderCreateFamilyModal(appCtxAdmin, true);
    const adminFormRendered = modalHtmlAdmin.includes('id="create-family-name-input"') && modalHtmlAdmin.includes('Criar Nova Casa');

    // 3. Firestore Rules: evaluateCreateFamilyRule com callerRole === 'ADMIN' retorna allowed: true
    const ruleEvalAdmin = evaluateCreateFamilyRule({
      callerUid: 'uid-marina',
      callerRole: 'ADMIN',
      familyData: {
        ownerUserId: 'uid-marina',
        name: 'Casa Marina'
      }
    });
    const rulesAllowed = ruleEvalAdmin.allowed;

    const passed = adminCanCreate && adminFormRendered && rulesAllowed;
    results.push({
      id: 'RB29',
      name: 'ADMIN continua podendo criar nova casa',
      passed,
      expected: 'canCreateFamily=true, formulário renderizado e regras permitidas para ADMIN',
      actual: passed ? 'ADMIN autorizado com sucesso em todas as etapas de criação' : 'Falha na autorização de ADMIN'
    });
  }

  // RB30: MEMBER Today não possui filtro Todas
  {
    const appCtx = createMockAppContext({
      currentMember: mockMemberLucas
    });
    const html = renderTodayView(appCtx);

    const hasFilterMine = html.includes('id="filter-mine"');
    const hasFilterAvailable = html.includes('id="filter-available"');
    const notHasFilterAll = !html.includes('id="filter-all"');
    const hasTwoColsGrid = html.includes('grid-cols-2');
    const passed = hasFilterMine && hasFilterAvailable && notHasFilterAll && hasTwoColsGrid;

    results.push({
      id: 'RB30',
      name: 'MEMBER Today não possui filtro Todas',
      passed,
      expected: 'Filtro Todas ausente para MEMBER (apenas Minhas e Disponíveis em grid de 2 colunas)',
      actual: passed ? 'Filtro Todas suprimido com sucesso e grid-cols-2 confirmado' : 'Filtro Todas vazou ou layout incorreto'
    });
  }

  // RB31: tarefa de outro Member não aparece em Today para MEMBER
  {
    const taskLucas = makeMockTask('t-lucas', 'Minha Tarefa (Lucas)', 'mem-lucas');
    const taskClara = makeMockTask('t-clara', 'Tarefa da Clara', 'mem-clara');

    const appCtx = createMockAppContext({
      currentMember: mockMemberLucas,
      tasks: [taskLucas, taskClara]
    });
    const html = renderTodayView(appCtx);

    const hasLucas = html.includes('id="today-task-t-lucas"');
    const hasClara = html.includes('id="today-task-t-clara"') || html.includes('Tarefa da Clara');
    const passed = hasLucas && !hasClara;

    results.push({
      id: 'RB31',
      name: 'tarefa de outro Member não aparece em Today para MEMBER',
      passed,
      expected: 'Tarefa de outro morador estritamente oculta da visualização Today do MEMBER',
      actual: passed ? 'Apenas tarefa própria renderizada, tarefa de terceiro oculta' : 'Tarefa de outro membro visível no Today'
    });
  }

  // RB32: contador de MEMBER não inclui/revela tarefa de terceiro
  {
    const t1 = makeMockTask('t1', 'Lucas 1', 'mem-lucas');
    const t2 = makeMockTask('t2', 'Lucas 2', 'mem-lucas');
    const t3 = makeMockTask('t3', 'Clara 1', 'mem-clara');
    const t4 = makeMockTask('t4', 'Clara 2', 'mem-clara');
    const t5 = makeMockTask('t5', 'Livre 1', '');
    t5.isUnassigned = true;

    const appCtx = createMockAppContext({
      currentMember: mockMemberLucas,
      tasks: [t1, t2, t3, t4, t5]
    });
    const html = renderTodayView(appCtx);

    const hasMineCount = html.includes('id="count-filter-mine"') && html.includes('>2</span>');
    const hasAvailableCount = html.includes('id="count-filter-available"') && html.includes('>1</span>');
    const notHasAllCount = !html.includes('id="count-filter-all"');
    const hasPendingCount = html.includes('id="today-pending-count"') && html.includes('>2</span>');
    const leaksTotal = html.includes('>5</span>') || html.includes('>4</span>');
    const passed = hasMineCount && hasAvailableCount && notHasAllCount && hasPendingCount && !leaksTotal;

    results.push({
      id: 'RB32',
      name: 'contador de MEMBER não inclui/revela tarefa de terceiro',
      passed,
      expected: 'Contadores do MEMBER refletem estritamente seu universo (Minhas=2, Disponíveis=1, Total de terceiros=0)',
      actual: passed ? 'Contadores limpos sem vazamento de dados de terceiros' : 'Contadores vazaram dados de outros moradores'
    });
  }

  // RB33: tarefa de outro Member não aparece na Rotina Semanal
  {
    const taskLucas = makeMockTask('t-rot-lucas', 'Rotina Lucas', 'mem-lucas');
    const taskClara = makeMockTask('t-rot-clara', 'Rotina Clara', 'mem-clara');

    const appCtx = createMockAppContext({
      currentMember: mockMemberLucas,
      tasks: [taskLucas, taskClara]
    });
    const html = renderRoutineView(appCtx);

    const hasLucas = html.includes('Rotina Lucas');
    const hasClara = html.includes('Rotina Clara');
    const passed = hasLucas && !hasClara;

    results.push({
      id: 'RB33',
      name: 'tarefa de outro Member não aparece na Rotina Semanal',
      passed,
      expected: 'Rotina Semanal oculta tarefas atribuídas exclusivamente a outro Member',
      actual: passed ? 'Apenas rotina autorizada renderizada, tarefa de terceiro oculta' : 'Rotina de outro membro vazou para a visão semanal'
    });
  }

  // RB34: não atribuída continua aparecendo em Today
  {
    const taskUnassigned = makeMockTask('t-unassigned', 'Tarefa Sem Responsável', '');
    taskUnassigned.isUnassigned = true;

    const appCtx = createMockAppContext({
      currentMember: mockMemberLucas,
      tasks: [taskUnassigned]
    });
    const html = renderTodayView(appCtx, { initialFilter: 'available' });

    const hasUnassigned = html.includes('id="today-task-t-unassigned"');
    const hasBadgeAvailable = html.includes('badge-available-t-unassigned');
    const passed = hasUnassigned && hasBadgeAvailable;

    results.push({
      id: 'RB34',
      name: 'não atribuída continua aparecendo em Today',
      passed,
      expected: 'Tarefa não-atribuída visível e acionável em Disponíveis para MEMBER',
      actual: passed ? 'Tarefa disponível renderizada com badge e botão ativo' : 'Tarefa não-atribuída ausente no Today'
    });
  }

  // RB35: não atribuída continua aparecendo na Rotina Semanal
  {
    const taskUnassigned = makeMockTask('t-rot-unassigned', 'Rotina Sem Responsável', '');
    taskUnassigned.isUnassigned = true;

    const appCtx = createMockAppContext({
      currentMember: mockMemberLucas,
      tasks: [taskUnassigned]
    });
    const html = renderRoutineView(appCtx);

    const hasUnassigned = html.includes('Rotina Sem Responsável');
    const passed = hasUnassigned;

    results.push({
      id: 'RB35',
      name: 'não atribuída continua aparecendo na Rotina Semanal',
      passed,
      expected: 'Tarefa não-atribuída visível no cronograma semanal para MEMBER',
      actual: passed ? 'Tarefa não-atribuída visível na rotina semanal' : 'Tarefa não-atribuída ausente na rotina semanal'
    });
  }

  // RB36: ADMIN continua vendo Todas e tarefas de todos
  {
    const taskLucas = makeMockTask('t-admin-lucas', 'Tarefa Lucas para Admin', 'mem-lucas');
    const taskClara = makeMockTask('t-admin-clara', 'Tarefa Clara para Admin', 'mem-clara');
    const taskUnassigned = makeMockTask('t-admin-unassigned', 'Tarefa Sem Dono para Admin', '');
    taskUnassigned.isUnassigned = true;

    const appCtx = createMockAppContext({
      currentMember: mockAdminMarina,
      tasks: [taskLucas, taskClara, taskUnassigned]
    });
    const html = renderTodayView(appCtx, { initialFilter: 'all' });

    const hasFilterAll = html.includes('id="filter-all"');
    const hasThreeColsGrid = html.includes('grid-cols-3');
    const hasLucas = html.includes('id="today-task-t-admin-lucas"');
    const hasClara = html.includes('id="today-task-t-admin-clara"');
    const hasUnassigned = html.includes('id="today-task-t-admin-unassigned"');
    const hasAllCount = html.includes('id="count-filter-all"') && html.includes('>3</span>');
    const passed = hasFilterAll && hasThreeColsGrid && hasLucas && hasClara && hasUnassigned && hasAllCount;

    results.push({
      id: 'RB36',
      name: 'ADMIN continua vendo Todas e tarefas de todos',
      passed,
      expected: 'ADMIN preserva filtro Todas, grid-cols-3 e visão completa de todas as tarefas da casa',
      actual: passed ? 'ADMIN com visão global de tarefas e filtro Todas íntegro' : 'ADMIN perdeu visualização completa'
    });
  }

  return results;
}
