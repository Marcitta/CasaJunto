import React from 'react';
import { X, CheckCircle, Clock } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useApp } from '../context/AppContext';

export const TaskExecutionModal: React.FC = () => {
  const { activeTaskForExecution, setActiveTaskForExecution, completeTask } = useApp();

  if (!activeTaskForExecution) return null;

  const handleComplete = async () => {
    const success = await completeTask(activeTaskForExecution.id);
    setActiveTaskForExecution(null);
    if (success) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.8 }
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary">Executar Tarefa</h3>
          <button 
            onClick={() => setActiveTaskForExecution(null)}
            className="p-1 text-text-muted hover:text-text-primary cursor-pointer transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h4 className="text-sm font-bold text-text-primary">{activeTaskForExecution.title}</h4>
          <p className="text-xs text-text-secondary mt-1">{activeTaskForExecution.description}</p>
        </div>

        <div className="pt-3 border-t border-border-default flex justify-end gap-2">
          <button
            onClick={() => setActiveTaskForExecution(null)}
            className="px-4 py-2 rounded-xl text-xs text-text-secondary hover:bg-surface-subtle cursor-pointer transition"
          >
            Fechar
          </button>
          <button
            onClick={handleComplete}
            className="px-4 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover cursor-pointer transition"
          >
            Marcar como Feito
          </button>
        </div>
      </div>
    </div>
  );
};
