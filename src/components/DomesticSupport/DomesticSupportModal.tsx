import React, { useState, useEffect } from 'react';
import { X, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { DomesticSupport, DomesticSupportSchedule } from '../../types';
import {
  DOMESTIC_SUPPORT_WEEKDAYS,
  validateDomesticSupportSchedule
} from '../../services/domesticSupportService';

interface DomesticSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; schedule: DomesticSupportSchedule[] }) => Promise<void>;
  initialData?: DomesticSupport | null;
}

export const DomesticSupportModal: React.FC<DomesticSupportModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData
}) => {
  const isEditing = Boolean(initialData);

  const [name, setName] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [daySchedules, setDaySchedules] = useState<Record<number, { startTime: string; endTime: string }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      setName(initialData.name || '');
      const days = (initialData.schedule || []).map((s) => s.weekday);
      setSelectedDays(Array.from(new Set(days)).sort((a, b) => a - b));

      const schedMap: Record<number, { startTime: string; endTime: string }> = {};
      (initialData.schedule || []).forEach((s) => {
        schedMap[s.weekday] = {
          startTime: s.startTime || '08:00',
          endTime: s.endTime || '16:00'
        };
      });
      setDaySchedules(schedMap);
    } else {
      setName('');
      setSelectedDays([2]); // Terça-feira default
      setDaySchedules({
        2: { startTime: '08:00', endTime: '16:00' }
      });
    }
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const toggleDay = (weekday: number) => {
    if (selectedDays.includes(weekday)) {
      setSelectedDays((prev) => prev.filter((d) => d !== weekday));
    } else {
      setSelectedDays((prev) => [...prev, weekday].sort((a, b) => a - b));
      if (!daySchedules[weekday]) {
        setDaySchedules((prev) => ({
          ...prev,
          [weekday]: { startTime: '08:00', endTime: '16:00' }
        }));
      }
    }
  };

  const updateTime = (weekday: number, field: 'startTime' | 'endTime', value: string) => {
    setDaySchedules((prev) => ({
      ...prev,
      [weekday]: {
        ...(prev[weekday] || { startTime: '08:00', endTime: '16:00' }),
        [field]: value
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Por favor, informe o nome da pessoa de apoio.');
      return;
    }

    if (selectedDays.length === 0) {
      setErrorMessage('Selecione pelo menos um dia da semana para a rotina.');
      return;
    }

    const builtSchedule: DomesticSupportSchedule[] = selectedDays.map((day) => {
      const times = daySchedules[day] || { startTime: '08:00', endTime: '16:00' };
      return {
        weekday: day,
        startTime: times.startTime,
        endTime: times.endTime
      };
    });

    const validation = validateDomesticSupportSchedule(builtSchedule);
    if (!validation.valid) {
      // Mensagem amigável sem códigos técnicos
      if (validation.error?.includes('startTime must be strictly earlier')) {
        setErrorMessage('O horário de início deve ser anterior ao horário de término em todos os dias selecionados.');
      } else {
        setErrorMessage(validation.error || 'Verifique os horários informados.');
      }
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onSave({
        name: trimmedName,
        schedule: builtSchedule
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Ocorreu um erro ao salvar. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="domestic-support-modal-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-surface-card border border-border-default rounded-3xl w-full max-w-lg shadow-xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-default">
          <div>
            <h3 id="domestic-support-modal-title" className="text-base font-extrabold text-text-primary">
              {isEditing ? 'Editar ajuda externa' : 'Adicionar ajuda externa'}
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Organize quem ajuda nos cuidados e rotinas da casa
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 text-text-muted hover:text-text-primary rounded-xl hover:bg-surface-subtle transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-state-danger-soft border border-state-danger/30 text-state-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Nome */}
          <div>
            <label className="block text-xs font-bold text-text-primary uppercase tracking-wider mb-1.5">
              Nome
            </label>
            <input
              type="text"
              id="input-support-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Maria"
              maxLength={60}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-subtle border border-border-default text-text-primary text-sm focus:outline-hidden focus:border-brand-primary min-h-[44px]"
            />
          </div>

          {/* Tipo de Ajuda */}
          <div>
            <label className="block text-xs font-bold text-text-primary uppercase tracking-wider mb-1.5">
              Tipo de ajuda
            </label>
            <div className="px-3.5 py-2.5 rounded-xl bg-surface-subtle border border-border-default text-text-primary text-sm font-semibold flex items-center justify-between min-h-[44px]">
              <span>Diarista</span>
              <span className="text-[11px] text-text-muted">Apoio doméstico</span>
            </div>
          </div>

          {/* Quando vem? */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-bold text-text-primary uppercase tracking-wider">
              Quando vem?
            </label>
            <p className="text-[11px] text-text-muted">
              Selecione os dias em que a diarista atua na casa:
            </p>

            {/* Day Selector Buttons */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {DOMESTIC_SUPPORT_WEEKDAYS.map((day) => {
                const isSelected = selectedDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    disabled={isSubmitting}
                    className={`min-h-[44px] flex flex-col items-center justify-center rounded-xl text-xs font-bold transition cursor-pointer ${
                      isSelected
                        ? 'bg-brand-primary text-text-on-primary shadow-xs'
                        : 'bg-surface-subtle hover:bg-surface-subtle/80 text-text-secondary border border-border-default'
                    }`}
                  >
                    <span>{day.short}</span>
                  </button>
                );
              })}
            </div>

            {/* Individual Day Schedules */}
            {selectedDays.length > 0 && (
              <div className="space-y-2.5 pt-2">
                <p className="text-[11px] font-semibold text-text-secondary">
                  Horário de atuação por dia:
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selectedDays.map((dayValue) => {
                    const dayDef = DOMESTIC_SUPPORT_WEEKDAYS.find((d) => d.value === dayValue);
                    const schedule = daySchedules[dayValue] || { startTime: '08:00', endTime: '16:00' };
                    return (
                      <div
                        key={dayValue}
                        className="p-3 rounded-xl bg-surface-subtle border border-border-default flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <span className="text-xs font-bold text-text-primary">
                          {dayDef?.label || 'Dia'}
                        </span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-text-muted text-[11px]">De</span>
                          <input
                            type="time"
                            value={schedule.startTime}
                            onChange={(e) => updateTime(dayValue, 'startTime', e.target.value)}
                            disabled={isSubmitting}
                            className="px-2.5 py-1.5 rounded-lg bg-surface-card border border-border-default text-text-primary text-xs font-medium focus:outline-hidden focus:border-brand-primary min-h-[38px]"
                          />
                          <span className="text-text-muted text-[11px]">até</span>
                          <input
                            type="time"
                            value={schedule.endTime}
                            onChange={(e) => updateTime(dayValue, 'endTime', e.target.value)}
                            disabled={isSubmitting}
                            className="px-2.5 py-1.5 rounded-lg bg-surface-card border border-border-default text-text-primary text-xs font-medium focus:outline-hidden focus:border-brand-primary min-h-[38px]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border-default">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-border-default text-xs font-bold text-text-secondary hover:bg-surface-subtle transition cursor-pointer min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="btn-submit-support"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-text-on-primary text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer min-h-[44px] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>{isEditing ? 'Salvar alterações' : 'Adicionar'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
