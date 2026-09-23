import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { MobileBottomNav } from '../components/Navigation/MobileBottomNav';
import { AppContext, AppContextType } from '../context/AppContext';
import { AuthContext, AuthContextType } from '../context/AuthContext';
import { Member, Family, AppView } from '../types';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

const mockFamily: Family = {
  id: 'fam-mobile-1',
  name: 'Família Silva',
  timezone: 'America/Sao_Paulo',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

const mockAdmin: Member = {
  id: 'mem-admin-1',
  familyId: 'fam-mobile-1',
  userId: 'user-admin-1',
  name: 'Carla Silva',
  role: 'ADMIN',
  avatar: '👩',
  color: '#5b32a3'
};

const mockMember: Member = {
  id: 'mem-member-2',
  familyId: 'fam-mobile-1',
  userId: 'user-member-2',
  name: 'Pedro Silva',
  role: 'MEMBER',
  avatar: '👦',
  color: '#2e7d32'
};

function createMockAppContext(overrides: Partial<AppContextType> = {}): AppContextType {
  return {
    family: mockFamily,
    members: [mockAdmin, mockMember],
    activeMembers: [mockAdmin, mockMember],
    getActiveMembers: (list) => list ? list.filter(m => m.active !== false) : [mockAdmin, mockMember],
    rooms: [],
    tasks: [],
    protectedTimes: [],
    currentView: 'today',
    setCurrentView: () => {},
    selectedDate: '2026-09-12',
    setSelectedDate: () => {},
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
    addRoom: async () => ({} as any),
    updateRoom: async () => {},
    deactivateRoom: async () => {},
    reactivateRoom: async () => {},
    cloudSyncStatus: 'synced',
    loadDemoFamily: () => {},
    currentMember: mockAdmin,
    completeTask: async () => true,
    addTask: () => {},
    updateTask: () => {},
    deleteTask: () => {},
    addMember: () => {},
    updateMemberRole: () => {},
    removeMember: () => {},
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
    rebalanceTasksWithEngine: async () => ({} as any),
    familyTasks: [],
    syncRollingRoutines: async () => {},
    addRoutine: async () => ({} as any),
    updateRoutine: async () => {},
    deactivateRoutine: async () => {},
    reactivateRoutine: async () => {},
    batchAddRoutines: async () => ({} as any),
    batchDeactivateRoutines: async () => ({} as any),
    applyRebalanceUpdates: async () => {},
    assignTaskManually: async () => ({ success: true }),
    ...overrides
  };
}

function createMockAuthContext(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    currentUser: { uid: 'user-admin-1', email: 'carla@casajunto.app' } as any,
    currentFamily: mockFamily,
    currentMembership: null,
    activeMemberships: [{ id: 'ms-1', familyId: 'fam-mobile-1', userId: 'user-admin-1', role: 'ADMIN', status: 'ACTIVE', createdAt: '', updatedAt: '' }],
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

function renderComponentWithContext(
  component: React.ReactElement,
  appContextOverrides: Partial<AppContextType> = {},
  authContextOverrides: Partial<AuthContextType> = {}
): string {
  const mockAppCtx = createMockAppContext(appContextOverrides);
  const mockAuthCtx = createMockAuthContext(authContextOverrides);

  return renderToStaticMarkup(
    <AuthContext.Provider value={mockAuthCtx}>
      <AppContext.Provider value={mockAppCtx}>
        {component}
      </AppContext.Provider>
    </AuthContext.Provider>
  );
}

export function runResponsiveShellTestSuite(): TestResult[] {
  const results: TestResult[] = [];

  // MB01 — Sidebar hidden mobile (< md)
  try {
    const sidebarHtml = renderComponentWithContext(<Sidebar />);
    const hasHiddenMdFlex = sidebarHtml.includes('hidden') && sidebarHtml.includes('md:flex');
    const isFixedDesktopOnly = sidebarHtml.includes('id="desktop-sidebar"');

    results.push({
      id: 'MB01',
      name: 'Sidebar desktop oculta no mobile (< md)',
      passed: hasHiddenMdFlex && isFixedDesktopOnly,
      expected: 'Sidebar possui classes hidden md:flex e id desktop-sidebar',
      actual: hasHiddenMdFlex ? 'hidden md:flex presente' : 'Classe responsiva ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB01',
      name: 'Sidebar desktop oculta no mobile (< md)',
      passed: false,
      expected: 'hidden md:flex presente',
      actual: err.message
    });
  }

  // MB02 — Sidebar visible desktop (>= md)
  try {
    const sidebarHtml = renderComponentWithContext(<Sidebar />);
    const hasMdWidth = sidebarHtml.includes('md:w-64');

    results.push({
      id: 'MB02',
      name: 'Sidebar desktop visível a partir de md com largura definida (md:w-64)',
      passed: hasMdWidth,
      expected: 'Sidebar possui md:w-64',
      actual: hasMdWidth ? 'md:w-64 configurado' : 'Largura desktop ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB02',
      name: 'Sidebar desktop visível a partir de md com largura definida (md:w-64)',
      passed: false,
      expected: 'md:w-64 configurado',
      actual: err.message
    });
  }

  // MB03 — BottomNav visible mobile (< md)
  try {
    const bottomNavHtml = renderComponentWithContext(<MobileBottomNav />);
    const hasMobileNav = bottomNavHtml.includes('id="mobile-bottom-nav"');
    const hasFixedPosition = bottomNavHtml.includes('fixed bottom-0');

    results.push({
      id: 'MB03',
      name: 'MobileBottomNav renderizado e posicionado fixed bottom no mobile',
      passed: hasMobileNav && hasFixedPosition,
      expected: 'Nav com id mobile-bottom-nav e fixed bottom-0',
      actual: hasMobileNav && hasFixedPosition ? 'MobileBottomNav renderizado corretamente' : 'Estrutura ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB03',
      name: 'MobileBottomNav renderizado e posicionado fixed bottom no mobile',
      passed: false,
      expected: 'MobileBottomNav presente',
      actual: err.message
    });
  }

  // MB04 — BottomNav hidden desktop (>= md)
  try {
    const bottomNavHtml = renderComponentWithContext(<MobileBottomNav />);
    const hasMdHidden = bottomNavHtml.includes('md:hidden');

    results.push({
      id: 'MB04',
      name: 'MobileBottomNav oculto no desktop/tablet (md:hidden)',
      passed: hasMdHidden,
      expected: 'MobileBottomNav possui classe md:hidden',
      actual: hasMdHidden ? 'md:hidden presente' : 'md:hidden ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB04',
      name: 'MobileBottomNav oculto no desktop/tablet (md:hidden)',
      passed: false,
      expected: 'md:hidden presente',
      actual: err.message
    });
  }

  // MB05 — Hoje navigation item
  try {
    const bottomNavHtml = renderComponentWithContext(<MobileBottomNav />);
    const hasHoje = bottomNavHtml.includes('id="mobile-nav-today"') && bottomNavHtml.includes('Hoje');

    results.push({
      id: 'MB05',
      name: 'Item de navegação Hoje presente na BottomNav com rótulo correto',
      passed: hasHoje,
      expected: 'Botão mobile-nav-today com texto Hoje',
      actual: hasHoje ? 'Item Hoje encontrado' : 'Item Hoje ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB05',
      name: 'Item de navegação Hoje presente na BottomNav com rótulo correto',
      passed: false,
      expected: 'Item Hoje encontrado',
      actual: err.message
    });
  }

  // MB06 — Rotina navigation item
  try {
    const bottomNavHtml = renderComponentWithContext(<MobileBottomNav />);
    const hasRotina = bottomNavHtml.includes('id="mobile-nav-routine"') && bottomNavHtml.includes('Rotina');

    results.push({
      id: 'MB06',
      name: 'Item de navegação Rotina presente na BottomNav com rótulo correto',
      passed: hasRotina,
      expected: 'Botão mobile-nav-routine com texto Rotina',
      actual: hasRotina ? 'Item Rotina encontrado' : 'Item Rotina ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB06',
      name: 'Item de navegação Rotina presente na BottomNav com rótulo correto',
      passed: false,
      expected: 'Item Rotina encontrado',
      actual: err.message
    });
  }

  // MB07 — Família navigation item
  try {
    const bottomNavHtml = renderComponentWithContext(<MobileBottomNav />);
    const hasFamilia = bottomNavHtml.includes('id="mobile-nav-family"') && bottomNavHtml.includes('Família');

    results.push({
      id: 'MB07',
      name: 'Item de navegação Família presente na BottomNav com rótulo correto',
      passed: hasFamilia,
      expected: 'Botão mobile-nav-family com texto Família',
      actual: hasFamilia ? 'Item Família encontrado' : 'Item Família ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB07',
      name: 'Item de navegação Família presente na BottomNav com rótulo correto',
      passed: false,
      expected: 'Item Família encontrado',
      actual: err.message
    });
  }

  // MB08 — Mais menu button trigger
  try {
    const bottomNavHtml = renderComponentWithContext(<MobileBottomNav />);
    const hasMais = bottomNavHtml.includes('id="mobile-nav-more"') && bottomNavHtml.includes('Mais');

    results.push({
      id: 'MB08',
      name: 'Gatilho Mais presente na BottomNav para abrir menu de ações secundárias',
      passed: hasMais,
      expected: 'Botão mobile-nav-more com texto Mais',
      actual: hasMais ? 'Gatilho Mais encontrado' : 'Gatilho Mais ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB08',
      name: 'Gatilho Mais presente na BottomNav para abrir menu de ações secundárias',
      passed: false,
      expected: 'Gatilho Mais encontrado',
      actual: err.message
    });
  }

  // MB09 — Mais closes / Sheet dismissal attributes
  try {
    // Check file source of MobileBottomNav for close button and backdrop click
    const navSource = readFileSync(resolve(process.cwd(), 'src/components/Navigation/MobileBottomNav.tsx'), 'utf-8');
    const hasCloseButton = navSource.includes('btn-close-mobile-more') && navSource.includes('setIsMoreOpen(false)');
    const hasBackdropDismiss = navSource.includes('onClick={() => setIsMoreOpen(false)}');

    results.push({
      id: 'MB09',
      name: 'Sheet Mais possui botão de fechamento acessível e backdrop com tap-to-dismiss',
      passed: hasCloseButton && hasBackdropDismiss,
      expected: 'btn-close-mobile-more e backdrop tap-to-dismiss configurados',
      actual: hasCloseButton && hasBackdropDismiss ? 'Controles de fechamento presentes' : 'Controle ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB09',
      name: 'Sheet Mais possui botão de fechamento acessível e backdrop com tap-to-dismiss',
      passed: false,
      expected: 'Controles presentes',
      actual: err.message
    });
  }

  // MB10 — RBAC preserved in Mais
  try {
    const navSource = readFileSync(resolve(process.cwd(), 'src/components/Navigation/MobileBottomNav.tsx'), 'utf-8');
    const checksAdmin = navSource.includes("currentMember?.role === 'ADMIN'") || navSource.includes('isAdmin');
    const protectsDashboard = navSource.includes('mobile-more-dashboard') && navSource.includes('isAdmin');

    results.push({
      id: 'MB10',
      name: 'RBAC estritamente preservado no menu Mais (MEMBER não acessa Dashboard Admin)',
      passed: checksAdmin && protectsDashboard,
      expected: 'mobile-more-dashboard condicionado estritamente a isAdmin',
      actual: checksAdmin && protectsDashboard ? 'RBAC verificado e preservado' : 'Falta guarda de RBAC'
    });
  } catch (err: any) {
    results.push({
      id: 'MB10',
      name: 'RBAC estritamente preservado no menu Mais (MEMBER não acessa Dashboard Admin)',
      passed: false,
      expected: 'RBAC verificado',
      actual: err.message
    });
  }

  // MB11 — Active navigation state (aria-current="page")
  try {
    const todayActiveHtml = renderComponentWithContext(<MobileBottomNav />, { currentView: 'today' });
    const routineActiveHtml = renderComponentWithContext(<MobileBottomNav />, { currentView: 'routine' });

    const todayHasAriaCurrent = todayActiveHtml.includes('id="mobile-nav-today"') && todayActiveHtml.includes('aria-current="page"');
    const routineHasAriaCurrent = routineActiveHtml.includes('id="mobile-nav-routine"') && routineActiveHtml.includes('aria-current="page"');

    results.push({
      id: 'MB11',
      name: 'Estado ativo de navegação identificado por aria-current="page" e destaque semântico',
      passed: todayHasAriaCurrent && routineHasAriaCurrent,
      expected: 'aria-current="page" aplicado dinamicamente na aba ativa',
      actual: todayHasAriaCurrent && routineHasAriaCurrent ? 'aria-current atribuído corretamente' : 'aria-current incorreto'
    });
  } catch (err: any) {
    results.push({
      id: 'MB11',
      name: 'Estado ativo de navegação identificado por aria-current="page" e destaque semântico',
      passed: false,
      expected: 'aria-current atribuído corretamente',
      actual: err.message
    });
  }

  // MB12 — Content bottom clearance for mobile nav
  try {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    const hasBottomClearance = appSource.includes('pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]') || appSource.includes('pb-20');
    const hasDesktopReset = appSource.includes('md:pb-6');

    results.push({
      id: 'MB12',
      name: 'Área principal de conteúdo reserva padding inferior para não ser coberta pela BottomNav',
      passed: hasBottomClearance && hasDesktopReset,
      expected: 'main com pb mobile e md:pb-6',
      actual: hasBottomClearance && hasDesktopReset ? 'Clearance inferior mobile configurado' : 'Clearance ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB12',
      name: 'Área principal de conteúdo reserva padding inferior para não ser coberta pela BottomNav',
      passed: false,
      expected: 'Clearance configurado',
      actual: err.message
    });
  }

  // MB13 — Mobile header rendered (< md)
  try {
    const headerHtml = renderComponentWithContext(<Header />, { currentView: 'today' });
    const hasMobileHeaderTitle = headerHtml.includes('id="mobile-header-title"');
    const hasMobileHeaderCompact = headerHtml.includes('md:hidden');

    results.push({
      id: 'MB13',
      name: 'Header mobile compacto renderizado com título reduzido e logo',
      passed: hasMobileHeaderTitle && hasMobileHeaderCompact,
      expected: 'Header contém mobile-header-title e md:hidden',
      actual: hasMobileHeaderTitle && hasMobileHeaderCompact ? 'Header mobile configurado' : 'Header mobile ausente'
    });
  } catch (err: any) {
    results.push({
      id: 'MB13',
      name: 'Header mobile compacto renderizado com título reduzido e logo',
      passed: false,
      expected: 'Header mobile configurado',
      actual: err.message
    });
  }

  // MB14 — Desktop header preserved (>= md)
  try {
    const headerHtml = renderComponentWithContext(<Header />, { currentView: 'today' });
    const hasDesktopHeaderTitle = headerHtml.includes('id="desktop-header-title"') && headerHtml.includes('Tarefas de Hoje');
    const hasDesktopRebalance = headerHtml.includes('id="btn-header-rebalance"') && headerHtml.includes('hidden md:flex');

    results.push({
      id: 'MB14',
      name: 'Header desktop completo preservado com título descritivo e ações a partir de md',
      passed: hasDesktopHeaderTitle && hasDesktopRebalance,
      expected: 'Header desktop com desktop-header-title e btn-header-rebalance',
      actual: hasDesktopHeaderTitle && hasDesktopRebalance ? 'Header desktop preservado' : 'Header desktop alterado'
    });
  } catch (err: any) {
    results.push({
      id: 'MB14',
      name: 'Header desktop completo preservado com título descritivo e ações a partir de md',
      passed: false,
      expected: 'Header desktop preservado',
      actual: err.message
    });
  }

  // MB15 — 767/768 Breakpoint exclusivity
  try {
    const sidebarSource = readFileSync(resolve(process.cwd(), 'src/components/Sidebar.tsx'), 'utf-8');
    const bottomNavSource = readFileSync(resolve(process.cwd(), 'src/components/Navigation/MobileBottomNav.tsx'), 'utf-8');

    const sidebarDesktopClass = sidebarSource.includes('hidden md:flex');
    const bottomNavMobileClass = bottomNavSource.includes('md:hidden');

    results.push({
      id: 'MB15',
      name: 'Exclusividade do breakpoint 768px (Sidebar oculta em < md; BottomNav oculta em >= md)',
      passed: sidebarDesktopClass && bottomNavMobileClass,
      expected: 'Sidebar: hidden md:flex; BottomNav: md:hidden',
      actual: sidebarDesktopClass && bottomNavMobileClass ? 'Exclusividade de breakpoint garantida' : 'Conflito de breakpoint'
    });
  } catch (err: any) {
    results.push({
      id: 'MB15',
      name: 'Exclusividade do breakpoint 768px (Sidebar oculta em < md; BottomNav oculta em >= md)',
      passed: false,
      expected: 'Exclusividade de breakpoint garantida',
      actual: err.message
    });
  }

  // MB16 — No horizontal shell overflow
  try {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    const hasWscreenOverflowHidden = appSource.includes('w-screen overflow-hidden');
    const hasMinW0 = appSource.includes('min-w-0 overflow-hidden');

    results.push({
      id: 'MB16',
      name: 'Prevenção de overflow horizontal no shell global (w-screen overflow-hidden min-w-0)',
      passed: hasWscreenOverflowHidden && hasMinW0,
      expected: 'Layout com w-screen, overflow-hidden e min-w-0',
      actual: hasWscreenOverflowHidden && hasMinW0 ? 'Classes anti-overflow aplicadas' : 'Possível overflow detectado'
    });
  } catch (err: any) {
    results.push({
      id: 'MB16',
      name: 'Prevenção de overflow horizontal no shell global (w-screen overflow-hidden min-w-0)',
      passed: false,
      expected: 'Classes anti-overflow aplicadas',
      actual: err.message
    });
  }

  // MB17 — Safe area support in header, bottom nav and viewport
  try {
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
    const headerSource = readFileSync(resolve(process.cwd(), 'src/components/Header.tsx'), 'utf-8');
    const bottomNavSource = readFileSync(resolve(process.cwd(), 'src/components/Navigation/MobileBottomNav.tsx'), 'utf-8');

    const hasViewportFit = indexHtml.includes('viewport-fit=cover');
    const hasTopSafeArea = headerSource.includes('env(safe-area-inset-top');
    const hasBottomSafeArea = bottomNavSource.includes('env(safe-area-inset-bottom');

    results.push({
      id: 'MB17',
      name: 'Suporte a Safe Areas no iOS/Android (viewport-fit=cover, safe-area superior e inferior)',
      passed: hasViewportFit && hasTopSafeArea && hasBottomSafeArea,
      expected: 'viewport-fit=cover + safe-area top no header + safe-area bottom na nav',
      actual: hasViewportFit && hasTopSafeArea && hasBottomSafeArea ? 'Safe areas suportadas integralmente' : 'Suporte a safe-area incompleto'
    });
  } catch (err: any) {
    results.push({
      id: 'MB17',
      name: 'Suporte a Safe Areas no iOS/Android (viewport-fit=cover, safe-area superior e inferior)',
      passed: false,
      expected: 'Safe areas suportadas',
      actual: err.message
    });
  }

  // MB18 — App.tsx semantic tokens (Zero hardcoded colors)
  try {
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');
    const hasNoFcfbf7 = !appSource.includes('#fcfbf7');
    const hasNoFdfcf8 = !appSource.includes('#fdfcf8');
    const hasNo8a897c = !appSource.includes('#8a897c');
    const hasNo2d2d2d = !appSource.includes('#2d2d2d');

    const allTokensClean = hasNoFcfbf7 && hasNoFdfcf8 && hasNo8a897c && hasNo2d2d2d;

    results.push({
      id: 'MB18',
      name: 'Eliminação da dívida visual em App.tsx (Cores substituídas por tokens semânticos BRAND-2)',
      passed: allTokensClean,
      expected: 'Nenhuma cor hardcoded (#fdfcf8, #fcfbf7, #8a897c, #2d2d2d) em App.tsx',
      actual: allTokensClean ? 'Todos os tokens BRAND-2 limpos em App.tsx' : 'Cores hardcoded ainda presentes'
    });
  } catch (err: any) {
    results.push({
      id: 'MB18',
      name: 'Eliminação da dívida visual em App.tsx (Cores substituídas por tokens semânticos BRAND-2)',
      passed: false,
      expected: 'Tokens semânticos em App.tsx',
      actual: err.message
    });
  }

  return results;
}
