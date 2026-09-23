/**
 * CasaJunto - RescheduleTaskUseCase
 * Caso de Uso: Reagenda uma tarefa para outra data/horário de maneira não punitiva.
 */

import { TaskAssignment } from '../../domain/models';

export interface RescheduleTaskInput {
  assignmentId: string;
  familyId: string;
  newDate: string; // YYYY-MM-DD
  newStartTime?: string;
  newEndTime?: string;
  notes?: string;
}

export class RescheduleTaskUseCase {
  public execute(
    assignments: TaskAssignment[],
    input: RescheduleTaskInput
  ): { updatedAssignments: TaskAssignment[]; rescheduledAssignment: TaskAssignment } {
    const target = assignments.find(a => a.id === input.assignmentId);
    if (!target) {
      throw new Error(`Atribuição ${input.assignmentId} não encontrada.`);
    }

    const updated: TaskAssignment = {
      ...target,
      status: 'RESCHEDULED',
      scheduled_date: input.newDate,
      scheduled_start: input.newStartTime || target.scheduled_start,
      scheduled_end: input.newEndTime || target.scheduled_end,
      rescheduled_count: (target.rescheduled_count || 0) + 1,
      notes: input.notes !== undefined ? input.notes : target.notes
    };

    const updatedAssignments = assignments.map(a => (a.id === target.id ? updated : a));

    return {
      updatedAssignments,
      rescheduledAssignment: updated
    };
  }
}
