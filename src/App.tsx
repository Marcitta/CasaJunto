import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MobileBottomNav } from './components/Navigation/MobileBottomNav';
import { RightSidebar } from './components/RightSidebar';
import { TodayView } from './components/TodayView';
import { RoutineView } from './components/RoutineView';
import { FamilyView } from './components/FamilyView';
import { HouseView } from './components/HouseView';
import { TaskCatalogView } from './components/TaskCatalogView';
import { StatsView } from './components/StatsView';
import { AdminDashboardView } from './components/AdminDashboardView';
import { DomesticSupportView } from './components/DomesticSupport/DomesticSupportView';
import { TaskExecutionModal } from './components/TaskExecutionModal';
import { RescheduleModal } from './components/RescheduleModal';
import { ChaosSessionModal } from './components/Chaos/ChaosSessionModal';
import { ChaosControlledPromptModal } from './components/Chaos/ChaosControlledPromptModal';
import { WhatsAppModal } from './components/WhatsAppModal';
import { TaskInspectModal } from './components/TaskInspectModal';
import { RebalanceModal } from './components/RebalanceModal';
import { MemberProfileModal } from './components/MemberProfile/MemberProfileModal';
import { ValidationCenterDashboard } from './components/ValidationCenter/ValidationCenterDashboard';
import { OnboardingWizard } from './components/Onboarding/OnboardingWizard';
import { AuthModal } from './components/Auth/AuthModal';
import { CreateFamilyModal } from './components/Auth/CreateFamilyModal';
import { FamilySelectorModal } from './components/Auth/FamilySelectorModal';
import { WelcomeScreen } from './components/Auth/WelcomeScreen';
import { NoFamilyView } from './components/Auth/NoFamilyView';
import { FamilyLoadErrorView } from './components/Auth/FamilyLoadErrorView';
import { JoinFamilyModal } from './components/Auth/JoinFamilyModal';
import { DemoBanner } from './components/DemoBanner';
import { canAccessTab } from './domain/rbac/rolePermissions';

