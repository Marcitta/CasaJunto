import React, { useState, useEffect } from 'react';
import { X, Check, Clock, Home, Calendar, AlertCircle, Sparkles } from 'lucide-react';
import { TaskMaster } from '../types';
import { Room, FamilyTask, BatchAddRoutineInput } from '../types';
import { taskCategoryLabels } from '../data/tasks';

interface BatchConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTasks: TaskMaster[];
  familyTasks: FamilyTask[];
  rooms: Room[];
  onConfirm: (configs: BatchAddRoutineInput[]) => Promise<void>;
  isSubmitting?: boolean;
}

interface TaskConfigState {
  roomId: string;
  frequency: string;
  preferredDays: number[];
  dayOfMonth: number;
  preferredTime: string;
  status: 'NEW' | 'REACTIVATE' | 'ALREADY_ACTIVE';
  existingRoutineId?: string;
}

const DAY_LABELS = [
  { day: 0, label: 'Dom' },
  { day: 1, label: 'Seg' },
  { day: 2, label: 'Ter' },
  { day: 3, label: 'Qua' },
  { day: 4, label: 'Qui' },
  { day: 5, label: 'Sex' },
  { day: 6, label: 'Sáb' }
];

export const BatchConfigurationModal: React.FC<BatchConfigurationModalProps> = ({
  isOpen,
  onClose,
  selectedTasks,
  familyTasks,
  rooms,
  onConfirm,
  isSubmitting = false
}) => {
  const [configs, setConfigs] = useState<Record<string, TaskConfigState>>({});
  const [globalRoomId, setGlobalRoomId] = useState<string>('');
  const [globalTime, setGlobalTime] = useState<string>('09:00');
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeRooms = rooms.filter(r => r.active !== false);

  // Initialize configurations when selectedTasks or familyTasks change
  useEffect(() => {
    if (!isOpen) return;

    const initialConfigs: Record<string, TaskConfigState> = {};

    selectedTasks.forEach(task => {
      const existing = familyTasks.find(ft =>
        (ft.task_master_id === task.id || ft.taskMasterId === task.id || ft.task_id === task.id || ft.taskId === task.id || ft.id === task.id)
      );

      let status: 'NEW' | 'REACTIVATE' | 'ALREADY_ACTIVE' = 'NEW';
      if (existing) {
        status = existing.active ? 'ALREADY_ACTIVE' : 'REACTIVATE';
      }

      // Room matching logic
      let matchedRoomId = '';
      if (existing && existing.room_id && activeRooms.some(r => r.id === existing.room_id)) {
        matchedRoomId = existing.room_id;
      } else if (existing && existing.roomId && activeRooms.some(r => r.id === existing.roomId)) {
        matchedRoomId = existing.roomId;
      } else if (task.room_type && activeRooms.length > 0) {
        const matches = activeRooms.filter(r =>
          (r.type && r.type.toLowerCase() === task.room_type.toLowerCase()) ||
          r.name.toLowerCase().includes(task.room_type.toLowerCase())
        );
        if (matches.length === 1) {
          matchedRoomId = matches[0].id;
        } else if (matches.length > 1) {
          matchedRoomId = matches[0].id;
        } else {
          matchedRoomId = activeRooms[0].id;
        }
      } else if (activeRooms.length > 0) {
        matchedRoomId = activeRooms[0].id;
      }

      // Frequency matching logic
      let freq = 'DAILY';
      let days = [1];
      let dom = 1;

      if (existing && existing.frequency) {
        freq = existing.frequency.toUpperCase();
        if (existing.preferred_days || existing.preferredDays) {
          days = existing.preferred_days || existing.preferredDays || [1];
        }
        if (existing.day_of_month !== undefined || existing.dayOfMonth !== undefined) {
          dom = existing.day_of_month ?? existing.dayOfMonth ?? 1;
        }
      } else if (task.frequency_type) {
        switch (task.frequency_type) {
          case 'daily':
            freq = 'DAILY';
            break;
          case 'several_times_week':
            freq = 'WEEKLY';
            days = [1, 3, 5];
            break;
          case 'weekly':
            freq = 'WEEKLY';
            days = [6];
            break;
          case 'biweekly':
            freq = 'BIWEEKLY';
            break;
          case 'monthly':
            freq = 'MONTHLY';
            dom = 1;
            break;
          case 'as_needed':
            freq = 'ONE_TIME';
            break;
          default:
            freq = 'DAILY';
        }
      }

      initialConfigs[task.id] = {
        roomId: matchedRoomId,
        frequency: freq,
        preferredDays: days,
        dayOfMonth: dom,
        preferredTime: existing?.preferred_time || existing?.preferredTime || '09:00',
        status,
        existingRoutineId: existing?.id
      };
    });

    setConfigs(initialConfigs);
    setValidationError(null);
  }, [isOpen, selectedTasks, familyTasks, rooms]);

  if (!isOpen) return null;

  const handleUpdateConfig = (taskId: string, partial: Partial<TaskConfigState>) => {
    setConfigs(prev => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        ...partial
      }
    }));
    setValidationError(null);
  };

  const handleToggleDay = (taskId: string, day: number) => {
    const current = configs[taskId]?.preferredDays || [];
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b);
    handleUpdateConfig(taskId, { preferredDays: next });
  };

  const handleApplyGlobalRoom = () => {
    if (!globalRoomId) return;
    setConfigs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        if (next[id].status !== 'ALREADY_ACTIVE') {
          next[id] = { ...next[id], roomId: globalRoomId };
        }
      });
      return next;
    });
  };

  const handleApplyGlobalTime = () => {
    if (!globalTime) return;
    setConfigs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        if (next[id].status !== 'ALREADY_ACTIVE') {
          next[id] = { ...next[id], preferredTime: globalTime };
        }
      });
      return next;
    });
  };

  // Counts
  const newCount = Object.values(configs).filter(c => c.status === 'NEW').length;
  const reactivateCount = Object.values(configs).filter(c => c.status === 'REACTIVATE').length;
  const alreadyActiveCount = Object.values(configs).filter(c => c.status === 'ALREADY_ACTIVE').length;

  const handleConfirm = async () => {
    // Validation
    if (activeRooms.length === 0) {
      setValidationError('Nenhum cômodo ativo encontrado na casa. Cadastre ao menos um cômodo antes de adicionar tarefas.');
      return;
    }

    const tasksToCommit = selectedTasks.filter(t => configs[t.id]?.status !== 'ALREADY_ACTIVE');

    if (tasksToCommit.length === 0) {
      setValidationError('Todas as tarefas selecionadas já estão ativas na casa.');
      return;
    }

    for (const task of tasksToCommit) {
      const cfg = configs[task.id];
      if (!cfg || !cfg.roomId) {
        setValidationError(`A tarefa "${task.name}" precisa de um cômodo selecionado.`);
        return;
      }
      if (cfg.frequency === 'WEEKLY' && (!cfg.preferredDays || cfg.preferredDays.length === 0)) {
        setValidationError(`A tarefa "${task.name}" é semanal e requer ao menos um dia da semana selecionado.`);
        return;
      }
      if (cfg.frequency === 'MONTHLY' && (cfg.dayOfMonth < 1 || cfg.dayOfMonth > 31)) {
        setValidationError(`A tarefa "${task.name}" é mensal e requer um dia do mês válido (1 a 31).`);
        return;
      }
    }

    const payload: BatchAddRoutineInput[] = tasksToCommit.map(task => {
      const cfg = configs[task.id];
      const existing = familyTasks.find(ft =>
        (ft.task_master_id === task.id || ft.taskMasterId === task.id || ft.task_id === task.id || ft.taskId === task.id || ft.id === task.id)
      );
      return {
        taskMasterId: task.id,
        name: task.name,
        category: task.category,
        roomId: cfg.roomId,
        frequency: cfg.frequency,
        preferredDays: cfg.frequency === 'WEEKLY' ? cfg.preferredDays : undefined,
        dayOfMonth: cfg.frequency === 'MONTHLY' ? cfg.dayOfMonth : undefined,
        preferredTime: cfg.preferredTime || '09:00',
        durationMinutes: task.duration_minutes || 20,
        effort: task.effort_level ? task.effort_level * 5 : 10,
        executionTarget: existing?.executionTarget || 'HOUSEHOLD',
        domesticSupportId: existing?.domesticSupportId ?? null
      };
    });

    await onConfirm(payload);
  };

  return (
    <div
      id="batch-config-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-config-title"
    >
      <div
        id="batch-config-modal-content"
        className="w-full max-w-3xl bg-surface-card rounded-2xl shadow-2xl border border-border-default flex flex-col max-h-[92vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border-default bg-surface-card">
          <div>
            <h2 id="batch-config-title" className="text-xl sm:text-2xl font-bold text-text-primary">
              Configurar Tarefas em Lote
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Revise o cômodo, frequência e horário antes de adicionar à rotina da família
            </p>
          </div>
          <button
            id="btn-close-batch-config"
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Quick Action Bar ("Aplicar a todas") */}
        {selectedTasks.length > 1 && (
          <div
            id="batch-config-quick-apply"
            className="bg-surface-subtle border-b border-border-default px-4 py-3 sm:px-6 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-text-secondary"
          >
            <span className="font-semibold flex items-center gap-1.5 text-text-primary">
              <Sparkles className="w-4 h-4 text-brand-primary" />
              Aplicar a todas:
            </span>

            {activeRooms.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  id="select-global-room"
                  value={globalRoomId}
                  onChange={e => setGlobalRoomId(e.target.value)}
                  className="bg-surface-card border border-border-default rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                  aria-label="Selecionar cômodo para todas"
                >
                  <option value="">Selecione cômodo...</option>
                  {activeRooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  id="btn-apply-global-room"
                  type="button"
                  onClick={handleApplyGlobalRoom}
                  disabled={!globalRoomId}
                  className="px-2.5 py-1.5 bg-surface-card border border-border-default rounded-lg text-xs font-medium text-text-primary hover:bg-surface-subtle disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Aplicar Cômodo
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <input
                id="input-global-time"
                type="time"
                value={globalTime}
                onChange={e => setGlobalTime(e.target.value)}
                className="bg-surface-card border border-border-default rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                aria-label="Definir horário para todas"
              />
              <button
                id="btn-apply-global-time"
                type="button"
                onClick={handleApplyGlobalTime}
                className="px-2.5 py-1.5 bg-surface-card border border-border-default rounded-lg text-xs font-medium text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer"
              >
                Aplicar Horário
              </button>
            </div>
          </div>
        )}

        {/* Validation Error Banner */}
        {validationError && (
          <div
            id="batch-config-error"
            className="m-4 p-3 bg-state-error-soft border border-state-error/30 rounded-xl flex items-center gap-2 text-sm text-state-error"
            role="alert"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Task List */}
        <div id="batch-config-task-list" className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {selectedTasks.map((task, index) => {
            const cfg = configs[task.id] || {
              roomId: '',
              frequency: 'DAILY',
              preferredDays: [1],
              dayOfMonth: 1,
              preferredTime: '09:00',
              status: 'NEW'
            };
            const catInfo = taskCategoryLabels[task.category] || { label: task.category, icon: '📋', color: '#5b32a3', bg: '#f4f4ec' };
            const isAlreadyActive = cfg.status === 'ALREADY_ACTIVE';
            const isReactivate = cfg.status === 'REACTIVATE';

            return (
              <div
                key={task.id}
                id={`batch-task-row-${task.id}`}
                className={`p-4 rounded-xl border transition-all ${
                  isAlreadyActive
                    ? 'bg-surface-subtle/60 border-border-default opacity-80'
                    : isReactivate
                    ? 'bg-state-warning-soft border-state-warning/30'
                    : 'bg-surface-card border-border-default shadow-xs'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" role="img" aria-label={catInfo.label}>
                      {catInfo.icon}
                    </span>
                    <div>
                      <h4 className="font-semibold text-sm sm:text-base text-text-primary">
                        {index + 1}. {task.name}
                      </h4>
                      <p className="text-xs text-text-secondary">
                        {catInfo.label} • {task.duration_minutes || 20} min • {task.effort_level ? task.effort_level * 5 : 10} pts
                      </p>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  {isAlreadyActive ? (
                    <span
                      id={`status-badge-already-${task.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-subtle text-text-muted border border-border-default"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Já ativa na casa (sem alterações)
                    </span>
                  ) : isReactivate ? (
                    <span
                      id={`status-badge-reactivate-${task.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-state-warning-soft text-state-warning border border-state-warning/30"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Reativação (mesmo ID)
                    </span>
                  ) : (
                    <span
                      id={`status-badge-new-${task.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-state-success-soft text-state-success border border-state-success/30"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Nova Rotina
                    </span>
                  )}
                </div>

                {!isAlreadyActive && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border-default text-xs sm:text-sm">
                    {/* Room Selector */}
                    <div>
                      <label
                        htmlFor={`task-room-${task.id}`}
                        className="block font-medium text-text-secondary mb-1 flex items-center gap-1"
                      >
                        <Home className="w-3.5 h-3.5" />
                        Cômodo *
                      </label>
                      <select
                        id={`task-room-${task.id}`}
                        value={cfg.roomId}
                        onChange={e => handleUpdateConfig(task.id, { roomId: e.target.value })}
                        className="w-full bg-surface-subtle border border-border-default rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                        required
                        aria-label={`Cômodo para ${task.name}`}
                      >
                        <option value="">Selecione o cômodo...</option>
                        {activeRooms.map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Frequency Selector */}
                    <div>
                      <label
                        htmlFor={`task-freq-${task.id}`}
                        className="block font-medium text-text-secondary mb-1 flex items-center gap-1"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        Frequência *
                      </label>
                      <select
                        id={`task-freq-${task.id}`}
                        value={cfg.frequency}
                        onChange={e => handleUpdateConfig(task.id, { frequency: e.target.value })}
                        className="w-full bg-surface-subtle border border-border-default rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                        aria-label={`Frequência para ${task.name}`}
                      >
                        <option value="DAILY">Diária</option>
                        <option value="WEEKLY">Semanal</option>
                        <option value="BIWEEKLY">Quinzenal</option>
                        <option value="MONTHLY">Mensal</option>
                        <option value="ONE_TIME">Pontual</option>
                      </select>
                    </div>

                    {/* Preferred Time */}
                    <div>
                      <label
                        htmlFor={`task-time-${task.id}`}
                        className="block font-medium text-text-secondary mb-1 flex items-center gap-1"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Horário Sugerido
                      </label>
                      <input
                        id={`task-time-${task.id}`}
                        type="time"
                        value={cfg.preferredTime}
                        onChange={e => handleUpdateConfig(task.id, { preferredTime: e.target.value })}
                        className="w-full bg-surface-subtle border border-border-default rounded-lg px-2.5 py-1.5 text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                        aria-label={`Horário para ${task.name}`}
                      />
                    </div>

                    {/* Sub-config: WEEKLY preferred days */}
                    {cfg.frequency === 'WEEKLY' && (
                      <div className="sm:col-span-3 pt-2">
                        <span className="block font-medium text-text-secondary mb-1.5 text-xs">
                          Dias da Semana (ao menos 1):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {DAY_LABELS.map(({ day, label }) => {
                            const isSelected = cfg.preferredDays?.includes(day);
                            return (
                              <button
                                key={day}
                                id={`btn-day-${task.id}-${day}`}
                                type="button"
                                onClick={() => handleToggleDay(task.id, day)}
                                className={`min-h-[36px] px-3 py-1 text-xs rounded-lg font-medium border transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-brand-primary text-text-on-primary border-brand-primary'
                                    : 'bg-surface-card text-text-secondary border-border-default hover:bg-surface-subtle'
                                }`}
                                aria-label={`${label} para ${task.name}`}
                                aria-pressed={isSelected}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Sub-config: MONTHLY day of month */}
                    {cfg.frequency === 'MONTHLY' && (
                      <div className="sm:col-span-3 pt-2 flex items-center gap-2">
                        <label htmlFor={`task-dom-${task.id}`} className="font-medium text-text-secondary text-xs">
                          Dia do Mês (1-31):
                        </label>
                        <input
                          id={`task-dom-${task.id}`}
                          type="number"
                          min={1}
                          max={31}
                          value={cfg.dayOfMonth || 1}
                          onChange={e =>
                            handleUpdateConfig(task.id, {
                              dayOfMonth: Math.max(1, Math.min(31, parseInt(e.target.value) || 1))
                            })
                          }
                          className="w-20 bg-surface-subtle border border-border-default rounded-lg px-2 py-1 text-xs text-text-primary"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Summary & Actions */}
        <div className="p-4 sm:p-6 border-t border-border-default bg-surface-card flex flex-col sm:flex-row items-center justify-between gap-4">
          <div id="batch-config-summary" className="text-xs sm:text-sm text-text-secondary text-center sm:text-left">
            <span className="font-semibold text-text-primary">{selectedTasks.length} tarefas selecionadas: </span>
            <span>{newCount} novas</span>
            {reactivateCount > 0 && <span>, {reactivateCount} reativações</span>}
            {alreadyActiveCount > 0 && <span>, {alreadyActiveCount} já ativas</span>}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              id="btn-batch-cancel-config"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-subtle rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-batch-confirm-add"
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting || newCount + reactivateCount === 0}
              className="min-h-[44px] px-5 py-2 text-sm font-semibold bg-brand-primary text-text-on-primary hover:bg-brand-primary-hover rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Adicionando...</span>
                </>
              ) : (
                <span>Confirmar e Adicionar ({newCount + reactivateCount})</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
