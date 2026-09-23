/**
 * CasaJunto - Domain Repository Interfaces
 * Abstração de persistência e acesso a dados isolando o domínio de bancos de dados.
 */

import {
  Family,
  Member,
  House,
  Room,
  TaskMaster,
  FamilyTask,
  TaskAssignment,
  MemberSkill,
  MemberPreference,
  MemberAvailability,
  ProtectedTime,
  CalendarEvent,
  HouseholdHelp,
  AuditLog
} from '../models';

export interface IFamilyRepository {
  getFamilyById(familyId: string): Promise<Family | null>;
  saveFamily(family: Family): Promise<void>;
  getHouse(familyId: string): Promise<House | null>;
  saveHouse(house: House): Promise<void>;
  getRooms(houseId: string): Promise<Room[]>;
  saveRooms(rooms: Room[]): Promise<void>;
}

export interface IMemberRepository {
  getMembersByFamily(familyId: string): Promise<Member[]>;
  getMemberById(familyId: string, memberId: string): Promise<Member | null>;
  saveMember(member: Member): Promise<void>;
  saveMembers(members: Member[]): Promise<void>;
  deleteMember(familyId: string, memberId: string): Promise<void>;
  getSkills(familyId: string): Promise<MemberSkill[]>;
  saveSkills(skills: MemberSkill[]): Promise<void>;
  getPreferences(familyId: string): Promise<MemberPreference[]>;
  savePreferences(preferences: MemberPreference[]): Promise<void>;
  getProtectedTimes(familyId: string): Promise<ProtectedTime[]>;
  saveProtectedTimes(protectedTimes: ProtectedTime[]): Promise<void>;
  getAvailabilities(familyId: string): Promise<MemberAvailability[]>;
  saveAvailabilities(availabilities: MemberAvailability[]): Promise<void>;
}

export interface ITaskRepository {
  getMasterTasks(): Promise<TaskMaster[]>;
  getFamilyTasks(familyId: string): Promise<FamilyTask[]>;
  saveFamilyTasks(familyId: string, tasks: FamilyTask[]): Promise<void>;
  getHouseholdHelp(familyId: string): Promise<HouseholdHelp | null>;
  saveHouseholdHelp(help: HouseholdHelp): Promise<void>;
}

export interface IAssignmentRepository {
  getAssignmentsByDate(familyId: string, date: string): Promise<TaskAssignment[]>;
  getAssignmentsByDateRange(familyId: string, startDate: string, endDate: string): Promise<TaskAssignment[]>;
  saveAssignments(familyId: string, assignments: TaskAssignment[]): Promise<void>;
  updateAssignment(familyId: string, assignment: TaskAssignment): Promise<void>;
}

export interface IAuditLogRepository {
  logEvent(event: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void>;
  getLogsByFamily(familyId: string, limit?: number): Promise<AuditLog[]>;
}

/**
 * Interface unificada para persistência completa do estado familiar.
 */
export interface IPersistenceRepository {
  loadFullFamilyState(familyId: string): Promise<{
    family: Family | null;
    members: Member[];
    house: House | null;
    rooms: Room[];
    familyTasks: FamilyTask[];
    assignments: TaskAssignment[];
    skills: MemberSkill[];
    preferences: MemberPreference[];
    protectedTimes: ProtectedTime[];
    availabilities: MemberAvailability[];
    calendarEvents: CalendarEvent[];
    householdHelp: HouseholdHelp | null;
  }>;

  saveFullFamilyState(state: {
    family: Family;
    members: Member[];
    house: House;
    rooms: Room[];
    familyTasks: FamilyTask[];
    assignments: TaskAssignment[];
    skills: MemberSkill[];
    preferences: MemberPreference[];
    protectedTimes: ProtectedTime[];
    availabilities: MemberAvailability[];
    calendarEvents: CalendarEvent[];
    householdHelp: HouseholdHelp | null;
  }): Promise<void>;

  clearFamilyData(familyId: string): Promise<void>;
}
