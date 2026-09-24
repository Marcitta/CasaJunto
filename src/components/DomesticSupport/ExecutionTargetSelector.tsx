import React, { useEffect } from 'react';
import { AlertCircle, Plus, ChevronRight } from 'lucide-react';
import { ExecutionTarget, DomesticSupport } from '../../types';

export interface ExecutionTargetSelectorProps {
  executionTarget: ExecutionTarget;
  domesticSupportId: string | null;
  onChange: (target: ExecutionTarget, supportId: string | null) => void;
  activeSupports: DomesticSupport[];
  onOpenDomesticSupport?: () => void;
  disabled?: boolean;
}

function getSupportLabel(s: DomesticSupport): string {
  const typeLabel = s.type === 'CLEANER' ? 'Diarista' : (s.type || 'Diarista');
  return `${s.name} — ${typeLabel}`;
}

export const ExecutionTargetSelector: React.FC<ExecutionTargetSelectorProps> = ({
  executionTarget,
  domesticSupportId,
  onChange,
  activeSupports,
  onOpenDomesticSupport,
  disabled = false
}) => {
  // Auto-seleção se houver apenas 1 ajuda externa ativa e estiver em EXTERNAL_SUPPORT
  useEffect(() => {
    if (executionTarget === 'EXTERNAL_SUPPORT' && !domesticSupportId && activeSupports.length === 1) {
      onChange('EXTERNAL_SUPPORT', activeSupports[0].id);
    }
  }, [executionTarget, domesticSupportId, activeSupports, onChange]);

  const handleSelectOption = (target: ExecutionTarget) => {
    if (disabled) return;
    if (target === 'HOUSEHOLD') {
      onChange('HOUSEHOLD', null);
    } else if (target === 'EXTERNAL_SUPPORT') {
      if (activeSupports.length === 1) {
        onChange('EXTERNAL_SUPPORT', activeSupports[0].id);
      } else if (domesticSupportId && activeSupports.some(s => s.id === domesticSupportId)) {
        onChange('EXTERNAL_SUPPORT', domesticSupportId);
      } else {
        onChange('EXTERNAL_SUPPORT', null);
      }
    } else if (target === 'FLEXIBLE') {
      if (domesticSupportId && activeSupports.some(s => s.id === domesticSupportId)) {
        onChange('FLEXIBLE', domesticSupportId);
      } else {
        onChange('FLEXIBLE', null);
      }
    }
  };

  const options: Array<{
    target: ExecutionTarget;
    icon: string;
    title: string;
    description: string;
  }> = [
    {
      target: 'HOUSEHOLD',
      icon: '👨‍👩‍👧‍👦',
      title: 'Pessoas da casa',
      description: 'A tarefa faz parte da divisão entre os moradores.'
    },
    {
      target: 'EXTERNAL_SUPPORT',
      icon: '🧹',
      title: 'Ajuda externa',
      description: 'A tarefa fica reservada para alguém que ajuda na casa.'
    },
    {
      target: 'FLEXIBLE',
      icon: '🔄',
      title: 'Pode ser qualquer um',
      description: 'Normalmente pode ser feita pelos moradores ou pela ajuda externa.'
    }
  ];

  return (
    <div className="space-y-3 pt-1">
      <div>
        <label className="block text-xs font-bold text-text-secondary mb-1">
          Quem normalmente faz esta tarefa?
        </label>
        <p className="text-[11px] text-text-muted">
          Defina se esta rotina é dividida entre os moradores ou realizada por ajuda externa.
        </p>
      </div>

      {/* Grid com as 3 opções canônicas */}
      <div className="grid grid-cols-1 gap-2">
        {options.map(opt => {
          const isSelected = executionTarget === opt.target;
          return (
            <button
              key={opt.target}
              type="button"
              disabled={disabled}
              onClick={() => handleSelectOption(opt.target)}
              className={`w-full min-h-[52px] p-3 rounded-2xl border text-left flex items-start gap-3 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected
                  ? 'border-brand-primary bg-brand-primary-soft/40 shadow-xs ring-1 ring-brand-primary/20'
                  : 'border-border-default bg-surface-card hover:bg-surface-subtle hover:border-border-hover'
              }`}
            >
              <span className="text-xl shrink-0 select-none" aria-hidden="true">
                {opt.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isSelected ? 'text-brand-primary' : 'text-text-primary'}`}>
                    {opt.title}
                  </span>
                  <span
                    className={`w-4 h-4 rounded-full border flex items-center justify-center transition shrink-0 ${
                      isSelected ? 'border-brand-primary bg-brand-primary' : 'border-border-default bg-surface-card'
                    }`}
                  >
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
                <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                  {opt.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bloco contextual para EXTERNAL_SUPPORT */}
      {executionTarget === 'EXTERNAL_SUPPORT' && (
        <div className="p-3.5 rounded-2xl bg-surface-subtle border border-border-default space-y-2 animate-in fade-in duration-150">
          {activeSupports.length === 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-start gap-2 text-state-warning text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">
                  Você ainda não tem uma ajuda externa ativa cadastrada.
                </span>
              </div>
              {onOpenDomesticSupport && (
                <button
                  type="button"
                  onClick={onOpenDomesticSupport}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-brand-primary-soft hover:bg-brand-primary/15 text-brand-primary text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Cadastrar ajuda externa</span>
                  <ChevronRight className="w-3.5 h-3.5 ml-auto text-brand-primary/60" />
                </button>
              )}
            </div>
          ) : (
            <div>
              <label htmlFor="select-external-support" className="block text-xs font-bold text-text-secondary mb-1">
                Quem normalmente faz?
              </label>
              <select
                id="select-external-support"
                value={domesticSupportId || ''}
                disabled={disabled}
                onChange={e => onChange('EXTERNAL_SUPPORT', e.target.value || null)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-card disabled:opacity-50"
              >
                {activeSupports.length > 1 && (
                  <option value="">Selecione quem fará a tarefa</option>
                )}
                {activeSupports.map(s => (
                  <option key={s.id} value={s.id}>
                    {getSupportLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Bloco contextual para FLEXIBLE */}
      {executionTarget === 'FLEXIBLE' && (
        <div className="p-3.5 rounded-2xl bg-surface-subtle border border-border-default space-y-1.5 animate-in fade-in duration-150">
          <label htmlFor="select-flexible-support" className="block text-xs font-bold text-text-secondary mb-1">
            Ajuda externa preferencial — opcional
          </label>
          <select
            id="select-flexible-support"
            value={domesticSupportId || ''}
            disabled={disabled}
            onChange={e => onChange('FLEXIBLE', e.target.value || null)}
            className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-border-default text-xs font-semibold text-text-primary focus:outline-none focus:border-brand-primary bg-surface-card disabled:opacity-50"
          >
            <option value="">Nenhuma preferência</option>
            {activeSupports.map(s => (
              <option key={s.id} value={s.id}>
                {getSupportLabel(s)}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-text-muted">
            Se informada, esta preferência poderá ser considerada na organização da rotina.
          </p>
        </div>
      )}
    </div>
  );
};
