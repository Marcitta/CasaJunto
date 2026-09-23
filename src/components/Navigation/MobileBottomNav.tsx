import React, { useState } from 'react';
import { 
  Calendar, 
  CheckSquare, 
  Users, 
  Menu, 
  X, 
  Home, 
  Layers, 
  BarChart3, 
  ShieldAlert, 
  Zap, 
  LogOut, 
  SlidersHorizontal,
  ChevronRight,
  User
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { AppView } from '../../types';

export const MobileBottomNav: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    family,
    isDemoMode,
    openFamilySelector,
    currentMember,
    openMemberProfile,
    setIsBlitzModalOpen,
    setIsChaosModalOpen,
    activeChaosSession,
    setIsRebalanceModalOpen
  } = useApp();

  const {
    currentUser,
    activeMemberships,
    signOut,
    exitDemoMode
  } = useAuth();

  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const isAdmin = currentMember?.role === 'ADMIN' || isDemoMode;

  // Primary destinations for mobile bottom nav
  // ADMIN has: Hoje, Rotina, Família. MEMBER has: Hoje, Rotina, Conquistas (Família is admin-only).
  const primaryNavItems: { id: AppView; label: string; icon: React.FC<{ className?: string }> }[] = isAdmin
    ? [
        { id: 'today', label: 'Hoje', icon: Calendar },
        { id: 'routine', label: 'Rotina', icon: CheckSquare },
        { id: 'family', label: 'Família', icon: Users }
      ]
    : [
        { id: 'today', label: 'Hoje', icon: Calendar },
        { id: 'routine', label: 'Rotina', icon: CheckSquare },
        { id: 'stats', label: 'Conquistas', icon: BarChart3 }
      ];

  // Secondary items shown in the "Mais" menu
  const isMoreActive = isAdmin
    ? ['house', 'catalog', 'stats', 'dashboard'].includes(currentView)
    : false;

  const handleSelectView = (view: AppView) => {
    setCurrentView(view);
    setIsMoreOpen(false);
  };

  return (
    <>
      {/* 1. Fixed Bottom Navigation Bar (< md only) */}
      <nav 
        id="mobile-bottom-nav"
        aria-label="Navegação móvel principal"
        className="fixed bottom-0 left-0 right-0 z-40 bg-surface-card border-t border-border-default md:hidden pb-[max(env(safe-area-inset-bottom,0px),6px)] select-none shadow-lg"
      >
        <div className="grid grid-cols-4 items-stretch h-14">
          {/* Primary Nav Items: Hoje, Rotina, Família */}
          {primaryNavItems.map(item => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                id={`mobile-nav-${item.id}`}
                onClick={() => handleSelectView(item.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer relative px-1 ${
                  isActive 
                    ? 'text-brand-primary font-bold' 
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 w-8 h-0.5 bg-brand-primary rounded-full" />
                )}
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.75px]'}`} />
                <span className="text-[11px] leading-tight tracking-tight truncate w-full text-center">
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* 4th Item: Mais (Secondary & Administrative Routes) */}
          <button
            id="mobile-nav-more"
            onClick={() => setIsMoreOpen(true)}
            aria-expanded={isMoreOpen}
            aria-label="Mais opções e configurações"
            aria-current={isMoreActive ? 'page' : undefined}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer relative px-1 ${
              isMoreOpen || isMoreActive
                ? 'text-brand-primary font-bold' 
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {(isMoreOpen || isMoreActive) && (
              <span className="absolute top-0 w-8 h-0.5 bg-brand-primary rounded-full" />
            )}
            <Menu className={`w-5 h-5 ${isMoreOpen || isMoreActive ? 'stroke-[2.5px]' : 'stroke-[1.75px]'}`} />
            <span className="text-[11px] leading-tight tracking-tight truncate w-full text-center">
              Mais
            </span>
          </button>
        </div>
      </nav>

      {/* 2. Mobile More Menu (Bottom Sheet) */}
      {isMoreOpen && (
        <div 
          id="mobile-more-sheet"
          className="fixed inset-0 z-50 flex flex-col justify-end md:hidden animate-in fade-in duration-150"
        >
          {/* Backdrop with tap-to-dismiss */}
          <div 
            className="fixed inset-0 bg-black/40 transition-opacity cursor-pointer"
            onClick={() => setIsMoreOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet Container */}
          <div 
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            className="relative bg-surface-card rounded-t-3xl border-t border-border-default shadow-2xl z-10 max-h-[85vh] flex flex-col pb-[max(env(safe-area-inset-bottom,0px),16px)] animate-in slide-in-from-bottom duration-200"
          >
            {/* Grab Handle */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 bg-border-strong rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 py-3 border-b border-border-default flex items-center justify-between">
              <div>
                <h3 id="mobile-more-title" className="text-sm font-extrabold text-text-primary">
                  Mais Opções
                </h3>
                <p className="text-[11px] text-text-secondary truncate max-w-[220px]">
                  {family?.name || 'CasaJunto'}
                </p>
              </div>
              <button
                onClick={() => setIsMoreOpen(false)}
                id="btn-close-mobile-more"
                aria-label="Fechar menu"
                className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content List */}
            <div className="overflow-y-auto px-4 py-3 space-y-4">
              {/* Secondary Navigation Section */}
              {isAdmin && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted px-2 mb-1.5">
                    Espaços e Tarefas
                  </p>
                  <div className="space-y-1">
                    <button
                      id="mobile-more-house"
                      onClick={() => handleSelectView('house')}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                        currentView === 'house'
                          ? 'bg-brand-primary-soft text-brand-primary font-bold'
                          : 'text-text-primary hover:bg-surface-subtle'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Home className="w-4 h-4 text-brand-primary" />
                        <span>Ambientes da Casa</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </button>

                    <button
                      id="mobile-more-catalog"
                      onClick={() => handleSelectView('catalog')}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                        currentView === 'catalog'
                          ? 'bg-brand-primary-soft text-brand-primary font-bold'
                          : 'text-text-primary hover:bg-surface-subtle'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Layers className="w-4 h-4 text-brand-primary" />
                        <span>Catálogo de Tarefas</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </button>

                    <button
                      id="mobile-more-stats"
                      onClick={() => handleSelectView('stats')}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                        currentView === 'stats'
                          ? 'bg-brand-primary-soft text-brand-primary font-bold'
                          : 'text-text-primary hover:bg-surface-subtle'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <BarChart3 className="w-4 h-4 text-brand-primary" />
                        <span>Estatísticas e Conquistas</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </button>

                    <button
                      id="mobile-more-dashboard"
                      onClick={() => handleSelectView('dashboard')}
                      className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                        currentView === 'dashboard'
                          ? 'bg-brand-primary-soft text-brand-primary font-bold'
                          : 'text-text-primary hover:bg-surface-subtle'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <ShieldAlert className="w-4 h-4 text-brand-primary" />
                        <span>Painel de Gestão (Admin)</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Actions & Utilities */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted px-2 mb-1.5">
                  Ações Rápidas
                </p>
                <div className="space-y-1">
                  {(() => {
                    const isChaosActive = Boolean(activeChaosSession && activeChaosSession.status === 'ACTIVE');
                    const isParticipant = Boolean(
                      currentMember?.id &&
                      activeChaosSession &&
                      (activeChaosSession.participantMemberIds?.includes(currentMember.id) ||
                       activeChaosSession.lateParticipantMemberIds?.includes(currentMember.id))
                    );
                    const showChaosAccess = isAdmin || (isChaosActive && isParticipant);
                    if (!showChaosAccess) return null;

                    const chaosLabel = isChaosActive ? '🔥 Modo Caos Ativo' : '🔥 Modo Caos';

                    return (
                      <button
                        id="mobile-more-chaos"
                        onClick={() => {
                          setIsMoreOpen(false);
                          if (setIsChaosModalOpen) setIsChaosModalOpen(true);
                          else if (setIsBlitzModalOpen) setIsBlitzModalOpen(true);
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-text-primary hover:bg-surface-subtle flex items-center justify-between transition cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <span className="text-amber-500 font-bold">🔥</span>
                          <span>{chaosLabel}</span>
                        </span>
                        <ChevronRight className="w-4 h-4 text-text-muted" />
                      </button>
                    );
                  })()}

                  {isAdmin && (
                    <button
                      id="mobile-more-rebalance"
                      onClick={() => {
                        setIsMoreOpen(false);
                        setIsRebalanceModalOpen(true);
                      }}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-text-primary hover:bg-surface-subtle flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <SlidersHorizontal className="w-4 h-4 text-brand-primary" />
                        <span>Equilibrar Carga</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </button>
                  )}

                  {currentMember && (
                    <button
                      id="mobile-more-profile"
                      onClick={() => {
                        setIsMoreOpen(false);
                        openMemberProfile(currentMember);
                      }}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-text-primary hover:bg-surface-subtle flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <User className="w-4 h-4 text-brand-primary" />
                        <span>Meu Perfil ({currentMember.name})</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-muted" />
                    </button>
                  )}

                  {!isDemoMode && currentUser && activeMemberships.length > 1 && (
                    <button
                      id="mobile-more-switch-family"
                      onClick={() => {
                        setIsMoreOpen(false);
                        openFamilySelector();
                      }}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-semibold text-brand-primary hover:bg-brand-primary-soft flex items-center justify-between transition cursor-pointer"
                    >
                      <span className="flex items-center gap-3">
                        <Home className="w-4 h-4" />
                        <span>Trocar de Casa ({activeMemberships.length} disponíveis)</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-brand-primary" />
                    </button>
                  )}
                </div>
              </div>

              {/* User Account / Session */}
              <div className="pt-2 border-t border-border-default">
                <div className="flex items-center justify-between px-2 py-2 text-xs">
                  <div className="truncate mr-2">
                    <p className="font-bold text-text-primary truncate">
                      {currentMember?.name || currentUser?.displayName || currentUser?.email || 'Morador'}
                    </p>
                    <p className="text-[10px] text-text-muted truncate">
                      {isDemoMode ? 'Modo Demonstração' : (currentUser?.email || 'Conectado')}
                    </p>
                  </div>
                  <button
                    id="mobile-more-signout"
                    onClick={() => {
                      setIsMoreOpen(false);
                      if (isDemoMode) {
                        exitDemoMode();
                      } else {
                        signOut();
                      }
                    }}
                    className="min-h-[44px] px-3 py-1.5 rounded-xl border border-state-error/30 text-state-error text-xs font-bold hover:bg-state-error-soft flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isDemoMode ? 'Sair Demo' : 'Sair'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Sticky Banner para Modo Caos Ativo no Mobile */}
      {(() => {
        const isChaosActive = Boolean(activeChaosSession && activeChaosSession.status === 'ACTIVE');
        const isParticipant = Boolean(
          currentMember?.id &&
          activeChaosSession &&
          (activeChaosSession.participantMemberIds?.includes(currentMember.id) ||
           activeChaosSession.lateParticipantMemberIds?.includes(currentMember.id))
        );
        if (!isChaosActive || (!isAdmin && !isParticipant)) return null;

        return (
          <div className="fixed bottom-16 left-3 right-3 z-30 md:hidden" id="mobile-chaos-sticky-banner">
            <button
              onClick={() => {
                if (setIsChaosModalOpen) setIsChaosModalOpen(true);
                else if (setIsBlitzModalOpen) setIsBlitzModalOpen(true);
              }}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-lg flex items-center justify-between transition cursor-pointer border border-amber-400/60"
            >
              <span className="flex items-center gap-2">
                <span>🔥</span>
                <span>Modo Caos Ativo</span>
              </span>
              <span className="text-[11px] underline font-bold">Ver Missão &rarr;</span>
            </button>
          </div>
        );
      })()}
    </>
  );
};
