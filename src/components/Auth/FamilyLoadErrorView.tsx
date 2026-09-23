import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, PlayCircle, LogOut, ShieldCheck } from 'lucide-react';

interface FamilyLoadErrorViewProps {
  error?: string | null;
  onRetry?: () => Promise<void> | void;
  onEnterDemo?: () => void;
  onSignOut?: () => Promise<void> | void;
}

export const FamilyLoadErrorView: React.FC<FamilyLoadErrorViewProps> = ({
  error,
  onRetry,
  onEnterDemo,
  onSignOut
}) => {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const isQuotaError = error?.toLowerCase().includes('quota') || error?.toLowerCase().includes('resource-exhausted');

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-surface-page p-6 overflow-y-auto">
      <div className="w-full max-w-lg bg-surface-card rounded-2xl border border-border-subtle shadow-lg p-8 text-center animate-fade-in">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-2">
          {isQuotaError ? 'Limite de Cota do Banco Atingido' : 'Erro ao Carregar Família'}
        </h1>

        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          {isQuotaError ? (
            <>
              O limite diário gratuito de operações do banco de dados (Firestore) foi atingido.
              Não conseguimos carregar sua casa no momento. Seus dados não foram alterados por esta tentativa.
            </>
          ) : (
            <>
              Não foi possível sincronizar suas informações com o banco de dados no momento.
              Seus dados não foram alterados por esta tentativa. Por favor, verifique sua conexão ou tente recarregar.
            </>
          )}
        </p>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-surface-muted text-left border border-border-subtle text-xs text-text-muted font-mono break-words max-h-32 overflow-y-auto">
            <span className="font-semibold text-text-secondary block mb-1">Detalhes técnicos:</span>
            {error}
          </div>
        )}

        <div className="flex items-center justify-center gap-2 mb-8 text-xs text-amber-600 bg-amber-500/10 py-2 px-3 rounded-lg">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Seus dados não foram alterados por esta tentativa.</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-brand-primary hover:bg-brand-primary/90 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Reconectando...' : 'Tentar novamente'}
            </button>
          )}

          {onEnterDemo && (
            <button
              onClick={onEnterDemo}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-text-primary bg-surface-muted hover:bg-surface-border transition-colors border border-border-subtle"
            >
              <PlayCircle className="w-4 h-4 text-brand-primary" />
              Modo Demonstração
            </button>
          )}

          {onSignOut && (
            <button
              onClick={onSignOut}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
