import React from 'react';
import { BarChart3, Trophy, Flame, CheckCircle, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const StatsView: React.FC = () => {
  const { members, activeMembers, tasks } = useApp();

  const totalCompleted = tasks.filter(t => t.status === 'DONE').length;
  // Preserva pontuação histórica de todos os membros (incluindo desativados) - MD07
  const totalPoints = members.reduce((sum, m) => sum + (m.points || 0), 0);
  const operationalMembers = activeMembers && activeMembers.length > 0 ? activeMembers : members.filter(m => m.active !== false);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h3 className="text-sm font-extrabold text-text-primary">Estatísticas de Esforço Familiar</h3>
        <p className="text-xs text-text-secondary">Métricas de contribuição, consistência e impacto da equipe</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-surface-card border border-border-default shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-text-muted">Total Concluído</span>
            <CheckCircle className="w-4 h-4 text-state-success" />
          </div>
          <p className="text-2xl font-extrabold text-text-primary">{totalCompleted}</p>
          <p className="text-[10px] text-text-muted mt-1">tarefas realizadas no ciclo</p>
        </div>

        <div className="p-5 rounded-2xl bg-surface-card border border-border-default shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-text-muted">Pontuação Geral</span>
            <Trophy className="w-4 h-4 text-brand-accent" />
          </div>
          <p className="text-2xl font-extrabold text-brand-primary">{totalPoints}</p>
          <p className="text-[10px] text-text-muted mt-1">pontos gerados em equipe</p>
        </div>

        <div className="p-5 rounded-2xl bg-surface-card border border-border-default shadow-2xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-text-muted">Média por Morador</span>
            <TrendingUp className="w-4 h-4 text-state-info" />
          </div>
          <p className="text-2xl font-extrabold text-text-primary">
            {operationalMembers.length > 0 ? Math.round(totalPoints / operationalMembers.length) : 0}
          </p>
          <p className="text-[10px] text-text-muted mt-1">pontos por membro ativo</p>
        </div>
      </div>

      {/* Member breakdown */}
      <div className="bg-surface-card rounded-2xl border border-border-default p-5 shadow-2xs">
        <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-4">
          Distribuição Individual de Tarefas
        </h4>

        <div className="space-y-4">
          {operationalMembers.map(m => {
            const memberTasksDone = tasks.filter(t => t.completedByMemberId === m.id).length;
            const percentage = totalCompleted > 0 ? Math.round((memberTasksDone / totalCompleted) * 100) : 0;
            return (
              <div key={m.id}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2">
                    <span>{m.avatar || '👤'}</span>
                    <span className="font-bold text-text-primary">{m.name}</span>
                  </div>
                  <span className="text-text-muted font-medium">{memberTasksDone} tarefas ({percentage}%)</span>
                </div>
                <div className="w-full h-2 bg-surface-subtle rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${Math.max(percentage, 5)}%`,
                      backgroundColor: m.color || '#5b32a3'
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
