import React, { useState, useEffect, useMemo } from 'react';
import { Flame, CheckCircle2, Award, Clock } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { ChaosSessionService } from '../../services/chaosSessionService';
import { TaskAssignment } from '../../domain/models';

export const ChaosControlledPromptModal: React.FC = () => {
  const { isDemoMode } = useAuth();
  const {
    activeChaosSession,
    setActiveChaosSession,
    currentMember,
    members,
    family,
    tasks,
    openChaosModal
  } = useApp();

  const [liveAssignments, setLiveAssignments] = useState<TaskAssignment[]>([]);
  const [dismissedSessionId, setDismissedSessionId] = useState<string | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const [memberDismissed, setMemberDismissed] = useState(false);

  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';

  // Subscrição em tempo real aos assignments da sessão ativa
  useEffect(() => {
    if (!activeChaosSession || activeChaosSession.status !== 'ACTIVE' || !family?.id) {
      setLiveAssignments([]);
      return;
    }

    const unsub = ChaosSessionService.subscribeToChaosAssignments(
      family.id,
      activeChaosSession.id,
      (asgs) => {
        setLiveAssignments(asgs);
      },
      (err) => {
        console.warn('[ChaosControlledPrompt] Erro ao escutar assignments:', err);
      }
    );

    return () => {
      unsub();
    };
  }, [activeChaosSession?.id, activeChaosSession?.status, family?.id]);

  // Se uma nova sessão começou, resetar estado de dispensado
  useEffect(() => {
    if (activeChaosSession?.id && activeChaosSession.id !== dismissedSessionId) {
      setMemberDismissed(false);
    }
  }, [activeChaosSession?.id, dismissedSessionId]);

  // Avaliação de 100% das tarefas da sessão
  const { totalTasks, completedTasks, isAllCompleted } = useMemo(() => {
    if (!activeChaosSession || activeChaosSession.status !== 'ACTIVE') {
      return { totalTasks: 0, completedTasks: 0, isAllCompleted: false };
    }

    const configs = activeChaosSession.tasks && activeChaosSession.tasks.length > 0
      ? activeChaosSession.tasks
      : (activeChaosSession.selectedTaskIds || []).map(ftId => ({
          familyTaskId: ftId,
          strategy: (activeChaosSession.taskStrategies && activeChaosSession.taskStrategies[ftId]) || 'DISTRIBUTED'
        }));

    if (configs.length === 0) {
      return { totalTasks: 0, completedTasks: 0, isAllCompleted: false };
    }

    let completed = 0;
    for (const config of configs) {
      const configAssignmentId = (config as any).assignmentId;
      const liveAsg = liveAssignments.find(
        a => (configAssignmentId && a.id === configAssignmentId) ||
             (a.family_task_id && a.family_task_id === config.familyTaskId)
      );

      const matchingTask = tasks.find(
        t => (configAssignmentId && t.id === configAssignmentId) ||
             (liveAsg && t.id === liveAsg.id) ||
             (t.familyTaskId && t.familyTaskId === config.familyTaskId) ||
             ((t as any).family_task_id && (t as any).family_task_id === config.familyTaskId)
      );

      const isCompleted = (liveAsg && (liveAsg.status === 'COMPLETED' || liveAsg.status === 'DONE')) ||
        (matchingTask ? (matchingTask.status === 'DONE' || (matchingTask.status as string) === 'COMPLETED') : false);

      if (isCompleted) {
        completed++;
      }
    }

    return {
      totalTasks: configs.length,
      completedTasks: completed,
      isAllCompleted: configs.length > 0 && completed === configs.length
    };
  }, [activeChaosSession, liveAssignments, tasks]);

  // Se não estiver 100% concluído ou se sessão não estiver ativa, não renderiza nada
  if (!isAllCompleted || !activeChaosSession || activeChaosSession.status !== 'ACTIVE') {
    return null;
  }

  // CENÁRIO MEMBER:
  // Informativo apenas, sem controles administrativos
  if (!isAdmin) {
    if (memberDismissed) return null;

    return (
      <div 
        id="chaos-member-100-banner"
        className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:max-w-md z-50 p-4 rounded-2xl bg-surface-card border border-amber-500/30 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-extrabold text-text-primary">
              🔥 Tudo concluído!
            </h4>
            <p className="text-xs text-text-secondary mt-0.5">
              Todas as {totalTasks} tarefas foram concluídas. Aguardando encerramento do Modo Caos pelo administrador.
            </p>
          </div>
          <button
            onClick={() => setMemberDismissed(true)}
            className="text-xs font-bold text-text-muted hover:text-text-primary px-2 py-1 rounded-lg hover:bg-surface-subtle transition"
            aria-label="Dispensar aviso"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // CENÁRIO ADMIN:
  // Se o ADMIN já dispensou o prompt para esta sessão ("Continuar até o fim"), não reabre automaticamente
  if (dismissedSessionId === activeChaosSession.id) {
    return null;
  }

  const handleContinue = () => {
    setDismissedSessionId(activeChaosSession.id);
  };

  const handleComplete = async () => {
    if (!family?.id) return;
    setIsEnding(true);
    try {
      const updated = await ChaosSessionService.completeChaosSession({
        familyId: family.id,
        sessionId: activeChaosSession.id,
        callerRole: 'ADMIN',
        assignments: liveAssignments,
        members,
        existingSession: isDemoMode ? activeChaosSession : undefined,
        isDemoMode
      });
      setActiveChaosSession(updated);
      openChaosModal();
    } catch (err) {
      console.error('[ChaosControlledPrompt] Falha ao finalizar Modo Caos:', err);
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <div 
      id="chaos-controlled-prompt-modal" 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chaos-100-title"
    >
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-2xl p-6 sm:p-7 space-y-6 text-center animate-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
          <Flame className="w-8 h-8 animate-bounce" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-state-success-soft text-state-success text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            100% Concluído ({completedTasks}/{totalTasks} tarefas)
          </span>
          <h2 id="chaos-100-title" className="text-2xl font-black text-text-primary tracking-tight">
            Chaos controlado!
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
            Todas as tarefas da força-tarefa foram concluídas com sucesso. Deseja encerrar agora e computar os bônus ou continuar até o tempo esgotar?
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-surface-subtle border border-border-subtle flex items-center justify-between text-xs text-text-secondary">
          <span className="flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" />
            Bônus da sessão
          </span>
          <span className="font-extrabold text-text-primary">+5 pts por participante</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            id="btn-chaos-100-continue"
            type="button"
            onClick={handleContinue}
            disabled={isEnding}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-border-default hover:bg-surface-subtle text-xs font-bold text-text-primary transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5 text-text-muted" />
            Continuar até o fim
          </button>
          <button
            id="btn-chaos-100-complete"
            type="button"
            onClick={handleComplete}
            disabled={isEnding}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm hover:shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Flame className="w-3.5 h-3.5" />
            {isEnding ? 'Encerrando...' : 'Encerrar Modo Caos'}
          </button>
        </div>
      </div>
    </div>
  );
};
