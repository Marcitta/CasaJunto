import React from 'react';
import { Sparkles, ArrowRight, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const DemoBanner: React.FC = () => {
  const { openAuthModal } = useApp();

  return (
    <div className="bg-brand-primary text-text-on-primary px-4 py-2 text-xs flex items-center justify-between border-b border-brand-primary-hover flex-wrap gap-2">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent-yellow shrink-0" />
        <span>
          <strong>Modo Demonstração:</strong> Você está interagindo com os dados de exemplo da Família Silva. As alterações não são salvas na nuvem.
        </span>
      </div>
      <button
        onClick={openAuthModal}
        className="px-3 py-1 rounded-lg bg-surface-card text-brand-primary font-bold text-[11px] hover:bg-surface-subtle transition cursor-pointer flex items-center gap-1 shrink-0"
      >
        <span>Criar conta para salvar seu lar</span>
        <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
};
