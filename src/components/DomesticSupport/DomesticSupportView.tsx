import React, { useState } from 'react';
import { 
  Sparkles, 
  Plus, 
  Edit2, 
  UserX, 
  RotateCcw, 
  ChevronLeft, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  CalendarClock
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { DomesticSupport, DomesticSupportSchedule } from '../../types';
import { formatScheduleCompact } from '../../services/domesticSupportService';
import { DomesticSupportModal } from './DomesticSupportModal';
import { DeactivateConfirmModal } from './DeactivateConfirmModal';

export const DomesticSupportView: React.FC = () => {
  const {
    domesticSupports: rawDomesticSupports,
    isDomesticSupportLoading,
    domesticSupportError,
    addDomesticSupport,
    updateDomesticSupport,
    deactivateDomesticSupport,
    reactivateDomesticSupport,
    setCurrentView,
    currentMember
  } = useApp();

  const domesticSupports = rawDomesticSupports || [];

  const { isDemoMode } = useAuth();
  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupport, setEditingSupport] = useState<DomesticSupport | null>(null);
  const [deactivatingSupport, setDeactivatingSupport] = useState<DomesticSupport | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isReactivatingId, setIsReactivatingId] = useState<string | null>(null);

  // Fail-closed guard for non-admin members
  if (!isAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="p-6 rounded-2xl bg-surface-card border border-border-default text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-state-warning mx-auto" />
          <h3 className="text-base font-bold text-text-primary">Acesso Restrito</h3>
          <p className="text-xs text-text-secondary max-w-md mx-auto">
            Apenas administradores da casa têm permissão para gerenciar as rotinas de ajuda externa.
          </p>
          <button
            onClick={() => setCurrentView('today')}
            className="px-4 py-2 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold transition min-h-[44px]"
          >
            Ir para Hoje
          </button>
        </div>
      </div>
    );
  }

  const activeSupports = domesticSupports.filter((s) => s.active !== false);
  const inactiveSupports = domesticSupports.filter((s) => s.active === false);
  const hasAnySupport = domesticSupports.length > 0;

  const handleOpenAdd = () => {
    setEditingSupport(null);
    setIsModalOpen(true);
    setFeedbackMessage(null);
  };

  const handleOpenEdit = (support: DomesticSupport) => {
    setEditingSupport(support);
    setIsModalOpen(true);
    setFeedbackMessage(null);
  };

  const handleSaveSupport = async (data: { name: string; schedule: DomesticSupportSchedule[] }) => {
    if (editingSupport) {
      await updateDomesticSupport(editingSupport.id, data);
      setFeedbackMessage({
        type: 'success',
        text: `Alterações de "${data.name}" salvas com sucesso!`
      });
    } else {
      await addDomesticSupport(data);
      setFeedbackMessage({
        type: 'success',
        text: `"${data.name}" foi adicionada com sucesso à rotina da casa!`
      });
    }
  };

  const handleConfirmDeactivate = async (supportId: string) => {
    const target = domesticSupports.find((s) => s.id === supportId);
    await deactivateDomesticSupport(supportId);
    setFeedbackMessage({
      type: 'success',
      text: `${target?.name || 'A ajuda externa'} foi desativada.`
    });
  };

  const handleReactivate = async (support: DomesticSupport) => {
    if (isReactivatingId) return;
    setIsReactivatingId(support.id);
    setFeedbackMessage(null);
    try {
      await reactivateDomesticSupport(support.id);
      setFeedbackMessage({
        type: 'success',
        text: `${support.name} foi reativada como ajuda ativa da casa.`
      });
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Falha ao reativar. Tente novamente.'
      });
    } finally {
      setIsReactivatingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Navigation breadcrumb back to Admin Dashboard */}
      <div>
        <button
          onClick={() => setCurrentView('dashboard')}
          className="text-xs font-semibold text-brand-primary hover:text-brand-primary/80 flex items-center gap-1 mb-2 transition cursor-pointer min-h-[32px]"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Voltar para Gestão & Painel</span>
        </button>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight">
              Ajuda externa
            </h1>
            <p className="text-xs sm:text-sm text-text-secondary mt-0.5">
              Organize quem ajuda nos cuidados da casa.
            </p>
          </div>

          <button
            id="btn-add-domestic-support"
            onClick={handleOpenAdd}
            className="px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary/90 text-text-on-primary text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs cursor-pointer min-h-[44px] shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar ajuda</span>
          </button>
        </div>
      </div>

      {/* Global error or success banner */}
      {feedbackMessage && (
        <div
          role="status"
          className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center justify-between gap-2 animate-fade-in ${
            feedbackMessage.type === 'success'
              ? 'bg-state-success-soft border-state-success/30 text-state-success'
              : 'bg-state-danger-soft border-state-danger/30 text-state-danger'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-[11px] underline font-bold cursor-pointer hover:opacity-80"
          >
            Fechar
          </button>
        </div>
      )}

      {domesticSupportError && !feedbackMessage && (
        <div className="p-3.5 rounded-2xl bg-state-danger-soft border border-state-danger/30 text-state-danger text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{domesticSupportError}</span>
        </div>
      )}

      {/* Loading state */}
      {isDomesticSupportLoading && (
        <div className="p-8 rounded-2xl bg-surface-card border border-border-default flex flex-col items-center justify-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
          <span className="text-xs text-text-muted">Carregando ajudas cadastradas...</span>
        </div>
      )}

      {/* Empty State */}
      {!isDomesticSupportLoading && !hasAnySupport && (
        <div className="p-8 sm:p-12 rounded-3xl bg-surface-card border border-border-default shadow-2xs text-center space-y-4">
          <div className="w-14 h-14 rounded-3xl bg-brand-primary-soft text-brand-primary flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base sm:text-lg font-extrabold text-text-primary">
              Sua casa ainda não tem ajuda externa cadastrada.
            </h3>
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
              Adicione uma diarista ou outra ajuda para organizar melhor a rotina da casa.
            </p>
          </div>
          <div className="pt-2">
            <button
              id="btn-empty-add-domestic-support"
              onClick={handleOpenAdd}
              className="px-5 py-3 rounded-2xl bg-brand-primary hover:bg-brand-primary/90 text-text-on-primary text-xs font-bold transition inline-flex items-center gap-2 shadow-xs cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar ajuda</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Section */}
      {!isDomesticSupportLoading && hasAnySupport && (
        <div className="space-y-6">
          {/* Ativas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Ativas ({activeSupports.length})
              </h2>
            </div>

            {activeSupports.length === 0 ? (
              <div className="p-5 rounded-2xl bg-surface-card border border-border-default text-center text-xs text-text-muted">
                Nenhuma ajuda ativa no momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                {activeSupports.map((support) => {
                  const scheduleLines = formatScheduleCompact(support.schedule);

                  return (
                    <div
                      key={support.id}
                      className="p-5 rounded-2xl bg-surface-card border border-border-default shadow-2xs flex flex-col justify-between space-y-4 hover:border-brand-primary/40 transition"
                    >
                      {/* Card Content */}
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-extrabold text-text-primary leading-tight">
                              {support.name}
                            </h3>
                            <p className="text-xs font-semibold text-text-secondary">
                              Diarista
                            </p>
                          </div>
                          {/* Status Badge */}
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-state-success-soft text-state-success border border-state-success/30 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-state-success" />
                            <span>Ativa</span>
                          </span>
                        </div>

                        {/* Schedules */}
                        <div className="space-y-1 pt-1">
                          {scheduleLines.map((line, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-1.5 text-xs text-text-primary font-medium"
                            >
                              <CalendarClock className="w-3.5 h-3.5 text-text-muted shrink-0" />
                              <span>{line}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-default/60">
                        <button
                          onClick={() => handleOpenEdit(support)}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => setDeactivatingSupport(support)}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold text-state-danger hover:bg-state-danger-soft transition flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Desativar</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inativas Section (separadas visualmente) */}
          {inactiveSupports.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border-default">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  Inativas ({inactiveSupports.length})
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
                {inactiveSupports.map((support) => {
                  const scheduleLines = formatScheduleCompact(support.schedule);
                  const isReactivating = isReactivatingId === support.id;

                  return (
                    <div
                      key={support.id}
                      className="p-5 rounded-2xl bg-surface-card/60 border border-border-default/70 shadow-2xs flex flex-col justify-between space-y-4 opacity-80 hover:opacity-100 transition"
                    >
                      {/* Card Content */}
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-base font-extrabold text-text-muted leading-tight line-through">
                              {support.name}
                            </h3>
                            <p className="text-xs font-semibold text-text-muted">
                              Diarista
                            </p>
                          </div>
                          {/* Status Badge */}
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-surface-subtle text-text-muted border border-border-default shrink-0">
                            <span>Inativa</span>
                          </span>
                        </div>

                        {/* Schedules */}
                        <div className="space-y-1 pt-1">
                          {scheduleLines.map((line, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-1.5 text-xs text-text-muted"
                            >
                              <CalendarClock className="w-3.5 h-3.5 text-text-muted shrink-0" />
                              <span>{line}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-default/60">
                        <button
                          onClick={() => handleOpenEdit(support)}
                          disabled={isReactivating}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition flex items-center gap-1.5 cursor-pointer min-h-[44px]"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => handleReactivate(support)}
                          disabled={isReactivating}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold text-brand-primary hover:bg-brand-primary-soft transition flex items-center gap-1.5 cursor-pointer min-h-[44px] disabled:opacity-50"
                        >
                          {isReactivating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Reativando...</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reativar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <DomesticSupportModal
        isOpen={isModalOpen}
        initialData={editingSupport}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSupport(null);
        }}
        onSave={handleSaveSupport}
      />

      <DeactivateConfirmModal
        isOpen={Boolean(deactivatingSupport)}
        support={deactivatingSupport}
        onClose={() => setDeactivatingSupport(null)}
        onConfirm={handleConfirmDeactivate}
      />
    </div>
  );
};
