import React from 'react';
import { Home, Sparkles, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const OnboardingWizard: React.FC = () => {
  const { isOnboarding, setIsOnboarding } = useApp();

  if (!isOnboarding) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden p-6 space-y-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-brand-primary-soft text-brand-primary flex items-center justify-center mx-auto">
          <Sparkles className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-text-primary">Boas-vindas à sua nova casa!</h3>
        <p className="text-xs text-text-secondary leading-relaxed">
          O CasaJunto foi projetado para eliminar o estresse da organização doméstica. Vamos começar definindo os primeiros cômodos e tarefas!
        </p>

        <button
          onClick={() => setIsOnboarding(false)}
          className="w-full py-2.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover cursor-pointer transition"
        >
          Começar a Explorar
        </button>
      </div>
    </div>
  );
};
