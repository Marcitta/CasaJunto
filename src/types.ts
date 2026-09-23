export type UserRole = 'ADMIN' | 'MEMBER' | 'CHILD' | 'GUEST' | string;

export type AppView = 
  | 'today' 
  | 'routine' 
  | 'family' 
  | 'house' 
  | 'catalog' 
  | 'stats' 
  | 'dashboard' 
  | 'blitz';

export type TaskFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'ONCE' | 'ONE_TIME';

export type TaskStatus = 'PENDING' | 'DONE' | 'EXEMPT' | 'MISSED' | 'IN_PROGRESS' | 'CANCELLED';

export type TaskCategory = 
  | 'cleaning' 
  | 'kitchen' 
  | 'organization' 
  | 'laundry' 
  | 'maintenance' 
  | 'pets' 
  | 'outdoor' 
  | 'other';

export type CompletionType = 'NORMAL_COMPLETION' | 'ADMIN_INTERVENTION' | 'SELF_CLAIMED';

export interface Family {
  id: string;
  name: string;
  ownerUserId?: string;
  created_at?: string;
  timezone?: string;
  balance_mode?: string;
  active?: boolean;
  status?: 'ACTIVE' | 'ARCHIVED' | string;
  environment?: string;
  main_problem?: string;
  main_problems?: string[];
  created_by_user_id?: string;
  code?: string;
  adminCount?: number;
  memberCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FamilyMembership {
  id: string;
  familyId: string;
  userId: string;
  memberId?: string;
  familyName?: string;
  role: UserRole;
  status: 'ACTIVE' | 'INVITED' | 'REMOVED';
  createdAt: string;
  updatedAt: string;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface FamilyInvitation {
  id: string;
  code: string;
  familyId: string;
  targetMemberId: string;
  createdByMemberId: string;
  status: InvitationStatus;
  createdAt: any; // Firestore Timestamp (canonical) | string (legacy)
  expiresAt: any; // Firestore Timestamp (canonical) | string (legacy)
  acceptedAt?: any | null; // Firestore Timestamp (canonical) | string (legacy)
  acceptedByUid?: string | null;
  revokedReason?: string | null;
  updatedAt?: any;
  // Non-authoritative presentation/preview snapshot data (read by Join modal without tenant access)
  familyName?: string;
  targetMemberName?: string;
  targetMemberRole?: UserRole;
  roleHint?: UserRole;
  // Compatibility fields
  family_id?: string;
  created_by?: string;
  role?: UserRole;
  expires_at?: any;
  created_at?: any;
}

export interface Member {
  id: string;
  familyId?: string;
  family_id?: string;
  name: string;
  role?: UserRole;
  userId?: string;
  user_id?: string;
  email?: string;
  avatar?: string;
  color?: string;
  points?: number;
  streak?: number;
  tasksCompleted?: number;
  birth_date?: string;
  birthDate?: string;
  age?: number;
  autonomy_level?: number;
  autonomyLevel?: number;
  active?: boolean;
  phone?: string;
  bio?: string;
  max_daily_minutes?: number;
  blocked_task_ids?: string[];
  createdAt?: string;
  updatedAt?: string;
}

// DOMESTIC-SUPPORT-1A: Ajuda Externa / Diarista
export type DomesticSupportType = 'CLEANER';

export interface DomesticSupportSchedule {
  weekday: number; // 0-6 (0 = Domingo, 6 = Sábado)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface DomesticSupport {
  id: string;
  familyId: string;
  name: string;
  type: DomesticSupportType;
  active: boolean;
  schedule: DomesticSupportSchedule[];
  createdAt: string;
  updatedAt: string;
}

export type ExecutionTarget = 
  | 'HOUSEHOLD' 
  | 'EXTERNAL_SUPPORT' 
  | 'FLEXIBLE';

export interface Room {
  id: string;
  name: string;
  type?: string;
  icon?: string;
  color?: string;
  taskCount?: number;
  house_id?: string;
  family_id?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Task {
  id: string;
  familyId: string;
  title: string;
  description?: string;
  roomId: string;
  roomName?: string;
  assigneeId?: string;
  assigneeName?: string;
  assignedMemberId?: string;
  frequency: TaskFrequency;
  effort: number; // esforço ou pontos (ex: 5, 10, 15)
  status: TaskStatus;
  dueDate: string; // YYYY-MM-DD
  scheduledDate?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  taskMasterId?: string;
  familyTaskId?: string;
  durationMinutes?: number;
  assignedReason?: string;
  unassignedReason?: string;
  isUnassigned?: boolean;
  factors?: any;
  completedAt?: string;
  completedBy?: string;
  completedByMemberId?: string;
  completedByName?: string;
  completionType?: CompletionType;
  isRotational?: boolean;
  minAge?: number;
  estimatedMinutes?: number;
  category?: TaskCategory | string;
  chaosSessionId?: string;
  chaos_session_id?: string;
  chaosStrategy?: ChaosTaskStrategy;
  executionTarget?: ExecutionTarget;
  domesticSupportId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatalogTemplate {
  id: string;
  title: string;
  description: string;
  category: TaskCategory | string;
  defaultRoom: string;
  suggestedFrequency: TaskFrequency;
  estimatedMinutes: number;
  effort: number;
  icon?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface User {
  id: string;
  name: string;
  displayName?: string;
  photoURL?: string;
  email?: string;
  avatar?: string;
  role?: UserRole | string;
  family_id?: string;
  birth_date?: string;
  age?: number;
  autonomy_level?: number;
  active?: boolean;
  color?: string;
  phone?: string;
  bio?: string;
  system_role?: 'USER' | 'SUPERADMIN';
  created_at?: string;
  createdAt?: string;
  updatedAt?: string;
  last_login_at?: string;
  is_active?: boolean;
}

export interface TaskMaster {
  id: string;
  name: string;
  description?: string;
  category: string;
  estimated_minutes?: number;
  min_age?: number;
  min_autonomy?: number;
  frequency?: string;
  effort?: number;
  requires_skill?: string;
  tools_required?: string[];
  points?: number;
  room?: string;
  room_type?: string;
  recurrence_type?: string;
  default_room_name?: string;
  frequency_default?: string;
  default_points?: number;
  effort_level?: number;
  duration_minutes?: number;
  minimum_age?: number;
  safety_level?: string;
  difficulty?: number;
  autonomy_required?: number;
  frequency_type?: string;
  requires_supervision?: boolean;
  can_be_done_in_pair?: boolean;
  can_be_delegated?: boolean;
  instructions?: string[];
  materials?: string[];
  active?: boolean;
}

export interface FamilyTask {
  id: string;
  family_id?: string;
  familyId?: string;
  task_id?: string;
  taskId?: string;
  task_master_id?: string;
  taskMasterId?: string;
  name?: string;
  custom_name?: string;
  room?: string;
  room_id?: string;
  roomId?: string;
  category?: string;
  frequency?: string;
  preferred_days?: number[];
  preferredDays?: number[];
  day_of_month?: number;
  dayOfMonth?: number;
  start_date?: string;
  startDate?: string;
  custom_frequency_days?: number[];
  assigned_to?: string;
  preferred_time_of_day?: 'morning' | 'afternoon' | 'evening' | 'any';
  preferred_time?: string;
  preferredTime?: string;
  estimated_minutes?: number;
  min_age?: number;
  min_autonomy?: number;
  difficulty_score?: number;
  requires_help?: boolean;
  rotational?: boolean;
  active: boolean;
  chaosEligible?: boolean;
  executionTarget?: ExecutionTarget;
  domesticSupportId?: string | null;
  customTitle?: string;
  custom_title?: string;
  customDescription?: string;
  custom_description?: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  assigned_automatically?: boolean;
}

export interface BatchAddRoutineInput {
  taskMasterId: string;
  roomId: string;
  frequency: string;
  preferredDays?: number[];
  dayOfMonth?: number;
  preferredTime?: string;
  startDate?: string;
  name?: string;
  category?: string;
  durationMinutes?: number;
  effort?: number;
}

export interface BatchAddResult {
  added: number;
  reactivated: number;
  skipped: number;
  failed: string[];
}

export interface BatchDeactivateResult {
  deactivated: number;
  failed: string[];
}

export interface TaskAssignment {
  id: string;
  family_id?: string;
  family_task_id?: string;
  task_id: string;
  member_id: string;
  room_id?: string;
  scheduled_date: string;
  scheduled_start?: string;
  scheduled_end?: string;
  status: 'ASSIGNED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'RESCHEDULED' | 'MISSED' | 'CANCELLED' | TaskStatus;
  score?: number;
  assigned_reason?: string;
  feedback_difficulty?: 'EASY' | 'NORMAL' | 'TIRED' | 'VERY_TIRED';
  feedback_at?: string;
  factors?: any;
  notes?: string;
  is_blitz?: boolean;
  chaos_session_id?: string;
  chaosSessionId?: string;
  chaos_strategy?: ChaosTaskStrategy;
  chaosStrategy?: ChaosTaskStrategy;
  is_unassigned?: boolean;
  unassigned_reason?: string;
  rescheduled_count?: number;
  completed_at?: string;
  completion_duration?: number;
  completed_by?: string;
  completed_by_name?: string;
  completion_type?: CompletionType;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemberSkill {
  id?: string;
  family_id?: string;
  member_id: string;
  skill_name?: string;
  task_master_id?: string;
  level?: number;
  skill_status?: string;
  supervision_required?: boolean;
  learned_at?: string;
}

export interface AuditLog {
  id: string;
  family_id?: string;
  action: string;
  user_id?: string;
  actor_user_id?: string;
  performed_by_member_id?: string;
  entity_type?: string;
  entity_id?: string;
  target_type?: string;
  target_id?: string;
  details?: any;
  metadata?: any;
  timestamp?: string;
  created_at?: string;
}

export interface MemberPreference {
  id?: string;
  family_id?: string;
  member_id: string;
  task_id?: string;
  task_master_id?: string;
  category?: string;
  preference: 'love' | 'like' | 'neutral' | 'dislike' | 'hate' | 'LIKE' | 'DISLIKE' | string;
  multiplier?: number;
}

export type ProtectedTimeType = 
  | 'school' 
  | 'work' 
  | 'study' 
  | 'sports' 
  | 'sleep' 
  | 'appointment' 
  | 'other';

export interface ProtectedTime {
  id: string;
  family_id?: string;
  member_id: string;
  type: ProtectedTimeType | string;
  label: string;
  day_of_week: number[];
  start_time: string;
  end_time: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MemberProfileUpdateData {
  name: string;
  birth_date?: string;
  autonomy_level?: number;
  max_daily_minutes?: number | null;
  bio?: string | null;
  phone?: string | null;
}

export interface HouseholdHelp {
  id: string;
  family_id: string;
  name?: string;
  helper_name?: string;
  type?: string;
  frequency?: string;
  days?: number[];
  days_of_week?: number[];
  start_time?: string;
  end_time?: string;
  tasks_covered?: string[];
  tasks_responsible?: string[];
  role_description?: string;
  active: boolean;
}

export interface AssignmentFactorInfo {
  name?: string;
  score?: number;
  weight?: number;
  description?: string;
  [key: string]: any;
}

export interface MemberStats {
  member_id: string;
  total_minutes_assigned?: number;
  total_tasks_assigned?: number;
  total_tasks_completed?: number;
  completion_rate?: number;
  effort_share?: number;
  points?: number;
  completed_tasks_count?: number;
  minutes_contributed?: number;
  [key: string]: any;
}

export interface House {
  id: string;
  family_id: string;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  has_pets: boolean;
  pets_summary?: string;
  pets?: Array<{ species: string; name?: string; count?: number }>;
  rooms?: Room[];
}

export interface MemberAvailability {
  member_id: string;
  day_of_week: number;
  available_windows: Array<{ start: string; end: string }>;
}

export interface CalendarEvent {
  id: string;
  family_id: string;
  member_id: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  source: string;
  protected: boolean;
  recurring: boolean;
}

export interface NotificationMessage {
  id: string;
  family_id?: string;
  recipient_user_id?: string;
  user_id?: string;
  task_id?: string;
  type?: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface OnboardingState {
  step: number;
  completed: boolean;
  familyData?: Partial<Family>;
}

export type FrequencyType = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'ONCE' | TaskFrequency;

export type TaskFeedbackDifficulty = 'EASY' | 'NORMAL' | 'TIRED' | 'VERY_TIRED';

// ============================================================================
// CHAOS-1A / CHAOS-1B: MODO CAOS — DOMAIN & PERSISTENCE TYPES
// ============================================================================

export type ChaosSessionStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED';

export type ChaosTaskStrategy = 'DISTRIBUTED' | 'OPEN_POOL';

export interface ChaosSessionTaskConfig {
  familyTaskId: string;
  strategy: ChaosTaskStrategy;
  taskMasterId?: string;
  assignmentId?: string;
}

export interface ChaosTimeExtension {
  extendedMinutes: 15 | 30 | number;
  extendedAt: any; // Firestore Timestamp ou ISO String
  extendedByMemberId: string;
}

export interface ChaosSessionSummary {
  totalTasks: number;
  completedCount: number;
  completionRate: number; // 0.0 -> 1.0 (se totalTasks = 0: 0)
  participantsCount: number;
  bonusRecipientsCount: number;
  durationMinutes?: number;
  tasksCompletedByMemberId?: Record<string, number>;
}

export interface ChaosSession {
  id: string;
  familyId: string;
  createdByMemberId: string;
  status: ChaosSessionStatus;
  createdAt: any; // Firestore Timestamp
  startedAt?: any | null; // Firestore Timestamp
  endedAt?: any | null; // Firestore Timestamp
  initialDurationMinutes: number; // 15 | 30 | 45 | 60
  totalDurationMinutes: number; // inicial = initialDurationMinutes
  expiresAt?: any | null; // Firestore Timestamp (startedAt + initialDurationMinutes)
  participantMemberIds: string[];
  lateParticipantMemberIds: string[];
  selectedTaskIds: string[]; // List of FamilyTask IDs (backward compatible)
  tasks?: ChaosSessionTaskConfig[]; // Per-task strategy configuration (CHAOS-1B)
  taskStrategies?: Record<string, ChaosTaskStrategy>; // Mapping of familyTaskId -> ChaosTaskStrategy (CHAOS-1B)
  extensions: ChaosTimeExtension[];
  bonusAwardedMemberIds: string[];
  bonusPointsPerMember: number; // = 5
  summary?: ChaosSessionSummary;
  updatedAt?: any; // Firestore Timestamp
}

export interface ChaosState {
  activeSessionId: string | null;
  updatedAt: any; // Firestore Timestamp
}

