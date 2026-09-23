/**
 * CasaJunto - ScoringService
 * Camada 6 do Pipeline de Distribuição:
 * Avaliação matemática multidimensional de pontuação e fatores de decisão.
 */

import {
  Member,
  TaskMaster,
  FamilyTask,
  MemberSkill,
  MemberPreference,
  ProtectedTime,
  CalendarEvent,
  TaskAssignment,
  HouseholdHelp,
  AssignmentFactorInfo
} from '../models';
import { SCORING_CONFIG } from './config/scoringConfig';
import { EligibilityService } from './EligibilityService';
import { AvailabilityService } from './AvailabilityService';
import { BalanceService } from './BalanceService';
import { ExplainabilityService } from './ExplainabilityService';
import { getDaysDifference } from '../utils/dateTimeUtils';
import { getActiveMembers } from '../selectors';

export interface CandidateBreakdown {
  capacityScore: number;
  availabilityScore: number;
  preferenceScore: number;
  balanceScore: number;
  recencyScore: number;
  roomGroupingScore: number;
  effortWeight: number;
}

export interface CandidateEvaluation {
  userId: string; // memberId
  userName: string;
  totalScore: number;
  isEligible: boolean;
  disqualificationReason?: string;
  breakdown: CandidateBreakdown;
  explanation: string;
  factors: AssignmentFactorInfo;
}

export interface TaskPriorityInfo {
  taskId: string;
  priorityScore: number;
  reason: string;
}

export interface ScoringContext {
  users: Member[];
  allTasks: TaskMaster[];
  familyTasks: FamilyTask[];
  skills: MemberSkill[];
  preferences: MemberPreference[];
  protectedTimes: ProtectedTime[];
  availabilities?: any[];
  calendarEvents?: CalendarEvent[];
  existingAssignments: TaskAssignment[];
  householdHelp?: HouseholdHelp;
  targetDate: string; // YYYY-MM-DD
  dayOfWeek: number; // 0..6
}

