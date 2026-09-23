/**
 * CasaJunto - Domain Validation Schemas (Zod)
 * Validação declarativa de entrada de dados para entidades e comandos.
 */

import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  avatar: z.string(),
  system_role: z.enum(['USER', 'SUPERADMIN']),
  created_at: z.string(),
  last_login_at: z.string().optional(),
  is_active: z.boolean()
});

export const FamilySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Nome da família é obrigatório'),
  created_at: z.string(),
  timezone: z.string().default('America/Sao_Paulo'),
  balance_mode: z.enum(['fair_share', 'equilibrado', 'strict_parity']),
  active: z.boolean(),
  environment: z.enum(['demo', 'development', 'staging', 'production']),
  main_problem: z.string().optional(),
  main_problems: z.array(z.string()).optional(),
  created_by_user_id: z.string().optional()
});

export const MemberSchema = z.object({
  id: z.string().min(1),
  family_id: z.string().min(1),
  user_id: z.string().optional(),
  name: z.string().min(1, 'Nome do morador é obrigatório'),
  email: z.string().email().optional(),
  avatar: z.string(),
  color: z.string(),
  role: z.enum(['ADMIN', 'MEMBER']),
  birth_date: z.string(),
  age: z.number().int().min(0).max(120),
  autonomy_level: z.number().int().min(1).max(4),
  active: z.boolean(),
  phone: z.string().optional(),
  bio: z.string().optional(),
  max_daily_minutes: z.number().int().positive().optional(),
  blocked_task_ids: z.array(z.string()).optional()
});

export const TaskAssignmentSchema = z.object({
  id: z.string().min(1),
  family_id: z.string().min(1),
  task_id: z.string().min(1),
  member_id: z.string(),
  scheduled_date: z.string(),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'RESCHEDULED', 'MISSED']),
  score: z.number(),
  assigned_reason: z.string(),
  feedback_difficulty: z.enum(['EASY', 'NORMAL', 'TIRED', 'VERY_TIRED']).optional(),
  is_unassigned: z.boolean().optional(),
  unassigned_reason: z.string().optional(),
  rescheduled_count: z.number().int().min(0).default(0)
});

export const ProtectedTimeSchema = z.object({
  id: z.string().min(1),
  family_id: z.string().min(1),
  member_id: z.string().min(1),
  type: z.enum(['sleep', 'school', 'work', 'study', 'sports', 'appointment', 'other']),
  label: z.string().min(1),
  day_of_week: z.array(z.number().int().min(0).max(6)),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  active: z.boolean()
});

export const CalendarEventSchema = z.object({
  id: z.string().min(1),
  family_id: z.string().min(1),
  member_id: z.string().min(1),
  title: z.string().min(1),
  start_datetime: z.string(),
  end_datetime: z.string(),
  source: z.string(),
  protected: z.boolean(),
  recurring: z.boolean()
});
