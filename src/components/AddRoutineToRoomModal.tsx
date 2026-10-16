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
  Users,
  ShieldCheck,
  ChevronRight,
  Info
} from 'lucide-react';
import { TaskMaster, FamilyTask, Room, DomesticSupport, ExecutionTarget, BatchAddRoutineInput } from '../types';
import { taskCategoryLabels } from '../data/tasks';

interface AddRoutineToRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: TaskMaster | null;
  rooms: Room[];
  familyTasks: FamilyTask[];
  domesticSupports: DomesticSupport[];
  onConfirm: (config: BatchAddRoutineInput) => Promise<void>;
  isSubmitting?: boolean;
  initialRoomId?: string;
}

const WEEKDAYS = [
  { value: 0, label: 'Dom', full: 'Domingo' },
  { value: 1, label: 'Seg', full: 'Segunda-feira' },
  { value: 2, label: 'Ter', full: 'Terça-feira' },
  { value: 3, label: 'Qua', full: 'Quarta-feira' },
  { value: 4, label: 'Qui', full: 'Quinta-feira' },
  { value: 5, label: 'Sex', full: 'Sexta-feira' },
  { value: 6, label: 'Sáb', full: 'Sábado' }
];

export const AddRoutineToRoomModal: React.FC<AddRoutineToRoomModalProps> = ({
  isOpen,
  onClose,
  task,
  rooms,
  familyTasks,
  domesticSupports,
  onConfirm,
  isSubmitting = false,
  initialRoomId
}) => {
  const [selectedRoomId, setSelectedRoomId] = useState<string>(initialRoomId || '');
  const [frequency, setFrequency] = useState<string>('DAILY');
  const [preferredDays, setPreferredDays] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [preferredTime, setPreferredTime] = useState<string>('09:00');
  const [executionTarget, setExecutionTarget] = useState<ExecutionTarget>('HOUSEHOLD');
  const [domesticSupportId, setDomesticSupportId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const activeRooms = useMemo(() => {
    return (rooms || []).filter(r => r && r.active !== false);
  }, [rooms]);

  const activeSupports = useMemo(() => {
    return (domesticSupports || []).filter(s => s && s.active);
  }, [domesticSupports]);

  // Compute status of the task for each room
  const roomStatusList = useMemo(() => {
    if (!task) return [];
    return activeRooms.map(r => {
      const activeRoutine = (familyTasks || []).find(ft =>
        ft &&
        ft.active !== false &&
        (ft.task_master_id === task.id || ft.taskMasterId === task.id || ft.task_id === task.id || ft.taskId === task.id || ft.id === task.id) &&
        (ft.room_id === r.id || ft.roomId === r.id)
      );
      const inactiveRoutine = !activeRoutine ? (familyTasks || []).find(ft =>
        ft &&
        ft.active === false &&
        (ft.task_master_id === task.id || ft.taskMasterId === task.id || ft.task_id === task.id || ft.taskId === task.id || ft.id === task.id) &&
        (ft.room_id === r.id || ft.roomId === r.id)
      ) : undefined;

      let status: 'ALREADY_ACTIVE' | 'REACTIVATE' | 'AVAILABLE' = 'AVAILABLE';
      let routine: FamilyTask | undefined = undefined;

      if (activeRoutine) {
        status = 'ALREADY_ACTIVE';
        routine = activeRoutine;
      } else if (inactiveRoutine) {
        status = 'REACTIVATE';
        routine = inactiveRoutine;
      }

      return {
        room: r,
        status,
        routine
      };
    });
  }, [task, activeRooms, familyTasks]);

  // Reset form when modal opens or task changes
  useEffect(() => {
    if (!isOpen || !task) return;
    setValidationError(null);

    // Initial frequency derived from task definition
    let initialFreq = 'DAILY';
    let initialDays = [1];
    if (task.frequency_type) {
      switch (task.frequency_type) {
        case 'daily':
          initialFreq = 'DAILY';
          break;
        case 'several_times_week':
          initialFreq = 'WEEKLY';
          initialDays = [1, 3, 5];
          break;
        case 'weekly':
          initialFreq = 'WEEKLY';
          initialDays = [3];
          break;
        case 'biweekly':
          initialFreq = 'BIWEEKLY';
          break;
        case 'monthly':
          initialFreq = 'MONTHLY';
          break;
        case 'as_needed':
          initialFreq = 'ONE_TIME';
          break;
        default:
          initialFreq = 'DAILY';
      }
    }
    setFrequency(initialFreq);
    setPreferredDays(initialDays);
    setDayOfMonth(1);
    setPreferredTime('09:00');
    setExecutionTarget('HOUSEHOLD');
    setDomesticSupportId(activeSupports[0]?.id || null);

    // HOTFIX B.5.2-HF1: Sem seleção automática por posição, alfabética ou fallback.
    // O modal deve sempre abrir com estado neutro inicial (nenhum cômodo selecionado).
    // Apenas seleciona se initialRoomId tiver sido explicitamente fornecido e for válido.
    if (initialRoomId) {
      const initialMatch = roomStatusList.find(rs => rs.room.id === initialRoomId);
      if (initialMatch && initialMatch.status !== 'ALREADY_ACTIVE') {
        setSelectedRoomId(initialRoomId);
        if (initialMatch.status === 'REACTIVATE' && initialMatch.routine) {
          const r = initialMatch.routine;
          if (r.frequency) setFrequency(r.frequency.toUpperCase());
          if (r.preferred_days || r.preferredDays) setPreferredDays(r.preferred_days || r.preferredDays || [1]);
          if (r.preferred_time || r.preferredTime) setPreferredTime(r.preferred_time || r.preferredTime || '09:00');
          if (r.executionTarget) setExecutionTarget(r.executionTarget);
          if (r.domesticSupportId) setDomesticSupportId(r.domesticSupportId);
        }
        return;
      }
    }
    // Estado neutro inicial obrigatório
    setSelectedRoomId('');
  }, [isOpen, task, initialRoomId]);

  // Handle selecting a room
  const handleSelectRoom = (rId: string) => {
    const rs = roomStatusList.find(item => item.room.id === rId);
    if (!rs || rs.status === 'ALREADY_ACTIVE') return;

    setSelectedRoomId(rId);
    setValidationError(null);

    // If room has an archived routine, load its defaults
    if (rs.status === 'REACTIVATE' && rs.routine) {
      const r = rs.routine;
      if (r.frequency) setFrequency(r.frequency.toUpperCase());
      if (r.preferred_days || r.preferredDays) setPreferredDays(r.preferred_days || r.preferredDays || [1]);
      if (r.preferred_time || r.preferredTime) setPreferredTime(r.preferred_time || r.preferredTime || '09:00');
      if (r.executionTarget) setExecutionTarget(r.executionTarget);
      if (r.domesticSupportId) setDomesticSupportId(r.domesticSupportId);
    }
  };

  const handleToggleDay = (day: number) => {
    setPreferredDays(prev => {
      const next = prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort((a, b) => a - b);
      return next;
    });
  };

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !task) return null;

  const selectedRoomInfo = roomStatusList.find(rs => rs.room.id === selectedRoomId);
  const isReactivation = selectedRoomInfo?.status === 'REACTIVATE';
  const catInfo = taskCategoryLabels[task.category] || { label: task.category, icon: '📋' };

  // Submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId) {
      setValidationError('Por favor, selecione um ambiente de destino.');
      return;
    }
    if (selectedRoomInfo?.status === 'ALREADY_ACTIVE') {
      setValidationError('Esta tarefa já está ativa no ambiente selecionado. Escolha outro cômodo.');
      return;
    }
    if (frequency === 'WEEKLY' && preferredDays.length === 0) {
      setValidationError('Para frequência semanal, selecione ao menos um dia da semana.');
      return;
    }
    if (frequency === 'MONTHLY' && (dayOfMonth < 1 || dayOfMonth > 31)) {
      setValidationError('Para frequência mensal, informe um dia válido (1 a 31).');
      return;
    }
    if (executionTarget === 'EXTERNAL_SUPPORT') {
      if (!domesticSupportId) {
        setValidationError('Selecione uma pessoa de apoio externo responsável por esta tarefa.');
        return;
      }
      const supportExists = activeSupports.some(s => s.id === domesticSupportId);
      if (!supportExists) {
        setValidationError('O apoio externo selecionado não está ativo na família.');
        return;
      }
    }

    try {
      await onConfirm({
        taskMasterId: task.id,
        name: task.name,
        roomId: selectedRoomId,
        frequency,
        preferredDays,
        dayOfMonth,
        preferredTime,
        executionTarget,
        domesticSupportId: executionTarget === 'HOUSEHOLD' ? null : domesticSupportId
      });
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Erro ao adicionar a rotina ao ambiente.');
    }
  };

  // Human-readable frequency summary
  const getFrequencyLabel = () => {
    switch (frequency) {
      case 'DAILY':
        return 'Diária';
      case 'WEEKLY':
        if (preferredDays.length === 0) return 'Semanal';
        const dayNames = preferredDays.map(d => WEEKDAYS.find(w => w.value === d)?.label).filter(Boolean);
        return `Semanal — ${dayNames.join(', ')}`;
      case 'BIWEEKLY':
        return 'Quinzenal';
      case 'MONTHLY':
        return `Mensal — dia ${dayOfMonth}`;
      case 'ONE_TIME':
        return 'Pontual';
      default:
        return frequency;
    }
  };

  const selectedSupportName = activeSupports.find(s => s.id === domesticSupportId)?.name || 'Apoio externo';

  return (
    <div
      id="add-routine-to-room-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-room-modal-title"
    >
      <div 
        id="add-routine-to-room-modal-container"
        className="w-full max-w-lg bg-surface-card border border-border-default rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header - Fixed top bar */}
        <div className="p-4 sm:p-6 border-b border-border-default flex items-start justify-between gap-4 bg-surface-subtle/40 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-brand-primary-soft text-brand-primary">
                Multiambiente
              </span>
              <span className="text-[11px] text-text-muted font-medium">
                {catInfo.label} • ~{task.duration_minutes || 20} min
              </span>
            </div>
            <h2 id="add-room-modal-title" className="text-lg sm:text-xl font-bold text-text-primary leading-snug">
              + Adicionar a outro ambiente
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary mt-0.5 truncate">
              {task.name}
            </p>
          </div>

          <button
            id="btn-close-add-room-modal"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 p-2.5 rounded-2xl text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors flex items-center justify-center cursor-pointer disabled:opacity-40"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form wrapping scrollable content and sticky footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Content Body with smooth scrolling and bottom padding */}
          <div className="overflow-y-auto overscroll-contain flex-1 p-4 sm:p-6 space-y-5 pb-6">
            {/* Validation Error Banner */}
            {validationError && (
              <div 
                id="add-room-validation-error" 
                role="alert"
                className="p-3.5 bg-state-error-soft border border-state-error/30 rounded-2xl flex items-center gap-2.5 text-xs sm:text-sm text-state-error font-medium"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

          {/* Section 1: Room Selector */}
          <div>
            <label className="block text-xs sm:text-sm font-bold text-text-primary mb-2 flex items-center gap-1.5">
              <Home className="w-4 h-4 text-brand-primary" />
              <span>1. Escolha o ambiente de destino</span>
            </label>
            <p className="text-xs text-text-secondary mb-3">
              Selecione o cômodo onde esta tarefa será executada de forma independente:
            </p>

            <div 
              id="room-options-list" 
              className="space-y-2 max-h-52 overflow-y-auto pr-1"
              role="radiogroup"
              aria-label="Ambientes de destino disponíveis"
            >
              {roomStatusList.map(({ room, status }) => {
                const isSelected = selectedRoomId === room.id;
                const isAlreadyActive = status === 'ALREADY_ACTIVE';
                const isReactivate = status === 'REACTIVATE';

                return (
                  <div
                    key={room.id}
                    id={`room-option-${room.id}`}
                    onClick={() => !isAlreadyActive && handleSelectRoom(room.id)}
                    role="radio"
                    aria-checked={isSelected}
                    aria-disabled={isAlreadyActive}
                    tabIndex={isAlreadyActive ? -1 : 0}
                    onKeyDown={e => {
                      if ((e.key === ' ' || e.key === 'Enter') && !isAlreadyActive) {
                        e.preventDefault();
                        handleSelectRoom(room.id);
                      }
                    }}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isAlreadyActive
                        ? 'bg-surface-subtle/50 border-border-default/60 opacity-60 cursor-not-allowed'
                        : isSelected
                        ? 'border-brand-primary bg-brand-primary-soft/40 shadow-xs cursor-pointer ring-1 ring-brand-primary'
                        : 'border-border-default bg-surface-card hover:border-brand-primary/40 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected 
                          ? 'border-brand-primary bg-brand-primary text-text-on-primary' 
                          : 'border-border-default'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                      </div>
                      <span className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                        {room.name}
                      </span>
                    </div>

                    <div className="shrink-0">
                      {isAlreadyActive ? (
                        <span 
                          id={`room-badge-already-${room.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-subtle text-text-muted border border-border-default"
                        >
                          <Check className="w-3 h-3 text-state-success" />
                          <span>Já ativa</span>
                        </span>
                      ) : isReactivate ? (
                        <span 
                          id={`room-badge-reactivate-${room.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-warning-soft text-state-warning border border-state-warning/30"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reativar</span>
                        </span>
                      ) : (
                        <span 
                          id={`room-badge-available-${room.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-success-soft text-state-success border border-state-success/30"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Disponível</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Neutral unselected state hint (HF1.1) */}
            {!selectedRoomId && (
              <div 
                id="room-unselected-hint"
                className="mt-3 p-3.5 bg-surface-subtle/80 border border-dashed border-border-default rounded-2xl flex items-center gap-2.5 text-xs text-text-muted"
              >
                <Info className="w-4 h-4 text-brand-primary shrink-0" />
                <span>Nenhum ambiente selecionado. Escolha um cômodo acima para prosseguir com a configuração.</span>
              </div>
            )}
          </div>

          {/* Section 2: Frequency & Schedule */}
          {selectedRoomId && !selectedRoomInfo?.status?.includes('ALREADY') && (
            <div className="pt-2 border-t border-border-default space-y-4 animate-in fade-in-50 duration-150">
              <label className="block text-xs sm:text-sm font-bold text-text-primary flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-brand-primary" />
                <span>2. Frequência e horário para {selectedRoomInfo?.room.name}</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Frequency */}
                <div>
                  <label htmlFor="routine-frequency-select" className="block text-xs font-medium text-text-secondary mb-1">
                    Frequência *
                  </label>
                  <select
                    id="routine-frequency-select"
                    value={frequency}
                    onChange={e => setFrequency(e.target.value)}
                    className="w-full bg-surface-subtle border border-border-default rounded-xl px-3 py-2 text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
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
                  <label htmlFor="routine-time-input" className="block text-xs font-medium text-text-secondary mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-text-muted" />
                    <span>Horário sugerido *</span>
                  </label>
                  <input
                    id="routine-time-input"
                    type="time"
                    value={preferredTime}
                    onChange={e => setPreferredTime(e.target.value)}
                    className="w-full bg-surface-subtle border border-border-default rounded-xl px-3 py-2 text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Weekly Day Selector */}
              {frequency === 'WEEKLY' && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-text-secondary">
                    Dias da semana *
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {WEEKDAYS.map(day => {
                      const isDaySelected = preferredDays.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          id={`weekday-btn-${day.value}`}
                          type="button"
                          onClick={() => handleToggleDay(day.value)}
                          className={`min-h-[38px] px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isDaySelected
                              ? 'bg-brand-primary text-text-on-primary shadow-xs'
                              : 'bg-surface-subtle border border-border-default text-text-secondary hover:bg-surface-card'
                          }`}
                          aria-pressed={isDaySelected}
                          aria-label={day.full}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Monthly Day Selector */}
              {frequency === 'MONTHLY' && (
                <div>
                  <label htmlFor="routine-day-month-input" className="block text-xs font-medium text-text-secondary mb-1">
                    Dia do mês (1 a 31) *
                  </label>
                  <input
                    id="routine-day-month-input"
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={e => setDayOfMonth(parseInt(e.target.value, 10) || 1)}
                    className="w-32 bg-surface-subtle border border-border-default rounded-xl px-3 py-2 text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                    required
                  />
                </div>
              )}

              {/* Section 3: Execution Target */}
              <div className="pt-2 border-t border-border-default/60 space-y-2.5">
                <label className="block text-xs sm:text-sm font-bold text-text-primary flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-brand-primary" />
                  <span>3. Público de execução</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Household */}
                  <label 
                    id="target-household-label"
                    className={`p-3 rounded-2xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                      executionTarget === 'HOUSEHOLD'
                        ? 'border-brand-primary bg-brand-primary-soft/40 ring-1 ring-brand-primary'
                        : 'border-border-default bg-surface-card hover:bg-surface-subtle/50'
                    }`}
                  >
                    <input
                      id="radio-target-household"
                      type="radio"
                      name="executionTarget"
                      value="HOUSEHOLD"
                      checked={executionTarget === 'HOUSEHOLD'}
                      onChange={() => setExecutionTarget('HOUSEHOLD')}
                      className="mt-0.5 text-brand-primary focus:ring-brand-primary"
                    />
                    <div>
                      <span className="text-xs font-bold text-text-primary block">
                        Pessoas da casa
                      </span>
                      <span className="text-[11px] text-text-secondary leading-tight block mt-0.5">
                        Distribuída aos moradores pelo Motor 2.0
                      </span>
                    </div>
                  </label>

                  {/* External Support */}
                  <label 
                    id="target-external-label"
                    className={`p-3 rounded-2xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                      executionTarget === 'EXTERNAL_SUPPORT'
                        ? 'border-brand-primary bg-brand-primary-soft/40 ring-1 ring-brand-primary'
                        : 'border-border-default bg-surface-card hover:bg-surface-subtle/50'
                    }`}
                  >
                    <input
                      id="radio-target-external"
                      type="radio"
                      name="executionTarget"
                      value="EXTERNAL_SUPPORT"
                      checked={executionTarget === 'EXTERNAL_SUPPORT'}
                      onChange={() => setExecutionTarget('EXTERNAL_SUPPORT')}
                      className="mt-0.5 text-brand-primary focus:ring-brand-primary"
                    />
                    <div>
                      <span className="text-xs font-bold text-text-primary block">
                        Ajuda externa
                      </span>
                      <span className="text-[11px] text-text-secondary leading-tight block mt-0.5">
                        Exclusiva para diarista / apoio doméstico
                      </span>
                    </div>
                  </label>
                </div>

                {/* Domestic Support Selector */}
                {executionTarget === 'EXTERNAL_SUPPORT' && (
                  <div className="pt-2 animate-in fade-in-50 duration-150">
                    <label htmlFor="routine-support-select" className="block text-xs font-medium text-text-secondary mb-1">
                      Pessoa de apoio responsável *
                    </label>
                    {activeSupports.length > 0 ? (
                      <select
                        id="routine-support-select"
                        value={domesticSupportId || ''}
                        onChange={e => setDomesticSupportId(e.target.value)}
                        className="w-full bg-surface-subtle border border-border-default rounded-xl px-3 py-2 text-xs sm:text-sm text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
                        required
                      >
                        {activeSupports.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-state-warning font-medium p-2.5 bg-state-warning-soft rounded-xl border border-state-warning/30">
                        Nenhuma pessoa de apoio externo cadastrada na família. Cadastre na aba "Apoio Doméstico" antes de selecionar esta opção.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Section 4: Clear Confirmation Summary (Requisito 8 & HF1.2) */}
              <div 
                id="add-room-confirmation-summary"
                className={`p-4 rounded-2xl border text-xs sm:text-sm space-y-2.5 ${
                  isReactivation 
                    ? 'bg-state-warning-soft/60 border-state-warning/30' 
                    : 'bg-surface-subtle/80 border-border-default'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-text-primary text-xs sm:text-sm">
                  <ShieldCheck className="w-4 h-4 text-brand-primary shrink-0" />
                  <span>Resumo da rotina para confirmação:</span>
                </div>
                <div className="pl-6 space-y-1.5 text-xs text-text-secondary">
                  <p>
                    <strong className="text-text-primary font-semibold">Ambiente:</strong> {selectedRoomInfo?.room.name}
                  </p>
                  <p>
                    <strong className="text-text-primary font-semibold">Frequência:</strong> {getFrequencyLabel()}
                  </p>
                  <p>
                    <strong className="text-text-primary font-semibold">Horário:</strong> {preferredTime}
                  </p>
                  <p>
                    <strong className="text-text-primary font-semibold">Responsável:</strong> {executionTarget === 'HOUSEHOLD' ? 'Pessoas da casa (distribuído pelo Motor 2.0)' : `Apoio externo (${selectedSupportName})`}
                  </p>
                  <div className="pt-2 text-[11px] font-medium text-text-muted border-t border-border-default/40 mt-1">
                    {isReactivation ? (
                      <span className="text-state-warning font-semibold flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                        <span>Reativação canônica: reutiliza o identificador da rotina arquivada e preserva o histórico.</span>
                      </span>
                    ) : (
                      <span className="text-state-success font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>Nova rotina independente: as rotinas desta tarefa em outros cômodos permanecem intactas.</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Sticky Footer Actions (HF1.2) */}
          <div className="p-4 sm:px-6 sm:py-4 border-t border-border-default bg-surface-card/95 backdrop-blur-xs flex items-center justify-end gap-2.5 shrink-0 shadow-xs">
            <button
              id="btn-cancel-add-room"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors cursor-pointer disabled:opacity-40"
            >
              Cancelar
            </button>

            <button
              id="btn-confirm-add-room"
              type="submit"
              disabled={isSubmitting || !selectedRoomId || selectedRoomInfo?.status === 'ALREADY_ACTIVE'}
              className="min-h-[44px] px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-text-on-primary bg-brand-primary hover:bg-brand-primary-hover shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span>Salvando...</span>
              ) : !selectedRoomId ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Criar rotina neste ambiente</span>
                </>
              ) : isReactivation ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Reativar no {selectedRoomInfo?.room.name || 'ambiente'}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Criar rotina no {selectedRoomInfo?.room.name || 'ambiente'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
