import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
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
  ChevronUp,
  Layers,
  Settings,
  ClipboardList
} from 'lucide-react';
import { TaskMaster, Room, FamilyTask, BatchAddRoutineInput, ExecutionTarget, DomesticSupport } from '../types';
import { taskCategoryLabels } from '../data/tasks';
import { ExecutionTargetSelector } from './DomesticSupport/ExecutionTargetSelector';
import { checkRoomTaskCompatibility, RoomTaskCompatibilityResult } from '../domain/routine/RoomTaskCompatibility';

export interface TaskMultiRoomSetupViewProps {
  tasks: TaskMaster[];
  rooms: Room[];
  familyTasks: FamilyTask[];
  domesticSupports?: DomesticSupport[];
  onBackToCatalog: () => void;
  onConfirm: (configs: BatchAddRoutineInput[]) => Promise<void>;
  isSubmitting?: boolean;
}

export interface RoomConfigItem {
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

export const TaskMultiRoomSetupView: React.FC<TaskMultiRoomSetupViewProps> = ({
  tasks,
  rooms,
  familyTasks,
  domesticSupports = [],
  onBackToCatalog,
  onConfirm,
  isSubmitting = false
}) => {
  // Stepper: 1: Selecionar ambientes, 2: Configurar rotinas, 3: Revisar e confirmar
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Filter active rooms only
  const activeRooms = useMemo(() => {
    return (rooms || []).filter(r => r && r.active !== false);
  }, [rooms]);

  const activeSupports = useMemo(() => {
    return (domesticSupports || []).filter(s => s && s.active !== false);
  }, [domesticSupports]);

  // Section toggle for "Outros ambientes" per task (starts collapsed/recolhido)
  const [expandedOtherRooms, setExpandedOtherRooms] = useState<Record<string, boolean>>({});

  const toggleOtherRooms = (taskId: string) => {
    setExpandedOtherRooms(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  // Build initial config state
  const initialConfigs = useMemo(() => {
    const configMap: Record<string, Record<string, RoomConfigItem>> = {};
    const defaultSupportId = activeSupports[0]?.id || null;

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

      configMap[task.id] = {};

      activeRooms.forEach(room => {
        const existing = (familyTasks || []).find(ft => {
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

        configMap[task.id][room.id] = {
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

    return configMap;
  }, [tasks, activeRooms, familyTasks, activeSupports]);

  const [configs, setConfigs] = useState<Record<string, Record<string, RoomConfigItem>>>(initialConfigs);

  // Common Configuration Toolbar State (Etapa 2)
  const [commonFreq, setCommonFreq] = useState<string>('DAILY');
  const [commonTime, setCommonTime] = useState<string>('09:00');
  const [commonTarget, setCommonTarget] = useState<ExecutionTarget>('HOUSEHOLD');
  const [commonSupportId, setCommonSupportId] = useState<string | null>(null);
  const [showCommonTargetDropdown, setShowCommonTargetDropdown] = useState<boolean>(false);

  // Validation & feedback state
  const [validationError, setValidationError] = useState<string | null>(null);

  // Toggle room selection in Step 1
  const handleToggleRoom = (taskId: string, roomId: string) => {
    setConfigs(prev => {
      const taskConfigs = prev[taskId];
      if (!taskConfigs || !taskConfigs[roomId]) return prev;
      const current = taskConfigs[roomId];
      if (current.status === 'ALREADY_ACTIVE') return prev;

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

  // Update room config in Step 2
  const handleUpdateRoomConfig = (
    taskId: string,
    roomId: string,
    partial: Partial<RoomConfigItem>
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

  // Toggle weekly day
  const handleToggleDay = (taskId: string, roomId: string, day: number) => {
    const current = configs[taskId]?.[roomId]?.preferredDays || [];
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort((a, b) => a - b);
    handleUpdateRoomConfig(taskId, roomId, { preferredDays: next });
  };

  // Apply common config to all selected combinations in Step 2
  const handleApplyCommonConfig = () => {
    setConfigs(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(taskId => {
        if (next[taskId]) {
          const roomsMap = { ...next[taskId] };
          Object.keys(roomsMap).forEach(roomId => {
            if (roomsMap[roomId].selected && roomsMap[roomId].status !== 'ALREADY_ACTIVE') {
              roomsMap[roomId] = {
                ...roomsMap[roomId],
                frequency: commonFreq,
                preferredTime: commonTime,
                executionTarget: commonTarget,
                domesticSupportId: commonTarget === 'HOUSEHOLD' ? null : commonSupportId
              };
            }
          });
          next[taskId] = roomsMap;
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
    config: RoomConfigItem;
    action: 'CREATE' | 'REACTIVATE' | 'PRESERVED';
    compat: RoomTaskCompatibilityResult;
  }> = [];

  tasks.forEach(task => {
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

  const totalSelectedToCommit = newCount + reactivateCount;

  // Selected combinations for Step 2
  const selectedCombinations = plannedOperations.filter(op => op.action !== 'PRESERVED');

  // Step 1 -> Step 2 validation
  const handleProceedToStep2 = () => {
    if (totalSelectedToCommit === 0) {
      setValidationError('Selecione pelo menos um ambiente disponível ou para reativar antes de avançar.');
      return;
    }
    setValidationError(null);
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 2 -> Step 3 validation
  const handleProceedToStep3 = () => {
    for (const op of selectedCombinations) {
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
          setValidationError(`A tarefa "${task.name}" em "${room.name}" está definida como "Ajuda externa", mas nenhuma pessoa de apoio foi selecionada.`);
          return;
        }
      }
    }
    setValidationError(null);
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Final confirmation execution
  const handleFinalConfirm = async () => {
    // Check if any selected item with incompatibility warning lacks explicit confirmation
    for (const op of selectedCombinations) {
      if (op.compat.requiresConfirmation && !op.config.confirmedCompatibility) {
        setValidationError(
          `A tarefa "${op.task.name}" possui um aviso de compatibilidade com "${op.room.name}". Confirme explicitamente para autorizar a gravação.`
        );
        return;
      }
    }

    const payload: BatchAddRoutineInput[] = selectedCombinations.map(op => {
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
    <div id="task-multi-room-setup-view" className="w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6 pb-28 animate-in fade-in duration-200">
      {/* Top Bar: Action to return to catalog + View Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-default pb-5">
        <div>
          <button
            id="btn-back-to-catalog"
            type="button"
            onClick={onBackToCatalog}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-text-muted hover:text-brand-primary transition-colors cursor-pointer mb-2 disabled:opacity-40"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao catálogo</span>
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 id="batch-config-title" className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
              Adicionar tarefas a ambientes
              <span className="sr-only"> (Adicionar tarefas a vários ambientes)</span>
            </h1>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary">
              Fase B.5.4 • Tela Dedicada
            </span>
          </div>
          <p className="text-xs sm:text-sm text-text-secondary mt-1">
            Selecione os cômodos de destino, personalize frequências e horários independentes e confirme a criação das novas rotinas.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-text-muted">
            {tasks.length} {tasks.length === 1 ? 'tarefa' : 'tarefas'} selecionadas
          </span>
        </div>
      </div>

      {/* Stepper Progress Bar (Etapas Visíveis) */}
      <div id="multi-room-stepper" className="w-full bg-surface-card border border-border-default rounded-2xl p-3 sm:p-4 shadow-2xs">
        <div className="grid grid-cols-3 gap-2 text-center text-xs sm:text-sm font-semibold">
          {/* Step 1 */}
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            disabled={isSubmitting}
            className={`p-2.5 sm:p-3 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer ${
              currentStep === 1
                ? 'bg-brand-primary text-text-on-primary shadow-xs'
                : 'bg-surface-subtle text-text-secondary hover:text-text-primary'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span className="truncate">1. Selecionar ambientes</span>
          </button>

          {/* Step 2 */}
          <button
            type="button"
            onClick={() => {
              if (totalSelectedToCommit > 0) setCurrentStep(2);
            }}
            disabled={isSubmitting || totalSelectedToCommit === 0}
            className={`p-2.5 sm:p-3 rounded-xl flex items-center justify-center gap-2 transition ${
              totalSelectedToCommit === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            } ${
              currentStep === 2
                ? 'bg-brand-primary text-text-on-primary shadow-xs'
                : 'bg-surface-subtle text-text-secondary hover:text-text-primary'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="truncate">2. Configurar rotinas</span>
          </button>

          {/* Step 3 */}
          <button
            type="button"
            onClick={() => {
              if (totalSelectedToCommit > 0) handleProceedToStep3();
            }}
            disabled={isSubmitting || totalSelectedToCommit === 0}
            className={`p-2.5 sm:p-3 rounded-xl flex items-center justify-center gap-2 transition ${
              totalSelectedToCommit === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            } ${
              currentStep === 3
                ? 'bg-brand-primary text-text-on-primary shadow-xs'
                : 'bg-surface-subtle text-text-secondary hover:text-text-primary'
            }`}
          >
            <ClipboardList className="w-4 h-4 shrink-0" />
            <span className="truncate">3. Revisar e confirmar</span>
          </button>
        </div>
      </div>

      {/* Validation Error Alert */}
      {validationError && (
        <div
          id="multi-room-error"
          className="p-3.5 bg-state-error-soft border border-state-error/30 rounded-2xl flex items-center gap-2.5 text-xs sm:text-sm text-state-error font-medium animate-in fade-in duration-150"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 1: SELECIONAR AMBIENTES */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div id="step-1-select-rooms" className="space-y-6">
          <div className="space-y-4">
            {tasks.map((task, taskIdx) => {
              const catInfo = taskCategoryLabels[task.category] || { label: task.category, icon: '📋' };
              const taskConfigs = configs[task.id] || {};

              // Separate rooms into Compatible and Other categories
              const compatibleRooms: Room[] = [];
              const otherRooms: Room[] = [];

              activeRooms.forEach(r => {
                const compat = checkRoomTaskCompatibility(task, r);
                if (compat.isCompatible) {
                  compatibleRooms.push(r);
                } else {
                  otherRooms.push(r);
                }
              });

              const isOtherExpanded = Boolean(expandedOtherRooms[task.id]);
              const selectedCountForTask = activeRooms.filter(r => taskConfigs[r.id]?.selected).length;

              return (
                <div
                  key={task.id}
                  id={`batch-task-card-${task.id}`}
                  className="bg-surface-card border border-border-default rounded-3xl p-4 sm:p-6 shadow-xs space-y-5"
                >
                  {/* Task Header */}
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-default/60 pb-4">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl shrink-0" role="img" aria-label={catInfo.label}>
                        {catInfo.icon}
                      </span>
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-text-primary">
                          {taskIdx + 1}. {task.name}
                        </h2>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {catInfo.label} • ~{task.duration_minutes || 20} min • {task.effort_level ? task.effort_level * 5 : 10} pts
                        </p>
                      </div>
                    </div>

                    <div className="text-xs font-semibold">
                      {selectedCountForTask === 0 ? (
                        <span className="text-text-muted">Nenhum cômodo marcado</span>
                      ) : (
                        <span className="text-brand-primary">
                          {selectedCountForTask} {selectedCountForTask === 1 ? 'ambiente marcado' : 'ambientes marcados'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Section: Compatible Rooms (Exibidos Primeiro) */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                      <Home className="w-3.5 h-3.5 text-brand-primary" />
                      <span>Ambientes compatíveis com a tarefa:</span>
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                      {compatibleRooms.map(room => {
                        const roomCfg = taskConfigs[room.id] || {
                          selected: false,
                          status: 'NEW',
                          confirmedCompatibility: false
                        };
                        const isAlreadyActive = roomCfg.status === 'ALREADY_ACTIVE';
                        const isReactivate = roomCfg.status === 'REACTIVATE';
                        const isSelected = roomCfg.selected;

                        return (
                          <div
                            key={room.id}
                            id={`task-${task.id}-${room.id}`}
                            className={`w-full rounded-2xl border transition-all ${
                              isAlreadyActive
                                ? 'bg-surface-subtle/50 border-border-default/60 opacity-60'
                                : isSelected
                                ? 'border-brand-primary bg-brand-primary-soft/20 ring-1 ring-brand-primary shadow-2xs'
                                : 'border-border-default bg-surface-card hover:border-brand-primary/40'
                            }`}
                          >
                            <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                              <label
                                htmlFor={`check-task-${task.id}-${room.id}`}
                                className={`flex items-center gap-3 min-w-0 flex-1 ${
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
                                <span className="text-sm sm:text-base font-semibold text-text-primary truncate">
                                  {room.name}
                                </span>
                              </label>

                              {/* Status Badge */}
                              <div className="shrink-0">
                                {isAlreadyActive ? (
                                  <span
                                    id={`room-status-already-${task.id}-${room.id}`}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-subtle text-text-muted border border-border-default"
                                  >
                                    <Check className="w-3.5 h-3.5 text-state-success" />
                                    <span>Já ativa</span>
                                  </span>
                                ) : isReactivate ? (
                                  <span
                                    id={`room-status-reactivate-${task.id}-${room.id}`}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-state-warning-soft text-state-warning border border-state-warning/30"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>Reativar</span>
                                  </span>
                                ) : (
                                  <span
                                    id={`room-status-available-${task.id}-${room.id}`}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-state-success-soft text-state-success border border-state-success/30"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>Disponível</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section: Outros Ambientes (Seção secundária recolhida) */}
                  {otherRooms.length > 0 && (
                    <div className="pt-2 border-t border-border-default/60">
                      <button
                        type="button"
                        id={`btn-toggle-other-rooms-${task.id}`}
                        onClick={() => toggleOtherRooms(task.id)}
                        className="w-full p-2.5 rounded-xl bg-surface-subtle hover:bg-surface-subtle/80 text-text-secondary text-xs font-semibold flex items-center justify-between transition cursor-pointer"
                        aria-expanded={isOtherExpanded}
                      >
                        <div className="flex items-center gap-2">
                          <Home className="w-3.5 h-3.5 text-text-muted" />
                          <span>Outros ambientes da casa ({otherRooms.length})</span>
                          <span className="text-[11px] text-text-muted font-normal hidden sm:inline">
                            — categorias secundárias ou específicas
                          </span>
                        </div>
                        {isOtherExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                      {isOtherExpanded && (
                        <div className="mt-3 flex flex-col gap-3 w-full animate-in fade-in duration-150">
                          {otherRooms.map(room => {
                            const roomCfg = taskConfigs[room.id] || {
                              selected: false,
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
                                className={`w-full rounded-2xl border transition-all ${
                                  isAlreadyActive
                                    ? 'bg-surface-subtle/50 border-border-default/60 opacity-60'
                                    : isSelected
                                    ? 'border-brand-primary bg-brand-primary-soft/20 ring-1 ring-brand-primary shadow-2xs'
                                    : 'border-border-default bg-surface-card hover:border-brand-primary/40'
                                }`}
                              >
                                <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
                                  <label
                                    htmlFor={`check-task-${task.id}-${room.id}`}
                                    className={`flex items-center gap-3 min-w-0 flex-1 ${
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
                                    <span className="text-sm sm:text-base font-semibold text-text-primary truncate">
                                      {room.name}
                                    </span>
                                  </label>

                                  <div className="shrink-0">
                                    {isAlreadyActive ? (
                                      <span
                                        id={`room-status-already-${task.id}-${room.id}`}
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-subtle text-text-muted border border-border-default"
                                      >
                                        <Check className="w-3.5 h-3.5 text-state-success" />
                                        <span>Já ativa</span>
                                      </span>
                                    ) : isReactivate ? (
                                      <span
                                        id={`room-status-reactivate-${task.id}-${room.id}`}
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-state-warning-soft text-state-warning border border-state-warning/30"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>Reativar</span>
                                      </span>
                                    ) : (
                                      <span
                                        id={`room-status-available-${task.id}-${room.id}`}
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-state-success-soft text-state-success border border-state-success/30"
                                      >
                                        <Sparkles className="w-3.5 h-3.5" />
                                        <span>Disponível</span>
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* AVISO CONDICIONAL: Apenas visível SE o ambiente estiver selecionado! (Requisito 2 da B.5.4) */}
                                {isSelected && compat.requiresConfirmation && (
                                  <div
                                    id={`compat-warning-${task.id}-${room.id}`}
                                    className="mx-3.5 sm:mx-4 mb-3 p-3 bg-state-warning-soft/70 border border-state-warning/40 rounded-xl text-xs text-text-secondary space-y-2 animate-in fade-in duration-150"
                                  >
                                    <div className="flex items-start gap-2 text-state-warning font-semibold">
                                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                      <span>{compat.warning}</span>
                                    </div>
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
                                        className="w-4 h-4 rounded text-state-warning focus:ring-state-warning cursor-pointer"
                                      />
                                      <span>Confirmar que este ambiente possui equipamento compatível</span>
                                    </label>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Step 1 Actions Bar */}
          <div className="bg-surface-card border border-border-default rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="text-xs sm:text-sm text-text-secondary">
              <span className="font-semibold text-text-primary">{totalSelectedToCommit} ambientes selecionados </span>
              {totalSelectedToCommit === 0 ? '(escolha ao menos um para prosseguir)' : 'prontos para configuração'}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <button
                id="btn-multi-room-cancel"
                type="button"
                onClick={onBackToCatalog}
                disabled={isSubmitting}
                className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-subtle rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>

              <button
                id="btn-next-step-1"
                type="button"
                onClick={handleProceedToStep2}
                disabled={totalSelectedToCommit === 0 || isSubmitting}
                className="min-h-[44px] px-5 py-2 text-xs sm:text-sm font-bold bg-brand-primary text-text-on-primary hover:bg-brand-primary-hover rounded-xl shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                <span>Avançar para configurações</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 2: CONFIGURAR ROTINAS (Apenas combinações escolhidas) */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div id="step-2-configure-routines" className="space-y-6">
          {/* Toolbar de Configuração Comum */}
          <div
            id="multi-room-common-toolbar"
            className="bg-surface-card border border-border-default rounded-2xl p-4 sm:p-5 shadow-xs space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-text-primary">
                <Sparkles className="w-4 h-4 text-brand-primary" />
                <span>Aplicar configuração comum aos ambientes selecionados:</span>
              </div>
              <span className="text-[11px] text-text-muted">
                Ajustes individuais continuam permitidos abaixo
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <select
                id="select-common-freq"
                value={commonFreq}
                onChange={e => setCommonFreq(e.target.value)}
                className="bg-surface-subtle border border-border-default rounded-xl px-3 py-2 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                aria-label="Frequência comum"
              >
                <option value="DAILY">Diária</option>
                <option value="WEEKLY">Semanal</option>
                <option value="BIWEEKLY">Quinzenal</option>
                <option value="MONTHLY">Mensal</option>
                <option value="ONE_TIME">Pontual</option>
              </select>

              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-text-muted" />
                <input
                  id="input-common-time"
                  type="time"
                  value={commonTime}
                  onChange={e => setCommonTime(e.target.value)}
                  className="bg-surface-subtle border border-border-default rounded-xl px-3 py-2 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                  aria-label="Horário comum"
                />
              </div>

              <button
                id="btn-apply-common-config"
                type="button"
                onClick={handleApplyCommonConfig}
                className="min-h-[38px] px-4 py-2 bg-brand-primary-soft text-brand-primary hover:bg-brand-primary hover:text-text-on-primary rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              >
                Aplicar aos selecionados
              </button>
            </div>

            {/* Responsible / Support toggle in common bar */}
            <div className="pt-2 border-t border-border-default/40">
              <button
                type="button"
                onClick={() => setShowCommonTargetDropdown(prev => !prev)}
                className="text-xs font-semibold text-brand-primary flex items-center gap-1.5 hover:underline cursor-pointer"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Definir público de execução comum</span>
                {showCommonTargetDropdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showCommonTargetDropdown && (
                <div className="mt-3 pt-2 border-t border-border-default/40">
                  <ExecutionTargetSelector
                    executionTarget={commonTarget}
                    domesticSupportId={commonSupportId}
                    onChange={(target, supportId) => {
                      setCommonTarget(target);
                      setCommonSupportId(target === 'HOUSEHOLD' ? null : supportId);
                    }}
                    activeSupports={activeSupports}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Cards: Only Selected Combinations (Requisito 3 da B.5.4) */}
          <div id="multi-room-selected-list" className="space-y-4">
            {selectedCombinations.map((op, idx) => {
              const { task, room, config } = op;
              const catInfo = taskCategoryLabels[task.category] || { label: task.category, icon: '📋' };

              return (
                <div
                  key={`${task.id}-${room.id}-${idx}`}
                  id={`config-card-${task.id}-${room.id}`}
                  className="bg-surface-card border border-border-default rounded-3xl p-4 sm:p-6 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-default/60 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl" role="img" aria-label={catInfo.label}>
                        {catInfo.icon}
                      </span>
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-text-primary">
                          {task.name}
                        </h3>
                        <p className="text-xs text-text-muted">
                          Ambiente: <strong className="text-brand-primary">{room.name}</strong> • {catInfo.label}
                        </p>
                      </div>
                    </div>

                    <div>
                      {op.action === 'REACTIVATE' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-state-warning-soft text-state-warning border border-state-warning/30">
                          <RotateCcw className="w-3 h-3" />
                          <span>Reativar rotina arquivada</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-state-success-soft text-state-success border border-state-success/30">
                          <Sparkles className="w-3 h-3" />
                          <span>Nova rotina</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Independent Configuration Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    {/* Frequency */}
                    <div>
                      <label
                        htmlFor={`freq-${task.id}-${room.id}`}
                        className="block text-xs font-semibold text-text-secondary mb-1"
                      >
                        Frequência *
                      </label>
                      <select
                        id={`freq-${task.id}-${room.id}`}
                        value={config.frequency}
                        onChange={e =>
                          handleUpdateRoomConfig(task.id, room.id, { frequency: e.target.value })
                        }
                        className="w-full bg-surface-subtle border border-border-default rounded-xl px-3 py-2 text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
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
                        className="block text-xs font-semibold text-text-secondary mb-1 flex items-center gap-1.5"
                      >
                        <Clock className="w-3.5 h-3.5 text-text-muted" />
                        <span>Horário *</span>
                      </label>
                      <input
                        id={`time-${task.id}-${room.id}`}
                        type="time"
                        value={config.preferredTime}
                        onChange={e =>
                          handleUpdateRoomConfig(task.id, room.id, { preferredTime: e.target.value })
                        }
                        className="w-full bg-surface-subtle border border-border-default rounded-xl px-3 py-2 text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                        aria-label={`Horário para ${task.name} em ${room.name}`}
                      />
                    </div>
                  </div>

                  {/* Weekly Days selector */}
                  {config.frequency === 'WEEKLY' && (
                    <div>
                      <span className="block text-xs font-semibold text-text-secondary mb-1.5">
                        Dias da semana *
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {DAY_LABELS.map(({ day, label }) => {
                          const isDaySelected = config.preferredDays?.includes(day);
                          return (
                            <button
                              key={day}
                              id={`btn-day-${task.id}-${room.id}-${day}`}
                              type="button"
                              onClick={() => handleToggleDay(task.id, room.id, day)}
                              className={`min-h-[38px] min-w-[44px] px-3 py-1.5 text-xs rounded-xl font-bold transition-all cursor-pointer ${
                                isDaySelected
                                  ? 'bg-brand-primary text-text-on-primary shadow-2xs'
                                  : 'bg-surface-subtle text-text-secondary border border-border-default hover:bg-surface-card'
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
                  {config.frequency === 'MONTHLY' && (
                    <div className="flex items-center gap-2">
                      <label
                        htmlFor={`dom-${task.id}-${room.id}`}
                        className="text-xs font-medium text-text-secondary"
                      >
                        Dia do mês (1 a 31):
                      </label>
                      <input
                        id={`dom-${task.id}-${room.id}`}
                        type="number"
                        min={1}
                        max={31}
                        value={config.dayOfMonth || 1}
                        onChange={e =>
                          handleUpdateRoomConfig(task.id, room.id, {
                            dayOfMonth: Math.max(1, Math.min(31, parseInt(e.target.value) || 1))
                          })
                        }
                        className="w-24 bg-surface-subtle border border-border-default rounded-xl px-3 py-1.5 text-xs text-text-primary"
                      />
                    </div>
                  )}

                  {/* Execution Target Selector */}
                  <div className="pt-2 border-t border-border-default/60">
                    <ExecutionTargetSelector
                      executionTarget={config.executionTarget || 'HOUSEHOLD'}
                      domesticSupportId={config.domesticSupportId}
                      onChange={(target, supportId) => {
                        handleUpdateRoomConfig(task.id, room.id, {
                          executionTarget: target,
                          domesticSupportId: target === 'HOUSEHOLD' ? null : supportId
                        });
                      }}
                      activeSupports={activeSupports}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Step 2 Actions Bar */}
          <div className="bg-surface-card border border-border-default rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <button
              id="btn-prev-step-2"
              type="button"
              onClick={() => setCurrentStep(1)}
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-subtle rounded-xl transition cursor-pointer"
            >
              ← Voltar para seleção de ambientes
            </button>

            <button
              id="btn-next-step-2"
              type="button"
              onClick={handleProceedToStep3}
              disabled={isSubmitting}
              className="min-h-[44px] px-5 py-2 text-xs sm:text-sm font-bold bg-brand-primary text-text-on-primary hover:bg-brand-primary-hover rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
            >
              <span>Avançar para revisão</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ETAPA 3: REVISAR E CONFIRMAR */}
      {/* ========================================================================= */}
      {currentStep === 3 && (
        <div id="step-3-review-confirm" className="space-y-6">
          <div className="bg-surface-card border border-border-default rounded-3xl p-4 sm:p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between gap-3 border-b border-border-default/60 pb-3">
              <div className="flex items-center gap-2 font-bold text-base sm:text-lg text-text-primary">
                <ShieldCheck className="w-5 h-5 text-brand-primary shrink-0" />
                <span>Revisão Final da Operação Multiambiente</span>
              </div>
            </div>

            {/* Metrics Counters Bar */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                id="counter-new-routines"
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-state-success-soft text-state-success border border-state-success/30"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{newCount} {newCount === 1 ? 'nova rotina' : 'novas rotinas'}</span>
              </span>

              <span
                id="counter-reactivate-routines"
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-state-warning-soft text-state-warning border border-state-warning/30"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{reactivateCount} a reativar</span>
              </span>

              <span
                id="counter-preserved-routines"
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-surface-subtle text-text-muted border border-border-default"
              >
                <Check className="w-3.5 h-3.5 text-state-success" />
                <span>{preservedCount} existentes preservadas</span>
              </span>
            </div>

            {/* Operations Breakdown Table */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                Rotinas que serão criadas ou reativadas:
              </h4>

              <div className="space-y-2">
                {selectedCombinations.map((op, idx) => {
                  const { task, room, config, action, compat } = op;
                  const supportName =
                    activeSupports.find(s => s.id === config.domesticSupportId)?.name || 'Apoio externo';
                  const targetText =
                    config.executionTarget === 'HOUSEHOLD'
                      ? 'Pessoas da casa'
                      : `Apoio (${supportName})`;

                  return (
                    <div
                      key={`review-${task.id}-${room.id}-${idx}`}
                      className="p-3.5 rounded-2xl border border-border-default bg-surface-subtle/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-text-primary text-sm">{task.name}</span>
                          <span className="text-text-muted">•</span>
                          <span className="font-semibold text-brand-primary">{room.name}</span>
                        </div>
                        <div className="text-text-secondary">
                          {formatFrequencyLabel(config.frequency, config.preferredDays, config.dayOfMonth)} às {config.preferredTime} • {targetText}
                        </div>

                        {/* Unconfirmed compatibility warning in review */}
                        {compat.requiresConfirmation && !config.confirmedCompatibility && (
                          <div className="text-state-warning font-semibold flex items-center gap-1 pt-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>Compatibilidade pendente de confirmação</span>
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {action === 'REACTIVATE' ? (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-state-warning-soft text-state-warning border border-state-warning/30">
                            Reativar
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-state-success-soft text-state-success border border-state-success/30">
                            Criar nova rotina
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preserved Routines Section */}
            {preservedCount > 0 && (
              <div className="pt-3 border-t border-border-default/60 text-xs text-text-muted">
                <strong>Rotinas preservadas intactas: </strong>
                {plannedOperations
                  .filter(op => op.action === 'PRESERVED')
                  .map(op => `${op.task.name} (${op.room.name})`)
                  .join(', ')}
              </div>
            )}
          </div>

          {/* Step 3 Actions Bar */}
          <div className="bg-surface-card border border-border-default rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <button
              id="btn-prev-step-3"
              type="button"
              onClick={() => setCurrentStep(2)}
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-subtle rounded-xl transition cursor-pointer"
            >
              ← Voltar para configurações
            </button>

            <button
              id="btn-multi-room-confirm"
              type="button"
              onClick={handleFinalConfirm}
              disabled={isSubmitting || totalSelectedToCommit === 0}
              className="min-h-[44px] px-6 py-2.5 text-xs sm:text-sm font-bold bg-brand-primary text-text-on-primary hover:bg-brand-primary-hover rounded-xl shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Gravando rotinas...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirmar e Criar Rotinas ({totalSelectedToCommit})</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