export class ScoringService {
  /**
   * Avalia um morador específico para uma tarefa específica, retornando score e fatores.
   */
  public static evaluateCandidate(
    member: Member,
    task: TaskMaster,
    timeSlot: string,
    ctx: ScoringContext,
    currentDayAssignments: TaskAssignment[]
  ): CandidateEvaluation {
    // 1. Verificação prévia de elegibilidade
    const eligibility = EligibilityService.checkEligibility(
      member,
      task,
      timeSlot,
      {
        protectedTimes: ctx.protectedTimes,
        calendarEvents: ctx.calendarEvents,
        allTasks: ctx.allTasks,
        targetDate: ctx.targetDate,
        dayOfWeek: ctx.dayOfWeek,
        skills: ctx.skills
      },
      currentDayAssignments
    );

    if (!eligibility.isEligible) {
      return {
        userId: member.id,
        userName: member.name,
        totalScore: -9999,
        isEligible: false,
        disqualificationReason: eligibility.reason,
        breakdown: {
          capacityScore: 0,
          availabilityScore: 0,
          preferenceScore: 0,
          balanceScore: 0,
          recencyScore: 0,
          roomGroupingScore: 0,
          effortWeight: 0
        },
        explanation: `Não elegível: ${eligibility.reason}`,
        factors: {
          availability: 'Indisponível no momento',
          autonomy: 'Incompatível com os requisitos de segurança/autonomia',
          weeklyBalance: 'N/A',
          history: 'N/A',
          preference: 'N/A'
        }
      };
    }

    // 2. Capacidade & Autonomia (+10 a +35 pts, -10 se requerer supervisão)
    const userSkill = ctx.skills.find(s => s.member_id === member.id && s.task_master_id === task.id);
    let capacityScore: number = SCORING_CONFIG.AUTONOMY.DEFAULT_CAPACITY;
    let autonomyText = 'Possui autonomia adequada para a atividade';

    if (userSkill) {
      switch (userSkill.skill_status) {
        case 'MENTOR':
          capacityScore = SCORING_CONFIG.AUTONOMY.MENTOR;
          autonomyText = 'Nível Mentor: domina com excelência e pode orientar outros';
          break;
        case 'AUTONOMOUS':
          capacityScore = SCORING_CONFIG.AUTONOMY.AUTONOMOUS;
          autonomyText = 'Nível Autônomo: executa com total independência';
          break;
        case 'LEARNING':
          capacityScore = SCORING_CONFIG.AUTONOMY.LEARNING;
          autonomyText = 'Nível Aprendendo: ótima oportunidade de prática orientada';
          break;
        case 'NOT_LEARNED':
          capacityScore = SCORING_CONFIG.AUTONOMY.NOT_LEARNED;
          autonomyText = 'Em processo de ambientação inicial';
          break;
      }
    } else {
      if (member.autonomy_level >= 4) {
        capacityScore = SCORING_CONFIG.AUTONOMY.LEVEL_4;
        autonomyText = 'Autonomia avançada comprovada';
      } else if (member.autonomy_level >= 3) {
        capacityScore = SCORING_CONFIG.AUTONOMY.LEVEL_3;
        autonomyText = 'Autônomo nas rotinas da casa';
      } else if (member.autonomy_level === 2) {
        capacityScore = SCORING_CONFIG.AUTONOMY.LEVEL_2;
        autonomyText = 'Em aprendizado supervisionado';
      } else {
        capacityScore = SCORING_CONFIG.AUTONOMY.LEVEL_1;
        autonomyText = 'Iniciante';
      }
    }

    if (task.requires_supervision || (userSkill && userSkill.supervision_required)) {
      capacityScore += SCORING_CONFIG.AUTONOMY.SUPERVISION_PENALTY;
      autonomyText += ' (requer supervisão de um adulto)';
    }

    // 3. Disponibilidade (+10 ou +20 pts)
    const avail = AvailabilityService.checkAvailability(
      member,
      timeSlot,
      task.duration_minutes,
      {
        protectedTimes: ctx.protectedTimes,
        calendarEvents: ctx.calendarEvents,
        allTasks: ctx.allTasks,
        targetDate: ctx.targetDate,
        dayOfWeek: ctx.dayOfWeek
      },
      currentDayAssignments
    );

    const availabilityScore = avail.fitsComfortably
      ? SCORING_CONFIG.AVAILABILITY.FITS_COMFORTABLY
      : SCORING_CONFIG.AVAILABILITY.FITS_EXACT;
    const availText = `Disponível (restam ${avail.remainingMinutes} min no limite diário de ${AvailabilityService.getMaxDailyMinutes(member)} min)`;

    // 4. Preferência (+10, 0, -10 pts)
    const userPref = ctx.preferences.find(p => p.member_id === member.id && p.task_master_id === task.id);
    let preferenceScore: number = SCORING_CONFIG.PREFERENCE.NEUTRAL;
    let prefText = 'Neutro em relação à tarefa';

    if (userPref) {
      if (userPref.preference === 'LIKE') {
        preferenceScore = SCORING_CONFIG.PREFERENCE.LIKE;
        prefText = 'Gosta muito desta atividade (+10 pts)';
      } else if (userPref.preference === 'DISLIKE') {
        preferenceScore = SCORING_CONFIG.PREFERENCE.DISLIKE;
        prefText = 'Prefere outras tarefas quando possível (-10 pts, não elimina)';
      }
    }

    // 5. Equilíbrio Semanal e Esforço Acumulado (balance_score)
    const allWeeklyAssignments = [...ctx.existingAssignments, ...currentDayAssignments];
    const memberEfforts: Record<string, number> = {};

    for (const m of ctx.users) {
      memberEfforts[m.id] = 0;
    }

    for (const asg of allWeeklyAssignments) {
      if (asg.status === 'SKIPPED' || asg.is_unassigned) continue;
      const t = ctx.allTasks.find(item => item.id === asg.task_id);
      if (!t) continue;
      const eff = BalanceService.calculateEffortPoints(t.duration_minutes, t.effort_level);
      memberEfforts[asg.member_id] = (memberEfforts[asg.member_id] || 0) + eff;
    }

    const activeMembers = getActiveMembers(ctx.users);
    const totalEffort = Object.values(memberEfforts).reduce((a, b) => a + b, 0);
    const avgEffort = activeMembers.length > 0 ? totalEffort / activeMembers.length : 0;
    const userEffort = memberEfforts[member.id] || 0;

    let balanceScore: number = SCORING_CONFIG.BALANCE.NORMAL;
    let balanceText = 'Contribuição equilibrada com o restante da família';

    if (userEffort < avgEffort * SCORING_CONFIG.BALANCE.LOW_CONTRIBUTION_THRESHOLD) {
      balanceScore = SCORING_CONFIG.BALANCE.BELOW_AVERAGE_BONUS;
      balanceText = 'Contribuição acumulada abaixo da média da família (busca equilíbrio justo)';
    } else if (
      userEffort > avgEffort * SCORING_CONFIG.BALANCE.HIGH_CONTRIBUTION_THRESHOLD &&
      avgEffort > SCORING_CONFIG.BALANCE.MINIMUM_SIGNIFICANT_AVG_EFFORT
    ) {
      balanceScore = SCORING_CONFIG.BALANCE.ABOVE_AVERAGE_PENALTY;
      balanceText = 'Contribuição acumulada acima da média (alívio inteligente de sobrecarga)';
    }

    // 6. Recência (-30, -20, -10, 0 pts)
    let recencyScore: number = SCORING_CONFIG.RECENCY.NO_PENALTY;
    let recencyText = 'Não realizou esta tarefa recentemente';

    const userPrevious = ctx.existingAssignments
      .filter(a => a.member_id === member.id && a.task_id === task.id && a.status === 'COMPLETED')
      .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());

