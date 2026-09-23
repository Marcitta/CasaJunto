import { Task, UserRole } from '../../types';

export const ADMIN_ONLY_VIEWS = ['family', 'house', 'catalog', 'dashboard', 'domestic_support'] as const;
export const ALLOWED_MEMBER_VIEWS = ['today', 'routine', 'stats'] as const;

/**
 * RBAC Helper: Determina se uma aba/view pode ser acessada pelo papel especificado.
 * ADMIN ou demoMode acessam tudo.
 * MEMBER acessa estritamente 'today', 'routine', 'stats'.
 */
export function canAccessTab(role?: UserRole | string, viewId?: string): boolean {
  if (!viewId) return false;
  if (role === 'ADMIN') return true;
  return ALLOWED_MEMBER_VIEWS.includes(viewId as any);
}

export function canCreateTask(role?: UserRole | string): boolean {
  return role === 'ADMIN';
}

export function canDeleteTask(role?: UserRole | string): boolean {
  return role === 'ADMIN';
}

export function canRebalanceHouse(role?: UserRole | string): boolean {
  return role === 'ADMIN';
}

export function canManageMembers(role?: UserRole | string): boolean {
  return role === 'ADMIN';
}

export function canManageRooms(role?: UserRole | string): boolean {
  return role === 'ADMIN';
}

export function canManageRoutines(role?: UserRole | string): boolean {
  return role === 'ADMIN';
}

export function canEditMemberProfile(
  callerRole?: UserRole | string,
  callerMemberId?: string,
  targetMemberId?: string
): boolean {
  if (callerRole === 'ADMIN') return true;
  if (!callerMemberId || !targetMemberId) return false;
  return callerMemberId === targetMemberId;
}

/**
 * RB11, RB12, RB13:
 * Universo canônico de visibilidade para MEMBER:
 * - Tarefas atribuídas ao próprio Member
 * - Tarefas não atribuídas (unassigned)
 * NUNCA tarefas atribuídas exclusivamente a outro Member.
 * Para ADMIN: visualiza todas as tarefas operacionais.
 */
export function selectVisibleTodayTasks(
  tasks: Task[],
  memberId?: string,
  role?: UserRole | string
): Task[] {
  if (role === 'ADMIN') {
    return tasks;
  }

  if (!memberId) {
    // Sem morador definido em contexto não-admin: apenas não-atribuídas
    return tasks.filter(t => Boolean(t.isUnassigned) || !t.assignedMemberId);
  }

  return tasks.filter(t => {
    const isMine = t.assignedMemberId === memberId || t.assigneeId === memberId;
    const isUnassigned = Boolean(t.isUnassigned) || !t.assignedMemberId || t.assignedMemberId.trim() === '';
    return isMine || isUnassigned;
  });
}

/**
 * RB14:
 * Universo canônico de visibilidade na Rotina Semanal:
 * - Para MEMBER: tarefas do próprio morador + tarefas não-atribuídas
 * - Para ADMIN: todas as tarefas da rotina
 */
export function selectVisibleRoutineTasks(
  tasks: Task[],
  memberId?: string,
  role?: UserRole | string
): Task[] {
  return selectVisibleTodayTasks(tasks, memberId, role);
}

/**
 * RB23, RB24, RB25:
 * Avaliador canônico da regra de segurança do Firestore para mutações em:
 * /families/{familyId}/assignments/{assignmentId}
 * Espelha fielmente a semântica da firestore.rules para testes unitários e validação autoritativa.
 */
export interface AssignmentSecurityEvaluationParams {
  callerUid: string;
  callerMemberId: string;
  callerRole: 'ADMIN' | 'MEMBER';
  familyId: string;
  existingAssignment: Record<string, any>;
  newAssignment: Record<string, any>;
}

