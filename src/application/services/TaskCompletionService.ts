import { Member, Task, TaskAssignment, CompletionType } from '../../types';

export interface CompletionAuthParams {
  task: Partial<Task> | Partial<TaskAssignment>;
  callerMember: Member | null;
}

export interface CompletionAuthResult {
  allowed: boolean;
  reason?: string;
  completionType?: CompletionType;
  targetMemberId?: string; // Member who receives the points and streak rewards
  assignedMemberId?: string; // Resulting canonical assigned member ID
  isSelfClaim?: boolean;
}

export class TaskCompletionService {
  /**
   * Evaluates completion authorization based on strict Casa Junto RBAC & Proactivity rules.
   * 
   * Product Rules:
   * 1. ASSIGNED MEMBER: Member responsible for the task.
   * 2. COMPLETED BY: Member who executed/recorded the completion.
   * 3. SELF-CLAIMED / PROACTIVITY: Task was UNASSIGNED and was spontaneously claimed + completed.
   * 
   * Rule matrix:
   * - MEMBER + OWN TASK -> ALLOW (NORMAL_COMPLETION, rewards MEMBER)
   * - MEMBER + OTHER'S TASK -> DENY (no points, no streak, no write)
   * - MEMBER + UNASSIGNED -> ALLOW (SELF_CLAIMED, becomes assigned to MEMBER, rewards MEMBER)
   * - ADMIN + MEMBER TASK -> ALLOW (ADMIN_INTERVENTION, PRESERVES assignedMemberId, records completedBy=ADMIN)
   * - ADMIN + OWN TASK -> ALLOW (NORMAL_COMPLETION, rewards ADMIN)
   * - ADMIN + UNASSIGNED -> ALLOW (SELF_CLAIMED, becomes assigned to ADMIN, rewards ADMIN)
   */
  public static authorizeCompletion(params: CompletionAuthParams): CompletionAuthResult {
    const { task, callerMember } = params;

    // Section 9: Fail closed if caller is not an identified active member
    if (!callerMember || !callerMember.id) {
      return {
        allowed: false,
        reason: 'UNAUTHENTICATED: Nenhum morador autenticado identificado no lar ativo.'
      };
    }

    // Section 14: Idempotency check
    const status = (task as any).status;
    if (status === 'COMPLETED' || status === 'DONE') {
      return {
        allowed: false,
        reason: 'ALREADY_COMPLETED: Esta tarefa já foi concluída.'
      };
    }

    // Determine current assignment ID
    const assignedMemberId = 
      (task as any).assignedMemberId || 
      (task as any).assigneeId || 
      (task as any).member_id || 
      '';

    const isExplicitlyUnassigned = 
      Boolean((task as any).isUnassigned) || 
      Boolean((task as any).is_unassigned);

    const isUnassigned = isExplicitlyUnassigned || !assignedMemberId || assignedMemberId.trim() === '';

    const isAdmin = callerMember.role === 'ADMIN';

    // SCENARIO: UNASSIGNED TASK (MEMBER or ADMIN) -> SELF_CLAIMED
    if (isUnassigned) {
      return {
        allowed: true,
        completionType: 'SELF_CLAIMED',
        targetMemberId: callerMember.id, // caller receives reward
        assignedMemberId: callerMember.id, // becomes assigned to caller
        isSelfClaim: true
      };
    }

    // SCENARIO: TASK ASSIGNED TO CALLER (MEMBER or ADMIN) -> NORMAL_COMPLETION
    if (assignedMemberId === callerMember.id) {
      return {
        allowed: true,
        completionType: 'NORMAL_COMPLETION',
        targetMemberId: callerMember.id, // caller receives reward
        assignedMemberId: callerMember.id, // preserved
        isSelfClaim: false
      };
    }

    // SCENARIO: TASK ASSIGNED TO ANOTHER MEMBER
    if (isAdmin) {
      // ADMIN INTERVENTION
      // CRITICAL RULE: DO NOT transfer assignment to Admin. Preserve original assignedMemberId.
      return {
        allowed: true,
        completionType: 'ADMIN_INTERVENTION',
        targetMemberId: assignedMemberId, // Preserved architectural behavior: assigned member receives reward
        assignedMemberId: assignedMemberId, // Preserved!
        isSelfClaim: false
      };
    }

    // MEMBER attempting to complete another member's task -> DENY
    return {
      allowed: false,
      reason: 'FORBIDDEN: Morador não tem autorização para concluir tarefa atribuída a outro morador.'
    };
  }

  /**
   * Helper to format human-readable observation of completion for UI and activity feeds.
   */
  public static getCompletionObservation(task: {
    completionType?: CompletionType;
    completedByName?: string;
    completedByMemberId?: string;
    assignedMemberId?: string;
    assigneeName?: string;
  }, members: Member[]): string | null {
    const isIntervention = 
      task.completionType === 'ADMIN_INTERVENTION' || 
      (Boolean(task.completedByMemberId) && Boolean(task.assignedMemberId) && task.completedByMemberId !== task.assignedMemberId);

    const completedName = task.completedByName || members.find(m => m.id === task.completedByMemberId)?.name || 'Admin';

    if (isIntervention) {
      return `Concluída pela administradora ${completedName}`;
    }

    if (task.completionType === 'SELF_CLAIMED') {
      return `Assumida e concluída por iniciativa de ${completedName}`;
    }

    return null;
  }
}
