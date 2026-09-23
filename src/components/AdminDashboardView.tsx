import React from 'react';
import { ShieldCheck, Users, SlidersHorizontal, Settings, Key, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export const AdminDashboardView: React.FC = () => {
  const { family, members, activeMembers, setIsRebalanceModalOpen } = useApp();
  const { currentMembership, isDemoMode } = useAuth();

  const operationalMembers = activeMembers && activeMembers.length > 0 ? activeMembers : members.filter(m => m.active !== false);
  const admins = operationalMembers.filter(m => m.role === 'ADMIN');
  const nonAdmins = operationalMembers.filter(m => m.role === 'MEMBER');

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h3 className="text-sm font-extrabold text-text-primary">Painel de Gestão e Governança</h3>
        <p className="text-xs text-text-secondary">Controles centrais do lar e políticas de moderação</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Informações da Residência */}
        <div className="p-5 rounded-2xl bg-surface-card border border-border-default shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-brand-primary">
            <Key className="w-4 h-4" />
            <span>Código de Convite da Casa</span>
          </div>
          <div className="p-3 rounded-xl bg-surface-subtle border border-border-default flex items-center justify-between">
            <span className="text-sm font-mono font-bold tracking-widest text-text-primary">
              {family.code || 'CJ-CASAJUNTO'}
            </span>
            <span className="text-[10px] text-text-muted">Compartilhe com moradores</span>
          </div>
          <p className="text-[11px] text-text-muted">
            Qualquer pessoa com este código poderá solicitar entrada nesta residência como Morador.
          </p>
        </div>

        {/* Card 2: Regra de Invariante de Administradores */}
        <div className="p-5 rounded-2xl bg-surface-card border border-border-default shadow-2xs space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-brand-primary">
            <ShieldCheck className="w-4 h-4" />
            <span>Regras de Administração (Mín 1, Máx 2)</span>
          </div>
          <div className="p-3 rounded-xl bg-state-success-soft border border-state-success/30 text-state-success text-xs flex items-center justify-between">
            <span>Admins Ativos: <strong>{admins.length} / 2</strong></span>
            <span className="text-[10px] font-bold uppercase bg-state-success/15 px-2 py-0.5 rounded">Em Conformidade</span>
          </div>
          <p className="text-[11px] text-text-secondary">
            Garante que a casa nunca fique sem gestores nem tenha governança fragmentada.
          </p>
        </div>
      </div>

      {/* Admin Action Tools */}
      <div className="bg-surface-card rounded-2xl border border-border-default p-5 shadow-2xs">
        <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider mb-3">
          Ações de Gestão Rápida
        </h4>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setIsRebalanceModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-brand-primary-soft hover:bg-brand-primary-soft/80 text-xs font-bold text-brand-primary flex items-center gap-2 transition cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Rebalanceamento de Carga Automático</span>
          </button>
        </div>
      </div>
    </div>
  );
};
