/**
 * CasaJunto - Seed Demo Data
 * Fornece a família demo (Família Silva) claramente isolada como ambiente de demonstração (environment: 'demo').
 */

import {
  Family,
  Member,
  House,
  Room,
  FamilyTask,
  MemberSkill,
  MemberPreference,
  ProtectedTime,
  HouseholdHelp,
  TaskAssignment,
  User
} from '../../domain/models';
import { allMasterTasks } from '../../data/tasks';
import { getTodayDateString } from '../../domain/utils/dateTimeUtils';

export function getDemoFamily(): Family {
  return {
    id: 'fam-silva-01',
    name: 'Família Silva',
    created_at: new Date().toISOString(),
    timezone: 'America/Sao_Paulo',
    balance_mode: 'equilibrado',
    active: true,
    status: 'ACTIVE',
    environment: 'demo',
    main_problem: 'Sobrecarga concentrada na mãe e falta de rotina autônoma dos filhos'
  };
}

export function getDemoUsers(): User[] {
  const now = new Date().toISOString();
  return [
    { id: 'usr-auth-marcia', email: 'marcia@casajunto.app', name: 'Márcia', avatar: 'M', system_role: 'USER', created_at: now, is_active: true },
    { id: 'usr-auth-carlos', email: 'carlos@casajunto.app', name: 'Carlos', avatar: 'C', system_role: 'USER', created_at: now, is_active: true },
    { id: 'usr-auth-joao', email: 'joao@casajunto.app', name: 'João', avatar: 'J', system_role: 'USER', created_at: now, is_active: true },
    { id: 'usr-auth-pedro', email: 'pedro@casajunto.app', name: 'Pedro', avatar: 'P', system_role: 'USER', created_at: now, is_active: true }
  ];
}

export function getDemoMembers(): Member[] {
  return [
    {
      id: 'usr-marcia',
      user_id: 'usr-auth-marcia',
      name: 'Márcia',
      email: 'marcia@casajunto.app',
      avatar: 'M',
      role: 'ADMIN',
      family_id: 'fam-silva-01',
      birth_date: '1982-05-14',
      age: 42,
      autonomy_level: 4,
      active: true,
      color: '#A5D8FF',
      phone: '+55 11 98877-6655',
      bio: 'Mãe e gestora do lar. Busca equilíbrio para não precisar cobrar ninguém.'
    },
    {
      id: 'usr-carlos',
      user_id: 'usr-auth-carlos',
      name: 'Carlos',
      email: 'carlos@casajunto.app',
      avatar: 'C',
      role: 'MEMBER',
      family_id: 'fam-silva-01',
      birth_date: '1980-09-22',
      age: 44,
      autonomy_level: 4,
      active: true,
      color: '#86c99c',
      phone: '+55 11 97766-5544',
      bio: 'Pai. Trabalha em home office e cuida da manutenção e lixo da casa.'
    },
    {
      id: 'usr-joao',
      user_id: 'usr-auth-joao',
      name: 'João',
      email: 'joao@casajunto.app',
      avatar: 'J',
      role: 'MEMBER',
      family_id: 'fam-silva-01',
      birth_date: '2010-03-15',
      age: 14,
      autonomy_level: 3,
      active: true,
      color: '#A5D8FF',
      phone: '+55 11 96655-4433',
      bio: 'Filho mais velho (14 anos). Bom com tecnologia e cuidados com o cachorro.'
    },
    {
      id: 'usr-pedro',
      user_id: 'usr-auth-pedro',
      name: 'Pedro',
      email: 'pedro@casajunto.app',
      avatar: 'P',
      role: 'MEMBER',
      family_id: 'fam-silva-01',
      birth_date: '2014-08-10',
      age: 10,
      autonomy_level: 2,
      active: true,
      color: '#F2C94C',
      phone: '+55 11 95544-3322',
      bio: 'Filho mais novo (10 anos). Aprendendo autonomia com tarefas simples e divertidas.'
    }
  ];
}

export function getDemoHouse(): House {
  return {
    id: 'hse-01',
    family_id: 'fam-silva-01',
    property_type: 'apartment',
    bedrooms: 3,
    bathrooms: 2,
    has_pets: true,
    pets_summary: '1 cão (Rex)',
    pets: [
      {
        species: 'Cachorro',
        name: 'Rex',
        count: 1
      }
    ]
  };
}

