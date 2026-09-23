/**
 * CASA JUNTO — DATE & PROFILE UTILITIES
 * Pure functions for date calculation, time parsing, and age derivation.
 */

import { ProtectedTimeType } from '../types';

/**
 * Calculates a person's age from their birth date in 'YYYY-MM-DD' format.
 * Avoids timezone issues by parsing year, month, and day components directly as numbers
 * rather than relying on UTC string Date parsing.
 *
 * @param birthDateStr string in "YYYY-MM-DD" format
 * @param referenceDate optional Date for time-travel or testing (defaults to now)
 * @returns number representing age in full completed years, or null if invalid or in the future
 */
export function calculateAgeFromBirthDate(
  birthDateStr?: string | null,
  referenceDate: Date = new Date()
): number | null {
  if (!birthDateStr || typeof birthDateStr !== 'string') return null;

  const trimmed = birthDateStr.trim();
  const parts = trimmed.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Validate days in month (handling leap years for Feb 29)
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) return null;

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1; // 1-12
  const refDay = referenceDate.getDate();

  // Check if date is in the future
  if (
    year > refYear ||
    (year === refYear && month > refMonth) ||
    (year === refYear && month === refMonth && day > refDay)
  ) {
    return null; // Future date is invalid
  }

  let age = refYear - year;

  // If birth month/day has not occurred yet this year, subtract 1
  if (refMonth < month || (refMonth === month && refDay < day)) {
    age--;
  }

  return Math.max(0, age);
}

/**
 * Days of week definition: 0 = Domingo, 1 = Segunda, ..., 6 = Sábado.
 */
export const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom', letter: 'D' },
  { value: 1, label: 'Segunda-feira', short: 'Seg', letter: 'S' },
  { value: 2, label: 'Terça-feira', short: 'Ter', letter: 'T' },
  { value: 3, label: 'Quarta-feira', short: 'Qua', letter: 'Q' },
  { value: 4, label: 'Quinta-feira', short: 'Qui', letter: 'Q' },
  { value: 5, label: 'Sexta-feira', short: 'Sex', letter: 'S' },
  { value: 6, label: 'Sábado', short: 'Sáb', letter: 'S' },
] as const;

export const DAY_SHORTCUTS = {
  WEEKDAYS: [1, 2, 3, 4, 5],
  WEEKEND: [0, 6],
  ALL: [0, 1, 2, 3, 4, 5, 6]
};

export const PROTECTED_TIME_LABELS: Record<ProtectedTimeType, string> = {
  school: 'Escola',
  work: 'Trabalho',
  study: 'Estudos / Curso',
  sports: 'Esporte',
  sleep: 'Sono',
  appointment: 'Compromisso',
  other: 'Outro'
};

export const AUTONOMY_LEVELS = [
  {
    level: 1,
    title: '1 — Precisa de ajuda',
    description: 'Faz apenas com um responsável presente e orientando cada passo.'
  },
  {
    level: 2,
    title: '2 — Faz com supervisão',
    description: 'Conhece as etapas básicas, mas requer conferência ou supervisão leve.'
  },
  {
    level: 3,
    title: '3 — Faz sozinho',
    description: 'Executa a rotina com consistência e total independência.'
  },
  {
    level: 4,
    title: '4 — Alta autonomia',
    description: 'Domina a atividade com excelência e pode orientar outros moradores.'
  }
] as const;

/**
 * Format a list of day numbers (0-6) into a concise human-readable string.
 */
export function formatDaysOfWeek(days: number[]): string {
  if (!days || days.length === 0) return 'Nenhum dia';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Todos os dias';
  if (sorted.length === 5 && sorted.every((d, i) => d === i + 1)) return 'Seg–Sex';
  if (sorted.length === 2 && sorted.includes(0) && sorted.includes(6)) return 'Fim de semana';

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return sorted.map(d => dayNames[d] || `${d}`).join(', ');
}

/**
 * Validates HH:mm time format
 */
export function isValidTimeString(timeStr: string): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const match = timeStr.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match !== null;
}

/**
 * Converts HH:mm string to minutes from midnight
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!isValidTimeString(timeStr)) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Checks if two time intervals overlap on the same day.
 * Returns true if overlap detected.
 */
export function checkTimeIntervalOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const minStartA = timeStringToMinutes(startA);
  const minEndA = timeStringToMinutes(endA);
  const minStartB = timeStringToMinutes(startB);
  const minEndB = timeStringToMinutes(endB);

  // Normal daytime intervals (not overnight)
  if (minStartA < minEndA && minStartB < minEndB) {
    return Math.max(minStartA, minStartB) < Math.min(minEndA, minEndB);
  }

  // Handle overnight intervals if any
  const intervalsA = minStartA > minEndA 
    ? [{ start: minStartA, end: 1440 }, { start: 0, end: minEndA }]
    : [{ start: minStartA, end: minEndA }];

  const intervalsB = minStartB > minEndB
    ? [{ start: minStartB, end: 1440 }, { start: 0, end: minEndB }]
    : [{ start: minStartB, end: minEndB }];

  for (const ia of intervalsA) {
    for (const ib of intervalsB) {
      if (Math.max(ia.start, ib.start) < Math.min(ia.end, ib.end)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns today's date in YYYY-MM-DD format using local time.
 */
export function getTodayDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
