/**
 * CasaJunto - ExplainabilityService
 * Camada 5 do Pipeline de Distribuição:
 * Gera justificativas em linguagem humana clara ("Por que eu?"),
 * breakdown detalhado dos fatores matemáticos e conselhos não punitivos.
 */

import {
  Member,
  TaskMaster,
  AssignmentFactorInfo,
  TaskAssignment
} from '../models';

export interface ExplanationContext {
  member: Member;
  task: TaskMaster;
  capacityScore: number;
  availabilityScore: number;
  preferenceScore: number;
  balanceScore: number;
  recencyScore: number;
  roomGroupingScore: number;
  skillStatus?: string;
  roomType: string;
  durationMinutes: number;
}

export class ExplainabilityService {
  /**
   * Gera a frase de justificativa transparente em linguagem natural.
   */
  public static generateAssignmentExplanation(ctx: ExplanationContext): string {
    const { member, task, roomGroupingScore, preferenceScore, balanceScore, recencyScore, skillStatus, durationMinutes } = ctx;
    const taskTitle = (task as any).title || task.name || 'esta tarefa';

    if (roomGroupingScore > 0) {
      return `${member.name} recebeu ${taskTitle} porque já estava organizando o mesmo ambiente (${task.room_type || 'ambiente'}) e possui autonomia para realizá-la.`;
    }
    if (preferenceScore > 0 && balanceScore >= 0) {
      return `${member.name} recebeu ${taskTitle} porque gosta da atividade, possui tempo disponível hoje e sua contribuição equilibra a casa.`;
    }
    if (balanceScore > 10) {
      return `${member.name} recebeu ${taskTitle} porque estava disponível por ${durationMinutes} minutos, possui autonomia e sua contribuição semanal equilibra a divisão familiar.`;
    }
    if (balanceScore < -10) {
      return `Mesmo com volume de tarefas na semana, ${member.name} é quem possui a autonomia e horário disponível ideal para ${taskTitle}.`;
    }
    if (recencyScore < 0) {
      return `${member.name} assumiu ${taskTitle} para manter a alternância de responsáveis e rotação justa da casa.`;
    }
    if (skillStatus === 'LEARNING') {
      return `${member.name} recebeu ${taskTitle} para praticar com supervisão e desenvolver autonomia, respeitando seus horários livres.`;
    }
    if (preferenceScore > 0) {
      return `${member.name} foi escolhido(a) para ${taskTitle} devido à sua afinidade com a atividade e compatibilidade de horário.`;
    }
    return `${member.name} foi a pessoa mais indicada para ${taskTitle} considerando autonomia, disponibilidade (${durationMinutes} min) e rotação justa de tarefas.`;
  }

  /**
   * Gera orientações e conselhos motivadores para o dashboard da família.
   */
  public static generateSmartAdvice(
    assignments: TaskAssignment[],
    members: Member[],
    tasks: TaskMaster[]
  ): string {
    if (assignments.length === 0) return 'Tudo em ordem na casa!';

    const activeAssignments = assignments.filter(a => !a.is_unassigned);
    const completedCount = activeAssignments.filter(a => a.status === 'COMPLETED').length;
    const completionRate = Math.round((completedCount / (activeAssignments.length || 1)) * 100);

    if (completionRate >= 80) {
      return 'Excelente ritmo! A casa está em harmonia e as responsabilidades foram cumpridas com tranquilidade.';
    }

    const unassignedCount = assignments.filter(a => a.is_unassigned).length;
    if (unassignedCount > 0) {
      return `O motor protegeu a rotina dos moradores e identificou ${unassignedCount} tarefa(s) que precisam de revisão do administrador por limite de tempo.`;
    }

    return 'O algoritmo distribuiu as tarefas considerando esforço real, faixa etária de segurança, preferências e horários protegidos.';
  }
}
