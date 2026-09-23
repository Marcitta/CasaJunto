/**
 * CASA JUNTO — TODAY PROGRESS SELECTORS
 * HOTFIX-METRIC-1: Date Scope & Operational Data Integrity
 * 
 * Centraliza e padroniza a extração do universo de tarefas operacionais de "Hoje",
 * garantindo alinhamento estrito entre:
 * - Indicador "Progresso do Lar Hoje" (RightSidebar)
 * - Visão "Hoje" (TodayView)
 * 
 * Contrato Canônico:
 * 1. Timezone: family.timezone (fallback 'America/Sao_Paulo')
 * 2. Intervalo de Datas: Exclusivamente a data local do dia ativo (targetDate === today)
 *    - D+1 a D+14: EXCLUÍDOS
 *    - Passado: EXCLUÍDO
 * 3. Statuses Operacionais:
 *    - Numerador (Concluídas): COMPLETED, DONE
 *    - Ações Pendentes: PENDING, SCHEDULED, IN_PROGRESS
 *    - Denominador (Total Operacional): Concluídas + Ações Pendentes
 *    - Excluídos de ambos: CANCELLED, EXEMPT, MISSED, SKIPPED
 * 4. Rotinas Inativas: FamilyTask.active === false é estritamente excluída
 * 5. Identidade Canônica: Ocorrências de mesmo task_master_id + data não são contadas em duplicidade
 */

import { Task, Family, FamilyTask } from '../../types';
import { getFamilyLocalDate, getTodayDateString, DEFAULT_TIMEZONE } from '../utils/dateTimeUtils';

export interface TodayProgressMetrics {
  targetDate: string;
  completedToday: number;
  actionableToday: number;
  totalToday: number;
  progressPercent: number;
  completedTasks: Task[];
  actionableTasks: Task[];
  allOperationalTasks: Task[];
}

/**
 * Resolve a data ativa para o contexto do dia, respeitando:
 * 1. Override explícito de prop (se fornecido)
 * 2. Data selecionada no calendário (se diferente de hoje local)
 * 3. Data local no fuso horário da família (fallback 'America/Sao_Paulo')
 */
export function resolveTodayDate(params: {
  family?: Family | null;
  selectedDate?: string;
  propTargetDate?: string;
}): string {
  const timezone = params.family?.timezone || DEFAULT_TIMEZONE;
  const familyLocalDate = getFamilyLocalDate(timezone);
  if (params.propTargetDate) {
    return params.propTargetDate;
  }
  if (params.selectedDate && params.selectedDate !== getTodayDateString(new Date(), timezone)) {
    return params.selectedDate;
  }
  return familyLocalDate;
}

/**
 * Extrai a data representativa da tarefa no formato YYYY-MM-DD.
 */
export function getTaskDate(task: Task): string {
  return task.scheduledDate || task.dueDate || (task as any).scheduled_date || '';
}

/**
 * Determina se o status representa uma tarefa concluída.
 */
export function isCompletedTaskStatus(status: string): boolean {
  return status === 'DONE' || status === 'COMPLETED';
}

/**
 * Determina se o status representa uma tarefa acionável e pendente.
 */
export function isActionableTaskStatus(status: string): boolean {
  if (
    status === 'DONE' ||
    status === 'COMPLETED' ||
    status === 'CANCELLED' ||
    status === 'EXEMPT' ||
    status === 'MISSED' ||
    status === 'SKIPPED'
  ) {
    return false;
  }
  return status === 'PENDING' || status === 'SCHEDULED' || status === 'IN_PROGRESS';
}

/**
 * Determina se o status é operacional (participa do total de tarefas de hoje).
 */
export function isOperationalTaskStatus(status: string): boolean {
  return isCompletedTaskStatus(status) || isActionableTaskStatus(status);
}

/**
 * Valida se a tarefa pertence a uma rotina ativa da família.
 */
