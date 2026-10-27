import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Check, 
  Clock, 
  Home, 
  Calendar, 
  AlertCircle, 
  Sparkles, 
  RotateCcw, 
  AlertTriangle, 
  ShieldCheck, 
  Users, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import { TaskMaster, Room, FamilyTask, BatchAddRoutineInput, ExecutionTarget, DomesticSupport } from '../types';
import { taskCategoryLabels } from '../data/tasks';
import { ExecutionTargetSelector } from './DomesticSupport/ExecutionTargetSelector';
import { AppContext } from '../context/AppContext';
import { checkRoomTaskCompatibility, RoomTaskCompatibilityResult } from '../domain/routine/RoomTaskCompatibility';

interface BatchConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTasks: TaskMaster[];
  familyTasks: FamilyTask[];
  rooms: Room[];
  domesticSupports?: DomesticSupport[];
  onOpenDomesticSupport?: () => void;
  onConfirm: (configs: BatchAddRoutineInput[]) => Promise<void>;
  isSubmitting?: boolean;
}

export interface TaskRoomConfigState {
  selected: boolean;
  frequency: string;
  preferredDays: number[];
  dayOfMonth: number;
  preferredTime: string;
  executionTarget: ExecutionTarget;
  domesticSupportId: string | null;
  status: 'NEW' | 'REACTIVATE' | 'ALREADY_ACTIVE';
  existingRoutineId?: string;
  confirmedCompatibility?: boolean;
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
  domesticSupports: propsDomesticSupports,
  onOpenDomesticSupport,
  onConfirm,
  isSubmitting = false
}) => {
  const appContext = React.useContext(AppContext);
  const domesticSupports = propsDomesticSupports || appContext?.domesticSupports || [];
  const activeSupports = (domesticSupports || []).filter(s => s.active !== false);

  const handleOpenDomesticSupport = () => {
    if (onOpenDomesticSupport) {
      onOpenDomesticSupport();
    } else if (appContext?.setCurrentView) {
      onClose();
      appContext.setCurrentView('domestic_support');
    }
  };

  const activeRooms = useMemo(() => {
    return (rooms || []).filter(r => r && r.active !== false);
  }, [rooms]);

  // Helper to resolve initial configs
  const buildInitialConfigs = (
    tasks: TaskMaster[],
    roomsList: Room[],
    fts: FamilyTask[],
    supports: DomesticSupport[]
  ) => {
    const initialConfigs: Record<string, Record<string, TaskRoomConfigState>> = {};
    const defaultSupportId = supports[0]?.id || null;

    tasks.forEach(task => {
      let defaultFreq = 'DAILY';
      let defaultDays = [1];
      let defaultDom = 1;

      if (task.frequency_type) {
        switch (task.frequency_type) {
          case 'daily':
            defaultFreq = 'DAILY';
            break;
          case 'several_times_week':
            defaultFreq = 'WEEKLY';
            defaultDays = [1, 3, 5];
            break;
          case 'weekly':
            defaultFreq = 'WEEKLY';
            defaultDays = [6];
            break;
          case 'biweekly':
            defaultFreq = 'BIWEEKLY';
            break;
          case 'monthly':
            defaultFreq = 'MONTHLY';
            defaultDom = 1;
            break;
          case 'as_needed':
            defaultFreq = 'ONE_TIME';
            break;
          default:
            defaultFreq = 'DAILY';
        }
      }

      initialConfigs[task.id] = {};

      roomsList.forEach(room => {
        const existing = (fts || []).find(ft => {
          const tmId = ft.task_master_id || ft.taskMasterId || ft.task_id || ft.taskId || ft.id;
          const ftRoom = ft.room_id || ft.roomId;
          return tmId === task.id && ftRoom === room.id;
        });

        const status = !existing
          ? ('NEW' as const)
          : ((existing.active !== false ? 'ALREADY_ACTIVE' : 'REACTIVATE') as 'ALREADY_ACTIVE' | 'REACTIVATE');

        let freq = defaultFreq;
        let days = defaultDays;
        let dom = defaultDom;
        let target: ExecutionTarget = 'HOUSEHOLD';
        let supportId: string | null = defaultSupportId;

        if (existing) {
          if (existing.frequency) freq = existing.frequency.toUpperCase();
          if (existing.preferred_days || existing.preferredDays) {
            days = existing.preferred_days || existing.preferredDays || [1];
          }
          if (existing.day_of_month !== undefined || existing.dayOfMonth !== undefined) {
            dom = existing.day_of_month ?? existing.dayOfMonth ?? 1;
          }
          if (existing.executionTarget) target = existing.executionTarget;
          if (existing.domesticSupportId) supportId = existing.domesticSupportId;
        }

        // Selected is strictly FALSE initially for all non-active rooms!
        // No automatic selection by position or alphabetical order (Regra B.5.3).
        initialConfigs[task.id][room.id] = {
          selected: false,
          frequency: freq,
          preferredDays: days,
          dayOfMonth: dom,
          preferredTime: existing?.preferred_time || existing?.preferredTime || '09:00',
          executionTarget: target,
          domesticSupportId: target === 'HOUSEHOLD' ? null : supportId,
          status,
          existingRoutineId: existing?.id,
          confirmedCompatibility: false
        };
      });
    });

    return initialConfigs;
  };

  // State: configs[taskId][roomId] -> TaskRoomConfigState
  const [configs, setConfigs] = useState<Record<string, Record<string, TaskRoomConfigState>>>(() => {
    return buildInitialConfigs(selectedTasks || [], (rooms || []).filter(r => r && r.active !== false), familyTasks || [], activeSupports);
  });

  // Global toolbar state for applying common configurations
  const [globalRoomId, setGlobalRoomId] = useState<string>('');
  const [globalTime, setGlobalTime] = useState<string>('09:00');
  const [globalFreq, setGlobalFreq] = useState<string>('DAILY');
  const [globalTarget, setGlobalTarget] = useState<ExecutionTarget>('HOUSEHOLD');
  const [globalSupportId, setGlobalSupportId] = useState<string | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSummaryDetails, setShowSummaryDetails] = useState<boolean>(true);
  const [showCommonTargetSelector, setShowCommonTargetSelector] = useState<boolean>(false);

  // Keyboard accessibility: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Refresh configurations when modal opens or selections change
  useEffect(() => {
    if (!isOpen) return;
    setConfigs(buildInitialConfigs(selectedTasks, activeRooms, familyTasks, activeSupports));
    setValidationError(null);
  }, [isOpen, selectedTasks, familyTasks, activeRooms]);

  if (!isOpen) return null;

  // Toggle selection of a room for a task
  const handleToggleRoom = (taskId: string, roomId: string) => {
    setConfigs(prev => {
      const taskConfigs = prev[taskId];
      if (!taskConfigs || !taskConfigs[roomId]) return prev;
      const current = taskConfigs[roomId];
      if (current.status === 'ALREADY_ACTIVE') return prev; // Bloqueia alteração em cômodo já ativo

      return {
        ...prev,
        [taskId]: {
          ...taskConfigs,
          [roomId]: {
            ...current,
            selected: !current.selected
          }
        }
      };
    });
    setValidationError(null);
  };

  // Update specific room config for a task
  const handleUpdateRoomConfig = (
    taskId: string,
    roomId: string,
    partial: Partial<TaskRoomConfigState>
  ) => {
    setConfigs(prev => {
      const taskConfigs = prev[taskId];
      if (!taskConfigs || !taskConfigs[roomId]) return prev;
      const current = taskConfigs[roomId];

      return {
        ...prev,
        [taskId]: {
          ...taskConfigs,
          [roomId]: {
            ...current,
            ...partial
          }
        }
      };
    });
    setValidationError(null);
  };

  // Toggle weekly day for a specific (taskId, roomId)
  const handleToggleDay = (taskId: string, roomId: string, day: number) => {
    const current = configs[taskId]?.[roomId]?.preferredDays || [];
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b);
    handleUpdateRoomConfig(taskId, roomId, { preferredDays: next });
  };

  // Quick Apply: select a specific room across all tasks
  const handleApplyGlobalRoom = () => {
    if (!globalRoomId) return;
    setConfigs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(taskId => {
        if (next[taskId] && next[taskId][globalRoomId]) {
          const roomCfg = next[taskId][globalRoomId];
          if (roomCfg.status !== 'ALREADY_ACTIVE') {
            next[taskId] = {
              ...next[taskId],
              [globalRoomId]: {
                ...roomCfg,
                selected: true
              }
            };
          }
        }
      });
      return next;
    });
  };

  // Quick Apply: apply global time across all currently selected rooms
  const handleApplyGlobalTime = () => {
    if (!globalTime) return;
    setConfigs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(taskId => {
        if (next[taskId]) {
          const updatedRooms = { ...next[taskId] };
          Object.keys(updatedRooms).forEach(roomId => {
            if (updatedRooms[roomId].selected && updatedRooms[roomId].status !== 'ALREADY_ACTIVE') {
              updatedRooms[roomId] = {
                ...updatedRooms[roomId],
                preferredTime: globalTime
              };
            }
          });
          next[taskId] = updatedRooms;
        }
      });
      return next;
    });
  };

  // Quick Apply: apply common frequency, time and execution target across all currently selected rooms
  const handleApplyCommonConfig = () => {
    setConfigs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(taskId => {
        if (next[taskId]) {
          const updatedRooms = { ...next[taskId] };
          Object.keys(updatedRooms).forEach(roomId => {
            if (updatedRooms[roomId].selected && updatedRooms[roomId].status !== 'ALREADY_ACTIVE') {
              updatedRooms[roomId] = {
                ...updatedRooms[roomId],
                frequency: globalFreq,
                preferredTime: globalTime,
                executionTarget: globalTarget,
                domesticSupportId: globalTarget === 'HOUSEHOLD' ? null : globalSupportId
              };
            }
          });
          next[taskId] = updatedRooms;
        }
      });
      return next;
    });
  };

  // Compute live operations and counts
  let newCount = 0;
  let reactivateCount = 0;
  let preservedCount = 0;
  const plannedOperations: Array<{
    task: TaskMaster;
    room: Room;
    config: TaskRoomConfigState;
    action: 'CREATE' | 'REACTIVATE' | 'PRESERVED';
    compat: RoomTaskCompatibilityResult;
  }> = [];

  selectedTasks.forEach(task => {
    activeRooms.forEach(room => {
      const cfg = configs[task.id]?.[room.id];
      const compat = checkRoomTaskCompatibility(task, room);
      if (!cfg) return;

      if (cfg.status === 'ALREADY_ACTIVE') {
        preservedCount++;
        plannedOperations.push({
          task,
          room,
          config: cfg,
          action: 'PRESERVED',
          compat
        });
      } else if (cfg.selected) {
        if (cfg.status === 'REACTIVATE') {
          reactivateCount++;
          plannedOperations.push({
            task,
            room,
            config: cfg,
            action: 'REACTIVATE',
            compat
          });
        } else {
          newCount++;
          plannedOperations.push({
            task,
            room,
            config: cfg,
            action: 'CREATE',
            compat
          });
        }
      }
    });
  });

  const totalToCommit = newCount + reactivateCount;

  // Check for external support completeness among selected items
  const hasIncompleteExternal = plannedOperations.some(op => {
    if (op.action === 'PRESERVED') return false;
    return (
      op.config.executionTarget === 'EXTERNAL_SUPPORT' &&
      (!op.config.domesticSupportId || activeSupports.length === 0)
    );
  });

  // Check for unconfirmed compatibility warnings among selected items
  const hasUnconfirmedCompat = plannedOperations.some(op => {
    if (op.action === 'PRESERVED') return false;
    return op.compat.requiresConfirmation && !op.config.confirmedCompatibility;
  });

  // Submission validation and execution
  const handleConfirm = async () => {
    if (activeRooms.length === 0) {
      setValidationError('Nenhum cômodo ativo encontrado na casa. Cadastre ao menos um cômodo antes de adicionar tarefas.');
      return;
    }

    if (totalToCommit === 0) {
      setValidationError('Nenhum ambiente selecionado para adicionar ou reativar. Escolha ao menos um cômodo em uma das tarefas.');
      return;
    }

    // Validate each planned operation
    for (const op of plannedOperations) {
      if (op.action === 'PRESERVED') continue;
      const { task, room, config } = op;

      if (config.frequency === 'WEEKLY' && (!config.preferredDays || config.preferredDays.length === 0)) {
        setValidationError(`A tarefa "${task.name}" no ambiente "${room.name}" é semanal e requer ao menos um dia da semana.`);
        return;
      }

      if (config.frequency === 'MONTHLY' && (config.dayOfMonth < 1 || config.dayOfMonth > 31)) {
        setValidationError(`A tarefa "${task.name}" no ambiente "${room.name}" é mensal e requer um dia do mês válido (1 a 31).`);
        return;
      }

      if (config.executionTarget === 'EXTERNAL_SUPPORT') {
        if (!config.domesticSupportId) {
          setValidationError(`A tarefa "${task.name}" no ambiente "${room.name}" está definida como "Ajuda externa", mas nenhuma pessoa de apoio foi selecionada.`);
          return;
        }
        const exists = activeSupports.some(s => s.id === config.domesticSupportId);
        if (!exists) {
          setValidationError(`A pessoa de apoio selecionada para "${task.name}" no ambiente "${room.name}" não está ativa.`);
          return;
        }
      }

      if (op.compat.requiresConfirmation && !config.confirmedCompatibility) {
        setValidationError(
          `A tarefa "${task.name}" possui um aviso de compatibilidade com "${room.name}". Confirme explicitamente a compatibilidade para continuar.`
        );
        return;
      }
    }

    // Build payload of canonical BatchAddRoutineInput
    const payload: BatchAddRoutineInput[] = plannedOperations
      .filter(op => op.action !== 'PRESERVED')
      .map(op => {
        const { task, room, config } = op;
        return {
          taskMasterId: task.id,
          name: task.name,
          category: task.category,
          roomId: room.id,
          frequency: config.frequency,
          preferredDays: config.frequency === 'WEEKLY' ? config.preferredDays : undefined,
          dayOfMonth: config.frequency === 'MONTHLY' ? config.dayOfMonth : undefined,
          preferredTime: config.preferredTime || '09:00',
          durationMinutes: task.duration_minutes || 20,
          effort: task.effort_level ? task.effort_level * 5 : 10,
          executionTarget: config.executionTarget,
          domesticSupportId: config.executionTarget === 'HOUSEHOLD' ? null : (config.domesticSupportId ?? null)
        };
      });

    await onConfirm(payload);
  };

  const formatFrequencyLabel = (freq: string, days?: number[], dom?: number) => {
    switch (freq) {
      case 'DAILY':
        return 'Diária';
      case 'WEEKLY':
        if (!days || days.length === 0) return 'Semanal';
        const dayNames = days.map(d => DAY_LABELS.find(l => l.day === d)?.label).filter(Boolean);
        return `Semanal (${dayNames.join(', ')})`;
      case 'BIWEEKLY':
        return 'Quinzenal';
      case 'MONTHLY':
        return `Mensal (dia ${dom || 1})`;
      case 'ONE_TIME':
        return 'Pontual';
      default:
        return freq;
    }
  };

  return (
    <div
      id="batch-config-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-config-title"
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        id="batch-config-modal-content"
        className="w-full max-w-4xl bg-surface-card rounded-3xl shadow-2xl border border-border-default flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header - Fixed top bar */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border-default bg-surface-subtle/40 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-brand-primary-soft text-brand-primary">
                Fase B.5.3 • Multiambiente em Lote
              </span>
              <span className="text-[11px] text-text-muted font-medium">
                {selectedTasks.length} {selectedTasks.length === 1 ? 'tarefa' : 'tarefas'} selecionadas
              </span>
            </div>
            <h2 id="batch-config-title" className="text-lg sm:text-xl font-bold text-text-primary">
              Adicionar tarefas a vários ambientes
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mt-0.5">
              Configurar Tarefas em Lote: selecione um ou vários ambientes para cada tarefa e defina suas frequências e públicos independentes.
            </p>
          </div>
          <button
            id="btn-close-batch-config"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-2xl text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer disabled:opacity-40"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Quick Action Bar ("Aplicar a todas / configuração comum") */}
        <div
          id="batch-config-quick-apply"
          className="bg-surface-subtle border-b border-border-default px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-text-secondary shrink-0"
        >
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="font-semibold flex items-center gap-1.5 text-text-primary text-xs">
              <Sparkles className="w-4 h-4 text-brand-primary" />
              <span>Configuração comum:</span>
            </span>

            {/* Select global room for all tasks */}
            {activeRooms.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  id="select-global-room"
                  value={globalRoomId}
                  onChange={e => setGlobalRoomId(e.target.value)}
                  className="bg-surface-card border border-border-default rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                  aria-label="Selecionar cômodo para todas"
                >
                  <option value="">Marcar cômodo...</option>
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
                  className="min-h-[36px] px-2.5 py-1 bg-surface-card border border-border-default rounded-xl text-xs font-semibold text-text-primary hover:bg-surface-subtle disabled:opacity-40 transition-colors cursor-pointer"
                >
                  Marcar em todas
                </button>
              </div>
            )}

            {/* Global Frequency & Time */}
            <div className="flex items-center gap-1.5">
              <select
                id="select-global-freq"
                value={globalFreq}
                onChange={e => setGlobalFreq(e.target.value)}
                className="bg-surface-card border border-border-default rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                aria-label="Frequência comum"
              >
                <option value="DAILY">Diária</option>
                <option value="WEEKLY">Semanal</option>
                <option value="BIWEEKLY">Quinzenal</option>
                <option value="MONTHLY">Mensal</option>
                <option value="ONE_TIME">Pontual</option>
              </select>

              <input
                id="input-global-time"
                type="time"
                value={globalTime}
                onChange={e => setGlobalTime(e.target.value)}
                className="bg-surface-card border border-border-default rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                aria-label="Definir horário para todas"
              />

              <button
                id="btn-apply-global-time"
                type="button"
                onClick={handleApplyCommonConfig}
                className="min-h-[36px] px-3 py-1 bg-brand-primary-soft text-brand-primary hover:bg-brand-primary hover:text-text-on-primary rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                title="Aplica frequência e horário aos ambientes atualmente selecionados"
              >
                Aplicar aos selecionados
              </button>
            </div>
            {/* Common Execution Target Toggle & Selector */}
            <div className="w-full pt-2 border-t border-border-default/40">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowCommonTargetSelector(prev => !prev)}
                  className="text-xs font-semibold text-brand-primary flex items-center gap-1.5 hover:underline cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Definir responsável / apoio comum para selecionadas</span>
                  {showCommonTargetSelector ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className={showCommonTargetSelector ? "mt-2 pt-2 border-t border-border-default/40" : "hidden"}>
                <ExecutionTargetSelector
                  executionTarget={globalTarget}
                  domesticSupportId={globalSupportId}
                  onChange={(target, supportId) => {
                    setGlobalTarget(target);
                    setGlobalSupportId(target === 'HOUSEHOLD' ? null : supportId);
                  }}
                  activeSupports={activeSupports}
                  onOpenDomesticSupport={handleOpenDomesticSupport}
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] text-text-muted font-medium">
            Cada ambiente permite ajuste individual
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 pb-6">
          {/* Validation Error Banner */}
          {validationError && (
            <div
              id="batch-config-error"
              className="p-3.5 bg-state-error-soft border border-state-error/30 rounded-2xl flex items-center gap-2.5 text-xs sm:text-sm text-state-error font-medium"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Tasks List */}
          <div id="batch-config-task-list" className="space-y-4">
            {selectedTasks.map((task, taskIndex) => {
              const catInfo = taskCategoryLabels[task.category] || { label: task.category, icon: '📋' };
              const taskRoomConfigs = configs[task.id] || {};
              const selectedRoomsForTask = activeRooms.filter(r => taskRoomConfigs[r.id]?.selected);
              const activeRoomsForTask = activeRooms.filter(r => taskRoomConfigs[r.id]?.status === 'ALREADY_ACTIVE');

              return (
                <div
                  key={task.id}
                  id={`batch-task-card-${task.id}`}
                  className="bg-surface-card border border-border-default rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 transition-all"
                >
                  {/* Task Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default/60 pb-3">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0" role="img" aria-label={catInfo.label}>
                        {catInfo.icon}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-sm sm:text-base text-text-primary">
                            {taskIndex + 1}. {task.name}
                          </h3>
                          {activeRoomsForTask.length > 0 && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-subtle text-text-muted border border-border-default">
                              Ativa em: {activeRoomsForTask.map(r => r.name).join(', ')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {catInfo.label} • ~{task.duration_minutes || 20} min • {task.effort_level ? task.effort_level * 5 : 10} pts
                        </p>
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-text-muted">
                      {selectedRoomsForTask.length === 0 ? (
                        <span className="text-state-warning">Nenhum novo ambiente selecionado</span>
                      ) : (
                        <span className="text-brand-primary">
                          {selectedRoomsForTask.length} {selectedRoomsForTask.length === 1 ? 'ambiente selecionado' : 'ambientes selecionados'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Section: Room Selection List for this task */}
                  <div>
                    <label className="block text-xs font-bold text-text-primary mb-1.5 flex items-center gap-1.5">
                      <Home className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Escolha os ambientes de destino para esta tarefa:</span>
                    </label>
                    <p className="text-[11px] text-text-secondary mb-3">
                      Marque um ou vários cômodos para criar rotinas independentes (ambientes já ativos são preservados):
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {activeRooms.map(room => {
                        const roomCfg = taskRoomConfigs[room.id] || {
                          selected: false,
                          frequency: 'DAILY',
                          preferredDays: [1],
                          dayOfMonth: 1,
                          preferredTime: '09:00',
                          executionTarget: 'HOUSEHOLD',
                          domesticSupportId: null,
                          status: 'NEW',
                          confirmedCompatibility: false
                        };
                        const isAlreadyActive = roomCfg.status === 'ALREADY_ACTIVE';
                        const isReactivate = roomCfg.status === 'REACTIVATE';
                        const isSelected = roomCfg.selected;
                        const compat = checkRoomTaskCompatibility(task, room);

                        return (
                          <div
                            key={room.id}
                            id={`task-${task.id}-${room.id}`}
                            className={`rounded-2xl border transition-all ${
                              isAlreadyActive
                                ? 'bg-surface-subtle/50 border-border-default/60 opacity-60'
                                : isSelected
                                ? 'border-brand-primary bg-brand-primary-soft/20 ring-1 ring-brand-primary shadow-2xs'
                                : 'border-border-default bg-surface-card hover:border-brand-primary/40'
                            }`}
                          >
                            {/* Room Header / Checkbox row */}
                            <div className="p-3 flex items-center justify-between gap-3">
                              <label
                                htmlFor={`check-task-${task.id}-${room.id}`}
                                className={`flex items-center gap-2.5 min-w-0 flex-1 ${
                                  isAlreadyActive ? 'cursor-not-allowed' : 'cursor-pointer'
                                }`}
                              >
                                <input
                                  id={`check-task-${task.id}-${room.id}`}
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isAlreadyActive || isSubmitting}
                                  onChange={() => handleToggleRoom(task.id, room.id)}
                                  className="w-4 h-4 rounded text-brand-primary focus:ring-brand-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label={`Selecionar ${room.name} para ${task.name}`}
                                  aria-disabled={isAlreadyActive}
                                />
                                <span className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                                  {room.name}
                                </span>
                              </label>

                              {/* Status Badge */}
                              <div className="shrink-0">
                                {isAlreadyActive ? (
                                  <span
                                    id={`room-status-already-${task.id}-${room.id}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-subtle text-text-muted border border-border-default"
                                  >
                                    <Check className="w-3 h-3 text-state-success" />
                                    <span>Já ativa</span>
                                  </span>
                                ) : isReactivate ? (
                                  <span
                                    id={`room-status-reactivate-${task.id}-${room.id}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-warning-soft text-state-warning border border-state-warning/30"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Reativar</span>
                                  </span>
                                ) : (
                                  <span
                                    id={`room-status-available-${task.id}-${room.id}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-success-soft text-state-success border border-state-success/30"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    <span>Disponível</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Compatibility warning if present */}
                            {compat.requiresConfirmation && (
                              <div
                                id={`compat-warning-${task.id}-${room.id}`}
                                className="mx-3 mb-2 p-2.5 bg-state-warning-soft/70 border border-state-warning/40 rounded-xl text-[11px] text-text-secondary space-y-1.5"
                              >
                                <div className="flex items-start gap-1.5 text-state-warning font-bold">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <span>{compat.warning}</span>
                                </div>
                                {isSelected && (
                                  <label
                                    id={`compat-confirm-label-${task.id}-${room.id}`}
                                    className="flex items-center gap-2 pt-1 font-semibold text-text-primary cursor-pointer"
                                  >
                                    <input
                                      id={`confirm-compat-${task.id}-${room.id}`}
                                      type="checkbox"
                                      checked={roomCfg.confirmedCompatibility || false}
                                      onChange={e =>
                                        handleUpdateRoomConfig(task.id, room.id, {
                                          confirmedCompatibility: e.target.checked
                                        })
                                      }
                                      className="w-3.5 h-3.5 rounded text-state-warning focus:ring-state-warning cursor-pointer"
                                    />
                                    <span>Confirmar que este ambiente possui equipamento compatível</span>
                                  </label>
                                )}
                              </div>
                            )}

                            {/* Independent Configuration panel for selected room */}
                            {isSelected && !isAlreadyActive && (
                              <div className="p-3 pt-2 border-t border-border-default/60 bg-surface-subtle/30 space-y-3 rounded-b-2xl animate-in fade-in-50 duration-150">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  {/* Frequency */}
                                  <div>
                                    <label
                                      htmlFor={`freq-${task.id}-${room.id}`}
                                      className="block text-[11px] font-medium text-text-secondary mb-1"
                                    >
                                      Frequência *
                                    </label>
                                    <select
                                      id={`freq-${task.id}-${room.id}`}
                                      value={roomCfg.frequency}
                                      onChange={e =>
                                        handleUpdateRoomConfig(task.id, room.id, { frequency: e.target.value })
                                      }
                                      className="w-full bg-surface-card border border-border-default rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                                      aria-label={`Frequência para ${task.name} em ${room.name}`}
                                    >
                                      <option value="DAILY">Diária</option>
                                      <option value="WEEKLY">Semanal</option>
                                      <option value="BIWEEKLY">Quinzenal</option>
                                      <option value="MONTHLY">Mensal</option>
                                      <option value="ONE_TIME">Pontual</option>
                                    </select>
                                  </div>

                                  {/* Time */}
                                  <div>
                                    <label
                                      htmlFor={`time-${task.id}-${room.id}`}
                                      className="block text-[11px] font-medium text-text-secondary mb-1 flex items-center gap-1"
                                    >
                                      <Clock className="w-3 h-3 text-text-muted" />
                                      <span>Horário *</span>
                                    </label>
                                    <input
                                      id={`time-${task.id}-${room.id}`}
                                      type="time"
                                      value={roomCfg.preferredTime}
                                      onChange={e =>
                                        handleUpdateRoomConfig(task.id, room.id, { preferredTime: e.target.value })
                                      }
                                      className="w-full bg-surface-card border border-border-default rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                                      aria-label={`Horário para ${task.name} em ${room.name}`}
                                    />
                                  </div>
                                </div>

                                {/* Weekly Days selector */}
                                {roomCfg.frequency === 'WEEKLY' && (
                                  <div>
                                    <span className="block text-[11px] font-medium text-text-secondary mb-1">
                                      Dias da semana *
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                      {DAY_LABELS.map(({ day, label }) => {
                                        const isDaySelected = roomCfg.preferredDays?.includes(day);
                                        return (
                                          <button
                                            key={day}
                                            id={`btn-day-${task.id}-${room.id}-${day}`}
                                            type="button"
                                            onClick={() => handleToggleDay(task.id, room.id, day)}
                                            className={`min-h-[32px] px-2.5 py-1 text-[11px] rounded-lg font-bold transition-all cursor-pointer ${
                                              isDaySelected
                                                ? 'bg-brand-primary text-text-on-primary shadow-2xs'
                                                : 'bg-surface-card text-text-secondary border border-border-default hover:bg-surface-subtle'
                                            }`}
                                            aria-label={`${label} para ${task.name} em ${room.name}`}
                                            aria-pressed={isDaySelected}
                                          >
                                            {label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                {/* Monthly day of month */}
                                {roomCfg.frequency === 'MONTHLY' && (
                                  <div className="flex items-center gap-2">
                                    <label
                                      htmlFor={`dom-${task.id}-${room.id}`}
                                      className="text-[11px] font-medium text-text-secondary"
                                    >
                                      Dia do mês (1 a 31):
                                    </label>
                                    <input
                                      id={`dom-${task.id}-${room.id}`}
                                      type="number"
                                      min={1}
                                      max={31}
                                      value={roomCfg.dayOfMonth || 1}
                                      onChange={e =>
                                        handleUpdateRoomConfig(task.id, room.id, {
                                          dayOfMonth: Math.max(1, Math.min(31, parseInt(e.target.value) || 1))
                                        })
                                      }
                                      className="w-20 bg-surface-card border border-border-default rounded-xl px-2.5 py-1 text-xs text-text-primary"
                                    />
                                  </div>
                                )}

                                {/* Execution Target Selector */}
                                <div className="pt-2 border-t border-border-default/60">
                                  <ExecutionTargetSelector
                                    executionTarget={roomCfg.executionTarget || 'HOUSEHOLD'}
                                    domesticSupportId={roomCfg.domesticSupportId}
                                    onChange={(target, supportId) => {
                                      handleUpdateRoomConfig(task.id, room.id, {
                                        executionTarget: target,
                                        domesticSupportId: target === 'HOUSEHOLD' ? null : supportId
                                      });
                                    }}
                                    activeSupports={activeSupports}
                                    onOpenDomesticSupport={handleOpenDomesticSupport}
                                    disabled={isSubmitting}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Section 5: Mandatory Prior Confirmation Summary (Requisito 5 da Fase B.5.3) */}
          <div
            id="batch-config-confirmation-summary"
            className="p-4 sm:p-5 rounded-2xl border border-border-default bg-surface-subtle/70 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-text-primary">
                <ShieldCheck className="w-4 h-4 text-brand-primary shrink-0" />
                <span>Resumo da Operação em Lote para Confirmação</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSummaryDetails(prev => !prev)}
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{showSummaryDetails ? 'Ocultar detalhes' : 'Exibir detalhes'}</span>
                {showSummaryDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Counters Bar (Requisito 5) */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span
                id="counter-new-routines"
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-xl bg-state-success-soft text-state-success border border-state-success/30 shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{newCount} {newCount === 1 ? 'nova rotina' : 'novas rotinas'}</span>
              </span>

              <span
                id="counter-reactivate-routines"
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-xl bg-state-warning-soft text-state-warning border border-state-warning/30 shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{reactivateCount} a reativar</span>
              </span>

              <span
                id="counter-preserved-routines"
                className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-xl bg-surface-card text-text-muted border border-border-default shadow-2xs"
              >
                <Check className="w-3.5 h-3.5 text-state-success" />
                <span>{preservedCount} existentes preservadas</span>
              </span>
            </div>

            {/* Detailed Table / Breakdown */}
            {showSummaryDetails && (
              <div className="pt-2 border-t border-border-default/60 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {plannedOperations.length === 0 ? (
                  <p className="text-xs text-text-muted italic py-1">
                    Nenhum ambiente selecionado para adicionar ou reativar.
                  </p>
                ) : (
                  plannedOperations.map((op, idx) => {
                    const { task, room, config, action } = op;
                    const supportName =
                      activeSupports.find(s => s.id === config.domesticSupportId)?.name || 'Apoio externo';
                    const targetText =
                      config.executionTarget === 'HOUSEHOLD'
                        ? 'Pessoas da casa'
                        : `Apoio (${supportName})`;

                    return (
                      <div
                        key={`${task.id}-${room.id}-${idx}`}
                        className={`p-2.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                          action === 'PRESERVED'
                            ? 'bg-surface-card/60 border-border-default/60 text-text-muted'
                            : action === 'REACTIVATE'
                            ? 'bg-state-warning-soft/40 border-state-warning/30 text-text-primary'
                            : 'bg-surface-card border-brand-primary/20 text-text-primary shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-text-primary truncate">
                            {task.name}
                          </span>
                          <span className="text-text-muted">•</span>
                          <span className="font-semibold text-brand-primary truncate">
                            {room.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {action !== 'PRESERVED' && (
                            <span className="text-[11px] text-text-secondary">
                              {formatFrequencyLabel(config.frequency, config.preferredDays, config.dayOfMonth)} às{' '}
                              {config.preferredTime} ({targetText})
                            </span>
                          )}

                          {action === 'PRESERVED' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-surface-subtle text-text-muted border border-border-default">
                              Preservada (já ativa)
                            </span>
                          ) : action === 'REACTIVATE' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-state-warning-soft text-state-warning border border-state-warning/40">
                              Reativar rotina
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-state-success-soft text-state-success border border-state-success/40">
                              Criar nova rotina
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Sticky Footer (HF1.2 & B.5.3) */}
        <div className="p-4 sm:px-6 sm:py-4 border-t border-border-default bg-surface-card/95 backdrop-blur-xs flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 shadow-xs">
          <div id="batch-config-summary" className="text-xs sm:text-sm text-text-secondary text-center sm:text-left">
            <span className="font-semibold text-text-primary">Total da operação: </span>
            <span className="text-state-success font-bold">{newCount} novas</span>
            {reactivateCount > 0 && <span className="text-state-warning font-bold">, {reactivateCount} a reativar</span>}
            {preservedCount > 0 && <span>, {preservedCount} já ativas</span>}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              id="btn-batch-cancel-config"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-subtle rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
            >
              Cancelar
            </button>

            <button
              id="btn-batch-confirm-add"
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting || totalToCommit === 0 || hasIncompleteExternal || hasUnconfirmedCompat}
              className="min-h-[44px] px-5 py-2 text-xs sm:text-sm font-bold bg-brand-primary text-text-on-primary hover:bg-brand-primary-hover rounded-xl shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Gravando...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {totalToCommit === 0
                      ? 'Nenhum ambiente selecionado'
                      : `Confirmar e Gravar (${totalToCommit})`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
