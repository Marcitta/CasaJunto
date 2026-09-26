import {
  Family,
  User,
  House,
  Room,
  FamilyTask,
  MemberSkill,
  MemberPreference,
  ProtectedTime,
  HouseholdHelp,
  TaskAssignment,
  NotificationMessage
} from '../types';
import { allMasterTasks } from './tasks';

export const demoFamily: Family = {
  id: 'fam-silva-01',
  name: 'Família Silva',
  created_at: new Date().toISOString(),
  timezone: 'America/Sao_Paulo',
  balance_mode: 'equilibrado',
  active: true,
  main_problem: 'Sobrecarga concentrada na mãe e falta de rotina autônoma dos filhos'
};

export const demoUsers: User[] = [
  {
    id: 'usr-marcia',
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

export const demoHouse: House = {
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

export const demoRooms: Room[] = [
  { id: 'rm-1', house_id: 'hse-01', name: 'Cozinha', type: 'kitchen', active: true },
  { id: 'rm-2', house_id: 'hse-01', name: 'Sala de Estar', type: 'living_room', active: true },
  { id: 'rm-3', house_id: 'hse-01', name: 'Quarto Casal', type: 'bedroom', active: true },
  { id: 'rm-4', house_id: 'hse-01', name: 'Quarto João', type: 'bedroom', active: true },
  { id: 'rm-5', house_id: 'hse-01', name: 'Quarto Pedro', type: 'bedroom', active: true },
  { id: 'rm-6', house_id: 'hse-01', name: 'Banheiro Social', type: 'bathroom', active: true },
  { id: 'rm-7', house_id: 'hse-01', name: 'Banheiro Suíte', type: 'bathroom', active: true },
  { id: 'rm-8', house_id: 'hse-01', name: 'Lavanderia', type: 'laundry', active: true },
  { id: 'rm-9', house_id: 'hse-01', name: 'Varanda', type: 'balcony', active: true }
];

export const demoHouseholdHelp: HouseholdHelp = {
  id: 'help-01',
  family_id: 'fam-silva-01',
  type: 'diarista',
  helper_name: 'Dona Maria',
  frequency: '1x por semana',
  days: [4], // Quinta-feira
  tasks_covered: [
    'bath-1', // Lavar e desinfetar vaso sanitário
    'bath-2', // Esfregar azulejos e chão do box
    'clean-6', // Passar pano com desinfetante
    'clean-11', // Limpar vidros e janelas
    'clean-12' // Limpar azulejos da cozinha
  ],
  active: true
};

export const demoProtectedTimes: ProtectedTime[] = [
  {
    id: 'pt-1',
    member_id: 'usr-joao',
    type: 'SCHOOL',
    label: 'Escola - Ensino Fundamental',
    day_of_week: [1, 2, 3, 4, 5],
    start_time: '07:30',
    end_time: '12:45',
    active: true
  },
  {
    id: 'pt-2',
    member_id: 'usr-pedro',
    type: 'SCHOOL',
    label: 'Escola - 5º Ano',
    day_of_week: [1, 2, 3, 4, 5],
    start_time: '07:30',
    end_time: '12:30',
    active: true
  },
  {
    id: 'pt-3',
    member_id: 'usr-pedro',
    type: 'SPORT',
    label: 'Judô & Natação',
    day_of_week: [2, 4],
    start_time: '16:00',
    end_time: '17:30',
    active: true
  },
  {
    id: 'pt-4',
    member_id: 'usr-carlos',
    type: 'WORK',
    label: 'Trabalho / Reuniões',
    day_of_week: [1, 2, 3, 4, 5],
    start_time: '09:00',
    end_time: '18:00',
    active: true
  }
];

export const demoMemberSkills: MemberSkill[] = [
  { id: 'sk-1', member_id: 'usr-joao', task_master_id: 'clean-1', skill_status: 'MENTOR', supervision_required: false },
  { id: 'sk-2', member_id: 'usr-joao', task_master_id: 'pet-1', skill_status: 'AUTONOMOUS', supervision_required: false },
  { id: 'sk-3', member_id: 'usr-joao', task_master_id: 'pet-4', skill_status: 'AUTONOMOUS', supervision_required: false },
  { id: 'sk-4', member_id: 'usr-pedro', task_master_id: 'org-1', skill_status: 'AUTONOMOUS', supervision_required: false },
  { id: 'sk-5', member_id: 'usr-pedro', task_master_id: 'laund-5', skill_status: 'LEARNING', supervision_required: false },
  { id: 'sk-6', member_id: 'usr-carlos', task_master_id: 'waste-1', skill_status: 'AUTONOMOUS', supervision_required: false },
  { id: 'sk-7', member_id: 'usr-carlos', task_master_id: 'kitch-2', skill_status: 'AUTONOMOUS', supervision_required: false },
  { id: 'sk-8', member_id: 'usr-marcia', task_master_id: 'kitch-1', skill_status: 'MENTOR', supervision_required: false }
];

export const demoMemberPreferences: MemberPreference[] = [
  { id: 'pf-1', member_id: 'usr-joao', task_master_id: 'clean-1', preference: 'LIKE' },
  { id: 'pf-2', member_id: 'usr-joao', task_master_id: 'pet-4', preference: 'LIKE' },
  { id: 'pf-3', member_id: 'usr-joao', task_master_id: 'bath-1', preference: 'DISLIKE' },
  { id: 'pf-4', member_id: 'usr-pedro', task_master_id: 'laund-5', preference: 'LIKE' },
  { id: 'pf-5', member_id: 'usr-pedro', task_master_id: 'kitch-3', preference: 'DISLIKE' },
  { id: 'pf-6', member_id: 'usr-carlos', task_master_id: 'waste-1', preference: 'LIKE' },
  { id: 'pf-7', member_id: 'usr-carlos', task_master_id: 'laund-6', preference: 'DISLIKE' }
];

// 25 active tasks selected for this family's routine
export const demoFamilyTasks: FamilyTask[] = [
  { id: 'ft-1', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'kitch-1', taskMasterId: 'kitch-1', name: 'Lavar a louça do almoço/jantar', customTitle: 'Lavar a louça do almoço/jantar', frequency: 'daily', preferred_days: [0,1,2,3,4,5,6], preferred_time: '13:00', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-2', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'clean-1', taskMasterId: 'clean-1', name: 'Aspirar o chão da sala', customTitle: 'Aspirar o chão da sala', frequency: 'daily', preferred_days: [0,1,2,3,4,5,6], preferred_time: '16:30', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-3', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'laund-5', taskMasterId: 'laund-5', name: 'Dobrar e separar roupas por pessoa', customTitle: 'Dobrar e separar roupas por pessoa', frequency: 'daily', preferred_days: [0,1,2,3,4,5,6], preferred_time: '18:00', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-4', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'waste-1', taskMasterId: 'waste-1', name: 'Recolher lixo da cozinha e levar para a lixeira principal', customTitle: 'Recolher lixo da cozinha e levar para a lixeira principal', frequency: 'daily', preferred_days: [0,1,2,3,4,5,6], preferred_time: '20:00', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-5', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'pet-2', taskMasterId: 'pet-2', name: 'Trocar e lavar a água do pet', customTitle: 'Trocar e lavar a água do pet', frequency: 'daily', preferred_days: [0,1,2,3,4,5,6], preferred_time: '17:30', room_id: 'varanda', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-6', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'pet-2', taskMasterId: 'pet-2', name: 'Trocar e lavar a água do pet', customTitle: 'Trocar e lavar a água do pet', frequency: 'daily', preferred_days: [0,1,2,3,4,5,6], preferred_time: '08:15', room_id: 'kitchen', active: false, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-7', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'kitch-2', taskMasterId: 'kitch-2', name: 'Secar e guardar a louça', customTitle: 'Secar e guardar a louça', frequency: 'daily', preferred_days: [0,1,2,3,4,5,6], preferred_time: '20:30', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-8', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'org-1', taskMasterId: 'org-1', name: 'Arrumar a própria cama', customTitle: 'Arrumar a própria cama', frequency: 'daily', preferred_days: [0,1,2,3,4,5,6], preferred_time: '07:45', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-9', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'clean-3', taskMasterId: 'clean-3', name: 'Tirar pó das mesas e prateleiras', customTitle: 'Tirar pó das mesas e prateleiras', frequency: 'several_times_week', preferred_days: [1,3,5], preferred_time: '17:00', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-10', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'waste-2', taskMasterId: 'waste-2', name: 'Separar e descartar lixo reciclável (papel, plástico, metal)', customTitle: 'Separar e descartar lixo reciclável (papel, plástico, metal)', frequency: 'several_times_week', preferred_days: [2,4,6], preferred_time: '19:00', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-11', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'out-2', taskMasterId: 'out-2', name: 'Regar plantas e canteiros do jardim/varanda', customTitle: 'Regar plantas e canteiros do jardim/varanda', frequency: 'several_times_week', preferred_days: [1,4,6], preferred_time: '09:00', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-12', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'bath-4', taskMasterId: 'bath-4', name: 'Lavar o chão e rejuntes do box do banheiro', customTitle: 'Lavar o chão e rejuntes do box do banheiro', frequency: 'weekly', preferred_days: [6], preferred_time: '10:00', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-13', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'laund-1', taskMasterId: 'laund-1', name: 'Separar roupas sujas por cor e tecido', customTitle: 'Separar roupas sujas por cor e tecido', frequency: 'several_times_week', preferred_days: [1,3,5], preferred_time: '08:30', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' },
  { id: 'ft-14', family_id: 'fam-silva-01', familyId: 'fam-silva-01', task_master_id: 'pet-1', taskMasterId: 'pet-1', name: 'Alimentar o pet (ração/comida)', customTitle: 'Alimentar o pet (ração/comida)', frequency: 'daily', preferred_days: [0,1,2,3,4,5,6], preferred_time: '08:00', active: true, assigned_automatically: true, executionTarget: 'HOUSEHOLD' }
];

export const getTodayDateString = (): string => {
  const now = new Date();
  return now.toISOString().split('T')[0];
};

export const demoInitialAssignments: TaskAssignment[] = [
  {
    id: 'asg-01',
    family_id: 'fam-silva-01',
    task_id: 'kitch-1',
    member_id: 'usr-marcia',
    scheduled_date: getTodayDateString(),
    scheduled_start: '12:30',
    scheduled_end: '12:50',
    status: 'COMPLETED',
    score: 92,
    assigned_reason: 'Márcia concluiu o almoço e organizou os utensílios.',
    completed_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    completion_duration: 18,
    rescheduled_count: 0
  },
  {
    id: 'asg-02',
    family_id: 'fam-silva-01',
    task_id: 'clean-1',
    member_id: 'usr-joao',
    scheduled_date: getTodayDateString(),
    scheduled_start: '16:30',
    scheduled_end: '16:45',
    status: 'SCHEDULED',
    score: 95,
    assigned_reason: 'É a tarefa favorita de João e ele possui nível Mentor para orientar o irmão.',
    rescheduled_count: 0
  },
  {
    id: 'asg-03',
    family_id: 'fam-silva-01',
    task_id: 'laund-5',
    member_id: 'usr-pedro',
    scheduled_date: getTodayDateString(),
    scheduled_start: '18:00',
    scheduled_end: '18:20',
    status: 'SCHEDULED',
    score: 88,
    assigned_reason: 'Excelente exercício de autonomia para Pedro após o horário de judô.',
    rescheduled_count: 0
  },
  {
    id: 'asg-04',
    family_id: 'fam-silva-01',
    task_id: 'waste-1',
    member_id: 'usr-carlos',
    scheduled_date: getTodayDateString(),
    scheduled_start: '15:00',
    scheduled_end: '15:10',
    status: 'SCHEDULED',
    score: 85,
    assigned_reason: 'Carlos cuida do lixo no intervalo do trabalho remoto.',
    rescheduled_count: 0
  },
  {
    id: 'asg-05',
    family_id: 'fam-silva-01',
    task_id: 'pet-1',
    member_id: 'usr-joao',
    scheduled_date: getTodayDateString(),
    scheduled_start: '19:00',
    scheduled_end: '19:05',
    status: 'SCHEDULED',
    score: 90,
    assigned_reason: 'João é o responsável pelo comedouro do Rex no jantar.',
    rescheduled_count: 0
  },
  {
    id: 'asg-demo-05',
    family_id: 'fam-silva-01',
    family_task_id: 'ft-5',
    task_id: 'pet-2',
    member_id: 'usr-pedro',
    scheduled_date: getTodayDateString(),
    scheduled_start: '17:30',
    scheduled_end: '17:45',
    status: 'SCHEDULED',
    score: 80,
    assigned_reason: 'Pedro cuida da água do pet na varanda no final da tarde.',
    rescheduled_count: 0
  },
  {
    id: 'asg-6',
    family_id: 'fam-silva-01',
    family_task_id: 'ft-6',
    task_id: 'pet-2',
    member_id: 'usr-pedro',
    scheduled_date: getTodayDateString(),
    scheduled_start: '08:15',
    scheduled_end: '08:30',
    status: 'CANCELLED',
    score: 10,
    rescheduled_count: 0
  },
  {
    id: 'ft-5_2026-09-10',
    family_id: 'fam-silva-01',
    family_task_id: 'ft-5',
    task_id: 'pet-2',
    member_id: 'usr-pedro',
    scheduled_date: '2026-09-10',
    scheduled_start: '17:30',
    scheduled_end: '17:45',
    status: 'COMPLETED',
    score: 80,
    completed_at: '2026-09-10T08:20:00.000Z',
    completion_duration: 5,
    rescheduled_count: 0
  }
];

export const demoNotifications: NotificationMessage[] = [
  {
    id: 'notif-1',
    user_id: 'usr-marcia',
    title: 'Equilíbrio da Casa em 87%',
    message: 'A distribuição de tarefas de hoje está excelente e com baixa sobrecarga individual.',
    type: 'balance_alert',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    read: false
  },
  {
    id: 'notif-2',
    user_id: 'usr-joao',
    title: 'Lembrete: Aspirar a sala',
    message: 'Sua tarefa está agendada para as 16:30. Dá para cumprir em apenas 15 minutinhos!',
    type: 'task_reminder',
    created_at: new Date(Date.now() - 1800000).toISOString(),
    read: false,
    task_id: 'clean-1'
  }
];