const AppContent: React.FC = () => {
  const { 
    currentUser, 
    currentFamily, 
    isAuthLoading, 
    isDemoMode,
    enterDemoMode,
    signOut,
    refreshUserMemberships,
    familyLoadError
  } = useAuth();

  const { 
    currentView, 
    setCurrentView,
    currentMember,
    isAuthModalOpen, 
    closeAuthModal,
    openAuthModal,
    isCreateFamilyModalOpen,
    closeCreateFamilyModal,
    openCreateFamilyModal,
    isFamilySelectorOpen,
    closeFamilySelector
  } = useApp();

  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup'>('login');
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [isJoinFamilyModalOpen, setIsJoinFamilyModalOpen] = useState(false);

  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';

  // RB04: Fail-closed navigation guard: redirect unauthorized view to 'today' for MEMBER
  useEffect(() => {
    if (!isDemoMode && currentMember && currentMember.role !== 'ADMIN') {
      if (!canAccessTab(currentMember.role, currentView)) {
        setCurrentView('today');
      }
    }
  }, [currentMember, currentView, isDemoMode, setCurrentView]);

  // RB27: Fail-closed navigation guard: close CreateFamilyModal for MEMBER
  useEffect(() => {
    if (!isDemoMode && currentMember && currentMember.role !== 'ADMIN') {
      if (isCreateFamilyModalOpen) {
        closeCreateFamilyModal();
      }
    }
  }, [currentMember, isCreateFamilyModalOpen, isDemoMode, closeCreateFamilyModal]);

  // 1. Loading State: minimal branding while checking session
  if (isAuthLoading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-surface-page text-text-primary select-none font-sans">
        <img
          src="/brand/casajunto-compact.png"
          alt="CasaJunto"
          className="h-14 sm:h-16 w-auto max-w-[200px] object-contain animate-pulse"
          referrerPolicy="no-referrer"
        />
        <p className="mt-4 text-xs font-semibold tracking-wider text-text-muted uppercase">
          Carregando seu lar...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated State (not in demo, not logged in)
  if (!currentUser && !isDemoMode) {
    return (
      <>
        <WelcomeScreen 
          onOpenLogin={() => {
            setAuthModalTab('login');
            openAuthModal();
          }}
          onOpenSignUp={() => {
            setAuthModalTab('signup');
            openAuthModal();
          }}
        />
        <AuthModal 
          isOpen={isAuthModalOpen} 
          initialTab={authModalTab} 
          onClose={closeAuthModal} 
        />
      </>
    );
  }

  // 2.5 Technical Error during Family Loading (e.g. Firestore Quota Exceeded)
  if (currentUser && familyLoadError && !isDemoMode) {
    return (
      <FamilyLoadErrorView
        error={familyLoadError}
        onRetry={refreshUserMemberships}
        onEnterDemo={enterDemoMode}
        onSignOut={signOut}
      />
    );
  }

  // 3. Authenticated but user has no active family and not demo
  if (currentUser && !currentFamily && !isDemoMode) {
    return (
      <>
        <NoFamilyView 
          onOpenCreateFamily={openCreateFamilyModal} 
          onOpenJoinFamily={() => setIsJoinFamilyModalOpen(true)}
          onEnterDemo={enterDemoMode}
        />
        <CreateFamilyModal 
          isOpen={isCreateFamilyModalOpen} 
          onClose={closeCreateFamilyModal} 
        />
        <JoinFamilyModal
          isOpen={isJoinFamilyModalOpen}
          onClose={() => setIsJoinFamilyModalOpen(false)}
        />
      </>
    );
  }

  // 4. Authenticated with Family OR Demo Mode: Full Main Application
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-surface-page text-text-primary">
      {/* Top Banner when in Demo Mode */}
      {isDemoMode && <DemoBanner />}

      <div className="flex flex-1 overflow-hidden">
        {/* Left Navigation Sidebar (desktop only, hidden md:flex) */}
        <Sidebar />

        {/* Main Central Workspace */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />

          <main 
            id="main-content-scroll"
            className="flex-1 overflow-y-auto bg-surface-page pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-6"
          >
            {(currentView === 'today' || (!isAdmin && !canAccessTab(currentMember?.role, currentView))) && <TodayView />}
            {currentView === 'routine' && <RoutineView />}
            {currentView === 'family' && isAdmin && <FamilyView />}
            {currentView === 'house' && isAdmin && <HouseView />}
            {currentView === 'catalog' && isAdmin && <TaskCatalogView />}
            {currentView === 'stats' && <StatsView />}
            {currentView === 'dashboard' && isAdmin && <AdminDashboardView />}
            {currentView === 'domestic_support' && isAdmin && <DomesticSupportView />}
          </main>
        </div>

        {/* Right Info & Leaderboard Sidebar (desktop only, hidden lg:flex, hidden in catalog view) */}
        {currentView !== 'catalog' && <RightSidebar />}
      </div>

      {/* Mobile Bottom Navigation (< md only) */}
      <MobileBottomNav />

      {/* Global Modals & Wizards */}
      <TaskExecutionModal />
      <RescheduleModal />
      <ChaosSessionModal />
      <ChaosControlledPromptModal />
      <WhatsAppModal isOpen={isWhatsAppOpen} onClose={() => setIsWhatsAppOpen(false)} />
      <TaskInspectModal />
      <RebalanceModal />
      <MemberProfileModal />
      <ValidationCenterDashboard />
      <OnboardingWizard />

      <AuthModal 
        isOpen={isAuthModalOpen} 
        initialTab={authModalTab} 
        onClose={closeAuthModal} 
      />

      <CreateFamilyModal 
        isOpen={isCreateFamilyModalOpen && isAdmin} 
        onClose={closeCreateFamilyModal} 
      />

      <FamilySelectorModal 
        isOpen={isFamilySelectorOpen} 
        onClose={closeFamilySelector} 
      />

      <JoinFamilyModal
        isOpen={isJoinFamilyModalOpen}
        onClose={() => setIsJoinFamilyModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
}
