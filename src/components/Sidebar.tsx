import React from 'react';
import { 
  Calendar, 
  CheckSquare, 
  Users, 
  Home, 
  Layers, 
  BarChart3, 
  ShieldAlert, 
  Zap, 
  LogOut, 
  Sparkles, 
  Cloud, 
  CloudOff, 
  RefreshCw,
  Plus
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { AppView } from '../types';
import { canAccessTab } from '../domain/rbac/rolePermissions';

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    family,
    currentMember,
    isDemoMode,
    openAuthModal,
    openCreateFamilyModal,
    openFamilySelector,
    cloudSyncStatus,
    setIsBlitzModalOpen,
    setIsChaosModalOpen,
    activeChaosSession
  } = useApp();

  const {
    currentUser: authUser,
    activeMemberships,
    signOut,
    exitDemoMode
  } = useAuth();

  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';

  const navItems: { id: AppView; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'today', label: 'Hoje', icon: Calendar },
    { id: 'routine', label: 'Rotina Semanal', icon: CheckSquare },
    { id: 'family', label: 'Membros', icon: Users },
    { id: 'house', label: 'Ambientes', icon: Home },
    { id: 'catalog', label: 'Catálogo de Tarefas', icon: Layers },
    { id: 'stats', label: 'Estatísticas', icon: BarChart3 },
    { id: 'dashboard', label: 'Gestão & Painel', icon: ShieldAlert }
  ];

  return (
    <aside 
      id="desktop-sidebar"
      className="hidden md:flex md:w-64 bg-surface-card border-r border-border-default flex-col flex-shrink-0 select-none"
    >
      {/* Brand Header & Cloud Status */}
      <div className="p-4 pb-3 border-b border-border-default">
        <div className="mb-2">
          <button
            onClick={() => setCurrentView('today')}
            className="block text-left hover:opacity-90 transition cursor-pointer mb-2"
            aria-label="Ir para o início do CasaJunto"
          >
            <img
              src="/brand/casajunto-compact.png"
              alt="CasaJunto"
              className="h-11 w-auto max-w-[180px] object-contain"
              referrerPolicy="no-referrer"
            />
          </button>
          <div className="flex items-center justify-between min-w-0">
            <h1 className="text-xs font-bold text-brand-primary tracking-tight leading-tight truncate">
              {family?.name || 'CasaJunto'}
            </h1>
            <p className="text-[9px] uppercase tracking-widest text-text-muted font-bold truncate shrink-0 ml-2">
              {isDemoMode ? 'Modo Demonstração' : 'Família em Nuvem'}
            </p>
          </div>
        </div>

        {/* Multi-Family Switcher Trigger (when user has 2+ active families) */}
        {!isDemoMode && authUser && activeMemberships.length > 1 && (
          <button
            onClick={openFamilySelector}
            className="w-full mb-2 px-2.5 py-1.5 rounded-lg bg-surface-subtle hover:bg-brand-primary-soft border border-border-default text-[11px] font-bold text-brand-primary flex items-center justify-between transition cursor-pointer"
            title="Alternar entre suas casas cadastradas"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Home className="w-3 h-3 text-brand-primary" />
              <span>Trocar de Casa</span>
            </span>
            <span className="px-1.5 py-0.2 bg-brand-primary text-text-on-primary text-[9px] font-extrabold rounded-full">
              {activeMemberships.length}
            </span>
          </button>
        )}

        {/* Cloud / Sync Status Pill */}
        <div className="flex items-center justify-between text-[10px] text-text-muted pt-1">
          <span className="flex items-center gap-1">
            {cloudSyncStatus === 'synced' && <Cloud className="w-3 h-3 text-state-success" />}
            {cloudSyncStatus === 'saving' && <RefreshCw className="w-3 h-3 text-brand-accent animate-spin" />}
            {cloudSyncStatus === 'offline' && <CloudOff className="w-3 h-3 text-text-muted" />}
            {cloudSyncStatus === 'demo' && <Sparkles className="w-3 h-3 text-brand-accent" />}
            <span>
              {cloudSyncStatus === 'synced' && 'Sincronizado'}
              {cloudSyncStatus === 'saving' && 'Salvando...'}
              {cloudSyncStatus === 'offline' && 'Offline'}
              {cloudSyncStatus === 'demo' && 'Memória Local'}
            </span>
          </span>
          {!isDemoMode && authUser && isAdmin && (
            <button 
              id="sidebar-create-family-btn"
              onClick={openCreateFamilyModal}
              className="text-brand-primary hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Nova Casa</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.filter(item => isDemoMode || canAccessTab(currentMember?.role, item.id)).map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                isActive
                  ? 'bg-brand-primary text-text-on-primary shadow-xs'
                  : 'text-text-secondary hover:bg-surface-subtle hover:text-text-primary'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-text-on-primary' : 'text-text-muted'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* Action Button: Modo Caos */}
        {(() => {
          const isChaosActive = Boolean(activeChaosSession && activeChaosSession.status === 'ACTIVE');
          const isParticipant = Boolean(
            currentMember?.id &&
            activeChaosSession &&
            (activeChaosSession.participantMemberIds?.includes(currentMember.id) ||
             activeChaosSession.lateParticipantMemberIds?.includes(currentMember.id))
          );
          const showChaosButton = isAdmin || (isChaosActive && isParticipant);
          if (!showChaosButton) return null;

          const chaosButtonLabel = isChaosActive ? '🔥 Modo Caos Ativo' : '🔥 Modo Caos';

          return (
            <div className="pt-4">
              <button
                id="sidebar-chaos-btn"
                onClick={() => {
                  if (setIsChaosModalOpen) setIsChaosModalOpen(true);
                  else if (setIsBlitzModalOpen) setIsBlitzModalOpen(true);
                }}
                className={`w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  isChaosActive
                    ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-2xs animate-pulse'
                    : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}
              >
                <span>{chaosButtonLabel}</span>
              </button>
            </div>
          );
        })()}
      </nav>

      {/* Footer / Account Section */}
      <div className="p-3 border-t border-border-default">
        {isDemoMode ? (
          <div className="space-y-2">
            <button
              onClick={openAuthModal}
              className="w-full py-2 px-3 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Criar Conta Real</span>
            </button>
            <button
              onClick={exitDemoMode}
              className="w-full py-1.5 px-3 rounded-xl text-[11px] font-semibold text-text-muted hover:bg-surface-subtle hover:text-text-primary flex items-center justify-center gap-1 transition cursor-pointer"
            >
              <LogOut className="w-3 h-3" />
              <span>Sair da Demonstração</span>
            </button>
          </div>
        ) : authUser ? (
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <p className="text-xs font-bold text-text-primary truncate">{authUser.displayName}</p>
              <p className="text-[10px] text-text-muted truncate">{authUser.email}</p>
            </div>
            <button
              onClick={() => signOut()}
              title="Encerrar sessão"
              className="p-1.5 rounded-lg text-text-muted hover:text-state-error hover:bg-state-error-soft transition cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={openAuthModal}
            className="w-full py-2 px-3 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <span>Entrar ou Cadastrar</span>
          </button>
        )}
      </div>
    </aside>
  );
};
