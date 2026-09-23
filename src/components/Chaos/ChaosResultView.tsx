import React from 'react';
import { Sparkles, X, CheckCircle2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { ChaosSession, Member } from '../../types';

interface ChaosResultViewProps {
  session: ChaosSession;
  members: Member[];
  onClose: () => void;
}

export const ChaosResultView: React.FC<ChaosResultViewProps> = ({
  session,
  members,
  onClose
}) => {
  React.useEffect(() => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch {
      // Ignora em ambientes sem canvas
    }
  }, []);

  const summary = session.summary;
  const totalTasks = summary?.totalTasks ?? (session.selectedTaskIds?.length || 0);
  const completedCount = summary?.completedCount ?? 0;
  const durationMinutes = summary?.durationMinutes ?? session.totalDurationMinutes ?? 30;
  const participantsCount = summary?.participantsCount ?? session.participantMemberIds?.length ?? 0;

  const allParticipantIds = Array.from(new Set([
    ...(session.participantMemberIds || []),
    ...(session.lateParticipantMemberIds || [])
  ]));

  const participantMembers = allParticipantIds
    .map(id => members.find(m => m.id === id))
    .filter(Boolean) as Member[];

  // Ordenação NÃO competitiva (por ordem alfabética de nome)
  participantMembers.sort((a, b) => a.name.localeCompare(b.name));

  const bonusRecipients = new Set(session.bonusAwardedMemberIds || []);

  return (
    <div className="space-y-6" id="chaos-result-view">
      {/* Header Comemorativo */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 text-2xl mb-1 shadow-xs border border-amber-500/20">
          🔥
        </div>
        <h2 className="text-2xl font-black text-text-primary tracking-tight">
          Caos controlado!
        </h2>
        <p className="text-xs font-semibold text-text-secondary max-w-sm mx-auto">
          {completedCount} de {totalTasks} tarefas concluídas · {durationMinutes} minutos · {participantsCount} participantes
        </p>
      </div>

      {/* Participação dos moradores (Sem ranking / Sem vencedor) */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted px-1">
          Participação da Força-Tarefa
        </h3>

        <div className="space-y-2">
          {participantMembers.map(member => {
            const hasBonus = bonusRecipients.has(member.id);
            const memberTasksCount = summary?.tasksCompletedByMemberId?.[member.id] || 0;

            return (
              <div
                key={member.id}
                id={`chaos-result-member-${member.id}`}
                className="flex items-center justify-between p-3 rounded-2xl bg-surface-subtle border border-border-default hover:border-brand-primary/30 transition"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shadow-2xs"
                    style={{
                      backgroundColor: `${member.color || '#f59e0b'}25`,
                      color: member.color || '#f59e0b'
                    }}
                  >
                    {member.avatar || '👤'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary leading-tight">
                      {member.name}
                    </p>
                    <p className="text-xs text-text-muted">
                      {memberTasksCount} {memberTasksCount === 1 ? 'tarefa' : 'tarefas'}
                    </p>
                  </div>
                </div>

                {hasBonus ? (
                  <span
                    id={`chaos-bonus-badge-${member.id}`}
                    className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 flex items-center gap-1 shrink-0"
                  >
                    <Sparkles className="w-3 h-3" />
                    +5 bônus Caos
                  </span>
                ) : (
                  <span className="text-xs text-text-muted font-medium shrink-0">
                    0 tarefas
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Botão de Fechamento */}
      <div className="pt-2">
        <button
          id="chaos-result-close-btn"
          onClick={onClose}
          className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-brand-primary text-text-on-primary font-bold text-sm shadow-xs hover:bg-brand-primary-hover active:scale-[0.99] transition cursor-pointer flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Concluir</span>
        </button>
      </div>
    </div>
  );
};
