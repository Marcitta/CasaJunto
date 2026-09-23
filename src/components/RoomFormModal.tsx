import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Room } from '../types';
import { 
  CANONICAL_ROOM_TYPES, 
  ROOM_TYPE_OPTIONS, 
  isValidRoomType, 
  ROOM_ICON_MAP,
  SafeRoomIcon 
} from '../data/roomTypes';

interface RoomFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; type: string; icon?: string; color?: string }) => Promise<void>;
  initialData?: Room | null;
  prefillData?: { name: string; type: string; icon?: string; color?: string } | null;
  mode: 'CREATE' | 'EDIT';
}

const PRESET_COLORS = [
  '#F59E0B', // Âmbar / Cozinha
  '#3B82F6', // Azul / Sala
  '#5b32a3', // Roxo CasaJunto Primário
  '#EC4899', // Rosa / Quarto
  '#06B6D4', // Ciano / Banheiro
  '#10B981', // Verde Esmeralda / Lavanderia
  '#f56e42', // Coral CasaJunto Secundário
  '#6366F1', // Índigo / Escritório
  '#84CC16', // Lima / Quintal
  '#f0ad00', // Amarelo CasaJunto Destaque
  '#6B7280', // Cinza / Garagem
  '#7a52c7'  // Roxo Claro CasaJunto
];

export const RoomFormModal: React.FC<RoomFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  prefillData,
  mode
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('kitchen');
  const [icon, setIcon] = useState('Utensils');
  const [color, setColor] = useState('#F59E0B');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setIsSubmitting(false);

    if (mode === 'EDIT' && initialData) {
      setName(initialData.name || '');
      const validT = initialData.type && isValidRoomType(initialData.type) ? initialData.type : 'other';
      setType(validT);
      setIcon(initialData.icon || ROOM_TYPE_OPTIONS.find(o => o.key === validT)?.icon || 'Home');
      setColor(initialData.color || ROOM_TYPE_OPTIONS.find(o => o.key === validT)?.defaultColor || '#5b32a3');
    } else if (prefillData) {
      setName(prefillData.name || '');
      const validT = prefillData.type && isValidRoomType(prefillData.type) ? prefillData.type : 'kitchen';
      setType(validT);
      setIcon(prefillData.icon || ROOM_TYPE_OPTIONS.find(o => o.key === validT)?.icon || 'Utensils');
      setColor(prefillData.color || ROOM_TYPE_OPTIONS.find(o => o.key === validT)?.defaultColor || '#F59E0B');
    } else {
      setName('');
      setType('kitchen');
      setIcon('Utensils');
      setColor('#F59E0B');
    }
  }, [isOpen, mode, initialData, prefillData]);

  if (!isOpen) return null;

  const handleTypeChange = (newType: string) => {
    setType(newType);
    const opt = ROOM_TYPE_OPTIONS.find(o => o.key === newType);
    if (opt) {
      setIcon(opt.icon);
      setColor(opt.defaultColor);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('O nome do ambiente é obrigatório.');
      return;
    }

    if (trimmedName.length > 40) {
      setError('O nome do ambiente não pode exceder 40 caracteres.');
      return;
    }

    if (!isValidRoomType(type)) {
      setError('Selecione uma categoria de ambiente válida da lista canônica.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave({
        name: trimmedName,
        type,
        icon,
        color
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Falha ao salvar ambiente. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <div className="bg-surface-card rounded-3xl border border-border-default shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-border-default flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: color }}
            >
              <SafeRoomIcon iconName={icon} roomType={type} className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-text-primary">
                {mode === 'CREATE' ? 'Novo Ambiente da Casa' : 'Editar Ambiente'}
              </h3>
              <p className="text-xs text-text-secondary">
                {mode === 'CREATE' 
                  ? 'Cadastre um novo cômodo para organização de tarefas' 
                  : 'Atualize os dados e categoria do ambiente'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl text-text-muted hover:bg-surface-subtle transition cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-state-error-soft border border-state-error/30 flex items-center gap-2.5 text-xs text-state-error font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-state-error" />
              <span>{error}</span>
            </div>
          )}

          {/* Nome do Ambiente */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary">
              Nome do Ambiente <span className="text-state-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Cozinha Americana, Suíte do Casal, Banheiro Social..."
              maxLength={40}
              autoFocus
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface-card text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/40 placeholder:text-text-muted"
            />
            <div className="flex justify-between text-[11px] text-text-muted">
              <span>Identificação clara para os moradores da casa</span>
              <span>{name.length}/40</span>
            </div>
          </div>

          {/* Categoria / Tipo */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary">
              Categoria do Cômodo <span className="text-state-error">*</span>
            </label>
            <select
              value={type}
              onChange={e => handleTypeChange(e.target.value)}
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface-card text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/40 cursor-pointer"
            >
              {ROOM_TYPE_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>
                  {opt.label} — {opt.description}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Ícone Seguro */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-text-primary">
              Ícone Representativo
            </label>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-1.5 rounded-xl bg-surface-subtle border border-border-default">
              {Object.keys(ROOM_ICON_MAP).map(iconKey => {
                const isSelected = icon === iconKey;
                return (
                  <button
                    key={iconKey}
                    type="button"
                    onClick={() => setIcon(iconKey)}
                    disabled={isSubmitting}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition cursor-pointer ${
                      isSelected
                        ? 'bg-brand-primary text-text-on-primary shadow-xs'
                        : 'bg-surface-card text-brand-primary border border-border-default hover:bg-surface-subtle'
                    }`}
                    title={iconKey}
                  >
                    <SafeRoomIcon iconName={iconKey} className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seletor de Cores */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-text-primary">
              Cor do Ambiente
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  disabled={isSubmitting}
                  className="w-7 h-7 rounded-full flex items-center justify-center transition transform hover:scale-110 cursor-pointer"
                  style={{ backgroundColor: c }}
                  aria-label={`Selecionar cor ${c}`}
                >
                  {color.toLowerCase() === c.toLowerCase() && (
                    <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-border-default flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-text-on-primary text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>{mode === 'CREATE' ? 'Criar Ambiente' : 'Salvar Alterações'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