export function evaluateAssignmentUpdateRule(
  params: AssignmentSecurityEvaluationParams
): { allowed: boolean; reason?: string } {
  const { callerMemberId, callerRole, familyId, existingAssignment, newAssignment } = params;

  // 1. ADMIN de família tem permissão total
  if (callerRole === 'ADMIN') {
    return { allowed: true };
  }

  // 2. Isolamento de família: tenant não pode ser alterado
  if (
    newAssignment.family_id !== familyId ||
    existingAssignment.family_id !== familyId ||
    newAssignment.family_id !== existingAssignment.family_id
  ) {
    return { allowed: false, reason: 'TENANT_ISOLATION_VIOLATION' };
  }

  // 3. Invariantes imutáveis da identidade da tarefa para MEMBER
  if (newAssignment.task_id !== existingAssignment.task_id) {
    return { allowed: false, reason: 'IMMUTABLE_FIELD_TASK_ID' };
  }
  if (newAssignment.scheduled_date !== existingAssignment.scheduled_date) {
    return { allowed: false, reason: 'IMMUTABLE_FIELD_SCHEDULED_DATE' };
  }
  if (newAssignment.room_id !== existingAssignment.room_id) {
    return { allowed: false, reason: 'IMMUTABLE_FIELD_ROOM_ID' };
  }

  // 4. MEMBER não pode reverter tarefa já concluída
  const wasCompleted = existingAssignment.status === 'COMPLETED' || existingAssignment.status === 'DONE';
  if (wasCompleted) {
    return { allowed: false, reason: 'CANNOT_REVERT_COMPLETED_TASK' };
  }

  const isNewStatusCompleted = newAssignment.status === 'COMPLETED' || newAssignment.status === 'DONE';
  if (!isNewStatusCompleted) {
    return { allowed: false, reason: 'MEMBER_CAN_ONLY_TRANSITION_TO_COMPLETED' };
  }

  // 5. completed_by deve ser rigorosamente o callerMemberId
  if (newAssignment.completed_by !== callerMemberId) {
    return { allowed: false, reason: 'COMPLETED_BY_MUST_MATCH_CALLER' };
  }

  // 6. completed_at deve estar presente
  if (!newAssignment.completed_at) {
    return { allowed: false, reason: 'COMPLETED_AT_REQUIRED' };
  }

  // 7. CASO 1: NORMAL_COMPLETION (Tarefa já atribuída ao próprio membro)
  const isOriginallyAssignedToCaller = existingAssignment.member_id === callerMemberId;
  if (isOriginallyAssignedToCaller) {
    if (newAssignment.member_id !== callerMemberId) {
      return { allowed: false, reason: 'CANNOT_REASSIGN_OWN_TASK_ON_COMPLETION' };
    }
    return { allowed: true };
  }

  // 8. CASO 2: SELF_CLAIMED (Tarefa unassigned assumida no ato de conclusão)
  const isOriginallyUnassigned =
    existingAssignment.is_unassigned === true ||
    !existingAssignment.member_id ||
    existingAssignment.member_id === '';

  if (isOriginallyUnassigned) {
    if (newAssignment.member_id !== callerMemberId) {
      return { allowed: false, reason: 'SELF_CLAIM_MUST_BIND_TO_CALLER' };
    }
    return { allowed: true };
  }

  // 9. Bloqueio: Tarefa atribuída a outro membro não pode ser concluída por este MEMBER
  return { allowed: false, reason: 'CANNOT_COMPLETE_ANOTHER_MEMBERS_TASK' };
}

/**
 * MEMBER-RBAC-1A:
 * Criação de nova casa/família é exclusiva de ADMIN.
 * MEMBER não tem permissão para criar nova família.
 */
export function canCreateFamily(role?: UserRole | string): boolean {
  return role === 'ADMIN';
}

export interface CreateFamilySecurityEvaluationParams {
  callerUid: string;
  callerRole?: UserRole | string;
  familyData: {
    ownerUserId: string;
    [key: string]: any;
  };
}

export function evaluateCreateFamilyRule(
  params: CreateFamilySecurityEvaluationParams
): { allowed: boolean; reason?: string } {
  const { callerUid, callerRole, familyData } = params;

  if (!callerUid) {
    return { allowed: false, reason: 'UNAUTHENTICATED' };
  }

  if (familyData.ownerUserId !== callerUid) {
    return { allowed: false, reason: 'OWNER_USER_ID_MISMATCH' };
  }

  // MEMBER-RBAC-1A: Se o usuário possui papel ativo e não é ADMIN, criação é bloqueada
  if (callerRole && callerRole !== 'ADMIN') {
    return { allowed: false, reason: 'MEMBER_CANNOT_CREATE_FAMILY' };
  }

  return { allowed: true };
}

