import React, { useState, useEffect } from 'react';
import { X, Home, Plus, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';

interface CreateFamilyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateFamilyModal: React.FC<CreateFamilyModalProps> = ({ isOpen, onClose }) => {
  const { createNewFamily, currentUser, currentMembership } = useAuth();
  const { currentMember, isDemoMode } = useApp();
  const [name, setName] = useState('');
  const [adminName, setAdminName] = useState(currentUser?.displayName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN' || currentMembership?.role === 'ADMIN' || (!currentMember && !currentMembership);

  useEffect(() => {
    if (isOpen) {
      if (currentUser?.displayName && !adminName) {
        setAdminName(currentUser.displayName);
      }
    }
  }, [isOpen, currentUser]);

  if (!isOpen || !isAdmin) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedHouseName = name.trim();
    const trimmedAdminName = adminName.trim();
    if (!trimmedHouseName || !trimmedAdminName) return;

    setIsLoading(true);
    setError(null);
    try {
      await createNewFamily(trimmedHouseName, trimmedAdminName);
      setName('');
      setAdminName('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Erro ao criar a residência.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-surface-card rounded-3xl border border-border-default shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 pb-4 flex items-center justify-between border-b border-border-default">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-primary flex items-center justify-center text-text-on-primary font-extrabold text-sm">
              <Home className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-text-primary leading-none">Criar Nova Casa</h2>
              <p className="text-[11px] text-text-muted mt-0.5">Comece um novo espaço compartilhado</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-state-error-soft border border-state-error/30 text-state-error text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Nome da Casa
            </label>
            <input
              id="create-family-name-input"
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Casa Croce, Rua Juriti"
              className="w-full px-3.5 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Seu Nome (Primeiro Administrador)
            </label>
            <div className="relative">
              <input
                id="create-family-admin-name-input"
                type="text"
                required
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                placeholder="Ex: Márcia"
                className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-border-default text-xs text-text-primary focus:outline-none focus:border-brand-primary bg-surface-subtle"
              />
              <User className="w-4 h-4 text-text-muted absolute left-3 top-2.5" />
            </div>
            <p className="text-[10px] text-text-muted mt-1">
              Você será configurado como o 1º Administrador com controle total do lar.
            </p>
          </div>

          <p className="text-[11px] text-text-muted">
            A nova residência será criada com exatamente 1 morador (você como Administrador). Você poderá convidar outros moradores e cadastrar tarefas a seguir.
          </p>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim() || !adminName.trim()}
              className="px-5 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Criando...' : 'Criar Casa'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
