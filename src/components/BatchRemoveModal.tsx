import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { TaskMaster, FamilyTask } from '../types';

interface BatchRemoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTasksToRemove: Array<{ taskMaster: TaskMaster; familyTask: FamilyTask }>;
  onConfirm: () => Promise<void>;
  isSubmitting?: boolean;
}

export const BatchRemoveModal: React.FC<BatchRemoveModalProps> = ({
  isOpen,
  onClose,
  activeTasksToRemove,
  onConfirm,
  isSubmitting = false
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="batch-remove-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-remove-title"
    >
      <div
        id="batch-remove-modal-content"
        className="w-full max-w-lg bg-[#FAF9F5] rounded-2xl shadow-2xl border border-[#E5E4DE] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-[#E5E4DE] bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] flex items-center justify-center text-[#DC2626] shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 id="batch-remove-title" className="text-lg font-bold text-[#2A2926]">
                Remover {activeTasksToRemove.length} {activeTasksToRemove.length === 1 ? 'tarefa' : 'tarefas'} da sua casa?
              </h2>
              <p className="text-xs text-[#7A7973] mt-0.5">
                Desativação da rotina da família (soft delete)
              </p>
            </div>
          </div>
          <button
            id="btn-close-batch-remove"
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#7A7973] hover:text-[#2A2926] hover:bg-[#F2F1EC] transition-colors"
            aria-label="Fechar confirmação de remoção"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Explanation */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-[#5A5953] leading-relaxed">
            As tarefas ativas selecionadas serão desativadas da rotina familiar. Ocorrências futuras agendadas serão canceladas, e todo o histórico de tarefas concluídas permanecerá preservado no registro familiar.
          </p>

          <div
            id="batch-remove-list"
            className="max-h-48 overflow-y-auto bg-white border border-[#E5E4DE] rounded-xl p-3 divide-y divide-[#E5E4DE]/60"
          >
            {activeTasksToRemove.map(({ taskMaster, familyTask }) => (
              <div
                key={familyTask.id}
                id={`batch-remove-item-${familyTask.id}`}
                className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-xs sm:text-sm"
              >
                <span className="font-medium text-[#2A2926] truncate pr-2">
                  {taskMaster?.name || familyTask.name || familyTask.id}
                </span>
                <span className="text-[#7A7973] shrink-0 text-xs">
                  {familyTask.frequency || 'Diária'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 border-t border-[#E5E4DE] bg-white flex items-center justify-end gap-3">
          <button
            id="btn-cancel-batch-remove"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-[#5A5953] hover:text-[#2A2926] hover:bg-[#F2F1EC] rounded-xl transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            id="btn-confirm-batch-remove"
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="min-h-[44px] px-5 py-2 text-sm font-semibold bg-[#DC2626] text-white hover:bg-[#B91C1C] rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Removendo...</span>
              </>
            ) : (
              <span>Confirmar Desativação</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
