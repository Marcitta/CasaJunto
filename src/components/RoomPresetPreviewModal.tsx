import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Check,
  CheckSquare,
  Square,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Loader2,
  Pencil,
  Info
} from 'lucide-react';
import { Room } from '../types';
import {
  FAMILY_3_BEDROOMS_PRESET,
  ROOM_TYPE_LABELS,
  SafeRoomIcon,
  normalizeRoomName,
  validateCustomRoomName,
  CanonicalRoomType
} from '../data/roomTypes';

export interface RoomPresetPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (
    roomsToCreate: Array<{ name: string; type: CanonicalRoomType; icon?: string; color?: string }>
  ) => Promise<{ addedCount: number; skippedCount: number }>;
  existingRooms: Room[];
}

interface PresetItemState {
  idSuffix: string;
  originalName: string;
  name: string;
  type: CanonicalRoomType;
  icon: string;
  defaultColor: string;
  description: string;
  selected: boolean;
  alreadyExists: boolean;
  isCustomized: boolean;
  requiresConfirmation: boolean;
  confirmationReason?: string;
  confirmed: boolean;
}

export const RoomPresetPreviewModal: React.FC<RoomPresetPreviewModalProps> = ({
  isOpen,
  onClose,
  onApply,
  existingRooms
}) => {
  // Helper para inicializar estado dos itens
  const buildInitialItems = (): PresetItemState[] => {
    const existingNormSet = new Set(
      existingRooms
        .filter(r => r.active !== false)
        .map(r => normalizeRoomName(r.name))
    );

    return FAMILY_3_BEDROOMS_PRESET.rooms.map(presetRoom => {
      const origNorm = normalizeRoomName(presetRoom.name);
      const exists = existingNormSet.has(origNorm);

      return {
        idSuffix: presetRoom.idSuffix,
        originalName: presetRoom.name,
        name: presetRoom.name,
        type: presetRoom.type,
        icon: presetRoom.icon,
        defaultColor: presetRoom.defaultColor,
        description: presetRoom.description,
        selected: !exists, // Desmarcado por padrão se já existe na família (idempotência)
        alreadyExists: exists,
        isCustomized: false,
        requiresConfirmation: false,
        confirmed: false
      };
    });
  };

  const [items, setItems] = useState<PresetItemState[]>(() => buildInitialItems());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Conjunto de nomes normalizados dos ambientes ativos já existentes na família
  const activeExistingNormMap = useMemo(() => {
    const map = new Map<string, Room>();
    existingRooms
      .filter(r => r.active !== false)
      .forEach(r => {
        map.set(normalizeRoomName(r.name), r);
      });
    return map;
  }, [existingRooms]);

  useEffect(() => {
    if (!isOpen) return;

    setGeneralError(null);
    setIsSubmitting(false);
    setEditingId(null);
    setItems(buildInitialItems());
  }, [isOpen, existingRooms]);

  if (!isOpen) return null;

  const handleToggleSelect = (idSuffix: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.idSuffix !== idSuffix) return item;
        if (item.alreadyExists) return item; // Ambientes já existentes não são marcados para criação
        return { ...item, selected: !item.selected };
      })
    );
    setGeneralError(null);
  };

  const handleSelectAll = (select: boolean) => {
    setItems(prev =>
      prev.map(item => {
        if (item.alreadyExists) return item;
        return { ...item, selected: select };
      })
    );
    setGeneralError(null);
  };

  const handleNameChange = (idSuffix: string, newName: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.idSuffix !== idSuffix) return item;

        const isCustom = newName.trim() !== item.originalName;
        const norm = normalizeRoomName(newName);
        const existsInFamily = activeExistingNormMap.has(norm);

        // Validação semântica e verificação segura de identificação
        const val = validateCustomRoomName(newName, item.type);

        return {
          ...item,
          name: newName,
          isCustomized: isCustom,
          alreadyExists: existsInFamily,
          requiresConfirmation: isCustom && val.requiresConfirmation,
          confirmationReason: isCustom ? val.reason : undefined,
          // Se mudou o nome novamente, desmarca a confirmação anterior para exigir revalidação
          confirmed: isCustom ? false : true
        };
      })
    );
    setGeneralError(null);
  };

  const handleToggleConfirmation = (idSuffix: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.idSuffix !== idSuffix) return item;
        return { ...item, confirmed: !item.confirmed };
      })
    );
    setGeneralError(null);
  };

  // Contadores de sumário
  const selectedCount = items.filter(i => i.selected && !i.alreadyExists).length;
  const alreadyExistsCount = items.filter(i => i.alreadyExists).length;
  const unselectedCount = items.filter(i => !i.selected && !i.alreadyExists).length;

  const handleSubmit = async () => {
    setGeneralError(null);

    // 1. Validar se há ao menos 1 selecionado
    const toCreate = items.filter(i => i.selected && !i.alreadyExists);
    if (toCreate.length === 0) {
      if (alreadyExistsCount === items.length) {
        setGeneralError('Todos os 15 ambientes deste preset já estão ativos na sua casa.');
      } else {
        setGeneralError('Selecione ao menos um ambiente para criar.');
      }
      return;
    }

    // 2. Validar nomes em branco ou muito longos
    for (const item of toCreate) {
      const trimmed = item.name.trim();
      if (!trimmed) {
        setGeneralError(`O ambiente "${item.originalName}" possui nome em branco.`);
        return;
      }
      if (trimmed.length > 40) {
        setGeneralError(`O nome "${trimmed}" excede o limite máximo de 40 caracteres.`);
        return;
      }
    }

    // 3. Validar duplicidades internas entre os itens selecionados
    const normalizedSet = new Set<string>();
    for (const item of toCreate) {
      const norm = normalizeRoomName(item.name);
      if (normalizedSet.has(norm)) {
        setGeneralError(`Conflito: há mais de um ambiente selecionado com o nome "${item.name}".`);
        return;
      }
      normalizedSet.add(norm);
    }

    // 4. Condição 3 da Fase B: Para nomes personalizados que exigem confirmação segura
    const unconfirmed = toCreate.filter(i => i.isCustomized && i.requiresConfirmation && !i.confirmed);
    if (unconfirmed.length > 0) {
      setGeneralError(
        `O ambiente personalizado "${unconfirmed[0].name}" requer sua confirmação explícita antes de ser gravado.`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      await onApply(
        toCreate.map(i => ({
          name: i.name.trim(),
          type: i.type,
          icon: i.icon,
          color: i.defaultColor
        }))
      );
      onClose();
    } catch (err: any) {
      setGeneralError(err?.message || 'Erro ao aplicar o preset de ambientes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="room-preset-preview-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-preset-title"
    >
      <div
        id="room-preset-preview-content"
        className="w-full max-w-4xl bg-surface-card rounded-2xl shadow-2xl border border-border-default flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-6 border-b border-border-default bg-surface-card">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-primary-soft flex items-center justify-center text-brand-primary shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="room-preset-title" className="text-lg sm:text-xl font-bold text-text-primary">
                  {FAMILY_3_BEDROOMS_PRESET.name}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary text-[11px] font-extrabold">
                  15 Ambientes
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-1 max-w-2xl leading-relaxed">
                {FAMILY_3_BEDROOMS_PRESET.description} Você pode selecionar individualmente quais deseja criar e personalizar os nomes antes de salvar.
              </p>
            </div>
          </div>
          <button
            id="btn-close-room-preset"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Error Banner */}
        {generalError && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 rounded-xl bg-state-error-soft border border-state-error/30 text-state-error text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{generalError}</span>
          </div>
        )}

        {/* Action Controls & Summary Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-border-default bg-surface-subtle/50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="px-2.5 py-1 rounded-lg bg-surface-card border border-border-default hover:bg-surface-subtle text-text-primary font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              <CheckSquare className="w-3.5 h-3.5 text-brand-primary" />
              <span>Marcar todos os novos</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
              className="px-2.5 py-1 rounded-lg bg-surface-card border border-border-default hover:bg-surface-subtle text-text-secondary hover:text-text-primary font-semibold transition cursor-pointer flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Desmarcar todos</span>
            </button>
          </div>

          <div className="flex items-center gap-3 font-medium text-text-secondary text-[11px]">
            <span className="text-brand-primary font-bold">
              {selectedCount} selecionado(s) para criação
            </span>
            {alreadyExistsCount > 0 && (
              <span className="text-text-muted">
                • {alreadyExistsCount} já existente(s) na casa
              </span>
            )}
            {unselectedCount > 0 && (
              <span className="text-text-muted">
                • {unselectedCount} desmarcado(s)
              </span>
            )}
          </div>
        </div>

        {/* Environments List */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-3 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {items.map(item => {
              const typeLabel = (ROOM_TYPE_LABELS as any)[item.type] || item.type;
              const isEditing = editingId === item.idSuffix;

              return (
                <div
                  key={item.idSuffix}
                  id={`preset-room-item-${item.idSuffix}`}
                  className={`p-3.5 rounded-xl border transition-all ${
                    item.alreadyExists
                      ? 'bg-surface-subtle/60 border-border-default opacity-70'
                      : item.selected
                      ? 'bg-surface-card border-brand-primary/40 shadow-2xs'
                      : 'bg-surface-card/60 border-border-default opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      {/* Checkbox */}
                      <button
                        type="button"
                        onClick={() => handleToggleSelect(item.idSuffix)}
                        disabled={item.alreadyExists || isSubmitting}
                        className={`mt-1 w-4 h-4 rounded border flex items-center justify-center transition cursor-pointer ${
                          item.alreadyExists
                            ? 'bg-surface-subtle border-border-default opacity-50 cursor-not-allowed'
                            : item.selected
                            ? 'bg-brand-primary border-brand-primary text-white'
                            : 'border-border-default hover:border-brand-primary bg-surface-card'
                        }`}
                        aria-label={`Selecionar ${item.name}`}
                      >
                        {item.selected && !item.alreadyExists && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>

                      {/* Icon */}
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                        style={{
                          backgroundColor: `${item.defaultColor}15`,
                          color: item.defaultColor
                        }}
                      >
                        <SafeRoomIcon iconName={item.icon} roomType={item.type} className="w-4 h-4" />
                      </div>

                      {/* Details & Name Input */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isEditing ? (
                            <div className="flex items-center gap-1 w-full mt-0.5">
                              <input
                                type="text"
                                value={item.name}
                                onChange={e => handleNameChange(item.idSuffix, e.target.value)}
                                maxLength={40}
                                autoFocus
                                onBlur={() => setEditingId(null)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') setEditingId(null);
                                }}
                                className="w-full px-2 py-1 rounded-lg border border-brand-primary bg-surface-card text-xs font-bold text-text-primary focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-2 py-1 rounded-lg bg-brand-primary text-white text-[11px] font-bold"
                              >
                                Ok
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <h4
                                className="text-xs font-bold text-text-primary truncate"
                                title={item.name}
                              >
                                {item.name}
                              </h4>
                              {!item.alreadyExists && (
                                <button
                                  type="button"
                                  onClick={() => setEditingId(item.idSuffix)}
                                  className="p-1 rounded text-text-muted hover:text-text-primary transition cursor-pointer"
                                  title="Personalizar nome deste ambiente"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                              {item.isCustomized && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-brand-primary-soft text-brand-primary font-bold">
                                  personalizado
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-secondary">
                          <span className="font-medium">{typeLabel}</span>
                          <span>•</span>
                          <span className="text-text-muted truncate">{item.description}</span>
                        </div>

                        {/* Status Tags */}
                        {item.alreadyExists && (
                          <div className="mt-1.5 flex items-center gap-1 text-[11px] text-text-muted font-medium">
                            <Info className="w-3 h-3 text-text-muted" />
                            <span>Já existe na casa (não será duplicado)</span>
                          </div>
                        )}

                        {/* Ambiguity / Confirmation Requirement Banner */}
                        {item.isCustomized && item.requiresConfirmation && !item.alreadyExists && (
                          <div className="mt-2 p-2 rounded-lg bg-state-warning-soft border border-state-warning/30 space-y-1.5 text-[11px]">
                            <div className="flex items-start gap-1.5 text-state-warning font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{item.confirmationReason || 'Nome personalizado requer confirmação explícita.'}</span>
                            </div>
                            <label className="flex items-center gap-1.5 text-text-primary font-bold cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={item.confirmed}
                                onChange={() => handleToggleConfirmation(item.idSuffix)}
                                className="rounded text-brand-primary focus:ring-brand-primary"
                              />
                              <span>Confirmar este nome para o ambiente</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-border-default bg-surface-card flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[11px] text-text-muted text-center sm:text-left">
            Preservação de histórico garantida: tarefas e rotinas existentes não são afetadas.
          </p>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-border-default text-xs font-semibold text-text-secondary hover:bg-surface-subtle transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              id="btn-confirm-apply-room-preset"
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || selectedCount === 0}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-text-on-primary text-xs font-bold shadow-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Criando ambientes...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {selectedCount === 0
                      ? 'Nenhum ambiente selecionado'
                      : `Criar ${selectedCount} ${selectedCount === 1 ? 'Ambiente' : 'Ambientes'}`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
