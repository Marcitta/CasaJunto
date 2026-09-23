/**
 * CasaJunto - Firestore Entity Mappers
 * Converte documentos do Firestore para entidades do domínio e vice-versa.
 * Isola o formato do banco do modelo de domínio e padroniza timestamps (createdAt / updatedAt).
 */

import {
  User,
  Family,
  FamilyMembership,
  Member,
  House,
  Room,
  FamilyTask,
  TaskAssignment,
  MemberSkill,
  MemberPreference,
  MemberAvailability,
  ProtectedTime,
  CalendarEvent,
  HouseholdHelp,
  AuditLog,
  FamilyInvitation,
  ChaosSession,
  ChaosSessionStatus,
  ChaosState
} from '../../domain/models';

export class FirestoreMappers {
  /**
   * Sanitiza recursivamente objetos e payloads antes de enviar ao Firestore.
   * Regras estritas:
   * - Remove propriedades cujo valor é estritamente `undefined` (omissão explícita)
   * - Preserva boolean `false`
   * - Preserva número `0` e outros numéricos
   * - Preserva string vazia `""`
   * - Preserva `null` quando for valor canônico
   * - Funciona recursivamente em objetos literais e arrays
   * - Não altera instâncias de Date, Timestamp ou tipos nativos do Firestore
   */
  public static sanitizePayload<T = any>(val: T): T {
    if (val === undefined) {
      return undefined as unknown as T;
    }
    if (val === null || typeof val !== 'object') {
      return val;
    }
    // Preservar instâncias de Date
    if (val instanceof Date) {
      return val;
    }
    // Preservar instâncias especiais do Firestore (Timestamp, FieldValue, etc.)
    if (
      (val as any)._methodName ||
      typeof (val as any).toMillis === 'function' ||
      typeof (val as any).isEqual === 'function'
    ) {
      return val;
    }
    // Tratar Arrays: sanitiza cada elemento e filtra undefined
    if (Array.isArray(val)) {
      return val
        .filter(item => item !== undefined)
        .map(item => FirestoreMappers.sanitizePayload(item)) as unknown as T;
    }
    // Tratar Objetos literais: copia omitindo propriedades undefined
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(val)) {
      if (value !== undefined) {
        const cleanValue = FirestoreMappers.sanitizePayload(value);
        if (cleanValue !== undefined) {
          sanitized[key] = cleanValue;
        }
      }
    }
    return sanitized as T;
  }

  // 1. USER
  public static toUser(docId: string, data: any): User {
    const now = new Date().toISOString();
    return {
      id: docId,
      email: data.email || '',
      displayName: data.displayName || data.name || '',
      name: data.name || data.displayName || '',
      photoURL: data.photoURL || data.avatar || '',
      avatar: data.avatar || data.photoURL || '👤',
      system_role: data.system_role || 'USER',
      createdAt: data.createdAt || data.created_at || now,
      created_at: data.created_at || data.createdAt || now,
      updatedAt: data.updatedAt || now,
      last_login_at: data.last_login_at || now,
      is_active: data.is_active !== undefined ? data.is_active : true
    };
  }

  public static fromUser(user: Partial<User>): Record<string, any> {
    const now = new Date().toISOString();
    return {
      email: user.email || '',
      displayName: user.displayName || user.name || '',
      name: user.name || user.displayName || '',
      photoURL: user.photoURL || user.avatar || '',
      avatar: user.avatar || user.photoURL || '👤',
      system_role: user.system_role || 'USER',
      createdAt: user.createdAt || user.created_at || now,
      updatedAt: now,
      last_login_at: user.last_login_at || now,
      is_active: user.is_active !== undefined ? user.is_active : true
    };
  }

  // 2. FAMILY
  public static toFamily(docId: string, data: any): Family {
    const now = new Date().toISOString();
    return {
      id: docId,
      name: data.name || 'Minha Família',
      ownerUserId: data.ownerUserId || data.created_by_user_id || '',
      created_by_user_id: data.created_by_user_id || data.ownerUserId || '',
      timezone: data.timezone || 'America/Sao_Paulo',
      balance_mode: data.balance_mode || 'fair_share',
      active: data.active !== undefined ? data.active : true,
      environment: data.environment || 'production',
      status: data.status || 'ACTIVE',
      main_problem: data.main_problem || undefined,
      main_problems: data.main_problems || undefined,
      createdAt: data.createdAt || data.created_at || now,
      created_at: data.created_at || data.createdAt || now,
      updatedAt: data.updatedAt || now
    };
  }

  public static fromFamily(family: Partial<Family>): Record<string, any> {
    const now = new Date().toISOString();
    return {
      id: family.id,
      name: family.name,
      ownerUserId: family.ownerUserId || family.created_by_user_id || '',
      created_by_user_id: family.created_by_user_id || family.ownerUserId || '',
      timezone: family.timezone || 'America/Sao_Paulo',
      balance_mode: family.balance_mode || 'fair_share',
      active: family.active !== undefined ? family.active : true,
      environment: family.environment || 'production',
      status: family.status || 'ACTIVE',
      main_problem: family.main_problem || null,
      main_problems: family.main_problems || [],
      createdAt: family.createdAt || family.created_at || now,
      updatedAt: now
    };
  }

  // 2.1. FAMILY MEMBERSHIP
  public static toFamilyMembership(docId: string, data: any): FamilyMembership {
    const now = new Date().toISOString();
    return {
      id: docId,
      familyId: data.familyId || '',
      userId: data.userId || '',
      memberId: data.memberId || undefined,
      role: data.role || 'MEMBER',
      status: data.status || 'ACTIVE',
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    };
  }

  public static fromFamilyMembership(membership: Partial<FamilyMembership>): Record<string, any> {
    const now = new Date().toISOString();
    return {
      id: membership.id,
      familyId: membership.familyId,
      userId: membership.userId,
      memberId: membership.memberId || null,
      role: membership.role || 'MEMBER',
      status: membership.status || 'ACTIVE',
      createdAt: membership.createdAt || now,
      updatedAt: now
    };
  }

  // 3. MEMBER
  public static toMember(docId: string, data: any): Member {
    const now = new Date().toISOString();
    return {
      id: docId,
      family_id: data.family_id || data.familyId || '',
      familyId: data.familyId || data.family_id || '',
      user_id: data.user_id || data.userId || undefined,
      userId: data.userId || data.user_id || undefined,
      name: data.name || '',
      email: data.email || undefined,
      avatar: data.avatar || '👤',
      color: data.color || '#A5D8FF',
      role: data.role || 'MEMBER',
      birth_date: data.birth_date || '2000-01-01',
      age: data.age || 18,
      autonomy_level: data.autonomy_level || data.autonomyLevel || 3,
      autonomyLevel: data.autonomyLevel || data.autonomy_level || 3,
      active: data.active !== undefined ? data.active : true,
      phone: data.phone || undefined,
      bio: data.bio || undefined,
      max_daily_minutes: data.max_daily_minutes || undefined,
      blocked_task_ids: data.blocked_task_ids || [],
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now
    };
  }

  public static fromMember(member: Partial<Member>): Record<string, any> {
    const now = new Date().toISOString();
    return {
      id: member.id,
      family_id: member.family_id || member.familyId || '',
      user_id: member.user_id || member.userId || null,
      name: member.name,
      email: member.email || null,
      avatar: member.avatar || '👤',
      color: member.color || '#A5D8FF',
      role: member.role || 'MEMBER',
      birth_date: member.birth_date,
      age: member.age,
      autonomy_level: member.autonomy_level || member.autonomyLevel || 3,
      active: member.active !== undefined ? member.active : true,
      phone: member.phone || null,
      bio: member.bio || null,
      max_daily_minutes: member.max_daily_minutes || null,
      blocked_task_ids: member.blocked_task_ids || [],
      createdAt: member.createdAt || now,
      updatedAt: now
    };
  }

  // 4. HOUSE
  public static toHouse(docId: string, data: any): House {
    return {
      id: docId,
      family_id: data.family_id || '',
      property_type: data.property_type || 'apartment',
      bedrooms: data.bedrooms || 2,
      bathrooms: data.bathrooms || 1,
      has_pets: data.has_pets !== undefined ? data.has_pets : false,
      pets_summary: data.pets_summary || undefined,
      pets: data.pets || []
    };
  }

  public static fromHouse(house: Partial<House>): Record<string, any> {
    const now = new Date().toISOString();
    return {
      id: house.id,
      family_id: house.family_id,
      property_type: house.property_type || 'apartment',
      bedrooms: house.bedrooms || 2,
      bathrooms: house.bathrooms || 1,
      has_pets: house.has_pets !== undefined ? house.has_pets : false,
      pets_summary: house.pets_summary || null,
      pets: house.pets || [],
      updatedAt: now
    };
  }

  // 5. ROOM
  public static toRoom(docId: string, data: any): Room {
    return {
      id: docId,
      house_id: data.house_id || '',
      family_id: data.family_id || '',
      name: data.name || '',
      type: data.type || 'other',
      icon: data.icon || undefined,
      color: data.color || undefined,
      active: data.active !== undefined ? data.active : true,
      createdAt: data.createdAt || data.created_at || undefined,
      updatedAt: data.updatedAt || data.updated_at || undefined,
      created_at: data.created_at || data.createdAt || undefined,
      updated_at: data.updated_at || data.updatedAt || undefined
    };
  }

  public static fromRoom(room: Partial<Room>): Record<string, any> {
    const now = new Date().toISOString();
    return {
      id: room.id,
      house_id: room.house_id || '',
      family_id: room.family_id,
      name: room.name,
      type: room.type,
      icon: room.icon || null,
      color: room.color || null,
      active: room.active !== undefined ? room.active : true,
      createdAt: room.createdAt || room.created_at || now,
      updatedAt: now,
      created_at: room.created_at || room.createdAt || now,
      updated_at: now
    };
  }

  // 6. FAMILY TASK
  public static toFamilyTask(docId: string, data: any): FamilyTask {
    const now = new Date().toISOString();
    return {
      id: docId,
      family_id: data.family_id || data.familyId || '',
      familyId: data.familyId || data.family_id || '',
      task_master_id: data.task_master_id || data.taskMasterId || '',
      taskMasterId: data.taskMasterId || data.task_master_id || '',
      name: data.name || undefined,
      custom_name: data.custom_name || undefined,
      room_id: data.room_id || data.roomId || undefined,
      roomId: data.roomId || data.room_id || undefined,
      room: data.room || undefined,
      category: data.category || undefined,
      frequency: data.frequency || 'weekly',
      preferred_days: data.preferred_days || data.preferredDays || [1],
      preferredDays: data.preferredDays || data.preferred_days || [1],
      day_of_month: data.day_of_month !== undefined ? data.day_of_month : (data.dayOfMonth !== undefined ? data.dayOfMonth : undefined),
      dayOfMonth: data.dayOfMonth !== undefined ? data.dayOfMonth : (data.day_of_month !== undefined ? data.day_of_month : undefined),
      start_date: data.start_date || data.startDate || undefined,
      startDate: data.startDate || data.start_date || undefined,
      preferred_time: data.preferred_time || data.preferredTime || undefined,
      preferredTime: data.preferredTime || data.preferred_time || undefined,
      estimated_minutes: data.estimated_minutes !== undefined ? data.estimated_minutes : (data.estimatedMinutes !== undefined ? data.estimatedMinutes : undefined),
      active: typeof data.active === 'boolean' ? data.active : (data.active !== undefined && data.active !== null ? Boolean(data.active) : true),
      chaosEligible: data.chaosEligible === true,
      assigned_automatically: data.assigned_automatically !== undefined ? Boolean(data.assigned_automatically) : true,
      customTitle: data.customTitle || data.custom_title || undefined,
      custom_title: data.custom_title || data.customTitle || undefined,
      customDescription: data.customDescription || data.custom_description || undefined,
      custom_description: data.custom_description || data.customDescription || undefined,
      createdAt: data.createdAt || data.created_at || now,
      updatedAt: data.updatedAt || data.updated_at || now
    };
  }

  public static fromFamilyTask(task: Partial<FamilyTask>): Record<string, any> {
    const now = new Date().toISOString();
    return {
      id: task.id,
      family_id: task.family_id || task.familyId,
      task_master_id: task.task_master_id || task.taskMasterId,
      name: task.name || null,
      custom_name: task.custom_name || null,
      customTitle: task.customTitle || task.custom_title || null,
      custom_title: task.custom_title || task.customTitle || null,
      customDescription: task.customDescription || task.custom_description || null,
      custom_description: task.custom_description || task.customDescription || null,
      room_id: task.room_id || task.roomId || null,
      category: task.category || null,
      frequency: task.frequency || 'daily',
      preferred_days: task.preferred_days || task.preferredDays || [1],
      day_of_month: task.day_of_month !== undefined ? task.day_of_month : (task.dayOfMonth !== undefined ? task.dayOfMonth : null),
      start_date: task.start_date || task.startDate || null,
      preferred_time: task.preferred_time || task.preferredTime || null,
      estimated_minutes: task.estimated_minutes !== undefined ? task.estimated_minutes : null,
      active: typeof task.active === 'boolean' ? task.active : (task.active !== undefined && task.active !== null ? Boolean(task.active) : true),
      chaosEligible: task.chaosEligible === true,
      assigned_automatically: task.assigned_automatically !== undefined ? Boolean(task.assigned_automatically) : true,
      createdAt: task.createdAt || task.created_at || now,
      updatedAt: now
    };
  }

  // 7. TASK ASSIGNMENT
  public static toTaskAssignment(docId: string, data: any): TaskAssignment {
    return {
      id: docId,
      family_id: data.family_id || data.familyId || '',
      family_task_id: data.family_task_id || data.familyTaskId || undefined,
      task_id: data.task_id || data.taskMasterId || data.taskId || '',
      member_id: data.member_id || data.assignedMemberId || data.assigneeId || data.assignee_id || data.assigned_member_id || '',
      room_id: data.room_id || data.roomId || undefined,
      scheduled_date: data.scheduled_date || data.dueDate || '',
      scheduled_start: data.scheduled_start || data.scheduledStart || undefined,
      scheduled_end: data.scheduled_end || data.scheduledEnd || undefined,
      status: data.status || 'SCHEDULED',
      score: data.score || 0,
      assigned_reason: data.assigned_reason || data.assignedReason || '',
      factors: data.factors || undefined,
      feedback_difficulty: data.feedback_difficulty || data.feedbackDifficulty || undefined,
      feedback_at: data.feedback_at || data.feedbackAt || undefined,
      is_unassigned: data.is_unassigned !== undefined ? data.is_unassigned : (data.isUnassigned !== undefined ? data.isUnassigned : false),
      unassigned_reason: data.unassigned_reason || data.unassignedReason || undefined,
      completed_at: data.completed_at || data.completedAt || undefined,
      completion_duration: data.completion_duration || data.completionDuration || undefined,
      completed_by: data.completed_by || data.completedByMemberId || data.completedBy || undefined,
      completed_by_name: data.completed_by_name || data.completedByName || undefined,
      completion_type: data.completion_type || data.completionType || undefined,
      rescheduled_count: data.rescheduled_count || data.rescheduledCount || 0,
      notes: data.notes || undefined,
      is_blitz: data.is_blitz !== undefined ? data.is_blitz : (data.isBlitz !== undefined ? data.isBlitz : false),
      chaos_session_id: data.chaos_session_id || data.chaosSessionId || undefined,
      chaosSessionId: data.chaosSessionId || data.chaos_session_id || undefined,
      chaos_strategy: data.chaos_strategy || data.chaosStrategy || undefined,
      chaosStrategy: data.chaosStrategy || data.chaos_strategy || undefined
    };
  }

  /**
   * Serialização canônica unificada de TaskAssignment para escrita no Firestore (setDoc/updateDoc/writeBatch).
   * Arquitetura canônica (HF4-R3):
   * TaskAssignment domain object -> toTaskAssignmentPersistencePayload -> sanitizePayload -> Firestore
   * 
   * Regras estritas:
   * - Remove recursivamente propriedades cujo valor é estritamente undefined (omissão explícita)
   * - Preserva null, false, 0, strings válidas (""), arrays, objetos aninhados e Timestamps do Firestore
   * - Não converte undefined genericamente para null
   * - Semântica de transição de domínio para unassigned_reason:
   *   Se is_unassigned === false (ou member_id atribuído) e unassigned_reason é undefined,
   *   define unassigned_reason: null para limpar explicitamente no Firestore qualquer motivo anterior obsoleto.
   * - Não muta o objeto de entrada
   */
  public static toTaskAssignmentPersistencePayload(
    assignment: Partial<TaskAssignment> | Record<string, any>
  ): Record<string, any> {
    const raw = assignment as any;
    const payload: Record<string, any> = {};

    if (raw.id !== undefined) payload.id = raw.id;
    if (raw.family_id !== undefined || raw.familyId !== undefined) {
      payload.family_id = raw.family_id !== undefined ? raw.family_id : raw.familyId;
    }
    if (raw.family_task_id !== undefined || raw.familyTaskId !== undefined) {
      payload.family_task_id = raw.family_task_id !== undefined ? raw.family_task_id : raw.familyTaskId;
    }
    if (raw.task_id !== undefined || raw.taskMasterId !== undefined || raw.taskId !== undefined) {
      payload.task_id = raw.task_id !== undefined ? raw.task_id : (raw.taskMasterId !== undefined ? raw.taskMasterId : raw.taskId);
    }

    const memberId = raw.member_id !== undefined
      ? raw.member_id
      : (raw.assignedMemberId !== undefined
        ? raw.assignedMemberId
        : (raw.assigneeId !== undefined
          ? raw.assigneeId
          : raw.assignee_id));
    if (memberId !== undefined) {
      payload.member_id = memberId;
      payload.assignee_id = memberId;
    }

    if (raw.room_id !== undefined || raw.roomId !== undefined) {
      payload.room_id = raw.room_id !== undefined ? raw.room_id : raw.roomId;
    }
    if (raw.scheduled_date !== undefined || raw.scheduledDate !== undefined || raw.dueDate !== undefined) {
      payload.scheduled_date = raw.scheduled_date !== undefined ? raw.scheduled_date : (raw.scheduledDate !== undefined ? raw.scheduledDate : raw.dueDate);
    }
    if (raw.scheduled_start !== undefined || raw.scheduledStart !== undefined) {
      payload.scheduled_start = raw.scheduled_start !== undefined ? raw.scheduled_start : raw.scheduledStart;
    }
    if (raw.scheduled_end !== undefined || raw.scheduledEnd !== undefined) {
      payload.scheduled_end = raw.scheduled_end !== undefined ? raw.scheduled_end : raw.scheduledEnd;
    }
    if (raw.status !== undefined) {
      payload.status = raw.status;
    }
    if (raw.score !== undefined) {
      payload.score = raw.score;
    }
    if (raw.assigned_reason !== undefined || raw.assignedReason !== undefined) {
      payload.assigned_reason = raw.assigned_reason !== undefined ? raw.assigned_reason : raw.assignedReason;
    }
    if (raw.factors !== undefined) {
      payload.factors = raw.factors && typeof raw.factors === 'object'
        ? FirestoreMappers.sanitizePayload(raw.factors)
        : raw.factors;
    }
    if (raw.feedback_difficulty !== undefined || raw.feedbackDifficulty !== undefined) {
      payload.feedback_difficulty = raw.feedback_difficulty !== undefined ? raw.feedback_difficulty : raw.feedbackDifficulty;
    }
    if (raw.feedback_at !== undefined || raw.feedbackAt !== undefined) {
      payload.feedback_at = raw.feedback_at !== undefined ? raw.feedback_at : raw.feedbackAt;
    }

    // is_unassigned
    const isUnassigned = raw.is_unassigned !== undefined
      ? raw.is_unassigned
      : raw.isUnassigned;
    if (isUnassigned !== undefined) {
      payload.is_unassigned = isUnassigned;
    }

    // unassigned_reason com semântica canônica de transição de estado
    const rawReason = raw.unassigned_reason !== undefined
      ? raw.unassigned_reason
      : raw.unassignedReason;

    if (rawReason !== undefined) {
      payload.unassigned_reason = rawReason;
    } else if (isUnassigned === false || (memberId && memberId !== '' && isUnassigned !== true)) {
      // Tarefa atribuída a morador: limpa canonicamente o motivo no Firestore com null
      payload.unassigned_reason = null;
    }

    // Metadados de conclusão
    if (raw.completed_at !== undefined || raw.completedAt !== undefined) {
      payload.completed_at = raw.completed_at !== undefined ? raw.completed_at : raw.completedAt;
    }
    if (raw.completion_duration !== undefined || raw.completionDuration !== undefined) {
      payload.completion_duration = raw.completion_duration !== undefined ? raw.completion_duration : raw.completionDuration;
    }
    const completedBy = raw.completed_by !== undefined
      ? raw.completed_by
      : (raw.completedByMemberId !== undefined ? raw.completedByMemberId : raw.completedBy);
    if (completedBy !== undefined) {
      payload.completed_by = completedBy;
    }
    if (raw.completed_by_name !== undefined || raw.completedByName !== undefined) {
      payload.completed_by_name = raw.completed_by_name !== undefined ? raw.completed_by_name : raw.completedByName;
    }
    if (raw.completion_type !== undefined || raw.completionType !== undefined) {
      payload.completion_type = raw.completion_type !== undefined ? raw.completion_type : raw.completionType;
    }

    if (raw.rescheduled_count !== undefined || raw.rescheduledCount !== undefined) {
      payload.rescheduled_count = raw.rescheduled_count !== undefined ? raw.rescheduled_count : raw.rescheduledCount;
    }
    if (raw.notes !== undefined) {
      payload.notes = raw.notes;
    }
    if (raw.is_blitz !== undefined || raw.isBlitz !== undefined) {
      payload.is_blitz = raw.is_blitz !== undefined ? raw.is_blitz : raw.isBlitz;
    }

    // Metadados do Modo Caos
    if (raw.chaos_session_id !== undefined || raw.chaosSessionId !== undefined) {
      payload.chaos_session_id = raw.chaos_session_id !== undefined ? raw.chaos_session_id : raw.chaosSessionId;
    }
    if (raw.chaos_strategy !== undefined || raw.chaosStrategy !== undefined) {
      payload.chaos_strategy = raw.chaos_strategy !== undefined ? raw.chaos_strategy : raw.chaosStrategy;
    }

    // Timestamps
    if (raw.updatedAt !== undefined || raw.updated_at !== undefined) {
      payload.updatedAt = raw.updatedAt !== undefined ? raw.updatedAt : raw.updated_at;
    }
    if (raw.createdAt !== undefined || raw.created_at !== undefined) {
      payload.createdAt = raw.createdAt !== undefined ? raw.createdAt : raw.created_at;
    }

    return FirestoreMappers.sanitizePayload(payload);
  }

  public static fromTaskAssignment(assignment: Partial<TaskAssignment>): Record<string, any> {
    const defaultAssignment: Partial<TaskAssignment> = {
      status: assignment.status || 'SCHEDULED',
      score: assignment.score !== undefined ? assignment.score : 0,
      assigned_reason: assignment.assigned_reason || (assignment as any).assignedReason || '',
      is_unassigned: assignment.is_unassigned !== undefined ? assignment.is_unassigned : ((assignment as any).isUnassigned !== undefined ? (assignment as any).isUnassigned : false),
      rescheduled_count: assignment.rescheduled_count !== undefined ? assignment.rescheduled_count : ((assignment as any).rescheduledCount || 0),
      is_blitz: assignment.is_blitz !== undefined ? assignment.is_blitz : ((assignment as any).isBlitz !== undefined ? (assignment as any).isBlitz : false),
      updatedAt: assignment.updatedAt || (assignment as any).updated_at || new Date().toISOString(),
      ...assignment
    };

    return FirestoreMappers.toTaskAssignmentPersistencePayload(defaultAssignment);
  }

  // 8. SKILLS, PREFERENCES, PROTECTED TIMES, ETC.
  public static toSkill(docId: string, data: any): MemberSkill {
    return {
      id: docId,
      family_id: data.family_id || undefined,
      member_id: data.member_id || '',
      task_master_id: data.task_master_id || '',
      skill_status: data.skill_status || 'NOT_LEARNED',
      supervision_required: data.supervision_required !== undefined ? data.supervision_required : false,
      learned_at: data.learned_at || undefined
    };
  }

  public static fromSkill(skill: Partial<MemberSkill>): Record<string, any> {
    return {
      id: skill.id,
      family_id: skill.family_id || null,
      member_id: skill.member_id,
      task_master_id: skill.task_master_id,
      skill_status: skill.skill_status || 'NOT_LEARNED',
      supervision_required: skill.supervision_required || false,
      learned_at: skill.learned_at || null
    };
  }

  public static toPreference(docId: string, data: any): MemberPreference {
    return {
      id: docId,
      family_id: data.family_id || undefined,
      member_id: data.member_id || '',
      task_master_id: data.task_master_id || '',
      preference: data.preference || 'NEUTRAL'
    };
  }

  public static fromPreference(pref: Partial<MemberPreference>): Record<string, any> {
    return {
      id: pref.id,
      family_id: pref.family_id || null,
      member_id: pref.member_id,
      task_master_id: pref.task_master_id,
      preference: pref.preference || 'NEUTRAL'
    };
  }

  public static toProtectedTime(docId: string, data: any): ProtectedTime {
    return {
      id: docId,
      family_id: data.family_id || undefined,
      member_id: data.member_id || '',
      type: data.type || 'other',
      label: data.label || '',
      day_of_week: data.day_of_week || [1, 2, 3, 4, 5],
      start_time: data.start_time || '08:00',
      end_time: data.end_time || '18:00',
      active: data.active !== undefined ? data.active : true,
      created_at: data.created_at || data.createdAt || undefined,
      updated_at: data.updated_at || data.updatedAt || undefined
    };
  }

  public static fromProtectedTime(pt: Partial<ProtectedTime>): Record<string, any> {
    const now = new Date().toISOString();
    return {
      id: pt.id,
      family_id: pt.family_id || null,
      member_id: pt.member_id,
      type: pt.type || 'other',
      label: pt.label || '',
      day_of_week: pt.day_of_week || [1, 2, 3, 4, 5],
      start_time: pt.start_time,
      end_time: pt.end_time,
      active: pt.active !== undefined ? pt.active : true,
      created_at: pt.created_at || now,
      updated_at: now
    };
  }

  public static toHouseholdHelp(docId: string, data: any): HouseholdHelp {
    return {
      id: docId,
      family_id: data.family_id || '',
      type: data.type || 'none',
      helper_name: data.helper_name || undefined,
      frequency: data.frequency || 'weekly',
      days: data.days || [],
      tasks_covered: data.tasks_covered || [],
      active: data.active !== undefined ? data.active : false
    };
  }

  public static fromHouseholdHelp(help: Partial<HouseholdHelp>): Record<string, any> {
    return {
      id: help.id,
      family_id: help.family_id,
      type: help.type || 'none',
      helper_name: help.helper_name || null,
      frequency: help.frequency || 'weekly',
      days: help.days || [],
      tasks_covered: help.tasks_covered || [],
      active: help.active !== undefined ? help.active : false
    };
  }

  public static toAuditLog(docId: string, data: any): AuditLog {
    return {
      id: docId,
      family_id: data.family_id || '',
      actor_user_id: data.actor_user_id || undefined,
      action: data.action || 'DISTRIBUTION_RUN',
      entity_type: data.entity_type || 'ASSIGNMENT',
      entity_id: data.entity_id || '',
      details: data.details || {},
      timestamp: data.timestamp || data.created_at || new Date().toISOString()
    };
  }

  public static fromAuditLog(log: Partial<AuditLog>): Record<string, any> {
    const now = new Date().toISOString();
    return {
      family_id: log.family_id,
      actor_user_id: log.actor_user_id || null,
      action: log.action,
      entity_type: log.entity_type,
      entity_id: log.entity_id,
      details: log.details || {},
      timestamp: log.timestamp || now,
      created_at: now
    };
  }

  // 14. CHAOS SESSION (CHAOS-1A)
  public static toChaosSession(docId: string, data: any): ChaosSession {
    return {
      id: docId,
      familyId: data.familyId || data.family_id || '',
      createdByMemberId: data.createdByMemberId || data.created_by_member_id || '',
      status: (data.status as ChaosSessionStatus) || 'DRAFT',
      createdAt: data.createdAt || null,
      startedAt: data.startedAt || null,
      endedAt: data.endedAt || null,
      initialDurationMinutes: typeof data.initialDurationMinutes === 'number' ? data.initialDurationMinutes : 15,
      totalDurationMinutes: typeof data.totalDurationMinutes === 'number' ? data.totalDurationMinutes : (data.initialDurationMinutes || 15),
      expiresAt: data.expiresAt || null,
      participantMemberIds: Array.isArray(data.participantMemberIds) ? data.participantMemberIds : [],
      lateParticipantMemberIds: Array.isArray(data.lateParticipantMemberIds) ? data.lateParticipantMemberIds : [],
      selectedTaskIds: Array.isArray(data.selectedTaskIds) ? data.selectedTaskIds : [],
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      taskStrategies: data.taskStrategies && typeof data.taskStrategies === 'object' ? data.taskStrategies : {},
      extensions: Array.isArray(data.extensions) ? data.extensions : [],
      bonusAwardedMemberIds: Array.isArray(data.bonusAwardedMemberIds) ? data.bonusAwardedMemberIds : [],
      bonusPointsPerMember: typeof data.bonusPointsPerMember === 'number' ? data.bonusPointsPerMember : 5,
      summary: data.summary ? {
        totalTasks: Number(data.summary.totalTasks || 0),
        completedCount: Number(data.summary.completedCount || 0),
        completionRate: Number(data.summary.completionRate || 0),
        participantsCount: Number(data.summary.participantsCount || 0),
        bonusRecipientsCount: Number(data.summary.bonusRecipientsCount || 0)
      } : undefined,
      updatedAt: data.updatedAt || null
    };
  }

  // 14. CHAOS SESSION (CHAOS-1A, HF2-R2)
  public static fromChaosSessionTaskConfig(task: {
    familyTaskId?: string;
    strategy?: string;
    taskMasterId?: string;
    assignmentId?: string;
  }): Record<string, any> {
    const item: Record<string, any> = {
      familyTaskId: task.familyTaskId || '',
      strategy: task.strategy === 'OPEN_POOL' ? 'OPEN_POOL' : 'DISTRIBUTED'
    };
    if (task.taskMasterId !== undefined && task.taskMasterId !== null && task.taskMasterId !== '') {
      item.taskMasterId = task.taskMasterId;
    }
    if (task.assignmentId !== undefined && task.assignmentId !== null && task.assignmentId !== '') {
      item.assignmentId = task.assignmentId;
    }
    return FirestoreMappers.sanitizePayload(item);
  }

  public static toChaosSessionUpdatePayload(updates: Partial<ChaosSession>): Record<string, any> {
    const payload: Record<string, any> = {};

    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.startedAt !== undefined) payload.startedAt = updates.startedAt;
    if (updates.endedAt !== undefined) payload.endedAt = updates.endedAt;
    if (updates.expiresAt !== undefined) payload.expiresAt = updates.expiresAt;
    if (updates.initialDurationMinutes !== undefined) payload.initialDurationMinutes = updates.initialDurationMinutes;
    if (updates.totalDurationMinutes !== undefined) payload.totalDurationMinutes = updates.totalDurationMinutes;
    if (updates.participantMemberIds !== undefined) payload.participantMemberIds = updates.participantMemberIds;
    if (updates.lateParticipantMemberIds !== undefined) payload.lateParticipantMemberIds = updates.lateParticipantMemberIds;
    if (updates.selectedTaskIds !== undefined) payload.selectedTaskIds = updates.selectedTaskIds;
    if (updates.tasks !== undefined) {
      payload.tasks = updates.tasks.map(t => FirestoreMappers.fromChaosSessionTaskConfig(t));
    }
    if (updates.taskStrategies !== undefined) payload.taskStrategies = updates.taskStrategies;
    if (updates.extensions !== undefined) payload.extensions = updates.extensions;
    if (updates.bonusAwardedMemberIds !== undefined) payload.bonusAwardedMemberIds = updates.bonusAwardedMemberIds;
    if (updates.bonusPointsPerMember !== undefined) payload.bonusPointsPerMember = updates.bonusPointsPerMember;
    if (updates.summary !== undefined) payload.summary = updates.summary;
    if (updates.updatedAt !== undefined) payload.updatedAt = updates.updatedAt;

    return FirestoreMappers.sanitizePayload(payload);
  }

  public static fromChaosSession(session: Partial<ChaosSession>): Record<string, any> {
    const tasksClean = (session.tasks || []).map(t => FirestoreMappers.fromChaosSessionTaskConfig(t));

    const rawPayload: Record<string, any> = {
      id: session.id,
      familyId: session.familyId,
      createdByMemberId: session.createdByMemberId,
      status: session.status || 'DRAFT',
      createdAt: session.createdAt,
      startedAt: session.startedAt !== undefined ? session.startedAt : null,
      endedAt: session.endedAt !== undefined ? session.endedAt : null,
      initialDurationMinutes: session.initialDurationMinutes || 15,
      totalDurationMinutes: session.totalDurationMinutes || session.initialDurationMinutes || 15,
      expiresAt: session.expiresAt !== undefined ? session.expiresAt : null,
      participantMemberIds: session.participantMemberIds || [],
      lateParticipantMemberIds: session.lateParticipantMemberIds || [],
      selectedTaskIds: session.selectedTaskIds || (session.tasks ? session.tasks.map(t => t.familyTaskId) : []),
      tasks: tasksClean,
      taskStrategies: session.taskStrategies || {},
      extensions: session.extensions || [],
      bonusAwardedMemberIds: session.bonusAwardedMemberIds || [],
      bonusPointsPerMember: typeof session.bonusPointsPerMember === 'number' ? session.bonusPointsPerMember : 5,
      summary: session.summary || null,
      updatedAt: session.updatedAt !== undefined ? session.updatedAt : null
    };

    return FirestoreMappers.sanitizePayload(rawPayload);
  }

  // 15. CHAOS STATE LOCK (CHAOS-1A)
  public static toChaosState(data: any): ChaosState {
    return {
      activeSessionId: data?.activeSessionId || null,
      updatedAt: data?.updatedAt || null
    };
  }

  public static fromChaosState(state: Partial<ChaosState>): Record<string, any> {
    return {
      activeSessionId: state.activeSessionId !== undefined ? state.activeSessionId : null,
      updatedAt: state.updatedAt
    };
  }
}

