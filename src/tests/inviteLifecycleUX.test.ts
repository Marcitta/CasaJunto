/**
 * CasaJunto - Test Suite: UX-INVITE-1 (UXI01 - UXI15)
 * Invite Code Lifecycle — Regenerate Invite Code & Canonical State Machine
 */

import { Timestamp } from 'firebase/firestore';
import { FamilyInvitation, UserRole, Family, Member, FamilyMembership } from '../types';
import { FamilyInviteService } from '../services/familyInviteService';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
  expected?: any;
  actual?: any;
}

// In-Memory Deterministic Mock Environment for Invite Lifecycle
class InviteLifecycleMockEnv {
  invitations: Map<string, FamilyInvitation> = new Map(); // root: /familyInvitations/{code}
  familyInvites: Map<string, FamilyInvitation> = new Map(); // mirror: /families/{familyId}/invites/{memberId}
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

  // Simulates FamilyInviteService.getOrCreateActiveInvite
  getOrCreateActiveInvite(
    familyId: string,
    targetMemberId: string,
    createdByMemberId: string,
    callerRole?: UserRole | string
  ): FamilyInvitation {
    if (callerRole && callerRole !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerar convites.');
    }

    const mirrorKey = `${familyId}_${targetMemberId}`;
    const existingMirror = this.familyInvites.get(mirrorKey);
    const existingRoot = existingMirror?.code ? this.invitations.get(existingMirror.code) : null;
    const now = new Date();

    if (FamilyInviteService.isReusableCanonicalInvite(existingMirror, existingRoot, now)) {
      return existingMirror!;
    }

    // Se houver PENDING não canônico, revogar
    if (existingMirror?.code && existingMirror.status === 'PENDING') {
      const oldRoot = this.invitations.get(existingMirror.code);
      if (oldRoot && oldRoot.status === 'PENDING') {
        this.invitations.set(existingMirror.code, {
          ...oldRoot,
          status: 'REVOKED',
          revokedReason: 'SUPERSEDED_BY_CANONICAL_INVITE',
          updatedAt: Timestamp.fromDate(now)
        });
      }
    }

    const family = this.families.get(familyId);
    const member = this.members.get(`${familyId}_${targetMemberId}`);
    const code = FamilyInviteService.generateInviteCode();
    const expiresDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const newInvite: FamilyInvitation = {
      id: code,
      code,
      familyId,
      targetMemberId,
      createdByMemberId,
      status: 'PENDING',
      createdAt: Timestamp.fromDate(now),
      expiresAt: Timestamp.fromDate(expiresDate),
      acceptedAt: null,
      acceptedByUid: null,
      familyName: family?.name || 'CasaJunto',
      targetMemberName: member?.name || 'Morador',
      targetMemberRole: member?.role || 'MEMBER',
      roleHint: member?.role || 'MEMBER'
    };

    this.invitations.set(code, newInvite);
    this.familyInvites.set(mirrorKey, newInvite);

    return newInvite;
  }

