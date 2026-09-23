import React, { useMemo } from 'react';
import { Trophy, Flame, CheckCircle2, Award } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { computeTodayProgress, resolveTodayDate } from '../domain/selectors/todayProgressSelectors';

export const RightSidebar: React.FC = () => {
  const { members, activeMembers, tasks, family, familyTasks, selectedDate } = useApp();

  const targetDate = useMemo(() => {
    return resolveTodayDate({ family, selectedDate });
  }, [family, selectedDate]);

  const { completedToday, totalToday, progressPercent } = useMemo(() => {
    return computeTodayProgress({
      tasks,
      family,
      familyTasks,
      targetDate
    });
  }, [tasks, family, familyTasks, targetDate]);

  // Mostra apenas moradores ativos no placar operacional do lar
  const operationalMembers = activeMembers && activeMembers.length > 0 ? activeMembers : members.filter(m => m.active !== false);
  const sortedMembers = [...operationalMembers].sort((a, b) => (b.points || 0) - (a.points || 0));

  return (
    <aside className="w-72 bg-surface-card border-l border-border-default p-5 hidden lg:flex flex-col gap-6 flex-shrink-0 overflow-y-auto">
      {/* Daily Progress */}
      <div className="bg-surface-subtle border border-border-default rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-brand-primary" />
            <span>Progresso do Lar Hoje</span>
          </span>
          <span className="text-xs font-extrabold text-brand-primary">{progressPercent}%</span>
        </div>

        <div className="w-full h-2.5 bg-border-default rounded-full overflow-hidden mb-2">
          <div 
            className="h-full bg-brand-primary rounded-full transition-all duration-500" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="text-[11px] text-text-secondary">
          {completedToday} de {totalToday} tarefas concluídas pela equipe da casa.
        </p>
      </div>

      {/* Leaderboard / Placares */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-extrabold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-brand-accent" />
            <span>Placar da Convivência</span>
          </h3>
          <span className="text-[10px] text-text-muted">Pontos</span>
        </div>

        <div className="space-y-2.5">
          {sortedMembers.map((m, idx) => (
            <div 
              key={m.id}
              className="flex items-center justify-between p-2.5 rounded-xl bg-surface-subtle border border-border-default"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-5 text-center text-xs font-bold text-text-muted">
                  {idx + 1}º
                </span>
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-2xs font-semibold"
                  style={{ backgroundColor: `${m.color || '#5b32a3'}20`, color: m.color || '#5b32a3' }}
                >
                  {m.avatar || '👤'}
                </div>
                <div>
                  <p className="text-xs font-bold text-text-primary leading-none">{m.name}</p>
                  <p className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1">
                    <Flame className="w-2.5 h-2.5 text-brand-secondary" />
                    <span>{m.streak || 0} dias seguidos</span>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-extrabold text-brand-primary">{m.points || 0}</span>
                <span className="text-[9px] text-text-muted block">pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Motivation Tip */}
      <div className="mt-auto p-4 rounded-2xl bg-brand-primary-soft border border-brand-primary/15">
        <div className="flex items-center gap-2 text-xs font-bold text-brand-primary mb-1">
          <Award className="w-4 h-4 text-brand-primary" />
          <span>Dica de Harmonia</span>
        </div>
        <p className="text-[11px] text-text-secondary leading-relaxed">
          Pequenos gestos consistentes mantêm o ambiente limpo sem sobrecarregar ninguém no fim de semana.
        </p>
      </div>
    </aside>
  );
};
