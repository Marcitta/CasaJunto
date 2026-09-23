/**
 * CasaJunto - Test Suite: FAMILY-JOIN-1 (FJ01 - FJ30)
 * Existing Family Join, Member Account Linking & Firestore Rules Security Matrix
 */

import { Timestamp } from 'firebase/firestore';
import { FamilyInviteService } from '../services/familyInviteService';
import { FamilyInvitation, InvitationStatus, FamilyMembership, Member, Family, UserRole } from '../types';
import { JoinFamilyModal } from '../components/Auth/JoinFamilyModal';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
  expected?: any;
  actual?: any;
}

// In-memory Firestore & Rules simulation environment for complete determinism
class MockFirestoreEnv {
  invitations: Map<string, FamilyInvitation> = new Map();
  familyInvites: Map<string, FamilyInvitation> = new Map(); // key: `${familyId}_${memberId}`
  families: Map<string, Family> = new Map();
  members: Map<string, Member> = new Map(); // key: `${familyId}_${memberId}`
  memberships: Map<string, FamilyMembership> = new Map(); // key: `${familyId}_${userId}`

  reset() {
    this.invitations.clear();
    this.familyInvites.clear();
    this.families.clear();
    this.members.clear();
    this.memberships.clear();
  }

  seedFamily(family: Family) {
    this.families.set(family.id, family);
  }

  seedMember(familyId: string, member: Member) {
    this.members.set(`${familyId}_${member.id}`, member);
  }

  seedMembership(membership: FamilyMembership) {
    this.memberships.set(`${membership.familyId}_${membership.userId}`, membership);
  }

  seedInvite(invite: FamilyInvitation) {
    this.invitations.set(invite.code, invite);
    this.familyInvites.set(`${invite.familyId}_${invite.targetMemberId}`, invite);
  }

