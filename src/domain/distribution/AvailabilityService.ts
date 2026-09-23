/**
 * CasaJunto - AvailabilityService
 * Camada 2 do Pipeline de Distribuição:
 * Cruza MEMBER_AVAILABILITY * CALENDAR_EVENT * PROTECTED_TIME * TASK_ASSIGNMENT
 */

import {
  Member,
  ProtectedTime,
  CalendarEvent,
  TaskAssignment,
  TaskMaster
} from '../models';
import { SCORING_CONFIG } from './config/scoringConfig';
import { timeStringToMinutes } from '../utils/dateTimeUtils';

export interface DynamicAvailabilityResult {
  isAvailable: boolean;
  fitsComfortably: boolean;
  remainingMinutes: number;
  maxDailyLimit: number;
  minutesAssignedToday: number;
  reason?: string;
}

export interface AvailabilityContext {
  protectedTimes: ProtectedTime[];
  calendarEvents?: CalendarEvent[];
  allTasks: TaskMaster[];
  targetDate: string; // YYYY-MM-DD
  dayOfWeek: number; // 0..6
}

export class AvailabilityService {
  /**
   * Retorna o teto diário ético e pedagógico de minutos por morador.
   */
  public static getMaxDailyMinutes(member: Member): number {
    if (member.max_daily_minutes && member.max_daily_minutes > 0) {
      return member.max_daily_minutes;
    }
    const age = member.age;
    const limits = SCORING_CONFIG.DAILY_MINUTES_BY_AGE;
    if (age < 7) return limits.UNDER_7;
    if (age < 11) return limits.UNDER_11;
    if (age < 15) return limits.UNDER_15;
    if (age < 18) return limits.UNDER_18;
    return limits.ADULT;
  }

  /**
   * Verifica se o morador possui minutos livres e se não há colisão de horários.
   */
  public static checkAvailability(
    member: Member,
    targetTimeSlot: string, // "HH:mm"
    durationMinutes: number,
    ctx: AvailabilityContext,
    currentDayAssignments: TaskAssignment[]
  ): DynamicAvailabilityResult {
    const maxLimit = this.getMaxDailyMinutes(member);

    // 1. Minutos já atribuídos hoje
    const assignedToday = currentDayAssignments.filter(a => a.member_id === member.id && !a.is_unassigned);
    const minutesAssigned = assignedToday.reduce((acc, a) => {
      const t = ctx.allTasks.find(item => item.id === a.task_id);
      return acc + (t ? t.duration_minutes : 15);
    }, 0);

    const remainingMinutes = maxLimit - minutesAssigned;

    if (remainingMinutes < durationMinutes) {
      return {
        isAvailable: false,
        fitsComfortably: false,
        remainingMinutes,
        maxDailyLimit: maxLimit,
        minutesAssignedToday: minutesAssigned,
        reason: `Excede o limite diário de ${maxLimit} min (já possui ${minutesAssigned} min alocados hoje)`
      };
    }

    // 2. Conflito com Horários Protegidos (Sono, Estudos, Trabalho, Treinos)
    const taskStartMin = timeStringToMinutes(targetTimeSlot);
    const taskEndMin = taskStartMin + durationMinutes;

    const userProtectedTimes = ctx.protectedTimes.filter(pt => {
      if (pt.member_id !== member.id || !pt.active) return false;
      const days = pt.day_of_week || (pt as any).days_of_week || [];
      return Array.isArray(days) ? days.includes(ctx.dayOfWeek) : true;
    });

    for (const pt of userProtectedTimes) {
      const ptStart = timeStringToMinutes(pt.start_time);
      let ptEnd = timeStringToMinutes(pt.end_time);
      if (ptEnd < ptStart) ptEnd += 24 * 60; // Cruza meia-noite (sono)

      if (taskStartMin < ptEnd && taskEndMin > ptStart) {
        return {
          isAvailable: false,
          fitsComfortably: false,
          remainingMinutes,
          maxDailyLimit: maxLimit,
          minutesAssignedToday: minutesAssigned,
          reason: `Conflito com horário protegido: ${pt.label} (${pt.start_time}–${pt.end_time})`
        };
      }
    }

    // 3. Conflito com Eventos do Calendário
    if (ctx.calendarEvents && ctx.calendarEvents.length > 0) {
      const userEvents = ctx.calendarEvents.filter(
        ev => ev.member_id === member.id && ev.start_datetime.startsWith(ctx.targetDate)
      );

      for (const ev of userEvents) {
        const evStart = new Date(ev.start_datetime);
        const evEnd = new Date(ev.end_datetime);
        const evStartMin = evStart.getHours() * 60 + evStart.getMinutes();
        const evEndMin = evEnd.getHours() * 60 + evEnd.getMinutes();

        if (taskStartMin < evEndMin && taskEndMin > evStartMin) {
          return {
            isAvailable: false,
            fitsComfortably: false,
            remainingMinutes,
            maxDailyLimit: maxLimit,
            minutesAssignedToday: minutesAssigned,
            reason: `Conflito de agenda: ${ev.title}`
          };
        }
      }
    }

    const fitsComfortably = remainingMinutes >= durationMinutes + SCORING_CONFIG.AVAILABILITY.COMFORT_MARGIN_MINUTES;

    return {
      isAvailable: true,
      fitsComfortably,
      remainingMinutes,
      maxDailyLimit: maxLimit,
      minutesAssignedToday: minutesAssigned
    };
  }
}
