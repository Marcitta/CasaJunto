import React, { useState, useMemo, useContext } from 'react';
import { 
  Search, 
  Check, 
  Plus, 
  CheckSquare, 
  Square, 
  RotateCcw, 
  Trash2, 
  AlertCircle, 
  ShieldAlert, 
  SlidersHorizontal,
  Clock,
  Pause,
  Edit3,
  MoreHorizontal,
  Sparkles,
  X
} from 'lucide-react';
import { allMasterTasks, taskCategoryLabels, roomTypeLabels } from '../data/tasks';
import { useApp } from '../context/AppContext';
import { AuthContext } from '../context/AuthContext';
import { TaskMaster, FamilyTask, Room, BatchAddRoutineInput } from '../types';
import { BatchConfigurationModal } from './BatchConfigurationModal';
import { BatchRemoveModal } from './BatchRemoveModal';
import { EditFamilyTaskModal } from './EditFamilyTaskModal';
import { AddRoutineToRoomModal } from './AddRoutineToRoomModal';
import { formatExecutionTargetDisplay } from '../services/domesticSupportService';

export const TaskCatalogView: React.FC = () => {
  const { 
    familyTasks, 
    rooms, 
    currentMember, 
    domesticSupports,
    isDemoMode: appDemoMode,
    family,
    batchAddRoutines, 
    batchDeactivateRoutines 
  } = useApp();
  const authContext = useContext(AuthContext);
  const currentUser = authContext?.currentUser;
  const currentFamily = authContext?.currentFamily || family;
  const currentMembership = authContext?.currentMembership;
  const isDemoMode = Boolean(appDemoMode || authContext?.isDemoMode);

  // Filters State
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedRoomType, setSelectedRoomType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'available' | 'active' | 'inactive'>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Multi-selection State (Set of task master IDs)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Dropdown menu state for active card actions
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);
  const [openEditMenuTaskId, setOpenEditMenuTaskId] = useState<string | null>(null);

  // Modal State
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [tasksForConfig, setTasksForConfig] = useState<TaskMaster[]>([]);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [tasksForRemove, setTasksForRemove] = useState<Array<{ taskMaster: TaskMaster; familyTask: FamilyTask }>>([]);
  const [editingFamilyTaskId, setEditingFamilyTaskId] = useState<string | null>(null);

  // Multiambiente Modal State (Fase B.5.2)
  const [isAddRoomModalOpen, setIsAddRoomModalOpen] = useState(false);
  const [taskForAddRoom, setTaskForAddRoom] = useState<TaskMaster | null>(null);

  // Submitting / Loading State
  const [isSubmitting, setIsSubmitting] = useState(false);

  // User Feedback Toast / Alert
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // RBAC: Check if current caller is ADMIN
  const isAdmin = currentMember 
    ? currentMember.role === 'ADMIN' 
    : Boolean(
        isDemoMode ||
        authContext?.currentMembership?.role === 'ADMIN'
      );

  // Custom FamilyTasks (belonging only to current family, without TaskMaster)
  const customCatalogItems = useMemo(() => {
    return familyTasks
      .filter(ft => !ft.task_master_id && !ft.taskMasterId)
      .map(ft => {
        const room = rooms.find(r => r.id === (ft.room_id || ft.roomId));
        const item: TaskMaster & { isCustom?: boolean; familyTaskId?: string } = {
          id: ft.id,
          name: ft.customTitle || ft.custom_title || ft.name || 'Tarefa Customizada',
          description: ft.customDescription || ft.custom_description || 'Tarefa personalizada da família',
          category: (ft.category as any) || 'cleaning',
          room_type: room?.type || (ft as any).room_type || 'other',
          effort_level: (ft as any).effort_level || 2,
          duration_minutes: ft.estimated_minutes || 20,
          frequency: (ft.frequency as any) || 'DAILY',
          isCustom: true,
          familyTaskId: ft.id
        };
        return item;
      });
  }, [familyTasks, rooms]);

  const allCatalogTasks = useMemo(() => {
    return [...allMasterTasks, ...customCatalogItems];
  }, [customCatalogItems]);

  // Map TaskMaster ID to list of active FamilyTasks (Multiambiente B.5.2)
  const activeRoutinesByTask = useMemo(() => {
    const map = new Map<string, FamilyTask[]>();
    familyTasks.forEach(ft => {
      if (ft.active === false) return;
      const tmId = ft.task_master_id || ft.taskMasterId || ft.task_id || ft.taskId || ft.id;
      if (tmId) {
        const list = map.get(tmId) || [];
        list.push(ft);
        map.set(tmId, list);
      }
    });
    return map;
  }, [familyTasks]);

  // Map TaskMaster ID to list of inactive FamilyTasks
  const inactiveRoutinesByTask = useMemo(() => {
    const map = new Map<string, FamilyTask[]>();
    familyTasks.forEach(ft => {
      if (ft.active !== false) return;
      const tmId = ft.task_master_id || ft.taskMasterId || ft.task_id || ft.taskId || ft.id;
      if (tmId) {
        const list = map.get(tmId) || [];
        list.push(ft);
        map.set(tmId, list);
      }
    });
    return map;
  }, [familyTasks]);

  // Map TaskMaster ID or Custom FamilyTask ID to active/inactive FamilyTask
  const familyTaskMap = useMemo(() => {
    const map = new Map<string, FamilyTask>();
    familyTasks.forEach(ft => {
      const tmId = ft.task_master_id || ft.taskMasterId || ft.task_id || ft.taskId;
      if (tmId) {
        if (!map.has(tmId) || ft.active !== false) {
          map.set(tmId, ft);
        }
      }
      if (!map.has(ft.id) || ft.active !== false) {
        map.set(ft.id, ft);
      }
    });
    return map;
  }, [familyTasks]);

  // Compute status for a task master or custom family task
  const getTaskStatus = (taskId: string): 'AVAILABLE' | 'ACTIVE' | 'INACTIVE' => {
    const activeList = activeRoutinesByTask.get(taskId);
    if (activeList && activeList.length > 0) return 'ACTIVE';
    const inactiveList = inactiveRoutinesByTask.get(taskId);
    if (inactiveList && inactiveList.length > 0) return 'INACTIVE';
    return 'AVAILABLE';
  };

  // Real Counts for Quick Navigation Chips
  const totalCount = allCatalogTasks.length;
  const activeCount = useMemo(() => {
    return allCatalogTasks.filter(t => getTaskStatus(t.id) === 'ACTIVE').length;
  }, [allCatalogTasks, activeRoutinesByTask]);
  const availableCount = useMemo(() => {
    return allCatalogTasks.filter(t => getTaskStatus(t.id) !== 'ACTIVE').length;
  }, [allCatalogTasks, activeRoutinesByTask]);

  // Filter tasks based on search, category, room_type, and status
  const visibleTasks = useMemo(() => {
    return allCatalogTasks.filter(task => {
      // Text Search
      if (search.trim()) {
        const query = search.toLowerCase();
        const ft = familyTaskMap.get(task.id);
        const taskName = (ft?.customTitle || ft?.custom_title || task.name).toLowerCase();
        const taskDesc = (ft?.customDescription || ft?.custom_description || task.description).toLowerCase();
        const roomLabel = task.room_type ? (roomTypeLabels[task.room_type] || task.room_type).toLowerCase() : '';
        const categoryLabel = task.category ? (taskCategoryLabels[task.category]?.label || task.category).toLowerCase() : '';
        if (!taskName.includes(query) && !taskDesc.includes(query) && !roomLabel.includes(query) && !categoryLabel.includes(query)) {
          return false;
        }
      }

      // Category Filter
      if (selectedCategory !== 'all' && task.category !== selectedCategory) {
        return false;
      }

      // Room Type Filter
      if (selectedRoomType !== 'all' && task.room_type !== selectedRoomType) {
        return false;
      }

      // Status Filter
      const status = getTaskStatus(task.id);
      if (selectedStatus === 'active') {
        if (status !== 'ACTIVE') return false;
      } else if (selectedStatus === 'available') {
        // Disponíveis = TaskMasters ainda não ativos para a família + itens reativáveis
        if (status === 'ACTIVE') return false;
      } else if (selectedStatus === 'inactive') {
        if (status !== 'INACTIVE') return false;
      }

      return true;
    });
  }, [allCatalogTasks, search, selectedCategory, selectedRoomType, selectedStatus, familyTaskMap]);

  // Selected Tasks Breakdown
  const selectedTasksList = useMemo(() => {
    return allCatalogTasks.filter(t => selectedTaskIds.has(t.id));
  }, [allCatalogTasks, selectedTaskIds]);

  const tasksToAddOrReactivate = useMemo(() => {
    return selectedTasksList.filter(t => getTaskStatus(t.id) !== 'ACTIVE');
  }, [selectedTasksList, familyTaskMap]);

  const tasksToRemove = useMemo(() => {
    const list: Array<{ taskMaster: TaskMaster; familyTask: FamilyTask }> = [];
    selectedTasksList.forEach(t => {
      const ft = familyTaskMap.get(t.id);
      if (ft && ft.active) {
        list.push({ taskMaster: t, familyTask: ft });
      }
    });
    return list;
  }, [selectedTasksList, familyTaskMap]);

  // Visible Selection State (for Select All visible)
  const visibleTaskIds = useMemo(() => visibleTasks.map(t => t.id), [visibleTasks]);
  const allVisibleSelected = visibleTaskIds.length > 0 && visibleTaskIds.every(id => selectedTaskIds.has(id));

  // Toggle single task selection
  const handleToggleSelect = (taskId: string) => {
    if (!isAdmin) return;
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Filter-aware Select All visible tasks
  const handleToggleSelectAllVisible = () => {
    if (!isAdmin) return;
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        // Deselect only currently visible items
        visibleTaskIds.forEach(id => next.delete(id));
      } else {
        // Select all currently visible items (preserving already selected hidden items)
        visibleTaskIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // Clear entire selection
  const handleClearSelection = () => {
    setSelectedTaskIds(new Set());
  };

  // Open batch add configuration (Fase B.5.3: permite configurar qualquer tarefa selecionada em multiambiente)
  const handleOpenBatchConfig = () => {
    if (!isAdmin || selectedTasksList.length === 0) return;
    setTasksForConfig(selectedTasksList);
    setIsConfigModalOpen(true);
  };

  // Open batch remove confirmation
  const handleOpenBatchRemove = () => {
    if (!isAdmin || tasksToRemove.length === 0) return;
    setTasksForRemove(tasksToRemove);
    setIsRemoveModalOpen(true);
  };

  // Open single task configure (Fase B.5.2: utiliza AddRoutineToRoomModal)
  const handleOpenSingleConfig = (task: TaskMaster) => {
    if (!isAdmin) return;
    setTaskForAddRoom(task);
    setIsAddRoomModalOpen(true);
  };

  // Open add routine to another room modal (Fase B.5.2)
  const handleOpenAddAnotherRoom = (task: TaskMaster) => {
    if (!isAdmin) return;
    setTaskForAddRoom(task);
    setIsAddRoomModalOpen(true);
  };

  // Confirm single routine add or reactivation
  const handleConfirmSingleAddRoutine = async (config: BatchAddRoutineInput) => {
    setIsSubmitting(true);
    try {
      const result = await batchAddRoutines([config]);
      const roomName = rooms.find(r => r.id === config.roomId)?.name || 'ambiente';
      if (result.reactivated > 0) {
        setFeedbackMessage({
          type: 'success',
          text: `Rotina de "${config.name}" reativada com sucesso no ambiente "${roomName}".`
        });
      } else if (result.added > 0) {
        setFeedbackMessage({
          type: 'success',
          text: `Rotina de "${config.name}" adicionada com sucesso ao ambiente "${roomName}".`
        });
      } else if (result.skipped > 0) {
        setFeedbackMessage({
          type: 'info',
          text: `A rotina de "${config.name}" já estava ativa no ambiente "${roomName}".`
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Erro ao adicionar rotina: ${err?.message || 'Falha desconhecida.'}`
      });
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open single task remove
  const handleOpenSingleRemove = (task: TaskMaster) => {
    if (!isAdmin) return;
    const ft = familyTaskMap.get(task.id);
    if (!ft) return;
    setTasksForRemove([{ taskMaster: task, familyTask: ft }]);
    setIsRemoveModalOpen(true);
  };

  // Execute Batch Add
  const handleConfirmBatchAdd = async (configs: BatchAddRoutineInput[]) => {
    setIsSubmitting(true);
    try {
      const result = await batchAddRoutines(configs);
      setIsConfigModalOpen(false);

      // Remove configured tasks from selection
      setSelectedTaskIds(prev => {
        const next = new Set(prev);
        configs.forEach(c => next.delete(c.taskMasterId));
        return next;
      });

      if (result.failed.length > 0) {
        setFeedbackMessage({
          type: 'error',
          text: `Atenção: ${result.added + result.reactivated} rotinas foram adicionadas/reativadas, mas ${result.failed.length} falharam: ${result.failed.join(', ')}.`
        });
      } else {
        const parts: string[] = [];
        if (result.added > 0) parts.push(`${result.added} ${result.added === 1 ? 'nova rotina adicionada' : 'novas rotinas adicionadas'}`);
        if (result.reactivated > 0) parts.push(`${result.reactivated} ${result.reactivated === 1 ? 'rotina reativada' : 'rotinas reativadas'}`);
        if (result.skipped > 0) parts.push(`${result.skipped} já ativas`);
        setFeedbackMessage({
          type: 'success',
          text: `Sucesso: ${parts.join(', ')} à sua casa.`
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Erro ao adicionar rotinas: ${err?.message || 'Falha desconhecida.'}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Execute Batch Remove
  const handleConfirmBatchRemove = async () => {
    setIsSubmitting(true);
    try {
      const routineIds = tasksForRemove.map(t => t.familyTask.id);
      const result = await batchDeactivateRoutines(routineIds);
      setIsRemoveModalOpen(false);

      // Remove from selection
      setSelectedTaskIds(prev => {
        const next = new Set(prev);
        tasksForRemove.forEach(t => next.delete(t.taskMaster.id));
        return next;
      });

      if (result.failed.length > 0) {
        setFeedbackMessage({
          type: 'error',
          text: `Atenção: ${result.deactivated} rotinas foram desativadas, mas ${result.failed.length} falharam.`
        });
      } else {
        setFeedbackMessage({
          type: 'success',
          text: `${result.deactivated} ${result.deactivated === 1 ? 'tarefa desativada' : 'tarefas desativadas'} da rotina da casa. Ocorrências futuras foram canceladas e o histórico está seguro.`
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: `Erro ao remover rotinas: ${err?.message || 'Falha desconhecida.'}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeFiltersCount = (selectedCategory !== 'all' ? 1 : 0) + (selectedRoomType !== 'all' ? 1 : 0);
  const hasActiveFilters = activeFiltersCount > 0;

  return (
    <div className="p-4 sm:p-6 w-full max-w-7xl mx-auto space-y-4 pb-28">
      {/* Accessible Title for screen readers (prevents duplicate visual title as requested in UX-CATALOG-1) */}
      <h1 className="sr-only">Catálogo de Tarefas Domésticas</h1>

      {/* RBAC Read-Only Banner for Non-Admin Members */}
      {!isAdmin && (
        <div
          id="catalog-member-readonly-banner"
          className="p-3 bg-state-warning-soft border border-state-warning/30 rounded-2xl flex items-center gap-2.5 text-xs text-state-warning"
          role="alert"
        >
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            <strong>Modo Visualização:</strong> Apenas membros administradores podem adicionar, desativar ou configurar tarefas no catálogo da casa.
          </span>
        </div>
      )}

      {/* User Feedback Toast */}
      {feedbackMessage && (
        <div
          id="catalog-feedback"
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs sm:text-sm ${
            feedbackMessage.type === 'success'
              ? 'bg-state-success-soft border-state-success/30 text-state-success'
              : 'bg-state-error-soft border-state-error/30 text-state-error'
          }`}
          role="alert"
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-xs font-bold hover:opacity-80 transition cursor-pointer"
            aria-label="Fechar notificação"
          >
            ✕
          </button>
        </div>
      )}

      {/* Compact Search & Filter Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full">
          {/* Search Field */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="catalog-search"
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tarefas por nome, ambiente ou categoria..."
              className="w-full pl-10 pr-9 py-2 rounded-xl border border-border-default bg-surface-card text-xs sm:text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent transition-all shadow-2xs"
              aria-label="Buscar tarefas no catálogo"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary rounded-lg transition"
                aria-label="Limpar busca"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Toggle Filters Button */}
          <button
            id="btn-toggle-filters"
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shrink-0 ${
              hasActiveFilters || isFilterOpen
                ? 'bg-brand-primary-soft text-brand-primary border-brand-primary/40'
                : 'bg-surface-card text-text-secondary border-border-default hover:bg-surface-subtle'
            }`}
            aria-label="Filtros detalhados"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-brand-primary text-text-on-primary text-[10px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Expandable Filter Panel */}
        {isFilterOpen && (
          <div 
            id="catalog-filter-popover"
            className="p-3.5 bg-surface-card rounded-2xl border border-border-default shadow-xs flex flex-wrap items-end gap-3 animate-in fade-in duration-150"
          >
            <div className="flex-1 min-w-[180px]">
              <label htmlFor="filter-category" className="block text-[11px] font-semibold text-text-secondary mb-1">
                Categoria
              </label>
              <select
                id="filter-category"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="w-full bg-surface-subtle border border-border-default rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
              >
                <option value="all">Todas as Categorias</option>
                {Object.entries(taskCategoryLabels).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.icon} {info.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[180px]">
              <label htmlFor="filter-room-type" className="block text-[11px] font-semibold text-text-secondary mb-1">
                Ambiente / Cômodo
              </label>
              <select
                id="filter-room-type"
                value={selectedRoomType}
                onChange={e => setSelectedRoomType(e.target.value)}
                className="w-full bg-surface-subtle border border-border-default rounded-xl px-2.5 py-1.5 text-xs text-text-primary focus:ring-2 focus:ring-brand-primary focus:outline-none"
              >
                <option value="all">Todos os Cômodos</option>
                {Object.entries(roomTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedRoomType('all');
                }}
                className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary-soft rounded-xl transition cursor-pointer"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Hidden select for backwards compatibility with test tools */}
        <select
          id="filter-status"
          value={selectedStatus}
          onChange={e => setSelectedStatus(e.target.value as any)}
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
        >
          <option value="all">Todos</option>
          <option value="available">Disponíveis</option>
          <option value="active">Na minha casa</option>
          <option value="inactive">Inativas</option>
        </select>

        {/* Status Chips Navigation & Batch Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          {/* Status Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar">
            <button
              id="chip-status-all"
              type="button"
              onClick={() => setSelectedStatus('all')}
              className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                selectedStatus === 'all'
                  ? 'bg-brand-primary text-text-on-primary shadow-xs'
                  : 'bg-surface-card border border-border-default text-text-secondary hover:bg-surface-subtle'
              }`}
            >
              Todas ({totalCount})
            </button>

            <button
              id="chip-status-active"
              type="button"
              onClick={() => setSelectedStatus('active')}
              className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                selectedStatus === 'active'
                  ? 'bg-brand-primary text-text-on-primary shadow-xs'
                  : 'bg-surface-card border border-border-default text-text-secondary hover:bg-surface-subtle'
              }`}
            >
              Na minha casa ({activeCount})
            </button>

            <button
              id="chip-status-available"
              type="button"
              onClick={() => setSelectedStatus('available')}
              className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                selectedStatus === 'available'
                  ? 'bg-brand-primary text-text-on-primary shadow-xs'
                  : 'bg-surface-card border border-border-default text-text-secondary hover:bg-surface-subtle'
              }`}
            >
              Disponíveis ({availableCount})
            </button>
          </div>

          {/* Select all visible & counter */}
          <div className="flex items-center gap-3 text-xs text-text-secondary">
            {isAdmin && (
              <button
                id="btn-select-all"
                type="button"
                onClick={handleToggleSelectAllVisible}
                disabled={visibleTasks.length === 0}
                className="min-h-[34px] px-3 py-1.5 rounded-xl border border-border-default bg-surface-card hover:bg-surface-subtle font-medium text-text-primary flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={allVisibleSelected ? 'Desmarcar visíveis' : 'Selecionar todas as tarefas visíveis'}
              >
                {allVisibleSelected ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-brand-primary" />
                    <span>Desmarcar visíveis</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 text-text-muted" />
                    <span>Selecionar visíveis</span>
                  </>
                )}
              </button>
            )}

            <span id="catalog-visible-count" className="font-medium text-text-muted hidden sm:inline">
              {visibleTasks.length} de {totalCount} tarefas
            </span>
          </div>
        </div>
      </div>

      {/* Floating Sticky Contextual Batch Action Bar */}
      <div
        id="catalog-batch-bar"
        className={
          selectedTaskIds.size > 0
            ? "fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-2xl bg-surface-card/95 backdrop-blur-md border border-border-default shadow-xl rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-3 duration-200"
            : "hidden"
        }
      >
        <div className="flex items-center gap-2 sm:gap-3" id="selection-counter" aria-live="polite">
          <span className="font-bold text-xs sm:text-sm text-text-primary">
            {selectedTaskIds.size} {selectedTaskIds.size === 1 ? 'selecionada' : 'selecionadas'}
          </span>
          <span className="text-[11px] text-text-muted hidden sm:inline">
            ({tasksToAddOrReactivate.length} disponíveis, {tasksToRemove.length} ativas)
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Batch Add button */}
          <button
            id="btn-batch-add"
            type="button"
            onClick={handleOpenBatchConfig}
            disabled={!isAdmin || selectedTasksList.length === 0}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-xl font-bold text-xs bg-brand-primary text-text-on-primary hover:bg-brand-primary-hover shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              selectedTasksList.length === 0 ? 'hidden' : ''
            }`}
            aria-label="Adicionar em lote"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar em lote ({selectedTasksList.length})</span>
          </button>

          {/* Batch Remove button */}
          {tasksToRemove.length > 0 && (
            <button
              id="btn-batch-remove"
              type="button"
              onClick={handleOpenBatchRemove}
              disabled={!isAdmin}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl font-bold text-xs bg-state-error text-white hover:bg-red-700 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
              aria-label="Remover tarefas ativas selecionadas"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remover ({tasksToRemove.length})</span>
            </button>
          )}

          {/* Clear selection */}
          <button
            id="btn-clear-selection"
            type="button"
            onClick={handleClearSelection}
            disabled={!isAdmin}
            className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary hover:bg-surface-subtle transition cursor-pointer"
            aria-label="Limpar seleção"
          >
            Limpar seleção
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      {visibleTasks.length === 0 ? (
        <div
          id="catalog-empty-state"
          className="p-12 text-center bg-surface-card rounded-2xl border border-border-default text-text-muted shadow-2xs"
        >
          <p className="text-sm font-semibold text-text-primary">Nenhuma tarefa encontrada</p>
          <p className="text-xs mt-1 text-text-secondary">Tente ajustar os filtros ou termos de busca para encontrar outras tarefas.</p>
        </div>
      ) : (
        <div
          id="catalog-cards-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4"
        >
          {visibleTasks.map(task => {
            const isSelected = selectedTaskIds.has(task.id);
            const status = getTaskStatus(task.id);
            const activeRoutines = activeRoutinesByTask.get(task.id) || [];
            const activeRoomsForTask = activeRoutines
              .map(ft => rooms.find(r => r.id === (ft.room_id || ft.roomId)))
              .filter(Boolean) as Room[];
            const catInfo = taskCategoryLabels[task.category] || { label: task.category, icon: '📋', color: '#5b32a3', bg: '#f5f0ff' };
            const roomLabel = task.room_type ? (roomTypeLabels[task.room_type] || task.room_type) : 'Geral';
            const effortPts = task.effort_level ? task.effort_level * 5 : 10;

            const ft = familyTaskMap.get(task.id);
            const displayName = ft?.customTitle || ft?.custom_title || task.name;
            const displayDesc = ft?.customDescription || ft?.custom_description || task.description;

            return (
              <div
                key={task.id}
                id={`task-card-${task.id}`}
                data-selected={isSelected}
                data-status={status}
                className={`p-4 rounded-2xl bg-surface-card border transition-all flex flex-col justify-between relative group ${
                  isSelected
                    ? 'ring-2 ring-brand-primary border-brand-primary bg-brand-primary-soft/30 shadow-xs'
                    : 'border-border-default hover:border-brand-primary/40 shadow-2xs'
                }`}
              >
                <div>
                  {/* Top Bar: Discreet Checkbox & Status Indicator */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    {/* Checkbox with accessible tap target >= 44x44px */}
                    <label
                      htmlFor={`task-select-${task.id}`}
                      className="min-h-[44px] min-w-[44px] -ml-2.5 -mt-2.5 flex items-center justify-center cursor-pointer rounded-xl hover:bg-surface-subtle transition-colors"
                    >
                      <input
                        id={`task-select-${task.id}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(task.id)}
                        disabled={!isAdmin}
                        className="w-4 h-4 rounded border-border-default text-brand-primary focus:ring-brand-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Selecionar ${displayName}`}
                      />
                    </label>

                    {/* Subtle Status & Execution Target Indicator */}
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap justify-end">
                      {ft && (
                        <span
                          id={`task-target-${task.id}`}
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                            status === 'INACTIVE'
                              ? 'bg-surface-subtle border-border-default text-text-muted opacity-70'
                              : 'bg-surface-card border-border-default text-text-secondary'
                          }`}
                        >
                          {formatExecutionTargetDisplay(ft, domesticSupports).label}
                        </span>
                      )}

                      {/* Requisito 3: Apresentação compatível com múltiplos ambientes */}
                      {activeRoomsForTask.length > 1 ? (
                        <span
                          id={`task-status-${task.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-success-soft text-state-success"
                        >
                          <Check className="w-3 h-3" />
                          <span>{activeRoomsForTask.length} ambientes</span>
                        </span>
                      ) : activeRoomsForTask.length === 1 ? (
                        <span
                          id={`task-status-${task.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-success-soft text-state-success"
                        >
                          <Check className="w-3 h-3" />
                          <span>Na casa</span>
                        </span>
                      ) : status === 'INACTIVE' ? (
                        <span
                          id={`task-status-${task.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-state-warning-soft text-state-warning"
                        >
                          <Pause className="w-3 h-3" />
                          <span>Pausada</span>
                        </span>
                      ) : (
                        <span
                          id={`task-status-${task.id}`}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-surface-subtle text-text-muted border border-border-default/60"
                        >
                          <span>Disponível</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 1. Nome (customTitle prioritized) */}
                  <h3 
                    title={displayName}
                    className="text-sm font-bold text-text-primary leading-tight line-clamp-1 group-hover:text-brand-primary transition-colors"
                  >
                    {displayName}
                  </h3>

                  {/* 2. Ambiente / Categoria */}
                  <div className="flex items-center gap-1.5 text-[11px] text-text-secondary font-medium mt-1">
                    <span className="px-1.5 py-0.5 rounded bg-surface-subtle text-text-secondary font-semibold">
                      {roomLabel}
                    </span>
                    <span>•</span>
                    <span className="truncate">{catInfo.label}</span>
                  </div>

                  {/* Requisitos 1 e 2: Identificar ambientes ativos e exibir "Ativa em: [nomes]" */}
                  {activeRoomsForTask.length > 0 && (
                    <div 
                      id={`task-active-rooms-${task.id}`}
                      className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand-primary"
                    >
                      <Check className="w-3.5 h-3.5 text-state-success shrink-0" />
                      <span className="truncate">
                        Ativa em: {activeRoomsForTask.map(r => r.name).join(', ')}
                      </span>
                    </div>
                  )}

                  {/* 3. Descrição curta (line-clamp-2) */}
                  <p 
                    title={displayDesc}
                    className="text-xs text-text-secondary line-clamp-2 mt-2 leading-relaxed min-h-[2.5rem]"
                  >
                    {displayDesc}
                  </p>

                  {/* 4. Duração + Pontos */}
                  <div className="flex items-center justify-between text-[11px] text-text-muted mt-2.5 pt-2 border-t border-border-default/50">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      ~{task.duration_minutes || 20} min
                    </span>
                    <span className="font-semibold text-brand-accent">
                      +{effortPts} pts
                    </span>
                  </div>
                </div>

                {/* 5. Ação */}
                <div className="mt-3 pt-2 flex items-center justify-end gap-1.5 min-h-[36px] relative">
                  {isAdmin ? (
                    status === 'ACTIVE' ? (
                      <div className="flex items-center gap-1.5 w-full justify-between flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Botão Editar (com suporte a múltiplos ambientes) */}
                          <div className="relative">
                            <button
                              id={`btn-edit-family-${task.id}`}
                              type="button"
                              onClick={() => {
                                if (activeRoutines.length === 1) {
                                  setEditingFamilyTaskId(activeRoutines[0].id);
                                } else {
                                  setOpenEditMenuTaskId(openEditMenuTaskId === task.id ? null : task.id);
                                }
                              }}
                              className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-semibold text-brand-primary bg-brand-primary-soft hover:bg-brand-primary hover:text-text-on-primary transition-colors flex items-center gap-1 cursor-pointer"
                              aria-label={`Editar ${displayName} na minha casa`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>

                            {openEditMenuTaskId === task.id && activeRoutines.length > 1 && (
                              <div
                                id={`edit-menu-${task.id}`}
                                className="absolute left-0 bottom-full mb-1 z-20 w-52 bg-surface-card rounded-xl border border-border-default shadow-lg p-1 animate-in fade-in zoom-in-95 duration-100"
                                onMouseLeave={() => setOpenEditMenuTaskId(null)}
                              >
                                <div className="px-2.5 py-1 text-[10px] font-bold text-text-muted uppercase tracking-wider">
                                  Editar por ambiente:
                                </div>
                                {activeRoomsForTask.map(r => {
                                  const ftInRoom = activeRoutines.find(rItem => (rItem.room_id || rItem.roomId) === r.id);
                                  if (!ftInRoom) return null;
                                  return (
                                    <button
                                      key={ftInRoom.id}
                                      id={`btn-edit-room-${ftInRoom.id}`}
                                      type="button"
                                      onClick={() => {
                                        setOpenEditMenuTaskId(null);
                                        setEditingFamilyTaskId(ftInRoom.id);
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-subtle rounded-lg flex items-center justify-between transition-colors cursor-pointer"
                                    >
                                      <span className="truncate">{r.name}</span>
                                      <Edit3 className="w-3 h-3 text-text-muted shrink-0" />
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Requisito 4: + Adicionar a outro ambiente */}
                          <button
                            id={`btn-add-room-${task.id}`}
                            type="button"
                            onClick={() => handleOpenAddAnotherRoom(task)}
                            className="min-h-[36px] px-2.5 py-1.5 rounded-xl text-xs font-bold text-brand-primary bg-surface-card border border-brand-primary/30 hover:border-brand-primary hover:bg-brand-primary-soft/40 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                            aria-label={`Adicionar ${displayName} a outro ambiente`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="whitespace-nowrap">Outro ambiente</span>
                          </button>
                        </div>

                        {/* Menu de Opções */}
                        <div className="relative">
                          <button
                            id={`btn-menu-${task.id}`}
                            type="button"
                            onClick={() => setOpenMenuTaskId(openMenuTaskId === task.id ? null : task.id)}
                            className="min-h-[36px] min-w-[36px] p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-subtle transition-colors flex items-center justify-center cursor-pointer"
                            aria-label="Mais opções"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {openMenuTaskId === task.id && (
                            <div 
                              className="absolute right-0 bottom-full mb-1 z-20 w-52 bg-surface-card rounded-xl border border-border-default shadow-lg p-1 animate-in fade-in zoom-in-95 duration-100"
                              onMouseLeave={() => setOpenMenuTaskId(null)}
                            >
                              <button
                                id={`btn-add-multi-rooms-${task.id}`}
                                type="button"
                                onClick={() => {
                                  setOpenMenuTaskId(null);
                                  setTasksForConfig([task]);
                                  setIsConfigModalOpen(true);
                                }}
                                className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary-soft rounded-lg flex items-center gap-2 transition-colors cursor-pointer border-b border-border-default/60 mb-1 pb-1.5"
                              >
                                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                <span>Adicionar a vários ambientes</span>
                              </button>
                              {activeRoomsForTask.length <= 1 ? (
                                <button
                                  id={`btn-remove-${task.id}`}
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuTaskId(null);
                                    handleOpenSingleRemove(task);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-medium text-state-error hover:bg-state-error-soft rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Remover da minha casa</span>
                                </button>
                              ) : (
                                <>
                                  <div className="px-2.5 py-1 text-[10px] font-bold text-text-muted uppercase tracking-wider">
                                    Remover de ambiente:
                                  </div>
                                  {activeRoomsForTask.map(r => {
                                    const ftInRoom = activeRoutines.find(rItem => (rItem.room_id || rItem.roomId) === r.id);
                                    if (!ftInRoom) return null;
                                    return (
                                      <button
                                        key={ftInRoom.id}
                                        id={`btn-remove-room-${ftInRoom.id}`}
                                        type="button"
                                        onClick={() => {
                                          setOpenMenuTaskId(null);
                                          setTasksForRemove([{ taskMaster: task, familyTask: ftInRoom }]);
                                          setIsRemoveModalOpen(true);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-state-error hover:bg-state-error-soft rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">Remover de {r.name}</span>
                                      </button>
                                    );
                                  })}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : status === 'INACTIVE' ? (
                      <button
                        id={`btn-reactivate-${task.id}`}
                        type="button"
                        onClick={() => handleOpenSingleConfig(task)}
                        className="w-full min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer bg-brand-primary hover:bg-brand-primary-hover text-text-on-primary shadow-2xs"
                        aria-label={`Reativar ${displayName}`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reativar</span>
                      </button>
                    ) : (
                      <button
                        id={`btn-configure-${task.id}`}
                        type="button"
                        onClick={() => handleOpenSingleConfig(task)}
                        className="w-full min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer bg-brand-primary hover:bg-brand-primary-hover text-text-on-primary shadow-2xs"
                        aria-label={`Adicionar ${displayName}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar</span>
                      </button>
                    )
                  ) : (
                    <span className="text-xs text-text-muted font-medium">Apenas admin</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Batch Configuration Modal */}
      <BatchConfigurationModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        selectedTasks={tasksForConfig}
        familyTasks={familyTasks}
        rooms={rooms}
        domesticSupports={domesticSupports}
        onConfirm={handleConfirmBatchAdd}
        isSubmitting={isSubmitting}
      />

      {/* Batch Remove Modal */}
      <BatchRemoveModal
        isOpen={isRemoveModalOpen}
        onClose={() => setIsRemoveModalOpen(false)}
        activeTasksToRemove={tasksForRemove}
        onConfirm={handleConfirmBatchRemove}
        isSubmitting={isSubmitting}
      />

      {/* Edit Family Task Modal */}
      <EditFamilyTaskModal
        isOpen={Boolean(editingFamilyTaskId)}
        onClose={() => setEditingFamilyTaskId(null)}
        familyTaskId={editingFamilyTaskId}
      />

      {/* Add Routine to Another Room Modal (Fase B.5.2) */}
      <AddRoutineToRoomModal
        isOpen={isAddRoomModalOpen}
        onClose={() => {
          setIsAddRoomModalOpen(false);
          setTaskForAddRoom(null);
        }}
        task={taskForAddRoom}
        rooms={rooms || []}
        familyTasks={familyTasks || []}
        domesticSupports={domesticSupports || []}
        onConfirm={handleConfirmSingleAddRoutine}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