export function getDemoRooms(): Room[] {
  return [
    { id: 'rm-1', house_id: 'hse-01', family_id: 'fam-silva-01', name: 'Cozinha', type: 'kitchen', active: true },
    { id: 'rm-2', house_id: 'hse-01', family_id: 'fam-silva-01', name: 'Sala de Estar', type: 'living_room', active: true },
    { id: 'rm-3', house_id: 'hse-01', family_id: 'fam-silva-01', name: 'Banheiro Social', type: 'bathroom', active: true },
    { id: 'rm-4', house_id: 'hse-01', family_id: 'fam-silva-01', name: 'Banheiro Suíte', type: 'bathroom', active: true },
    { id: 'rm-5', house_id: 'hse-01', family_id: 'fam-silva-01', name: 'Quarto Casal', type: 'bedroom', active: true },
    { id: 'rm-6', house_id: 'hse-01', family_id: 'fam-silva-01', name: 'Quarto João', type: 'bedroom', active: true },
    { id: 'rm-7', house_id: 'hse-01', family_id: 'fam-silva-01', name: 'Quarto Pedro', type: 'bedroom', active: true },
    { id: 'rm-8', house_id: 'hse-01', family_id: 'fam-silva-01', name: 'Área de Serviço', type: 'service_area', active: true },
    { id: 'rm-9', house_id: 'hse-01', family_id: 'fam-silva-01', name: 'Varanda', type: 'balcony', active: true }
  ];
}

export function getDemoHouseholdHelp(): HouseholdHelp {
  return {
    id: 'hlp-01',
    family_id: 'fam-silva-01',
    type: 'cleaner_weekly',
    helper_name: 'Dona Maria',
    frequency: '1x por semana',
    days: [3], // Quarta-feira
    tasks_covered: [
      'bath-1', // Limpar vaso e box
      'clean-1', // Aspirar casa toda
      'clean-4', // Passar pano nos pisos
      'kit-4'   // Limpar fogão e exaustor
    ],
    active: true
  };
}

export function getDemoFamilyTasks(): FamilyTask[] {
  return [
    { id: 'ft-1', family_id: 'fam-silva-01', task_master_id: 'kit-1', frequency: 'daily', preferred_days: [0, 1, 2, 3, 4, 5, 6], preferred_time: '13:00', active: true, assigned_automatically: true },
    { id: 'ft-2', family_id: 'fam-silva-01', task_master_id: 'kit-2', frequency: 'daily', preferred_days: [0, 1, 2, 3, 4, 5, 6], preferred_time: '20:30', active: true, assigned_automatically: true },
    { id: 'ft-3', family_id: 'fam-silva-01', task_master_id: 'wst-1', frequency: 'daily', preferred_days: [1, 3, 5], preferred_time: '19:00', active: true, assigned_automatically: true },
    { id: 'ft-4', family_id: 'fam-silva-01', task_master_id: 'pet-1', frequency: 'daily', preferred_days: [0, 1, 2, 3, 4, 5, 6], preferred_time: '08:00', active: true, assigned_automatically: true },
    { id: 'ft-5', family_id: 'fam-silva-01', task_master_id: 'pet-2', frequency: 'daily', preferred_days: [0, 1, 2, 3, 4, 5, 6], preferred_time: '17:30', room_id: 'varanda', active: true, assigned_automatically: true },
    { id: 'ft-6', family_id: 'fam-silva-01', task_master_id: 'pet-2', frequency: 'daily', preferred_days: [0, 1, 2, 3, 4, 5, 6], preferred_time: '08:15', room_id: 'kitchen', active: false, assigned_automatically: true },
    { id: 'ft-7', family_id: 'fam-silva-01', task_master_id: 'org-1', frequency: 'daily', preferred_days: [0, 1, 2, 3, 4, 5, 6], preferred_time: '20:00', active: true, assigned_automatically: true },
    { id: 'ft-8', family_id: 'fam-silva-01', task_master_id: 'clean-3', frequency: 'daily', preferred_days: [1, 3, 5], preferred_time: '18:30', active: true, assigned_automatically: true },
    { id: 'ft-9', family_id: 'fam-silva-01', task_master_id: 'lnd-1', frequency: 'daily', preferred_days: [1, 2, 4, 6], preferred_time: '09:00', active: true, assigned_automatically: true }
  ];
}

