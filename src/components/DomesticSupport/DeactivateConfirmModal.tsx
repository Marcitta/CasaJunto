import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { DomesticSupport } from '../../types';

interface DeactivateConfirmModalProps {
  isOpen: boolean;
  support: DomesticSupport | null;
  onClose: () => void;
  onConfirm: (supportId: string) => Promise<void>;
}

export const DeactivateConfirmModal: React.FC<DeactivateConfirmModalProps> = ({
  isOpen,
  support,
  onClose,
  onConfirm
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !support) return null;

  const handleDeactivate = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(support.id);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao desativar. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-confirm-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="bg-surface-card border border-border-default rounded-3xl w-full max-w-md shadow-xl overflow-hidden p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-state-warning-soft text-state-warning flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 id="deactivate-confirm-title" className="text-base font-extrabold text-text-primary">
              Desativar {support.name}?
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Confirmação de alteração de status
            </p>
          </div>
        </div>

        <p className="text-xs text-text-secondary leading-relaxed bg-surface-subtle p-3.5 rounded-2xl border border-border-default">
          Ela deixará de aparecer como ajuda ativa da casa. O histórico será preservado.
        </p>

        {errorMessage && (
          <div className="text-xs text-state-danger bg-state-danger-soft p-3 rounded-xl border border-state-danger/30">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-border-default text-xs font-bold text-text-secondary hover:bg-surface-subtle transition cursor-pointer min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            id="btn-confirm-deactivate-support"
            onClick={handleDeactivate}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl bg-state-danger text-white hover:bg-state-danger/90 text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer min-h-[44px] disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Desativando...</span>
              </>
            ) : (
              <span>Desativar</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
