import React, { useState } from 'react';
import { Plus, SlidersHorizontal, User } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { TaskCreationModal } from './TaskCreationModal';

export const Header: React.FC = () => {
  const { 
    currentView, 
    setIsRebalanceModalOpen,
    currentMember,
    isDemoMode,
    openMemberProfile
  } = useApp();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';

  const getTitle = () => {
    switch (currentView) {
      case 'today': return 'Tarefas de Hoje';
      case 'routine': return 'Rotina Semanal e Recorrente';
      case 'family': return 'Moradores e Membros da Família';
      case 'house': return 'Cômodos e Ambientes';
      case 'catalog': return 'Catálogo de Tarefas';
      case 'stats': return 'Estatísticas de Esforço e Conquistas';
      case 'dashboard': return 'Painel de Gestão e Administração';
      default: return 'CasaJunto';
    }
  };

  const getMobileTitle = () => {
    switch (currentView) {
      case 'today': return 'Hoje';
      case 'routine': return 'Rotina';
      case 'family': return 'Moradores';
      case 'house': return 'Ambientes';
      case 'catalog': return 'Catálogo';
      case 'stats': return 'Estatísticas';
      case 'dashboard': return 'Admin';
      default: return 'CasaJunto';
    }
  };

  return (
    <header 
      id="app-header"
      className="h-14 md:h-16 border-b border-border-default bg-surface-card px-3 sm:px-4 md:px-6 flex items-center justify-between flex-shrink-0 pt-[env(safe-area-inset-top,0px)]"
    >
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 mr-2">
        <img
          src="/brand/casajunto-compact.png"
          alt="CasaJunto"
          className="h-7 w-auto md:hidden object-contain shrink-0"
          referrerPolicy="no-referrer"
        />
        <div className="min-w-0">
          <h2 
            id="header-view-title"
            className="text-sm sm:text-base md:text-lg font-extrabold text-text-primary tracking-tight truncate leading-tight"
          >
            <span className="md:hidden" id="mobile-header-title">{getMobileTitle()}</span>
            <span className="hidden md:inline" id="desktop-header-title">{getTitle()}</span>
          </h2>
          {currentView === 'catalog' && (
            <p className="hidden sm:block text-xs text-text-secondary truncate mt-0.5" id="header-catalog-subtitle">
              Encontre e personalize as tarefas da sua casa.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Rebalance button: visible on desktop/tablet (>= md) except in catalog view - ADMIN only */}
        {isAdmin && currentView !== 'catalog' && (
          <button
            onClick={() => setIsRebalanceModalOpen(true)}
            id="btn-header-rebalance"
            className="hidden md:flex min-h-[44px] px-3 py-2 rounded-xl border border-border-default hover:bg-surface-subtle text-xs font-semibold text-brand-primary items-center gap-1.5 transition cursor-pointer"
            title="Rebalancear tarefas de forma justa"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Equilibrar Carga</span>
          </button>
        )}

        {/* Quick Action: New Task (with 44px min touch target on both mobile and desktop) - ADMIN only */}
        {isAdmin && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            id="btn-header-new-task"
            aria-label="Criar nova tarefa"
            className="min-h-[44px] px-3 sm:px-3.5 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden xs:inline sm:inline">Nova tarefa</span>
          </button>
        )}

        {/* User Identity / Avatar (compact on mobile, with 44x44px touch target) */}
        {currentMember ? (
          <button
            onClick={() => openMemberProfile(currentMember)}
            id="btn-header-profile"
            aria-label={`Perfil de ${currentMember.name}`}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl p-1 hover:bg-surface-subtle transition cursor-pointer"
            title={`Perfil de ${currentMember.name}`}
          >
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-2xs border border-border-default/50"
              style={{ 
                backgroundColor: `${currentMember.color || '#5b32a3'}20`, 
                color: currentMember.color || '#5b32a3' 
              }}
            >
              {currentMember.avatar || currentMember.name.slice(0, 1)}
            </div>
          </button>
        ) : (
          <div className="md:hidden w-8 h-8 rounded-full bg-surface-subtle flex items-center justify-center text-text-muted">
            <User className="w-4 h-4" />
          </div>
        )}
      </div>

      <TaskCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        template={null}
      />
    </header>
  );
};

