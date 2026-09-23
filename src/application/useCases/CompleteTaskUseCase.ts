/**
 * CasaJunto - CompleteTaskUseCase
 * Caso de Uso: Registra a conclusão de uma tarefa com duração real e feedback de esforço.
 */

import { TaskAssignment, TaskFeedbackDifficulty } from '../../domain/models';

export interface CompleteTaskInput {
  assignmentId: string;
  familyId: string;
  memberId: string;
  feedbackDifficulty?: TaskFeedbackDifficulty;
  completionDurationMinutes?: number;
  notes?: string;
}

export class CompleteTaskUseCase {
  public execute(
    assignments: TaskAssignment[],
    input: CompleteTaskInput
  ): { updatedAssignments: TaskAssignment[]; completedAssignment: TaskAssignment } {
    const target = assignments.find(a => a.id === input.assignmentId);
    if (!target) {
      throw new Error(`Atribuição ${input.assignmentId} não encontrada.`);
    }

    const nowIso = new Date().toISOString();
    const updated: TaskAssignment = {
      ...target,
      status: 'COMPLETED',
      completed_at: nowIso,
      feedback_difficulty: input.feedbackDifficulty || target.feedback_difficulty || 'NORMAL',
      feedback_at: input.feedbackDifficulty ? nowIso : target.feedback_at,
      completion_duration: input.completionDurationMinutes !== undefined ? input.completionDurationMinutes : target.completion_duration,
      notes: input.notes !== undefined ? input.notes : target.notes
    };

    const updatedAssignments = assignments.map(a => (a.id === target.id ? updated : a));

    return {
      updatedAssignments,
      completedAssignment: updated
    };
  }
}