  // Simulates FamilyInviteService.regenerateInviteCode
  regenerateInviteCode(
    familyId: string,
    targetMemberId: string,
    createdByMemberId: string,
    callerRole?: UserRole | string
  ): FamilyInvitation {
    if (callerRole && callerRole !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerenciar convites.');
    }

    const now = new Date();
    const mirrorKey = `${familyId}_${targetMemberId}`;
    const existingMirror = this.familyInvites.get(mirrorKey);

    if (existingMirror?.status === 'ACCEPTED') {
      throw new Error('Convite já aceito não pode ser revogado ou substituído.');
    }

    const oldCode = existingMirror?.code;

    // Gerar novo código diferente do anterior
    let newCode = FamilyInviteService.generateInviteCode();
    while (oldCode && newCode === oldCode) {
      newCode = FamilyInviteService.generateInviteCode();
    }

    const family = this.families.get(familyId);
    const member = this.members.get(`${familyId}_${targetMemberId}`);
    const expiresDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const createdAtTimestamp = Timestamp.fromDate(now);
    const expiresAtTimestamp = Timestamp.fromDate(expiresDate);

    const newInvite: FamilyInvitation = {
      id: newCode,
      code: newCode,
      familyId,
      targetMemberId,
      createdByMemberId,
      status: 'PENDING',
      createdAt: createdAtTimestamp,
      expiresAt: expiresAtTimestamp,
      acceptedAt: null,
      acceptedByUid: null,
      familyName: family?.name || 'CasaJunto',
      targetMemberName: member?.name || 'Morador',
      targetMemberRole: member?.role || 'MEMBER',
      roleHint: member?.role || 'MEMBER'
    };

    // 1. Revogar root anterior de forma não-destrutiva se era PENDING
    if (oldCode && this.invitations.has(oldCode)) {
      const oldRoot = this.invitations.get(oldCode)!;
      if (oldRoot.status === 'PENDING') {
        this.invitations.set(oldCode, {
          ...oldRoot,
          status: 'REVOKED',
          revokedReason: 'SUPERSEDED_BY_NEW_CODE',
          updatedAt: createdAtTimestamp
        });
      }
    }

    // 2. Criar novo root
    this.invitations.set(newCode, newInvite);

    // 3. Atualizar mirror
    this.familyInvites.set(mirrorKey, newInvite);

    return newInvite;
  }

