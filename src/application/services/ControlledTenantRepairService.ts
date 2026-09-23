import { doc, getDoc, collection, query, limit, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../infrastructure/firebase/firebase';
import { Family, FamilyMembership } from '../../types';

export const TARGET_FAMILY_ID = 'fam-croce-2026';
export const TARGET_TIMEZONE = 'America/Sao_Paulo';
export const TARGET_FAMILY_NAME = 'Casa Croce';

export interface ControlledRepairPersistenceProof {
  familyExists: boolean;
  familyName: string;
  familyTimezone: string;
  membershipExists: boolean;
  membershipStatus: string;
  membershipFamilyId: string;
  membershipMemberId: string;
  membershipUserMatch: boolean;
  memberExists: boolean;
  memberId: string;
  memberRole: string;
  memberUserMatch: boolean;
}

export interface ControlledRepairOperationalProof {
  familyTasksPreserved: boolean;
  assignmentsPreserved: boolean;
  roomsPreserved: boolean;
  chaosDataPreserved: boolean;
  qa1Preserved: boolean;
  qa2Preserved: boolean;
  qa3Preserved: boolean;
  qa4Preserved: boolean;
  totalQaPreserved: number;
}

export interface ControlledRepairResult {
  success: boolean;
  familyId: string;
  atomicCommit: boolean;
  persistenceProof: ControlledRepairPersistenceProof;
  operationalProof: ControlledRepairOperationalProof;
  familyRecord: Family;
  membershipRecord: FamilyMembership;
  error?: string;
}

/**
 * Executa o Controlled Repair canônico para o tenant 'fam-croce-2026'.
 * Cria atomicamente em um único writeBatch:
 * 1. /families/fam-croce-2026
 * 2. /familyMemberships/fam-croce-2026_{AUTH_UID}
 * 3. /families/fam-croce-2026/members/{memberId}
 * 
 * Invariants respeitados:
 * - 1 <= activeAdminCount <= 2
 * - Timezone: America/Sao_Paulo
 * - Não toca em familyTasks, assignments, rooms ou chaosSessions.
 */
export async function executeControlledTenantRepair(
  authUid: string,
  adminName: string = 'Fernanda Croce',
  userEmail: string = ''
): Promise<ControlledRepairResult> {
  if (!authUid || authUid.trim().length === 0) {
    throw new Error('AUTH_UID é obrigatório para o Controlled Repair');
  }

  const now = new Date().toISOString();
  const familyId = TARGET_FAMILY_ID;
  const memberDocId = `mbr-${authUid.slice(0, 8)}-croce`;
  const membershipDocId = `${familyId}_${authUid}`;

  // 1. Definição estrita dos documentos canônicos
  const familyRecord: Family = {
    id: familyId,
    name: TARGET_FAMILY_NAME,
    ownerUserId: authUid,
    timezone: TARGET_TIMEZONE,
    adminCount: 1,
    memberCount: 1,
    createdAt: now,
    updatedAt: now
  };

  const membershipRecord: FamilyMembership = {
    id: membershipDocId,
    familyId: familyId,
    familyName: TARGET_FAMILY_NAME,
    userId: authUid,
    memberId: memberDocId,
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  };

  const memberRecord = {
    id: memberDocId,
    familyId: familyId,
    name: (adminName && adminName.trim().length > 0) ? adminName.trim() : 'Fernanda Croce',
    email: userEmail || '',
    role: 'ADMIN' as const,
    userId: authUid, // NÃO escreve legacy user_id
    active: true,
    joined_at: now,
    createdAt: now,
    updatedAt: now
  };

  // 2. Commit Atômico via writeBatch
  const batch = writeBatch(db);
  batch.set(doc(db, 'families', familyId), familyRecord);
  batch.set(doc(db, 'familyMemberships', membershipDocId), membershipRecord);
  batch.set(doc(db, 'families', familyId, 'members', memberDocId), memberRecord);

  await batch.commit();

  // 3. Prova de Persistência Imediata (getDoc direto com sessão autenticada)
  const [famSnap, memSnap, mbrSnap] = await Promise.all([
    getDoc(doc(db, 'families', familyId)),
    getDoc(doc(db, 'familyMemberships', membershipDocId)),
    getDoc(doc(db, 'families', familyId, 'members', memberDocId))
  ]);

  const famData = famSnap.data() || {};
  const memData = memSnap.data() || {};
  const mbrData = mbrSnap.data() || {};

  const persistenceProof: ControlledRepairPersistenceProof = {
    familyExists: famSnap.exists(),
    familyName: famData.name || '',
    familyTimezone: famData.timezone || '',
    membershipExists: memSnap.exists(),
    membershipStatus: memData.status || '',
    membershipFamilyId: memData.familyId || '',
    membershipMemberId: memData.memberId || '',
    membershipUserMatch: memData.userId === authUid,
    memberExists: mbrSnap.exists(),
    memberId: mbrSnap.id,
    memberRole: mbrData.role || '',
    memberUserMatch: mbrData.userId === authUid
  };

  // 4. Validação dos Dados Operacionais Existentes (READ-ONLY, sem mutação)
  let familyTasksPreserved = false;
  let assignmentsPreserved = false;
  let roomsPreserved = false;
  let chaosDataPreserved = false;
  let qa1Preserved = false;
  let qa2Preserved = false;
  let qa3Preserved = false;
  let qa4Preserved = false;

  try {
    const ftSnap = await getDocs(query(collection(db, 'families', familyId, 'familyTasks'), limit(1)));
    familyTasksPreserved = !ftSnap.empty;
  } catch (e) {
    console.warn('[ControlledRepair] familyTasks read notice:', e);
  }

  try {
    const asgSnap = await getDocs(query(collection(db, 'families', familyId, 'assignments'), limit(25)));
    assignmentsPreserved = !asgSnap.empty;

    asgSnap.forEach((d) => {
      const data = d.data();
      const title = String(data.title || data.custom_title || data.customTitle || '').toLowerCase();
      const taskId = String(data.task_id || '').toLowerCase();
      const docId = String(d.id).toLowerCase();

      if (title.includes('testes caos 1') || taskId.includes('caos 1') || docId.includes('caos 1')) qa1Preserved = true;
      if (title.includes('testes caos 2') || taskId.includes('caos 2') || docId.includes('caos 2')) qa2Preserved = true;
      if (title.includes('testes caos 3') || taskId.includes('caos 3') || docId.includes('caos 3')) qa3Preserved = true;
      if (title.includes('testes caos 4') || taskId.includes('caos 4') || docId.includes('caos 4')) qa4Preserved = true;
    });
  } catch (e) {
    console.warn('[ControlledRepair] assignments read notice:', e);
  }

  try {
    const roomSnap = await getDocs(query(collection(db, 'families', familyId, 'rooms'), limit(1)));
    roomsPreserved = !roomSnap.empty;
  } catch (e) {
    console.warn('[ControlledRepair] rooms read notice:', e);
  }

  try {
    const chaosSnap = await getDocs(query(collection(db, 'families', familyId, 'chaosSessions'), limit(1)));
    chaosDataPreserved = !chaosSnap.empty;
  } catch (e) {
    console.warn('[ControlledRepair] chaosSessions read notice:', e);
  }

  const totalQaPreserved = [qa1Preserved, qa2Preserved, qa3Preserved, qa4Preserved].filter(Boolean).length;

  const operationalProof: ControlledRepairOperationalProof = {
    familyTasksPreserved,
    assignmentsPreserved,
    roomsPreserved,
    chaosDataPreserved,
    qa1Preserved,
    qa2Preserved,
    qa3Preserved,
    qa4Preserved,
    totalQaPreserved
  };

  return {
    success: persistenceProof.familyExists && persistenceProof.membershipExists && persistenceProof.memberExists,
    familyId,
    atomicCommit: true,
    persistenceProof,
    operationalProof,
    familyRecord,
    membershipRecord
  };
}
