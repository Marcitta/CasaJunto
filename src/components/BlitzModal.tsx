import React, { useState, useEffect, useMemo } from 'react';
import { X, Zap, CheckCircle2, Play, Pause } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useApp } from '../context/AppContext';
import { isMemberActive, getActiveMembers } from '../domain/selectors';

export const BlitzModal: React.FC = () => {
  const { isBlitzModalOpen, setIsBlitzModalOpen, tasks, completeTask, members, activeMembers, selectedDate, familyTasks } = useApp();
  const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 min
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let timer: any;
    if (isRunning && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning, timeLeft]);

  // STAB-009: Blitz consome apenas ocorrências válidas e únicas de Today
  const pending = useMemo(() => {
    const seenIds = new Set<string>();
    return tasks.filter(t => {
      const taskDate = t.dueDate || selectedDate;
      if (taskDate !== selectedDate) return false;
      const isActionable = t.status === 'PENDING' || (t.status as string) === 'SCHEDULED';
      if (!isActionable) return false;
      if ((t.status as string) === 'CANCELLED') return false;

      if (familyTasks && familyTasks.length > 0) {
        const ft = familyTasks.find(
          f => f.id === t.familyTaskId || (f.task_master_id && f.task_master_id === t.taskMasterId)
        );
        if (ft && ft.active === false) return false;
      }

      if (t.assignedMemberId) {
        const m = members.find(mem => mem.id === t.assignedMemberId);
        if (m && !isMemberActive(m)) return false;
      }

      if (seenIds.has(t.id)) return false;
      seenIds.add(t.id);
      return true;
    }).slice(0, 5);
  }, [tasks, selectedDate, familyTasks, members]);

  if (!isBlitzModalOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-accent fill-brand-accent" />
            <h3 className="text-base font-extrabold text-text-primary">Modo Blitz de Limpeza (15 Min)</h3>
          </div>
          <button 
            onClick={() => setIsBlitzModalOpen(false)}
            className="p-1 text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Timer display */}
        <div className="bg-surface-subtle border border-border-default rounded-2xl p-6 text-center">
          <div className="text-4xl font-extrabold font-mono text-brand-primary">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>
          <p className="text-xs text-text-muted mt-1">Todos focam juntos no mesmo intervalo!</p>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={() => setIsRunning(!isRunning)}
              className="px-5 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover flex items-center gap-1.5 cursor-pointer transition"
            >
              {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isRunning ? 'Pausar' : 'Iniciar Blitz'}</span>
            </button>
          </div>
        </div>

        {/* Quick tasks */}
        <div>
          <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-2">
            Tarefas recomendadas para o Blitz
          </h4>
          <div className="space-y-2">
            {pending.map(t => (
              <div key={t.id} className="p-2.5 rounded-xl bg-surface-subtle border border-border-default flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-text-primary">{t.title}</p>
                  <p className="text-[10px] text-text-muted">{t.roomName}</p>
                </div>
                <button
                  onClick={async () => {
                    const success = await completeTask(t.id);
                    if (success) {
                      confetti({ particleCount: 30 });
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-state-success hover:bg-state-success-hover text-white text-[11px] font-bold cursor-pointer transition"
                >
                  Feito!
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
