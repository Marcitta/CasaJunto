import React, { useState, useContext, useMemo, useEffect } from 'react';
import { CheckCircle2, Calendar, Check, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useApp } from '../context/AppContext';
import { AuthContext } from '../context/AuthContext';
import { Task } from '../types';
import { getFamilyLocalDate, getTodayDateString } from '../domain/utils/dateTimeUtils';
import { 
  computeTodayProgress, 
  resolveTodayDate, 
  getTaskDate,
  isActionableTaskStatus,
  isTaskFromActiveRoutine
} from '../domain/selectors/todayProgressSelectors';
import { selectVisibleTodayTasks } from '../domain/rbac/rolePermissions';

export type TodayFilter = 'mine' | 'all' | 'available';

export interface TodayViewProps {
  targetDate?: string;
  initialFilter?: TodayFilter;
}

export const TodayView: React.FC<TodayViewProps> = ({ 
  targetDate: propTargetDate,
  initialFilter: propInitialFilter
}) => {
  const { 
    tasks, 
    completeTask, 
    setActiveTaskForInspect, 
    setActiveTaskForReschedule, 
    members,
    rooms,
    currentMember,
    family,
    selectedDate,
    isDemoMode,
    familyTasks,
    activeChaosSession
  } = useApp();

  const auth = useContext(AuthContext);
  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';

  // Default Filter Resolution:
  // 1. Explicit prop if provided (sanitized against role)
  // 2. Demo Mode: default = 'all' (rich family routine exploration)
  // 3. Authenticated MEMBER: default = 'mine'
  // 4. Authenticated ADMIN: default = 'all'
  // 5. Test/unauthenticated fallback: default = 'all' for admin, 'mine' for member
  const computeInitialFilter = (): TodayFilter => {
    if (propInitialFilter) {
      if (!isAdmin && propInitialFilter === 'all') return 'mine';
      return propInitialFilter;
    }
    if (isDemoMode) return 'all';
    if (auth?.currentUser) {
      return isAdmin ? 'all' : 'mine';
    }
    return isAdmin ? 'all' : 'mine';
  };

  const [activeFilter, setActiveFilter] = useState<TodayFilter>(computeInitialFilter);

  useEffect(() => {
    if (!isAdmin && activeFilter === 'all') {
      setActiveFilter('mine');
    }
  }, [isAdmin, activeFilter]);

  // PV2-HF1 & HOTFIX-METRIC-1: Determina a data ativa do dia local da família (ou prop override se especificado)
  const activeDate = resolveTodayDate({
    family,
    selectedDate,
    propTargetDate
  });

  // HOTFIX-METRIC-1: Reutiliza o universo operacional canônico compartilhado com RightSidebar
  const {
    actionableTasks: rawPendingTasks,
    completedTasks: rawCompletedToday
  } = useMemo(() => {
    return computeTodayProgress({
      tasks,
      family,
      familyTasks,
      targetDate: activeDate
    });
  }, [tasks, family, familyTasks, activeDate]);

  // CANONICAL SCOPE:
  // ADMIN: visualiza todas as tarefas acionáveis da família
  // MEMBER: universo autorizado de leitura operacional é estritamente tarefas próprias + tarefas não atribuídas
  const pendingTasks = useMemo(() => {
    if (isAdmin) return rawPendingTasks;
    return selectVisibleTodayTasks(rawPendingTasks, currentMember?.id, currentMember?.role);
  }, [isAdmin, rawPendingTasks, currentMember]);

  // Helpers de atribuição
  const isTaskAssignedToCaller = (task: Task): boolean => {
    if (!currentMember) return false;
    return task.assignedMemberId === currentMember.id || task.assigneeId === currentMember.id;
  };

  const isTaskUnassigned = (task: Task): boolean => {
    return Boolean(task.isUnassigned) || !task.assignedMemberId || task.assignedMemberId.trim() === '';
  };

  // Contadores derivados estritamente do conjunto de hoje autorizado para o usuário
  const countMine = pendingTasks.filter(t => isTaskAssignedToCaller(t)).length;
  const countAvailable = pendingTasks.filter(t => isTaskUnassigned(t)).length;
  const countAll = isAdmin ? pendingTasks.length : (countMine + countAvailable);

  // Lista de pendências filtrada pela seleção ativa
  const filteredPendingTasks = pendingTasks.filter(t => {
    if (activeFilter === 'mine') {
      return isTaskAssignedToCaller(t);
    }
    if (activeFilter === 'available') {
      return isTaskUnassigned(t);
    }
    return isAdmin ? true : (isTaskAssignedToCaller(t) || isTaskUnassigned(t));
  });

  // Tarefas concluídas apresentadas de acordo com o filtro ativo:
  // - Minhas: concluídas atribuídas/recompensadas ao membro atual
  // - Todas: todas as concluídas autorizadas
  // - Disponíveis: NENHUMA (tarefas concluídas não estão disponíveis)
  const allCompletedToday = useMemo(() => {
    if (isAdmin) return rawCompletedToday;
    if (!currentMember) return [];
    return rawCompletedToday.filter(t => 
      t.completedByMemberId === currentMember.id ||
      t.assignedMemberId === currentMember.id ||
      t.assigneeId === currentMember.id
    );
  }, [isAdmin, rawCompletedToday, currentMember]);

  const filteredCompletedTasks = allCompletedToday.filter(t => {
    if (activeFilter === 'available') {
      return false;
    }
    if (activeFilter === 'mine') {
      if (!currentMember) return false;
      return (
        t.completedByMemberId === currentMember.id ||
        t.assignedMemberId === currentMember.id ||
        t.assigneeId === currentMember.id
      );
    }
    return true; // 'all'
  });

  const handleComplete = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await completeTask(task.id);
    if (success) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 }
      });
    }
  };

  return (
    <div id="today-view-container" className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5 w-full min-w-0 overflow-x-hidden">
      {/* Filtros Compactos Segmentados (Minhas | Todas | Disponíveis para Admin; Minhas | Disponíveis para Member) */}
      <div 
        id="today-filters"
        role="tablist"
        aria-label="Filtrar tarefas de hoje"
        className={`w-full grid ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'} p-1 bg-surface-card rounded-2xl border border-border-default shadow-2xs gap-1`}
      >
        <button
          id="filter-mine"
          role="tab"
          aria-selected={activeFilter === 'mine'}
          onClick={() => setActiveFilter('mine')}
          className={`min-h-[44px] px-2 sm:px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            activeFilter === 'mine'
              ? 'bg-brand-primary text-text-on-primary shadow-xs'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
          }`}
        >
          <span className="truncate">Minhas</span>
          <span 
            id="count-filter-mine"
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeFilter === 'mine'
                ? 'bg-white/20 text-white'
                : 'bg-surface-subtle text-text-muted'
            }`}
          >
            {countMine}
          </span>
        </button>

        {isAdmin && (
          <button
            id="filter-all"
            role="tab"
            aria-selected={activeFilter === 'all'}
            onClick={() => setActiveFilter('all')}
            className={`min-h-[44px] px-2 sm:px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-brand-primary text-text-on-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
            }`}
          >
            <span className="truncate">Todas</span>
            <span 
              id="count-filter-all"
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeFilter === 'all'
                  ? 'bg-white/20 text-white'
                  : 'bg-surface-subtle text-text-muted'
              }`}
            >
              {countAll}
            </span>
          </button>
        )}

        <button
          id="filter-available"
          role="tab"
          aria-selected={activeFilter === 'available'}
          onClick={() => setActiveFilter('available')}
          className={`min-h-[44px] px-2 sm:px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
            activeFilter === 'available'
              ? 'bg-brand-primary text-text-on-primary shadow-xs'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
          }`}
        >
          <span className="truncate">Disponíveis</span>
          <span 
            id="count-filter-available"
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeFilter === 'available'
                ? 'bg-white/20 text-white'
                : 'bg-surface-subtle text-text-muted'
            }`}
          >
            {countAvailable}
          </span>
        </button>
      </div>

      {/* Pending Tasks Section */}
      <div id="today-pending-section">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-2">
            <span>
              {activeFilter === 'mine' 
                ? 'Minhas Tarefas para Hoje' 
                : activeFilter === 'available' 
                  ? 'Tarefas Disponíveis para Hoje' 
                  : 'Pendentes para Hoje'}
            </span>
            <span id="today-pending-count" className="px-2 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary text-xs font-bold">
              {filteredPendingTasks.length}
            </span>
          </h3>
        </div>

        {filteredPendingTasks.length === 0 ? (
          <div 
            id="today-empty-state" 
            className="p-8 text-center bg-surface-card rounded-2xl border border-border-default text-xs text-text-muted transition-all"
          >
            {activeFilter === 'mine' && (
              <div id="today-empty-mine">
                <Sparkles className="w-8 h-8 text-brand-primary mx-auto mb-2 opacity-80" />
                <p className="font-bold text-text-primary text-sm">Você não tem tarefas para hoje</p>
                <p className="mt-1 max-w-md mx-auto">
                  Tudo o que estava planejado para você hoje foi feito ou não há pendências sob sua responsabilidade.
                </p>
              </div>
            )}
            {activeFilter === 'available' && (
              <div id="today-empty-available">
                <Sparkles className="w-8 h-8 text-state-success mx-auto mb-2 opacity-80" />
                <p className="font-bold text-text-primary text-sm">Nenhuma tarefa disponível no momento</p>
                <p className="mt-1 max-w-md mx-auto">
                  Todas as tarefas de hoje já possuem um responsável designado.
                </p>
              </div>
            )}
            {activeFilter === 'all' && (
              <div id="today-empty-all">
                <CheckCircle2 className="w-8 h-8 text-state-success mx-auto mb-2 opacity-80" />
                <p className="font-bold text-text-primary text-sm">Tudo concluído por hoje!</p>
                <p className="mt-1 max-w-md mx-auto">
                  A casa está em ordem e todas as pendências foram finalizadas.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div id="today-pending-list" className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredPendingTasks.map(task => {
              const assigned = members.find(m => m.id === task.assignedMemberId || m.id === task.assigneeId);
              const isUnassigned = isTaskUnassigned(task);
              const isAssignedToCaller = isTaskAssignedToCaller(task);
              const isAdmin = currentMember?.role === 'ADMIN';

              // Section 10 UI Authorization:
              // MEMBER: own task (enabled), other's task (disabled), unassigned (enabled)
              // ADMIN: assigned task (enabled), unassigned task (enabled)
              const canComplete = isAdmin || isAssignedToCaller || isUnassigned;
              const isChaosTask = Boolean(
                activeChaosSession &&
                activeChaosSession.status === 'ACTIVE' &&
                (
                  (task as any).chaos_session_id === activeChaosSession.id ||
                  (task as any).chaosSessionId === activeChaosSession.id ||
                  (activeChaosSession.tasks && activeChaosSession.tasks.some(ct => ct.assignmentId === task.id || ct.familyTaskId === (task.familyTaskId || (task as any).family_task_id))) ||
                  (activeChaosSession.selectedTaskIds && activeChaosSession.selectedTaskIds.includes(task.familyTaskId || (task as any).family_task_id || task.id))
                )
              );

              return (
                <div
                  key={task.id}
                  id={`today-task-${task.id}`}
                  onClick={() => setActiveTaskForInspect(task)}
                  className="p-4 rounded-2xl bg-surface-card border border-border-default hover:border-brand-primary shadow-2xs hover:shadow-xs transition cursor-pointer flex flex-col justify-between group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand-primary-soft text-brand-primary">
                          {rooms.find(r => r.id === task.roomId)?.name || task.roomName || 'Geral'}
                        </span>
                        <span className="text-[10px] font-semibold text-brand-accent">
                          +{task.effort || 10} pts
                        </span>
                        {isChaosTask && (
                          <span
                            id={`badge-chaos-${task.id}`}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1"
                          >
                            🔥 Modo Caos
                          </span>
                        )}
                        {isUnassigned && (
                          <span 
                            id={`badge-available-${task.id}`}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-state-success-soft text-state-success flex items-center gap-1"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            Disponível
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-text-primary group-hover:text-brand-primary transition truncate">
                        {task.title}
                      </h4>
                      {task.description && (
                        <p className="text-xs text-text-secondary mt-1 line-clamp-1">{task.description}</p>
                      )}
                    </div>

                    {/* MOB-002: Botão de conclusão com touch target de 44x44px */}
                    {canComplete ? (
                      <button
                        id={`complete-btn-${task.id}`}
                        onClick={e => handleComplete(task, e)}
                        aria-label={
                          isUnassigned 
                            ? `Assumir e concluir tarefa: ${task.title}` 
                            : isAdmin && !isAssignedToCaller 
                              ? `Concluir como administradora: ${task.title} (atribuída a ${assigned?.name || 'outro morador'})`
                              : `Concluir tarefa: ${task.title}`
                        }
                        title={
                          isUnassigned 
                            ? 'Assumir e concluir tarefa (Iniciativa)' 
                            : isAdmin && !isAssignedToCaller 
                              ? `Concluir como administradora (atribuída a ${assigned?.name || 'outro morador'})`
                              : 'Concluir tarefa'
                        }
                        className={`min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border flex items-center justify-center transition cursor-pointer shrink-0 active:scale-95 ${
                          isUnassigned
                            ? 'border-state-success-soft bg-state-success-soft/30 hover:bg-state-success hover:text-white text-state-success hover:border-state-success'
                            : 'border-border-default hover:border-brand-primary hover:bg-brand-primary hover:text-text-on-primary text-text-muted'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        id={`disabled-btn-${task.id}`}
                        disabled
                        onClick={e => e.stopPropagation()}
                        aria-label={`Tarefa atribuída a ${assigned?.name || 'outro morador'}. Conclusão restrita.`}
                        title={`Atribuída a ${assigned?.name || 'outro morador'}. Somente o morador responsável ou administrador pode concluir.`}
                        className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl border border-border-default bg-disabled-background text-disabled-text flex items-center justify-center cursor-not-allowed opacity-40 shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-border-default flex items-center justify-between text-[11px] text-text-muted">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {isUnassigned ? (
                        <>
                          <div className="w-5 h-5 rounded-full border border-dashed border-state-success flex items-center justify-center text-state-success text-[10px] bg-state-success-soft shrink-0">
                            <Sparkles className="w-3 h-3" />
                          </div>
                          <span className="font-semibold text-state-success truncate">
                            Disponível (Iniciativa)
                          </span>
                        </>
                      ) : (
                        <>
                          <div 
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0"
                            style={{ backgroundColor: `${assigned?.color || '#5b32a3'}20`, color: assigned?.color || '#5b32a3' }}
                          >
                            {assigned?.avatar || '👤'}
                          </div>
                          <span className="font-semibold text-text-secondary truncate">
                            {assigned?.name || 'Não atribuído'}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        id={`reschedule-btn-${task.id}`}
                        onClick={e => {
                          e.stopPropagation();
                          setActiveTaskForReschedule(task);
                        }}
                        aria-label={`Reagendar tarefa: ${task.title}`}
                        className="min-h-[44px] px-2.5 py-1.5 -my-1 rounded-lg text-xs font-semibold text-text-muted hover:text-text-primary hover:bg-surface-subtle transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5 opacity-70" />
                        <span>Reagendar</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed Tasks Section */}
      {filteredCompletedTasks.length > 0 && (
        <div id="today-completed-section" className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-extrabold text-text-muted flex items-center gap-2">
              <span>Concluídas Hoje</span>
              <span id="today-completed-count" className="px-2 py-0.5 rounded-full bg-surface-subtle text-text-muted text-xs font-bold">
                {filteredCompletedTasks.length}
              </span>
            </h3>
          </div>

          <div id="today-completed-list" className="space-y-2">
            {filteredCompletedTasks.map(task => {
              const assigned = members.find(m => m.id === task.assignedMemberId || m.id === task.assigneeId);
              const isIntervention = task.completionType === 'ADMIN_INTERVENTION' || 
                (Boolean(task.completedByMemberId) && Boolean(task.assignedMemberId) && task.completedByMemberId !== task.assignedMemberId);
              const completedName = task.completedByName || members.find(m => m.id === task.completedByMemberId)?.name || 'Administradora';
              const isChaosTask = Boolean(
                activeChaosSession &&
                (
                  (task as any).chaos_session_id === activeChaosSession.id ||
                  (task as any).chaosSessionId === activeChaosSession.id ||
                  (activeChaosSession.tasks && activeChaosSession.tasks.some(ct => ct.assignmentId === task.id || ct.familyTaskId === (task.familyTaskId || (task as any).family_task_id))) ||
                  (activeChaosSession.selectedTaskIds && activeChaosSession.selectedTaskIds.includes(task.familyTaskId || (task as any).family_task_id || task.id))
                )
              );

              return (
                <div
                  key={task.id}
                  id={`today-completed-${task.id}`}
                  className="p-3.5 rounded-xl bg-surface-subtle border border-border-default flex items-center justify-between opacity-85"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-lg bg-state-success-soft text-state-success flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold text-text-secondary line-through">{task.title}</p>
                        {isChaosTask && (
                          <span
                            id={`badge-chaos-completed-${task.id}`}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          >
                            🔥 Modo Caos
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-muted flex items-center gap-1.5 flex-wrap mt-0.5">
                        {isIntervention ? (
                          <span className="text-state-warning font-medium">
                            Atribuída a {assigned?.name || 'Morador'} • Concluída pela administradora {completedName}
                          </span>
                        ) : task.completionType === 'SELF_CLAIMED' ? (
                          <span className="text-state-success font-medium">
                            Assumida e concluída por {completedName} (Iniciativa)
                          </span>
                        ) : (
                          <span>
                            Feito por {completedName || assigned?.name || 'Alguém'}
                          </span>
                        )}
                        <span>•</span>
                        <span className="text-brand-accent font-semibold">+{task.effort || 10} pts</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