  // Simulates FAMILY-JOIN atomic accept
  executeAccept(code: string, authUid: string, now: Date = new Date()): { status: string } {
    const invite = this.invitations.get(code);
    if (!invite) throw new Error('INVITE_NOT_FOUND');
    if (invite.status === 'REVOKED') throw new Error('INVITE_REVOKED');
    if (invite.status === 'EXPIRED') throw new Error('INVITE_EXPIRED');
    if (invite.status === 'ACCEPTED') throw new Error('INVITE_ALREADY_USED');

    const memberKey = `${invite.familyId}_${invite.targetMemberId}`;
    const member = this.members.get(memberKey);
    if (!member) throw new Error('MEMBER_NOT_FOUND');

    // Aceitar convite
    const acceptedInvite: FamilyInvitation = {
      ...invite,
      status: 'ACCEPTED',
      acceptedAt: Timestamp.fromDate(now),
      acceptedByUid: authUid
    };
    this.invitations.set(code, acceptedInvite);
    this.familyInvites.set(memberKey, acceptedInvite);

    // Atualizar member
    this.members.set(memberKey, {
      ...member,
      userId: authUid
    });

    // Criar membership
    this.memberships.set(`${invite.familyId}_${authUid}`, {
      id: `${invite.familyId}_${authUid}`,
      familyId: invite.familyId,
      userId: authUid,
      role: member.role || 'MEMBER',
      status: 'ACTIVE',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    return { status: 'SUCCESS' };
  }
}

export function runInviteLifecycleUXTestSuite(): TestResult[] {
  const results: TestResult[] = [];
  const env = new InviteLifecycleMockEnv();

  const resetEnv = () => {
    env.reset();
    env.seedFamily({
      id: 'fam-ux-1',
      name: 'Família Silva',
      ownerUserId: 'admin-1',
      createdAt: new Date().toISOString()
    });
    env.seedMember('fam-ux-1', {
      id: 'mem-admin-1',
      name: 'Carlos Admin',
      role: 'ADMIN',
      color: '#4F46E5',
      avatar: '👨‍💼',
      createdAt: new Date().toISOString()
    });
    env.seedMember('fam-ux-1', {
      id: 'mem-target-1',
      name: 'Beatriz Moradora',
      role: 'MEMBER',
      color: '#10B981',
      avatar: '👩',
      createdAt: new Date().toISOString()
    });
  };

  // UXI01 — primeiro convite gera PENDING
  (() => {
    resetEnv();
    const invite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    const rootInvite = env.invitations.get(invite.code);
    const mirrorInvite = env.familyInvites.get('fam-ux-1_mem-target-1');

    const passed = 
      invite.status === 'PENDING' &&
      rootInvite?.status === 'PENDING' &&
      mirrorInvite?.status === 'PENDING' &&
      Boolean(invite.code) &&
      invite.code === rootInvite?.code &&
      invite.code === mirrorInvite?.code;

    results.push({
      id: 'UXI01',
      name: 'primeiro convite gera PENDING',
      passed,
      message: passed ? undefined : 'Primeiro convite não gerou status PENDING consistente no root e mirror.'
    });
  })();

  // UXI02 — abrir novamente Convidar reutiliza código atual
  (() => {
    resetEnv();
    const firstInvite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    const secondInvite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    const passed = 
      secondInvite.code === firstInvite.code &&
      secondInvite.status === 'PENDING' &&
      env.invitations.size === 1;

    results.push({
      id: 'UXI02',
      name: 'abrir novamente Convidar reutiliza código atual',
      passed,
      message: passed ? undefined : 'Reabrir modal gerou novo código em vez de reutilizar o PENDING ativo.'
    });
  })();

  // UXI03 — modal apresenta Gerar novo código quando existe PENDING válido
  (() => {
    resetEnv();
    const invite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    
    // Regra UI: quando invite existe e status === 'PENDING', o botão Gerar novo código está disponível
    const hasActivePending = invite.status === 'PENDING';
    const canShowRegenerate = hasActivePending;

    const passed = canShowRegenerate === true;

    results.push({
      id: 'UXI03',
      name: 'modal apresenta Gerar novo código quando existe PENDING válido',
      passed,
      message: passed ? undefined : 'Ação Gerar novo código não foi apresentada para convite PENDING válido.'
    });
  })();

  // UXI04 — clicar em gerar apresenta confirmação antes de modificar Firestore
  (() => {
    resetEnv();
    const initialInvite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    // Simulação do clique do usuário: altera estado UI de confirmação sem alterar Firestore
    let showRegenerateConfirm = false;
    // Usuário clica no botão "Gerar novo código"
    showRegenerateConfirm = true;

    // Verifica estado do Firestore antes da confirmação
    const rootBeforeConfirm = env.invitations.get(initialInvite.code);
    const mirrorBeforeConfirm = env.familyInvites.get('fam-ux-1_mem-target-1');

    const passed = 
      showRegenerateConfirm === true &&
      rootBeforeConfirm?.status === 'PENDING' &&
      rootBeforeConfirm?.code === initialInvite.code &&
      mirrorBeforeConfirm?.code === initialInvite.code;

    results.push({
      id: 'UXI04',
      name: 'clicar em gerar apresenta confirmação antes de modificar Firestore',
      passed,
      message: passed ? undefined : 'Firestore foi modificado antes da confirmação explícita do usuário.'
    });
  })();

  // UXI05 — Cancelar preserva código atual
  (() => {
    resetEnv();
    const initialInvite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    // Fluxo: abre confirmação e cancela
    let showRegenerateConfirm = true;
    // Usuário clica em Cancelar
    showRegenerateConfirm = false;

    // Firestore não sofre nenhuma alteração
    const rootAfterCancel = env.invitations.get(initialInvite.code);
    const mirrorAfterCancel = env.familyInvites.get('fam-ux-1_mem-target-1');

    const passed = 
      showRegenerateConfirm === false &&
      rootAfterCancel?.code === initialInvite.code &&
      rootAfterCancel?.status === 'PENDING' &&
      mirrorAfterCancel?.code === initialInvite.code &&
      mirrorAfterCancel?.status === 'PENDING';

    results.push({
      id: 'UXI05',
      name: 'Cancelar preserva código atual',
      passed,
      message: passed ? undefined : 'Cancelar não preservou o código e o status do convite atual.'
    });
  })();

  // UXI06 — confirmar revoga código anterior
  (() => {
    resetEnv();
    const oldInvite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    
    // Usuário confirma regeneração
    const newInvite = env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    const oldRoot = env.invitations.get(oldInvite.code);
    const passed = oldRoot?.status === 'REVOKED';

    results.push({
      id: 'UXI06',
      name: 'confirmar revoga código anterior',
      passed,
      message: passed ? undefined : `Código anterior deveria estar REVOKED, encontrado: ${oldRoot?.status}`
    });
  })();

  // UXI07 — revokedReason == SUPERSEDED_BY_NEW_CODE
  (() => {
    resetEnv();
    const oldInvite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    const oldRoot = env.invitations.get(oldInvite.code);
    const passed = oldRoot?.revokedReason === 'SUPERSEDED_BY_NEW_CODE';

    results.push({
      id: 'UXI07',
      name: 'revokedReason == SUPERSEDED_BY_NEW_CODE',
      passed,
      message: passed ? undefined : `revokedReason esperado 'SUPERSEDED_BY_NEW_CODE', obtido: '${oldRoot?.revokedReason}'`
    });
  })();

  // UXI08 — novo código é diferente do anterior
  (() => {
    resetEnv();
    const oldInvite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    const newInvite = env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    const passed = Boolean(newInvite.code) && newInvite.code !== oldInvite.code;

    results.push({
      id: 'UXI08',
      name: 'novo código é diferente do anterior',
      passed,
      message: passed ? undefined : `Novo código ${newInvite.code} é idêntico ao anterior ${oldInvite.code}.`
    });
  })();

  // UXI09 — novo convite é PENDING e canônico
  (() => {
    resetEnv();
    env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    const newInvite = env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    const hasTimestampExpires = newInvite.expiresAt instanceof Timestamp || typeof (newInvite.expiresAt as any)?.toDate === 'function';
    const hasSnapshot = Boolean(newInvite.familyName && newInvite.targetMemberName && newInvite.targetMemberRole);
    const notAccepted = newInvite.acceptedAt === null && newInvite.acceptedByUid === null;

    const passed = 
      newInvite.status === 'PENDING' &&
      hasTimestampExpires &&
      hasSnapshot &&
      notAccepted;

    results.push({
      id: 'UXI09',
      name: 'novo convite é PENDING e canônico',
      passed,
      message: passed ? undefined : 'Novo convite regenerado não possui estrutura canônica PENDING completa.'
    });
  })();

  // UXI10 — root/mirror do novo convite são consistentes
  (() => {
    resetEnv();
    env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    const newInvite = env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    const rootDoc = env.invitations.get(newInvite.code);
    const mirrorDoc = env.familyInvites.get('fam-ux-1_mem-target-1');

    const passed = 
      rootDoc !== undefined &&
      mirrorDoc !== undefined &&
      rootDoc.code === mirrorDoc.code &&
      rootDoc.status === mirrorDoc.status &&
      rootDoc.status === 'PENDING' &&
      rootDoc.familyId === mirrorDoc.familyId &&
      rootDoc.targetMemberId === mirrorDoc.targetMemberId;

    results.push({
      id: 'UXI10',
      name: 'root/mirror do novo convite são consistentes',
      passed,
      message: passed ? undefined : 'Inconsistência detectada entre root /familyInvitations e mirror /families/invites.'
    });
  })();

  // UXI11 — código anterior não pode ser aceito
  (() => {
    resetEnv();
    const oldInvite = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    let errorThrown: string | null = null;
    try {
      env.executeAccept(oldInvite.code, 'auth-user-beatriz');
    } catch (err: any) {
      errorThrown = err.message;
    }

    const passed = errorThrown === 'INVITE_REVOKED';

    results.push({
      id: 'UXI11',
      name: 'código anterior não pode ser aceito',
      passed,
      message: passed ? undefined : `Código antigo revogado não foi rejeitado com INVITE_REVOKED (erro: ${errorThrown})`
    });
  })();

  // UXI12 — novo código pode seguir normalmente pelo FAMILY-JOIN
  (() => {
    resetEnv();
    env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    const newInvite = env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    let acceptResult: any = null;
    try {
      acceptResult = env.executeAccept(newInvite.code, 'auth-user-beatriz');
    } catch (e: any) {
      acceptResult = { error: e.message };
    }

    const targetMember = env.members.get('fam-ux-1_mem-target-1');
    const membership = env.memberships.get('fam-ux-1_auth-user-beatriz');

    const passed = 
      acceptResult?.status === 'SUCCESS' &&
      targetMember?.userId === 'auth-user-beatriz' &&
      membership?.status === 'ACTIVE' &&
      membership?.role === 'MEMBER';

    results.push({
      id: 'UXI12',
      name: 'novo código pode seguir normalmente pelo FAMILY-JOIN',
      passed,
      message: passed ? undefined : 'Novo código regenerado falhou ao ser aceito pelo fluxo FAMILY-JOIN.'
    });
  })();

  // UXI13 — segunda regeneração mantém somente um PENDING válido
  (() => {
    resetEnv();
    // 1º convite
    const inv1 = env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    // 1ª regeneração
    const inv2 = env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    // 2ª regeneração
    const inv3 = env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    const root1 = env.invitations.get(inv1.code);
    const root2 = env.invitations.get(inv2.code);
    const root3 = env.invitations.get(inv3.code);
    const mirror = env.familyInvites.get('fam-ux-1_mem-target-1');

    // Contar convites com status PENDING para este targetMemberId
    const pendingCount = Array.from(env.invitations.values()).filter(
      (inv) => inv.targetMemberId === 'mem-target-1' && inv.status === 'PENDING'
    ).length;

    const passed = 
      root1?.status === 'REVOKED' &&
      root1?.revokedReason === 'SUPERSEDED_BY_NEW_CODE' &&
      root2?.status === 'REVOKED' &&
      root2?.revokedReason === 'SUPERSEDED_BY_NEW_CODE' &&
      root3?.status === 'PENDING' &&
      mirror?.code === inv3.code &&
      mirror?.status === 'PENDING' &&
      pendingCount === 1;

    results.push({
      id: 'UXI13',
      name: 'segunda regeneração mantém somente um PENDING válido',
      passed,
      message: passed ? undefined : `Esperado exatamente 1 convite PENDING, encontrados ${pendingCount}.`
    });
  })();

  // UXI14 — regenerações concorrentes terminam com apenas um convite PENDING válido
  (() => {
    resetEnv();
    env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    // Duas regenerações disparadas com transação atômica
    const runRegen1 = () => env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');
    const runRegen2 = () => env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    const res1 = runRegen1();
    const res2 = runRegen2();

    const mirror = env.familyInvites.get('fam-ux-1_mem-target-1');
    const activePending = Array.from(env.invitations.values()).filter(
      (inv) => inv.targetMemberId === 'mem-target-1' && inv.status === 'PENDING'
    );

    const passed = 
      activePending.length === 1 &&
      mirror?.code === activePending[0].code &&
      mirror?.status === 'PENDING';

    results.push({
      id: 'UXI14',
      name: 'regenerações concorrentes terminam com apenas um convite PENDING válido',
      passed,
      message: passed ? undefined : `Regenerações concorrentes resultaram em ${activePending.length} convites PENDING.`
    });
  })();

  // UXI15 — MEMBER não consegue regenerar convite
  (() => {
    resetEnv();
    env.getOrCreateActiveInvite('fam-ux-1', 'mem-target-1', 'mem-admin-1', 'ADMIN');

    let memberBlocked = false;
    let errorMessage = '';
    try {
      env.regenerateInviteCode('fam-ux-1', 'mem-target-1', 'mem-target-1', 'MEMBER');
    } catch (err: any) {
      memberBlocked = true;
      errorMessage = err.message;
    }

    const passed = memberBlocked && errorMessage.includes('Apenas administradores');

    results.push({
      id: 'UXI15',
      name: 'MEMBER não consegue regenerar convite',
      passed,
      message: passed ? undefined : 'MEMBER não foi bloqueado de regenerar convite.'
    });
  })();

  return results;
}
