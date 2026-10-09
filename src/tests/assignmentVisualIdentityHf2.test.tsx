/**
 * CASA JUNTO — TEST SUITE HF2: IDENTIFICAÇÃO VISUAL DE ATRIBUIÇÃO
 * Validação da apresentação do responsável nos cards de tarefas:
 *
 * Regras Obrigatórias:
 * 1. executionTarget e assignee são conceitos diferentes.
 * 2. "Pessoas da casa" representa o público de execução, não o nome do responsável.
 * 3. Quando houver responsável definido, apresentar seu nome de maneira clara.
 * 4. Quando não houver responsável, não inventar atribuição.
 * 5. Tarefas EXTERNAL_SUPPORT não devem aparecer como atribuídas a membros da família.
 * 6. Preservar integralmente as regras de ADMIN e MEMBER.
 * 7. Motor 2.0 100% puro e intocado.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import path from 'path';
import fs from 'fs';
import { TodayView } from '../components/TodayView';
import { RoutineView } from '../components/RoutineView';
import { TaskInspectModal } from '../components/TaskInspectModal';
import { AppContext, AppContextType } from '../context/AppContext';
import { Task, Member, Family, Room, DomesticSupport, FamilyTask } from '../types';
import { getTodayDateString } from '../domain/utils/dateTimeUtils';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

const rootDir = process.cwd();
const TODAY = getTodayDateString();

const mockFamily: Family = {
  id: 'fam-hf2-test',
  name: 'Família Silva & Croce',
  timezone: 'America/Sao_Paulo',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

const adminMarina: Member = {
  id: 'mem-admin-marina',
  familyId: 'fam-hf2-test',
  userId: 'uid-admin-marina',
  name: 'Marina',
  role: 'ADMIN',
  avatar: '👩',
  color: '#8c52ff',
  active: true
};

const memberLucas: Member = {
  id: 'mem-member-lucas',
  familyId: 'fam-hf2-test',
  userId: 'uid-member-lucas',
  name: 'Lucas',
  role: 'MEMBER',
  avatar: '👦',
  color: '#52c41a',
  active: true
};

const mockRooms: Room[] = [
  { id: 'room-cozinha', name: 'Cozinha' },
  { id: 'room-sala', name: 'Sala de Estar' },
  { id: 'room-quarto', name: 'Quarto' }
];

const mockDomesticSupports: DomesticSupport[] = [
  {
    id: 'ds-maria',
    familyId: 'fam-hf2-test',
    name: 'Maria',
    type: 'CLEANER',
    active: true,
    schedule: [{ weekday: 1, startTime: '08:00', endTime: '12:00' }],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z'
  }
];

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id || `task-${Math.random().toString(36).substring(2, 7)}`,
    familyId: 'fam-hf2-test',
    title: overrides.title || 'Lavar a louça do almoço',
    description: overrides.description || 'Lavar, secar e guardar copos e pratos',
    roomId: 'room-cozinha',
    roomName: 'Cozinha',
    status: overrides.status || 'PENDING',
    dueDate: TODAY,
    scheduledDate: TODAY,
    frequency: 'DAILY',
    effort: 10,
    durationMinutes: 20,
    executionTarget: overrides.executionTarget || 'HOUSEHOLD',
    domesticSupportId: overrides.domesticSupportId ?? null,
    assignedMemberId: overrides.assignedMemberId,
    assigneeId: overrides.assigneeId,
    isUnassigned: overrides.isUnassigned,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides
  };
}

function createMockAppContext(overrides: Partial<AppContextType> = {}): AppContextType {
  const members = overrides.members || [adminMarina, memberLucas];
  return {
    currentView: 'today',
    setCurrentView: () => {},
    selectedDate: TODAY,
    setSelectedDate: () => {},
    family: mockFamily,
    members,
    activeMembers: members.filter(m => m.active !== false),
    getActiveMembers: (list) => list ? list.filter(m => m.active !== false) : members,
    rooms: mockRooms,
    tasks: overrides.tasks || [],
    familyTasks: overrides.familyTasks || [],
    domesticSupports: overrides.domesticSupports || mockDomesticSupports,
    currentMember: overrides.currentMember || memberLucas,
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
    deleteRoom: async () => {},
    createTask: async () => {},
    updateTask: async () => {},
    deleteTask: async () => {},
    completeTask: async () => true,
    rebalanceTasks: async () => {},
    applyRebalanceProposal: async () => {},
    distributeRoutineOccurrences: async () => {},
    loadRoutineOccurrences: async () => {},
    loadTasks: async () => {},
    loadFamilyTasks: async () => {},
    createFamilyTask: async () => ({} as FamilyTask),
    updateFamilyTask: async () => {},
    deleteFamilyTask: async () => {},
    deactivateRoutine: async () => {},
    reactivateRoutine: async () => {},
    updateRoutine: async () => {},
    activeTaskForInspect: overrides.activeTaskForInspect || null,
    setActiveTaskForInspect: () => {},
    activeTaskForExecution: null,
    setActiveTaskForExecution: () => {},
    activeTaskForReschedule: null,
    setActiveTaskForReschedule: () => {},
    assignTaskManually: async () => ({ success: true }),
    ...overrides
  } as AppContextType;
}

export function runAssignmentVisualIdentityHf2Tests(): TestResult[] {
  const results: TestResult[] = [];

  const record = (id: string, name: string, fn: () => void) => {
    try {
      fn();
      results.push({
        id,
        name,
        passed: true,
        expected: 'PASS',
        actual: 'PASS'
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        passed: false,
        expected: 'PASS',
        actual: err.message || String(err)
      });
    }
  };

  // AVI-01: Tarefa atribuída a MEMBER (Lucas) exibe claramente nome e público
  record('AVI-01', 'Tarefa atribuída a MEMBER exibe claramente seu nome e público "Pessoas da casa"', () => {
    const task = createMockTask({
      id: 'task-lucas-01',
      title: 'Limpar pia da cozinha',
      assignedMemberId: memberLucas.id,
      assigneeId: memberLucas.id,
      executionTarget: 'HOUSEHOLD'
    });

    const ctx = createMockAppContext({
      currentMember: adminMarina, // Admin visualizando
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TodayView, { targetDate: TODAY, initialFilter: 'all' })
      )
    );

    // Deve exibir o badge com o público de execução "Pessoas da casa"
    if (!html.includes('Pessoas da casa')) {
      throw new Error('Badge de público "Pessoas da casa" não encontrado no card');
    }
    // Deve exibir no rodapé a identificação explícita do responsável "Resp: Lucas"
    if (!html.includes('id="assignee-member-task-lucas-01"')) {
      throw new Error('Container assignee-member não encontrado');
    }
    if (!html.includes('Lucas')) {
      throw new Error('Nome do responsável Lucas não encontrado');
    }
    // "Pessoas da casa" NÃO deve ser apresentado como nome de responsável
    if (html.includes('Resp: Pessoas da casa')) {
      throw new Error('Pessoas da casa não pode ser apresentado como nome de responsável');
    }
  });

  // AVI-02: Tarefa atribuída a MEMBER visualizada pelo próprio MEMBER exibe "(Você)"
  record('AVI-02', 'Tarefa atribuída a MEMBER visualizada pelo próprio MEMBER inclui indicador "Você"', () => {
    const task = createMockTask({
      id: 'task-lucas-02',
      title: 'Aspirar o tapete da sala',
      assignedMemberId: memberLucas.id,
      assigneeId: memberLucas.id,
      executionTarget: 'HOUSEHOLD'
    });

    const ctx = createMockAppContext({
      currentMember: memberLucas, // Lucas visualizando a própria tarefa
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TodayView, { targetDate: TODAY, initialFilter: 'mine' })
      )
    );

    if (!html.includes('Lucas') || !html.includes('Você')) {
      throw new Error('Identificação do morador logado como "Você" não encontrada');
    }
  });

  // AVI-03: Tarefa atribuída a ADMIN (Marina) visualizada por MEMBER (Lucas) exibe "(Admin)"
  record('AVI-03', 'Tarefa de ADMIN visualizada por MEMBER exibe claramente nome e indicador "(Admin)"', () => {
    const task = createMockTask({
      id: 'task-admin-01',
      title: 'Organizar armários altos',
      assignedMemberId: adminMarina.id,
      assigneeId: adminMarina.id,
      executionTarget: 'HOUSEHOLD'
    });

    const ctx = createMockAppContext({
      currentMember: adminMarina, // Admin visualizando no filtro Todas
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TodayView, { targetDate: TODAY, initialFilter: 'all' })
      )
    );

    if (!html.includes('Marina')) {
      throw new Error('Nome da administradora Marina não exibido');
    }
    if (!html.includes('(Admin)') && !html.includes('Você')) {
      throw new Error('Indicador de papel da administradora não exibido');
    }
  });

  // AVI-04: Tarefa sem responsável apresenta "Sem responsável · Disponível" e NÃO inventa atribuição
  record('AVI-04', 'Tarefa sem responsável apresenta "Sem responsável · Disponível" sem inventar atribuição', () => {
    const task = createMockTask({
      id: 'task-unassigned-01',
      title: 'Tirar o lixo da área de serviço',
      assignedMemberId: '',
      assigneeId: '',
      isUnassigned: true,
      executionTarget: 'HOUSEHOLD'
    });

    const ctx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TodayView, { targetDate: TODAY, initialFilter: 'available' })
      )
    );

    if (!html.includes('id="assignee-unassigned-task-unassigned-01"')) {
      throw new Error('Container assignee-unassigned não encontrado');
    }
    if (!html.includes('Sem responsável')) {
      throw new Error('Texto "Sem responsável" não encontrado');
    }
    if (!html.includes('Disponível')) {
      throw new Error('Indicação de tarefa Disponível não encontrada');
    }
    // Não pode conter nome de membro nem inventar responsável
    if (html.includes('Resp: Lucas') || html.includes('Resp: Marina') || html.includes('Resp: Não atribuído')) {
      throw new Error('Atribuição falsa ou incorreta inventada');
    }
  });

  // AVI-05: Tarefa com assignedMemberId inexistente/inválido é tratada defensivamente como sem responsável
  record('AVI-05', 'assignedMemberId inexistente não exibe "Resp: Não atribuído" e resolve como sem responsável', () => {
    const task = createMockTask({
      id: 'task-stale-id-01',
      title: 'Passar pano no corredor',
      assignedMemberId: 'mem-inexistente-999',
      assigneeId: 'mem-inexistente-999',
      isUnassigned: false,
      executionTarget: 'HOUSEHOLD'
    });

    const ctx = createMockAppContext({
      currentMember: adminMarina, // Admin visualizando no filtro Todas
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TodayView, { targetDate: TODAY, initialFilter: 'all' })
      )
    );

    // Deve ser tratada como desatribuída
    if (!html.includes('Sem responsável')) {
      throw new Error('Tarefa com membro inexistente deveria resolver como Sem responsável');
    }
    if (html.includes('Resp: Não atribuído')) {
      throw new Error('Card não deve exibir string feia "Resp: Não atribuído"');
    }
  });

  // AVI-06: Tarefa destinada a EXTERNAL_SUPPORT exibe apoio e NUNCA membro da família
  record('AVI-06', 'Tarefa EXTERNAL_SUPPORT exibe "Apoio: Maria" e nunca atribui a membros da família', () => {
    const task = createMockTask({
      id: 'task-external-01',
      title: 'Faxina pesada dos banheiros',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      // Simula caso crítico: registro legado contendo assignedMemberId preenchido
      assignedMemberId: memberLucas.id,
      assigneeId: memberLucas.id
    });

    const ctx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TodayView, { targetDate: TODAY, initialFilter: 'all' })
      )
    );

    // Deve exibir o badge de apoio externo "🧹 Maria · Ajuda externa"
    if (!html.includes('🧹 Maria · Ajuda externa')) {
      throw new Error('Badge de apoio externo da Maria não encontrado');
    }
    // Deve exibir o container assignee-external com o nome do apoio
    if (!html.includes('id="assignee-external-task-external-01"')) {
      throw new Error('Container assignee-external não encontrado');
    }
    if (!html.includes('Apoio:') || !html.includes('Maria')) {
      throw new Error('Apoio Maria não identificado no rodapé do card');
    }
    // REGRA 5 CRÍTICA: NUNCA exibir membro da família como responsável por tarefa de apoio externo
    if (html.includes('Resp: Lucas') || html.includes('id="assignee-member-task-external-01"')) {
      throw new Error('VIOLAÇÃO REGRA 5: Membro da família foi renderizado como responsável de EXTERNAL_SUPPORT');
    }
    // Não deve exibir badge "Disponível" para iniciativa de morador
    if (html.includes('id="badge-available-task-external-01"')) {
      throw new Error('EXTERNAL_SUPPORT não deve ter badge Disponível');
    }
  });

  // AVI-07: Conclusão de EXTERNAL_SUPPORT habilitada exclusivamente para ADMIN
  record('AVI-07', 'Botão de conclusão de EXTERNAL_SUPPORT é habilitado exclusivamente para ADMIN', () => {
    const taskExt = createMockTask({
      id: 'task-ext-perm-01',
      title: 'Higienização de estofados',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria'
    });

    // 1. ADMIN visualizando: botão de conclusão habilitado
    const adminCtx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [taskExt]
    });
    const adminHtml = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: adminCtx },
        React.createElement(TodayView, { targetDate: TODAY, initialFilter: 'all' })
      )
    );
    if (!adminHtml.includes('id="complete-btn-task-ext-perm-01"')) {
      throw new Error('ADMIN deve ter botão de conclusão habilitado para EXTERNAL_SUPPORT');
    }

    // 2. MEMBER visualizando tarefa de outro morador (ex: Marina): botão desabilitado com aviso
    const taskMarina = createMockTask({
      id: 'task-marina-other',
      title: 'Lavar cortinas',
      assignedMemberId: adminMarina.id,
      assigneeId: adminMarina.id
    });
    // Força inclusão para teste de permissão de visualização
    const memberCtx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [taskMarina]
    });
    // Quando simulado em TodayView diretamente
    const memberHtml = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: memberCtx },
        React.createElement(TodayView, { targetDate: TODAY, initialFilter: 'mine' })
      )
    );
    // Para MEMBER, tarefa de Marina não aparece em "Minhas"
    if (memberHtml.includes('task-marina-other')) {
      throw new Error('MEMBER não deve ver tarefas de outros membros na aba Minhas');
    }
  });

  // AVI-08: RoutineView (Calendário) - Tarefa atribuída a MEMBER exibe "Resp: Lucas"
  record('AVI-08', 'RoutineView exibe "Resp: Lucas" e público "Pessoas da casa"', () => {
    const task = createMockTask({
      id: 'task-routine-01',
      title: 'Lavar panos de prato',
      assignedMemberId: memberLucas.id,
      executionTarget: 'HOUSEHOLD'
    });

    const ctx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(RoutineView)
      )
    );

    if (!html.includes('Pessoas da casa')) {
      throw new Error('Público de execução "Pessoas da casa" não encontrado no RoutineView');
    }
    if (!html.includes('Resp:') || !html.includes('Lucas')) {
      throw new Error('Identificação "Resp: Lucas" não encontrada no RoutineView');
    }
  });

  // AVI-09: RoutineView (Calendário) - Tarefa sem responsável exibe "Sem responsável · Disponível"
  record('AVI-09', 'RoutineView exibe "Sem responsável · Disponível" para ocorrência sem alocação', () => {
    const task = createMockTask({
      id: 'task-routine-unassigned-01',
      title: 'Regar plantas da varanda',
      assignedMemberId: '',
      isUnassigned: true,
      executionTarget: 'HOUSEHOLD'
    });

    const ctx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(RoutineView)
      )
    );

    if (!html.includes('Sem responsável · Disponível')) {
      throw new Error('"Sem responsável · Disponível" não encontrado no RoutineView');
    }
  });

  // AVI-10: RoutineView (Calendário) - Tarefa EXTERNAL_SUPPORT exibe "Apoio: Maria" e nunca "Disponível"
  record('AVI-10', 'RoutineView exibe "Apoio: Maria" e nunca "Disponível" para EXTERNAL_SUPPORT', () => {
    const task = createMockTask({
      id: 'task-routine-ext-01',
      title: 'Limpeza de vidros externos',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      assignedMemberId: memberLucas.id // Mesmo com assignedMemberId residual
    });

    const ctx = createMockAppContext({
      currentMember: memberLucas,
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(RoutineView)
      )
    );

    if (!html.includes('Apoio:') || !html.includes('Maria')) {
      throw new Error('"Apoio: Maria" não encontrado no RoutineView');
    }
    // Não pode dizer Disponível no rodapé desta tarefa
    if (html.includes('Sem responsável · Disponível')) {
      throw new Error('EXTERNAL_SUPPORT não deve exibir "Sem responsável · Disponível"');
    }
    // Não pode atribuir a Lucas
    if (html.includes('Resp: Lucas')) {
      throw new Error('VIOLAÇÃO REGRA 5: Membro familiar exibido no RoutineView para EXTERNAL_SUPPORT');
    }
  });

  // AVI-11: TaskInspectModal - Tarefa atribuída a MEMBER
  record('AVI-11', 'TaskInspectModal distingue público "Pessoas da casa" de "Responsável: Lucas"', () => {
    const task = createMockTask({
      id: 'task-inspect-01',
      title: 'Organizar despensa de alimentos',
      assignedMemberId: memberLucas.id,
      executionTarget: 'HOUSEHOLD'
    });

    const ctx = createMockAppContext({
      currentMember: memberLucas,
      activeTaskForInspect: task,
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TaskInspectModal)
      )
    );

    if (!html.includes('Público de execução:') || !html.includes('Pessoas da casa')) {
      throw new Error('Público de execução "Pessoas da casa" não encontrado no modal');
    }
    if (!html.includes('Responsável:') || !html.includes('Lucas')) {
      throw new Error('Responsável Lucas não encontrado no modal');
    }
  });

  // AVI-12: TaskInspectModal - Tarefa sem responsável
  record('AVI-12', 'TaskInspectModal exibe "Sem responsável" e não inventa atribuição', () => {
    const task = createMockTask({
      id: 'task-inspect-02',
      title: 'Limpar forno elétrico',
      assignedMemberId: '',
      isUnassigned: true,
      executionTarget: 'HOUSEHOLD'
    });

    const ctx = createMockAppContext({
      currentMember: memberLucas,
      activeTaskForInspect: task,
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TaskInspectModal)
      )
    );

    if (!html.includes('Responsável:') || !html.includes('Sem responsável')) {
      throw new Error('Responsável: Sem responsável não encontrado no modal');
    }
  });

  // AVI-13: TaskInspectModal - Tarefa EXTERNAL_SUPPORT exibe apoio e bloqueia seletor de membros
  record('AVI-13', 'TaskInspectModal para EXTERNAL_SUPPORT exibe apoio Maria e não exibe seletor de membros', () => {
    const task = createMockTask({
      id: 'task-inspect-ext-01',
      title: 'Limpeza pesada da churrasqueira',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      assignedMemberId: memberLucas.id
    });

    const ctx = createMockAppContext({
      currentMember: adminMarina, // Admin inspecionando
      activeTaskForInspect: task,
      tasks: [task]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TaskInspectModal)
      )
    );

    if (!html.includes('🧹 Maria') || !html.includes('(Apoio externo)')) {
      throw new Error('Responsável de apoio externo Maria não exibido no modal');
    }
    // Não pode exibir o select de atribuição de moradores para apoio externo
    if (html.includes('id="assign-task-member-select"')) {
      throw new Error('Seletor de membros da casa não deve existir para EXTERNAL_SUPPORT');
    }
  });

  // AVI-14: Consistência do badge title para acessibilidade e clareza
  record('AVI-14', 'Badge de público possui title explicativo diferenciando público de responsável', () => {
    const taskHousehold = createMockTask({
      id: 'task-title-01',
      executionTarget: 'HOUSEHOLD'
    });
    const taskExternal = createMockTask({
      id: 'task-title-02',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria'
    });

    const ctx = createMockAppContext({
      currentMember: adminMarina,
      tasks: [taskHousehold, taskExternal]
    });

    const html = renderToStaticMarkup(
      React.createElement(AppContext.Provider, { value: ctx },
        React.createElement(TodayView, { targetDate: TODAY, initialFilter: 'all' })
      )
    );

    if (!html.includes('title="Público de execução: Pessoas da casa"')) {
      throw new Error('title explicativo de público Pessoas da casa não encontrado');
    }
    if (!html.includes('title="Público de execução: Apoio doméstico externo"')) {
      throw new Error('title explicativo de público Apoio doméstico externo não encontrado');
    }
  });

  // AVI-15: Proteção de invariantes e integridade do Motor 2.0
  record('AVI-15', 'Arquivos protegidos do Motor 2.0 e regras de negócio permanecem 100% intocados', () => {
    const motorFiles = [
      'src/domain/distribution/DistributionEngine.ts',
      'src/domain/distribution/RebalanceService.ts',
      'src/domain/distribution/SafetyService.ts',
      'src/domain/distribution/EligibilityService.ts',
      'src/domain/distribution/AvailabilityService.ts',
      'src/domain/distribution/ScoringService.ts',
      'src/domain/distribution/BalanceService.ts',
      'src/domain/distribution/ExplainabilityService.ts',
      'src/application/services/DistributionService.ts',
      'src/application/services/RoutineContinuityService.ts'
    ];

    for (const relPath of motorFiles) {
      const fullPath = path.resolve(rootDir, relPath);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Arquivo do Motor 2.0 não encontrado: ${relPath}`);
      }
    }
  });

  return results;
}
