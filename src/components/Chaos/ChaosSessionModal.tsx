import React, { useEffect, useCallback } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Task } from '../../types';
import { ChaosSetupView } from './ChaosSetupView';
import { ChaosActiveView } from './ChaosActiveView';
import { ChaosResultView } from './ChaosResultView';

export const ChaosSessionModal: React.FC = () => {
  const {
    isChaosModalOpen,
    setIsChaosModalOpen,
    isBlitzModalOpen,
    setIsBlitzModalOpen,
    activeChaosSession,
    loadActiveChaosSession,
    family,
    currentMember,
    isDemoMode,
    members,
    activeMembers,
    tasks,
    familyTasks,
    rooms,
    completeTask,
    completeTaskDetailed,
    syncRollingRoutines,
    reloadAssignments
  } = useApp();

  const isOpen = Boolean(isChaosModalOpen || isBlitzModalOpen);
  const handleClose = useCallback(() => {
    if (setIsChaosModalOpen) setIsChaosModalOpen(false);
    if (setIsBlitzModalOpen) setIsBlitzModalOpen(false);
    if (reloadAssignments) reloadAssignments();
  }, [setIsChaosModalOpen, setIsBlitzModalOpen, reloadAssignments]);

  const isAdmin = Boolean(isDemoMode || currentMember?.role === 'ADMIN');

  // Fechar no ESC
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleClose]);

  // Atualização de estado da sessão
  const handleSessionUpdate = async () => {
    if (loadActiveChaosSession) {
      await loadActiveChaosSession();
    }
    if (syncRollingRoutines) {
      await syncRollingRoutines();
    }
    if (reloadAssignments) {
      await reloadAssignments();
    }
  };

  const handleTaskComplete = useCallback(async (task: Task) => {
    let res;
    if (completeTaskDetailed) {
      res = await completeTaskDetailed(task.id);
    } else {
      const ok = await completeTask(task.id);
      res = { success: ok };
    }
    if (res.success && reloadAssignments) {
      await reloadAssignments();
    }
    return res;
  }, [completeTask, completeTaskDetailed, reloadAssignments]);

  if (!isOpen) return null;

  // Permissão de acesso à sessão ativa (MEMBER-RBAC)
  const isParticipant = Boolean(
    isAdmin ||
    (currentMember?.id &&
      activeChaosSession &&
      (activeChaosSession.participantMemberIds?.includes(currentMember.id) ||
       activeChaosSession.lateParticipantMemberIds?.includes(currentMember.id)))
  );

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      id="chaos-session-modal-overlay"
    >
      <div 
        id="chaos-session-modal-container"
        className="w-full max-w-lg bg-surface-card rounded-3xl border border-border-default shadow-2xl overflow-hidden p-5 sm:p-6 my-auto relative max-h-[90vh] flex flex-col"
      >
        {/* Botão de Fechar no Topo */}
        <button
          type="button"
          id="chaos-modal-close-btn"
          onClick={handleClose}
          aria-label="Fechar janela do Modo Caos"
          className="absolute top-4 right-4 min-w-[36px] min-h-[36px] p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-subtle transition flex items-center justify-center cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="overflow-y-auto pr-1 flex-1">
          {/* Cenário 1: Nenhuma sessão ativa no momento */}
          {!activeChaosSession && (
            isAdmin ? (
              <ChaosSetupView
                familyId={family.id}
                callerMemberId={currentMember?.id || 'admin'}
                activeMembers={activeMembers}
                familyTasks={familyTasks}
                rooms={rooms}
                onSessionStarted={handleSessionUpdate}
                onClose={handleClose}
              />
            ) : (
              <div className="py-8 text-center space-y-3" id="chaos-member-no-active-view">
                <div className="w-12 h-12 rounded-2xl bg-surface-subtle border border-border-default mx-auto flex items-center justify-center text-text-muted">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-text-primary">
                  Nenhum Modo Caos ativo
                </h3>
                <p className="text-xs text-text-secondary max-w-xs mx-auto">
                  Apenas administradores da família podem iniciar uma nova força-tarefa de Modo Caos.
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleClose}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-surface-subtle hover:bg-surface-card border border-border-default text-xs font-bold text-text-primary transition cursor-pointer"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            )
          )}

          {/* Cenário 2: Sessão Ativa */}
          {activeChaosSession && activeChaosSession.status === 'ACTIVE' && (
            isParticipant ? (
              <ChaosActiveView
                session={activeChaosSession}
                currentMember={currentMember}
                isAdmin={isAdmin}
                members={members}
                activeMembers={activeMembers}
                tasks={tasks}
                familyTasks={familyTasks}
                rooms={rooms}
                completeTask={handleTaskComplete}
                onSessionUpdated={handleSessionUpdate}
                onClose={handleClose}
              />
            ) : (
              <div className="py-8 text-center space-y-3" id="chaos-non-participant-view">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 mx-auto flex items-center justify-center text-amber-500">
                  🔥
                </div>
                <h3 className="text-base font-bold text-text-primary">
                  Força-tarefa em andamento
                </h3>
                <p className="text-xs text-text-secondary max-w-xs mx-auto">
                  Existe um Modo Caos ativo na casa, mas você não faz parte dos participantes desta missão.
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleClose}
                    className="min-h-[44px] px-5 py-2 rounded-xl bg-surface-subtle hover:bg-surface-card border border-border-default text-xs font-bold text-text-primary transition cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )
          )}

          {/* Cenário 3: Sessão Concluída (Resultados) */}
          {activeChaosSession && activeChaosSession.status === 'COMPLETED' && (
            <ChaosResultView
              session={activeChaosSession}
              members={members}
              onClose={handleClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};