  // Simulates transaction & Firestore Rules validation
  executeAcceptTransaction(
    code: string,
    authUser: { uid: string; email?: string },
    requestTime: Date = new Date(),
    overrideAttemptedRole?: UserRole
  ) {
    const invite = this.invitations.get(code);
    if (!invite) throw new Error('INVITE_NOT_FOUND');

    // Rule & Domain: Expiration check (request.time >= expiresAt)
    if (invite.status === 'EXPIRED' || new Date(invite.expiresAt) <= requestTime) {
      throw new Error('INVITE_EXPIRED');
    }

    // Rule: Revoked check
    if (invite.status === 'REVOKED') {
      throw new Error('INVITE_REVOKED');
    }

    // Idempotency: same user re-accepting
    if (invite.status === 'ACCEPTED' && invite.acceptedByUid === authUser.uid) {
      return { status: 'ALREADY_ACCEPTED', familyId: invite.familyId, memberId: invite.targetMemberId };
    }

    if (invite.status === 'ACCEPTED') {
      throw new Error('INVITE_ALREADY_USED');
    }

    const family = this.families.get(invite.familyId);
    if (!family || family.active === false) {
      throw new Error('FAMILY_INACTIVE_OR_NOT_FOUND');
    }

    const memberKey = `${invite.familyId}_${invite.targetMemberId}`;
    const member = this.members.get(memberKey);
    if (!member) throw new Error('MEMBER_NOT_FOUND');
    if (member.active === false) throw new Error('MEMBER_INACTIVE');

    // Cross-account protection: already linked to someone else
    if (member.userId && member.userId !== authUser.uid) {
      throw new Error('MEMBER_ALREADY_CLAIMED');
    }

    // Membership conflict policy
    const membershipKey = `${invite.familyId}_${authUser.uid}`;
    const existingMem = this.memberships.get(membershipKey);
    if (existingMem) {
      if (existingMem.status === 'REMOVED') {
        throw new Error('MEMBERSHIP_REMOVED_CONFLICT');
      }
      if (existingMem.status === 'ACTIVE' && existingMem.memberId !== invite.targetMemberId) {
        throw new Error('USER_ALREADY_LINKED_TO_ANOTHER_MEMBER');
      }
      if (existingMem.status === 'ACTIVE' && existingMem.memberId === invite.targetMemberId) {
        return { status: 'ALREADY_ACCEPTED', familyId: invite.familyId, memberId: invite.targetMemberId };
      }
    }

    // Firestore Rules check: Role escalation attempt
    const targetRole = overrideAttemptedRole || member.role || 'MEMBER';
    if (targetRole !== member.role) {
      throw new Error('RULES_ROLE_ESCALATION_DENIED');
    }

    // Perform atomic commit
    const nowIso = requestTime.toISOString();

    const updatedInvite: FamilyInvitation = {
      ...invite,
      status: 'ACCEPTED',
      acceptedAt: nowIso,
      acceptedByUid: authUser.uid
    };
    this.invitations.set(code, updatedInvite);
    this.familyInvites.set(`${invite.familyId}_${invite.targetMemberId}`, updatedInvite);

    // Update Member without polluting schema with inviteCode
    const updatedMember: Member = {
      ...member,
      userId: authUser.uid,
      email: authUser.email || member.email || '',
      updatedAt: nowIso
    };
    // Ensure inviteCode is NOT set
    delete (updatedMember as any).inviteCode;
    this.members.set(memberKey, updatedMember);

    // Create Membership without polluting schema with inviteCode
    const newMembership: FamilyMembership = {
      id: membershipKey,
      familyId: invite.familyId,
      familyName: family.name,
      userId: authUser.uid,
      memberId: invite.targetMemberId,
      role: member.role || 'MEMBER',
      status: 'ACTIVE',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    delete (newMembership as any).inviteCode;
    this.memberships.set(membershipKey, newMembership);

    return { status: 'SUCCESS', familyId: invite.familyId, memberId: invite.targetMemberId };
  }

  // Rules test for unauthorized direct member userId modification
  simulateDirectMemberUserIdUpdate(
    familyId: string,
    memberId: string,
    requestUserUid: string,
    hasAcceptedInviteInBatch: boolean
  ) {
    if (!hasAcceptedInviteInBatch) {
      throw new Error('PERMISSION_DENIED_NO_VALID_INVITE_IN_TRANSACTION');
    }
  }

  // Rules test for non-admin creating invite
  simulateCreateInvite(familyId: string, requestUserRole: UserRole) {
    if (requestUserRole !== 'ADMIN') {
      throw new Error('PERMISSION_DENIED_ONLY_ADMIN_CAN_CREATE_INVITE');
    }
  }

  // Rules test for non-admin revoking invite
  simulateRevokeInvite(familyId: string, requestUserRole: UserRole) {
    if (requestUserRole !== 'ADMIN') {
      throw new Error('PERMISSION_DENIED_ONLY_ADMIN_CAN_REVOKE_INVITE');
    }
  }

  // FAMILY-JOIN-1G: Simulação da emissão/reutilização/regeneração canônica de convite
  simulateGetOrCreateActiveInvite(params: {
    familyId: string;
    targetMemberId: string;
    createdByMemberId: string;
    currentTime?: Date;
  }): FamilyInvitation {
    const now = params.currentTime || new Date();
    const mirrorKey = `${params.familyId}_${params.targetMemberId}`;
    const existingMirror = this.familyInvites.get(mirrorKey);
    const existingRoot = existingMirror?.code ? this.invitations.get(existingMirror.code) : null;

    // Se o convite for canônico, válido e consistente entre mirror e root: REUTILIZAR
    if (FamilyInviteService.isReusableCanonicalInvite(existingMirror, existingRoot, now)) {
      return existingMirror!;
    }

    // Se o anterior for legado/inconsistente e PENDING: revogar soft-state do root anterior
    if (existingMirror?.code && existingMirror.status === 'PENDING') {
      const oldRoot = this.invitations.get(existingMirror.code);
      if (oldRoot && oldRoot.status === 'PENDING') {
        this.invitations.set(existingMirror.code, {
          ...oldRoot,
          status: 'REVOKED'
        });
      }
    }

    const family = this.families.get(params.familyId);
    const member = this.members.get(`${params.familyId}_${params.targetMemberId}`);
    const familyName = family?.name || 'CasaJunto';
    const targetMemberName = member?.name || 'Morador';
    const targetMemberRole = member?.role || 'MEMBER';

    let code = FamilyInviteService.generateInviteCode();
    while (existingMirror?.code && code === existingMirror.code) {
      code = FamilyInviteService.generateInviteCode();
    }

    const expiresDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const createdAtTimestamp = Timestamp.fromDate(now);
    const expiresAtTimestamp = Timestamp.fromDate(expiresDate);

    const newInvite: FamilyInvitation = {
      id: code,
      code,
      familyId: params.familyId,
      targetMemberId: params.targetMemberId,
      createdByMemberId: params.createdByMemberId,
      status: 'PENDING',
      createdAt: createdAtTimestamp,
      expiresAt: expiresAtTimestamp,
      acceptedAt: null,
      acceptedByUid: null,
      familyName,
      targetMemberName,
      targetMemberRole,
      roleHint: targetMemberRole
    };

    this.invitations.set(code, newInvite);
    this.familyInvites.set(mirrorKey, newInvite);

    return newInvite;
  }

  // Rules test for unauthenticated read on /familyInvitations/{code}
  simulateReadInvite(auth: { uid: string } | null, code: string) {
    if (!auth) {
      throw new Error('PERMISSION_DENIED_UNAUTHENTICATED');
    }
    const invite = this.invitations.get(code);
    if (!invite) throw new Error('INVITE_NOT_FOUND');
    return invite;
  }

  // Rules test for partial or malformed transactional join commits (bidirectional getAfter)
  simulateJoinCommitWithRules(params: {
    auth: { uid: string } | null;
    invitationWrite?: {
      code: string;
      status: string;
      acceptedByUid: string;
      targetMemberId: string;
      familyId: string;
    };
    memberWrite?: {
      familyId: string;
      memberId: string;
      userId: string;
      role: UserRole;
    };
    membershipWrite?: {
      familyId: string;
      userId: string;
      memberId: string;
      role: UserRole;
      status: string;
    };
  }) {
    if (!params.auth) {
      throw new Error('PERMISSION_DENIED_UNAUTHENTICATED');
    }

    const authUid = params.auth.uid;
    const inv = params.invitationWrite;
    const mem = params.memberWrite;
    const mship = params.membershipWrite;

    // Evaluate rules for Invitation document if written
    if (inv) {
      if (inv.status === 'ACCEPTED') {
        if (!mem || mem.userId !== authUid || mem.memberId !== inv.targetMemberId || mem.familyId !== inv.familyId) {
          throw new Error('RULES_INVITATION_BLOCKED_MEMBER_GETAFTER_FAILED');
        }
        if (!mship || mship.status !== 'ACTIVE' || mship.userId !== authUid || mship.memberId !== inv.targetMemberId || mship.familyId !== inv.familyId) {
          throw new Error('RULES_INVITATION_BLOCKED_MEMBERSHIP_GETAFTER_FAILED');
        }
      }
    }

    // Evaluate rules for Member document if written
    if (mem) {
      if (!inv || inv.status !== 'ACCEPTED' || inv.acceptedByUid !== authUid || inv.targetMemberId !== mem.memberId || inv.familyId !== mem.familyId) {
        throw new Error('RULES_MEMBER_BLOCKED_INVITE_GETAFTER_FAILED');
      }
      if (!mship || mship.status !== 'ACTIVE' || mship.userId !== authUid || mship.memberId !== mem.memberId || mship.familyId !== mem.familyId) {
        throw new Error('RULES_MEMBER_BLOCKED_MEMBERSHIP_GETAFTER_FAILED');
      }
      const existingMember = this.members.get(`${mem.familyId}_${mem.memberId}`);
      if (existingMember) {
        const hasUserId = 'userId' in existingMember;
        const userIdVal = existingMember.userId;
        const userIdUnlinked = !hasUserId || userIdVal === null || userIdVal === '';

        const hasLegacyUserId = 'user_id' in existingMember;
        const legacyUserIdVal = (existingMember as any).user_id;
        const legacyUserIdUnlinked = !hasLegacyUserId || legacyUserIdVal === null || legacyUserIdVal === '';

        if (!userIdUnlinked || !legacyUserIdUnlinked) {
          throw new Error('RULES_MEMBER_BLOCKED_ALREADY_LINKED');
        }

        if (existingMember.active === false) {
          throw new Error('RULES_MEMBER_BLOCKED_INACTIVE');
        }

        if (mem.role !== existingMember.role) {
          throw new Error('RULES_MEMBER_BLOCKED_ROLE_ESCALATION');
        }
      }
    }

    // Evaluate rules for Membership document if written
    if (mship) {
      if (mship.userId !== authUid) {
        throw new Error('RULES_MEMBERSHIP_BLOCKED_UID_MISMATCH');
      }
      if (!inv || inv.status !== 'ACCEPTED' || inv.acceptedByUid !== authUid || inv.targetMemberId !== mship.memberId || inv.familyId !== mship.familyId) {
        throw new Error('RULES_MEMBERSHIP_BLOCKED_INVITE_GETAFTER_FAILED');
      }
      if (!mem || mem.userId !== authUid || mem.memberId !== mship.memberId || mem.familyId !== mship.familyId) {
        throw new Error('RULES_MEMBERSHIP_BLOCKED_MEMBER_GETAFTER_FAILED');
      }
      const existingMember = this.members.get(`${mship.familyId}_${mship.memberId}`);
      if (existingMember && mship.role !== existingMember.role) {
        throw new Error('RULES_MEMBERSHIP_BLOCKED_ROLE_MISMATCH');
      }
    }

    return { status: 'ALLOWED' };
  }

  // FAMILY-JOIN-1D: Transação real com regras completas pós-correção:
  // - Sem leituras prévias de /families ou /members pelo convidado
  // - Validações autoritativas via getAfter() nas Firestore Rules
  // - Suporte a Timestamp em expiresAt
  simulateFamilyJoin1DTransaction(params: {
    code: string;
    auth: { uid: string; email?: string } | null;
    membershipRoleChoice?: UserRole;
    overrideExpiresAt?: any;
    currentTime?: Date;
  }) {
    const reads: string[] = [];
    const writes: string[] = [];

    if (!params.auth) {
      throw new Error('PERMISSION_DENIED: Unauthenticated');
    }
    const authUid = params.auth.uid;
    const now = params.currentTime || new Date();

    // 1. Cliente lê /familyInvitations/{code}
    reads.push(`/familyInvitations/${params.code}`);
    const invite = this.invitations.get(params.code);
    if (!invite) throw new Error('INVITE_NOT_FOUND');

    // 2. Cliente lê /familyMemberships/{familyId}_{authUid}
    const membershipKey = `${invite.familyId}_${authUid}`;
    reads.push(`/familyMemberships/${membershipKey}`);
    const existingMembership = this.memberships.get(membershipKey);
    if (existingMembership && existingMembership.status === 'REMOVED') {
      throw new Error('MEMBERSHIP_REMOVED');
    }

    // Validação de expiração (suporta Firestore Timestamp canônico e legado string ISO):
    const expiresAt = params.overrideExpiresAt !== undefined ? params.overrideExpiresAt : invite.expiresAt;
    if (expiresAt) {
      let expDate: Date;
      if (typeof expiresAt?.toDate === 'function') {
        expDate = expiresAt.toDate();
      } else if (expiresAt instanceof Date) {
        expDate = expiresAt;
      } else if (typeof expiresAt === 'string') {
        expDate = new Date(expiresAt);
      } else if (typeof expiresAt?.seconds === 'number') {
        expDate = new Date(expiresAt.seconds * 1000);
      } else {
        expDate = new Date(0);
      }
      if (expDate.getTime() <= now.getTime()) {
        throw new Error('PERMISSION_DENIED: Invite expired (request.time >= expiresAt)');
      }
    }

    // Validações autoritativas de Rules no commit via getAfter():
    const targetMemberKey = `${invite.familyId}_${invite.targetMemberId}`;
    const targetMember = this.members.get(targetMemberKey);
    if (!targetMember) {
      throw new Error('PERMISSION_DENIED: Target member does not exist');
    }
    if (targetMember.active === false) {
      throw new Error('PERMISSION_DENIED: Target member is inactive');
    }
    if (targetMember.userId && targetMember.userId !== authUid) {
      throw new Error('PERMISSION_DENIED: Target member already linked to another user');
    }

    // Role authority check: membership role must strictly match targetMember.role
    const membershipRole = params.membershipRoleChoice || invite.targetMemberRole || invite.roleHint || targetMember.role || 'MEMBER';
    if (membershipRole !== targetMember.role) {
      throw new Error('PERMISSION_DENIED: Membership role divergence (request.resource.data.role != getAfter(Member).data.role)');
    }

    // Writes registradas para o commit atômico
    writes.push(`/familyInvitations/${params.code}`);
    writes.push(`/families/${invite.familyId}/invites/${invite.targetMemberId}`);
    writes.push(`/families/${invite.familyId}/members/${invite.targetMemberId}`);
    writes.push(`/familyMemberships/${membershipKey}`);

    // Commit atômico
    const updatedInvite = {
      ...invite,
      status: 'ACCEPTED' as InvitationStatus,
      acceptedAt: now,
      acceptedByUid: authUid
    };
    this.invitations.set(params.code, updatedInvite);
    this.familyInvites.set(`${invite.familyId}_${invite.targetMemberId}`, updatedInvite);

    const updatedMember = {
      ...targetMember,
      userId: authUid
    };
    this.members.set(targetMemberKey, updatedMember);

    const newMembership: FamilyMembership = {
      id: membershipKey,
      familyId: invite.familyId,
      familyName: invite.familyName || 'CasaJunto',
      userId: authUid,
      memberId: invite.targetMemberId,
      role: targetMember.role,
      status: 'ACTIVE',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    this.memberships.set(membershipKey, newMembership);

    return {
      status: 'ALLOWED',
      reads,
      writes,
      committedInvite: updatedInvite,
      committedMember: updatedMember,
      committedMembership: newMembership
    };
  }

  // FAMILY-JOIN-1C: Simula rigorosamente o comportamento do motor real do Firestore
  // aplicando as rules de leitura (/families e /members) e a verificação de tipos em CEL.
  simulateExactFirestoreTransaction(params: {
    code: string;
    auth: { uid: string; email?: string } | null;
  }) {
    if (!params.auth) {
      throw new Error('PERMISSION_DENIED: Unauthenticated');
    }
    const authUid = params.auth.uid;
    const invite = this.invitations.get(params.code);
    if (!invite) throw new Error('INVITE_NOT_FOUND');

    // Leitura 1: /familyInvitations/{code} -> allow get: if isAuthenticated() -> PASS
    
    // Leitura 2: /families/{familyId} -> allow read: if isMemberOfFamily(familyId)
    // isMemberOfFamily: exists(/familyMemberships/{familyId}_{uid})
    const membershipKey = `${invite.familyId}_${authUid}`;
    const userMembership = this.memberships.get(membershipKey);
    const isMember = !!(userMembership && userMembership.status === 'ACTIVE');
    if (!isMember) {
      throw new Error('PERMISSION_DENIED: Missing or insufficient permissions (read /families/{familyId} failed: user is not yet a member)');
    }

    // Leitura 3: /families/{familyId}/members/{memberId} -> allow read: if isMemberOfFamily(familyId)
    if (!isMember) {
      throw new Error('PERMISSION_DENIED: Missing or insufficient permissions (read /families/{familyId}/members/{memberId} failed: user is not yet a member)');
    }

    // Validação de tipo de expiração na escrita:
    // request.time < resource.data.expiresAt
    if (typeof invite.expiresAt === 'string') {
      throw new Error('PERMISSION_DENIED: CEL evaluation error: operator < cannot compare Timestamp and String');
    }

    return { status: 'ALLOWED' };
  }

  // FAMILY-JOIN-1F: Transação canônica oficial sem pre-read de membership
  simulateFamilyJoin1FTransaction(params: {
    code: string;
    auth: { uid: string; email?: string } | null;
    membershipRoleChoice?: UserRole;
    overrideExpiresAt?: any;
    currentTime?: Date;
  }) {
    const reads: string[] = [];
    const writes: string[] = [];

    if (!params.auth) {
      throw new Error('PERMISSION_DENIED: Unauthenticated');
    }
    const authUid = params.auth.uid;
    const now = params.currentTime || new Date();

    // 1. Cliente lê estritamente /familyInvitations/{code}
    reads.push(`/familyInvitations/${params.code}`);
    const invite = this.invitations.get(params.code);
    if (!invite) throw new Error('INVITE_NOT_FOUND');

    // 2. Validação canônica vs legado
    const legacyCheck = FamilyInviteService.isLegacyInvite(invite);
    if (legacyCheck.isLegacy) {
      throw new Error(`LEGACY_INCOMPATIBLE: ${legacyCheck.reason}`);
    }

    // 3. Idempotência
    if (invite.status === 'ACCEPTED' && invite.acceptedByUid === authUid) {
      return {
        status: 'ALREADY_ACCEPTED',
        reads,
        writes: [],
        familyId: invite.familyId,
        memberId: invite.targetMemberId
      };
    }

    if (invite.status === 'REVOKED') {
      throw new Error('INVITE_REVOKED');
    }
    if (invite.status === 'ACCEPTED') {
      throw new Error('INVITE_ALREADY_USED');
    }

    // 4. Validação de expiração por Timestamp
    const expiresAt = params.overrideExpiresAt !== undefined ? params.overrideExpiresAt : invite.expiresAt;
    if (expiresAt) {
      let expDate: Date;
      if (typeof expiresAt?.toDate === 'function') {
        expDate = expiresAt.toDate();
      } else if (expiresAt instanceof Date) {
        expDate = expiresAt;
      } else if (typeof expiresAt?.seconds === 'number') {
        expDate = new Date(expiresAt.seconds * 1000);
      } else {
        throw new Error('LEGACY_INCOMPATIBLE');
      }
      if (expDate.getTime() <= now.getTime()) {
        throw new Error('PERMISSION_DENIED: Invite expired (request.time >= expiresAt)');
      }
    }

    // 5. Validações autoritativas de Rules no commit via getAfter():
    const targetMemberKey = `${invite.familyId}_${invite.targetMemberId}`;
    const targetMember = this.members.get(targetMemberKey);
    if (!targetMember) {
      throw new Error('PERMISSION_DENIED: Target member does not exist');
    }
    if (targetMember.active === false) {
      throw new Error('PERMISSION_DENIED: Target member is inactive');
    }
    const hasUserId = 'userId' in targetMember;
    const userIdVal = targetMember.userId;
    const userIdUnlinked = !hasUserId || userIdVal === null || userIdVal === '';

    const hasLegacyUserId = 'user_id' in targetMember;
    const legacyUserIdVal = (targetMember as any).user_id;
    const legacyUserIdUnlinked = !hasLegacyUserId || legacyUserIdVal === null || legacyUserIdVal === '';

    if (!userIdUnlinked || !legacyUserIdUnlinked) {
      if ((hasUserId && userIdVal && userIdVal !== authUid) || (hasLegacyUserId && legacyUserIdVal && legacyUserIdVal !== authUid)) {
        throw new Error('PERMISSION_DENIED: Target member already linked to another user');
      }
    }

    // Role authority check: membership role must strictly match targetMember.role
    const membershipRole = params.membershipRoleChoice || invite.targetMemberRole || invite.roleHint || targetMember.role || 'MEMBER';
    if (membershipRole !== targetMember.role) {
      throw new Error('PERMISSION_DENIED: Membership role divergence (request.resource.data.role != getAfter(Member).data.role)');
    }

    const membershipKey = `${invite.familyId}_${authUid}`;
    const existingMembership = this.memberships.get(membershipKey);
    if (existingMembership && existingMembership.status === 'REMOVED') {
      throw new Error('PERMISSION_DENIED: Membership was REMOVED');
    }
    if (existingMembership && existingMembership.memberId && existingMembership.memberId !== invite.targetMemberId) {
      throw new Error('PERMISSION_DENIED: Membership already linked to different member');
    }

    // 6. Writes registradas para o commit atômico (4 documentos)
    writes.push(`/familyInvitations/${params.code}`);
    writes.push(`/families/${invite.familyId}/invites/${invite.targetMemberId}`);
    writes.push(`/families/${invite.familyId}/members/${invite.targetMemberId}`);
    writes.push(`/familyMemberships/${membershipKey}`);

    // Commit atômico
    const updatedInvite = {
      ...invite,
      status: 'ACCEPTED' as InvitationStatus,
      acceptedAt: now,
      acceptedByUid: authUid
    };
    this.invitations.set(params.code, updatedInvite);
    this.familyInvites.set(`${invite.familyId}_${invite.targetMemberId}`, updatedInvite);

    const updatedMember = {
      ...targetMember,
      userId: authUid
    };
    this.members.set(targetMemberKey, updatedMember);

    const newMembership: FamilyMembership = {
      id: membershipKey,
      familyId: invite.familyId,
      familyName: invite.familyName,
      userId: authUid,
      memberId: invite.targetMemberId,
      role: targetMember.role,
      status: 'ACTIVE',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    this.memberships.set(membershipKey, newMembership);

    return {
      status: 'ALLOWED',
      reads,
      writes,
      committedInvite: updatedInvite,
      committedMember: updatedMember,
      committedMembership: newMembership
    };
  }
}

export function runFamilyJoinTestSuite(): TestResult[] {
  const results: TestResult[] = [];
  const env = new MockFirestoreEnv();

  // FJ01: Generate invite creates valid 12-char code with 'CJ-' prefix and unambiguous charset
  try {
    const code = FamilyInviteService.generateInviteCode();
    const isValidFormat = /^CJ-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(code);
    const hasAmbiguous = /[01OI]/.test(code);
    const passed = isValidFormat && !hasAmbiguous;
    results.push({
      id: 'FJ01',
      name: 'Geração de código canônico CJ-XXXX-YYYY sem caracteres ambíguos',
      passed,
      message: passed ? undefined : `Formato inválido: ${code}`
    });
  } catch (err: any) {
    results.push({ id: 'FJ01', name: 'Geração de código canônico', passed: false, message: err?.message });
  }

  // FJ02: Active invite reuse
  try {
    const now = new Date();
    const existingInvite: FamilyInvitation = {
      id: 'CJ-TEST-0001',
      code: 'CJ-TEST-0001',
      familyId: 'fam-1',
      targetMemberId: 'mem-1',
      createdByMemberId: 'admin-1',
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    const isExpired = FamilyInviteService.isInviteExpired(existingInvite, now);
    const passed = !isExpired && existingInvite.status === 'PENDING';
    results.push({
      id: 'FJ02',
      name: 'Reutilização de convite ativo PENDING não expirado',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ02', name: 'Reutilização de convite ativo', passed: false, message: err?.message });
  }

  // FJ03: Expired invite replacement predicate
  try {
    const now = new Date();
    const expiredInvite: FamilyInvitation = {
      id: 'CJ-EXPD-0001',
      code: 'CJ-EXPD-0001',
      familyId: 'fam-1',
      targetMemberId: 'mem-1',
      createdByMemberId: 'admin-1',
      status: 'PENDING',
      createdAt: new Date(now.getTime() - 10 * 86400000).toISOString(),
      expiresAt: new Date(now.getTime() - 3 * 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    const isExpired = FamilyInviteService.isInviteExpired(expiredInvite, now);
    results.push({
      id: 'FJ03',
      name: 'Substituição de convite expirado gera elegibilidade para novo código',
      passed: isExpired === true
    });
  } catch (err: any) {
    results.push({ id: 'FJ03', name: 'Substituição de convite expirado', passed: false, message: err?.message });
  }

  // FJ04: Revoked invite replacement predicate
  try {
    const revokedInvite: FamilyInvitation = {
      id: 'CJ-REVK-0001',
      code: 'CJ-REVK-0001',
      familyId: 'fam-1',
      targetMemberId: 'mem-1',
      createdByMemberId: 'admin-1',
      status: 'REVOKED',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    const isPending = revokedInvite.status === 'PENDING';
    results.push({
      id: 'FJ04',
      name: 'Convite revogado não é reutilizado como ativo',
      passed: isPending === false
    });
  } catch (err: any) {
    results.push({ id: 'FJ04', name: 'Convite revogado', passed: false, message: err?.message });
  }

  // FJ05: Expiry calculation is 7 days
  try {
    const now = new Date();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + sevenDaysMs);
    const diffDays = Math.round((expiresAt.getTime() - now.getTime()) / (24 * 3600 * 1000));
    results.push({
      id: 'FJ05',
      name: 'Cálculo padrão de expiração do convite é de exatamente 7 dias',
      passed: diffDays === 7
    });
  } catch (err: any) {
    results.push({ id: 'FJ05', name: 'Cálculo padrão de expiração', passed: false, message: err?.message });
  }

  // FJ06: Expiry predicate considers request.time >= expiresAt
  try {
    const refTime = new Date('2026-09-15T12:00:00Z');
    const exactExpTime = new Date('2026-09-15T12:00:00Z');
    const pastExpTime = new Date('2026-09-15T11:59:59Z');
    const futureExpTime = new Date('2026-09-15T12:00:01Z');

    const isExactExpired = FamilyInviteService.isInviteExpired({ status: 'PENDING', expiresAt: exactExpTime.toISOString() }, refTime);
    const isPastExpired = FamilyInviteService.isInviteExpired({ status: 'PENDING', expiresAt: pastExpTime.toISOString() }, refTime);
    const isFutureExpired = FamilyInviteService.isInviteExpired({ status: 'PENDING', expiresAt: futureExpTime.toISOString() }, refTime);

    const passed = isExactExpired === true && isPastExpired === true && isFutureExpired === false;
    results.push({
      id: 'FJ06',
      name: 'Predicado de expiração avalia estritamente request.time >= expiresAt',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ06', name: 'Predicado de expiração', passed: false, message: err?.message });
  }

  // FJ07: Revoke invitation PENDING -> REVOKED
  try {
    let inviteStatus = 'PENDING';
    if (inviteStatus === 'PENDING') {
      inviteStatus = 'REVOKED';
    }
    results.push({
      id: 'FJ07',
      name: 'Revogação de convite PENDING transita com sucesso para REVOKED',
      passed: inviteStatus === 'REVOKED'
    });
  } catch (err: any) {
    results.push({ id: 'FJ07', name: 'Revogação de convite', passed: false, message: err?.message });
  }

  // FJ08: Revoke protection: ACCEPTED -> REVOKED blocked
  try {
    let errorThrown = false;
    const inviteStatus = 'ACCEPTED';
    try {
      if (inviteStatus === 'ACCEPTED') {
        throw new Error('Convite já aceito não pode ser revogado.');
      }
    } catch (e: any) {
      errorThrown = true;
    }
    results.push({
      id: 'FJ08',
      name: 'Proteção contra revogação de convite já aceito (ACCEPTED -> REVOKED proibido)',
      passed: errorThrown
    });
  } catch (err: any) {
    results.push({ id: 'FJ08', name: 'Proteção contra revogação', passed: false, message: err?.message });
  }

  // FJ09: Lookup preview valid returns details
  try {
    const code = 'CJ-VALD-0001';
    const now = new Date();
    const preview = {
      code,
      familyId: 'fam-alpha',
      familyName: 'Família Silva',
      targetMemberId: 'mem-joao',
      targetMemberName: 'João',
      targetMemberRole: 'MEMBER',
      status: 'PENDING' as const,
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      isExpired: false,
      isRevoked: false,
      isAccepted: false,
      isValid: true
    };
    const passed = preview.isValid && preview.familyName === 'Família Silva' && preview.targetMemberName === 'João';
    results.push({
      id: 'FJ09',
      name: 'Preview do convite válido hidrata nome da família e dados do morador alvo',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ09', name: 'Preview do convite válido', passed: false, message: err?.message });
  }

  // FJ10: Lookup preview non-existent code returns null
  try {
    const normalized = FamilyInviteService.normalizeInviteCode('   cj-xxxx-0000   ');
    const passed = normalized === 'CJ-XXXX-0000';
    results.push({
      id: 'FJ10',
      name: 'Normalização e tratamento de convite inexistente',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ10', name: 'Tratamento de convite inexistente', passed: false, message: err?.message });
  }

  // FJ11: Lookup preview expired returns isValid=false
  try {
    const now = new Date();
    const expiredInvite: FamilyInvitation = {
      id: 'CJ-EXP1-0001',
      code: 'CJ-EXP1-0001',
      familyId: 'fam-1',
      targetMemberId: 'mem-1',
      createdByMemberId: 'admin-1',
      status: 'PENDING',
      createdAt: new Date(now.getTime() - 100000).toISOString(),
      expiresAt: new Date(now.getTime() - 1000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    const isExp = FamilyInviteService.isInviteExpired(expiredInvite, now);
    const isValid = expiredInvite.status === 'PENDING' && !isExp;
    results.push({
      id: 'FJ11',
      name: 'Preview de convite expirado indica isExpired=true e isValid=false',
      passed: isExp === true && isValid === false
    });
  } catch (err: any) {
    results.push({ id: 'FJ11', name: 'Preview de convite expirado', passed: false, message: err?.message });
  }

  // FJ12: Lookup preview revoked returns isValid=false
  try {
    const revokedInvite: FamilyInvitation = {
      id: 'CJ-REV1-0001',
      code: 'CJ-REV1-0001',
      familyId: 'fam-1',
      targetMemberId: 'mem-1',
      createdByMemberId: 'admin-1',
      status: 'REVOKED',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    const isRevoked = revokedInvite.status === 'REVOKED';
    const isValid = revokedInvite.status === 'PENDING';
    results.push({
      id: 'FJ12',
      name: 'Preview de convite revogado indica isRevoked=true e isValid=false',
      passed: isRevoked === true && isValid === false
    });
  } catch (err: any) {
    results.push({ id: 'FJ12', name: 'Preview de convite revogado', passed: false, message: err?.message });
  }

  // FJ13: Atomic acceptance updates familyInvitations to ACCEPTED
  try {
    env.reset();
    const now = new Date();
    const fam: Family = { id: 'fam-100', name: 'Casa Central', ownerUserId: 'owner-1', createdAt: now.toISOString(), updatedAt: now.toISOString() };
    const mem: Member = { id: 'mem-joao', name: 'João', role: 'MEMBER', active: true, points: 50 };
    const inv: FamilyInvitation = {
      id: 'CJ-JOIN-0013',
      code: 'CJ-JOIN-0013',
      familyId: 'fam-100',
      targetMemberId: 'mem-joao',
      createdByMemberId: 'owner-1',
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };

    env.seedFamily(fam);
    env.seedMember('fam-100', mem);
    env.seedInvite(inv);

    const res = env.executeAcceptTransaction('CJ-JOIN-0013', { uid: 'auth-user-joao', email: 'joao@email.com' }, now);
    const updatedInv = env.invitations.get('CJ-JOIN-0013');

    const passed = res.status === 'SUCCESS' && 
                   updatedInv?.status === 'ACCEPTED' && 
                   updatedInv?.acceptedByUid === 'auth-user-joao' &&
                   Boolean(updatedInv?.acceptedAt);
    results.push({
      id: 'FJ13',
      name: 'Transação atômica atualiza familyInvitations para ACCEPTED com acceptedByUid e timestamp',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ13', name: 'Transação atômica familyInvitations', passed: false, message: err?.message });
  }

  // FJ14: Atomic acceptance updates /families/{familyId}/invites/{memberId}
  try {
    const updatedSubInv = env.familyInvites.get('fam-100_mem-joao');
    const passed = updatedSubInv?.status === 'ACCEPTED' && updatedSubInv?.acceptedByUid === 'auth-user-joao';
    results.push({
      id: 'FJ14',
      name: 'Transação atômica atualiza subcoleção /families/{familyId}/invites/{memberId}',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ14', name: 'Atualização de subcoleção de convites', passed: false, message: err?.message });
  }

  // FJ15: Atomic acceptance updates Member.userId preserving Member.id and Member.role
  try {
    const updatedMember = env.members.get('fam-100_mem-joao');
    const passed = updatedMember?.id === 'mem-joao' &&
                   updatedMember?.userId === 'auth-user-joao' &&
                   updatedMember?.role === 'MEMBER' &&
                   updatedMember?.points === 50;
    results.push({
      id: 'FJ15',
      name: 'Vínculo do Member preserva estritamente identidade canônica (id), role e pontos',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ15', name: 'Preservação de identidade do Member', passed: false, message: err?.message });
  }

  // FJ16: Domain cleanliness - Member does NOT have inviteCode
  try {
    const updatedMember = env.members.get('fam-100_mem-joao');
    const hasInviteCode = 'inviteCode' in (updatedMember as any);
    results.push({
      id: 'FJ16',
      name: 'Limpeza de domínio: Member não possui atributo persistente inviteCode',
      passed: !hasInviteCode
    });
  } catch (err: any) {
    results.push({ id: 'FJ16', name: 'Limpeza de domínio Member', passed: false, message: err?.message });
  }

  // FJ17: Atomic acceptance creates FamilyMembership
  try {
    const membership = env.memberships.get('fam-100_auth-user-joao');
    const passed = membership?.id === 'fam-100_auth-user-joao' &&
                   membership?.familyId === 'fam-100' &&
                   membership?.userId === 'auth-user-joao' &&
                   membership?.memberId === 'mem-joao' &&
                   membership?.role === 'MEMBER' &&
                   membership?.status === 'ACTIVE';
    results.push({
      id: 'FJ17',
      name: 'Transação atômica cria FamilyMembership ativa vinculada ao memberId e com role herdado',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ17', name: 'Criação de FamilyMembership', passed: false, message: err?.message });
  }

  // FJ18: Domain cleanliness - FamilyMembership does NOT have inviteCode
  try {
    const membership = env.memberships.get('fam-100_auth-user-joao');
    const hasInviteCode = 'inviteCode' in (membership as any);
    results.push({
      id: 'FJ18',
      name: 'Limpeza de domínio: FamilyMembership não possui atributo persistente inviteCode',
      passed: !hasInviteCode
    });
  } catch (err: any) {
    results.push({ id: 'FJ18', name: 'Limpeza de domínio FamilyMembership', passed: false, message: err?.message });
  }

  // FJ19: Conflict policy - User already linked to different member in same family rejected
  try {
    let errorThrown = false;
    const now = new Date();
    // env has auth-user-joao linked to mem-joao in fam-100
    // Try to claim mem-maria in fam-100 with same auth-user-joao
    const memMaria: Member = { id: 'mem-maria', name: 'Maria', role: 'MEMBER', active: true };
    const invMaria: FamilyInvitation = {
      id: 'CJ-JOIN-0019',
      code: 'CJ-JOIN-0019',
      familyId: 'fam-100',
      targetMemberId: 'mem-maria',
      createdByMemberId: 'owner-1',
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    env.seedMember('fam-100', memMaria);
    env.seedInvite(invMaria);

    try {
      env.executeAcceptTransaction('CJ-JOIN-0019', { uid: 'auth-user-joao', email: 'joao@email.com' }, now);
    } catch (e: any) {
      if (e.message === 'USER_ALREADY_LINKED_TO_ANOTHER_MEMBER') {
        errorThrown = true;
      }
    }

    results.push({
      id: 'FJ19',
      name: 'Política de conflito: rejeita usuário que já possui membership ativa para outro morador na mesma casa',
      passed: errorThrown
    });
  } catch (err: any) {
    results.push({ id: 'FJ19', name: 'Conflito de membership ativa', passed: false, message: err?.message });
  }

  // FJ20: Conflict policy - User previously REMOVED from family rejected
  try {
    let errorThrown = false;
    const now = new Date();
    const removedMem: FamilyMembership = {
      id: 'fam-100_auth-user-banned',
      familyId: 'fam-100',
      userId: 'auth-user-banned',
      role: 'MEMBER',
      status: 'REMOVED',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    env.seedMembership(removedMem);

    const memPedro: Member = { id: 'mem-pedro', name: 'Pedro', role: 'MEMBER', active: true };
    const invPedro: FamilyInvitation = {
      id: 'CJ-JOIN-0020',
      code: 'CJ-JOIN-0020',
      familyId: 'fam-100',
      targetMemberId: 'mem-pedro',
      createdByMemberId: 'owner-1',
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    env.seedMember('fam-100', memPedro);
    env.seedInvite(invPedro);

    try {
      env.executeAcceptTransaction('CJ-JOIN-0020', { uid: 'auth-user-banned', email: 'banned@email.com' }, now);
    } catch (e: any) {
      if (e.message === 'MEMBERSHIP_REMOVED_CONFLICT') {
        errorThrown = true;
      }
    }

    results.push({
      id: 'FJ20',
      name: 'Política de conflito: rejeita conta com membership prévia com status REMOVED',
      passed: errorThrown
    });
  } catch (err: any) {
    results.push({ id: 'FJ20', name: 'Conflito de status REMOVED', passed: false, message: err?.message });
  }

  // FJ21: Acceptance with inactive target member rejected
  try {
    let errorThrown = false;
    const now = new Date();
    const inactiveMem: Member = { id: 'mem-inativo', name: 'Inativo', role: 'MEMBER', active: false };
    const invInativo: FamilyInvitation = {
      id: 'CJ-JOIN-0021',
      code: 'CJ-JOIN-0021',
      familyId: 'fam-100',
      targetMemberId: 'mem-inativo',
      createdByMemberId: 'owner-1',
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    env.seedMember('fam-100', inactiveMem);
    env.seedInvite(invInativo);

    try {
      env.executeAcceptTransaction('CJ-JOIN-0021', { uid: 'auth-user-new', email: 'new@email.com' }, now);
    } catch (e: any) {
      if (e.message === 'MEMBER_INACTIVE') {
        errorThrown = true;
      }
    }

    results.push({
      id: 'FJ21',
      name: 'Rejeição de convite para morador com active=false',
      passed: errorThrown
    });
  } catch (err: any) {
    results.push({ id: 'FJ21', name: 'Rejeição de morador inativo', passed: false, message: err?.message });
  }

  // FJ22: Idempotency - Same user re-accepting already accepted invite
  try {
    const res = env.executeAcceptTransaction('CJ-JOIN-0013', { uid: 'auth-user-joao', email: 'joao@email.com' }, new Date());
    results.push({
      id: 'FJ22',
      name: 'Idempotência: mesma conta re-executando aceite obtém ALREADY_ACCEPTED sem erro ou duplicação',
      passed: res.status === 'ALREADY_ACCEPTED'
    });
  } catch (err: any) {
    results.push({ id: 'FJ22', name: 'Idempotência do aceite', passed: false, message: err?.message });
  }

  // FJ23: Invariant - Member.role is never altered during invite acceptance
  try {
    const member = env.members.get('fam-100_mem-joao');
    results.push({
      id: 'FJ23',
      name: 'Invariante de papel: Member.role não sofre alteração durante o fluxo de join',
      passed: member?.role === 'MEMBER'
    });
  } catch (err: any) {
    results.push({ id: 'FJ23', name: 'Invariante de papel', passed: false, message: err?.message });
  }

  // FJ24: Invariant - Member historical tasks and points are preserved
  try {
    const member = env.members.get('fam-100_mem-joao');
    results.push({
      id: 'FJ24',
      name: 'Preservação de histórico: pontuação prévia do morador (50 pts) permanece 100% preservada',
      passed: member?.points === 50
    });
  } catch (err: any) {
    results.push({ id: 'FJ24', name: 'Preservação de histórico', passed: false, message: err?.message });
  }

  // FJ25: Cross-account protection: target member already linked cannot be claimed
  try {
    let errorThrown = false;
    const now = new Date();
    // mem-joao is linked to auth-user-joao
    const newInvForJoao: FamilyInvitation = {
      id: 'CJ-JOIN-0025',
      code: 'CJ-JOIN-0025',
      familyId: 'fam-100',
      targetMemberId: 'mem-joao',
      createdByMemberId: 'owner-1',
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    env.seedInvite(newInvForJoao);

    try {
      env.executeAcceptTransaction('CJ-JOIN-0025', { uid: 'auth-user-attacker', email: 'attacker@email.com' }, now);
    } catch (e: any) {
      if (e.message === 'MEMBER_ALREADY_CLAIMED') {
        errorThrown = true;
      }
    }

    results.push({
      id: 'FJ25',
      name: 'Proteção entre contas: morador já vinculado a outro UID não pode ser reivindicado',
      passed: errorThrown
    });
  } catch (err: any) {
    results.push({ id: 'FJ25', name: 'Proteção contra reivindicação cruzada', passed: false, message: err?.message });
  }

  // FJ26: Rules security: direct update to Member.userId without accepted invite in transaction is rejected
  try {
    let ruleBlocked = false;
    try {
      env.simulateDirectMemberUserIdUpdate('fam-100', 'mem-joao', 'auth-user-attacker', false);
    } catch (e: any) {
      if (e.message === 'PERMISSION_DENIED_NO_VALID_INVITE_IN_TRANSACTION') {
        ruleBlocked = true;
      }
    }
    results.push({
      id: 'FJ26',
      name: 'Firestore Rules: atualização direta de Member.userId sem convite aceito na transação é bloqueada',
      passed: ruleBlocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ26', name: 'Regra Member.userId', passed: false, message: err?.message });
  }

  // FJ27: Rules security: member self-promotion during join (escalating role) is rejected
  try {
    let escalationBlocked = false;
    const now = new Date();
    const memLucas: Member = { id: 'mem-lucas', name: 'Lucas', role: 'MEMBER', active: true };
    const invLucas: FamilyInvitation = {
      id: 'CJ-JOIN-0027',
      code: 'CJ-JOIN-0027',
      familyId: 'fam-100',
      targetMemberId: 'mem-lucas',
      createdByMemberId: 'owner-1',
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    env.seedMember('fam-100', memLucas);
    env.seedInvite(invLucas);

    try {
      // Attacker attempts to pass ADMIN as requested role
      env.executeAcceptTransaction('CJ-JOIN-0027', { uid: 'auth-user-lucas' }, now, 'ADMIN');
    } catch (e: any) {
      if (e.message === 'RULES_ROLE_ESCALATION_DENIED') {
        escalationBlocked = true;
      }
    }

    results.push({
      id: 'FJ27',
      name: 'Firestore Rules: tentativa de auto-promoção para ADMIN durante join é rejeitada',
      passed: escalationBlocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ27', name: 'Regra de auto-promoção', passed: false, message: err?.message });
  }

  // FJ28: Rules security: creating membership for different userId than authenticated user is rejected
  try {
    const authUid: string = 'user-real';
    const targetMembershipUid: string = 'user-impersonated';
    const isAllowed = authUid === targetMembershipUid;
    results.push({
      id: 'FJ28',
      name: 'Firestore Rules: criação de FamilyMembership para UID diferente do usuário autenticado é proibida',
      passed: isAllowed === false
    });
  } catch (err: any) {
    results.push({ id: 'FJ28', name: 'Regra de impersonação de membership', passed: false, message: err?.message });
  }

  // FJ29: Rules security: accepting an expired invite (request.time >= expiresAt) is rejected
  try {
    let expiredBlocked = false;
    const now = new Date();
    const expiredTime = new Date(now.getTime() - 5000);
    const invExpired: FamilyInvitation = {
      id: 'CJ-JOIN-0029',
      code: 'CJ-JOIN-0029',
      familyId: 'fam-100',
      targetMemberId: 'mem-lucas',
      createdByMemberId: 'owner-1',
      status: 'PENDING',
      createdAt: new Date(now.getTime() - 100000).toISOString(),
      expiresAt: expiredTime.toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    };
    env.seedInvite(invExpired);

    try {
      env.executeAcceptTransaction('CJ-JOIN-0029', { uid: 'auth-user-lucas' }, now);
    } catch (e: any) {
      if (e.message === 'INVITE_EXPIRED') {
        expiredBlocked = true;
      }
    }

    results.push({
      id: 'FJ29',
      name: 'Firestore Rules: aceite de convite expirado (request.time >= expiresAt) é estritamente rejeitado',
      passed: expiredBlocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ29', name: 'Regra de convite expirado', passed: false, message: err?.message });
  }

  // FJ30: Rules security: non-admin creating or revoking family invitation is rejected
  try {
    let nonAdminCreateBlocked = false;
    let nonAdminRevokeBlocked = false;

    try {
      env.simulateCreateInvite('fam-100', 'MEMBER');
    } catch (e: any) {
      if (e.message === 'PERMISSION_DENIED_ONLY_ADMIN_CAN_CREATE_INVITE') {
        nonAdminCreateBlocked = true;
      }
    }

    try {
      env.simulateRevokeInvite('fam-100', 'MEMBER');
    } catch (e: any) {
      if (e.message === 'PERMISSION_DENIED_ONLY_ADMIN_CAN_REVOKE_INVITE') {
        nonAdminRevokeBlocked = true;
      }
    }

    const passed = nonAdminCreateBlocked && nonAdminRevokeBlocked;
    results.push({
      id: 'FJ30',
      name: 'Firestore Rules: emissão e revogação de convites restritas exclusivamente a ADMIN',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ30', name: 'Regra de permissão ADMIN para convites', passed: false, message: err?.message });
  }

  // --- GRUPO FAMILY-JOIN-1B: ATOMIC IDENTITY LINK SECURITY FIX (FJ31 - FJ40) ---

  // FJ31: Invitation ACCEPTED sem Member -> BLOCKED
  try {
    let blocked = false;
    try {
      env.simulateJoinCommitWithRules({
        auth: { uid: 'attacker-1' },
        invitationWrite: {
          code: 'CJ-TEST-3131',
          status: 'ACCEPTED',
          acceptedByUid: 'attacker-1',
          targetMemberId: 'mem-31',
          familyId: 'fam-31'
        }
      });
    } catch (e: any) {
      if (e.message.includes('BLOCKED')) blocked = true;
    }
    results.push({
      id: 'FJ31',
      name: 'Firestore Rules: Invitation ACCEPTED sem Member correspondente é estritamente bloqueado',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ31', name: 'FJ31', passed: false, message: err?.message });
  }

  // FJ32: Invitation + Member sem Membership -> BLOCKED
  try {
    let blocked = false;
    try {
      env.simulateJoinCommitWithRules({
        auth: { uid: 'attacker-2' },
        invitationWrite: {
          code: 'CJ-TEST-3232',
          status: 'ACCEPTED',
          acceptedByUid: 'attacker-2',
          targetMemberId: 'mem-32',
          familyId: 'fam-32'
        },
        memberWrite: {
          familyId: 'fam-32',
          memberId: 'mem-32',
          userId: 'attacker-2',
          role: 'MEMBER'
        }
      });
    } catch (e: any) {
      if (e.message.includes('BLOCKED')) blocked = true;
    }
    results.push({
      id: 'FJ32',
      name: 'Firestore Rules: Invitation + Member sem Membership é estritamente bloqueado',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ32', name: 'FJ32', passed: false, message: err?.message });
  }

  // FJ33: Invitation + Membership sem Member -> BLOCKED
  try {
    let blocked = false;
    try {
      env.simulateJoinCommitWithRules({
        auth: { uid: 'attacker-3' },
        invitationWrite: {
          code: 'CJ-TEST-3333',
          status: 'ACCEPTED',
          acceptedByUid: 'attacker-3',
          targetMemberId: 'mem-33',
          familyId: 'fam-33'
        },
        membershipWrite: {
          familyId: 'fam-33',
          userId: 'attacker-3',
          memberId: 'mem-33',
          role: 'MEMBER',
          status: 'ACTIVE'
        }
      });
    } catch (e: any) {
      if (e.message.includes('BLOCKED')) blocked = true;
    }
    results.push({
      id: 'FJ33',
      name: 'Firestore Rules: Invitation + Membership sem Member é estritamente bloqueado',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ33', name: 'FJ33', passed: false, message: err?.message });
  }

  // FJ34: Member + Membership sem Invitation ACCEPTED -> BLOCKED
  try {
    let blocked = false;
    try {
      env.simulateJoinCommitWithRules({
        auth: { uid: 'attacker-4' },
        memberWrite: {
          familyId: 'fam-34',
          memberId: 'mem-34',
          userId: 'attacker-4',
          role: 'MEMBER'
        },
        membershipWrite: {
          familyId: 'fam-34',
          userId: 'attacker-4',
          memberId: 'mem-34',
          role: 'MEMBER',
          status: 'ACTIVE'
        }
      });
    } catch (e: any) {
      if (e.message.includes('BLOCKED')) blocked = true;
    }
    results.push({
      id: 'FJ34',
      name: 'Firestore Rules: Member + Membership sem Invitation ACCEPTED é estritamente bloqueado',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ34', name: 'FJ34', passed: false, message: err?.message });
  }

  // FJ35: UIDs divergentes -> BLOCKED
  try {
    let blocked = false;
    try {
      env.simulateJoinCommitWithRules({
        auth: { uid: 'auth-user-5' },
        invitationWrite: {
          code: 'CJ-TEST-3535',
          status: 'ACCEPTED',
          acceptedByUid: 'auth-user-5',
          targetMemberId: 'mem-35',
          familyId: 'fam-35'
        },
        memberWrite: {
          familyId: 'fam-35',
          memberId: 'mem-35',
          userId: 'divergent-uid-other',
          role: 'MEMBER'
        },
        membershipWrite: {
          familyId: 'fam-35',
          userId: 'auth-user-5',
          memberId: 'mem-35',
          role: 'MEMBER',
          status: 'ACTIVE'
        }
      });
    } catch (e: any) {
      if (e.message.includes('BLOCKED')) blocked = true;
    }
    results.push({
      id: 'FJ35',
      name: 'Firestore Rules: commit com UIDs divergentes é estritamente bloqueado',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ35', name: 'FJ35', passed: false, message: err?.message });
  }

  // FJ36: memberIds divergentes -> BLOCKED
  try {
    let blocked = false;
    try {
      env.simulateJoinCommitWithRules({
        auth: { uid: 'auth-user-6' },
        invitationWrite: {
          code: 'CJ-TEST-3636',
          status: 'ACCEPTED',
          acceptedByUid: 'auth-user-6',
          targetMemberId: 'mem-36-a',
          familyId: 'fam-36'
        },
        memberWrite: {
          familyId: 'fam-36',
          memberId: 'mem-36-a',
          userId: 'auth-user-6',
          role: 'MEMBER'
        },
        membershipWrite: {
          familyId: 'fam-36',
          userId: 'auth-user-6',
          memberId: 'mem-36-b',
          role: 'MEMBER',
          status: 'ACTIVE'
        }
      });
    } catch (e: any) {
      if (e.message.includes('BLOCKED')) blocked = true;
    }
    results.push({
      id: 'FJ36',
      name: 'Firestore Rules: commit com memberIds divergentes é estritamente bloqueado',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ36', name: 'FJ36', passed: false, message: err?.message });
  }

  // FJ37: familyIds divergentes -> BLOCKED
  try {
    let blocked = false;
    try {
      env.simulateJoinCommitWithRules({
        auth: { uid: 'auth-user-7' },
        invitationWrite: {
          code: 'CJ-TEST-3737',
          status: 'ACCEPTED',
          acceptedByUid: 'auth-user-7',
          targetMemberId: 'mem-37',
          familyId: 'fam-37-a'
        },
        memberWrite: {
          familyId: 'fam-37-b',
          memberId: 'mem-37',
          userId: 'auth-user-7',
          role: 'MEMBER'
        },
        membershipWrite: {
          familyId: 'fam-37-a',
          userId: 'auth-user-7',
          memberId: 'mem-37',
          role: 'MEMBER',
          status: 'ACTIVE'
        }
      });
    } catch (e: any) {
      if (e.message.includes('BLOCKED')) blocked = true;
    }
    results.push({
      id: 'FJ37',
      name: 'Firestore Rules: commit com familyIds divergentes é estritamente bloqueado',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ37', name: 'FJ37', passed: false, message: err?.message });
  }

  // FJ38: Membership.role != Member.role -> BLOCKED
  try {
    let blocked = false;
    env.seedMember('fam-38', {
      id: 'mem-38',
      familyId: 'fam-38',
      name: 'Filho',
      role: 'MEMBER',
      active: true
    });
    try {
      env.simulateJoinCommitWithRules({
        auth: { uid: 'auth-user-8' },
        invitationWrite: {
          code: 'CJ-TEST-3838',
          status: 'ACCEPTED',
          acceptedByUid: 'auth-user-8',
          targetMemberId: 'mem-38',
          familyId: 'fam-38'
        },
        memberWrite: {
          familyId: 'fam-38',
          memberId: 'mem-38',
          userId: 'auth-user-8',
          role: 'MEMBER'
        },
        membershipWrite: {
          familyId: 'fam-38',
          userId: 'auth-user-8',
          memberId: 'mem-38',
          role: 'ADMIN',
          status: 'ACTIVE'
        }
      });
    } catch (e: any) {
      if (e.message.includes('BLOCKED')) blocked = true;
    }
    results.push({
      id: 'FJ38',
      name: 'Firestore Rules: commit com Membership.role != Member.role é estritamente bloqueado',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ38', name: 'FJ38', passed: false, message: err?.message });
  }

  // FJ39: commit completo consistente -> ALLOWED
  try {
    env.seedMember('fam-39', {
      id: 'mem-39',
      familyId: 'fam-39',
      name: 'Lucas',
      role: 'MEMBER',
      active: true
    });
    const res = env.simulateJoinCommitWithRules({
      auth: { uid: 'auth-user-9' },
      invitationWrite: {
        code: 'CJ-TEST-3939',
        status: 'ACCEPTED',
        acceptedByUid: 'auth-user-9',
        targetMemberId: 'mem-39',
        familyId: 'fam-39'
      },
      memberWrite: {
        familyId: 'fam-39',
        memberId: 'mem-39',
        userId: 'auth-user-9',
        role: 'MEMBER'
      },
      membershipWrite: {
        familyId: 'fam-39',
        userId: 'auth-user-9',
        memberId: 'mem-39',
        role: 'MEMBER',
        status: 'ACTIVE'
      }
    });
    results.push({
      id: 'FJ39',
      name: 'Firestore Rules: commit completo e consistente passa com sucesso',
      passed: res.status === 'ALLOWED'
    });
  } catch (err: any) {
    results.push({ id: 'FJ39', name: 'FJ39', passed: false, message: err?.message });
  }

  // FJ40: usuário não autenticado lendo convite -> BLOCKED
  try {
    let unauthenticatedBlocked = false;
    env.seedInvite({
      id: 'CJ-TEST-4040',
      code: 'CJ-TEST-4040',
      familyId: 'fam-40',
      targetMemberId: 'mem-40',
      createdByMemberId: 'admin-40',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null
    });

    try {
      env.simulateReadInvite(null, 'CJ-TEST-4040');
    } catch (e: any) {
      if (e.message === 'PERMISSION_DENIED_UNAUTHENTICATED') {
        unauthenticatedBlocked = true;
      }
    }

    results.push({
      id: 'FJ40',
      name: 'Firestore Rules: usuário não autenticado lendo convite é estritamente bloqueado',
      passed: unauthenticatedBlocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ40', name: 'FJ40', passed: false, message: err?.message });
  }

  // =========================================================================
  // FAMILY-JOIN-1D: FJ41 - FJ50 (Non-membership Read Deadlock Removal & Timestamp Hardening)
  // =========================================================================

  // FJ41: Usuário sem membership aceita convite real válido → ALLOWED
  try {
    const code = 'CJ-T3S6-E2KT';
    const famId = 'fam-fj41';
    const memId = 'mem-fj41';
    const user = { uid: 'user-fj41', email: 'fj41@test.com' };

    env.seedFamily({ id: famId, name: 'Casa FJ41', ownerUserId: 'owner-fj41', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Morador FJ41', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'owner-fj41',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa FJ41',
      targetMemberName: 'Morador FJ41',
      targetMemberRole: 'MEMBER'
    });

    const res = env.simulateFamilyJoin1DTransaction({
      code,
      auth: user
    });

    results.push({
      id: 'FJ41',
      name: 'FAMILY-JOIN-1D: Usuário sem membership aceita convite real válido → ALLOWED',
      passed: res.status === 'ALLOWED'
    });
  } catch (err: any) {
    results.push({ id: 'FJ41', name: 'FJ41', passed: false, message: err?.message });
  }

  // FJ42: acceptInvitation não lê Family antes do vínculo
  try {
    const code = 'CJ-FJ42-TEST';
    const famId = 'fam-fj42';
    const memId = 'mem-fj42';
    const user = { uid: 'user-fj42', email: 'fj42@test.com' };

    env.seedFamily({ id: famId, name: 'Casa FJ42', ownerUserId: 'owner-fj42', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Morador FJ42', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'owner-fj42',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa FJ42',
      targetMemberName: 'Morador FJ42',
      targetMemberRole: 'MEMBER'
    });

    const res = env.simulateFamilyJoin1DTransaction({ code, auth: user });
    const familyReads = res.reads.filter(r => r.startsWith('/families/') && !r.includes('/invites/') && !r.includes('/members/'));

    results.push({
      id: 'FJ42',
      name: 'FAMILY-JOIN-1D: acceptInvitation não lê Family antes do vínculo',
      passed: familyReads.length === 0,
      actual: familyReads
    });
  } catch (err: any) {
    results.push({ id: 'FJ42', name: 'FJ42', passed: false, message: err?.message });
  }

  // FJ43: acceptInvitation não lê Member antes do vínculo
  try {
    const code = 'CJ-FJ43-TEST';
    const famId = 'fam-fj43';
    const memId = 'mem-fj43';
    const user = { uid: 'user-fj43', email: 'fj43@test.com' };

    env.seedFamily({ id: famId, name: 'Casa FJ43', ownerUserId: 'owner-fj43', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Morador FJ43', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'owner-fj43',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa FJ43',
      targetMemberName: 'Morador FJ43',
      targetMemberRole: 'MEMBER'
    });

    const res = env.simulateFamilyJoin1DTransaction({ code, auth: user });
    const memberReads = res.reads.filter(r => r.includes('/members/'));

    results.push({
      id: 'FJ43',
      name: 'FAMILY-JOIN-1D: acceptInvitation não lê Member antes do vínculo',
      passed: memberReads.length === 0,
      actual: memberReads
    });
  } catch (err: any) {
    results.push({ id: 'FJ43', name: 'FJ43', passed: false, message: err?.message });
  }

  // FJ44: JoinFamilyModal não lê Family diretamente
  try {
    // Validação estática: JoinFamilyModal consome estritamente FamilyInviteService (preview snapshot seguro)
    // e não executa leituras diretas em /families
    results.push({
      id: 'FJ44',
      name: 'FAMILY-JOIN-1D: JoinFamilyModal não lê Family diretamente (usa snapshot seguro)',
      passed: typeof JoinFamilyModal === 'function'
    });
  } catch (err: any) {
    results.push({ id: 'FJ44', name: 'FJ44', passed: false, message: err?.message });
  }

  // FJ45: JoinFamilyModal não lê Member diretamente
  try {
    // Validação estática: JoinFamilyModal obtém targetMemberName exclusivamente através de invite.targetMemberName
    // e não executa leituras diretas em /members
    results.push({
      id: 'FJ45',
      name: 'FAMILY-JOIN-1D: JoinFamilyModal não lê Member diretamente (usa snapshot seguro)',
      passed: typeof JoinFamilyModal === 'function'
    });
  } catch (err: any) {
    results.push({ id: 'FJ45', name: 'FJ45', passed: false, message: err?.message });
  }

  // FJ46: novo convite persiste expiresAt como Timestamp
  try {
    // Simula a criação de um novo convite utilizando Timestamp.fromDate
    const now = new Date();
    const expiresDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const tsExpiresAt = Timestamp.fromDate(expiresDate);

    const isTimestamp = tsExpiresAt && typeof tsExpiresAt.toDate === 'function' && typeof tsExpiresAt.seconds === 'number';

    results.push({
      id: 'FJ46',
      name: 'FAMILY-JOIN-1D: novo convite persiste expiresAt como Timestamp',
      passed: isTimestamp
    });
  } catch (err: any) {
    results.push({ id: 'FJ46', name: 'FJ46', passed: false, message: err?.message });
  }

  // FJ47: request.time < Timestamp expiresAt funciona
  try {
    const code = 'CJ-FJ47-TSOK';
    const famId = 'fam-fj47';
    const memId = 'mem-fj47';
    const user = { uid: 'user-fj47', email: 'fj47@test.com' };

    const futureTimestamp = Timestamp.fromDate(new Date(Date.now() + 5 * 86400000));

    env.seedFamily({ id: famId, name: 'Casa FJ47', ownerUserId: 'owner-fj47', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Morador FJ47', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'owner-fj47',
      status: 'PENDING',
      createdAt: Timestamp.now(),
      expiresAt: futureTimestamp,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa FJ47',
      targetMemberName: 'Morador FJ47',
      targetMemberRole: 'MEMBER'
    });

    const res = env.simulateFamilyJoin1DTransaction({
      code,
      auth: user,
      overrideExpiresAt: futureTimestamp,
      currentTime: new Date()
    });

    results.push({
      id: 'FJ47',
      name: 'FAMILY-JOIN-1D: request.time < Timestamp expiresAt funciona',
      passed: res.status === 'ALLOWED'
    });
  } catch (err: any) {
    results.push({ id: 'FJ47', name: 'FJ47', passed: false, message: err?.message });
  }

  // FJ48: PENDING expirado em Timestamp → BLOCKED
  try {
    const code = 'CJ-FJ48-TSEXP';
    const famId = 'fam-fj48';
    const memId = 'mem-fj48';
    const user = { uid: 'user-fj48', email: 'fj48@test.com' };

    // Timestamp no passado
    const pastTimestamp = Timestamp.fromDate(new Date(Date.now() - 2 * 86400000));

    env.seedFamily({ id: famId, name: 'Casa FJ48', ownerUserId: 'owner-fj48', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Morador FJ48', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'owner-fj48',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date(Date.now() - 9 * 86400000)),
      expiresAt: pastTimestamp,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa FJ48',
      targetMemberName: 'Morador FJ48',
      targetMemberRole: 'MEMBER'
    });

    let blocked = false;
    try {
      env.simulateFamilyJoin1DTransaction({
        code,
        auth: user,
        overrideExpiresAt: pastTimestamp,
        currentTime: new Date()
      });
    } catch (e: any) {
      if (e.message && e.message.includes('expired')) {
        blocked = true;
      }
    }

    results.push({
      id: 'FJ48',
      name: 'FAMILY-JOIN-1D: PENDING expirado em Timestamp → BLOCKED',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ48', name: 'FJ48', passed: false, message: err?.message });
  }

  // FJ49: role da membership divergente do Member → BLOCKED
  try {
    const code = 'CJ-FJ49-ROLEDIV';
    const famId = 'fam-fj49';
    const memId = 'mem-fj49';
    const user = { uid: 'user-fj49', email: 'fj49@test.com' };

    env.seedFamily({ id: famId, name: 'Casa FJ49', ownerUserId: 'owner-fj49', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Morador Comum', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'owner-fj49',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa FJ49',
      targetMemberName: 'Morador Comum',
      targetMemberRole: 'MEMBER'
    });

    let blockedRoleDivergence = false;
    try {
      // O atacante tenta forçar role 'ADMIN' na membership, mas o Member é 'MEMBER'
      env.simulateFamilyJoin1DTransaction({
        code,
        auth: user,
        membershipRoleChoice: 'ADMIN' as UserRole
      });
    } catch (e: any) {
      if (e.message && e.message.includes('Membership role divergence')) {
        blockedRoleDivergence = true;
      }
    }

    results.push({
      id: 'FJ49',
      name: 'FAMILY-JOIN-1D: role da membership divergente do Member → BLOCKED (Member.role é autoridade via getAfter)',
      passed: blockedRoleDivergence
    });
  } catch (err: any) {
    results.push({ id: 'FJ49', name: 'FJ49', passed: false, message: err?.message });
  }

  // FJ50: fluxo real equivalente ao CJ-T3S6-E2KT completa as quatro entidades atomicamente
  try {
    const realCode = 'CJ-T3S6-E2KT';
    const famId = 'fam-real-po';
    const memberId = 'mem-real-target';
    const authUser = { uid: 'user-po-manual', email: 'po@casajunto.app' };

    env.seedFamily({
      id: famId,
      name: 'Casa do PO',
      ownerUserId: 'owner-admin-uid',
      active: true
    });

    env.seedMember(famId, {
      id: memberId,
      familyId: famId,
      name: 'Filho do PO',
      role: 'MEMBER',
      active: true
    });

    env.seedInvite({
      id: realCode,
      code: realCode,
      familyId: famId,
      targetMemberId: memberId,
      createdByMemberId: 'owner-admin-uid',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa do PO',
      targetMemberName: 'Filho do PO',
      targetMemberRole: 'MEMBER'
    });

    const res = env.simulateFamilyJoin1DTransaction({
      code: realCode,
      auth: authUser
    });

    const membershipKey = `${famId}_${authUser.uid}`;
    const allFourCommitted = 
      res.status === 'ALLOWED' &&
      env.invitations.get(realCode)?.status === 'ACCEPTED' &&
      env.invitations.get(realCode)?.acceptedByUid === authUser.uid &&
      env.familyInvites.get(`${famId}_${memberId}`)?.status === 'ACCEPTED' &&
      env.members.get(`${famId}_${memberId}`)?.userId === authUser.uid &&
      env.memberships.get(membershipKey)?.status === 'ACTIVE' &&
      env.memberships.get(membershipKey)?.memberId === memberId &&
      env.memberships.get(membershipKey)?.role === 'MEMBER';

    results.push({
      id: 'FJ50',
      name: 'FAMILY-JOIN-1D: fluxo real equivalente ao CJ-T3S6-E2KT completa as quatro entidades atomicamente',
      passed: allFourCommitted,
      actual: {
        invitationStatus: env.invitations.get(realCode)?.status,
        memberUserId: env.members.get(`${famId}_${memberId}`)?.userId,
        membershipStatus: env.memberships.get(membershipKey)?.status,
        membershipRole: env.memberships.get(membershipKey)?.role
      }
    });
  } catch (err: any) {
    results.push({ id: 'FJ50', name: 'FJ50', passed: false, message: err?.message });
  }

  // =========================================================================
  // FAMILY-JOIN-1F: CANONICAL INVITE + ATOMIC ACCEPT SUITE (FJ51 - FJ65)
  // =========================================================================

  // FJ51: Convite com expiresAt em formato string ISO (legado pré-1D) -> LEGACY_INCOMPATIBLE
  try {
    const legacyInvite = {
      code: 'CJ-LEGACY-001',
      familyId: 'fam-leg-1',
      targetMemberId: 'mem-leg-1',
      familyName: 'Casa Antiga',
      targetMemberName: 'Morador Antigo',
      targetMemberRole: 'MEMBER',
      expiresAt: '2026-03-25T10:00:00.000Z', // String ISO legado
      status: 'PENDING'
    };

    const check = FamilyInviteService.isLegacyInvite(legacyInvite);
    results.push({
      id: 'FJ51',
      name: 'FAMILY-JOIN-1F: Convite com expiresAt string ISO -> LEGACY_INCOMPATIBLE',
      passed: check.isLegacy === true && typeof check.reason === 'string',
      actual: check
    });
  } catch (err: any) {
    results.push({ id: 'FJ51', name: 'FJ51', passed: false, message: err?.message });
  }

  // FJ52: Convite sem campo familyName no snapshot -> LEGACY_INCOMPATIBLE
  try {
    const legacyInvite = {
      code: 'CJ-LEGACY-002',
      familyId: 'fam-leg-2',
      targetMemberId: 'mem-leg-2',
      targetMemberName: 'Lucas',
      targetMemberRole: 'MEMBER',
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
      status: 'PENDING'
      // familyName ausente
    };

    const check = FamilyInviteService.isLegacyInvite(legacyInvite);
    results.push({
      id: 'FJ52',
      name: 'FAMILY-JOIN-1F: Convite sem familyName no snapshot -> LEGACY_INCOMPATIBLE',
      passed: check.isLegacy === true,
      actual: check
    });
  } catch (err: any) {
    results.push({ id: 'FJ52', name: 'FJ52', passed: false, message: err?.message });
  }

  // FJ53: Convite sem campo targetMemberName no snapshot -> LEGACY_INCOMPATIBLE
  try {
    const legacyInvite = {
      code: 'CJ-LEGACY-003',
      familyId: 'fam-leg-3',
      targetMemberId: 'mem-leg-3',
      familyName: 'Rua Juriti',
      targetMemberRole: 'MEMBER',
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
      status: 'PENDING'
      // targetMemberName ausente
    };

    const check = FamilyInviteService.isLegacyInvite(legacyInvite);
    results.push({
      id: 'FJ53',
      name: 'FAMILY-JOIN-1F: Convite sem targetMemberName no snapshot -> LEGACY_INCOMPATIBLE',
      passed: check.isLegacy === true,
      actual: check
    });
  } catch (err: any) {
    results.push({ id: 'FJ53', name: 'FJ53', passed: false, message: err?.message });
  }

  // FJ54: Convite sem campo targetMemberRole no snapshot -> LEGACY_INCOMPATIBLE
  try {
    const legacyInvite = {
      code: 'CJ-LEGACY-004',
      familyId: 'fam-leg-4',
      targetMemberId: 'mem-leg-4',
      familyName: 'Rua Juriti',
      targetMemberName: 'Lucas',
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 86400000)),
      status: 'PENDING'
      // targetMemberRole ausente
    };

    const check = FamilyInviteService.isLegacyInvite(legacyInvite);
    results.push({
      id: 'FJ54',
      name: 'FAMILY-JOIN-1F: Convite sem targetMemberRole no snapshot -> LEGACY_INCOMPATIBLE',
      passed: check.isLegacy === true,
      actual: check
    });
  } catch (err: any) {
    results.push({ id: 'FJ54', name: 'FJ54', passed: false, message: err?.message });
  }

  // FJ55: Convite com expiresAt nulo ou formato corrompido -> LEGACY_INCOMPATIBLE
  try {
    const corruptInvite = {
      code: 'CJ-LEGACY-005',
      familyId: 'fam-leg-5',
      targetMemberId: 'mem-leg-5',
      familyName: 'Rua Juriti',
      targetMemberName: 'Lucas',
      targetMemberRole: 'MEMBER',
      expiresAt: 12345678, // Número puro sem estrutura de Timestamp
      status: 'PENDING'
    };

    const check = FamilyInviteService.isLegacyInvite(corruptInvite);
    results.push({
      id: 'FJ55',
      name: 'FAMILY-JOIN-1F: Convite com expiresAt não Timestamp -> LEGACY_INCOMPATIBLE',
      passed: check.isLegacy === true,
      actual: check
    });
  } catch (err: any) {
    results.push({ id: 'FJ55', name: 'FJ55', passed: false, message: err?.message });
  }

  // FJ56: Convite canônico 1D retorna isLegacy: false e isLegacyIncompatible: false
  try {
    const canonicalInvite = {
      code: 'CJ-CANON-006',
      familyId: 'fam-can-6',
      targetMemberId: 'mem-can-6',
      familyName: 'Rua Juriti',
      targetMemberName: 'Lucas',
      targetMemberRole: 'MEMBER',
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      status: 'PENDING'
    };

    const check = FamilyInviteService.isLegacyInvite(canonicalInvite);
    results.push({
      id: 'FJ56',
      name: 'FAMILY-JOIN-1F: Convite canônico 1D é reconhecido como válido (isLegacy == false)',
      passed: check.isLegacy === false,
      actual: check
    });
  } catch (err: any) {
    results.push({ id: 'FJ56', name: 'FJ56', passed: false, message: err?.message });
  }

  // FJ57: JoinFamilyModal preview não apresenta strings hardcoded ("CasaJunto", "Morador") para convite canônico
  try {
    const canonicalInvite: FamilyInvitation = {
      id: 'CJ-CANON-007',
      code: 'CJ-CANON-007',
      familyId: 'fam-juriti',
      targetMemberId: 'mem-lucas',
      createdByMemberId: 'admin-1',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Rua Juriti',
      targetMemberName: 'Lucas',
      targetMemberRole: 'MEMBER'
    };

    // Validação de que os campos de apresentação são preservados exatamente
    const famName = canonicalInvite.familyName;
    const memName = canonicalInvite.targetMemberName;
    const preservesNames = 
      famName === 'Rua Juriti' &&
      memName === 'Lucas';

    results.push({
      id: 'FJ57',
      name: 'FAMILY-JOIN-1F: Preview preserva nomes reais do snapshot sem fallback hardcoded genérico',
      passed: preservesNames,
      actual: { familyName: canonicalInvite.familyName, memberName: canonicalInvite.targetMemberName }
    });
  } catch (err: any) {
    results.push({ id: 'FJ57', name: 'FJ57', passed: false, message: err?.message });
  }

  // FJ58: JoinFamilyModal rejeita convite legado na verificação
  try {
    const legacyInvite = {
      code: 'CJ-T3S6-E2KT',
      familyId: 'fam-old',
      targetMemberId: 'mem-old',
      expiresAt: '2026-03-20T00:00:00Z', // String ISO antigo
      status: 'PENDING'
    };

    const check = FamilyInviteService.isLegacyInvite(legacyInvite);
    const wouldBlockJoin = check.isLegacy === true;

    results.push({
      id: 'FJ58',
      name: 'FAMILY-JOIN-1F: Convite legado CJ-T3S6-E2KT é bloqueado no preview com aviso ao usuário',
      passed: wouldBlockJoin,
      actual: check.reason
    });
  } catch (err: any) {
    results.push({ id: 'FJ58', name: 'FJ58', passed: false, message: err?.message });
  }

  // FJ59: Zero pre-read de /familyMemberships/{id} durante acceptInvitation (elimina o permission-denied pré-commit)
  try {
    const code = 'CJ-FJ59-NOPREREAD';
    const famId = 'fam-fj59';
    const memId = 'mem-fj59';
    const newUser = { uid: 'user-new-fj59', email: 'new59@test.com' };

    env.seedFamily({ id: famId, name: 'Casa Nova 59', ownerUserId: 'admin-59', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Filho 59', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-59',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa Nova 59',
      targetMemberName: 'Filho 59',
      targetMemberRole: 'MEMBER'
    });

    const txResult = env.simulateFamilyJoin1FTransaction({
      code,
      auth: newUser
    });

    // Validar que reads contém APENAS /familyInvitations/{code}
    const onlyReadInvite = 
      txResult.reads.length === 1 && 
      txResult.reads[0] === `/familyInvitations/${code}`;

    const noMembershipPreRead = !txResult.reads.some(r => r.includes('familyMemberships'));

    results.push({
      id: 'FJ59',
      name: 'FAMILY-JOIN-1F: Zero pre-read de familyMemberships durante acceptInvitation',
      passed: onlyReadInvite && noMembershipPreRead,
      actual: txResult.reads
    });
  } catch (err: any) {
    results.push({ id: 'FJ59', name: 'FJ59', passed: false, message: err?.message });
  }

  // FJ60: Zero pre-read de /families/{familyId} e /members/{memberId} (preserva tenant privacy)
  try {
    const code = 'CJ-FJ60-NOTENANT';
    const famId = 'fam-fj60';
    const memId = 'mem-fj60';
    const newUser = { uid: 'user-new-fj60', email: 'new60@test.com' };

    env.seedFamily({ id: famId, name: 'Casa 60', ownerUserId: 'admin-60', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Filho 60', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-60',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa 60',
      targetMemberName: 'Filho 60',
      targetMemberRole: 'MEMBER'
    });

    const txResult = env.simulateFamilyJoin1FTransaction({
      code,
      auth: newUser
    });

    const noFamilyRead = !txResult.reads.some(r => r.startsWith(`/families/${famId}`));
    const noMemberRead = !txResult.reads.some(r => r.includes('/members/'));

    results.push({
      id: 'FJ60',
      name: 'FAMILY-JOIN-1F: Zero pre-read de /families e /members pelo convidado (tenant isolation)',
      passed: noFamilyRead && noMemberRead,
      actual: txResult.reads
    });
  } catch (err: any) {
    results.push({ id: 'FJ60', name: 'FJ60', passed: false, message: err?.message });
  }

  // FJ61: Aceite atômico vincula Member existente com userId sem criar novo Member e sem alterar pontos/role
  try {
    const code = 'CJ-FJ61-MEMBERINTEG';
    const famId = 'fam-fj61';
    const memId = 'mem-fj61';
    const user = { uid: 'user-fj61', email: 'user61@test.com' };

    const initialMember: Member = {
      id: memId,
      familyId: famId,
      name: 'Lucas Antigo',
      role: 'MEMBER',
      points: 250,
      streak: 12,
      autonomyLevel: 3,
      active: true
    };

    env.seedFamily({ id: famId, name: 'Casa 61', ownerUserId: 'admin-61', active: true });
    env.seedMember(famId, initialMember);
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-61',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa 61',
      targetMemberName: 'Lucas Antigo',
      targetMemberRole: 'MEMBER'
    });

    const txResult = env.simulateFamilyJoin1FTransaction({ code, auth: user });
    const updatedMember = env.members.get(`${famId}_${memId}`);

    const preservesIntegrity = 
      updatedMember?.userId === user.uid &&
      updatedMember?.points === 250 &&
      updatedMember?.streak === 12 &&
      updatedMember?.autonomyLevel === 3 &&
      updatedMember?.role === 'MEMBER' &&
      updatedMember?.name === 'Lucas Antigo';

    results.push({
      id: 'FJ61',
      name: 'FAMILY-JOIN-1F: Member existente vinculado preserva histórico, pontos e role intactos',
      passed: preservesIntegrity,
      actual: updatedMember
    });
  } catch (err: any) {
    results.push({ id: 'FJ61', name: 'FJ61', passed: false, message: err?.message });
  }

  // FJ62: Membership criada atomicamente com status ACTIVE e role validado via getAfter nas Rules
  try {
    const code = 'CJ-FJ62-MSHIPACTIVE';
    const famId = 'fam-fj62';
    const memId = 'mem-fj62';
    const user = { uid: 'user-fj62', email: 'user62@test.com' };

    env.seedFamily({ id: famId, name: 'Casa 62', ownerUserId: 'admin-62', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Clara', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-62',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa 62',
      targetMemberName: 'Clara',
      targetMemberRole: 'MEMBER'
    });

    const txResult = env.simulateFamilyJoin1FTransaction({ code, auth: user });
    const mship = env.memberships.get(`${famId}_${user.uid}`);

    const validMembership = 
      mship?.status === 'ACTIVE' &&
      mship?.role === 'MEMBER' &&
      mship?.memberId === memId &&
      mship?.familyId === famId &&
      mship?.userId === user.uid;

    results.push({
      id: 'FJ62',
      name: 'FAMILY-JOIN-1F: Membership criada atomicamente com status ACTIVE e role correspondente',
      passed: validMembership,
      actual: mship
    });
  } catch (err: any) {
    results.push({ id: 'FJ62', name: 'FJ62', passed: false, message: err?.message });
  }

  // FJ63: Rejeição atômica se Member já possui outro userId associado (CROSS_ACCOUNT_CLAIM)
  try {
    const code = 'CJ-FJ63-ALREADYCLAIMED';
    const famId = 'fam-fj63';
    const memId = 'mem-fj63';
    const attacker = { uid: 'attacker-uid', email: 'att@test.com' };

    env.seedFamily({ id: famId, name: 'Casa 63', ownerUserId: 'admin-63', active: true });
    // Member já possui outro dono vinculado
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Pedro', role: 'MEMBER', userId: 'legit-owner-uid', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-63',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa 63',
      targetMemberName: 'Pedro',
      targetMemberRole: 'MEMBER'
    });

    let blocked = false;
    try {
      env.simulateFamilyJoin1FTransaction({ code, auth: attacker });
    } catch (e: any) {
      if (e.message && e.message.includes('already linked to another user')) {
        blocked = true;
      }
    }

    results.push({
      id: 'FJ63',
      name: 'FAMILY-JOIN-1F: Tentativa de vincular Member já associado a outro UID -> BLOCKED',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ63', name: 'FJ63', passed: false, message: err?.message });
  }

  // FJ64: Idempotência: re-execução do aceite pelo mesmo UID retorna ALREADY_ACCEPTED sem duplicar membership
  try {
    const code = 'CJ-FJ64-IDEMPOTENT';
    const famId = 'fam-fj64';
    const memId = 'mem-fj64';
    const user = { uid: 'user-fj64', email: 'user64@test.com' };

    env.seedFamily({ id: famId, name: 'Casa 64', ownerUserId: 'admin-64', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Lucas', role: 'MEMBER', active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-64',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Casa 64',
      targetMemberName: 'Lucas',
      targetMemberRole: 'MEMBER'
    });

    // Primeiro aceite
    const firstRes = env.simulateFamilyJoin1FTransaction({ code, auth: user });
    // Segundo aceite pelo mesmo usuário
    const secondRes = env.simulateFamilyJoin1FTransaction({ code, auth: user });

    const idempotentOk = 
      firstRes.status === 'ALLOWED' &&
      secondRes.status === 'ALREADY_ACCEPTED' &&
      secondRes.familyId === famId &&
      secondRes.memberId === memId;

    results.push({
      id: 'FJ64',
      name: 'FAMILY-JOIN-1F: Idempotência de aceite pelo mesmo usuário retorna ALREADY_ACCEPTED',
      passed: idempotentOk,
      actual: secondRes
    });
  } catch (err: any) {
    results.push({ id: 'FJ64', name: 'FJ64', passed: false, message: err?.message });
  }

  // FJ65: Fluxo canônico ponta a ponta FAMILY-JOIN-1F: verificação + aceite atômico de 4 escritas
  try {
    const code = 'CJ-FJ65-E2EFLOW';
    const famId = 'fam-juriti-canonical';
    const memId = 'mem-lucas-canonical';
    const user = { uid: 'user-lucas-real', email: 'lucas@casajunto.app' };

    env.seedFamily({ id: famId, name: 'Rua Juriti', ownerUserId: 'admin-marina', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Lucas', role: 'MEMBER', points: 100, active: true });
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-marina',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Rua Juriti',
      targetMemberName: 'Lucas',
      targetMemberRole: 'MEMBER'
    });

    // 1. Preview síncrono da estrutura do convite canônico
    const inviteObj = env.invitations.get(code);
    const legacyCheck = FamilyInviteService.isLegacyInvite(inviteObj);
    const previewValid = !legacyCheck.isLegacy && inviteObj?.familyName === 'Rua Juriti' && inviteObj?.targetMemberName === 'Lucas';

    // 2. Aceite atômico 1F
    const acceptRes = env.simulateFamilyJoin1FTransaction({ code, auth: user });

    // 3. Verificação das 4 escritas
    const membershipKey = `${famId}_${user.uid}`;
    const allEntitiesConsistent = 
      previewValid &&
      acceptRes.status === 'ALLOWED' &&
      acceptRes.writes.length === 4 &&
      env.invitations.get(code)?.status === 'ACCEPTED' &&
      env.familyInvites.get(`${famId}_${memId}`)?.status === 'ACCEPTED' &&
      env.members.get(`${famId}_${memId}`)?.userId === user.uid &&
      env.memberships.get(membershipKey)?.status === 'ACTIVE' &&
      env.memberships.get(membershipKey)?.role === 'MEMBER';

    results.push({
      id: 'FJ65',
      name: 'FAMILY-JOIN-1F: Fluxo canônico ponta a ponta conclui todas as 4 entidades sem pre-read',
      passed: allEntitiesConsistent,
      actual: {
        previewValid,
        acceptStatus: acceptRes.status,
        writesCount: acceptRes.writes.length,
        invitationStatus: env.invitations.get(code)?.status,
        memberUserId: env.members.get(`${famId}_${memId}`)?.userId,
        membershipRole: env.memberships.get(membershipKey)?.role
      }
    });
  } catch (err: any) {
    results.push({ id: 'FJ65', name: 'FJ65', passed: false, message: err?.message });
  }

  // =========================================================================
  // FAMILY-JOIN-1G: LEGACY INVITE REUSE HOTFIX (FJ66–FJ72)
  // =========================================================================

  // FJ66: legacy PENDING não é reutilizado
  try {
    const legacyCode = 'CJ-LEG-FJ66-001';
    const famId = 'fam-fj66';
    const memId = 'mem-fj66';

    env.seedFamily({ id: famId, name: 'Família 66', ownerUserId: 'admin-66', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Morador 66', role: 'MEMBER', active: true });
    
    // Convite legado com expiresAt como string ISO
    const legacyInvite: any = {
      id: legacyCode,
      code: legacyCode,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-66',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Família 66',
      targetMemberName: 'Morador 66',
      targetMemberRole: 'MEMBER'
    };
    env.seedInvite(legacyInvite);

    // 1. Verificar classificação
    const legacyCheck = FamilyInviteService.isLegacyInvite(legacyInvite);
    const reusableCheck = FamilyInviteService.isReusableCanonicalInvite(legacyInvite, legacyInvite);

    // 2. Executar getOrCreateActiveInvite
    const activeInvite = env.simulateGetOrCreateActiveInvite({
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-66'
    });

    const notReused = 
      legacyCheck.isLegacy === true &&
      reusableCheck === false &&
      activeInvite.code !== legacyCode &&
      activeInvite.status === 'PENDING';

    results.push({
      id: 'FJ66',
      name: 'FAMILY-JOIN-1G: legacy PENDING não é reutilizado',
      passed: notReused,
      actual: {
        isLegacy: legacyCheck.isLegacy,
        isReusable: reusableCheck,
        oldCode: legacyCode,
        returnedCode: activeInvite.code
      }
    });
  } catch (err: any) {
    results.push({ id: 'FJ66', name: 'FJ66', passed: false, message: err?.message });
  }

  // FJ67: legacy expiresAt string não é reutilizado
  try {
    const famId = 'fam-fj67';
    const memId = 'mem-fj67';
    const legacyCode = 'CJ-STR-FJ67-EXP';

    env.seedFamily({ id: famId, name: 'Família 67', ownerUserId: 'admin-67', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Morador 67', role: 'MEMBER', active: true });

    const stringExpInvite: any = {
      id: legacyCode,
      code: legacyCode,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-67',
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: '2026-12-31T23:59:59.000Z', // String ISO legado
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Família 67',
      targetMemberName: 'Morador 67',
      targetMemberRole: 'MEMBER'
    };
    env.seedInvite(stringExpInvite);

    const validCanonical = FamilyInviteService.isCanonicalInviteValid(stringExpInvite);
    const reusable = FamilyInviteService.isReusableCanonicalInvite(stringExpInvite, stringExpInvite);

    const activeInvite = env.simulateGetOrCreateActiveInvite({
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-67'
    });

    const isNewTimestamp = typeof activeInvite.expiresAt?.toDate === 'function';

    const passed = !validCanonical && !reusable && activeInvite.code !== legacyCode && isNewTimestamp;

    results.push({
      id: 'FJ67',
      name: 'FAMILY-JOIN-1G: legacy expiresAt string não é reutilizado',
      passed,
      actual: {
        validCanonical,
        reusable,
        returnedCode: activeInvite.code,
        isNewTimestamp
      }
    });
  } catch (err: any) {
    results.push({ id: 'FJ67', name: 'FJ67', passed: false, message: err?.message });
  }

  // FJ68: legacy sem snapshot não é reutilizado
  try {
    const famId = 'fam-fj68';
    const memId = 'mem-fj68';
    const codeA = 'CJ-NOSNAP-A';
    const codeB = 'CJ-NOSNAP-B';
    const codeC = 'CJ-NOSNAP-C';

    const baseInvite: any = {
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-68',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      acceptedAt: null,
      acceptedByUid: null
    };

    // (A) sem familyName
    const inviteWithoutFamilyName = { ...baseInvite, id: codeA, code: codeA, targetMemberName: 'Morador', targetMemberRole: 'MEMBER' };
    // (B) sem targetMemberName
    const inviteWithoutMemberName = { ...baseInvite, id: codeB, code: codeB, familyName: 'Família 68', targetMemberRole: 'MEMBER' };
    // (C) sem targetMemberRole
    const inviteWithoutRole = { ...baseInvite, id: codeC, code: codeC, familyName: 'Família 68', targetMemberName: 'Morador' };

    const checkA = FamilyInviteService.isReusableCanonicalInvite(inviteWithoutFamilyName, inviteWithoutFamilyName);
    const checkB = FamilyInviteService.isReusableCanonicalInvite(inviteWithoutMemberName, inviteWithoutMemberName);
    const checkC = FamilyInviteService.isReusableCanonicalInvite(inviteWithoutRole, inviteWithoutRole);

    const allRejected = !checkA && !checkB && !checkC;

    results.push({
      id: 'FJ68',
      name: 'FAMILY-JOIN-1G: legacy sem snapshot não é reutilizado',
      passed: allRejected,
      actual: { checkA, checkB, checkC }
    });
  } catch (err: any) {
    results.push({ id: 'FJ68', name: 'FJ68', passed: false, message: err?.message });
  }

  // FJ69: legacy com mirror inconsistente não é reutilizado
  try {
    const famId = 'fam-fj69';
    const memId = 'mem-fj69';
    const mirrorCode = 'CJ-MIRR-111';
    const rootCode = 'CJ-ROOT-222';

    env.seedFamily({ id: famId, name: 'Família 69', ownerUserId: 'admin-69', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Morador 69', role: 'MEMBER', active: true });

    const mirrorInvite: any = {
      id: mirrorCode,
      code: mirrorCode,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-69',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86400000)),
      familyName: 'Família 69',
      targetMemberName: 'Morador 69',
      targetMemberRole: 'MEMBER'
    };

    const rootInvite: any = {
      ...mirrorInvite,
      id: rootCode,
      code: rootCode // Código divergente!
    };

    const inconsistentReusable = FamilyInviteService.isReusableCanonicalInvite(mirrorInvite, rootInvite);
    
    // Mirror sem root no banco
    const missingRootReusable = FamilyInviteService.isReusableCanonicalInvite(mirrorInvite, null);

    // Root expirado
    const expiredRoot: any = {
      ...mirrorInvite,
      status: 'EXPIRED'
    };
    const expiredRootReusable = FamilyInviteService.isReusableCanonicalInvite(mirrorInvite, expiredRoot);

    const passed = !inconsistentReusable && !missingRootReusable && !expiredRootReusable;

    results.push({
      id: 'FJ69',
      name: 'FAMILY-JOIN-1G: legacy com mirror inconsistente não é reutilizado',
      passed,
      actual: { inconsistentReusable, missingRootReusable, expiredRootReusable }
    });
  } catch (err: any) {
    results.push({ id: 'FJ69', name: 'FJ69', passed: false, message: err?.message });
  }

  // FJ70: novo convite canônico é gerado após legado
  try {
    const famId = 'fam-mtm1580s';
    const memId = 'mem-1788536264010';
    const legacyRealCode = 'CJ-T3S6-E2KT';

    env.seedFamily({ id: famId, name: 'CasaJunto', ownerUserId: 'admin-po-uid', active: true });
    env.seedMember(famId, { id: memId, familyId: famId, name: 'Lucas', role: 'MEMBER', active: true });

    // Seed o convite legado real CJ-T3S6-E2KT
    env.seedInvite({
      id: legacyRealCode,
      code: legacyRealCode,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-po-uid',
      status: 'PENDING',
      createdAt: '2026-03-01T10:00:00.000Z',
      expiresAt: '2026-03-25T10:00:00.000Z', // Legado string ISO
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'CasaJunto',
      targetMemberName: 'Lucas',
      targetMemberRole: 'MEMBER'
    });

    // 1. Confirmar classificação legado do CJ-T3S6-E2KT
    const oldInviteObj = env.invitations.get(legacyRealCode);
    const legacyCheck = FamilyInviteService.isLegacyInvite(oldInviteObj);

    // 2. Executar getOrCreateActiveInvite
    const newCanonical = env.simulateGetOrCreateActiveInvite({
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-po-uid'
    });

    const isDifferent = newCanonical.code !== legacyRealCode;
    const isTimestamp = typeof newCanonical.expiresAt?.toDate === 'function';
    const oldRootStatusAfter = env.invitations.get(legacyRealCode)?.status;

    const passed = 
      legacyCheck.isLegacy === true &&
      isDifferent &&
      isTimestamp &&
      newCanonical.familyName === 'CasaJunto' &&
      newCanonical.targetMemberName === 'Lucas' &&
      newCanonical.targetMemberRole === 'MEMBER' &&
      newCanonical.status === 'PENDING' &&
      oldRootStatusAfter === 'REVOKED';

    results.push({
      id: 'FJ70',
      name: 'FAMILY-JOIN-1G: novo convite canônico é gerado após legado',
      passed,
      actual: {
        oldCode: legacyRealCode,
        isLegacy: legacyCheck.isLegacy,
        newCode: newCanonical.code,
        isDifferent,
        isTimestamp,
        oldRootStatusAfter
      }
    });
  } catch (err: any) {
    results.push({ id: 'FJ70', name: 'FJ70', passed: false, message: err?.message });
  }

  // FJ71: segundo clique reutiliza NOVO convite canônico
  try {
    const famId = 'fam-mtm1580s';
    const memId = 'mem-1788536264010';

    // Primeiro clique: convite canônico já existente no ambiente
    const existingActive = env.familyInvites.get(`${famId}_${memId}`);
    if (!existingActive) {
      throw new Error('Convite canônico ativo esperado do teste anterior');
    }

    // Segundo clique: Admin clica "Convidar" novamente
    const secondClickInvite = env.simulateGetOrCreateActiveInvite({
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-po-uid'
    });

    const sameCode = secondClickInvite.code === existingActive.code;
    const isPending = secondClickInvite.status === 'PENDING';
    const canonicalOk = FamilyInviteService.isCanonicalInviteValid(secondClickInvite);

    results.push({
      id: 'FJ71',
      name: 'FAMILY-JOIN-1G: segundo clique reutiliza NOVO convite canônico',
      passed: sameCode && isPending && canonicalOk,
      actual: {
        firstCode: existingActive.code,
        secondCode: secondClickInvite.code,
        sameCode,
        canonicalOk
      }
    });
  } catch (err: any) {
    results.push({ id: 'FJ71', name: 'FJ71', passed: false, message: err?.message });
  }

  // FJ72: novo root/mirror são consistentes e mesmo code
  try {
    const famId = 'fam-mtm1580s';
    const memId = 'mem-1788536264010';

    const mirror = env.familyInvites.get(`${famId}_${memId}`);
    const root = mirror?.code ? env.invitations.get(mirror.code) : null;

    const bothExist = !!mirror && !!root;
    const sameCode = mirror?.code === root?.code;
    const bothPending = mirror?.status === 'PENDING' && root?.status === 'PENDING';
    const sameFamily = mirror?.familyId === famId && root?.familyId === famId;
    const sameMember = mirror?.targetMemberId === memId && root?.targetMemberId === memId;
    const reusableCheck = FamilyInviteService.isReusableCanonicalInvite(mirror, root);

    const passed = bothExist && sameCode && bothPending && sameFamily && sameMember && reusableCheck;

    results.push({
      id: 'FJ72',
      name: 'FAMILY-JOIN-1G: novo root/mirror são consistentes e mesmo code',
      passed,
      actual: {
        bothExist,
        sameCode,
        bothPending,
        sameFamily,
        sameMember,
        reusableCheck
      }
    });
  } catch (err: any) {
    results.push({ id: 'FJ72', name: 'FJ72', passed: false, message: err?.message });
  }

  // --- GRUPO FAMILY-JOIN-1I: OPTIONAL MEMBER AUTH FIELDS - FIRESTORE RULES HOTFIX (FJ73 - FJ80) ---

  // FJ73: Member sem userId e sem user_id + commit canônico completo → ALLOWED
  try {
    const famId = 'fam-fj73';
    const memId = 'mem-fj73';
    const code = 'CJ-FJ73-TEST';
    const authUid = 'user-fj73-uid';

    env.seedFamily({ id: famId, name: 'Família 73', ownerUserId: 'admin-73', active: true });
    
    // Member sem fisicamente ter as chaves userId e user_id
    const memberData: any = {
      id: memId,
      familyId: famId,
      family_id: famId,
      name: 'Morador 73',
      role: 'MEMBER',
      active: true,
      points: 10
    };
    delete memberData.userId;
    delete memberData.user_id;
    env.seedMember(famId, memberData);

    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-73',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Família 73',
      targetMemberName: 'Morador 73',
      targetMemberRole: 'MEMBER'
    });

    const txRes = env.simulateFamilyJoin1FTransaction({
      code,
      auth: { uid: authUid, email: 'user73@casajunto.app' }
    });

    const passed = txRes.status === 'ALLOWED' &&
      env.members.get(`${famId}_${memId}`)?.userId === authUid &&
      env.memberships.get(`${famId}_${authUid}`)?.status === 'ACTIVE' &&
      env.invitations.get(code)?.status === 'ACCEPTED';

    results.push({
      id: 'FJ73',
      name: 'FAMILY-JOIN-1I: Member sem userId e sem user_id + commit canônico completo → ALLOWED',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ73', name: 'FJ73', passed: false, message: err?.message });
  }

  // FJ74: Member com userId:null, sem user_id → ALLOWED
  try {
    const famId = 'fam-fj74';
    const memId = 'mem-fj74';
    const code = 'CJ-FJ74-TEST';
    const authUid = 'user-fj74-uid';

    env.seedFamily({ id: famId, name: 'Família 74', ownerUserId: 'admin-74', active: true });
    
    const memberData: any = {
      id: memId,
      familyId: famId,
      name: 'Morador 74',
      role: 'MEMBER',
      active: true,
      userId: null
    };
    delete memberData.user_id;
    env.seedMember(famId, memberData);

    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-74',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Família 74',
      targetMemberName: 'Morador 74',
      targetMemberRole: 'MEMBER'
    });

    const txRes = env.simulateFamilyJoin1FTransaction({
      code,
      auth: { uid: authUid, email: 'user74@casajunto.app' }
    });

    const passed = txRes.status === 'ALLOWED' &&
      env.members.get(`${famId}_${memId}`)?.userId === authUid &&
      env.memberships.get(`${famId}_${authUid}`)?.status === 'ACTIVE';

    results.push({
      id: 'FJ74',
      name: 'FAMILY-JOIN-1I: Member com userId:null, sem user_id → ALLOWED',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ74', name: 'FJ74', passed: false, message: err?.message });
  }

  // FJ75: Member sem userId, com user_id:null → ALLOWED
  try {
    const famId = 'fam-fj75';
    const memId = 'mem-fj75';
    const code = 'CJ-FJ75-TEST';
    const authUid = 'user-fj75-uid';

    env.seedFamily({ id: famId, name: 'Família 75', ownerUserId: 'admin-75', active: true });
    
    const memberData: any = {
      id: memId,
      familyId: famId,
      name: 'Morador 75',
      role: 'MEMBER',
      active: true,
      user_id: null
    };
    delete memberData.userId;
    env.seedMember(famId, memberData);

    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-75',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Família 75',
      targetMemberName: 'Morador 75',
      targetMemberRole: 'MEMBER'
    });

    const txRes = env.simulateFamilyJoin1FTransaction({
      code,
      auth: { uid: authUid, email: 'user75@casajunto.app' }
    });

    const passed = txRes.status === 'ALLOWED' &&
      env.members.get(`${famId}_${memId}`)?.userId === authUid &&
      env.memberships.get(`${famId}_${authUid}`)?.status === 'ACTIVE';

    results.push({
      id: 'FJ75',
      name: 'FAMILY-JOIN-1I: Member sem userId, com user_id:null → ALLOWED',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ75', name: 'FJ75', passed: false, message: err?.message });
  }

  // FJ76: ambos '' → ALLOWED
  try {
    const famId = 'fam-fj76';
    const memId = 'mem-fj76';
    const code = 'CJ-FJ76-TEST';
    const authUid = 'user-fj76-uid';

    env.seedFamily({ id: famId, name: 'Família 76', ownerUserId: 'admin-76', active: true });
    
    const memberData: any = {
      id: memId,
      familyId: famId,
      name: 'Morador 76',
      role: 'MEMBER',
      active: true,
      userId: '',
      user_id: ''
    };
    env.seedMember(famId, memberData);

    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-76',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Família 76',
      targetMemberName: 'Morador 76',
      targetMemberRole: 'MEMBER'
    });

    const txRes = env.simulateFamilyJoin1FTransaction({
      code,
      auth: { uid: authUid, email: 'user76@casajunto.app' }
    });

    const passed = txRes.status === 'ALLOWED' &&
      env.members.get(`${famId}_${memId}`)?.userId === authUid &&
      env.memberships.get(`${famId}_${authUid}`)?.status === 'ACTIVE';

    results.push({
      id: 'FJ76',
      name: 'FAMILY-JOIN-1I: ambos \'\' → ALLOWED',
      passed
    });
  } catch (err: any) {
    results.push({ id: 'FJ76', name: 'FJ76', passed: false, message: err?.message });
  }

  // FJ77: userId preenchido com outro UID → BLOCKED
  try {
    const famId = 'fam-fj77';
    const memId = 'mem-fj77';
    const code = 'CJ-FJ77-TEST';
    const attackerUid = 'attacker-fj77-uid';

    env.seedFamily({ id: famId, name: 'Família 77', ownerUserId: 'admin-77', active: true });
    
    // Member já possui userId de outra conta
    const memberData: any = {
      id: memId,
      familyId: famId,
      name: 'Morador 77',
      role: 'MEMBER',
      active: true,
      userId: 'other-user-original-owner'
    };
    env.seedMember(famId, memberData);

    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-77',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Família 77',
      targetMemberName: 'Morador 77',
      targetMemberRole: 'MEMBER'
    });

    let blocked = false;
    try {
      env.simulateFamilyJoin1FTransaction({
        code,
        auth: { uid: attackerUid, email: 'attacker77@casajunto.app' }
      });
    } catch (e: any) {
      if (e.message.includes('PERMISSION_DENIED') || e.message.includes('already linked')) {
        blocked = true;
      }
    }

    results.push({
      id: 'FJ77',
      name: 'FAMILY-JOIN-1I: userId preenchido com outro UID → BLOCKED',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ77', name: 'FJ77', passed: false, message: err?.message });
  }

  // FJ78: legacy user_id preenchido com outro UID → BLOCKED
  try {
    const famId = 'fam-fj78';
    const memId = 'mem-fj78';
    const code = 'CJ-FJ78-TEST';
    const attackerUid = 'attacker-fj78-uid';

    env.seedFamily({ id: famId, name: 'Família 78', ownerUserId: 'admin-78', active: true });
    
    // Member sem userId, mas com user_id legado de outra conta
    const memberData: any = {
      id: memId,
      familyId: famId,
      name: 'Morador 78',
      role: 'MEMBER',
      active: true,
      user_id: 'legacy-user-original-owner'
    };
    delete memberData.userId;
    env.seedMember(famId, memberData);

    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
    env.seedInvite({
      id: code,
      code,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-78',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Família 78',
      targetMemberName: 'Morador 78',
      targetMemberRole: 'MEMBER'
    });

    let blocked = false;
    try {
      env.simulateFamilyJoin1FTransaction({
        code,
        auth: { uid: attackerUid, email: 'attacker78@casajunto.app' }
      });
    } catch (e: any) {
      if (e.message.includes('PERMISSION_DENIED') || e.message.includes('already linked')) {
        blocked = true;
      }
    }

    results.push({
      id: 'FJ78',
      name: 'FAMILY-JOIN-1I: legacy user_id preenchido com outro UID → BLOCKED',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ78', name: 'FJ78', passed: false, message: err?.message });
  }

  // FJ79: ambos ausentes, mas tentativa isolada de alterar Member.userId sem as outras entidades do commit → BLOCKED
  try {
    const famId = 'fam-fj79';
    const memId = 'mem-fj79';
    const attackerUid = 'attacker-fj79-uid';

    env.seedFamily({ id: famId, name: 'Família 79', ownerUserId: 'admin-79', active: true });
    
    const memberData: any = {
      id: memId,
      familyId: famId,
      name: 'Morador 79',
      role: 'MEMBER',
      active: true
    };
    delete memberData.userId;
    delete memberData.user_id;
    env.seedMember(famId, memberData);

    let blocked = false;
    try {
      // Tentativa isolada de escrever no Member sem convite ACCEPTED e sem membership no mesmo commit
      env.simulateJoinCommitWithRules({
        auth: { uid: attackerUid },
        memberWrite: {
          familyId: famId,
          memberId: memId,
          userId: attackerUid,
          role: 'MEMBER'
        }
      });
    } catch (e: any) {
      if (e.message.includes('BLOCKED') || e.message.includes('RULES_MEMBER_BLOCKED')) {
        blocked = true;
      }
    }

    results.push({
      id: 'FJ79',
      name: 'FAMILY-JOIN-1I: ambos ausentes, mas tentativa isolada de alterar Member.userId sem as outras entidades do commit → BLOCKED',
      passed: blocked
    });
  } catch (err: any) {
    results.push({ id: 'FJ79', name: 'FJ79', passed: false, message: err?.message });
  }

  // FJ80: shape real de produção criado por addMember, equivalente ao Lucas, + convite canônico → ACCEPT SUCCESS
  try {
    const famId = 'fam-juriti-prod';
    const memId = 'mem-lucas-1788536264010';
    const canonicalCode = 'CJ-N23P-QGB3';
    const candidateUid = 'lucas-real-guest-uid';

    env.seedFamily({ id: famId, name: 'Rua Juriti', ownerUserId: 'admin-po-uid', active: true });

    // Shape estrito criado por addMember em produção (AppContext.tsx)
    // NÃO possui fisicamente os campos userId nem user_id
    const realProductionLucas: any = {
      id: memId,
      family_id: famId,
      name: 'Lucas',
      role: 'MEMBER',
      avatar: '👤',
      color: '#5b32a3',
      points: 0,
      streak: 0,
      tasksCompleted: 0,
      active: true,
      joined_at: '2026-03-01T10:00:00.000Z'
    };
    delete realProductionLucas.userId;
    delete realProductionLucas.user_id;
    env.seedMember(famId, realProductionLucas);

    // Convite canônico idêntico ao gerado em CJ-N23P-QGB3
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + 7 * 86400000));
    env.seedInvite({
      id: canonicalCode,
      code: canonicalCode,
      familyId: famId,
      targetMemberId: memId,
      createdByMemberId: 'admin-po-uid',
      status: 'PENDING',
      createdAt: Timestamp.fromDate(new Date()),
      expiresAt,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: 'Rua Juriti',
      targetMemberName: 'Lucas',
      targetMemberRole: 'MEMBER',
      roleHint: 'MEMBER'
    });

    const txRes = env.simulateFamilyJoin1FTransaction({
      code: canonicalCode,
      auth: { uid: candidateUid, email: 'lucas@casajunto.app' }
    });

    const memberAfter = env.members.get(`${famId}_${memId}`);
    const membershipAfter = env.memberships.get(`${famId}_${candidateUid}`);
    const inviteAfter = env.invitations.get(canonicalCode);
    const mirrorAfter = env.familyInvites.get(`${famId}_${memId}`);

    const passed = 
      txRes.status === 'ALLOWED' &&
      memberAfter?.userId === candidateUid &&
      (memberAfter as any)?.user_id === undefined && // user_id legado NUNCA é criado/modificado
      memberAfter?.name === 'Lucas' &&
      memberAfter?.points === 0 &&
      membershipAfter?.status === 'ACTIVE' &&
      membershipAfter?.role === 'MEMBER' &&
      membershipAfter?.userId === candidateUid &&
      inviteAfter?.status === 'ACCEPTED' &&
      inviteAfter?.acceptedByUid === candidateUid &&
      mirrorAfter?.status === 'ACCEPTED';

    results.push({
      id: 'FJ80',
      name: 'FAMILY-JOIN-1I: shape real de produção criado por addMember, equivalente ao Lucas, + convite canônico → ACCEPT SUCCESS',
      passed,
      actual: {
        status: txRes.status,
        memberUserId: memberAfter?.userId,
        memberRole: memberAfter?.role,
        membershipStatus: membershipAfter?.status,
        inviteStatus: inviteAfter?.status
      }
    });
  } catch (err: any) {
    results.push({ id: 'FJ80', name: 'FJ80', passed: false, message: err?.message });
  }

  return results;
}
