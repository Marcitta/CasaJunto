import React from 'react';
import { Home, Sparkles, Users, ArrowRight, CheckCircle2, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface WelcomeScreenProps {
  onOpenLogin: () => void;
  onOpenSignUp: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onOpenLogin, onOpenSignUp }) => {
  const { enterDemoMode } = useAuth();

  return (
    <div className="w-screen h-screen bg-surface-page text-text-primary flex flex-col justify-between overflow-y-auto font-sans p-6 sm:p-12">
      {/* Top Action Bar */}
      <div className="max-w-5xl mx-auto w-full flex items-center justify-end pb-4 sm:pb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenLogin}
            className="px-4 py-2 rounded-xl text-xs font-bold text-brand-primary hover:bg-brand-primary-soft transition cursor-pointer"
          >
            Entrar
          </button>
          <button
            onClick={onOpenSignUp}
            className="px-4 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-sm hover:bg-brand-primary-hover transition cursor-pointer"
          >
            Criar Conta
          </button>
        </div>
      </div>

      {/* Main Hero & 3 Pathways */}
      <div className="max-w-4xl mx-auto w-full py-4 text-center">
        {/* Large Prominent Official Logo */}
        <div className="flex justify-center mb-6 sm:mb-8">
          <img
            src="/brand/casajunto-logo.png"
            alt="CasaJunto"
            className="w-[88vw] max-w-[340px] sm:max-w-[500px] md:max-w-[580px] lg:max-w-[640px] h-auto object-contain mx-auto"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-primary-soft text-brand-primary border border-brand-primary/15 text-xs font-semibold mb-4">
          <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
          <span>Organização doméstica sem estresse ou cobranças</span>
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary tracking-tight max-w-2xl mx-auto leading-tight mb-4">
          Sua casa funcionando em equipe com transparência e leveza
        </h2>
        <p className="text-sm sm:text-base text-text-secondary max-w-xl mx-auto mb-10">
          Distribuição justa de tarefas, rotinas transparentes para todos os moradores e celebração das pequenas conquistas cotidianas.
        </p>

        {/* 3 Entry Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left max-w-4xl mx-auto">
          {/* Card 1: Entrar no Lar */}
          <div 
            onClick={onOpenLogin}
            className="p-6 rounded-2xl bg-surface-card border border-border-default shadow-xs hover:border-brand-primary transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-surface-subtle flex items-center justify-center text-brand-primary mb-4 group-hover:bg-brand-primary group-hover:text-text-on-primary transition">
                <Home className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text-primary mb-1">Entrar na minha casa</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Já possui cadastro ou foi convidado por alguém da sua família? Acesse seu lar.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-brand-primary group-hover:translate-x-1 transition-transform">
              <span>Acessar conta</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card 2: Criar Casa (Destaque) */}
          <div 
            onClick={onOpenSignUp}
            className="p-6 rounded-2xl bg-brand-primary text-text-on-primary border border-brand-primary-hover shadow-md hover:shadow-lg transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white mb-4">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Criar minha casa</h3>
              <p className="text-xs text-white/80 leading-relaxed">
                Comece um novo lar do zero, convide parceiro(a), filhos ou colegas e distribua as rotinas.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-white group-hover:translate-x-1 transition-transform">
              <span>Cadastrar e Começar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Card 3: Modo Demo */}
          <div 
            onClick={enterDemoMode}
            className="p-6 rounded-2xl bg-surface-subtle border border-border-default shadow-xs hover:border-brand-secondary/40 transition cursor-pointer flex flex-col justify-between group"
          >
            <div>
              <div className="w-10 h-10 rounded-xl bg-surface-card flex items-center justify-center text-brand-secondary mb-4 group-hover:bg-brand-secondary group-hover:text-white transition">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-text-primary mb-1">Experimentar demonstração</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Explore instantaneamente a Família Silva pré-configurada sem precisar criar conta.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-brand-secondary group-hover:translate-x-1 transition-transform">
              <span>Testar sem compromisso</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Footer Features */}
      <div className="max-w-4xl mx-auto w-full pt-8 border-t border-border-default flex flex-wrap items-center justify-center gap-6 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-brand-primary" /> Sem planilhas confusas
        </span>
        <span className="flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-brand-primary" /> Dados isolados por família
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-brand-accent" /> Modo Caos para colocar a casa em ordem
        </span>
      </div>
    </div>
  );
};
