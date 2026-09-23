import React, { useState } from 'react';
import { X, Calendar } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const RescheduleModal: React.FC = () => {
  const { activeTaskForReschedule, setActiveTaskForReschedule, updateTask } = useApp();
  const [newDate, setNewDate] = useState('');

  if (!activeTaskForReschedule) return null;

  const handleSave = () => {
    if (newDate) {
      updateTask(activeTaskForReschedule.id, { dueDate: newDate });
    }
    setActiveTaskForReschedule(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary">Reagendar Tarefa</h3>
          <button 
            onClick={() => setActiveTaskForReschedule(null)}
            className="p-1 text-text-muted hover:text-text-primary cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-text-secondary">
          Alterando data de: <strong className="text-text-primary">{activeTaskForReschedule.title}</strong>
        </p>

        <div>
          <label className="block text-xs font-semibold text-text-primary mb-1">Nova Data</label>
          <input
            type="date"
            value={newDate}
            onChange={e => setNewDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
          />
        </div>

        <div className="pt-3 border-t border-border-default flex justify-end gap-2">
          <button
            onClick={() => setActiveTaskForReschedule(null)}
            className="px-4 py-2 rounded-xl text-xs text-text-secondary hover:bg-surface-subtle cursor-pointer transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover cursor-pointer transition"
          >
            Confirmar Reagendamento
          </button>
        </div>
      </div>
    </div>
  );
};
