/**
 * CasaJunto - GetTodayTasksUseCase
 * Caso de Uso: Obtém as tarefas do dia, organizadas por morador e status.
 */

import { TaskAssignment } from '../../domain/models';

export interface GetTodayTasksInput {
  familyId: string;
  targetDate: string; // YYYY-MM-DD
  filterMemberId?: string;
}

export class GetTodayTasksUseCase {
  public execute(
    assignments: TaskAssignment[],
    input: GetTodayTasksInput
  ): {
    todayAssignments: TaskAssignment[];
    pendingCount: number;
    completedCount: number;
    unassignedCount: number;
  } {
    const todayAssignments = assignments.filter(a => {
      if (a.family_id !== input.familyId) return false;
      if (a.scheduled_date !== input.targetDate) return false;
      if (input.filterMemberId && a.member_id !== input.filterMemberId && !a.is_unassigned) {
        return false;
      }
      return true;
    });

    const pendingCount = todayAssignments.filter(a => a.status === 'SCHEDULED' || a.status === 'IN_PROGRESS').length;
    const completedCount = todayAssignments.filter(a => a.status === 'COMPLETED').length;
    const unassignedCount = todayAssignments.filter(a => a.is_unassigned).length;

    return {
      todayAssignments,
      pendingCount,
      completedCount,
      unassignedCount
    };
  }
}
