/**
 * CasaJunto - SafetyService
 * Camada 1 do Pipeline de Distribuição: Regras invioláveis de segurança física e idade.
 * Executado ANTES de qualquer cálculo de score ou elegibilidade.
 */

import { Member, TaskMaster } from '../models';

export interface SafetyCheckResult {
  isSafe: boolean;
  reason?: string;
}

export class SafetyService {
  /**
   * Valida se a tarefa é segura para o morador com base em idade, produtos químicos, fogo e altura.
   */
  public static validateSafety(member: Member, task: TaskMaster): SafetyCheckResult {
    // 1. Idade mínima estrita da tarefa
    if (member.age < task.minimum_age) {
      return {
        isSafe: false,
        reason: `Idade mínima de segurança é ${task.minimum_age} anos (${member.name} tem ${member.age} anos)`
      };
    }

    // 2. Tarefas restritas estritamente a adultos (produtos químicos, altura, fogo, eletricidade)
    if (task.safety_level === 'adult_only' && member.age < 18 && member.role !== 'ADMIN') {
      return {
        isSafe: false,
        reason: 'Tarefa restrita a adultos por envolver produtos químicos, chamas ou ferramentas cortantes'
      };
    }

    // 3. Tarefas bloqueadas especificamente no perfil do morador (alergias, restrições médicas, etc.)
    if (member.blocked_task_ids && member.blocked_task_ids.includes(task.id)) {
      return {
        isSafe: false,
        reason: `Tarefa bloqueada nas preferências de perfil de ${member.name}`
      };
    }

    return { isSafe: true };
  }
}
