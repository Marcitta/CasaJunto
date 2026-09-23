/**
 * CasaJunto - RoutineGenerator (Domain Layer)
 * Implementação canônica da geração de ocorrências de rotinas recorrentes.
 * 
 * Regras Canônicas:
 * 1. FamilyTask é a definição canônica da rotina (active: boolean).
 * 2. TaskAssignment é a ocorrência executável datada ({familyTaskId}_{YYYY-MM-DD}).
 * 3. Ocorrências existentes NUNCA são sobrescritas (Atomic Create-If-Absent).
 * 4. ONE_TIME é excluído do gerador recorrente.
 * 5. Datas respeitam fuso horário da família e clamping de fim de mês (29/30/31).
 */

import { FamilyTask, TaskAssignment } from '../../types';
import {
  getDayOfWeek,
  getDaysDifference,
  clampDayOfMonth,
  addMinutesToTimeString
} from '../utils/dateTimeUtils';

export interface GenerateOccurrencesParams {
  routine: FamilyTask;
  familyId: string;
  horizonDates: string[];
  existingOccurrences: TaskAssignment[];
  durationMinutes?: number;
}

export class RoutineGenerator {
  /**
   * Gera o ID determinístico canônico para a ocorrência da rotina no dia especificado.
   */
  public static getDeterministicOccurrenceId(routineId: string, dateStr: string): string {
    return `${routineId}_${dateStr}`;
  }

  public static buildOccurrenceId(routineId: string, dateStr: string): string {
    return this.getDeterministicOccurrenceId(routineId, dateStr);
  }

  public static buildInitialOccurrence(params: { routine: FamilyTask; familyId: string; date: string; durationMinutes?: number }): TaskAssignment {
    return this.createInitialOccurrence(params.routine, params.date, params.familyId, params.durationMinutes);
  }

  /**
   * Avalia se uma rotina deve ocorrer em determinada data no calendário.
   */
  public static shouldOccurOnDate(routine: FamilyTask, dateStr: string): boolean {
    if (routine.active === false) {
      return false;
    }

    const freq = (routine.frequency || '').toUpperCase();
    if (freq === 'ONE_TIME' || freq === 'ONCE') {
      return false;
    }

    const startDate = routine.start_date || routine.startDate || dateStr;
    if (dateStr < startDate) {
      return false;
    }

    if (freq === 'DAILY') {
      return true;
    }

    if (freq === 'WEEKLY' || freq === 'SEVERAL_TIMES_WEEK') {
      const preferredDays = routine.preferred_days || routine.preferredDays;
      if (preferredDays && preferredDays.length > 0) {
        const dow = getDayOfWeek(dateStr);
        return preferredDays.includes(dow);
      }
      // Se não especificado, repete no mesmo dia da semana do startDate
      return getDayOfWeek(dateStr) === getDayOfWeek(startDate);
    }

    if (freq === 'BIWEEKLY') {
      const diff = getDaysDifference(dateStr, startDate);
      return diff >= 0 && diff % 14 === 0;
    }

    if (freq === 'MONTHLY') {
      let targetDay = routine.day_of_month ?? routine.dayOfMonth;
      if (targetDay === undefined) {
        const parts = startDate.split('-');
        targetDay = parseInt(parts[2], 10) || 1;
      }

      const [y, m, d] = dateStr.split('-').map(Number);
      const clamped = clampDayOfMonth(y, m, targetDay);
      return d === clamped;
    }

    return false;
  }

  /**
   * Cria o objeto de ocorrência inicial desatribuída com estado canônico SCHEDULED.
   */
  public static createInitialOccurrence(
    routine: FamilyTask,
    dateStr: string,
    familyId: string,
    durationMinutes: number = 20
  ): TaskAssignment {
    const id = this.getDeterministicOccurrenceId(routine.id, dateStr);
    const startTime = routine.preferred_time || routine.preferredTime || '08:00';
    const endTime = addMinutesToTimeString(startTime, routine.estimated_minutes || durationMinutes);

    return {
      id,
      family_id: familyId,
      family_task_id: routine.id,
      task_id: routine.task_master_id || routine.taskMasterId || routine.id,
      member_id: '',
      room_id: routine.room_id || routine.roomId || undefined,
      scheduled_date: dateStr,
      scheduled_start: startTime,
      scheduled_end: endTime,
      status: 'SCHEDULED',
      score: 0,
      assigned_reason: '',
      is_unassigned: true
    };
  }

  /**
   * Gera ocorrências para o horizonte especificado filtrando ocorrências que já existem.
   * Não sobrescreve nenhuma ocorrência existente.
   */
  public static generateMissingOccurrences(params: GenerateOccurrencesParams): TaskAssignment[] {
    const { routine, familyId, horizonDates, existingOccurrences, durationMinutes } = params;

    if (routine.active === false) {
      return [];
    }

    const existingMap = new Map<string, TaskAssignment>();
    const existingDateRoutineSet = new Set<string>();
    for (const occ of existingOccurrences) {
      existingMap.set(occ.id, occ);
      const ftId = occ.family_task_id || (occ as any).familyTaskId;
      if (ftId && occ.scheduled_date) {
        existingDateRoutineSet.add(`${ftId}_${occ.scheduled_date}`);
      }
      const occTmId = occ.task_id || (occ as any).taskMasterId;
      if (occTmId && occ.scheduled_date) {
        existingDateRoutineSet.add(`${occTmId}_${occ.scheduled_date}`);
      }
    }

    const missing: TaskAssignment[] = [];

    for (const dateStr of horizonDates) {
      if (!this.shouldOccurOnDate(routine, dateStr)) {
        continue;
      }

      const occurrenceId = this.getDeterministicOccurrenceId(routine.id, dateStr);
      const routineDateKey = `${routine.id}_${dateStr}`;
      const tmId = routine.task_master_id || (routine as any).taskMasterId || (routine as any).task_id || (routine as any).taskId;
      const tmDateKey = tmId ? `${tmId}_${dateStr}` : '';

      if (
        existingMap.has(occurrenceId) ||
        existingDateRoutineSet.has(routineDateKey) ||
        (tmDateKey && existingDateRoutineSet.has(tmDateKey))
      ) {
        // Documento já existe: REGRA CANÔNICA -> JAMAIS SOBRESCREVER OU DUPLICAR
        continue;
      }

      const newOcc = this.createInitialOccurrence(routine, dateStr, familyId, durationMinutes);
      missing.push(newOcc);
      existingMap.set(newOcc.id, newOcc);
      existingDateRoutineSet.add(routineDateKey);
      if (tmDateKey) {
        existingDateRoutineSet.add(tmDateKey);
      }
    }

    return missing;
  }
}
