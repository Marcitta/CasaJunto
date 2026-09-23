import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type AuthTab = 'login' | 'signup' | 'forgot_password';

interface AuthModalProps {
  isOpen: boolean;
  initialTab?: AuthTab;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, initialTab = 'login', onClose }) => {
  const { signIn, signUp, signInWithGoogle, resetPassword, enterDemoMode } = useAuth();

  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signIn(email, password);
      if (onClose) onClose();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signUp(email, password, displayName);
      if (onClose) onClose();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      if (onClose) onClose();
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await resetPassword(email);
      setSuccessMessage('E-mail de redefinição de senha enviado! Verifique sua caixa de entrada.');
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 pb-4 flex items-center justify-between border-b border-border-default">
          <div className="flex items-center gap-2.5">
            <img
              src="/brand/casajunto-compact.png"
              alt="CasaJunto"
              className="h-9 w-auto max-w-[75px] object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <div>
              <h2 className="text-base font-extrabold text-text-primary leading-none">
                {tab === 'login' && 'Entrar na sua conta'}
                {tab === 'signup' && 'Cadastrar no CasaJunto'}
                {tab === 'forgot_password' && 'Recuperar Senha'}
              </h2>
              <p className="text-[11px] text-text-muted mt-0.5">Harmonia e colaboração no lar</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabs */}
        {tab !== 'forgot_password' && (
          <div className="flex border-b border-border-default bg-surface-subtle">
            <button
              onClick={() => { setTab('login'); setError(null); }}
              className={`flex-1 py-2.5 text-xs font-bold transition border-b-2 cursor-pointer ${
                tab === 'login'
                  ? 'border-brand-primary text-brand-primary bg-surface-card'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => { setTab('signup'); setError(null); }}
              className={`flex-1 py-2.5 text-xs font-bold transition border-b-2 cursor-pointer ${
                tab === 'signup'
                  ? 'border-brand-primary text-brand-primary bg-surface-card'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              Criar Conta
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-state-error-soft border border-state-error/30 text-state-error text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-state-success-soft border border-state-success/30 text-state-success text-xs flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Login Form */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-text-primary">Senha</label>
                  <button
                    type="button"
                    onClick={() => { setTab('forgot_password'); setError(null); }}
                    className="text-[11px] text-brand-primary hover:underline cursor-pointer"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover transition cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          )}

          {/* Sign Up Form */}
          {tab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">Seu Nome</label>
                <div className="relative">
                  <User className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Ex: Carlos Silva"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">Senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover transition cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Cadastrando...' : 'Criar minha conta'}
              </button>
            </form>
          )}

          {/* Forgot Password Form */}
          {tab === 'forgot_password' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-xs text-text-secondary">
                Insira o e-mail da sua conta. Enviaremos um link seguro para você redefinir sua senha.
              </p>
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover transition cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>

              <button
                type="button"
                onClick={() => { setTab('login'); setError(null); }}
                className="w-full text-center text-xs font-semibold text-text-muted hover:text-text-primary cursor-pointer"
              >
                Voltar para o login
              </button>
            </form>
          )}

          {/* Google Login & Demo Mode shortcuts */}
          {tab !== 'forgot_password' && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border-default" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold text-text-muted">
                  <span className="bg-surface-card px-2">ou continue com</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-2 rounded-xl border border-border-default hover:bg-surface-subtle text-xs font-semibold text-text-primary flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z" />
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.7-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
                  <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12 0 14.5s.7 4.8 1.9 7.2l3.7-2.9z" />
                  <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 17C3.7 20.7 7.5 24 12 24z" />
                </svg>
                <span>Google</span>
              </button>

              <div className="mt-4 pt-3 border-t border-border-default text-center">
                <button
                  type="button"
                  onClick={() => {
                    enterDemoMode();
                    if (onClose) onClose();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-brand-primary hover:underline font-semibold cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Apenas testar no Modo Demonstração</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
