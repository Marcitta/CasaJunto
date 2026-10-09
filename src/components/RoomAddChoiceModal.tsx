import React, { useEffect } from 'react';
import { X, Sparkles, SlidersHorizontal, ArrowRight } from 'lucide-react';

export interface RoomAddChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustom: () => void;
  onSelectPreset: () => void;
}

export const RoomAddChoiceModal: React.FC<RoomAddChoiceModalProps> = ({
  isOpen,
  onClose,
  onSelectCustom,
  onSelectPreset
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-add-room-choice-title"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-card border border-border-default rounded-2xl w-full max-w-md overflow-hidden shadow-xl animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-default">
          <div>
            <h2
              id="modal-add-room-choice-title"
              className="text-base font-bold text-text-primary tracking-tight"
            >
              Adicionar ambiente
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Escolha a melhor forma de cadastrar cômodos na sua casa
            </p>
          </div>
          <button
            id="btn-close-room-choice"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="p-5 space-y-3">
          {/* Opção 1: Criar ambiente personalizado */}
          <button
            id="btn-choice-custom-room"
            type="button"
            onClick={() => {
              onClose();
              onSelectCustom();
            }}
            className="w-full text-left p-4 rounded-xl border border-border-default bg-surface-card hover:bg-surface-subtle hover:border-brand-primary/50 transition duration-150 flex items-start gap-3.5 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-subtle group-hover:bg-brand-primary-soft text-text-secondary group-hover:text-brand-primary flex items-center justify-center shrink-0 transition-colors">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-text-primary group-hover:text-brand-primary transition-colors">
                  Criar ambiente personalizado
                </span>
                <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                Cadastre um cômodo do seu jeito, escolhendo nome e categoria.
              </p>
            </div>
          </button>

          {/* Opção 2: Adicionar da lista modelo */}
          <button
            id="btn-choice-preset-rooms"
            type="button"
            onClick={() => {
              onClose();
              onSelectPreset();
            }}
            className="w-full text-left p-4 rounded-xl border border-brand-primary/30 bg-brand-primary-soft/30 hover:bg-brand-primary-soft/60 hover:border-brand-primary transition duration-150 flex items-start gap-3.5 group cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/40 relative overflow-hidden"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-primary text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-text-primary group-hover:text-brand-primary transition-colors">
                    Adicionar da lista modelo
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-brand-primary text-white">
                    15 opções
                  </span>
                </div>
                <ArrowRight className="w-4 h-4 text-brand-primary group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                Escolha entre ambientes sugeridos para sua casa. Adicione apenas os que desejar.
              </p>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-default bg-surface-subtle/40 flex items-center justify-end">
          <button
            id="btn-cancel-room-choice"
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
