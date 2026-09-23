import React, { useState } from 'react';
import { 
  Calendar, 
  Repeat, 
  Plus, 
  User, 
  Clock, 
  Home, 
  Sliders, 
  PauseCircle, 
  PlayCircle, 
  CheckCircle2, 
  AlertCircle,
  CalendarDays,
  ListChecks
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { FamilyTask, Task } from '../types';
import { EditFamilyTaskModal } from './EditFamilyTaskModal';
import { TaskCreationModal } from './TaskCreationModal';
import { getFamilyLocalDate, addDaysToDate, getDayOfWeek } from '../domain/utils/dateTimeUtils';
import { allMasterTasks } from '../data/tasks';
import { selectVisibleRoutineTasks } from '../domain/rbac/rolePermissions';

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export const RoutineView: React.FC = () => {
  const { 
    tasks, 
    familyTasks, 
    members, 
    rooms, 
    family, 
    currentMember, 
    isDemoMode,
    deactivateRoutine,
    reactivateRoutine,
    updateRoutine,
    setActiveTaskForInspect
  } = useApp();
  const { currentUser, currentMembership } = useAuth();

  const isAdmin = Boolean(
    isDemoMode || 
    currentMembership?.role === 'ADMIN' || 
    currentMember?.role === 'ADMIN'
  );

  const [viewMode, setViewMode] = useState<'WEEKLY' | 'ROUTINES'>('WEEKLY');
  const [selectedDayOffset, setSelectedDayOffset] = useState<number>(0);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const todayStr = getFamilyLocalDate(family?.timezone);

  // Generate 7 consecutive days starting from today
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const dateStr = addDaysToDate(todayStr, i);
    const dayOfWeek = getDayOfWeek(dateStr);
    const rawDayTasks = tasks.filter(t => {
      const taskDate = t.scheduledDate || t.dueDate;
      if (taskDate !== dateStr) return false;
      if ((t.status as string) === 'CANCELLED') return false;
      if (t.familyTaskId) {
        const ft = familyTasks.find(f => f.id === t.familyTaskId);
        if (ft && ft.active === false) return false;
      }
      return true;
    });
    const dayTasks = isAdmin 
      ? rawDayTasks 
      : selectVisibleRoutineTasks(rawDayTasks, currentMember?.id, currentMember?.role);
    return {
      offset: i,
      dateStr,
      dayOfWeek,
      weekdayName: WEEKDAYS[dayOfWeek],
      dayTasksCount: dayTasks.length,
      tasks: dayTasks
    };
  });

  const selectedDay = weekDays[selectedDayOffset] || weekDays[0];

  const handleToggleRoutineActive = async (routine: FamilyTask) => {
    if (!isAdmin) return;
    try {
      const master = allMasterTasks.find(tm => tm.id === (routine.task_master_id || routine.taskMasterId || routine.task_id));
      const routineName = routine.customTitle ?? routine.custom_title ?? routine.name ?? master?.name ?? 'Rotina';
      if (routine.active !== false) {
        await deactivateRoutine(routine.id);
        setActionSuccess(`Rotina "${routineName}" pausada. Não gerará novas ocorrências.`);
      } else {
        await reactivateRoutine(routine.id);
        setActionSuccess(`Rotina "${routineName}" reativada com sucesso!`);
      }
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err: any) {
      console.error('Erro ao alternar status da rotina:', err);
    }
  };

  const frequencies = [
    { key: 'DAILY', label: 'Diárias', match: (f: string) => f === 'DAILY' || f === 'daily' },
    { key: 'WEEKLY', label: 'Semanais', match: (f: string) => f === 'WEEKLY' || f === 'weekly' || f === 'SEVERAL_TIMES_WEEK' },
    { key: 'BIWEEKLY', label: 'Quinzenais', match: (f: string) => f === 'BIWEEKLY' || f === 'biweekly' },
    { key: 'MONTHLY', label: 'Mensais', match: (f: string) => f === 'MONTHLY' || f === 'monthly' }
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-sm font-extrabold text-text-primary">Rotinas & Agenda Semanal</h3>
          <p className="text-xs text-text-secondary">
            Visualize as tarefas programadas para a semana e configure as rotinas canônicas da casa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-brand-primary text-text-on-primary text-xs font-bold shadow-xs hover:bg-brand-primary-hover flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Rotina</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Notification */}
      {actionSuccess && (
        <div className="p-3 rounded-xl bg-state-success-soft border border-state-success/30 text-state-success text-xs flex items-center justify-between font-medium">
          <span>{actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-text-muted hover:text-text-primary ml-2 cursor-pointer">×</button>
        </div>
      )}

      {/* Tabs - Only ADMIN can switch to Rotinas Cadastradas; MEMBER only has Visão Semanal */}
      {isAdmin && (
        <div className="flex items-center gap-2 border-b border-border-default pb-2">
          <button
            onClick={() => setViewMode('WEEKLY')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'WEEKLY'
                ? 'bg-brand-primary text-text-on-primary shadow-2xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Visão Semanal ({weekDays.reduce((acc, d) => acc + d.dayTasksCount, 0)} tarefas)</span>
          </button>
          <button
            onClick={() => setViewMode('ROUTINES')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'ROUTINES'
                ? 'bg-brand-primary text-text-on-primary shadow-2xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span>Rotinas Cadastradas ({familyTasks.length})</span>
          </button>
        </div>
      )}

      {/* TAB 1: VISÃO SEMANAL */}
      {(viewMode === 'WEEKLY' || !isAdmin) && (
        <div className="space-y-4">
          {/* Day Selector Strip */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map(day => {
              const isSelected = day.offset === selectedDayOffset;
              const isToday = day.offset === 0;

              return (
                <button
                  key={day.dateStr}
                  onClick={() => setSelectedDayOffset(day.offset)}
                  className={`p-3 rounded-2xl border flex flex-col items-center gap-1 transition cursor-pointer ${
                    isSelected
                      ? 'bg-brand-primary text-text-on-primary border-brand-primary shadow-xs'
                      : 'bg-surface-card border-border-default hover:border-brand-primary/40 text-text-secondary'
                  }`}
                >
                  <span className={`text-[11px] font-bold ${isSelected ? 'text-text-on-primary' : 'text-text-muted'}`}>
                    {day.weekdayName}
                  </span>
                  <span className={`text-base font-extrabold ${isSelected ? 'text-text-on-primary' : 'text-text-primary'}`}>
                    {day.dateStr.split('-')[2]}
                  </span>
                  {isToday ? (
                    <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-brand-primary-soft text-brand-primary'
                    }`}>
                      Hoje
                    </span>
                  ) : (
                    <span className={`text-[10px] font-semibold ${isSelected ? 'text-white/80' : 'text-text-muted'}`}>
                      {day.dayTasksCount} {day.dayTasksCount === 1 ? 'tarefa' : 'tarefas'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tasks List for Selected Day */}
          <div className="bg-surface-card rounded-2xl border border-border-default p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-default">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-primary" />
                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  {WEEKDAYS_FULL[selectedDay.dayOfWeek]}, {selectedDay.dateStr.split('-').reverse().join('/')}
                </h4>
                {selectedDay.offset === 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary text-[10px] font-bold">
                    Hoje
                  </span>
                )}
              </div>
              <span className="text-xs text-text-muted font-medium">
                {selectedDay.dayTasksCount} ocorrência(s) programada(s)
              </span>
            </div>

            {selectedDay.dayTasksCount === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Clock className="w-8 h-8 text-text-muted mx-auto opacity-50" />
                <p className="text-xs font-bold text-text-primary">Nenhuma tarefa programada para este dia</p>
                <p className="text-[11px] text-text-muted">
                  Rotinas com dias preferidos para este dia da semana aparecerão aqui automaticamente.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedDay.tasks.map(task => {
                  const assigned = members.find(m => m.id === task.assignedMemberId);
                  const room = rooms.find(r => r.id === task.roomId);
                  const isDone = task.status === 'DONE' || (task.status as string) === 'COMPLETED';
                  const isProgress = task.status === 'IN_PROGRESS';

                  return (
                    <div
                      key={task.id}
                      onClick={() => setActiveTaskForInspect(task)}
                      className="p-3.5 rounded-xl bg-surface-subtle border border-border-default hover:border-brand-primary/40 hover:shadow-xs transition cursor-pointer flex items-center justify-between gap-3 group"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-text-primary group-hover:text-brand-primary transition truncate">
                            {task.title}
                          </p>
                          {isDone ? (
                            <span className="px-1.5 py-0.2 rounded-md bg-state-success-soft text-state-success text-[9px] font-bold shrink-0">
                              Concluída
                            </span>
                          ) : isProgress ? (
                            <span className="px-1.5 py-0.2 rounded-md bg-brand-primary-soft text-brand-primary text-[9px] font-bold shrink-0">
                              Em Andamento
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded-md bg-surface-card text-text-muted text-[9px] font-semibold shrink-0">
                              Pendente
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-text-muted">
                          {room && <span>{room.name}</span>}
                          {task.scheduledStart && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {task.scheduledStart}
                              </span>
                            </>
                          )}
                          <span>•</span>
                          <span>{assigned ? assigned.name : 'Disponível'}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold text-brand-primary block">
                          {task.effort || 10} pts
                        </span>
                        <span className="text-[10px] text-text-muted">
                          {task.durationMinutes || 20}m
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ROTINAS CADASTRADAS (FAMILY TASKS - ADMIN ONLY) */}
      {isAdmin && viewMode === 'ROUTINES' && (
        <div className="space-y-6">
          {frequencies.map(freq => {
            const freqRoutines = familyTasks.filter(ft => freq.match(ft.frequency || ''));
            return (
              <div key={freq.key} className="bg-surface-card rounded-2xl border border-border-default p-5 shadow-2xs space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-border-default">
                  <div className="flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-brand-primary" />
                    <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">{freq.label}</h4>
                    <span className="px-2 py-0.5 rounded-full bg-brand-primary-soft text-brand-primary text-[10px] font-bold">
                      {freqRoutines.length}
                    </span>
                  </div>
                </div>

                {freqRoutines.length === 0 ? (
                  <p className="text-xs text-text-muted py-2">Nenhuma rotina configurada para esta frequência.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {freqRoutines.map(routine => {
                      const room = rooms.find(r => r.id === (routine.room_id || routine.roomId));
                      const isPaused = routine.active === false;
                      const preferredDays = routine.preferred_days || routine.preferredDays || [];

                      return (
                        <div 
                          key={routine.id} 
                          className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition ${
                            isPaused 
                              ? 'bg-surface-card border-border-default opacity-60' 
                              : 'bg-surface-subtle border-border-default hover:border-brand-primary/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className={`text-xs font-bold ${isPaused ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                                  {routine.customTitle || routine.custom_title || routine.name || 'Rotina'}
                                </p>
                                {isPaused && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-state-error-soft text-state-error text-[9px] font-bold">
                                    Pausada
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
                                {room && (
                                  <span className="flex items-center gap-1">
                                    <Home className="w-3 h-3" />
                                    {room.name}
                                  </span>
                                )}
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {routine.preferred_time || routine.preferredTime || '08:00'} ({routine.estimated_minutes || 20}m)
                                </span>
                              </div>
                            </div>

                            {isAdmin && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => setEditingRoutineId(routine.id)}
                                  className="p-1.5 rounded-lg text-text-muted hover:text-brand-primary hover:bg-surface-subtle transition cursor-pointer"
                                  title="Editar tarefa da casa"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleToggleRoutineActive(routine)}
                                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                                    isPaused 
                                      ? 'text-state-success hover:bg-state-success-soft' 
                                      : 'text-text-muted hover:text-state-warning hover:bg-state-warning-soft'
                                  }`}
                                  title={isPaused ? 'Reativar rotina' : 'Pausar rotina'}
                                >
                                  {isPaused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Se for semanal, mostra os dias da semana ativos */}
                          {(freq.key === 'WEEKLY' || freq.key === 'BIWEEKLY') && (
                            <div className="pt-2 border-t border-border-default/60 flex items-center justify-between text-[10px]">
                              <span className="text-text-muted font-medium">Dias ativos:</span>
                              <div className="flex items-center gap-1">
                                {WEEKDAYS.map((dName, idx) => {
                                  const isActiveDay = preferredDays.includes(idx);
                                  return (
                                    <span
                                      key={idx}
                                      className={`px-1.5 py-0.2 rounded-md text-[9px] font-bold ${
                                        isActiveDay
                                          ? 'bg-brand-primary-soft text-brand-primary'
                                          : 'text-text-muted/40'
                                      }`}
                                    >
                                      {dName}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Routine Modal (STAB-001) */}
      <EditFamilyTaskModal
        isOpen={Boolean(editingRoutineId)}
        onClose={() => setEditingRoutineId(null)}
        familyTaskId={editingRoutineId}
      />

      {/* Create Task / Routine Modal */}
      <TaskCreationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
};
