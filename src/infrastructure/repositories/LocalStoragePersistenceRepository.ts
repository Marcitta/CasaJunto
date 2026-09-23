/**
 * CasaJunto - LocalStoragePersistenceRepository
 * Implementação do IPersistenceRepository encapsulando a persistência no localStorage.
 * Permite futura substituição por FirestoreRepository sem tocar na camada de domínio.
 */

import {
  Family,
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
  HouseholdHelp
} from '../../domain/models';
import { IPersistenceRepository } from '../../domain/repositories/IPersistenceRepository';

const STORAGE_PREFIX = 'casajunto_v2_';

export class LocalStoragePersistenceRepository implements IPersistenceRepository {
  private getKey(familyId: string, item: string): string {
    return `${STORAGE_PREFIX}${familyId}_${item}`;
  }

  public async loadFullFamilyState(familyId: string) {
    try {
      const familyRaw = localStorage.getItem(this.getKey(familyId, 'family'));
      const membersRaw = localStorage.getItem(this.getKey(familyId, 'members'));
      const houseRaw = localStorage.getItem(this.getKey(familyId, 'house'));
      const roomsRaw = localStorage.getItem(this.getKey(familyId, 'rooms'));
      const familyTasksRaw = localStorage.getItem(this.getKey(familyId, 'familyTasks'));
      const assignmentsRaw = localStorage.getItem(this.getKey(familyId, 'assignments'));
      const skillsRaw = localStorage.getItem(this.getKey(familyId, 'skills'));
      const preferencesRaw = localStorage.getItem(this.getKey(familyId, 'preferences'));
      const protectedTimesRaw = localStorage.getItem(this.getKey(familyId, 'protectedTimes'));
      const availabilitiesRaw = localStorage.getItem(this.getKey(familyId, 'availabilities'));
      const calendarEventsRaw = localStorage.getItem(this.getKey(familyId, 'calendarEvents'));
      const householdHelpRaw = localStorage.getItem(this.getKey(familyId, 'householdHelp'));

      return {
        family: familyRaw ? (JSON.parse(familyRaw) as Family) : null,
        members: membersRaw ? (JSON.parse(membersRaw) as Member[]) : [],
        house: houseRaw ? (JSON.parse(houseRaw) as House) : null,
        rooms: roomsRaw ? (JSON.parse(roomsRaw) as Room[]) : [],
        familyTasks: familyTasksRaw ? (JSON.parse(familyTasksRaw) as FamilyTask[]) : [],
        assignments: assignmentsRaw ? (JSON.parse(assignmentsRaw) as TaskAssignment[]) : [],
        skills: skillsRaw ? (JSON.parse(skillsRaw) as MemberSkill[]) : [],
        preferences: preferencesRaw ? (JSON.parse(preferencesRaw) as MemberPreference[]) : [],
        protectedTimes: protectedTimesRaw ? (JSON.parse(protectedTimesRaw) as ProtectedTime[]) : [],
        availabilities: availabilitiesRaw ? (JSON.parse(availabilitiesRaw) as MemberAvailability[]) : [],
        calendarEvents: calendarEventsRaw ? (JSON.parse(calendarEventsRaw) as CalendarEvent[]) : [],
        householdHelp: householdHelpRaw ? (JSON.parse(householdHelpRaw) as HouseholdHelp) : null
      };
    } catch (err) {
      console.error('Erro ao carregar estado do LocalStorage:', err);
      return {
        family: null,
        members: [],
        house: null,
        rooms: [],
        familyTasks: [],
        assignments: [],
        skills: [],
        preferences: [],
        protectedTimes: [],
        availabilities: [],
        calendarEvents: [],
        householdHelp: null
      };
    }
  }

  public async saveFullFamilyState(state: {
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
  }) {
    try {
      const fId = state.family.id;
      localStorage.setItem(this.getKey(fId, 'family'), JSON.stringify(state.family));
      localStorage.setItem(this.getKey(fId, 'members'), JSON.stringify(state.members));
      localStorage.setItem(this.getKey(fId, 'house'), JSON.stringify(state.house));
      localStorage.setItem(this.getKey(fId, 'rooms'), JSON.stringify(state.rooms));
      localStorage.setItem(this.getKey(fId, 'familyTasks'), JSON.stringify(state.familyTasks));
      localStorage.setItem(this.getKey(fId, 'assignments'), JSON.stringify(state.assignments));
      localStorage.setItem(this.getKey(fId, 'skills'), JSON.stringify(state.skills));
      localStorage.setItem(this.getKey(fId, 'preferences'), JSON.stringify(state.preferences));
      localStorage.setItem(this.getKey(fId, 'protectedTimes'), JSON.stringify(state.protectedTimes));
      localStorage.setItem(this.getKey(fId, 'availabilities'), JSON.stringify(state.availabilities));
      localStorage.setItem(this.getKey(fId, 'calendarEvents'), JSON.stringify(state.calendarEvents));
      localStorage.setItem(this.getKey(fId, 'householdHelp'), JSON.stringify(state.householdHelp));
    } catch (err) {
      console.error('Erro ao salvar estado no LocalStorage:', err);
    }
  }

  public async clearFamilyData(familyId: string) {
    try {
      const keysToRemove = [
        'family',
        'members',
        'house',
        'rooms',
        'familyTasks',
        'assignments',
        'skills',
        'preferences',
        'protectedTimes',
        'availabilities',
        'calendarEvents',
        'householdHelp'
      ];
      for (const item of keysToRemove) {
        localStorage.removeItem(this.getKey(familyId, item));
      }
    } catch (err) {
      console.error('Erro ao limpar estado do LocalStorage:', err);
    }
  }
}
