import React, { useState, useEffect } from 'react';
import { KeyRound, X, Copy, Check, AlertTriangle, Trash2, Loader2, Share2, ShieldCheck, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { Member, FamilyInvitation } from '../../types';
import { FamilyInviteService } from '../../services/familyInviteService';
import { useApp } from '../../context/AppContext';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  familyId: string;
  adminMemberId: string;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  member,
  familyId,
  adminMemberId
}) => {
  const { currentMember, isDemoMode } = useApp();
  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';

  const [invite, setInvite] = useState<FamilyInvitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ title: string; subtitle: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !member || !familyId) {
      setInvite(null);
      setError(null);
      setShowRevokeConfirm(false);
      setShowRegenerateConfirm(false);
      setFeedbackMessage(null);
      return;
    }

    if (!isAdmin) {
      setInvite(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setShowRevokeConfirm(false);
    setShowRegenerateConfirm(false);
    setFeedbackMessage(null);

    const callerRole = currentMember?.role || (isDemoMode ? 'ADMIN' : undefined);
    FamilyInviteService.getOrCreateActiveInvite(familyId, member.id, adminMemberId, callerRole)
      .then((inv) => {
        if (isMounted) {
          setInvite(inv);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err?.message || 'Falha ao carregar convite.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, member, familyId, adminMemberId, isAdmin, currentMember?.role, isDemoMode]);

  if (!isOpen || !member || !isAdmin) return null;

  const isLinked = Boolean(member.userId || member.user_id);

  const handleCopy = () => {
    if (!invite?.code) return;
    navigator.clipboard.writeText(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (!invite?.code) return;
    const shareText = `Olá! Você foi convidado para participar do CasaJunto no perfil de "${member.name}". Use o código de convite: ${invite.code} para entrar na casa.`;
    if (navigator.share) {
      navigator.share({
        title: 'Convite CasaJunto',
        text: shareText
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevoke = async () => {
    if (!invite || !member) return;
    setIsRevoking(true);
    setError(null);

    try {
      const callerRole = currentMember?.role || (isDemoMode ? 'ADMIN' : undefined);
      await FamilyInviteService.revokeInvitation(familyId, member.id, callerRole);
      setShowRevokeConfirm(false);
      setInvite((prev) => prev ? { ...prev, status: 'REVOKED' } : null);
      setFeedbackMessage(null);
    } catch (err: any) {
      setError(err?.message || 'Erro ao revogar convite.');
    } finally {
      setIsRevoking(false);
    }
  };

  const handleRegenerate = async () => {
    if (!member) return;
    setIsRegenerating(true);
    setError(null);
    try {
      const callerRole = currentMember?.role || (isDemoMode ? 'ADMIN' : undefined);
      const newInv = await FamilyInviteService.regenerateInviteCode(
        familyId,
        member.id,
        adminMemberId,
        callerRole
      );
      setInvite(newInv);
      setShowRegenerateConfirm(false);
      setShowRevokeConfirm(false);
      setFeedbackMessage({
        title: 'Novo código gerado',
        subtitle: 'O código anterior não é mais válido.'
      });
    } catch (err: any) {
      setError(err?.message || 'Erro ao gerar novo código.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCreateNewInvite = async () => {
    if (!member) return;
    setIsLoading(true);
    setError(null);
    try {
      const callerRole = currentMember?.role || (isDemoMode ? 'ADMIN' : undefined);
      const newInv = await FamilyInviteService.getOrCreateActiveInvite(familyId, member.id, adminMemberId, callerRole);
      setInvite(newInv);
    } catch (err: any) {
      setError(err?.message || 'Erro ao gerar novo convite.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs font-sans">
      <div 
        className="w-full max-w-md bg-surface-card border border-border-default rounded-3xl p-6 sm:p-8 shadow-xl relative animate-in fade-in zoom-in-95 duration-150"
        id={`invite-modal-${member.id}`}
      >
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-text-muted hover:text-text-primary transition p-1.5 rounded-full hover:bg-surface-subtle cursor-pointer"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div 
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0"
            style={{ backgroundColor: `${member.color || '#5b32a3'}20`, color: member.color || '#5b32a3' }}
          >
            {member.avatar || '👤'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-text-primary">{member.name}</h3>
              {member.role === 'ADMIN' && (
                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-extrabold flex items-center gap-0.5">
                  <ShieldCheck className="w-3 h-3 text-amber-600" />
                  Admin
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary">
              {isLinked ? 'Conta de acesso já vinculada' : 'Gerenciar código de convite'}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-state-error-soft border border-state-error/20 flex items-start gap-2.5 text-state-error text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isLinked ? (
          <div className="py-6 px-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <Check className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-emerald-900">Morador já conectado</h4>
            <p className="text-xs text-emerald-700">
              {member.name} já vinculou sua conta pessoal a este perfil no CasaJunto.
            </p>
            {member.email && (
              <p className="text-[11px] font-mono text-emerald-800 bg-emerald-100/60 py-1 px-3 rounded-lg inline-block">
                {member.email}
              </p>
            )}
          </div>
        ) : isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-text-muted gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
            <span className="text-xs font-semibold">Gerando código de convite...</span>
          </div>
        ) : invite?.status === 'REVOKED' ? (
          <div className="py-6 px-4 rounded-2xl bg-surface-subtle border border-border-default text-center space-y-3">
            <h4 className="text-sm font-bold text-text-primary">Convite revogado</h4>
            <p className="text-xs text-text-secondary">
              O convite anterior foi cancelado. Você pode gerar um novo código a qualquer momento.
            </p>
            <button
              onClick={handleCreateNewInvite}
              className="px-4 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold hover:bg-brand-primary-hover transition cursor-pointer"
            >
              Gerar novo convite
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {feedbackMessage && (
              <div 
                className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-2.5 text-emerald-800 text-xs animate-in fade-in"
                id="regenerate-feedback-banner"
              >
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h5 className="font-bold text-emerald-900">{feedbackMessage.title}</h5>
                  <p className="text-[11px] text-emerald-700">{feedbackMessage.subtitle}</p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1.5 uppercase tracking-wider">
                Código de Acesso
              </label>
              <div className="p-4 rounded-2xl bg-surface-page border border-border-default flex items-center justify-between gap-3">
                <span className="font-mono text-xl sm:text-2xl font-black text-brand-primary tracking-widest select-all" id="invite-code-display">
                  {invite?.code}
                </span>
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 rounded-xl bg-brand-primary-soft hover:bg-brand-primary-soft/80 text-brand-primary text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  id="btn-copy-invite-code"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-state-success" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-text-muted px-1">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Válido até: {invite?.expiresAt ? new Date(invite.expiresAt).toLocaleDateString('pt-BR') : '7 dias'}
              </span>
              <button
                onClick={handleShare}
                className="text-brand-primary hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                <Share2 className="w-3 h-3" />
                <span>Compartilhar</span>
              </button>
            </div>

            {/* Ação: Gerar novo código com Confirmação Canônica */}
            {!showRegenerateConfirm ? (
              <button
                onClick={() => {
                  setShowRegenerateConfirm(true);
                  setShowRevokeConfirm(false);
                  setFeedbackMessage(null);
                }}
                className="w-full py-2.5 px-4 rounded-2xl border border-border-default hover:bg-surface-subtle text-xs font-bold text-text-primary flex items-center justify-center gap-2 transition cursor-pointer"
                id="btn-regenerate-invite-code"
              >
                <RefreshCw className="w-3.5 h-3.5 text-brand-primary" />
                <span>Gerar novo código</span>
              </button>
            ) : (
              <div 
                className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-3 animate-in fade-in"
                id="confirm-regenerate-container"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-text-primary">Gerar um novo código?</h5>
                    <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                      O código atual deixará de funcionar. Se você já o enviou para {member.name}, será necessário enviar o novo código.
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    onClick={() => setShowRegenerateConfirm(false)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-text-muted hover:text-text-primary cursor-pointer transition"
                    id="btn-cancel-regenerate"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="px-3.5 py-1.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                    id="btn-confirm-regenerate"
                  >
                    {isRegenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span>{isRegenerating ? 'Gerando...' : 'Gerar novo código'}</span>
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-text-secondary leading-relaxed bg-surface-subtle p-3 rounded-xl">
              Envie este código para <span className="font-bold text-text-primary">{member.name}</span>. Ao entrar com a conta própria no CasaJunto e informar o código, ela será vinculada a este perfil mantendo todo o histórico.
            </p>

            {/* Ações de Revogação */}
            <div className="pt-3 border-t border-border-default">
              {showRevokeConfirm ? (
                <div className="p-3 rounded-xl bg-state-error-soft/60 border border-state-error/20 space-y-2">
                  <p className="text-xs text-state-error font-medium">
                    Tem certeza que deseja revogar este convite? O código atual deixará de funcionar.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setShowRevokeConfirm(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      Não revogar
                    </button>
                    <button
                      onClick={handleRevoke}
                      disabled={isRevoking}
                      className="px-3 py-1.5 rounded-lg bg-state-error text-white text-xs font-bold hover:bg-state-error/90 transition cursor-pointer flex items-center gap-1"
                    >
                      {isRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      <span>Sim, revogar</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setShowRevokeConfirm(true)}
                    className="text-xs text-text-muted hover:text-state-error transition flex items-center gap-1 cursor-pointer"
                    id="btn-revoke-invite"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Revogar convite</span>
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-surface-subtle hover:bg-surface-subtle/80 text-xs font-bold text-text-primary cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