export function isTaskFromActiveRoutine(task: Task, familyTasks?: FamilyTask[]): boolean {
  if (!familyTasks || familyTasks.length === 0) {
    return true;
  }

  const activeRoutines = familyTasks.filter(ft => ft.active !== false);
  const activeRoutineIds = new Set(activeRoutines.map(ft => ft.id));
  const activeTmIds = new Set(
    activeRoutines
      .map(ft => ft.task_master_id || (ft as any).taskMasterId || (ft as any).task_id)
      .filter(Boolean)
  );

  const inactiveRoutines = familyTasks.filter(ft => ft.active === false);
  const inactiveRoutineIds = new Set(inactiveRoutines.map(ft => ft.id));

  // Se explicitamente vinculada a rotina inativa
  if (task.familyTaskId && inactiveRoutineIds.has(task.familyTaskId)) {
    return false;
  }

  // Se o ID da tarefa carregar o prefixo de uma rotina inativa
  if (task.id && Array.from(inactiveRoutineIds).some(rId => task.id.startsWith(`${rId}_`))) {
    return false;
  }

  // Se vinculada a rotina ativa confirmada
  if (task.familyTaskId && activeRoutineIds.has(task.familyTaskId)) {
    return true;
  }

  // Se possui taskMasterId, deve haver ao menos uma rotina ativa para esse taskMaster
  if (task.taskMasterId && !activeTmIds.has(task.taskMasterId)) {
    return false;
  }

  return true;
}

/**
 * Prioridade canônica para deduplicação:
 * COMPLETED/DONE (3) > IN_PROGRESS (2) > SCHEDULED/PENDING (1) > OUTROS (0)
 */
function getTaskPriority(task: Task): number {
  const s = task.status as string;
  if (isCompletedTaskStatus(s)) return 3;
  if (s === 'IN_PROGRESS') return 2;
  if (s === 'SCHEDULED' || s === 'PENDING') return 1;
  return 0;
}

/**
 * Computa o conjunto de tarefas e as métricas de progresso de Hoje.
 */
export function computeTodayProgress(params: {
  tasks: Task[];
  family?: Family | null;
  familyTasks?: FamilyTask[];
  targetDate?: string;
}): TodayProgressMetrics {
  const { tasks, family, familyTasks, targetDate: propTargetDate } = params;

  const timezone = family?.timezone || DEFAULT_TIMEZONE;
  const targetDate = propTargetDate || getFamilyLocalDate(timezone);

  // 1. Filtrar tarefas estritamente pertencentes à data de Hoje, ativas e operacionais
  const candidateTasks = tasks.filter(t => {
    const d = getTaskDate(t);
    if (d !== targetDate) return false;
    if (!isOperationalTaskStatus(t.status)) return false;
    if (!isTaskFromActiveRoutine(t, familyTasks)) return false;
    return true;
  });

  // 2. Deduplicação canônica (HOTFIX-DUP-1 / DATA-REPAIR-DUP-1):
  // Uma ocorrência operacional no máximo por chave canônica (taskMasterId + date ou familyTaskId + date)
  const canonicalMap = new Map<string, Task>();

  for (const t of candidateTasks) {
    const d = getTaskDate(t);
    const tmId = t.taskMasterId;
    const ftId = t.familyTaskId;

    const canonicalKey = tmId ? `${tmId}_${d}` : (ftId ? `${ftId}_${d}` : t.id);

    const existing = canonicalMap.get(canonicalKey);
    if (!existing) {
      canonicalMap.set(canonicalKey, t);
    } else {
      const existingPriority = getTaskPriority(existing);
      const newPriority = getTaskPriority(t);
      if (newPriority > existingPriority) {
        canonicalMap.set(canonicalKey, t);
      }
    }
  }

  const allOperationalTasks = Array.from(canonicalMap.values());
  const completedTasks = allOperationalTasks.filter(t => isCompletedTaskStatus(t.status));
  const actionableTasks = allOperationalTasks.filter(t => isActionableTaskStatus(t.status));

  const completedToday = completedTasks.length;
  const actionableToday = actionableTasks.length;
  const totalToday = completedToday + actionableToday;

  const progressPercent = totalToday > 0 
    ? Math.round((completedToday / totalToday) * 100) 
    : 100;

  return {
    targetDate,
    completedToday,
    actionableToday,
    totalToday,
    progressPercent,
    completedTasks,
    actionableTasks,
    allOperationalTasks
  };
}
