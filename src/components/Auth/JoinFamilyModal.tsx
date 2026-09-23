import React, { useState } from 'react';
import { KeyRound, X, CheckCircle2, AlertTriangle, ArrowRight, Loader2, Home, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { FamilyInviteService, InvitePreview } from '../../services/familyInviteService';

interface JoinFamilyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const JoinFamilyModal: React.FC<JoinFamilyModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const { currentUser, refreshUserMemberships } = useAuth();
  const [code, setCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleValidateCode = async () => {
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setError('Por favor, informe o código do convite.');
      return;
    }

    console.log(`[DIAGNOSTIC] UI_EVENT | handleValidateCode | STARTED for code: ${clean}`);
    setError(null);
    setPreview(null);
    setIsValidating(true);

    try {
      const res = await FamilyInviteService.getInvitationPreview(clean);
      if (!res) {
        console.log(`[DIAGNOSTIC] UI_EVENT | handleValidateCode | PREVIEW_NULL`);
        setError('Convite não encontrado. Verifique se o código foi digitado corretamente.');
        setPreview(null);
      } else if (res.isLegacyIncompatible) {
        console.log(`[DIAGNOSTIC] UI_EVENT | handleValidateCode | LEGACY_INCOMPATIBLE: ${res.legacyReason}`);
        setError(res.legacyReason || 'Este convite foi gerado em uma versão anterior do CasaJunto. Peça ao administrador da casa para gerar um novo convite.');
        setPreview(null);
      } else if (res.isExpired) {
        console.log(`[DIAGNOSTIC] UI_EVENT | handleValidateCode | EXPIRED`);
        setError('Este convite expirou. Solicite um novo convite ao administrador da casa.');
        setPreview(res);
      } else if (res.isRevoked) {
        console.log(`[DIAGNOSTIC] UI_EVENT | handleValidateCode | REVOKED`);
        setError('Este convite foi revogado pelo administrador.');
        setPreview(res);
      } else if (res.isAccepted) {
        console.log(`[DIAGNOSTIC] UI_EVENT | handleValidateCode | ACCEPTED`);
        setError('Este convite já foi utilizado.');
        setPreview(res);
      } else if (!res.isValid) {
        console.log(`[DIAGNOSTIC] UI_EVENT | handleValidateCode | INVALID`);
        setError('Este convite não é válido.');
        setPreview(null);
      } else {
        console.log(`[DIAGNOSTIC] UI_EVENT | handleValidateCode | PREVIEW_VALID: ${res.familyName} / ${res.targetMemberName}`);
        setError(null);
        setPreview(res);
      }
    } catch (err: any) {
      console.log(`[DIAGNOSTIC] UI_EVENT | handleValidateCode | ERROR: ${err?.message}`);
      setError(err?.message || 'Erro ao validar convite.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleAccept = async () => {
    if (!currentUser) {
      setError('Você precisa estar autenticado para entrar em uma casa.');
      return;
    }

    console.log(`[DIAGNOSTIC] UI_EVENT | handleAccept | STARTED for code: ${code}`);
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await FamilyInviteService.acceptInvitation(code, currentUser);
      console.log(`[DIAGNOSTIC] UI_EVENT | handleAccept | SUCCESS: familyId=${res.familyId}`);
      if (currentUser.id && res.familyId) {
        localStorage.setItem(`casajunto_last_family_${currentUser.id}`, res.familyId);
      }
      await refreshUserMemberships();
      setSuccess('Você agora faz parte desta casa!');
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.log(`[DIAGNOSTIC] UI_EVENT | handleAccept | ERROR: ${err?.code} - ${err?.message}`);
      setError(err?.message || 'Falha ao aceitar convite.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setCode('');
    setPreview(null);
    setError(null);
    setSuccess(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
      <div 
        className="w-full max-w-md bg-surface-card border border-border-default rounded-3xl p-6 sm:p-8 shadow-xl relative animate-in fade-in zoom-in-95 duration-150"
        id="join-family-modal"
      >
        <button
          onClick={handleReset}
          className="absolute top-5 right-5 text-text-muted hover:text-text-primary transition p-1.5 rounded-full hover:bg-surface-subtle cursor-pointer"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary-soft text-brand-primary flex items-center justify-center shrink-0">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">Entrar em uma casa</h3>
            <p className="text-xs text-text-secondary">Digite o código de convite enviado pelo administrador.</p>
          </div>
        </div>

        {/* Input de Código */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1.5 uppercase tracking-wider">
              Código de Convite
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setError(null);
                  setPreview(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !preview) {
                    handleValidateCode();
                  }
                }}
                placeholder="Ex: CJ-A92B-K8L3"
                className="flex-1 px-4 py-3 rounded-xl border border-border-default bg-surface-page text-text-primary font-mono text-center tracking-wider text-sm font-bold uppercase placeholder:font-sans placeholder:normal-case placeholder:tracking-normal focus:outline-hidden focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                id="input-join-invite-code"
              />
              <button
                type="button"
                onClick={handleValidateCode}
                disabled={isValidating || !code.trim() || isSubmitting}
                className="px-4 py-3 rounded-xl bg-brand-primary-soft hover:bg-brand-primary-soft/80 text-brand-primary text-xs font-bold transition disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
                id="btn-validate-invite-code"
              >
                {isValidating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Verificar</span>
                )}
              </button>
            </div>
          </div>

          {/* Feedback de Erro */}
          {error && (
            <div className="p-3.5 rounded-xl bg-state-error-soft border border-state-error/20 flex items-start gap-2.5 text-state-error text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Feedback de Sucesso */}
          {success && (
            <div className="p-3.5 rounded-xl bg-state-success-soft border border-state-success/20 flex items-center gap-2.5 text-state-success text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Preview do Convite Válido */}
          {preview && preview.isValid && !success && (
            <div className="p-4 rounded-2xl bg-brand-primary-soft/40 border border-brand-primary/20 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                  <Home className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-brand-primary uppercase tracking-wider">Casa encontrada</span>
                  <h4 className="text-sm font-extrabold text-text-primary">{preview.familyName}</h4>
                </div>
              </div>

              <div className="pt-2 border-t border-brand-primary/10 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-text-secondary">
                  <User className="w-3.5 h-3.5 text-brand-primary" />
                  <span>Você entrará como</span>
                </div>
                <span className="font-bold text-text-primary">{preview.targetMemberName}</span>
              </div>
            </div>
          )}

          {/* Ações */}
          <div className="pt-2 flex flex-col gap-2">
            {preview && preview.isValid && !success ? (
              <button
                type="button"
                onClick={handleAccept}
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-text-on-primary text-sm font-bold shadow-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                id="btn-confirm-accept-invite"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Entrando na casa...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar e Entrar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleReset}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-text-muted hover:text-text-primary transition cursor-pointer text-center"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
