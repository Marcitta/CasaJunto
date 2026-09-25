import React, { useState, useEffect, useContext } from 'react';
import { X, Clock, Home, Calendar, AlertCircle, CheckCircle2, Sliders, Shield, Edit3 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AuthContext } from '../context/AuthContext';
import { FamilyTask, Task, ExecutionTarget } from '../types';
import { allMasterTasks } from '../data/tasks';
import { ExecutionTargetSelector } from './DomesticSupport/ExecutionTargetSelector';
import { resolveExecutionTarget, validateFamilyTaskExecutionTarget } from '../services/domesticSupportService';

export interface EditFamilyTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  familyTaskId?: string | null;
  initialTask?: Task | null;
}

const WEEKDAY_NAMES = [
  { day: 0, label: 'Dom', full: 'Domingo' },
  { day: 1, label: 'Seg', full: 'Segunda-feira' },
  { day: 2, label: 'Ter', full: 'Terça-feira' },
  { day: 3, label: 'Qua', full: 'Quarta-feira' },
  { day: 4, label: 'Qui', full: 'Quinta-feira' },
  { day: 5, label: 'Sex', full: 'Sexta-feira' },
  { day: 6, label: 'Sáb', full: 'Sábado' }
];

export const EditFamilyTaskModal: React.FC<EditFamilyTaskModalProps> = ({
  isOpen,
  onClose,
  familyTaskId,
  initialTask
}) => {
  const { 
    familyTasks, 
    rooms, 
    updateRoutine, 
    currentMember, 
    isDemoMode,
    domesticSupports,
    setCurrentView,
    family
  } = useApp();
  const authContext = useContext(AuthContext);
  const currentMembership = authContext?.currentMembership;

  const isAdmin = Boolean(
    isDemoMode || 
    currentMembership?.role === 'ADMIN' || 
    currentMember?.role === 'ADMIN'
  );

  const activeRooms = rooms.filter(r => r.active !== false);
  const activeSupports = React.useMemo(() => (domesticSupports || []).filter(s => s.active), [domesticSupports]);

  // Find target family task
  const targetRoutineId = familyTaskId || initialTask?.familyTaskId;
  const routine: FamilyTask | undefined = familyTasks.find(f => f.id === targetRoutineId);
  const master = allMasterTasks.find(tm => tm.id === (routine?.task_master_id || routine?.taskMasterId || initialTask?.taskMasterId));

  const [customTitle, setCustomTitle] = useState<string>('');
  const [customDescription, setCustomDescription] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(20);
  const [preferredTime, setPreferredTime] = useState<string>('08:00');
  const [frequency, setFrequency] = useState<'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('DAILY');
  const [preferredDays, setPreferredDays] = useState<number[]>([1, 3, 5]);
  const [executionTarget, setExecutionTarget] = useState<ExecutionTarget>('HOUSEHOLD');
  const [domesticSupportId, setDomesticSupportId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (routine) {
      setCustomTitle(routine.customTitle || routine.custom_title || '');
      setCustomDescription(routine.customDescription || routine.custom_description || '');
      setSelectedRoomId(routine.room_id || routine.roomId || (activeRooms[0]?.id || ''));
      setDurationMinutes(routine.estimated_minutes || 20);
      setPreferredTime(routine.preferred_time || routine.preferredTime || '08:00');
      const f = (routine.frequency || 'DAILY').toUpperCase();
      if (['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(f)) {
        setFrequency(f as any);
      } else {
        setFrequency('DAILY');
      }
      setPreferredDays(routine.preferred_days || routine.preferredDays || [1, 3, 5]);
      const resolvedTarget = resolveExecutionTarget(routine);
      setExecutionTarget(resolvedTarget);
      setDomesticSupportId(resolvedTarget === 'HOUSEHOLD' ? null : (routine.domesticSupportId || null));
    } else if (initialTask) {
      setCustomTitle('');
      setCustomDescription('');
      setSelectedRoomId(initialTask.roomId || (activeRooms[0]?.id || ''));
      setDurationMinutes(initialTask.durationMinutes || initialTask.estimatedMinutes || 20);
      setPreferredTime(initialTask.scheduledStart || '08:00');
      const f = (initialTask.frequency || 'DAILY').toUpperCase();
      if (['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(f)) {
        setFrequency(f as any);
      }
      const resolvedTarget = resolveExecutionTarget(initialTask);
      setExecutionTarget(resolvedTarget);
      setDomesticSupportId(resolvedTarget === 'HOUSEHOLD' ? null : (initialTask.domesticSupportId || null));
    } else {
      setExecutionTarget('HOUSEHOLD');
      setDomesticSupportId(null);
    }
    setError(null);
    setSuccess(null);
  }, [routine, initialTask, isOpen]);

  if (!isOpen) return null;

  const toggleDay = (day: number) => {
    setPreferredDays(prev => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev; // Keep at least one day
        return prev.filter(d => d !== day);
      } else {
        return [...prev, day].sort();
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Apenas administradores podem alterar configurações de rotinas.');
      return;
    }

    if (!selectedRoomId) {
      setError('Selecione um ambiente da casa.');
      return;
    }

    if ((frequency === 'WEEKLY' || frequency === 'BIWEEKLY') && preferredDays.length === 0) {
      setError('Selecione pelo menos um dia da semana para a rotina semanal.');
      return;
    }

    if (executionTarget === 'EXTERNAL_SUPPORT') {
      if (activeSupports.length === 0) {
        setError('Você ainda não tem uma ajuda externa ativa cadastrada.');
        return;
      }
      if (!domesticSupportId) {
        setError('Selecione quem normalmente faz esta tarefa.');
        return;
      }
    }

    const validation = validateFamilyTaskExecutionTarget(
      {
        familyId: authContext?.currentFamily?.id || family?.id,
        executionTarget,
        domesticSupportId: executionTarget === 'HOUSEHOLD' ? null : domesticSupportId
      },
      domesticSupports || []
    );

    if (!validation.valid) {
      if (executionTarget === 'EXTERNAL_SUPPORT' && !domesticSupportId) {
        setError('Selecione quem normalmente faz esta tarefa.');
      } else {
        setError('Verifique as informações da ajuda externa selecionada.');
      }
      return;
    }

    const trimmedTitle = customTitle.trim();
    const trimmedDescription = customDescription.trim();

    setIsSubmitting(true);
    setError(null);

    try {
      const updatesPayload: Partial<FamilyTask> = {
        room_id: selectedRoomId,
        roomId: selectedRoomId,
        estimated_minutes: durationMinutes,
        preferred_time: preferredTime,
        preferredTime: preferredTime,
        frequency: frequency.toLowerCase(),
        preferred_days: preferredDays,
        preferredDays: preferredDays,
        customTitle: trimmedTitle || undefined,
        custom_title: trimmedTitle || undefined,
        customDescription: trimmedDescription || undefined,
        custom_description: trimmedDescription || undefined,
        executionTarget,
        domesticSupportId: executionTarget === 'HOUSEHOLD' ? null : domesticSupportId
      };

      if (routine) {
        await updateRoutine(routine.id, updatesPayload);
      } else if (targetRoutineId) {
        await updateRoutine(targetRoutineId, updatesPayload);
      }
      setSuccess('Alterações salvas com sucesso!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar alterações da rotina.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const defaultTitle = master?.name || routine?.name || initialTask?.title || 'Rotina da Casa';
  const defaultDesc = master?.description || initialTask?.description || '';
  const routineTitle = customTitle.trim() || routine?.customTitle || routine?.custom_title || defaultTitle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface-card rounded-3xl border border-border-default shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-brand-primary-soft text-brand-primary flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </span>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-brand-primary block">
                Editar tarefa da casa
              </span>
              <h3 className="text-sm font-extrabold text-text-primary truncate max-w-xs">
                {routineTitle}
              </h3>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice of Routine Continuity */}
        <div className="p-3 rounded-2xl bg-surface-subtle border border-border-default text-[11px] text-text-secondary space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-text-primary">
            <Shield className="w-3.5 h-3.5 text-brand-primary" />
            <span>Como funcionam as alterações</span>
          </div>
          <p>
            • O que já foi concluído continua no histórico.
          </p>
          <p>
            • As alterações valem para as próximas tarefas.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-state-error-soft border border-state-error/30 text-state-error text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-state-success-soft border border-state-success/30 text-state-success text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Personalização para a Família */}
          <div className="space-y-3 p-3 rounded-2xl bg-surface-subtle/70 border border-border-default">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-custom-title" className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-text-muted" />
                  <span>Título na minha casa</span>
                </label>
                <span className="text-[10px] text-text-muted">Opcional</span>
              </div>
              <input
                id="input-custom-title"
                type="text"
                value={customTitle}
                onChange={e => setCustomTitle(e.target.value)}
                placeholder={defaultTitle}
                className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-card"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="input-custom-desc" className="text-xs font-bold text-text-secondary">
                  Descrição / Instruções
                </label>
                <span className="text-[10px] text-text-muted">Opcional</span>
              </div>
              <textarea
                id="input-custom-desc"
                rows={2}
                value={customDescription}
                onChange={e => setCustomDescription(e.target.value)}
                placeholder={defaultDesc || 'Instruções personalizadas para sua casa'}
                className="w-full px-3 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-card resize-none"
              />
            </div>
          </div>

          {/* Ambiente / Cômodo */}
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1 flex items-center gap-1.5">
              <Home className="w-3.5 h-3.5 text-text-muted" />
              <span>Ambiente *</span>
            </label>
            <select
              value={selectedRoomId}
              onChange={e => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
            >
              {activeRooms.map(room => (
                <option key={room.id} value={room.id}>
                  {room.name} ({room.type || 'Geral'})
                </option>
              ))}
            </select>
          </div>

          {/* Duração e Horário Preferido */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-text-muted" />
                <span>Duração Estimada</span>
              </label>
              <select
                value={durationMinutes}
                onChange={e => setDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
              >
                <option value={10}>10 minutos</option>
                <option value={15}>15 minutos</option>
                <option value={20}>20 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>60 minutos (1h)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-text-muted" />
                <span>Horário Preferido</span>
              </label>
              <input
                type="time"
                value={preferredTime}
                onChange={e => setPreferredTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
              />
            </div>
          </div>

          {/* Frequência */}
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-text-muted" />
              <span>Frequência</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const).map(freqKey => {
                const isSelected = frequency === freqKey;
                const labels: Record<string, string> = {
                  DAILY: 'Diária',
                  WEEKLY: 'Semanal',
                  BIWEEKLY: 'Quinzenal',
                  MONTHLY: 'Mensal'
                };
                return (
                  <button
                    key={freqKey}
                    type="button"
                    onClick={() => setFrequency(freqKey)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      isSelected
                        ? 'bg-brand-primary text-text-on-primary border-brand-primary shadow-xs'
                        : 'bg-surface-subtle border-border-default text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {labels[freqKey]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dias preferidos (apenas se semanal ou quinzenal) */}
          {(frequency === 'WEEKLY' || frequency === 'BIWEEKLY') && (
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1.5 flex items-center justify-between">
                <span>Dias da semana</span>
                <span className="text-[10px] text-text-muted">Selecione ao menos um</span>
              </label>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAY_NAMES.map(({ day, label, full }) => {
                  const isChecked = preferredDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      title={full}
                      className={`py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        isChecked
                          ? 'bg-brand-primary-soft border-brand-primary text-brand-primary'
                          : 'bg-surface-subtle border-border-default text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quem normalmente faz esta tarefa? (ADMIN UX) */}
          {isAdmin && (
            <ExecutionTargetSelector
              executionTarget={executionTarget}
              domesticSupportId={domesticSupportId}
              onChange={(target, supportId) => {
                setExecutionTarget(target);
                setDomesticSupportId(supportId);
              }}
              activeSupports={activeSupports}
              onOpenDomesticSupport={() => {
                onClose();
                setCurrentView('domestic_support');
              }}
              disabled={isSubmitting}
            />
          )}

          {/* Botões de Ação */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-border-default">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !isAdmin ||
                (executionTarget === 'EXTERNAL_SUPPORT' && (!domesticSupportId || activeSupports.length === 0))
              }
              className="px-4 py-2 rounded-xl text-xs font-bold bg-brand-primary text-text-on-primary hover:bg-brand-primary-hover shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
