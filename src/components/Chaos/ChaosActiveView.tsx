import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, 
  Check, 
  Sparkles, 
  Users, 
  Plus, 
  AlertCircle, 
  CheckCircle2, 
  Flame, 
  ChevronRight, 
  X,
  Hourglass,
  Loader2
} from 'lucide-react';
import { 
  ChaosSession, 
  Member, 
  Task, 
  FamilyTask, 
  Room, 
  UserRole, 
  ChaosTaskStrategy,
  TaskAssignment
} from '../../types';
import { ChaosSessionService } from '../../services/chaosSessionService';
import { mapChaosErrorToHumanMessage } from '../../utils/chaosErrorUtils';
import { useApp } from '../../context/AppContext';

interface ChaosActiveViewProps {
  session: ChaosSession;
  currentMember: Member | null;
  isAdmin: boolean;
  members: Member[];
  activeMembers: Member[];
  tasks: Task[];
  familyTasks: FamilyTask[];
  rooms: Room[];
  completeTask: (task: Task) => Promise<any>;
  onSessionUpdated: () => Promise<void>;
  onClose: () => void;
}

export const ChaosActiveView: React.FC<ChaosActiveViewProps> = ({
  session,
  currentMember,
  isAdmin,
  members,
  activeMembers,
  tasks,
  familyTasks,
  rooms,
  completeTask,
  onSessionUpdated,
  onClose
}) => {
  const { isDemoMode } = useApp();
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [isExtending, setIsExtending] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedLateMemberId, setSelectedLateMemberId] = useState<string>('');
  const [actionSuccessToast, setActionSuccessToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);

  // HF2: Listener em tempo real para as atribuições vinculadas à sessão ativa do Modo Caos
  const [liveAssignments, setLiveAssignments] = useState<TaskAssignment[]>([]);

  useEffect(() => {
    if (!session.familyId || !session.id) return;
    const unsub = ChaosSessionService.subscribeToChaosAssignments(
      session.familyId,
      session.id,
      (updatedList) => {
        if (updatedList) {
          setLiveAssignments(updatedList);
        }
      }
    );
    return () => unsub();
  }, [session.familyId, session.id]);

  // Timer Tick
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Limpa toast após 4 segundos
  useEffect(() => {
    if (actionSuccessToast) {
      const t = setTimeout(() => setActionSuccessToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [actionSuccessToast]);

  // Cálculo canônico do tempo restante derivado de expiresAt
  const expiresAtMs = useMemo(() => {
    if (!session.expiresAt) return null;
    if (typeof session.expiresAt.toMillis === 'function') {
      return session.expiresAt.toMillis();
    }
    if (session.expiresAt instanceof Date) {
      return session.expiresAt.getTime();
    }
    if (typeof session.expiresAt === 'number') {
      return session.expiresAt;
    }
    if (typeof session.expiresAt === 'string') {
      const parsed = Date.parse(session.expiresAt);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }, [session.expiresAt]);

  const timeLeftMs = expiresAtMs ? Math.max(0, expiresAtMs - nowMs) : 0;
  const isTimeExpired = expiresAtMs !== null && nowMs >= expiresAtMs;

  const minutesLeft = Math.floor(timeLeftMs / 60000);
  const secondsLeft = Math.floor((timeLeftMs % 60000) / 1000);

  // Identificação e cruzamento de tarefas da sessão
  const sessionTaskConfigs = useMemo(() => {
    if (session.tasks && session.tasks.length > 0) {
      return session.tasks;
    }
    // Fallback retrocompatível
    return (session.selectedTaskIds || []).map(id => ({
      familyTaskId: id,
      strategy: (session.taskStrategies?.[id] || 'DISTRIBUTED') as ChaosTaskStrategy
    }));
  }, [session.tasks, session.selectedTaskIds, session.taskStrategies]);

  const sessionFamilyTaskIds = useMemo(() => {
    return new Set(sessionTaskConfigs.map(c => c.familyTaskId));
  }, [sessionTaskConfigs]);

  // Participantes atuais da sessão
  const currentParticipantIds = useMemo(() => {
    return new Set([
      ...(session.participantMemberIds || []),
      ...(session.lateParticipantMemberIds || [])
    ]);
  }, [session.participantMemberIds, session.lateParticipantMemberIds]);

  // Tarefas da sessão resolvidas em runtime com convergência realtime de liveAssignments
  const resolvedTasks = useMemo(() => {
    return sessionTaskConfigs.map(config => {
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

      const ft = familyTasks.find(f => f.id === config.familyTaskId);
      const room = rooms.find(r => r.id === (matchingTask?.roomId || liveAsg?.room_id || ft?.room_id));
      const strategy = config.strategy || (session.taskStrategies?.[config.familyTaskId] || 'DISTRIBUTED');

      // HF5: PREDICADO CANÔNICO DE CONCLUSÃO NO MODO CAOS
      // Remove o comportamento anterior onde matchingTask.status === DONE/COMPLETED
      // fazia independentemente a tarefa ser considerada concluída na sessão ativa.
      // O estado de conclusão DEVE pertencer estritamente à sessão ativa atual.
      const isCompleted = liveAsg
        ? ChaosSessionService.isAssignmentCompletedInChaosSession(liveAsg, session)
        : (matchingTask && (matchingTask.chaos_session_id === session.id || matchingTask.chaosSessionId === session.id)
            ? ChaosSessionService.isAssignmentCompletedInChaosSession(matchingTask, session)
            : false);

      const rawAssignedMemberId = liveAsg
        ? (liveAsg.is_unassigned ? null : liveAsg.member_id)
        : (matchingTask?.assignedMemberId || matchingTask?.assigneeId || null);

      // CHF4-01 / CHF4-02: Garantir que apenas membros participantes sejam apresentados como atribuídos
      const assignedMemberId = (rawAssignedMemberId && currentParticipantIds.has(rawAssignedMemberId))
        ? rawAssignedMemberId
        : null;

      const assignedMember = assignedMemberId ? members.find(m => m.id === assignedMemberId) : null;

      return {
        key: configAssignmentId || liveAsg?.id || config.familyTaskId,
        config,
        task: matchingTask,
        liveAsg,
        familyTask: ft,
        room,
        strategy,
        isCompleted,
        assignedMemberId,
        assignedMember,
        title: matchingTask?.title || ft?.customTitle || ft?.custom_title || ft?.name || (ft as any)?.title || 'Tarefa do Caos',
        points: matchingTask?.effort || (ft as any)?.reward_points || (ft as any)?.points || 10
      };
    });
  }, [sessionTaskConfigs, liveAssignments, tasks, familyTasks, rooms, members, session.taskStrategies, currentParticipantIds]);

  // Métricas de progresso
  const totalTasksCount = resolvedTasks.length;
  const completedTasksCount = resolvedTasks.filter(t => t.isCompleted).length;
  const pendingTasksCount = totalTasksCount - completedTasksCount;
  const progressPercent = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
  const isAllTasksCompleted = totalTasksCount > 0 && completedTasksCount === totalTasksCount && session.status === 'ACTIVE';

  // HF3: Assisted 100% Closure state
  const [hasDismissedAssistedPrompt, setHasDismissedAssistedPrompt] = useState(false);
  const [showAssisted100Modal, setShowAssisted100Modal] = useState(false);

  useEffect(() => {
    if (isAllTasksCompleted && isAdmin && !hasDismissedAssistedPrompt) {
      setShowAssisted100Modal(true);
    }
  }, [isAllTasksCompleted, isAdmin, hasDismissedAssistedPrompt]);

  const handleContinueUntilEnd = () => {
    setShowAssisted100Modal(false);
    setHasDismissedAssistedPrompt(true);
  };

  const handleAssistedCompleteSession = async () => {
    setShowAssisted100Modal(false);
    await handleCompleteSession();
  };

  // Moradores ativos que ainda NÃO participam da sessão (para late participant)
  const nonParticipatingActiveMembers = useMemo(() => {
    return activeMembers.filter(m => !currentParticipantIds.has(m.id));
  }, [activeMembers, currentParticipantIds]);

  // Handler de Conclusão de Tarefa com ZERO SILENT FAILURE e feedback de estado
  const handleTaskComplete = async (resolved: typeof resolvedTasks[0]) => {
    if (submittingTaskId) return; // Evita duplo clique concorrente na mesma UI
    setSubmittingTaskId(resolved.key);
    setActionError(null);

    try {
      let targetTask = resolved.task;
      const targetId = resolved.liveAsg?.id || (resolved.config as any).assignmentId || resolved.task?.id || `chaos_${resolved.config.familyTaskId}`;

      if (!targetTask) {
        // Constrói objeto de tarefa runtime se não estiver hidratado localmente
        targetTask = {
          id: targetId,
          title: resolved.title,
          status: 'PENDING',
          familyTaskId: resolved.config.familyTaskId,
          dueDate: new Date().toISOString().split('T')[0],
          familyId: session.familyId,
          roomId: resolved.room?.id || 'room-general',
          frequency: 'DAILY',
          effort: resolved.points || 10,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          assignedMemberId: resolved.assignedMemberId || ''
        };
      } else if (resolved.liveAsg?.id && targetTask.id !== resolved.liveAsg.id) {
        targetTask = {
          ...targetTask,
          id: resolved.liveAsg.id
        };
      }

      const res = await completeTask(targetTask);
      const isSuccess = typeof res === 'boolean' ? res : Boolean(res?.success);

      if (isSuccess) {
        setActionSuccessToast(`Tarefa "${resolved.title}" concluída com sucesso! 🎉`);
      } else {
        const errorMsg = typeof res === 'object' && res?.error
          ? res.error
          : (typeof res === 'object' && res?.code === 'CONCURRENT_CLAIM_LOST'
              ? 'Outro morador acabou de assumir/concluir esta tarefa.'
              : 'Não foi possível concluir a tarefa. Verifique as permissões.');
        setActionError(errorMsg);
      }
      await onSessionUpdated();
    } catch (err: any) {
      console.warn('[ChaosActiveView] Exceção ao concluir tarefa:', err);
      setActionError(err?.message || 'Falha ao processar a conclusão da tarefa.');
    } finally {
      setSubmittingTaskId(null);
    }
  };

  // Handler de Extensão de Tempo (+15 ou +30)
  const handleExtend = async (minutes: 15 | 30) => {
    if (!isAdmin || isExtending) return;
    setIsExtending(true);
    setActionError(null);

    try {
      await ChaosSessionService.extendChaosSession({
        familyId: session.familyId,
        sessionId: session.id,
        callerMemberId: currentMember?.id || session.createdByMemberId,
        callerRole: 'ADMIN',
        extensionMinutes: minutes,
        isDemoMode: Boolean(isDemoMode),
        existingSession: isDemoMode ? session : undefined
      });
      setActionSuccessToast(`+${minutes} minutos adicionados com sucesso! 🔥`);
      await onSessionUpdated();
    } catch (err: any) {
      console.error('[ChaosActiveView] Erro ao estender sessão:', err);
      setActionError(mapChaosErrorToHumanMessage(err));
    } finally {
      setIsExtending(false);
    }
  };

  // Handler de Adicionar Participante Tardio
  const handleAddLateParticipant = async () => {
    if (!isAdmin || !selectedLateMemberId) return;
    setActionError(null);

    try {
      const addedMember = activeMembers.find(m => m.id === selectedLateMemberId);
      await ChaosSessionService.addLateParticipant({
        familyId: session.familyId,
        sessionId: session.id,
        callerRole: 'ADMIN',
        memberId: selectedLateMemberId,
        availableMembers: members,
        isDemoMode: Boolean(isDemoMode),
        existingSession: isDemoMode ? session : undefined
      });

      setActionSuccessToast(`${addedMember?.name || 'Morador'} entrou no Modo Caos 🔥`);
      setShowAddMemberModal(false);
      setSelectedLateMemberId('');
      await onSessionUpdated();
    } catch (err: any) {
      console.error('[ChaosActiveView] Erro ao adicionar participante:', err);
      setActionError(mapChaosErrorToHumanMessage(err));
    }
  };

  // Handler de Encerramento (Antecipado ou ao término)
  const handleCompleteSession = async () => {
    if (!isAdmin || isEnding) return;
    setIsEnding(true);
    setActionError(null);

    try {
      await ChaosSessionService.completeChaosSession({
        familyId: session.familyId,
        sessionId: session.id,
        callerMemberId: currentMember?.id || session.createdByMemberId,
        callerRole: 'ADMIN',
        assignments: tasks as any,
        members: members,
        isDemoMode: Boolean(isDemoMode),
        existingSession: isDemoMode ? session : undefined
      });
      setShowEndConfirm(false);
      await onSessionUpdated();
    } catch (err: any) {
      console.error('[ChaosActiveView] Erro ao encerrar sessão:', err);
      setActionError(mapChaosErrorToHumanMessage(err));
      setIsEnding(false);
    }
  };

  // Filtros de visualização para MEMBER vs ADMIN:
  // MEMBER vê:
  // - "Minhas tarefas": atribuídas a ele
  // - "Quem puder fazer": estratégia OPEN_POOL ou não atribuída
  // NÃO vê tarefas atribuídas exclusivamente a outros moradores!
  const myAssignedTasks = useMemo(() => {
    if (!currentMember) return [];
    return resolvedTasks.filter(
      t => !t.isCompleted && t.assignedMemberId === currentMember.id
    );
  }, [resolvedTasks, currentMember]);

  const openPoolTasks = useMemo(() => {
    return resolvedTasks.filter(
      t => !t.isCompleted && (t.strategy === 'OPEN_POOL' || !t.assignedMemberId)
    );
  }, [resolvedTasks]);

  const completedSessionTasks = useMemo(() => {
    return resolvedTasks.filter(t => t.isCompleted);
  }, [resolvedTasks]);

  // Visualização de ADMIN (tarefas atribuídas a outros membros)
  const otherAssignedTasks = useMemo(() => {
    return resolvedTasks.filter(
      t => !t.isCompleted && 
           t.strategy !== 'OPEN_POOL' && 
           t.assignedMemberId && 
           t.assignedMemberId !== currentMember?.id
    );
  }, [resolvedTasks, currentMember]);

  return (
    <div className="space-y-6" id="chaos-active-view">
      {/* Toast Feedback */}
      {actionSuccessToast && (
        <div 
          id="chaos-action-toast"
          className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center justify-between shadow-xs transition"
        >
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 fill-amber-500 text-amber-500" />
            <span>{actionSuccessToast}</span>
          </div>
          <button onClick={() => setActionSuccessToast(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Erro Feedback */}
      {actionError && (
        <div 
          id="chaos-action-error"
          className="p-3 rounded-2xl bg-state-error-soft/30 border border-state-error-soft text-state-error text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* HEADER: Título, Timer & Progresso */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-surface-card border border-amber-500/20 shadow-xs space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-lg text-amber-500 shadow-2xs">
              🔥
            </div>
            <div>
              <h2 className="text-lg font-black text-text-primary tracking-tight">
                Modo Caos
              </h2>
              <p className="text-xs text-text-secondary font-medium">
                {currentParticipantIds.size} participantes mobilizados
              </p>
            </div>
          </div>

          {/* Countdown Timer */}
          <div 
            id="chaos-timer-display"
            className={`px-3.5 py-1.5 rounded-2xl border flex items-center gap-2 font-mono font-extrabold text-sm shadow-2xs ${
              isTimeExpired
                ? 'bg-state-error-soft/40 border-state-error-soft text-state-error animate-pulse'
                : 'bg-surface-card border-border-default text-text-primary'
            }`}
          >
            <Clock className={`w-4 h-4 ${isTimeExpired ? 'text-state-error' : 'text-amber-500'}`} />
            <span>
              {isTimeExpired ? (
                '00:00'
              ) : (
                `${String(minutesLeft).padStart(2, '0')}:${String(secondsLeft).padStart(2, '0')}`
              )}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-text-secondary">
              {completedTasksCount} de {totalTasksCount} tarefas concluídas
            </span>
            <span className="text-amber-600 dark:text-amber-400 font-extrabold">
              {progressPercent}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-surface-subtle border border-border-default rounded-full overflow-hidden">
            <div 
              id="chaos-progress-bar"
              className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* BANNER DE TEMPO EXPIRADO (Se o tempo acabou) */}
      {isTimeExpired && (
        <div 
          id="chaos-expired-banner"
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <Hourglass className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-extrabold text-text-primary">
                ⏰ O tempo acabou!
              </h4>
              <p className="text-xs text-text-secondary mt-0.5">
                {pendingTasksCount > 0
                  ? `Ainda temos ${pendingTasksCount} ${pendingTasksCount === 1 ? 'tarefa' : 'tarefas'} para terminar.`
                  : 'Todas as tarefas foram concluídas! A casa está em ordem.'}
              </p>
            </div>
          </div>

          {isAdmin ? (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                id="chaos-expired-extend-15"
                onClick={() => handleExtend(15)}
                disabled={isExtending}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
              >
                +15 min
              </button>
              <button
                type="button"
                id="chaos-expired-extend-30"
                onClick={() => handleExtend(30)}
                disabled={isExtending}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
              >
                +30 min
              </button>
              <button
                type="button"
                id="chaos-expired-complete"
                onClick={() => setShowEndConfirm(true)}
                disabled={isEnding}
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl border border-border-default hover:bg-surface-card text-text-primary text-xs font-bold transition cursor-pointer"
              >
                Encerrar Modo Caos
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-text-muted italic">
              Aguardando a administração estender o tempo ou encerrar a missão.
            </p>
          )}
        </div>
      )}

      {/* HF3: BANNER DE 100% DE CONCLUSÃO (Todas as tarefas concluídas antes ou durante o tempo) */}
      {isAllTasksCompleted && !isTimeExpired && (
        isAdmin ? (
          <div 
            id="chaos-admin-100-banner"
            className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-text-primary flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-start gap-2.5">
              <div className="text-xl">🔥</div>
              <div>
                <h4 className="text-sm font-black text-text-primary">
                  Caos controlado!
                </h4>
                <p className="text-xs text-text-secondary mt-0.5">
                  Todas as tarefas foram concluídas antes do tempo. Deseja encerrar o Modo Caos agora?
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                id="chaos-admin-assisted-end-btn"
                onClick={handleCompleteSession}
                disabled={isEnding}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition cursor-pointer"
              >
                {isEnding ? 'Encerrando...' : 'Encerrar Modo Caos'}
              </button>
            </div>
          </div>
        ) : (
          <div 
            id="chaos-member-100-banner"
            className="p-4 rounded-2xl bg-brand-primary-soft/40 border border-brand-primary/30 text-text-primary flex items-start gap-2.5 shadow-xs"
          >
            <div className="text-xl">🎉</div>
            <div>
              <h4 className="text-sm font-black text-text-primary">
                Todas as tarefas foram concluídas!
              </h4>
              <p className="text-xs text-text-secondary mt-0.5">
                Aguardando o encerramento pelo administrador.
              </p>
            </div>
          </div>
        )
      )}

      {/* SEÇÕES DE TAREFAS */}
      <div className="space-y-5">
        {/* 1. MINHAS TAREFAS (Exibido para MEMBER participante e ADMIN) */}
        {myAssignedTasks.length > 0 && (
          <div className="space-y-2.5" id="chaos-my-tasks-section">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-1.5 px-1">
              <span>👤 Minhas tarefas</span>
              <span className="px-2 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary text-[10px] font-bold">
                {myAssignedTasks.length}
              </span>
            </h3>

            <div className="space-y-2">
              {myAssignedTasks.map(resolved => (
                <div
                  key={resolved.key}
                  id={`chaos-task-${resolved.key}`}
                  className="p-3.5 rounded-2xl bg-surface-card border border-border-default hover:border-brand-primary/40 shadow-2xs transition flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-primary-soft text-brand-primary">
                        {resolved.room?.name || 'Geral'}
                      </span>
                      <span className="text-[10px] font-semibold text-brand-accent">
                        +{resolved.points} pts
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-text-primary leading-tight">
                      {resolved.title}
                    </p>
                  </div>

                  <button
                    type="button"
                    id={`chaos-complete-btn-${resolved.key}`}
                    onClick={() => handleTaskComplete(resolved)}
                    disabled={submittingTaskId !== null}
                    aria-label={`Concluir tarefa ${resolved.title}`}
                    className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border border-border-default hover:border-brand-primary hover:bg-brand-primary hover:text-text-on-primary text-text-muted flex items-center justify-center transition cursor-pointer active:scale-95 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingTaskId === resolved.key ? (
                      <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. QUEM PUDER FAZER (Pool Aberto acessível a todos) */}
        {openPoolTasks.length > 0 && (
          <div className="space-y-2.5" id="chaos-open-pool-section">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-1.5 px-1">
              <span>⚡ Quem puder fazer</span>
              <span className="px-2 py-0.5 rounded-full bg-state-success-soft text-state-success text-[10px] font-bold">
                {openPoolTasks.length}
              </span>
            </h3>

            <div className="space-y-2">
              {openPoolTasks.map(resolved => (
                <div
                  key={resolved.key}
                  id={`chaos-task-${resolved.key}`}
                  className="p-3.5 rounded-2xl bg-surface-card border border-state-success-soft/40 hover:border-state-success shadow-2xs transition flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-state-success-soft text-state-success">
                        Disponível
                      </span>
                      <span className="text-[10px] font-semibold text-brand-accent">
                        +{resolved.points} pts
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-bold text-text-primary leading-tight">
                      {resolved.title}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {resolved.room?.name || 'Geral'}
                    </p>
                  </div>

                  <button
                    type="button"
                    id={`chaos-claim-btn-${resolved.key}`}
                    onClick={() => handleTaskComplete(resolved)}
                    disabled={submittingTaskId !== null}
                    aria-label={`Assumir e concluir ${resolved.title}`}
                    className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl border border-state-success-soft bg-state-success-soft/30 hover:bg-state-success hover:text-white text-state-success text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingTaskId === resolved.key ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Concluindo...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Concluir</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. TAREFAS DE OUTROS PARTICIPANTES (Apenas ADMIN visualiza para supervisão operacional) */}
        {isAdmin && otherAssignedTasks.length > 0 && (
          <div className="space-y-2.5" id="chaos-other-tasks-section">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-1.5 px-1">
              <span>👤 Tarefas com outros moradores</span>
              <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-text-muted text-[10px] font-bold">
                {otherAssignedTasks.length}
              </span>
            </h3>

            <div className="space-y-2">
              {otherAssignedTasks.map(resolved => (
                <div
                  key={resolved.key}
                  id={`chaos-task-${resolved.key}`}
                  className="p-3.5 rounded-2xl bg-surface-subtle border border-border-default hover:border-brand-primary/30 transition flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-card text-text-secondary border border-border-default">
                        {resolved.room?.name || 'Geral'}
                      </span>
                      <span className="text-[10px] font-semibold text-text-muted">
                        Com: {resolved.assignedMember?.name || 'Morador'}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-text-primary leading-tight">
                      {resolved.title}
                    </p>
                  </div>

                  <button
                    type="button"
                    id={`chaos-admin-complete-btn-${resolved.key}`}
                    onClick={() => handleTaskComplete(resolved)}
                    disabled={submittingTaskId !== null}
                    aria-label={`Concluir como administrador ${resolved.title}`}
                    className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border border-border-default hover:bg-brand-primary hover:text-white text-text-muted flex items-center justify-center transition cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingTaskId === resolved.key ? (
                      <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. TAREFAS JÁ CONCLUÍDAS */}
        {completedSessionTasks.length > 0 && (
          <div className="space-y-2.5 pt-2" id="chaos-completed-tasks-section">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-text-muted flex items-center gap-1.5 px-1">
              <span>Concluídas na Força-Tarefa</span>
              <span className="px-2 py-0.5 rounded-full bg-surface-subtle text-text-muted text-[10px] font-bold">
                {completedSessionTasks.length}
              </span>
            </h3>

            <div className="space-y-1.5">
              {completedSessionTasks.map(resolved => (
                <div
                  key={resolved.key}
                  className="p-2.5 rounded-xl bg-surface-subtle/60 border border-border-default flex items-center justify-between text-xs opacity-75"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-state-success shrink-0" />
                    <span className="font-semibold text-text-primary line-through truncate">
                      {resolved.title}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-state-success shrink-0">
                    +{resolved.points} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* TOOLBAR OPERACIONAL DO ADMIN (Discreta, sem ofuscar as tarefas) */}
      {isAdmin && (
        <div className="pt-4 border-t border-border-default space-y-2" id="chaos-admin-toolbar">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted px-1">
            Gestão Operacional (Admin)
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              id="chaos-extend-15-btn"
              onClick={() => handleExtend(15)}
              disabled={isExtending}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-surface-card border border-border-default hover:border-amber-500 hover:text-amber-600 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>+15 min</span>
            </button>

            <button
              type="button"
              id="chaos-extend-30-btn"
              onClick={() => handleExtend(30)}
              disabled={isExtending}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-surface-card border border-border-default hover:border-amber-500 hover:text-amber-600 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>+30 min</span>
            </button>

            {nonParticipatingActiveMembers.length > 0 && (
              <button
                type="button"
                id="chaos-open-add-member-btn"
                onClick={() => setShowAddMemberModal(true)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-surface-card border border-border-default hover:border-brand-primary text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Users className="w-3.5 h-3.5 text-brand-primary" />
                <span>+ Adicionar participante</span>
              </button>
            )}

            <button
              type="button"
              id="chaos-end-session-trigger-btn"
              onClick={() => setShowEndConfirm(true)}
              disabled={isEnding}
              className="min-h-[44px] px-3.5 py-2 rounded-xl border border-state-error-soft/50 text-state-error hover:bg-state-error-soft/20 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ml-auto"
            >
              <span>Encerrar Modo Caos</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL / SELETOR DE PARTICIPANTE TARDIO */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-surface-card rounded-3xl border border-border-default p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-extrabold text-text-primary">
                Adicionar Participante ao Caos
              </h4>
              <button 
                onClick={() => setShowAddMemberModal(false)}
                className="p-1 text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-text-secondary">
              Quem entrou na missão terá acesso imediato às tarefas abertas da força-tarefa.
            </p>

            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {nonParticipatingActiveMembers.map(m => (
                <button
                  key={m.id}
                  id={`chaos-select-late-member-${m.id}`}
                  onClick={() => setSelectedLateMemberId(m.id)}
                  className={`w-full min-h-[44px] p-2.5 rounded-xl border text-left flex items-center justify-between transition cursor-pointer ${
                    selectedLateMemberId === m.id
                      ? 'border-brand-primary bg-brand-primary-soft text-text-primary'
                      : 'border-border-default hover:bg-surface-subtle text-text-secondary'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div 
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: `${m.color || '#f59e0b'}25`, color: m.color || '#f59e0b' }}
                    >
                      {m.avatar || '👤'}
                    </div>
                    <span className="text-xs font-bold">{m.name}</span>
                  </div>
                  {selectedLateMemberId === m.id && <Check className="w-4 h-4 text-brand-primary" />}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddMemberModal(false)}
                className="flex-1 min-h-[44px] py-2 rounded-xl border border-border-default text-xs font-bold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="chaos-confirm-add-member-btn"
                onClick={handleAddLateParticipant}
                disabled={!selectedLateMemberId}
                className="flex-1 min-h-[44px] py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-text-on-primary text-xs font-bold shadow-xs transition disabled:opacity-50 cursor-pointer"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO DE CONFIRMAÇÃO DE ENCERRAMENTO ANTECIPADO */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div 
            id="chaos-confirm-end-dialog"
            className="w-full max-w-sm bg-surface-card rounded-3xl border border-border-default p-6 space-y-4 shadow-xl text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 text-xl mx-auto flex items-center justify-center">
              🔥
            </div>

            <div className="space-y-1">
              <h4 className="text-base font-black text-text-primary">
                Encerrar o Modo Caos agora?
              </h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                As tarefas que ainda não foram concluídas continuarão normalmente na casa.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                id="chaos-cancel-end-btn"
                onClick={() => setShowEndConfirm(false)}
                disabled={isEnding}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl border border-border-default text-xs font-bold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
              >
                Continuar o Caos
              </button>
              <button
                type="button"
                id="chaos-confirm-end-btn"
                onClick={handleCompleteSession}
                disabled={isEnding}
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-state-error hover:bg-state-error-hover text-white text-xs font-extrabold shadow-xs transition cursor-pointer"
              >
                {isEnding ? 'Encerrando...' : 'Encerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HF3: MODAL DE ENCERRAMENTO ASSISTIDO (100% DE CONCLUSÃO) */}
      {showAssisted100Modal && isAdmin && (
        <div 
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div 
            id="chaos-assisted-100-modal"
            className="w-full max-w-sm bg-surface-card rounded-3xl border border-amber-500/30 p-6 space-y-4 shadow-xl text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 text-xl mx-auto flex items-center justify-center">
              🔥
            </div>

            <div className="space-y-1.5">
              <h4 className="text-base font-black text-text-primary">
                Caos controlado!
              </h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                Todas as tarefas foram concluídas antes do tempo. Deseja encerrar o Modo Caos agora?
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2">
              <button
                type="button"
                id="chaos-assisted-continue-btn"
                onClick={handleContinueUntilEnd}
                className="w-full sm:flex-1 min-h-[44px] py-2.5 px-3 rounded-xl border border-border-default text-xs font-bold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
              >
                Continuar até o fim
              </button>
              <button
                type="button"
                id="chaos-assisted-end-btn"
                onClick={handleAssistedCompleteSession}
                disabled={isEnding}
                className="w-full sm:flex-1 min-h-[44px] py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-extrabold shadow-xs transition cursor-pointer"
              >
                {isEnding ? 'Encerrando...' : 'Encerrar Modo Caos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
