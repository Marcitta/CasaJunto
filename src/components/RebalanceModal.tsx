import React, { useState, useMemo } from 'react';
import { 
  X, 
  SlidersHorizontal, 
  CheckCircle2, 
  ArrowRight, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  Users, 
  Sparkles,
  Calendar
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useApp } from '../context/AppContext';
import { DistributionService } from '../application/services/DistributionService';
import { RebalanceResult, SafetyService } from '../domain/distribution';
import { Task } from '../types';
import { calculateAgeFromBirthDate } from '../utils/dateUtils';
import { getActiveMembers, isMemberActive } from '../domain/selectors';

export const RebalanceModal: React.FC = () => {
  const { 
    isRebalanceModalOpen, 
    setIsRebalanceModalOpen, 
    family,
    members, 
    tasks, 
    familyTasks,
    protectedTimes,
    applyRebalanceUpdates,
    currentMember,
    isDemoMode,
    selectedDate
  } = useApp();

  const [previewResult, setPreviewResult] = useState<{
    result: RebalanceResult;
    taskUpdates: Record<string, Partial<Task>>;
  } | null>(null);

  const [isApplying, setIsApplying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [rowWarnings, setRowWarnings] = useState<Record<string, string>>({});

  const isAdmin = isDemoMode || currentMember?.role === 'ADMIN';
  const activeMembers = useMemo(() => getActiveMembers(members), [members]);
  const activeProtected = useMemo(() => protectedTimes.filter(pt => pt.family_id === family.id && pt.active !== false), [protectedTimes, family.id]);

  // STAB-005 & STAB-006: Filtragem estrita por targetDate, rotinas ativas e identidade canônica única
  const targetDateTasks = useMemo(() => {
    const seen = new Set<string>();
    return tasks.filter(t => {
      const taskDate = t.dueDate || selectedDate;
      if (taskDate !== selectedDate) return false;
      if (t.status === 'CANCELLED' || (t.status as string) === 'CANCELLED') return false;
      if (t.familyTaskId && familyTasks && familyTasks.length > 0) {
        const ft = familyTasks.find(f => f.id === t.familyTaskId);
        if (ft && ft.active === false) return false;
      }
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [tasks, selectedDate, familyTasks]);

  const pendingTasks = useMemo(() => {
    return targetDateTasks.filter(t => t.status !== 'DONE' && (t.status as string) !== 'COMPLETED');
  }, [targetDateTasks]);

  if (!isRebalanceModalOpen) return null;

  const handleClose = () => {
    setPreviewResult(null);
    setIsSuccess(false);
    setIsApplying(false);
    setSaveError(null);
    setRowWarnings({});
    setIsRebalanceModalOpen(false);
  };

  const handleCalculatePreview = () => {
    setSaveError(null);
    setRowWarnings({});
    const preview = DistributionService.executeRebalance({
      family,
      members,
      tasks: targetDateTasks,
      protectedTimes,
      targetDate: selectedDate
    });
    setPreviewResult(preview);
  };

  const handleOverrideProposal = (taskId: string, newMemberId: string) => {
    if (!previewResult) return;
    
    // Limpa aviso desta linha se existir
    setRowWarnings(prev => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });

    const originalTask = tasks.find(t => t.id === taskId);
    if (!originalTask) return;

    // Se selecionou um morador, valida as regras de segurança do Motor 2.0
    if (newMemberId) {
      const targetMember = members.find(m => m.id === newMemberId);
      if (targetMember) {
        if (!isMemberActive(targetMember)) {
          setRowWarnings(prev => ({
            ...prev,
            [taskId]: 'Não é permitido atribuir tarefas a moradores desativados.'
          }));
          return;
        }
        let memberForSafety = targetMember;
        if (memberForSafety.age === undefined && memberForSafety.birth_date) {
          const derivedAge = calculateAgeFromBirthDate(memberForSafety.birth_date);
          if (derivedAge !== null) {
            memberForSafety = { ...memberForSafety, age: derivedAge };
          }
        }
        const master = DistributionService.getOrCreateTaskMaster(originalTask);
        const safety = SafetyService.validateSafety(memberForSafety, master);
        if (!safety.isSafe) {
          setRowWarnings(prev => ({
            ...prev,
            [taskId]: safety.reason || 'Bloqueio de segurança: morador incompatível com a tarefa.'
          }));
          return;
        }
      }
    }

    const isUnassigned = !newMemberId;
    const targetMember = members.find(m => m.id === newMemberId);

    // Atualiza previewResult com o override manual
    setPreviewResult(prev => {
      if (!prev) return null;

      const newProposed = prev.result.proposedAssignments.map(asg => {
        if (asg.id === taskId) {
          return {
            ...asg,
            member_id: newMemberId,
            is_unassigned: isUnassigned,
            assigned_reason: isUnassigned 
              ? 'Definido manualmente como sem responsável na revisão' 
              : `Atribuição manual revisada pelo Administrador para ${targetMember?.name}`,
            unassigned_reason: isUnassigned ? 'Removido na revisão manual do rebalanceamento' : undefined
          };
        }
        return asg;
      });

      const newTaskUpdates = {
        ...prev.taskUpdates,
        [taskId]: {
          ...prev.taskUpdates[taskId],
          assignedMemberId: newMemberId,
          assigneeId: newMemberId,
          assigneeName: isUnassigned ? 'Não atribuído' : (targetMember?.name || 'Membro'),
          isUnassigned,
          assignedReason: isUnassigned 
            ? 'Definido manualmente como sem responsável na revisão' 
            : `Atribuição manual revisada pelo Administrador para ${targetMember?.name}`,
          unassignedReason: isUnassigned ? 'Removido na revisão manual do rebalanceamento' : undefined
        }
      };

      // Recalcula contagem de mudanças
      const changesCount = newProposed.filter(asg => {
        const orig = tasks.find(t => t.id === asg.id);
        return asg.member_id !== (orig?.assignedMemberId || '');
      }).length;

      return {
        ...prev,
        result: {
          ...prev.result,
          proposedAssignments: newProposed,
          changesCount
        },
        taskUpdates: newTaskUpdates
      };
    });
  };

  const handleConfirmAndApply = async () => {
    if (!previewResult) return;

    setIsApplying(true);
    setSaveError(null);
    try {
      // 1. Aplica e persiste via AppContext atômico
      await applyRebalanceUpdates(previewResult.taskUpdates);

      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      setIsSuccess(true);

      setTimeout(() => {
        handleClose();
      }, 1800);
    } catch (err: any) {
      console.error('Falha ao aplicar rebalanceamento:', err);
      setSaveError(err?.message || 'Não foi possível salvar no banco de dados. Tente novamente.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-surface-card rounded-3xl border border-border-default shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border-default flex items-center justify-between bg-surface-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-primary-soft flex items-center justify-center text-brand-primary">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-text-primary">Rebalanceamento Justo da Casa</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-primary text-text-on-primary">
                  <Sparkles className="w-2.5 h-2.5" /> Motor 2.0
                </span>
              </div>
              <p className="text-xs text-text-secondary">Distribuição orientada a regras reais, idade, limites e horários</p>
            </div>
          </div>
          <button 
            onClick={handleClose} 
            className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-subtle transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {isSuccess ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 animate-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-2xl bg-state-success-soft text-state-success flex items-center justify-center border border-state-success/30 shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-extrabold text-text-primary">Rebalanceamento Aplicado!</h4>
              <p className="text-xs text-text-secondary max-w-xs">
                Todas as tarefas foram redistribuídas de acordo com os critérios justos e persistidas com sucesso.
              </p>
            </div>
          ) : !previewResult ? (
            /* Estado Inicial: Apresentação das Variáveis de Entrada */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-surface-subtle border border-border-default space-y-3">
                <span className="text-xs font-bold text-brand-primary uppercase tracking-wider block">
                  Dados de Entrada Ativos para Análise
                </span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface-card p-3 rounded-xl border border-border-default flex items-center gap-2.5">
                    <Users className="w-4 h-4 text-brand-primary" />
                    <div>
                      <div className="text-base font-extrabold text-text-primary">{activeMembers.length}</div>
                      <div className="text-[10px] text-text-muted">Moradores ativos</div>
                    </div>
                  </div>
                  <div className="bg-surface-card p-3 rounded-xl border border-border-default flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-brand-primary" />
                    <div>
                      <div className="text-base font-extrabold text-text-primary">{activeProtected.length}</div>
                      <div className="text-[10px] text-text-muted">Horários protegidos</div>
                    </div>
                  </div>
                  <div className="bg-surface-card p-3 rounded-xl border border-border-default flex items-center gap-2.5">
                    <Calendar className="w-4 h-4 text-brand-primary" />
                    <div>
                      <div className="text-base font-extrabold text-text-primary">{pendingTasks.length}</div>
                      <div className="text-[10px] text-text-muted">Tarefas pendentes</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-state-warning-soft border border-state-warning/30 space-y-2">
                <div className="flex items-center gap-2 text-state-warning font-bold text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Critérios Invioláveis do Motor 2.0</span>
                </div>
                <ul className="text-xs text-state-warning space-y-1 list-disc list-inside">
                  <li><strong>Segurança por Idade:</strong> Bloqueia produtos químicos e tarefas perigosas para menores.</li>
                  <li><strong>Horários Protegidos:</strong> Não aloca tarefas em períodos de escola, sono ou trabalho.</li>
                  <li><strong>Limite Diário:</strong> Respeita o teto de minutos diários por autonomia e morador.</li>
                  <li><strong>Proteção Contra Forçamento:</strong> Se ninguém for elegível, a tarefa fica <em>não atribuída</em>.</li>
                </ul>
              </div>

              <p className="text-xs text-text-secondary leading-relaxed">
                Clique no botão abaixo para rodar o algoritmo completo de elegibilidade, segurança e score multidimensional. Você poderá revisar a proposta antes de confirmar.
              </p>
            </div>
          ) : (
            /* Estado de Proposta Calculada (Preview) */
            <div className="space-y-4">
              {/* Notificação de Erro ao Salvar */}
              {saveError && (
                <div className="p-3.5 rounded-2xl bg-state-error-soft border border-state-error/30 text-state-error text-xs flex items-center gap-2.5 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Card Resumo do Motor */}
              <div className="p-4 rounded-2xl bg-brand-primary-soft border border-brand-primary/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-primary">Resultado do Algoritmo</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-brand-primary text-text-on-primary font-bold">
                    {previewResult.result.changesCount} {previewResult.result.changesCount === 1 ? 'realocação' : 'realocações'}
                  </span>
                </div>
                <p className="text-xs text-text-primary font-medium leading-relaxed">
                  {previewResult.result.message}
                </p>
                {isAdmin && (
                  <p className="text-[11px] text-brand-primary/80 pt-1 border-t border-brand-primary/10">
                    💡 Como Administrador, você pode alterar o responsável de qualquer linha abaixo antes de salvar.
                  </p>
                )}
              </div>

              {/* Lista de Atribuições Propostas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                    Detalhamento das Tarefas
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {previewResult.result.proposedAssignments.length} avaliadas
                  </span>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {previewResult.result.proposedAssignments.map((asg) => {
                    const originalTask = tasks.find(t => t.id === asg.id);
                    const title = originalTask?.title || asg.task_id;
                    const assignedMember = members.find(m => m.id === asg.member_id);
                    const isUnassigned = asg.is_unassigned || !asg.member_id;

                    return (
                      <div 
                        key={asg.id} 
                        className={`p-3 rounded-xl border text-xs transition-colors ${
                          isUnassigned 
                            ? 'bg-state-error-soft border-state-error/30' 
                            : asg.member_id !== originalTask?.assignedMemberId 
                            ? 'bg-state-warning-soft border-state-warning/30'
                            : 'bg-surface-card border-border-default'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-text-primary block truncate">{title}</span>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-muted">
                              <span>Horário: {asg.scheduled_start || '08:00'}</span>
                              {originalTask?.roomName && <span>• {originalTask.roomName}</span>}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {isAdmin ? (
                              <select
                                value={asg.member_id || ''}
                                onChange={(e) => handleOverrideProposal(asg.id, e.target.value)}
                                disabled={isApplying}
                                className="text-xs font-bold text-text-primary bg-surface-card border border-border-default rounded-xl px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-primary cursor-pointer max-w-[170px]"
                              >
                                <option value="">Não atribuído</option>
                                {activeMembers.map(m => (
                                  <option key={m.id} value={m.id}>
                                    {m.avatar || '👤'} {m.name}
                                  </option>
                                ))}
                              </select>
                            ) : isUnassigned ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-state-error-soft text-state-error border border-state-error/30 font-bold text-[11px]">
                                <AlertTriangle className="w-3.5 h-3.5" /> Não Atribuído
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 bg-surface-card px-2 py-1 rounded-lg border border-border-default">
                                <div 
                                  className="w-4 h-4 rounded-full flex items-center justify-center text-[10px]"
                                  style={{ backgroundColor: `${assignedMember?.color || '#5b32a3'}20`, color: assignedMember?.color || '#5b32a3' }}
                                >
                                  {assignedMember?.avatar || '👤'}
                                </div>
                                <span className="font-bold text-text-primary">{assignedMember?.name || 'Membro'}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Aviso de bloqueio de segurança em override manual */}
                        {rowWarnings[asg.id] && (
                          <div className="mt-2 p-2 rounded-lg bg-state-error-soft border border-state-error/30 text-state-error text-[11px] flex items-center gap-1.5 font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{rowWarnings[asg.id]}</span>
                          </div>
                        )}

                        {/* Motivo do Motor (Explainability) */}
                        <div className="mt-2 pt-2 border-t border-border-default text-[11px] flex items-start gap-1.5">
                          {isUnassigned ? (
                            <div className="text-state-error leading-snug">
                              <strong>Motivo:</strong> {asg.unassigned_reason || asg.assigned_reason || 'Restrições de disponibilidade ou segurança impediram a alocação.'}
                            </div>
                          ) : (
                            <div className="text-brand-primary leading-snug">
                              <strong>Critério do Motor:</strong> {asg.assigned_reason || 'Melhor pontuação multidimensional de equilíbrio e disponibilidade.'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!isSuccess && (
          <div className="px-6 py-4 border-t border-border-default bg-surface-subtle flex items-center justify-end gap-2.5">
            <button
              onClick={handleClose}
              disabled={isApplying}
              className="px-4 py-2 rounded-xl text-xs font-medium text-text-secondary hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              {previewResult ? 'Descartar Proposta' : 'Cancelar'}
            </button>

            {!previewResult ? (
              <button
                onClick={handleCalculatePreview}
                className="px-5 py-2.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Calcular Proposta do Motor</span>
              </button>
            ) : (
              <button
                onClick={handleConfirmAndApply}
                disabled={isApplying}
                className="px-5 py-2.5 rounded-xl bg-state-success text-text-on-primary text-xs font-bold shadow-xs hover:bg-state-success/90 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isApplying ? (
                  <span>Salvando no banco...</span>
                ) : (
                  <>
                    <span>Confirmar e Salvar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
