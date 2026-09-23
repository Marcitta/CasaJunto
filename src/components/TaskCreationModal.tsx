import React, { useState } from 'react';
import { X, Calendar, Clock, Home, AlertCircle, Repeat, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CatalogTemplate } from '../types';
import { getTodayDateString } from '../data/mockData';

interface TaskCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: CatalogTemplate | null;
}

export const TaskCreationModal: React.FC<TaskCreationModalProps> = ({
  isOpen,
  onClose,
  template
}) => {
  const { rooms, addTask, selectedDate, currentMember } = useApp();

  const [title, setTitle] = useState(template?.title || '');
  const [description, setDescription] = useState(template?.description || '');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [frequency, setFrequency] = useState<string>(template?.suggestedFrequency || 'DAILY');
  const [taskDate, setTaskDate] = useState<string>(selectedDate || getTodayDateString());
  const [scheduledTime, setScheduledTime] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeRooms = React.useMemo(() => rooms.filter(r => r.active !== false), [rooms]);
  const isMemberBlocked = Boolean(currentMember?.role && currentMember.role !== 'ADMIN');

  // Synchronize when template changes
  React.useEffect(() => {
    if (template) {
      setTitle(template.title);
      setDescription(template.description);
      setFrequency(template.suggestedFrequency || 'DAILY');
      // Auto-match room if any active room has same name or type
      const matched = activeRooms.find(
        r => r.name.toLowerCase() === template.defaultRoom.toLowerCase() ||
             r.type.toLowerCase() === template.defaultRoom.toLowerCase()
      );
      setSelectedRoomId(matched?.id || (activeRooms.length > 0 ? activeRooms[0].id : ''));
    } else {
      setTitle('');
      setDescription('');
      setFrequency('DAILY');
      setSelectedRoomId(activeRooms.length > 0 ? activeRooms[0].id : '');
    }
    setTaskDate(selectedDate || getTodayDateString());
    setScheduledTime('');
    setError(null);
    setIsSubmitting(false);
  }, [template, isOpen, activeRooms, selectedDate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (isMemberBlocked) {
      setError('Apenas administradores da família podem criar tarefas para a casa.');
      return;
    }

    if (!title.trim()) {
      setError('O título da tarefa é obrigatório.');
      return;
    }
    if (activeRooms.length === 0) {
      setError('Cadastre ao menos um cômodo na aba "Ambientes" antes de criar tarefas.');
      return;
    }
    if (!selectedRoomId) {
      setError('Selecione um ambiente da casa.');
      return;
    }

    const selectedRoom = activeRooms.find(r => r.id === selectedRoomId);
    let scheduledStart: string | undefined = undefined;
    let scheduledEnd: string | undefined = undefined;

    if (scheduledTime) {
      scheduledStart = scheduledTime;
      const durationMin = template?.estimatedMinutes || 20;
      const [h, m] = scheduledTime.split(':').map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        const totalMinutes = h * 60 + m + durationMin;
        const endH = Math.floor(totalMinutes / 60) % 24;
        const endM = totalMinutes % 60;
        scheduledEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await addTask({
        title: title.trim(),
        description: description.trim(),
        roomId: selectedRoom?.id || '',
        roomName: selectedRoom?.name || 'Geral',
        dueDate: taskDate,
        scheduledStart,
        scheduledEnd,
        frequency: (frequency || template?.suggestedFrequency || 'DAILY') as any,
        effort: template?.effort || 10,
        durationMinutes: template?.estimatedMinutes || 20,
        category: template?.category || 'cleaning',
        taskMasterId: template?.id,
        isUnassigned: true,
        assigneeId: '',
        assignedMemberId: '',
        assigneeName: 'Não atribuído'
      });

      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar tarefa. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-primary-soft flex items-center justify-center text-brand-primary">
              <Home className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-text-primary">Adicionar Tarefa</h3>
              <p className="text-[11px] text-text-muted">
                {template ? 'Configurar modelo do catálogo' : 'Criar nova tarefa para a casa'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isMemberBlocked && (
          <div className="p-3 rounded-xl bg-state-warning-soft border border-state-warning/30 text-state-warning text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>Apenas administradores da família têm permissão para criar tarefas para a casa.</span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-state-error-soft border border-state-error/30 text-state-error text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">
              Título da Tarefa *
            </label>
            <input
              type="text"
              value={title}
              disabled={isMemberBlocked || isSubmitting}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Lavar louça da janta"
              className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">
              Ambiente / Cômodo *
            </label>
            {activeRooms.length === 0 ? (
              <div className="p-2.5 rounded-xl bg-state-warning-soft border border-state-warning/30 text-state-warning text-[11px]">
                Nenhum cômodo ativo cadastrado. Cadastre um cômodo na aba &quot;Ambientes&quot; antes de adicionar tarefas.
              </div>
            ) : (
              <select
                value={selectedRoomId}
                disabled={isMemberBlocked || isSubmitting}
                onChange={e => setSelectedRoomId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle disabled:opacity-50"
              >
                {activeRooms.map(room => (
                  <option key={room.id} value={room.id}>
                    {room.name} ({room.type})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1 flex items-center gap-1">
              <Repeat className="w-3.5 h-3.5 text-text-muted" />
              <span>Frequência / Recorrência</span>
            </label>
            <select
              value={frequency}
              disabled={isMemberBlocked || isSubmitting}
              onChange={e => setFrequency(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle disabled:opacity-50"
            >
              <option value="DAILY">Diária (Rotina contínua)</option>
              <option value="WEEKLY">Semanal</option>
              <option value="ONE_TIME">Pontual (Apenas nesta data)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-text-muted" />
                <span>Data</span>
              </label>
              <input
                type="date"
                value={taskDate}
                disabled={isMemberBlocked || isSubmitting}
                onChange={e => setTaskDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-text-muted" />
                <span>Horário (opcional)</span>
              </label>
              <input
                type="time"
                value={scheduledTime}
                disabled={isMemberBlocked || isSubmitting}
                onChange={e => setScheduledTime(e.target.value)}
                placeholder="Ex: 14:00"
                className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">
              Instruções / Detalhes (opcional)
            </label>
            <textarea
              rows={2}
              value={description}
              disabled={isMemberBlocked || isSubmitting}
              onChange={e => setDescription(e.target.value)}
              placeholder="Orientações específicas..."
              className="w-full px-3 py-2 rounded-xl border border-border-default text-xs font-medium text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle resize-none disabled:opacity-50"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-border-default">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isMemberBlocked || isSubmitting || activeRooms.length === 0}
              className="px-4 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {isSubmitting ? 'Criando...' : 'Criar Tarefa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
