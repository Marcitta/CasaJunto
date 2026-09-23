import React from 'react';
import { X, Home, Check, Plus, Shield, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';

interface FamilySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FamilySelectorModal: React.FC<FamilySelectorModalProps> = ({ isOpen, onClose }) => {
  const { currentFamily, activeMemberships, selectFamily, currentMembership } = useAuth();
  const { openCreateFamilyModal, currentMember, isDemoMode } = useApp();

  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN' || currentMembership?.role === 'ADMIN';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 pb-4 flex items-center justify-between border-b border-border-default">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-primary flex items-center justify-center text-text-on-primary font-extrabold text-sm">
              <Home className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-text-primary leading-none">Suas Casas e Lares</h2>
              <p className="text-[11px] text-text-muted mt-0.5">Selecione para qual lar alternar agora</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {activeMemberships.map(mem => {
            const isCurrent = currentFamily?.id === mem.familyId;
            return (
              <div
                key={mem.id}
                onClick={() => {
                  selectFamily(mem.familyId);
                  onClose();
                }}
                className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                  isCurrent
                    ? 'border-brand-primary bg-brand-primary-soft/50 shadow-xs'
                    : 'border-border-default bg-surface-card hover:border-brand-primary/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-sm ${
                    isCurrent ? 'bg-brand-primary text-text-on-primary' : 'bg-brand-primary-soft text-brand-primary'
                  }`}>
                    {mem.familyName ? mem.familyName.slice(0, 2).toUpperCase() : 'CJ'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">
                      {mem.familyName || `Casa (${mem.familyId})`}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] font-semibold text-text-muted">
                      <span className="flex items-center gap-1">
                        {mem.role === 'ADMIN' ? (
                          <>
                            <Shield className="w-3 h-3 text-brand-primary" />
                            <span className="text-brand-primary">Administrador</span>
                          </>
                        ) : (
                          <>
                            <Users className="w-3 h-3 text-text-muted" />
                            <span>Morador</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {isCurrent && (
                  <div className="w-6 h-6 rounded-full bg-brand-primary text-text-on-primary flex items-center justify-center">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            );
          })}

          {isAdmin && (
            <button
              id="family-selector-create-family-btn"
              onClick={() => {
                onClose();
                openCreateFamilyModal();
              }}
              className="w-full mt-2 py-3 px-4 rounded-2xl border border-dashed border-border-strong text-xs font-bold text-brand-primary hover:bg-surface-subtle flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Criar outro lar ou residência</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
