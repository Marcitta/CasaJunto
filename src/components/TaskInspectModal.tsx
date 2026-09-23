import React, { useState } from 'react';
import { X, Trash2, Calendar, User, Home, Clock, AlertTriangle, CheckCircle2, Sliders } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EditFamilyTaskModal } from './EditFamilyTaskModal';
import { getActiveMembers } from '../domain/selectors';

export const TaskInspectModal: React.FC = () => {
  const { 
    activeTaskForInspect, 
    setActiveTaskForInspect, 
    deleteTask, 
    members, 
    setActiveTaskForReschedule,
    currentMember,
    isDemoMode,
    assignTaskManually 
  } = useApp();

  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [isConfirmingInProgress, setIsConfirmingInProgress] = useState<boolean>(false);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isEditingRoutine, setIsEditingRoutine] = useState<boolean>(false);

  if (!activeTaskForInspect) return null;

  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';
  const isCompleted = activeTaskForInspect.status === 'DONE' || (activeTaskForInspect.status as string) === 'COMPLETED';
  const isInProgress = activeTaskForInspect.status === 'IN_PROGRESS';
  const assigned = members.find(m => m.id === activeTaskForInspect.assignedMemberId);
  const activeMembers = getActiveMembers(members);

  const handleAssigneeChange = async (targetId: string, confirmInProgress = false) => {
    setAssignError(null);
    setAssignSuccess(null);

    if (isInProgress && !confirmInProgress) {
      setPendingTargetId(targetId);
      setIsConfirmingInProgress(true);
      return;
    }

    setIsUpdating(true);
    try {
      const res = await assignTaskManually(
        activeTaskForInspect.id,
        targetId === '' ? null : targetId,
        { confirmInProgress }
      );
      if (!res.success) {
        setAssignError(res.error || 'Não foi possível alterar o responsável.');
      } else {
        setAssignSuccess(targetId === '' ? 'Tarefa definida como sem responsável.' : 'Responsável alterado com sucesso!');
        setTimeout(() => setAssignSuccess(null), 3500);
      }
    } catch (err: any) {
      setAssignError(err?.message || 'Erro inesperado ao alterar responsável.');
    } finally {
      setIsUpdating(false);
      setIsConfirmingInProgress(false);
      setPendingTargetId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary">
            Detalhes da Tarefa
          </span>
          <button 
            onClick={() => setActiveTaskForInspect(null)}
            className="p-1 text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h3 className="text-base font-extrabold text-text-primary">{activeTaskForInspect.title}</h3>
          {activeTaskForInspect.description && (
            <p className="text-xs text-text-secondary mt-1">{activeTaskForInspect.description}</p>
          )}
        </div>

        {/* Notificações de Erro / Sucesso de Atribuição */}
        {assignError && (
          <div className="p-2.5 rounded-xl bg-state-error-soft border border-state-error/30 text-state-error text-xs flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{assignError}</span>
          </div>
        )}
        {assignSuccess && (
          <div className="p-2.5 rounded-xl bg-state-success-soft border border-state-success/30 text-state-success text-xs flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{assignSuccess}</span>
          </div>
        )}

        {/* Diálogo de Confirmação para Tarefas em Andamento */}
        {isConfirmingInProgress && (
          <div className="p-3 rounded-2xl bg-state-warning-soft border border-state-warning/30 space-y-2 text-xs">
            <div className="font-bold text-state-warning flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Confirmar Reatribuição em Andamento</span>
            </div>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              Esta tarefa já está em andamento. Deseja realmente transferi-la para{' '}
              <strong className="text-text-primary">
                {pendingTargetId ? members.find(m => m.id === pendingTargetId)?.name || 'outro morador' : 'Sem responsável'}
              </strong>?
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmingInProgress(false);
                  setPendingTargetId(null);
                }}
                className="px-2.5 py-1 rounded-lg text-xs text-text-secondary hover:bg-surface-subtle cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleAssigneeChange(pendingTargetId || '', true)}
                disabled={isUpdating}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-state-warning text-white cursor-pointer shadow-xs hover:opacity-90"
              >
                Confirmar Reatribuição
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2.5 text-xs text-text-secondary bg-surface-subtle p-3.5 rounded-2xl border border-border-default">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-text-muted">
              <Home className="w-3.5 h-3.5" /> Cômodo:
            </span>
            <span className="font-bold text-text-primary">{activeTaskForInspect.roomName || 'Geral'}</span>
          </div>

          {/* Atribuição de Responsável: Se ADMIN e não concluída, permite selecionar */}
          {isCompleted ? (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-text-muted">
                <User className="w-3.5 h-3.5" /> Responsável:
              </span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-text-primary">{assigned?.name || 'Não atribuído'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-state-success-soft text-state-success font-semibold">
                  Concluída (Bloqueada)
                </span>
              </div>
            </div>
          ) : isAdmin ? (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-border-default/50">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-text-muted shrink-0 font-medium">
                  <User className="w-3.5 h-3.5" /> Responsável:
                </span>
                <select
                  id="assign-task-member-select"
                  value={activeTaskForInspect.assignedMemberId || ''}
                  onChange={(e) => handleAssigneeChange(e.target.value)}
                  disabled={isUpdating || isConfirmingInProgress}
                  className="text-xs font-bold text-text-primary bg-surface-card border border-border-default rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-primary/20 cursor-pointer max-w-[200px]"
                >
                  <option value="">Sem responsável</option>
                  {activeMembers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.avatar || '👤'} {m.name} {m.id === currentMember?.id ? '(Você)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {isInProgress && (
                <span className="text-[10px] text-state-warning flex items-center gap-1 font-medium">
                  <AlertTriangle className="w-3 h-3" /> Tarefa em andamento
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-text-muted">
                <User className="w-3.5 h-3.5" /> Responsável:
              </span>
              <span className="font-bold text-text-primary">{assigned?.name || 'Não atribuído'}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-text-muted">
              <Calendar className="w-3.5 h-3.5" /> Data:
            </span>
            <span className="font-bold text-text-primary">{activeTaskForInspect.dueDate}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-text-muted">
              <Clock className="w-3.5 h-3.5" /> Frequência:
            </span>
            <span className="font-bold text-text-primary">{activeTaskForInspect.frequency}</span>
          </div>
          {activeTaskForInspect.scheduledStart && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-text-muted">
                <Clock className="w-3.5 h-3.5" /> Horário Agendado:
              </span>
              <span className="font-bold text-text-primary">{activeTaskForInspect.scheduledStart}</span>
            </div>
          )}
        </div>

        {/* Explainability do Motor 2.0 */}
        {(activeTaskForInspect.assignedReason || activeTaskForInspect.unassignedReason || activeTaskForInspect.isUnassigned) && (
          <div className={`p-3 rounded-2xl border text-xs space-y-1 ${
            activeTaskForInspect.isUnassigned
              ? 'bg-state-error-soft border-state-error/30 text-state-error'
              : 'bg-brand-primary-soft border-brand-primary/20 text-text-primary'
          }`}>
            <div className="font-bold flex items-center gap-1.5">
              <span>{activeTaskForInspect.isUnassigned ? 'Aviso de Não Atribuição (Motor 2.0)' : 'Critério de Escolha do Motor 2.0'}</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              {activeTaskForInspect.unassignedReason || activeTaskForInspect.assignedReason || 'Alocação gerada pelo algoritmo de distribuição justa.'}
            </p>
          </div>
        )}

        <div className="pt-2 flex items-center justify-between">
          {isAdmin ? (
            <button
              onClick={() => {
                deleteTask(activeTaskForInspect.id);
                setActiveTaskForInspect(null);
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-state-error hover:bg-state-error-soft flex items-center gap-1 cursor-pointer transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setIsEditingRoutine(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-text-secondary bg-surface-subtle hover:bg-surface-subtle/80 hover:text-text-primary flex items-center gap-1 cursor-pointer transition border border-border-default"
                title="Editar parâmetros canônicos da rotina"
              >
                <Sliders className="w-3.5 h-3.5 text-brand-primary" />
                <span>Editar Rotina</span>
              </button>
            )}
            {!isCompleted && (
              <button
                onClick={() => {
                  const t = activeTaskForInspect;
                  setActiveTaskForInspect(null);
                  setActiveTaskForReschedule(t);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-brand-primary bg-brand-primary-soft hover:bg-brand-primary-soft/80 cursor-pointer transition"
              >
                Reagendar
              </button>
            )}
            <button
              onClick={() => setActiveTaskForInspect(null)}
              className="px-4 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover cursor-pointer transition"
            >
              Concluído
            </button>
          </div>
        </div>

        {/* Modal de Edição Canônica de Rotina */}
        <EditFamilyTaskModal
          isOpen={isEditingRoutine}
          onClose={() => setIsEditingRoutine(false)}
          familyTaskId={activeTaskForInspect.familyTaskId}
          initialTask={activeTaskForInspect}
        />
      </div>
    </div>
  );
};