    if (userPrevious.length > 0) {
      const diffDays = getDaysDifference(ctx.targetDate, userPrevious[0].scheduled_date);
      if (diffDays <= 1) {
        recencyScore = SCORING_CONFIG.RECENCY.WITHIN_24_HOURS;
        recencyText = 'Realizou esta mesma tarefa nas últimas 24h (-30 pts para rotação)';
      } else if (diffDays <= 3) {
        recencyScore = SCORING_CONFIG.RECENCY.WITHIN_3_DAYS;
        recencyText = 'Realizou esta tarefa há menos de 3 dias (-20 pts)';
      } else if (diffDays <= 7) {
        recencyScore = SCORING_CONFIG.RECENCY.WITHIN_7_DAYS;
        recencyText = 'Realizou esta tarefa há menos de 7 dias (-10 pts)';
      }
    }

    // 7. Agrupamento por Ambiente (Room Affinity) (+15 pts)
    let roomGroupingScore: number = 0;
    let roomAffinityText: string | undefined = undefined;

    const sameRoomAssigned = currentDayAssignments.some(a => {
      if (a.member_id !== member.id) return false;
      const existingTask = ctx.allTasks.find(t => t.id === a.task_id);
      return existingTask && existingTask.room_type === task.room_type;
    });

    if (sameRoomAssigned) {
      roomGroupingScore = SCORING_CONFIG.ROOM_AFFINITY.SAME_ROOM_BONUS;
      roomAffinityText = `Já está com atividade atribuída no mesmo ambiente (${task.room_type}) (+15 pts de agrupamento)`;
    }

    // Esforço ponderado da tarefa
    const effortPoints = BalanceService.calculateEffortPoints(task.duration_minutes, task.effort_level);
    const effortText = `${BalanceService.getEffortLabel(task.effort_level)} (${task.duration_minutes} min × peso ${task.effort_level} = ${effortPoints} pts de esforço)`;

    // Total Score
    const totalScore =
      capacityScore +
      availabilityScore +
      preferenceScore +
      balanceScore +
      recencyScore +
      roomGroupingScore;

    // Justificativa Humana
    const explanation = ExplainabilityService.generateAssignmentExplanation({
      member,
      task,
      capacityScore,
      availabilityScore,
      preferenceScore,
      balanceScore,
      recencyScore,
      roomGroupingScore,
      skillStatus: userSkill?.skill_status,
      roomType: task.room_type,
      durationMinutes: task.duration_minutes
    });

    return {
      userId: member.id,
      userName: member.name,
      totalScore,
      isEligible: true,
      breakdown: {
        capacityScore,
        availabilityScore,
        preferenceScore,
        balanceScore,
        recencyScore,
        roomGroupingScore,
        effortWeight: effortPoints
      },
      explanation,
      factors: {
        availability: availText,
        autonomy: autonomyText,
        weeklyBalance: balanceText,
        history: recencyText,
        preference: prefText,
        roomAffinity: roomAffinityText,
        effortInfo: effortText
      }
    };
  }

  /**
   * Ordena e prioriza a fila de tarefas do dia.
   */
  public static calculateTaskPriority(
    taskMaster: TaskMaster,
    familyTask: FamilyTask,
    ctx: ScoringContext
  ): TaskPriorityInfo {
    let score = SCORING_CONFIG.TASK_PRIORITY.BASE_SCORE;
    const reasons: string[] = [];

    // Urgência por categoria
    if (taskMaster.category === 'waste' || taskMaster.category === 'pets') {
      score += SCORING_CONFIG.TASK_PRIORITY.CATEGORY_URGENT_BONUS;
      reasons.push('Necessidade diária urgente (higiene/cuidados essenciais)');
    }

    if (taskMaster.category === 'kitchen') {
      score += SCORING_CONFIG.TASK_PRIORITY.CATEGORY_KITCHEN_BONUS;
      reasons.push('Refeições e louça com alto giro');
    }

    // Impacto visual
    if (taskMaster.room_type === 'living_room' || taskMaster.room_type === 'bathroom') {
      score += SCORING_CONFIG.TASK_PRIORITY.ROOM_HIGH_IMPACT_BONUS;
      reasons.push('Ambiente de convivência comum com alto impacto visual');
    }

    // Frequência
    if (familyTask.frequency === 'daily') {
      score += SCORING_CONFIG.TASK_PRIORITY.DAILY_FREQUENCY_BONUS;
      reasons.push('Rotina diária');
    }

    // Impacto da Diarista / Faxineira
    const helper = ctx.householdHelp;
    if (helper && helper.active) {
      const isHelperDay = helper.days.includes(ctx.dayOfWeek);
      const wasHelperYesterday = helper.days.includes((ctx.dayOfWeek + 6) % 7);

      if (isHelperDay && helper.tasks_covered.includes(taskMaster.id)) {
        score += SCORING_CONFIG.TASK_PRIORITY.HELPER_TODAY_PENALTY;
        reasons.push('Coberta hoje pelo apoio profissional');
      } else if (wasHelperYesterday && helper.tasks_covered.includes(taskMaster.id)) {
        score += SCORING_CONFIG.TASK_PRIORITY.HELPER_YESTERDAY_PENALTY;
        reasons.push('Ambiente limpo profundamente ontem pela diarista');
      }
    }

    return {
      taskId: taskMaster.id,
      priorityScore: score,
      reason: reasons.join('; ') || 'Prioridade padrão da rotina'
    };
  }
}
