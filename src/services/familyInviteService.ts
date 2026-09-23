/**
 * CasaJunto - Family Invite Service
 * FAMILY-JOIN-1: Existing Family Join & Member Account Linking
 *
 * Gerencia a emissão, reutilização, expiração, revogação e aceitação transacional
 * de convites vinculando contas Firebase Auth a moradores pré-existentes.
 */

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  runTransaction,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db } from '../infrastructure/firebase/firebase';
import { FamilyInvitation, InvitationStatus, FamilyMembership, Member, Family, UserRole } from '../types';

export interface InvitePreview {
  code: string;
  familyId: string;
  familyName: string;
  targetMemberId: string;
  targetMemberName: string;
  targetMemberRole: string;
  status: InvitationStatus;
  expiresAt: string;
  isExpired: boolean;
  isRevoked: boolean;
  isAccepted: boolean;
  isValid: boolean;
  isLegacyIncompatible?: boolean;
  legacyReason?: string;
}

export interface AcceptInviteResult {
  status: 'SUCCESS' | 'ALREADY_ACCEPTED';
  familyId: string;
  memberId: string;
}

export class FamilyInviteService {
  /**
   * Identifica se um convite foi gerado em versão anterior ou não canônica.
   * Classifica como LEGACY_INCOMPATIBLE se:
   * - expiresAt for string (ISO 8601 legado) em vez de Firestore Timestamp
   * - familyName ausente ou vazio
   * - targetMemberName ausente ou vazio
   * - targetMemberRole ausente ou vazio
   */
  static isLegacyInvite(invite: any): { isLegacy: boolean; reason?: string } {
    if (!invite) {
      return { isLegacy: false };
    }
    const legacyMsg = 'Este convite foi gerado em uma versão anterior do CasaJunto. Peça ao administrador da casa para gerar um novo convite.';
    
    // 1. expiresAt como STRING
    if (typeof invite.expiresAt === 'string') {
      return { isLegacy: true, reason: legacyMsg };
    }
    // 2. familyName ausente ou vazio
    if (!invite.familyName || typeof invite.familyName !== 'string' || !invite.familyName.trim()) {
      return { isLegacy: true, reason: legacyMsg };
    }
    // 3. targetMemberName ausente ou vazio
    if (!invite.targetMemberName || typeof invite.targetMemberName !== 'string' || !invite.targetMemberName.trim()) {
      return { isLegacy: true, reason: legacyMsg };
    }
    // 4. targetMemberRole ausente ou vazio
    if (!invite.targetMemberRole || typeof invite.targetMemberRole !== 'string' || !invite.targetMemberRole.trim()) {
      return { isLegacy: true, reason: legacyMsg };
    }
    // 5. expiresAt não é Timestamp
    const isTimestamp = (typeof invite.expiresAt?.toDate === 'function') || 
                        (typeof invite.expiresAt?.seconds === 'number' && typeof invite.expiresAt?.nanoseconds === 'number');
    if (!isTimestamp) {
      return { isLegacy: true, reason: legacyMsg };
    }

    return { isLegacy: false };
  }

  /**
   * Gera um código legível e sem ambiguidade (CJ-XXXX-YYYY).
   */
  static generateInviteCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclui 0, O, 1, I
    let part1 = '';
    let part2 = '';
    for (let i = 0; i < 4; i++) {
      part1 += chars.charAt(Math.floor(Math.random() * chars.length));
      part2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `CJ-${part1}-${part2}`;
  }

  /**
   * Normaliza o código digitado pelo usuário.
   */
  static normalizeInviteCode(rawCode: string): string {
    return rawCode.trim().toUpperCase();
  }

