import React, { useState, useEffect } from 'react';
import { Home, Plus, KeyRound, Sparkles, LogOut, ArrowRight, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { executeControlledTenantRepair, TARGET_FAMILY_ID } from '../../application/services/ControlledTenantRepairService';

interface NoFamilyViewProps {
  onOpenCreateFamily: () => void;
  onOpenJoinFamily: () => void;
  onEnterDemo: () => void;
}

export const NoFamilyView: React.FC<NoFamilyViewProps> = ({
  onOpenCreateFamily,
  onOpenJoinFamily,
  onEnterDemo
}) => {
  const { currentUser, signOut, refreshUserMemberships } = useAuth();
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairSuccess, setRepairSuccess] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);

  const savedKey = currentUser ? `casajunto_last_family_${currentUser.id}` : null;
  const savedFamilyId = savedKey ? localStorage.getItem(savedKey) : null;
  const isTargetTenantUser = savedFamilyId === TARGET_FAMILY_ID || (currentUser?.email && currentUser.email.toLowerCase().includes('croce'));

  const handleControlledRepair = async () => {
    if (!currentUser) return;
    setIsRepairing(true);
    setRepairError(null);
    try {
      const res = await executeControlledTenantRepair(
        currentUser.id,
        currentUser.displayName || 'Fernanda Croce',
        currentUser.email || ''
      );

      if (res.success) {
        setRepairSuccess(true);
        if (refreshUserMemberships) {
          await refreshUserMemberships();
        }
      } else {
        setRepairError('Não foi possível verificar a persistência dos documentos canônicos.');
      }
    } catch (err: any) {
      console.error('Erro no Controlled Repair:', err);
      setRepairError(err?.message || 'Falha ao restaurar tenant Casa Croce.');
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <div className="w-screen min-h-screen bg-surface-canvas text-text-primary flex flex-col items-center justify-center p-6 font-sans overflow-y-auto">
      <div className="max-w-md w-full bg-surface-card border border-border-default rounded-3xl p-8 shadow-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand-primary-soft border border-brand-primary/20 flex items-center justify-center text-brand-primary mx-auto mb-5">
          <Home className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-extrabold text-text-primary mb-1">
          Bem-vindo ao CasaJunto{currentUser?.displayName ? `, ${currentUser.displayName}` : ''}
        </h2>
        <p className="text-xs text-text-secondary mb-6">
          O que você quer fazer?
        </p>

        {isTargetTenantUser && (
          <div className="mb-6 p-4 rounded-2xl bg-brand-primary-soft/40 border border-brand-primary/30 text-left">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-primary text-text-on-primary flex items-center justify-center shrink-0 mt-0.5">
                <Home className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-text-primary">
                  Casa Croce detectada
                </h4>
                <p className="text-xs text-text-secondary mt-0.5">
                  Seus dados operacionais (tarefas, cômodos, rotinas) foram identificados e estão prontos para reconexão.
                </p>
                {repairError && (
                  <div className="mt-2 text-xs text-state-error flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>{repairError}</span>
                  </div>
                )}
                {repairSuccess ? (
                  <div className="mt-3 text-xs font-semibold text-state-success flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Casa Croce restaurada! Conectando...</span>
                  </div>
                ) : (
                  <button
                    onClick={handleControlledRepair}
                    disabled={isRepairing}
                    className="mt-3 w-full py-2.5 px-4 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-text-on-primary text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                    id="btn-restore-casa-croce"
                  >
                    {isRepairing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Restaurando atomicamente...</span>
                      </>
                    ) : (
                      <>
                        <span>Restaurar e Entrar na Casa Croce</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3 mb-6 text-left">
          {/* Opção 1: Criar minha casa */}
          <button
            onClick={onOpenCreateFamily}
            className="w-full p-4 rounded-2xl border border-border-default hover:border-brand-primary bg-surface-page hover:bg-brand-primary-soft/30 transition flex items-center justify-between group cursor-pointer"
            id="btn-choice-create-family"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-brand-primary text-text-on-primary flex items-center justify-center shrink-0">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text-primary group-hover:text-brand-primary transition">
                  Criar minha casa
                </h4>
                <p className="text-[11px] text-text-secondary">
                  Comece uma nova organização familiar.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-brand-primary group-hover:translate-x-0.5 transition shrink-0" />
          </button>

          {/* Opção 2: Entrar em uma casa */}
          <button
            onClick={onOpenJoinFamily}
            className="w-full p-4 rounded-2xl border border-border-default hover:border-brand-primary bg-surface-page hover:bg-brand-primary-soft/30 transition flex items-center justify-between group cursor-pointer"
            id="btn-choice-join-family"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-brand-primary-soft text-brand-primary flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-text-primary group-hover:text-brand-primary transition">
                  Entrar em uma casa
                </h4>
                <p className="text-[11px] text-text-secondary">
                  Use um convite enviado por alguém da sua casa.
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-brand-primary group-hover:translate-x-0.5 transition shrink-0" />
          </button>

          {/* Opção 3: Experimentar demonstração */}
          <button
            onClick={onEnterDemo}
            className="w-full p-3.5 rounded-2xl border border-dashed border-border-default hover:border-brand-secondary/60 bg-surface-subtle/50 hover:bg-brand-secondary-soft/30 transition flex items-center justify-between group cursor-pointer"
            id="btn-choice-enter-demo"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-secondary-soft text-brand-secondary flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-text-primary group-hover:text-brand-secondary transition">
                  Experimentar demonstração
                </h4>
                <p className="text-[10px] text-text-muted">
                  Explore com dados pré-configurados.
                </p>
              </div>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-text-muted group-hover:text-brand-secondary group-hover:translate-x-0.5 transition shrink-0" />
          </button>
        </div>

        <button
          onClick={() => signOut()}
          className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-text-muted hover:text-state-error hover:bg-state-error-soft flex items-center justify-center gap-1.5 transition cursor-pointer"
          id="btn-choice-sign-out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Encerrar sessão</span>
        </button>
      </div>
    </div>
  );
};
