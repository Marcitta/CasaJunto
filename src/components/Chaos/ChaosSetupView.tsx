import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Clock, 
  Users, 
  Check, 
  AlertCircle, 
  Plus, 
  Trash2, 
  ArrowRight,
  Search,
  CheckSquare,
  Square,
  X,
  Info
} from 'lucide-react';
import { FamilyTask, Member, ChaosTaskStrategy, Room } from '../../types';
import { TaskAssignment, ChaosSessionTaskConfig } from '../../domain/models';
import { ChaosSessionService } from '../../services/chaosSessionService';
import { mapChaosErrorToHumanMessage, logStructuredChaosError } from '../../utils/chaosErrorUtils';
import { useApp } from '../../context/AppContext';
import { getTodayDateString } from '../../utils/dateUtils';
import { getFamilyLocalDate } from '../../domain/utils/dateTimeUtils';
import { allMasterTasks } from '../../data/tasks';
import { db } from '../../infrastructure/firebase/firebase';
import { FirestorePersistenceRepository } from '../../infrastructure/repositories/FirestorePersistenceRepository';

interface ChaosSetupViewProps {
  familyId: string;
  callerMemberId: string;
  activeMembers: Member[];
  familyTasks: FamilyTask[];
  rooms: Room[];
  onSessionStarted: () => Promise<void>;
  onClose: () => void;
}

export interface SelectedTaskItem {
  familyTaskId: string;
  strategy: ChaosTaskStrategy;
  isSuggested: boolean;
}

