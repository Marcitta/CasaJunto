import {
  OnboardingState,
  Family,
  User,
  House,
  Room,
  HouseholdHelp,
  MemberSkill,
  MemberPreference,
  MemberAvailability,
  ProtectedTime,
  CalendarEvent,
  FamilyTask,
  TaskAssignment,
  NotificationMessage,
  TaskMaster,
  FrequencyType
} from '../types';
import { allMasterTasks } from '../data/tasks';
import { distributeDailyTasks } from './distributionEngine';
import { getTodayDateString } from '../data/demoData';

export interface GeneratedFamilyData {
  family: Family;
  users: User[];
  house: House;
  rooms: Room[];
  householdHelp: HouseholdHelp;
  skills: MemberSkill[];
  preferences: MemberPreference[];
  availabilities: MemberAvailability[];
  protectedTimes: ProtectedTime[];
  calendarEvents: CalendarEvent[];
  familyTasks: FamilyTask[];
  assignments: TaskAssignment[];
  notifications: NotificationMessage[];
}

export function generateFamilyDataFromOnboarding(onboarding: OnboardingState): GeneratedFamilyData {
  const familyId = `fam-${Date.now()}`;
  const houseId = `house-${Date.now()}`;
  const nowIso = new Date().toISOString();
  const todayStr = getTodayDateString();

  // 1. Create Family
  const family: Family = {
    id: familyId,
    name: onboarding.family_name.trim() || 'Minha Família',
    created_at: nowIso,
    timezone: 'America/Sao_Paulo',
    balance_mode: 'fair_share',
    active: true,
    main_problem: onboarding.main_problems[0] || 'Falta de divisão equilibrada',
    main_problems: onboarding.main_problems
  };

  // 2. Create Users (Admin + Residents)
  const users: User[] = [];

  // Admin user
  const adminId = `usr-admin-${Date.now()}`;
  const adminUser: User = {
    id: adminId,
    family_id: familyId,
    name: onboarding.admin.name.trim() || 'Administrador',
    email: onboarding.admin.email.trim() || 'admin@casajunto.app',
    avatar: onboarding.admin.avatar || '👑',
    color: onboarding.admin.color || '#5b32a3',
    role: 'ADMIN',
    birth_date: '1985-05-15',
    age: 38,
    autonomy_level: 4,
    active: true,
    bio: 'Responsável pela organização geral da rotina da casa'
  };
  users.push(adminUser);

  // Other residents
  onboarding.residents.forEach((r, idx) => {
    let autonomy = 3;
    if (r.age <= 7) autonomy = 1;
    else if (r.age <= 12) autonomy = 2;
    else if (r.age <= 17) autonomy = 3;
    else autonomy = 4;

    const memberId = r.id.startsWith('temp-') ? `usr-res-${Date.now()}-${idx}` : r.id;
    users.push({
      id: memberId,
      family_id: familyId,
      name: r.name.trim() || `Morador ${idx + 1}`,
      email: r.email || `${r.name.toLowerCase().replace(/\s+/g, '')}@casajunto.app`,
      avatar: r.avatar || '👤',
      color: r.color || (idx % 3 === 0 ? '#F2C94C' : idx % 3 === 1 ? '#86c99c' : '#A5D8FF'),
      role: r.role || 'MEMBER',
      birth_date: '2010-01-01',
      age: r.age || 14,
      autonomy_level: autonomy,
      active: true,
      bio: `Membro da família • Perfil ${r.profile}`
    });
  });

  // 3. Create House
  const house: House = {
    id: houseId,
    family_id: familyId,
    property_type: onboarding.house.property_type,
    bedrooms: onboarding.house.bedrooms,
    bathrooms: onboarding.house.bathrooms,
    has_pets: onboarding.house.has_pets,
    pets_summary: onboarding.house.has_pets
      ? onboarding.house.pets.map(p => `${p.count} ${p.species} (${p.name || 'Pet'})`).join(', ')
      : 'Sem pets',
    pets: onboarding.house.pets.map(p => ({
      species: p.species,
      name: p.name,
      count: p.count
    }))
  };

  // 4. Create Rooms
  const rooms: Room[] = onboarding.rooms.map((r, idx) => ({
    id: `room-${Date.now()}-${idx}`,
    house_id: houseId,
    name: r.name,
    type: r.type,
    active: r.active
  }));

  // 5. Create Household Help
  const householdHelp: HouseholdHelp = {
    id: `help-${Date.now()}`,
    family_id: familyId,
    type: onboarding.household_help.type,
    helper_name: onboarding.household_help.helper_name || 'Diarista',
    frequency: onboarding.household_help.frequency,
    days: onboarding.household_help.days,
    tasks_covered: onboarding.household_help.tasks_covered,
    active: onboarding.household_help.has_help
  };

  // 6. Member Skills & Preferences & Availability & Protected Times & Calendar
  const skills: MemberSkill[] = [];
  const preferences: MemberPreference[] = [];
  const availabilities: MemberAvailability[] = [];
  const protectedTimes: ProtectedTime[] = [];
  const calendarEvents: CalendarEvent[] = [];

  // Map resident skills and prefs
  onboarding.residents.forEach((r, idx) => {
    const assignedUserId = users.find(u => u.name === r.name)?.id || users[idx + 1]?.id || adminId;

    // Skills
    Object.entries(r.skills || {}).forEach(([taskId, status]) => {
      skills.push({
        id: `sk-${Date.now()}-${assignedUserId}-${taskId}`,
        member_id: assignedUserId,
        task_master_id: taskId,
        skill_status: status,
        supervision_required: status === 'NOT_LEARNED' || status === 'LEARNING'
      });
    });

    // Preferences
    Object.entries(r.preferences || {}).forEach(([taskId, pref]) => {
      if (pref !== 'NEUTRAL') {
        preferences.push({
          id: `pref-${Date.now()}-${assignedUserId}-${taskId}`,
          member_id: assignedUserId,
          task_master_id: taskId,
          preference: pref
        });
      }
    });

    // Availability
    for (let day = 0; day <= 6; day++) {
      const isWeekend = day === 0 || day === 6;
      availabilities.push({
        id: `avail-${Date.now()}-${assignedUserId}-${day}`,
        member_id: assignedUserId,
        day_of_week: day,
        start_time: '07:00',
        end_time: '21:00',
        max_minutes: isWeekend ? (r.weekend_availability_minutes || 45) : (r.weekday_availability_minutes || 30)
      });
    }

    // Protected Times
    (r.protected_times || []).forEach((pt, ptIdx) => {
      protectedTimes.push({
        id: `pt-${Date.now()}-${assignedUserId}-${ptIdx}`,
        member_id: assignedUserId,
        type: pt.type,
        label: pt.label,
        day_of_week: pt.days,
        start_time: pt.start_time,
        end_time: pt.end_time,
        active: true
      });
    });

    // Calendar Commitments
    (r.calendar_commitments || []).forEach((cc, ccIdx) => {
      calendarEvents.push({
        id: `cal-${Date.now()}-${assignedUserId}-${ccIdx}`,
        member_id: assignedUserId,
        title: cc.title,
        start_datetime: `${todayStr}T${cc.start_time}:00`,
        end_datetime: `${todayStr}T${cc.end_time}:00`,
        source: 'onboarding',
        protected: true,
        recurring: true
      });
    });
  });

  // Also default skills for admin as MENTOR / AUTONOMOUS for all standard tasks
  allMasterTasks.slice(0, 30).forEach(t => {
    if (!skills.some(s => s.member_id === adminId && s.task_master_id === t.id)) {
      skills.push({
        id: `sk-${Date.now()}-${adminId}-${t.id}`,
        member_id: adminId,
        task_master_id: t.id,
        skill_status: 'MENTOR',
        supervision_required: false
      });
    }
  });

  // 7. Select Family Tasks based on Rooms, Pets, and Essential Routine
  const familyTasks: FamilyTask[] = [];
  const addedMasterIds = new Set<string>();

  const activeRoomTypes = new Set(rooms.map(r => r.type));

  // Essential tasks that every household needs
  const coreTaskIds = [
    'clean-01', // Arrumar a própria cama
    'clean-02', // Varrer a sala
    'clean-05', // Recolher lixos
    'kitch-01', // Lavar a louça do almoço
    'kitch-02', // Secar e guardar a louça
    'kitch-04', // Tirar a mesa
    'kitch-05', // Colocar a mesa
    'org-01',   // Guardar calçados
    'org-02',   // Guardar mochilas e casacos
    'waste-01', // Trocar saco de lixo da cozinha
    'waste-02', // Separar lixo reciclável
  ];

  coreTaskIds.forEach((tid, idx) => {
    if (!addedMasterIds.has(tid)) {
      addedMasterIds.add(tid);
      familyTasks.push({
        id: `ft-${Date.now()}-${idx}`,
        family_id: familyId,
        task_master_id: tid,
        frequency: 'daily' as FrequencyType,
        preferred_days: [0, 1, 2, 3, 4, 5, 6],
        preferred_time: idx % 3 === 0 ? '08:30' : idx % 3 === 1 ? '16:00' : '19:30',
        active: true,
        assigned_automatically: true
      });
    }
  });

  // Add room-specific tasks
  if (activeRoomTypes.has('bathroom')) {
    ['bath-01', 'bath-02', 'bath-03'].forEach((tid, idx) => {
      if (!addedMasterIds.has(tid)) {
        addedMasterIds.add(tid);
        familyTasks.push({
          id: `ft-${Date.now()}-bath-${idx}`,
          family_id: familyId,
          task_master_id: tid,
          frequency: 'weekly' as FrequencyType,
          preferred_days: [2, 5, 6],
          preferred_time: '10:00',
          active: true,
          assigned_automatically: true
        });
      }
    });
  }

  if (activeRoomTypes.has('laundry')) {
    ['laun-01', 'laun-02', 'laun-03'].forEach((tid, idx) => {
      if (!addedMasterIds.has(tid)) {
        addedMasterIds.add(tid);
        familyTasks.push({
          id: `ft-${Date.now()}-laun-${idx}`,
          family_id: familyId,
          task_master_id: tid,
          frequency: 'several_times_week' as FrequencyType,
          preferred_days: [1, 3, 5],
          preferred_time: '15:00',
          active: true,
          assigned_automatically: true
        });
      }
    });
  }

  if (onboarding.house.has_pets) {
    ['pet-01', 'pet-02', 'pet-03'].forEach((tid, idx) => {
      if (!addedMasterIds.has(tid)) {
        addedMasterIds.add(tid);
        familyTasks.push({
          id: `ft-${Date.now()}-pet-${idx}`,
          family_id: familyId,
          task_master_id: tid,
          frequency: 'daily' as FrequencyType,
          preferred_days: [0, 1, 2, 3, 4, 5, 6],
          preferred_time: idx === 0 ? '08:00' : '17:30',
          active: true,
          assigned_automatically: true
        });
      }
    });
  }

  if (activeRoomTypes.has('backyard') || activeRoomTypes.has('balcony')) {
    ['out-01', 'out-02'].forEach((tid, idx) => {
      if (!addedMasterIds.has(tid)) {
        addedMasterIds.add(tid);
        familyTasks.push({
          id: `ft-${Date.now()}-out-${idx}`,
          family_id: familyId,
          task_master_id: tid,
          frequency: 'weekly' as FrequencyType,
          preferred_days: [6, 0],
          preferred_time: '09:30',
          active: true,
          assigned_automatically: true
        });
      }
    });
  }

  // 8. Generate First Routine (Assignments for Today)
  const today = new Date();
  const dayOfWeek = today.getDay();

  const assignments = distributeDailyTasks({
    users,
    allTasks: allMasterTasks,
    familyTasks,
    skills,
    preferences,
    protectedTimes,
    existingAssignments: [],
    householdHelp,
    targetDate: todayStr,
    dayOfWeek
  });

  // 9. Initial Notifications
  const notifications: NotificationMessage[] = [
    {
      id: `notif-${Date.now()}-1`,
      user_id: adminId,
      title: `Bem-vindo ao CasaJunto, ${family.name}!`,
      message: `Sua casa foi cadastrada com sucesso e a primeira rotina foi gerada para ${users.length} moradores.`,
      type: 'task_assigned',
      created_at: nowIso,
      read: false
    }
  ];

  return {
    family,
    users,
    house,
    rooms,
    householdHelp,
    skills,
    preferences,
    availabilities,
    protectedTimes,
    calendarEvents,
    familyTasks,
    assignments,
    notifications
  };
}