export function getDemoSkills(): MemberSkill[] {
  return [
    { id: 'sk-1', family_id: 'fam-silva-01', member_id: 'usr-marcia', task_master_id: 'kit-1', skill_status: 'MENTOR', supervision_required: false },
    { id: 'sk-2', family_id: 'fam-silva-01', member_id: 'usr-carlos', task_master_id: 'wst-1', skill_status: 'AUTONOMOUS', supervision_required: false },
    { id: 'sk-3', family_id: 'fam-silva-01', member_id: 'usr-joao', task_master_id: 'pet-1', skill_status: 'AUTONOMOUS', supervision_required: false },
    { id: 'sk-4', family_id: 'fam-silva-01', member_id: 'usr-joao', task_master_id: 'kit-1', skill_status: 'LEARNING', supervision_required: false },
    { id: 'sk-5', family_id: 'fam-silva-01', member_id: 'usr-pedro', task_master_id: 'pet-2', skill_status: 'LEARNING', supervision_required: false },
    { id: 'sk-6', family_id: 'fam-silva-01', member_id: 'usr-pedro', task_master_id: 'org-1', skill_status: 'AUTONOMOUS', supervision_required: false }
  ];
}

export function getDemoPreferences(): MemberPreference[] {
  return [
    { id: 'pref-1', family_id: 'fam-silva-01', member_id: 'usr-joao', task_master_id: 'pet-1', preference: 'LIKE' },
    { id: 'pref-2', family_id: 'fam-silva-01', member_id: 'usr-pedro', task_master_id: 'pet-2', preference: 'LIKE' },
    { id: 'pref-3', family_id: 'fam-silva-01', member_id: 'usr-carlos', task_master_id: 'wst-1', preference: 'LIKE' },
    { id: 'pref-4', family_id: 'fam-silva-01', member_id: 'usr-marcia', task_master_id: 'bath-1', preference: 'DISLIKE' }
  ];
}

export function getDemoProtectedTimes(): ProtectedTime[] {
  return [
    { id: 'pt-1', family_id: 'fam-silva-01', member_id: 'usr-joao', type: 'school', label: 'Escola / Aulas', day_of_week: [1, 2, 3, 4, 5], start_time: '07:00', end_time: '13:30', active: true },
    { id: 'pt-2', family_id: 'fam-silva-01', member_id: 'usr-pedro', type: 'school', label: 'Escola Fundamental', day_of_week: [1, 2, 3, 4, 5], start_time: '13:00', end_time: '18:00', active: true },
    { id: 'pt-3', family_id: 'fam-silva-01', member_id: 'usr-carlos', type: 'work', label: 'Horário de Reuniões Fixas', day_of_week: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '12:00', active: true }
  ];
}

export function getDemoAssignments(): TaskAssignment[] {
  const todayStr = getTodayDateString();
  return [
    {
      id: 'asg-01',
      family_id: 'fam-silva-01',
      task_id: 'pet-1',
      member_id: 'usr-joao',
      scheduled_date: todayStr,
      scheduled_start: '08:00',
      scheduled_end: '08:15',
      status: 'COMPLETED',
      score: 85,
      assigned_reason: 'João gosta de cuidar dos animais e possui tempo livre antes da escola.',
      feedback_difficulty: 'EASY',
      feedback_at: `${todayStr}T08:16:00Z`,
      rescheduled_count: 0
    },
    {
      id: 'asg-02',
      family_id: 'fam-silva-01',
      task_id: 'kit-1',
      member_id: 'usr-carlos',
      scheduled_date: todayStr,
      scheduled_start: '13:00',
      scheduled_end: '13:20',
      status: 'SCHEDULED',
      score: 75,
      assigned_reason: 'Carlos trabalha em home office e sua contribuição equilibra a louça do almoço.',
      rescheduled_count: 0
    },
    {
      id: 'asg-03',
      family_id: 'fam-silva-01',
      task_id: 'pet-2',
      member_id: 'usr-pedro',
      scheduled_date: todayStr,
      scheduled_start: '17:30',
      scheduled_end: '17:45',
      status: 'SCHEDULED',
      score: 80,
      assigned_reason: 'Pedro está aprendendo a repor a ração com supervisão leve.',
      rescheduled_count: 0
    },
    {
      id: 'asg-04',
      family_id: 'fam-silva-01',
      task_id: 'wst-1',
      member_id: 'usr-carlos',
      scheduled_date: todayStr,
      scheduled_start: '19:00',
      scheduled_end: '19:15',
      status: 'SCHEDULED',
      score: 90,
      assigned_reason: 'Carlos prefere tarefas de descarte e manutenção.',
      rescheduled_count: 0
    },
    {
      id: 'asg-05',
      family_id: 'fam-silva-01',
      task_id: 'org-1',
      member_id: 'usr-pedro',
      scheduled_date: todayStr,
      scheduled_start: '20:00',
      scheduled_end: '20:15',
      status: 'SCHEDULED',
      score: 70,
      assigned_reason: 'Pedro organiza os próprios brinquedos antes de dormir.',
      rescheduled_count: 0
    }
  ];
}