  /**
   * Determina se um convite está efetivamente expirado,
   * considerando request.time >= expiresAt independentemente do status persistido.
   * Suporta Firestore Timestamp canônico e legado string ISO.
   */
  static isInviteExpired(invite: { status: InvitationStatus; expiresAt: any }, referenceTime: Date = new Date()): boolean {
    if (invite.status === 'EXPIRED') return true;
    if (invite.status === 'PENDING') {
      if (!invite.expiresAt) return false;
      let expDate: Date;
      if (typeof invite.expiresAt?.toDate === 'function') {
        expDate = invite.expiresAt.toDate();
      } else if (invite.expiresAt instanceof Date) {
        expDate = invite.expiresAt;
      } else if (typeof invite.expiresAt === 'string') {
        expDate = new Date(invite.expiresAt);
      } else if (typeof invite.expiresAt?.seconds === 'number') {
        expDate = new Date(invite.expiresAt.seconds * 1000);
      } else {
        return false;
      }
      return expDate.getTime() <= referenceTime.getTime();
    }
    return false;
  }

  /**
   * FAMILY-JOIN-1G:
   * Valida se um convite individual atende rigorosamente a todos os critérios canônicos:
   * - status == 'PENDING'
   * - not expired
   * - isLegacyInvite(invite).isLegacy == false
   * - expiresAt is Firestore Timestamp
   * - familyId válido
   * - targetMemberId válido
   * - familyName presente e não vazio
   * - targetMemberName presente e não vazio
   * - targetMemberRole presente e não vazio
   * - code presente e não vazio
   */
  static isCanonicalInviteValid(invite: any, referenceTime: Date = new Date()): boolean {
    if (!invite) return false;
    if (invite.status !== 'PENDING') return false;
    if (this.isInviteExpired(invite, referenceTime)) return false;
    if (this.isLegacyInvite(invite).isLegacy) return false;

    // expiresAt deve ser Firestore Timestamp
    const isTimestamp = (typeof invite.expiresAt?.toDate === 'function') ||
      (typeof invite.expiresAt?.seconds === 'number' && typeof invite.expiresAt?.nanoseconds === 'number');
    if (!isTimestamp) return false;

    // IDs válidos
    if (!invite.familyId || typeof invite.familyId !== 'string' || !invite.familyId.trim()) return false;
    if (!invite.targetMemberId || typeof invite.targetMemberId !== 'string' || !invite.targetMemberId.trim()) return false;
    if (!invite.code || typeof invite.code !== 'string' || !invite.code.trim()) return false;

    // Snapshot de apresentação obrigatório
    if (!invite.familyName || typeof invite.familyName !== 'string' || !invite.familyName.trim()) return false;
    if (!invite.targetMemberName || typeof invite.targetMemberName !== 'string' || !invite.targetMemberName.trim()) return false;
    if (!invite.targetMemberRole || typeof invite.targetMemberRole !== 'string' || !invite.targetMemberRole.trim()) return false;

    return true;
  }

  /**
   * FAMILY-JOIN-1G:
   * Valida se o par Mirror e Root é completamente canônico, consistente e reutilizável.
   * Um convite SOMENTE pode ser reutilizado quando:
   * status == PENDING
   * AND not expired
   * AND isLegacyInvite(invite) == false
   * AND expiresAt is Firestore Timestamp
   * AND familyId válido
   * AND targetMemberId válido
   * AND familyName presente
   * AND targetMemberName presente
   * AND targetMemberRole presente
   * AND root/mirror consistentes
   * AND mirror.code == root.code
   * AND mirror.status == PENDING
   */
  static isReusableCanonicalInvite(
    mirrorInvite: any,
    rootInvite: any,
    referenceTime: Date = new Date()
  ): boolean {
    if (!this.isCanonicalInviteValid(mirrorInvite, referenceTime)) return false;
    if (!this.isCanonicalInviteValid(rootInvite, referenceTime)) return false;

    // Consistência bidirecional estrita
    if (mirrorInvite.code !== rootInvite.code) return false;
    if (mirrorInvite.familyId !== rootInvite.familyId) return false;
    if (mirrorInvite.targetMemberId !== rootInvite.targetMemberId) return false;
    if (mirrorInvite.status !== 'PENDING' || rootInvite.status !== 'PENDING') return false;

    return true;
  }

