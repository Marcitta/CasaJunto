/**
 * CASA JUNTO — FREQUENCY UTILITIES & FORMATTER (FASE A)
 * Funções puras para formatação, resolução e consistência de frequências.
 * Respeita exclusivamente os valores canônicos do domínio.
 */

import { FamilyTask, TaskAssignment, TaskFrequency } from '../types';

export const WEEKDAY_FULL_NAMES: readonly string[] = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado'
];

export const WEEKDAY_SHORT_NAMES: readonly string[] = [
  'dom',
  'seg',
  'ter',
  'qua',
  'qui',
  'sex',
  'sáb'
];

/**
 * Formata múltiplos dias da semana em português natural (ex: "seg, qua e sex" ou "dom e sáb").
 */
export function formatWeekdayList(days: number[]): string {
  if (!days || days.length === 0) return '';
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return WEEKDAY_FULL_NAMES[sorted[0]] || '';
  }
  if (sorted.length === 7) {
    return 'todos os dias';
  }
  const shortLabels = sorted.map(d => WEEKDAY_SHORT_NAMES[d] || String(d));
  if (shortLabels.length === 2) {
    return `${shortLabels[0]} e ${shortLabels[1]}`;
  }
  const allButLast = shortLabels.slice(0, -1).join(', ');
  const last = shortLabels[shortLabels.length - 1];
  return `${allButLast} e ${last}`;
}

export interface FormatFrequencyOptions {
  frequency?: string | null;
  preferredDays?: number[] | null;
  dayOfMonth?: number | null;
  routineNotFound?: boolean;
  isAdHoc?: boolean;
}

/**
 * Formatador puro de frequências para apresentação em português.
 * Regra obrigatória: A ocorrência semanal da Ruthe (preferredDays: [3]) resulta em "Semanal — quarta-feira".
 */
export function formatFrequencyLabel(
  optionsOrFreq?: FormatFrequencyOptions | string | null,
  preferredDaysParam?: number[] | null,
  dayOfMonthParam?: number | null
): string {
  let freqStr = '';
  let days: number[] | undefined;
  let dom: number | undefined;
  let routineNotFound = false;
  let isAdHoc = false;

  if (optionsOrFreq && typeof optionsOrFreq === 'object') {
    freqStr = (optionsOrFreq.frequency || '').trim().toUpperCase();
    days = optionsOrFreq.preferredDays ? [...optionsOrFreq.preferredDays] : undefined;
    dom = optionsOrFreq.dayOfMonth ?? undefined;
    routineNotFound = Boolean(optionsOrFreq.routineNotFound);
    isAdHoc = Boolean(optionsOrFreq.isAdHoc);
  } else {
    freqStr = typeof optionsOrFreq === 'string' ? optionsOrFreq.trim().toUpperCase() : '';
    days = preferredDaysParam ? [...preferredDaysParam] : undefined;
    dom = dayOfMonthParam ?? undefined;
  }

  // 1. Tratamento explícito de ausência de rotina (não mascarar com fallback silencioso)
  if (routineNotFound) {
    return 'Rotina não encontrada';
  }

  if (isAdHoc && !freqStr) {
    return 'Pontual';
  }

  if (!freqStr) {
    return 'Pontual';
  }

  // 2. Valores canônicos suportados pelo domínio
  switch (freqStr) {
    case 'DAILY':
      return 'Diária';

    case 'WEEKLY': {
      if (days && days.length === 1) {
        const singleDayName = WEEKDAY_FULL_NAMES[days[0]];
        return singleDayName ? `Semanal — ${singleDayName}` : 'Semanal';
      }
      if (days && days.length > 1) {
        const formattedList = formatWeekdayList(days);
        return formattedList ? `Semanal — ${formattedList}` : 'Semanal';
      }
      return 'Semanal';
    }

    case 'SEVERAL_TIMES_WEEK': {
      if (days && days.length === 1) {
        const singleDayName = WEEKDAY_FULL_NAMES[days[0]];
        return singleDayName ? `Semanal — ${singleDayName}` : 'Semanal';
      }
      if (days && days.length > 1) {
        const formattedList = formatWeekdayList(days);
        return formattedList ? `Semanal — ${formattedList}` : 'Semanal';
      }
      return 'Várias vezes na semana';
    }

    case 'BIWEEKLY': {
      if (days && days.length === 1) {
        const singleDayName = WEEKDAY_FULL_NAMES[days[0]];
        return singleDayName ? `Quinzenal — ${singleDayName}` : 'Quinzenal';
      }
      if (days && days.length > 1) {
        const formattedList = formatWeekdayList(days);
        return formattedList ? `Quinzenal — ${formattedList}` : 'Quinzenal';
      }
      return 'Quinzenal';
    }

    case 'MONTHLY': {
      if (typeof dom === 'number' && dom >= 1 && dom <= 31) {
        return `Mensal — dia ${dom}`;
      }
      return 'Mensal';
    }

    case 'ONCE':
    case 'ONE_TIME':
      return 'Pontual';

    default:
      return 'Pontual';
  }
}

export interface ResolvedFrequencyInfo {
  frequency: TaskFrequency;
  preferredDays?: number[];
  dayOfMonth?: number;
  routineNotFound: boolean;
}

/**
 * Resolução pura da frequência a partir de uma atribuição e da rotina vinculada.
 * Garante que a ausência de rotina seja tratada explicitamente sem recorrer a fallback silencioso 'DAILY'.
 */
export function resolveFrequencyFromRoutine(
  asg: Partial<TaskAssignment>,
  ft?: FamilyTask | null
): ResolvedFrequencyInfo {
  const linkedFtId = asg.family_task_id || (asg as any).familyTaskId;

  if (ft) {
    const raw = (ft.frequency || '').trim().toUpperCase();
    let canonical: TaskFrequency = 'DAILY';

    if (raw === 'WEEKLY' || raw === 'SEVERAL_TIMES_WEEK') {
      canonical = 'WEEKLY';
    } else if (raw === 'BIWEEKLY') {
      canonical = 'BIWEEKLY';
    } else if (raw === 'MONTHLY') {
      canonical = 'MONTHLY';
    } else if (raw === 'ONE_TIME' || raw === 'ONCE') {
      canonical = 'ONE_TIME';
    } else if (raw === 'DAILY') {
      canonical = 'DAILY';
    } else {
      canonical = 'DAILY';
    }

    const preferredDays = ft.preferred_days || ft.preferredDays;
    const dayOfMonth = ft.day_of_month ?? ft.dayOfMonth;

    return {
      frequency: canonical,
      preferredDays: preferredDays ? [...preferredDays] : undefined,
      dayOfMonth: typeof dayOfMonth === 'number' ? dayOfMonth : undefined,
      routineNotFound: false
    };
  }

  // Se havia um vínculo explícito com rotina mas ela não foi encontrada na lista de rotinas ativas/conhecidas
  if (linkedFtId) {
    return {
      frequency: 'ONE_TIME',
      routineNotFound: true
    };
  }

  // Ocorrência avulsa / pontual sem vínculo com rotina
  return {
    frequency: 'ONE_TIME',
    routineNotFound: false
  };
}
