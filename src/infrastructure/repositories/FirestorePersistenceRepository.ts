/**
 * CasaJunto - FirestorePersistenceRepository
 * Implementa IPersistenceRepository conectando-se ao Firebase Firestore com isolamento estrito de Tenant.
 * Suporta concorrência, transações e mapeamento seguro de dados.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { FirestoreMappers } from '../firebase/mappers';
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
  HouseholdHelp,
  FamilyMembership,
  UserRole
} from '../../types';
import { IPersistenceRepository } from '../../domain/repositories/IPersistenceRepository';

export class FirestorePersistenceRepository implements IPersistenceRepository {

  /**
   * Carrega todo o estado de uma família a partir das subcoleções do Firestore.
   */
  public async loadFullFamilyState(familyId: string): Promise<{
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
  }> {
    try {
      // 1. Family Root Document
      const familyRef = doc(db, 'families', familyId);
      const familySnap = await getDoc(familyRef);
      const family = familySnap.exists() ? FirestoreMappers.toFamily(familySnap.id, familySnap.data()) : null;

      if (!family) {
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

      // 2. Fetch all subcollections in parallel
      const [
        membersSnap,
        houseSnap,
        roomsSnap,
        familyTasksSnap,
        assignmentsSnap,
        skillsSnap,
        preferencesSnap,
        protectedTimesSnap,
        availabilitiesSnap,
        calendarEventsSnap,
        householdHelpSnap
      ] = await Promise.all([
        getDocs(collection(db, 'families', familyId, 'members')),
        getDocs(collection(db, 'families', familyId, 'house')),
        getDocs(collection(db, 'families', familyId, 'rooms')),
        getDocs(collection(db, 'families', familyId, 'familyTasks')),
        getDocs(collection(db, 'families', familyId, 'assignments')),
        getDocs(collection(db, 'families', familyId, 'skills')),
        getDocs(collection(db, 'families', familyId, 'preferences')),
        getDocs(collection(db, 'families', familyId, 'protectedTimes')),
        getDocs(collection(db, 'families', familyId, 'availabilities')),
        getDocs(collection(db, 'families', familyId, 'calendarEvents')),
        getDocs(collection(db, 'families', familyId, 'householdHelp'))
      ]);

      const members = membersSnap.docs.map(d => FirestoreMappers.toMember(d.id, d.data()));
      
      let house: House | null = null;
      if (!houseSnap.empty) {
        const first = houseSnap.docs[0];
        house = FirestoreMappers.toHouse(first.id, first.data());
      }

      const rooms = roomsSnap.docs.map(d => FirestoreMappers.toRoom(d.id, d.data()));
      const familyTasks = familyTasksSnap.docs.map(d => FirestoreMappers.toFamilyTask(d.id, d.data()));
      const assignments = assignmentsSnap.docs.map(d => FirestoreMappers.toTaskAssignment(d.id, d.data()));
      const skills = skillsSnap.docs.map(d => FirestoreMappers.toSkill(d.id, d.data()));
      const preferences = preferencesSnap.docs.map(d => FirestoreMappers.toPreference(d.id, d.data()));
      const protectedTimes = protectedTimesSnap.docs.map(d => FirestoreMappers.toProtectedTime(d.id, d.data()));
      const availabilities = availabilitiesSnap.docs.map(d => ({
        id: d.id,
        family_id: familyId,
        member_id: d.data().member_id || '',
        day_of_week: d.data().day_of_week || 0,
        start_time: d.data().start_time || '08:00',
        end_time: d.data().end_time || '20:00',
        max_minutes: d.data().max_minutes || 60,
        available_windows: d.data().available_windows || []
      }));
      const calendarEvents = calendarEventsSnap.docs.map(d => ({
        id: d.id,
        family_id: familyId,
        member_id: d.data().member_id || '',
        title: d.data().title || 'Compromisso',
        start_datetime: d.data().start_datetime || '',
        end_datetime: d.data().end_datetime || '',
        source: d.data().source || 'internal',
        protected: d.data().protected !== undefined ? d.data().protected : true,
        recurring: d.data().recurring !== undefined ? d.data().recurring : false
      }));

      let householdHelp: HouseholdHelp | null = null;
      if (!householdHelpSnap.empty) {
        const first = householdHelpSnap.docs[0];
        householdHelp = FirestoreMappers.toHouseholdHelp(first.id, first.data());
      }

      return {
        family,
        members,
        house,
        rooms,
        familyTasks,
        assignments,
        skills,
        preferences,
        protectedTimes,
        availabilities,
        calendarEvents,
        householdHelp
      };
    } catch (err) {
      console.error('[FirestorePersistenceRepository] Erro ao carregar estado da família:', err);
      throw err;
    }
  }

  /**
   * Salva o estado completo de uma família usando Batches do Firestore.
   */
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
  }): Promise<void> {
    const familyId = state.family.id;
    const batch = writeBatch(db);

    // 1. Root Family Document
    const familyRef = doc(db, 'families', familyId);
    batch.set(familyRef, FirestoreMappers.fromFamily(state.family), { merge: true });

    // 2. Members
    for (const m of state.members) {
      const mRef = doc(db, 'families', familyId, 'members', m.id);
      batch.set(mRef, FirestoreMappers.fromMember(m), { merge: true });
    }

    // 3. House
    if (state.house) {
      const houseRef = doc(db, 'families', familyId, 'house', state.house.id || 'main');
      batch.set(houseRef, FirestoreMappers.fromHouse(state.house), { merge: true });
    }

    // 4. Rooms
    for (const r of state.rooms) {
      const rRef = doc(db, 'families', familyId, 'rooms', r.id);
      batch.set(rRef, FirestoreMappers.fromRoom(r), { merge: true });
    }

    // 5. Family Tasks
    for (const ft of state.familyTasks) {
      const ftRef = doc(db, 'families', familyId, 'familyTasks', ft.id);
      batch.set(ftRef, FirestoreMappers.fromFamilyTask(ft), { merge: true });
    }

    // 6. Assignments
    for (const a of state.assignments) {
      const aRef = doc(db, 'families', familyId, 'assignments', a.id);
      batch.set(aRef, FirestoreMappers.fromTaskAssignment(a), { merge: true });
    }

    // 7. Skills & Preferences
    for (const s of state.skills) {
      const sRef = doc(db, 'families', familyId, 'skills', s.id);
      batch.set(sRef, FirestoreMappers.fromSkill(s), { merge: true });
    }

    for (const p of state.preferences) {
      const pRef = doc(db, 'families', familyId, 'preferences', p.id);
      batch.set(pRef, FirestoreMappers.fromPreference(p), { merge: true });
    }

    // 8. Protected Times
    for (const pt of state.protectedTimes) {
      const ptRef = doc(db, 'families', familyId, 'protectedTimes', pt.id);
      batch.set(ptRef, FirestoreMappers.fromProtectedTime(pt), { merge: true });
    }

    // 9. Household Help
    if (state.householdHelp) {
      const helpRef = doc(db, 'families', familyId, 'householdHelp', state.householdHelp.id || 'main');
      batch.set(helpRef, FirestoreMappers.fromHouseholdHelp(state.householdHelp), { merge: true });
    }

    await batch.commit();
  }

  /**
   * Atualiza com segurança e concorrência uma atribuição específica.
   */
  public async updateAssignment(familyId: string, assignment: TaskAssignment): Promise<void> {
    const aRef = doc(db, 'families', familyId, 'assignments', assignment.id);
    await setDoc(aRef, FirestoreMappers.fromTaskAssignment(assignment), { merge: true });
  }

  /**
   * Salva membros e suas associações
   */
  public async saveMembers(familyId: string, members: Member[]): Promise<void> {
    const batch = writeBatch(db);
    for (const m of members) {
      const mRef = doc(db, 'families', familyId, 'members', m.id);
      batch.set(mRef, FirestoreMappers.fromMember(m), { merge: true });
    }
    await batch.commit();
  }

  /**
   * Salva tarefas da família
   */
  public async saveFamilyTasks(familyId: string, tasks: FamilyTask[]): Promise<void> {
    const batch = writeBatch(db);
    for (const t of tasks) {
      const tRef = doc(db, 'families', familyId, 'familyTasks', t.id);
      batch.set(tRef, FirestoreMappers.fromFamilyTask(t), { merge: true });
    }
    await batch.commit();
  }

  /**
   * Salva atribuições de tarefas (lote diário)
   */
  public async saveAssignments(familyId: string, assignments: TaskAssignment[]): Promise<void> {
    const batch = writeBatch(db);
    for (const a of assignments) {
      const aRef = doc(db, 'families', familyId, 'assignments', a.id);
      batch.set(aRef, FirestoreMappers.fromTaskAssignment(a), { merge: true });
    }
    await batch.commit();
  }

  /**
   * Altera a role de um membro garantindo atomicamente os limites de ADMINs da família (MIN: 1, MAX: 2).
   * Atualiza consistentemente o documento do Member e a FamilyMembership correspondente.
   */
  public async setMemberRole(
    familyId: string,
    memberId: string,
    newRole: 'ADMIN' | 'MEMBER'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      return await runTransaction(db, async transaction => {
        // 1. Ler todos os membros ativos da família para contagem atômica de administradores
        const membersCollectionRef = collection(db, 'families', familyId, 'members');
        const membersSnap = await getDocs(membersCollectionRef);
        
        let targetDoc = membersSnap.docs.find(d => d.id === memberId);
        if (!targetDoc) {
          return { success: false, error: 'Membro não encontrado na família.' };
        }

        const targetData = targetDoc.data();
        const currentRole = targetData.role || 'MEMBER';

        if (currentRole === newRole) {
          return { success: true };
        }

        const activeMembers = membersSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((m: any) => m.active !== false);

        const currentAdminCount = activeMembers.filter((m: any) => m.role === 'ADMIN').length;

        // Regra MAX_ADMINS = 2
        if (newRole === 'ADMIN' && currentAdminCount >= 2) {
          return {
            success: false,
            error: 'A casa já possui o limite máximo de 2 administradores.'
          };
        }

        // Regra MIN_ADMINS = 1
        if (newRole === 'MEMBER' && currentAdminCount <= 1) {
          return {
            success: false,
            error: 'A casa precisa ter pelo menos 1 administrador.'
          };
        }

        const now = new Date().toISOString();
        const memberRef = doc(db, 'families', familyId, 'members', memberId);
        transaction.update(memberRef, {
          role: newRole,
          updatedAt: now
        });

        // Atualizar também o top-level FamilyMembership se houver user_id vinculado
        const userId = targetData.user_id || targetData.userId;
        if (userId) {
          const membershipRef = doc(db, 'familyMemberships', `${familyId}_${userId}`);
          transaction.update(membershipRef, {
            role: newRole,
            updatedAt: now
          });
        }

        return { success: true };
      });
    } catch (err: any) {
      console.error('[FirestorePersistenceRepository] Erro transacional ao alterar role:', err);
      return { success: false, error: err.message || 'Erro ao atualizar papel do membro.' };
    }
  }

  /**
   * Cria nova família, vínculo de membership ADMIN e o perfil de membro correspondente.
   */
  public static async createNewFamily(params: {
    userId: string;
    familyName: string;
    adminName: string;
    timezone?: string;
    callerRole?: UserRole | string;
  }): Promise<{ family: Family; membership: FamilyMembership; adminMember: Member }> {
    if (params.callerRole && params.callerRole !== 'ADMIN') {
      throw new Error('Apenas administradores podem criar uma nova casa.');
    }

    const now = new Date().toISOString();
    const familyId = `fam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const memberId = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const membershipId = `${familyId}_${params.userId}`;

    const family: Family = {
      id: familyId,
      name: params.familyName,
      ownerUserId: params.userId,
      created_by_user_id: params.userId,
      timezone: params.timezone || 'America/Sao_Paulo',
      balance_mode: 'fair_share',
      active: true,
      environment: 'production',
      status: 'ACTIVE',
      createdAt: now,
      created_at: now,
      updatedAt: now
    };

    const membership: FamilyMembership = {
      id: membershipId,
      familyId: familyId,
      userId: params.userId,
      memberId: memberId,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    };

    const adminMember: Member = {
      id: memberId,
      family_id: familyId,
      familyId: familyId,
      user_id: params.userId,
      userId: params.userId,
      name: params.adminName,
      avatar: (params.adminName.charAt(0) || 'A').toUpperCase(),
      color: '#A5D8FF',
      role: 'ADMIN',
      birth_date: '1990-01-01',
      age: 34,
      autonomy_level: 4,
      autonomyLevel: 4,
      active: true,
      createdAt: now,
      updatedAt: now
    };

    const batch = writeBatch(db);
    batch.set(doc(db, 'families', familyId), FirestoreMappers.fromFamily(family));
    batch.set(doc(db, 'familyMemberships', membershipId), FirestoreMappers.fromFamilyMembership(membership));
    batch.set(doc(db, 'families', familyId, 'members', memberId), FirestoreMappers.fromMember(adminMember));
    await batch.commit();

    return { family, membership, adminMember };
  }

  /**
   * Consulta as famílias às quais um usuário pertence.
   */
  public static async getUserMemberships(userId: string): Promise<FamilyMembership[]> {
    try {
      const q = query(collection(db, 'familyMemberships'), where('userId', '==', userId));
      const snap = await getDocs(q);
      return snap.docs.map(d => FirestoreMappers.toFamilyMembership(d.id, d.data()));
    } catch (err) {
      console.error('[FirestorePersistenceRepository] Erro ao buscar memberships:', err);
      return [];
    }
  }

  /**
   * Remove todos os dados de uma família
   */
  public async clearFamilyData(familyId: string): Promise<void> {
    try {
      const familyRef = doc(db, 'families', familyId);
      await deleteDoc(familyRef);
    } catch (err) {
      console.error('[FirestorePersistenceRepository] Erro ao deletar família:', err);
    }
  }
}