  /**
   * Obtém ou cria um convite ativo para um membro.
   * Regra Canônica FAMILY-JOIN-1G:
   * Reutiliza SOMENTE convites canônicos ativos e consistentes (root + mirror).
   * Convites legados (como CJ-T3S6-E2KT), expirados ou com mirror inconsistente
   * NÃO são reutilizados: o root legado PENDING é revogado e um NOVO convite
   * canônico com código diferente é gerado atomicamente.
   */
  static async getOrCreateActiveInvite(
    familyId: string,
    targetMemberId: string,
    createdByMemberId: string,
    callerRole?: UserRole | string
  ): Promise<FamilyInvitation> {
    if (callerRole && callerRole !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerar convites.');
    }
    const now = new Date();
    const mirrorRef = doc(db, 'families', familyId, 'invites', targetMemberId);
    let existingMirror: FamilyInvitation | null = null;
    let existingRoot: FamilyInvitation | null = null;
    
    try {
      const snap = await getDoc(mirrorRef);
      if (snap.exists()) {
        existingMirror = snap.data() as FamilyInvitation;
        if (existingMirror?.code) {
          const rootRef = doc(db, 'familyInvitations', existingMirror.code);
          const rootSnap = await getDoc(rootRef);
          if (rootSnap.exists()) {
            existingRoot = rootSnap.data() as FamilyInvitation;
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao verificar convite ativo existente:', err);
    }

    // Se for convite canônico 100% reutilizável e consistente:
    if (this.isReusableCanonicalInvite(existingMirror, existingRoot, now)) {
      return existingMirror!;
    }

    // Se existir convite anterior não reutilizável e com status PENDING:
    // marcar o root anterior como REVOKED de forma não destrutiva (NUNCA alterar ACCEPTED histórico)
    if (existingMirror?.code && existingMirror.status === 'PENDING') {
      try {
        const oldRootRef = doc(db, 'familyInvitations', existingMirror.code);
        const oldRootSnap = await getDoc(oldRootRef);
        if (oldRootSnap.exists() && oldRootSnap.data()?.status === 'PENDING') {
          await updateDoc(oldRootRef, {
            status: 'REVOKED',
            revokedReason: 'SUPERSEDED_BY_CANONICAL_INVITE',
            updatedAt: now.toISOString()
          });
        }
      } catch (e) {
        console.warn('Erro ao revogar root legado anterior:', e);
      }
    }

    // Obter dados não-autoritativos de apresentação (Admin tem permissão de leitura aqui)
    let familyName = 'CasaJunto';
    let targetMemberName = 'Morador';
    let targetMemberRole: any = 'MEMBER';
    try {
      const famSnap = await getDoc(doc(db, 'families', familyId));
      if (famSnap.exists()) {
        familyName = famSnap.data()?.name || familyName;
      }
      const memberSnap = await getDoc(doc(db, 'families', familyId, 'members', targetMemberId));
      if (memberSnap.exists()) {
        const mData = memberSnap.data();
        targetMemberName = mData?.name || targetMemberName;
        targetMemberRole = mData?.role || targetMemberRole;
      }
    } catch (e) {
      console.warn('Não foi possível carregar metadados para snapshot do convite:', e);
    }

    // Criar novo convite com código DIFERENTE de qualquer código anterior
    let code = this.generateInviteCode();
    while (existingMirror?.code && code === existingMirror.code) {
      code = this.generateInviteCode();
    }

    const expiresDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const createdAtTimestamp = Timestamp.fromDate(now);
    const expiresAtTimestamp = Timestamp.fromDate(expiresDate);

    const newInvite: FamilyInvitation = {
      id: code,
      code,
      familyId,
      targetMemberId,
      createdByMemberId,
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

    // Escrita atômica dupla e consistente via writeBatch:
    // 1. /families/{familyId}/invites/{targetMemberId} (mirror tenant)
    // 2. /familyInvitations/{code} (root lookup)
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', familyId, 'invites', targetMemberId), newInvite);
    batch.set(doc(db, 'familyInvitations', code), newInvite);
    await batch.commit();

    return newInvite;
  }

  /**
   * UX-INVITE-1: Regenera atomicamente o código de convite de um morador.
   * Regras Canônicas:
   * 1. Apenas ADMIN pode executar (defense in depth).
   * 2. O convite PENDING atual tem seu status atualizado para REVOKED com
   *    revokedReason: 'SUPERSEDED_BY_NEW_CODE'.
   * 3. Um novo convite com código exclusivo é gerado atomicamente (status PENDING,
   *    expiresAt como Firestore Timestamp para 7 dias, timestamps e snapshots canônicos).
   * 4. A substituição é estritamente atômica no root (/familyInvitations/{code}) e no mirror (/families/{id}/invites/{memberId}).
   * 5. Garante que no máximo 1 convite PENDING válido exista para o morador.
   */
  static async regenerateInviteCode(
    familyId: string,
    targetMemberId: string,
    createdByMemberId: string,
    callerRole?: UserRole | string
  ): Promise<FamilyInvitation> {
    if (callerRole && callerRole !== 'ADMIN') {
      throw new Error('Apenas administradores podem gerenciar convites.');
    }

    const now = new Date();
    const mirrorRef = doc(db, 'families', familyId, 'invites', targetMemberId);

    // Carregar metadados atualizados para snapshot seguro
    let familyName = 'CasaJunto';
    let targetMemberName = 'Morador';
    let targetMemberRole: any = 'MEMBER';
    try {
      const famSnap = await getDoc(doc(db, 'families', familyId));
      if (famSnap.exists()) {
        familyName = famSnap.data()?.name || familyName;
      }
      const memberSnap = await getDoc(doc(db, 'families', familyId, 'members', targetMemberId));
      if (memberSnap.exists()) {
        const mData = memberSnap.data();
        targetMemberName = mData?.name || targetMemberName;
        targetMemberRole = mData?.role || targetMemberRole;
      }
    } catch (e) {
      console.warn('Não foi possível carregar metadados para snapshot do convite:', e);
    }

    // Executar substituição atômica via runTransaction para garantia ACID e concorrência estrita
    return await runTransaction(db, async (transaction) => {
      const mirrorSnap = await transaction.get(mirrorRef);
      let oldCode: string | null = null;
      let existingRootSnap: any = null;

      if (mirrorSnap.exists()) {
        const mirrorData = mirrorSnap.data() as FamilyInvitation;
        if (mirrorData.status === 'ACCEPTED') {
          throw new Error('Convite já aceito não pode ser revogado ou substituído.');
        }
        if (mirrorData.code) {
          oldCode = mirrorData.code;
          const oldRootRef = doc(db, 'familyInvitations', oldCode);
          existingRootSnap = await transaction.get(oldRootRef);
        }
      }

      // Gerar novo código exclusivo diferente do anterior
      let newCode = this.generateInviteCode();
      while (oldCode && newCode === oldCode) {
        newCode = this.generateInviteCode();
      }

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
        familyName,
        targetMemberName,
        targetMemberRole,
        roleHint: targetMemberRole
      };

      // 1. Revogar root anterior de forma não-destrutiva se era PENDING
      if (oldCode && existingRootSnap?.exists()) {
        const oldRootData = existingRootSnap.data() as FamilyInvitation;
        if (oldRootData.status === 'PENDING') {
          const oldRootRef = doc(db, 'familyInvitations', oldCode);
          transaction.update(oldRootRef, {
            status: 'REVOKED',
            revokedReason: 'SUPERSEDED_BY_NEW_CODE',
            updatedAt: createdAtTimestamp
          });
        }
      }

      // 2. Criar novo root
      const newRootRef = doc(db, 'familyInvitations', newCode);
      transaction.set(newRootRef, newInvite);

      // 3. Atualizar mirror
      transaction.set(mirrorRef, newInvite);

      return newInvite;
    });
  }

  /**
   * Busca um convite pelo código e retorna o preview de validação para a UI.
   * FAMILY-JOIN-1D: Lê estritamente /familyInvitations/{code}.
   * NÃO tenta ler /families/{familyId} ou /members/{memberId} diretamente para não quebrar tenant isolation!
   */
  static async getInvitationPreview(rawCode: string): Promise<InvitePreview | null> {
    const code = this.normalizeInviteCode(rawCode);
    if (!code) return null;

    try {
      const inviteSnap = await getDoc(doc(db, 'familyInvitations', code));
      if (!inviteSnap.exists()) {
        return null;
      }

      const invite = inviteSnap.data() as FamilyInvitation;
      const now = new Date();
      const isExpired = this.isInviteExpired(invite, now);
      const isRevoked = invite.status === 'REVOKED';
      const isAccepted = invite.status === 'ACCEPTED';

      // Checar se é convite de versão legada ou estrutura incompatível
      const legacyCheck = this.isLegacyInvite(invite);
      if (legacyCheck.isLegacy) {
        return {
          code: invite.code || code,
          familyId: invite.familyId || '',
          familyName: invite.familyName || '',
          targetMemberId: invite.targetMemberId || '',
          targetMemberName: invite.targetMemberName || '',
          targetMemberRole: invite.targetMemberRole || 'MEMBER',
          status: invite.status || 'PENDING',
          expiresAt: typeof invite.expiresAt === 'string' ? invite.expiresAt : '',
          isExpired,
          isRevoked,
          isAccepted,
          isValid: false,
          isLegacyIncompatible: true,
          legacyReason: legacyCheck.reason
        };
      }

      // Convite canônico 1D: dados de apresentação vêm estritamente do snapshot seguro
      const familyName = invite.familyName;
      const targetMemberName = invite.targetMemberName;
      const targetMemberRole = invite.targetMemberRole || invite.roleHint || 'MEMBER';

      const isValid = invite.status === 'PENDING' && !isExpired;

      let expiresAtStr = '';
      if (typeof invite.expiresAt?.toDate === 'function') {
        expiresAtStr = invite.expiresAt.toDate().toISOString();
      } else if (invite.expiresAt instanceof Date) {
        expiresAtStr = invite.expiresAt.toISOString();
      } else if (typeof invite.expiresAt?.seconds === 'number') {
        expiresAtStr = new Date(invite.expiresAt.seconds * 1000).toISOString();
      }

      return {
        code: invite.code,
        familyId: invite.familyId,
        familyName,
        targetMemberId: invite.targetMemberId,
        targetMemberName,
        targetMemberRole,
        status: isExpired ? 'EXPIRED' : invite.status,
        expiresAt: expiresAtStr,
        isExpired,
        isRevoked,
        isAccepted,
        isValid,
        isLegacyIncompatible: false
      };
    } catch (err) {
      console.error('Erro ao buscar convite:', err);
      return null;
    }
  }

  /**
   * Revoga um convite PENDING existente.
   * Regra: PENDING -> REVOKED é permitido. ACCEPTED -> REVOKED é estritamente proibido.
   */
  static async revokeInvitation(
    familyId: string, 
    targetMemberId: string,
    callerRole?: UserRole | string
  ): Promise<void> {
    if (callerRole && callerRole !== 'ADMIN') {
      throw new Error('Apenas administradores podem revogar convites.');
    }
    const memberInviteRef = doc(db, 'families', familyId, 'invites', targetMemberId);
    const snap = await getDoc(memberInviteRef);

    if (!snap.exists()) {
      throw new Error('Convite não encontrado.');
    }

    const invite = snap.data() as FamilyInvitation;
    if (invite.status === 'ACCEPTED') {
      throw new Error('Convite já aceito não pode ser revogado.');
    }

    const nowIso = new Date().toISOString();
    const updatedData = {
      status: 'REVOKED' as InvitationStatus,
      updatedAt: nowIso
    };

    await updateDoc(memberInviteRef, updatedData);
    if (invite.code) {
      await updateDoc(doc(db, 'familyInvitations', invite.code), updatedData);
    }
  }

  /**
   * Transação atômica de aceitação de convite com garantia ACID (FAMILY-JOIN-1F):
   * 1. Valida o convite (status PENDING, canônico 1D, não expirado, não revogado).
   * 2. NÃO executa leituras prévias de /familyMemberships, /families nem /members.
   *    Preserva a privacidade multi-tenant estrita.
   * 3. A autoridade e validação profunda do Member (ativo, role, userId disponível)
   *    e da Membership (sem conflito, não REMOVED, role correspondente)
   *    são garantidas atomicamente no commit pelas Firestore Rules via getAfter().
   * 4. Efetua a transição atômica vinculando userId no Member existente e criando a membership.
   */
  static async acceptInvitation(
    rawCode: string,
    currentUser: { id: string; email?: string | null; displayName?: string | null }
  ): Promise<AcceptInviteResult> {
    const code = this.normalizeInviteCode(rawCode);
    if (!code) {
      throw new Error('Código do convite não informado.');
    }
    if (!currentUser || !currentUser.id) {
      throw new Error('Você precisa estar autenticado para entrar em uma casa.');
    }

    return await runTransaction(db, async (transaction) => {
      const now = new Date();
      const acceptedAtTimestamp = Timestamp.fromDate(now);
      const nowIso = now.toISOString();

      // 1. Leitura do convite por código (permitida para usuários autenticados)
      const inviteRef = doc(db, 'familyInvitations', code);
      const inviteSnap = await transaction.get(inviteRef);

      if (!inviteSnap.exists()) {
        throw new Error('Convite não encontrado. Verifique o código e tente novamente.');
      }

      const invite = inviteSnap.data() as FamilyInvitation;

      // 2. Validação canônica vs legado
      const legacyCheck = this.isLegacyInvite(invite);
      if (legacyCheck.isLegacy) {
        throw new Error(legacyCheck.reason || 'Este convite foi gerado em uma versão anterior do CasaJunto. Peça ao administrador da casa para gerar um novo convite.');
      }

      // 3. Idempotência: mesmo UID aceitando novamente
      if (invite.status === 'ACCEPTED' && invite.acceptedByUid === currentUser.id) {
        return {
          status: 'ALREADY_ACCEPTED' as const,
          familyId: invite.familyId,
          memberId: invite.targetMemberId
        };
      }

      // 4. Validações de integridade do convite
      if (invite.status === 'REVOKED') {
        throw new Error('Este convite foi revogado pelo administrador da casa.');
      }
      if (invite.status === 'ACCEPTED') {
        throw new Error('Este convite já foi utilizado por outra conta.');
      }
      if (this.isInviteExpired(invite, now)) {
        throw new Error('Este convite expirou. Solicite um novo convite ao administrador da casa.');
      }

      // 5. Escritas atômicas conjuntas (Zero pre-read de entidades protegidas)
      const membershipId = `${invite.familyId}_${currentUser.id}`;
      const membershipRef = doc(db, 'familyMemberships', membershipId);
      const memberInviteRef = doc(db, 'families', invite.familyId, 'invites', invite.targetMemberId);
      const memberRef = doc(db, 'families', invite.familyId, 'members', invite.targetMemberId);

      // (a) Atualiza convites para ACCEPTED
      transaction.update(inviteRef, {
        status: 'ACCEPTED',
        acceptedAt: acceptedAtTimestamp,
        acceptedByUid: currentUser.id
      });

      transaction.update(memberInviteRef, {
        status: 'ACCEPTED',
        acceptedAt: acceptedAtTimestamp,
        acceptedByUid: currentUser.id
      });

      // (b) Vincula userId canônico no Member existente (write-only)
      // IMPORTANTE: affectedKeys estritamente ['userId', 'email', 'updatedAt']
      // NUNCA cria Member novo, NUNCA toca em role, pontos ou histórico!
      transaction.update(memberRef, {
        userId: currentUser.id,
        email: currentUser.email || '',
        updatedAt: nowIso
      });

      // (c) Cria a Membership vinculando o memberId
      // O roleHint é apenas payload de apresentação; a Rule valida atomicamente contra Member.role
      const memberRole = invite.targetMemberRole || invite.roleHint || 'MEMBER';
      const familyName = invite.familyName;

      transaction.set(membershipRef, {
        id: membershipId,
        familyId: invite.familyId,
        familyName,
        userId: currentUser.id,
        memberId: invite.targetMemberId,
        role: memberRole,
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso
      });

      return {
        status: 'SUCCESS' as const,
        familyId: invite.familyId,
        memberId: invite.targetMemberId
      };
    });
  }
}