export const ChaosSetupView: React.FC<ChaosSetupViewProps> = ({
  familyId,
  callerMemberId,
  activeMembers,
  familyTasks,
  rooms,
  onSessionStarted,
  onClose
}) => {
  const {
    isDemoMode,
    protectedTimes,
    setActiveChaosSession,
    tasks: canonicalTasks,
    family,
    updateTask
  } = useApp();

  // HF3: Determinação canônica do dia de hoje respeitando timezone local da família
  const todayDate = useMemo(() => getFamilyLocalDate(family?.timezone), [family?.timezone]);

  // Conjunto de IDs de FamilyTasks com ocorrência canônica concluída hoje (status COMPLETED ou DONE)
  const completedTodayFamilyTaskIds = useMemo(() => {
    const set = new Set<string>();
    (canonicalTasks || []).forEach(t => {
      const taskDate = (t as any).scheduled_date || (t as any).scheduledDate || t.dueDate;
      const isToday = taskDate === todayDate;
      const isCompleted = t.status === 'DONE' || (t.status as string) === 'COMPLETED';
      if (isToday && isCompleted) {
        if ((t as any).familyTaskId) set.add((t as any).familyTaskId);
        if ((t as any).family_task_id) set.add((t as any).family_task_id);
        set.add(t.id);

        const tmId = (t as any).taskMasterId || (t as any).taskId || (t as any).task_id;
        if (tmId) {
          familyTasks.forEach(ft => {
            const ftTmId = ft.task_id || (ft as any).taskId || (ft as any).taskMasterId;
            if (ftTmId === tmId || ft.id === tmId) {
              set.add(ft.id);
            }
          });
        }
      }
    });
    return set;
  }, [canonicalTasks, todayDate, familyTasks]);

  // HF5: Conjunto de IDs de FamilyTasks ONE_TIME cuja ocorrência única já foi concluída em qualquer data
  const completedOneTimeFamilyTaskIds = useMemo(() => {
    const set = new Set<string>();
    const oneTimeFamilyTasks = (familyTasks || []).filter(ft => 
      ft.frequency === 'ONE_TIME' || (ft as any).frequencyType === 'ONE_TIME'
    );
    if (oneTimeFamilyTasks.length === 0) return set;

    const oneTimeFtMap = new Map<string, FamilyTask>();
    oneTimeFamilyTasks.forEach(ft => {
      oneTimeFtMap.set(ft.id, ft);
      const tmId = ft.task_id || (ft as any)?.taskId || (ft as any)?.taskMasterId;
      if (tmId) oneTimeFtMap.set(tmId, ft);
    });

    (canonicalTasks || []).forEach(t => {
      const isCompleted = t.status === 'DONE' || (t.status as string) === 'COMPLETED';
      if (!isCompleted) return;

      const ftId = (t as any).familyTaskId || (t as any).family_task_id || t.id;
      const tmId = (t as any).taskMasterId || (t as any).taskId || (t as any).task_id;

      if (ftId && oneTimeFtMap.has(ftId)) {
        set.add(oneTimeFtMap.get(ftId)!.id);
      } else if (tmId && oneTimeFtMap.has(tmId)) {
        set.add(oneTimeFtMap.get(tmId)!.id);
      }
    });

    return set;
  }, [familyTasks, canonicalTasks]);

  // HF5: Tarefas inelegíveis para nova sessão do Modo Caos: concluídas hoje OU ONE_TIME já concluídas
  const ineligibleFamilyTaskIds = useMemo(() => {
    return new Set([...completedTodayFamilyTaskIds, ...completedOneTimeFamilyTaskIds]);
  }, [completedTodayFamilyTaskIds, completedOneTimeFamilyTaskIds]);

  // 1. Participantes ativos (inicialmente todos selecionados)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(() =>
    activeMembers.map(m => m.id)
  );

  // 2. Duração (15, 30, 45, 60)
  const [durationMinutes, setDurationMinutes] = useState<15 | 30 | 45 | 60>(30);

  // 3. Tarefas selecionadas (inicialmente tarefas com chaosEligible === true que não foram concluídas)
  const [selectedTasks, setSelectedTasks] = useState<SelectedTaskItem[]>(() => {
    const suggested = familyTasks.filter(ft =>
      ft.active !== false &&
      ft.chaosEligible === true &&
      !ineligibleFamilyTaskIds.has(ft.id)
    );
    return suggested.map(ft => ({
      familyTaskId: ft.id,
      strategy: 'DISTRIBUTED' as ChaosTaskStrategy,
      isSuggested: true
    }));
  });

  // HF3 & HF5: Se canonicalTasks carregar posteriormente, auto-remover qualquer tarefa inelegível de selectedTasks
  React.useEffect(() => {
    if (ineligibleFamilyTaskIds.size > 0) {
      setSelectedTasks(prev => prev.filter(item => !ineligibleFamilyTaskIds.has(item.familyTaskId)));
    }
  }, [ineligibleFamilyTaskIds]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estado do Seletor Múltiplo de Tarefas (UX01)
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');
  const [tempSelectedTaskIds, setTempSelectedTaskIds] = useState<Set<string>>(new Set());

  // Tarefas ativas da família disponíveis para adicionar (exclui as já selecionadas e inelegíveis)
  const availableToAddFamilyTasks = useMemo(() => {
    const selectedIds = new Set(selectedTasks.map(t => t.familyTaskId));
    return familyTasks.filter(ft =>
      ft.active !== false &&
      !selectedIds.has(ft.id) &&
      !ineligibleFamilyTaskIds.has(ft.id)
    );
  }, [familyTasks, selectedTasks, ineligibleFamilyTaskIds]);

  // Tarefas concluídas hoje para contexto visual no seletor (com suporte à busca/filtro)
  const completedTodayFamilyTasks = useMemo(() => {
    const selectedIds = new Set(selectedTasks.map(t => t.familyTaskId));
    const query = pickerSearchQuery.trim().toLowerCase();
    return familyTasks.filter(ft => {
      const isCandidate = ft.active !== false && !selectedIds.has(ft.id) && completedTodayFamilyTaskIds.has(ft.id);
      if (!isCandidate) return false;
      if (!query) return true;
      const name = (ft.name || (ft as any).title || (ft as any).custom_title || '').toLowerCase();
      const room = rooms.find(r => r.id === ft.room_id)?.name?.toLowerCase() || '';
      return name.includes(query) || room.includes(query);
    });
  }, [familyTasks, selectedTasks, completedTodayFamilyTaskIds, pickerSearchQuery, rooms]);

  // HF5: Tarefas avulsas ONE_TIME já concluídas em datas anteriores (com suporte à busca/filtro)
  const completedOneTimeEarlierFamilyTasks = useMemo(() => {
    const selectedIds = new Set(selectedTasks.map(t => t.familyTaskId));
    const query = pickerSearchQuery.trim().toLowerCase();
    return familyTasks.filter(ft => {
      const isCandidate = ft.active !== false && 
        !selectedIds.has(ft.id) && 
        completedOneTimeFamilyTaskIds.has(ft.id) && 
        !completedTodayFamilyTaskIds.has(ft.id);
      if (!isCandidate) return false;
      if (!query) return true;
      const name = (ft.name || (ft as any).title || (ft as any).custom_title || '').toLowerCase();
      const room = rooms.find(r => r.id === ft.room_id)?.name?.toLowerCase() || '';
      return name.includes(query) || room.includes(query);
    });
  }, [familyTasks, selectedTasks, completedOneTimeFamilyTaskIds, completedTodayFamilyTaskIds, pickerSearchQuery, rooms]);

  // Tarefas filtradas na busca do seletor múltiplo
  const filteredAvailableTasks = useMemo(() => {
    const query = pickerSearchQuery.trim().toLowerCase();
    if (!query) return availableToAddFamilyTasks;
    return availableToAddFamilyTasks.filter(ft => {
      const name = (ft.name || (ft as any).title || (ft as any).custom_title || '').toLowerCase();
      const room = rooms.find(r => r.id === ft.room_id)?.name?.toLowerCase() || '';
      return name.includes(query) || room.includes(query);
    });
  }, [availableToAddFamilyTasks, pickerSearchQuery, rooms]);

  // Alterna participante
  const toggleMember = (memberId: string) => {
    setSelectedMemberIds(prev =>
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    );
  };

  // Alterna estratégia da tarefa entre DISTRIBUTED e OPEN_POOL
  const toggleStrategy = (familyTaskId: string) => {
    setSelectedTasks(prev =>
      prev.map(item => {
        if (item.familyTaskId === familyTaskId) {
          return {
            ...item,
            strategy: item.strategy === 'DISTRIBUTED' ? 'OPEN_POOL' : 'DISTRIBUTED'
          };
        }
        return item;
      })
    );
  };

  // Remove tarefa da seleção
  const removeTask = (familyTaskId: string) => {
    setSelectedTasks(prev => prev.filter(item => item.familyTaskId !== familyTaskId));
  };

  // Abre seletor múltiplo
  const handleOpenTaskPicker = () => {
    setPickerSearchQuery('');
    setTempSelectedTaskIds(new Set());
    setIsTaskPickerOpen(true);
  };

  // Fecha seletor múltiplo descartando alterações temporárias
  const handleCancelTaskPicker = () => {
    setTempSelectedTaskIds(new Set());
    setIsTaskPickerOpen(false);
  };

  // Alterna seleção individual de tarefa no seletor
  const toggleTempTask = (taskId: string) => {
    setTempSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Selecionar todas as tarefas visíveis no filtro
  const handleSelectAllVisible = () => {
    setTempSelectedTaskIds(prev => {
      const next = new Set(prev);
      filteredAvailableTasks.forEach(t => next.add(t.id));
      return next;
    });
  };

  // Desmarcar todas as tarefas visíveis
  const handleDeselectAllVisible = () => {
    setTempSelectedTaskIds(prev => {
      const next = new Set(prev);
      filteredAvailableTasks.forEach(t => next.delete(t.id));
      return next;
    });
  };

  // Confirmar adição em lote das tarefas selecionadas
  const handleConfirmBatchAdd = () => {
    if (tempSelectedTaskIds.size === 0) {
      setIsTaskPickerOpen(false);
      return;
    }

    const currentIds = new Set(selectedTasks.map(t => t.familyTaskId));
    const newItems: SelectedTaskItem[] = [];

    tempSelectedTaskIds.forEach(id => {
      if (!currentIds.has(id)) {
        const ft = familyTasks.find(f => f.id === id);
        if (ft && ft.active !== false) {
          newItems.push({
            familyTaskId: id,
            strategy: 'DISTRIBUTED', // Estratégia padrão: DISTRIBUTED
            isSuggested: Boolean(ft.chaosEligible)
          });
        }
      }
    });

    setSelectedTasks(prev => [...prev, ...newItems]);
    setTempSelectedTaskIds(new Set());
    setIsTaskPickerOpen(false);
  };

  // Handler canônico de Iniciar Modo Caos
  const handleStartChaos = async () => {
    if (isSubmitting) return;

    if (selectedMemberIds.length === 0) {
      setErrorMessage('Selecione ao menos um morador participante.');
      return;
    }

    // HF3 & HF5: Filtrar qualquer tarefa que porventura já tenha sido concluída hoje ou ONE_TIME concluída antes de criar o draft
    const cleanTasks = selectedTasks
      .filter(t => !ineligibleFamilyTaskIds.has(t.familyTaskId))
      .map(t => ({
        familyTaskId: t.familyTaskId,
        strategy: t.strategy
      }));

    if (cleanTasks.length === 0) {
      setErrorMessage('Todas as tarefas selecionadas já foram concluídas. Adicione outras tarefas à sessão.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    let stage = 'INIT';
    let currentSessionId = '';
    let currentTaskId = '';
    let currentAssignmentId = '';
    let currentStrategy = '';
    let previousMemberId = '';
    let candidateParticipantIds: string[] = [];

    try {
      const sessionTodayDate = getFamilyLocalDate(family?.timezone);
      const canonicalExistingAssignments: TaskAssignment[] = (canonicalTasks || []).map(t => ({
        id: t.id,
        family_id: (t as any).familyId || familyId,
        family_task_id: (t as any).familyTaskId || (t as any).family_task_id || t.id,
        task_id: (t as any).taskMasterId || (t as any).taskId || (t as any).task_id || t.id,
        member_id: (t as any).assignedMemberId || (t as any).member_id || '',
        room_id: (t as any).roomId || (t as any).room_id || '',
        scheduled_date: (t as any).scheduled_date || (t as any).scheduledDate || t.dueDate || sessionTodayDate,
        scheduled_start: (t as any).scheduledStart || '08:00',
        scheduled_end: (t as any).scheduledEnd,
        status: (t.status === 'DONE' || (t.status as string) === 'COMPLETED') ? 'COMPLETED' : ((t.status as string) === 'CANCELLED' ? 'CANCELLED' : 'SCHEDULED'),
        assigned_reason: (t as any).assignedReason,
        unassigned_reason: (t as any).unassignedReason,
        is_unassigned: (t as any).isUnassigned,
        factors: (t as any).factors,
        completed_at: (t as any).completedAt || (t as any).completed_at,
        completed_by: (t as any).completedByMemberId || (t as any).completed_by,
        completed_by_name: (t as any).completedByName,
        completion_type: (t as any).completionType,
        chaos_session_id: (t as any).chaos_session_id || (t as any).chaosSessionId,
        chaos_strategy: (t as any).chaos_strategy || (t as any).chaosStrategy
      }));

      // 1. Criar Rascunho da Sessão com Guard de Serviço Ativo
      stage = 'createDraftSession';
      const draft = await ChaosSessionService.createDraftSession({
        familyId,
        createdByMemberId: callerMemberId,
        callerRole: 'ADMIN',
        initialDurationMinutes: durationMinutes,
        participantMemberIds: selectedMemberIds,
        tasks: cleanTasks,
        availableMembers: activeMembers,
        availableTasks: familyTasks,
        existingAssignments: canonicalExistingAssignments,
        todayDate: sessionTodayDate,
        isDemoMode
      });
      currentSessionId = draft.id;

      // 2. Resolver tarefas e ocorrências via Motor 2.0 ou OPEN_POOL
      stage = 'resolveAllChaosSessionTasks';
      const scopedActiveParticipants = activeMembers.filter(m => selectedMemberIds.includes(m.id));
      candidateParticipantIds = scopedActiveParticipants.map(m => m.id);

      const resolved = ChaosSessionService.resolveAllChaosSessionTasks({
        familyId,
        session: draft,
        familyTasks,
        allTasks: allMasterTasks,
        existingAssignments: canonicalExistingAssignments,
        participants: scopedActiveParticipants,
        todayDate: sessionTodayDate,
        protectedTimes
      });

      const allAssigned = [...resolved.newAssignments, ...resolved.reusedAssignments];

      // HF2: Vincular assignmentId canônico diretamente em draft.tasks sem undefined
      draft.tasks = (draft.tasks || []).map(tc => {
        const found = allAssigned.find(a => a.family_task_id === tc.familyTaskId);
        const item: ChaosSessionTaskConfig = {
          familyTaskId: tc.familyTaskId,
          strategy: tc.strategy
        };
        if (tc.taskMasterId) item.taskMasterId = tc.taskMasterId;
        const asgId = found?.id || tc.assignmentId;
        if (asgId) item.assignmentId = asgId;
        return item;
      });

      // 3. Atualizar estado local de tarefas e persistir ocorrências resolvidas se não for modo demo
      stage = 'updateTask_and_saveAssignments';
      if (updateTask && allAssigned.length > 0) {
        allAssigned.forEach(asg => {
          updateTask(asg.id, {
            assignedMemberId: asg.is_unassigned ? '' : asg.member_id,
            assigneeId: asg.is_unassigned ? '' : asg.member_id,
            isUnassigned: asg.is_unassigned,
            unassignedReason: asg.unassigned_reason,
            assignedReason: asg.assigned_reason,
            factors: asg.factors,
            status: (asg.status === 'COMPLETED' || asg.status === 'DONE') ? 'DONE' : ((asg.status as string) === 'CANCELLED' ? 'CANCELLED' : 'PENDING'),
            chaos_session_id: draft.id,
            chaosSessionId: draft.id,
            chaos_strategy: asg.chaos_strategy,
            chaosStrategy: asg.chaos_strategy
          } as any);
        });
      }

      if (!isDemoMode && db && allAssigned.length > 0) {
        try {
          const repo = new FirestorePersistenceRepository();
          await repo.saveAssignments(familyId, allAssigned);
        } catch (repoErr) {
          console.warn('[ChaosSetupView] Warning ao persistir atribuições:', repoErr);
        }
      }

      // 4. Iniciar sessão atômica (DRAFT -> ACTIVE com lock de concorrência)
      stage = 'startChaosSession';
      const activeSession = await ChaosSessionService.startChaosSession({
        familyId,
        sessionId: draft.id,
        callerRole: 'ADMIN',
        existingSession: draft,
        isDemoMode
      });

      if (isDemoMode && setActiveChaosSession) {
        setActiveChaosSession(activeSession);
      }

      stage = 'onSessionStarted';
      await onSessionStarted();
    } catch (err: any) {
      logStructuredChaosError('handleStartChaos', err, {
        familyId,
        callerMemberId,
        participantCount: selectedMemberIds.length,
        taskCount: selectedTasks.length,
        durationMinutes,
        stage
      });
      setErrorMessage(mapChaosErrorToHumanMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" id="chaos-setup-view">
      {/* Header Visual com Urgência Positiva */}
      <div className="space-y-1 text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold mb-2">
          <span>🔥 Modo Caos</span>
        </div>
        <h2 className="text-xl font-black text-text-primary tracking-tight">
          Configurar Força-Tarefa Relâmpago
        </h2>
        <p className="text-xs text-text-secondary leading-relaxed">
          Selecione os participantes disponíveis, a duração da sessão e as tarefas urgentes da casa.
        </p>
      </div>

      {/* Exibição Amigável de Erros */}
      {errorMessage && (
        <div 
          id="chaos-setup-error-banner"
          className="p-3.5 rounded-2xl bg-state-error-soft/60 border border-state-error/30 text-state-error text-xs flex items-start gap-2.5 animate-fadeIn"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{errorMessage}</div>
        </div>
      )}

      {/* 1. SELEÇÃO DE MORADORES PARTICIPANTES */}
      <div className="space-y-2.5">
        <label className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          <span>Moradores Participantes ({selectedMemberIds.length}/{activeMembers.length})</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" id="chaos-participants-selector">
          {activeMembers.map(member => {
            const isSelected = selectedMemberIds.includes(member.id);
            return (
              <button
                type="button"
                key={member.id}
                id={`chaos-member-toggle-${member.id}`}
                onClick={() => toggleMember(member.id)}
                className={`min-h-[44px] p-2.5 rounded-2xl border text-left transition flex items-center gap-2.5 cursor-pointer ${
                  isSelected
                    ? 'border-brand-primary bg-brand-primary-soft text-text-primary shadow-xs'
                    : 'border-border-default bg-surface-card text-text-muted hover:border-border-hover'
                }`}
              >
                <div 
                  className="w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0"
                  style={{ backgroundColor: member.color || '#3b82f6' }}
                >
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-text-primary truncate">{member.name}</p>
                  <p className="text-[10px] text-text-muted capitalize truncate">{member.role === 'ADMIN' ? 'Admin' : 'Morador'}</p>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-brand-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. DURAÇÃO DA FORÇA-TAREFA */}
      <div className="space-y-2.5">
        <label className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>Tempo da Força-Tarefa</span>
        </label>
        <div className="grid grid-cols-4 gap-2" id="chaos-duration-selector">
          {([15, 30, 45, 60] as const).map(mins => {
            const isSelected = durationMinutes === mins;
            return (
              <button
                type="button"
                key={mins}
                id={`chaos-duration-${mins}`}
                onClick={() => setDurationMinutes(mins)}
                className={`min-h-[44px] py-2.5 px-2 rounded-2xl border font-bold text-xs transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                  isSelected
                    ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-xs'
                    : 'border-border-default bg-surface-card text-text-secondary hover:border-border-hover'
                }`}
              >
                <span className="text-sm">{mins}m</span>
                <span className="text-[9px] font-normal text-text-muted">minutos</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. SELEÇÃO E ESTRATÉGIA DE TAREFAS */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tarefas da Força-Tarefa ({selectedTasks.length})</span>
          </label>
          <button
            type="button"
            id="chaos-add-task-btn"
            onClick={handleOpenTaskPicker}
            className="min-h-[36px] px-2.5 py-1 text-xs font-bold text-brand-primary hover:bg-brand-primary-soft rounded-xl transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar tarefas em lote</span>
          </button>
        </div>

        {/* Modal / Dialog de Seleção Múltipla em Lote (UX01) */}
        {isTaskPickerOpen && (
          <div 
            id="chaos-batch-task-picker-modal"
            className="p-4 rounded-3xl bg-surface-subtle border border-brand-primary/30 shadow-lg space-y-3 animate-fadeIn"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black text-text-primary">Adicionar Tarefas da Casa</h4>
                <p className="text-[11px] text-text-muted">
                  Selecione as tarefas que farão parte desta força-tarefa relâmpago.
                </p>
              </div>
              <button
                type="button"
                id="chaos-picker-close-btn"
                onClick={handleCancelTaskPicker}
                aria-label="Fechar seletor de tarefas"
                className="min-w-[36px] min-h-[36px] p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-card transition flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Campo de Busca / Filtro */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                id="chaos-picker-search-input"
                placeholder="Buscar tarefa ou cômodo..."
                value={pickerSearchQuery}
                onChange={e => setPickerSearchQuery(e.target.value)}
                className="w-full min-h-[40px] pl-8.5 pr-3 text-xs rounded-xl bg-surface-card border border-border-default focus:border-brand-primary focus:outline-hidden text-text-primary"
              />
            </div>

            {/* Barra de Ações Rápidas de Seleção */}
            <div className="flex items-center justify-between text-[11px] font-semibold text-text-secondary pt-1">
              <span>{filteredAvailableTasks.length} tarefas disponíveis</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id="chaos-picker-select-all-btn"
                  onClick={handleSelectAllVisible}
                  className="text-brand-primary hover:underline cursor-pointer"
                >
                  Selecionar todas visíveis
                </button>
                <span>·</span>
                <button
                  type="button"
                  id="chaos-picker-deselect-all-btn"
                  onClick={handleDeselectAllVisible}
                  className="text-text-muted hover:underline cursor-pointer"
                >
                  Desmarcar todas
                </button>
              </div>
            </div>

            {/* Lista com Checkboxes Individuais */}
            {filteredAvailableTasks.length === 0 ? (
              <div className="p-4 rounded-2xl bg-surface-card border border-border-default text-center text-xs text-text-muted">
                {pickerSearchQuery ? 'Nenhuma tarefa encontrada para esta busca.' : 'Todas as tarefas ativas da casa já foram adicionadas.'}
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1" id="chaos-picker-task-list">
                {filteredAvailableTasks.map(ft => {
                  const room = rooms.find(r => r.id === ft.room_id);
                  const isChecked = tempSelectedTaskIds.has(ft.id);

                  return (
                    <button
                      type="button"
                      key={ft.id}
                      id={`chaos-picker-item-${ft.id}`}
                      onClick={() => toggleTempTask(ft.id)}
                      className={`w-full min-h-[44px] p-2.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                        isChecked
                          ? 'border-brand-primary bg-brand-primary-soft text-text-primary'
                          : 'border-border-default bg-surface-card hover:border-border-hover text-text-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-brand-primary shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-text-muted shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-text-primary truncate">
                            {ft.customTitle || ft.custom_title || ft.name || (ft as any).title || 'Tarefa'}
                          </p>
                          <p className="text-[10px] text-text-muted truncate">
                            {room?.name || 'Geral'} · +{(ft as any)?.reward_points || (ft as any)?.points || 10} pts
                          </p>
                        </div>
                      </div>
                      {ft.chaosEligible && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                          Sugerida
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Tarefas concluídas hoje (não selecionáveis) */}
                {completedTodayFamilyTasks.map(ft => {
                  const room = rooms.find(r => r.id === ft.room_id);
                  return (
                    <div
                      key={ft.id}
                      id={`chaos-picker-completed-today-${ft.id}`}
                      className="w-full min-h-[44px] p-2.5 rounded-2xl border border-border-default/40 bg-surface-subtle/30 text-text-muted opacity-60 flex items-center justify-between gap-3 cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Check className="w-4 h-4 text-state-success shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-text-muted truncate">
                            {ft.customTitle || ft.custom_title || ft.name || (ft as any).title || 'Tarefa'}
                          </p>
                          <p className="text-[10px] text-text-muted truncate">
                            {room?.name || 'Geral'} · Concluída hoje
                          </p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-state-success-soft text-state-success shrink-0">
                        ✓ Já concluída hoje
                      </span>
                    </div>
                  );
                })}

                {/* HF5: Tarefas avulsas ONE_TIME já concluídas em datas anteriores (não selecionáveis) */}
                {completedOneTimeEarlierFamilyTasks.map(ft => {
                  const room = rooms.find(r => r.id === ft.room_id);
                  return (
                    <div
                      key={ft.id}
                      id={`chaos-picker-completed-onetime-${ft.id}`}
                      className="w-full min-h-[44px] p-2.5 rounded-2xl border border-border-default/40 bg-surface-subtle/30 text-text-muted opacity-60 flex items-center justify-between gap-3 cursor-not-allowed"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Check className="w-4 h-4 text-state-success shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-text-muted truncate">
                            {ft.customTitle || ft.custom_title || ft.name || (ft as any).title || 'Tarefa'}
                          </p>
                          <p className="text-[10px] text-text-muted truncate">
                            {room?.name || 'Geral'} · Já concluída
                          </p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-surface-subtle text-text-muted border border-border-default text-[9px] font-bold shrink-0">
                        ✓ Já concluída
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Rodapé do Seletor */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-border-default">
              <button
                type="button"
                id="chaos-picker-cancel-btn"
                onClick={handleCancelTaskPicker}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-text-secondary hover:bg-surface-card transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="chaos-picker-confirm-btn"
                onClick={handleConfirmBatchAdd}
                disabled={tempSelectedTaskIds.size === 0}
                className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                  tempSelectedTaskIds.size > 0
                    ? 'bg-brand-primary text-white hover:opacity-90 cursor-pointer shadow-xs'
                    : 'bg-surface-card text-text-muted border border-border-default cursor-not-allowed opacity-60'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>
                  {tempSelectedTaskIds.size === 1
                    ? 'Adicionar 1 tarefa'
                    : `Adicionar ${tempSelectedTaskIds.size} tarefas`}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Lista de tarefas configuradas para a sessão */}
        {selectedTasks.length === 0 ? (
          <div className="p-4 rounded-2xl bg-surface-subtle border border-dashed border-border-default text-center text-xs text-text-muted">
            Nenhuma tarefa selecionada. Adicione tarefas para iniciar a força-tarefa.
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1" id="chaos-selected-tasks-list">
            {selectedTasks.map(item => {
              const ft = familyTasks.find(f => f.id === item.familyTaskId);
              const room = rooms.find(r => r.id === ft?.room_id);
              const isDistributed = item.strategy === 'DISTRIBUTED';

              return (
                <div
                  key={item.familyTaskId}
                  id={`chaos-task-item-${item.familyTaskId}`}
                  className="p-3 rounded-2xl bg-surface-card border border-border-default hover:border-brand-primary/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-text-primary truncate">
                        {ft?.customTitle || ft?.custom_title || ft?.name || (ft as any)?.title || 'Tarefa'}
                      </p>
                      {item.isSuggested && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          ✨ Sugerida para o Caos
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-text-muted mt-0.5">
                      {room?.name || 'Geral'} · +{(ft as any)?.reward_points || (ft as any)?.points || 10} pts
                    </p>
                  </div>

                  {/* Seletor de Estratégia Visual (FUNC01) */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      type="button"
                      id={`chaos-strategy-toggle-${item.familyTaskId}`}
                      onClick={() => toggleStrategy(item.familyTaskId)}
                      title={
                        isDistributed
                          ? 'O CasaJunto escolhe quem pode fazer considerando segurança, disponibilidade e equilíbrio das tarefas.'
                          : 'A tarefa fica disponível para os participantes assumirem.'
                      }
                      className={`min-h-[44px] px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                        isDistributed
                          ? 'border-brand-primary/40 bg-brand-primary-soft text-brand-primary'
                          : 'border-state-success-soft bg-state-success-soft/40 text-state-success'
                      }`}
                    >
                      <span>
                        {isDistributed ? '👤 Distribuir automaticamente' : '⚡ Quem puder fazer'}
                      </span>
                    </button>

                    <button
                      type="button"
                      id={`chaos-remove-task-${item.familyTaskId}`}
                      onClick={() => removeTask(item.familyTaskId)}
                      aria-label="Remover tarefa da sessão"
                      className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-text-muted hover:text-state-error hover:bg-state-error-soft/30 transition flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Explicação de Estratégias (FUNC01) */}
        <div className="p-2.5 rounded-xl bg-surface-subtle border border-border-default text-[10px] text-text-secondary space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-text-primary">
            <Info className="w-3 h-3 text-brand-primary shrink-0" />
            <span>Como funcionam as estratégias de tarefas:</span>
          </div>
          <p>
            <strong className="text-brand-primary">Distribuir automaticamente:</strong> O CasaJunto escolhe quem pode fazer considerando segurança, disponibilidade e equilíbrio das tarefas.
          </p>
          <p>
            <strong className="text-state-success">Quem puder fazer:</strong> A tarefa fica disponível no painel para qualquer participante pegar quando estiver livre.
          </p>
        </div>
      </div>

      {/* RESUMO SIMPLES ANTES DE INICIAR */}
      <div className="p-3.5 rounded-2xl bg-surface-subtle border border-border-default flex items-center justify-between text-xs font-bold text-text-secondary">
        <span>Resumo da Missão:</span>
        <span id="chaos-pre-start-summary" className="text-amber-600 dark:text-amber-400">
          {selectedMemberIds.length} participantes · {selectedTasks.length} tarefas · {durationMinutes} minutos
        </span>
      </div>

      {/* CTA PRINCIPAL DE INÍCIO */}
      <div className="pt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="min-h-[44px] flex-1 py-3 px-4 rounded-2xl border border-border-default font-bold text-xs text-text-secondary hover:bg-surface-card transition cursor-pointer"
        >
          Cancelar
        </button>

        <button
          type="button"
          id="chaos-start-session-btn"
          onClick={handleStartChaos}
          disabled={isSubmitting || selectedMemberIds.length === 0 || selectedTasks.length === 0}
          className={`min-h-[44px] flex-2 py-3 px-4 rounded-2xl font-black text-xs text-white transition flex items-center justify-center gap-2 shadow-md ${
            isSubmitting || selectedMemberIds.length === 0 || selectedTasks.length === 0
              ? 'bg-amber-500/50 cursor-not-allowed opacity-60'
              : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 cursor-pointer'
          }`}
        >
          {isSubmitting ? (
            <span>Iniciando Força-Tarefa...</span>
          ) : (
            <>
              <span>🔥 Iniciar Modo Caos</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
