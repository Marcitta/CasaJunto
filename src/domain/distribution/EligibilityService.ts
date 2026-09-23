/**
 * CasaJunto - EligibilityService
 * Camada 3 do Pipeline de Distribuição:
 * Elimina previamente qualquer candidato incompatível antes de calcular scores.
 */

import {
  Member,
  TaskMaster,
  MemberSkill,
  TaskAssignment
} from '../models';
import { SafetyService } from './SafetyService';
import { AvailabilityService, AvailabilityContext } from './AvailabilityService';

export interface EligibilityResult {
  isEligible: boolean;
  reason?: string;
}

export interface EligibilityContext extends AvailabilityContext {
  skills: MemberSkill[];
}

export class EligibilityService {
  /**
   * Avalia a elegibilidade completa do candidato para a tarefa.
   */
  public static checkEligibility(
    member: Member,
    task: TaskMaster,
    timeSlot: string,
    ctx: EligibilityContext,
    currentDayAssignments: TaskAssignment[]
  ): EligibilityResult {
    // 1. Filtro de Segurança
    const safety = SafetyService.validateSafety(member, task);
    if (!safety.isSafe) {
      return {
        isEligible: false,
        reason: safety.reason
      };
    }

    // 2. Autonomia Mínima Requerida
    const userSkill = (ctx.skills || []).find(s => s.member_id === member.id && s.task_master_id === task.id);
    const isNotLearned = userSkill?.skill_status === 'NOT_LEARNED';
    if (task.autonomy_required >= 3 && member.autonomy_level <= 1 && isNotLearned) {
      return {
        isEligible: false,
        reason: `Requer autonomia autônoma (${task.autonomy_required}) e ${member.name} ainda é iniciante nesta categoria`
      };
    }

    // 3. Disponibilidade Dinâmica e Teto Diário
    const avail = AvailabilityService.checkAvailability(member, timeSlot, task.duration_minutes, ctx, currentDayAssignments);
    if (!avail.isAvailable) {
      return {
        isEligible: false,
        reason: avail.reason || 'Sem tempo livre disponível na agenda'
      };
    }

    return { isEligible: true };
  }
}
