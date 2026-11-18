/**
 * CASA JUNTO — B.5.5-PRE-PILOT-G1 (BLOCO C)
 * Ferramenta Estritamente Read-Only de Auditoria Diagnóstica de familyMemberships.
 *
 * GARANTIAS DE SEGURANÇA:
 * 1. ZERO mutações: não executa set, update, delete, create, batch ou transaction.
 * 2. FAIL-CLOSED no banco: exige projectId e databaseId explícitos, rejeitando terminantemente "(default)".
 * 3. Proteção contra acesso remoto acidental: fora do Emulator, bloqueia execução a menos que
 *    allowRemoteReadOnly === true e authorizedReadOnlyTicket seja explicitamente informado.
 * 4. Zero exposição de PII/tokens/credenciais no relatório ou logs (apenas hashes curtos SHA-256).
 */

import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

export type MembershipAnomalyCategory =
  | 'MISSING_OR_DIVERGENT_FAMILY_ID'
  | 'MISSING_OR_DIVERGENT_USER_ID'
  | 'MISSING_OR_INVALID_STATUS'
  | 'ADMIN_NON_ACTIVE_STATUS'
  | 'MEMBER_REVOKED_OR_REMOVED'
  | 'EXPLICIT_ACTIVE_FALSE'
  | 'INCOMPATIBLE_DOC_ID'
  | 'ORPHAN_MEMBERSHIP'
  | 'POSSIBLE_DUPLICATE_MEMBERSHIP'
  | 'FAMILY_MEMBERS_INCOMPATIBILITY';

export const ALL_MEMBERSHIP_ANOMALY_CATEGORIES: readonly MembershipAnomalyCategory[] = [
  'MISSING_OR_DIVERGENT_FAMILY_ID',
  'MISSING_OR_DIVERGENT_USER_ID',
  'MISSING_OR_INVALID_STATUS',
  'ADMIN_NON_ACTIVE_STATUS',
  'MEMBER_REVOKED_OR_REMOVED',
  'EXPLICIT_ACTIVE_FALSE',
  'INCOMPATIBLE_DOC_ID',
  'ORPHAN_MEMBERSHIP',
  'POSSIBLE_DUPLICATE_MEMBERSHIP',
  'FAMILY_MEMBERS_INCOMPATIBILITY'
] as const;

export const CANONICAL_DATABASE_ID = 'ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c';
const KNOWN_VALID_STATUSES = new Set(['ACTIVE', 'PENDING', 'INVITED', 'REVOKED', 'REMOVED']);

export interface SyntheticMembershipRecord {
  docId: string;
  data: Record<string, unknown>;
}

export interface SyntheticFamilyRecord {
  familyId: string;
  data: Record<string, unknown>;
  members?: Array<{
    memberId: string;
    data: Record<string, unknown>;
  }>;
}

export interface SyntheticAuditDataset {
  memberships: SyntheticMembershipRecord[];
  families: SyntheticFamilyRecord[];
}

export interface AuditTargetConfig {
  projectId: string;
  databaseId: string;
  /** Em produção/remoto exige autorização explícita; em emulador/sintético é dispensado. */
  allowRemoteReadOnly?: boolean;
  authorizedReadOnlyTicket?: string;
}

export interface AnonymizedMembershipFinding {
  docRefHash: string;
  categories: MembershipAnomalyCategory[];
  wouldBeAllowedUnderStrictRules: boolean;
  roleSnapshot: string;
  statusSnapshot: string;
  activeFlagSnapshot: string;
}

export interface MembershipAuditReport {
  generatedAt: string;
  mode: 'synthetic' | 'emulator' | 'authorized-readonly';
  projectId: string;
  databaseId: string;
  readOnlyVerified: true;
  totalMembershipsScanned: number;
  totalFamiliesScanned: number;
  totalFamilyMembersScanned: number;
  canonicalActiveCount: number;
  canonicalInactiveValidCount: number;
  blockedUnderStrictRulesCount: number;
  nonCompliantCount: number;
  categoryCounts: Record<MembershipAnomalyCategory, number>;
  findings: AnonymizedMembershipFinding[];
}

export class MembershipAuditError extends Error {
  public readonly code:
    | 'INVALID_TARGET_CONFIG'
    | 'DEFAULT_DATABASE_FORBIDDEN'
    | 'REMOTE_READ_NOT_AUTHORIZED';

  constructor(
    code: 'INVALID_TARGET_CONFIG' | 'DEFAULT_DATABASE_FORBIDDEN' | 'REMOTE_READ_NOT_AUTHORIZED',
    message: string
  ) {
    super(message);
    this.name = 'MembershipAuditError';
    this.code = code;
  }
}

function anonymizeId(rawId: string): string {
  return createHash('sha256').update(rawId).digest('hex').slice(0, 12);
}

function asNonEmptyString(val: unknown): string | null {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;
}

/**
 * Avalia estritamente se o documento atende a função hasValidActiveMembership(familyId) das Firestore Rules.
 */
export function passesStrictMembershipRules(
  docId: string,
  data: Record<string, unknown>
): boolean {
  const familyId = asNonEmptyString(data.familyId);
  const userId = asNonEmptyString(data.userId);
  const status = asNonEmptyString(data.status);
  const role = asNonEmptyString(data.role);

  if (!familyId || !userId || status !== 'ACTIVE' || !role) {
    return false;
  }

  if (docId !== `${familyId}_${userId}`) {
    return false;
  }

  if ('active' in data && data.active !== true) {
    return false;
  }

  return true;
}

export function validateAuditTargetConfig(config: AuditTargetConfig): {
  projectId: string;
  databaseId: string;
} {
  const projectId = asNonEmptyString(config?.projectId);
  const databaseId = asNonEmptyString(config?.databaseId);

  if (!projectId) {
    throw new MembershipAuditError(
      'INVALID_TARGET_CONFIG',
      'projectId explícito e não-vazio é obrigatório para a auditoria read-only.'
    );
  }

  if (!databaseId) {
    throw new MembershipAuditError(
      'INVALID_TARGET_CONFIG',
      'databaseId explícito e não-vazio é obrigatório para a auditoria read-only.'
    );
  }

  const normalizedDb = databaseId.toLowerCase();
  if (normalizedDb === '(default)' || normalizedDb === 'default') {
    throw new MembershipAuditError(
      'DEFAULT_DATABASE_FORBIDDEN',
      `Banco "${databaseId}" é proibido. Utilize explicitamente um banco nomeado (ex.: ${CANONICAL_DATABASE_ID}).`
    );
  }

  return { projectId, databaseId };
}

function createEmptyCategoryCounts(): Record<MembershipAnomalyCategory, number> {
  return {
    MISSING_OR_DIVERGENT_FAMILY_ID: 0,
    MISSING_OR_DIVERGENT_USER_ID: 0,
    MISSING_OR_INVALID_STATUS: 0,
    ADMIN_NON_ACTIVE_STATUS: 0,
    MEMBER_REVOKED_OR_REMOVED: 0,
    EXPLICIT_ACTIVE_FALSE: 0,
    INCOMPATIBLE_DOC_ID: 0,
    ORPHAN_MEMBERSHIP: 0,
    POSSIBLE_DUPLICATE_MEMBERSHIP: 0,
    FAMILY_MEMBERS_INCOMPATIBILITY: 0
  };
}

export class MembershipAuditTool {
  /**
   * Analisa um conjunto de dados em memória (sintético ou coletado em modo estritamente read-only).
   */
  public static auditDataset(params: {
    mode: 'synthetic' | 'emulator' | 'authorized-readonly';
    target: AuditTargetConfig;
    dataset: SyntheticAuditDataset;
  }): MembershipAuditReport {
    const { projectId, databaseId } = validateAuditTargetConfig(params.target);
    const { memberships, families } = params.dataset;

    const familySet = new Set<string>();
    const familyMemberMaps: Record<string, Record<string, Record<string, unknown>>> = {};
    const pairOccurrences: Record<string, number> = {};
    const canonicalActivePairSet = new Set<string>();
    let totalFamilyMembersScanned = 0;

    for (const fam of families) {
      familySet.add(fam.familyId);
      const mMap: Record<string, Record<string, unknown>> = {};
      for (const mbr of fam.members || []) {
        mMap[mbr.memberId] = mbr.data || {};
        totalFamilyMembersScanned++;
      }
      familyMemberMaps[fam.familyId] = mMap;
    }

    // Pré-contagem de pares lógicos (familyId, userId) para detecção de duplicidades
    for (const rec of memberships) {
      const data = rec.data || {};
      const fId = asNonEmptyString(data.familyId) || asNonEmptyString(data.family_id);
      const uId = asNonEmptyString(data.userId) || asNonEmptyString(data.user_id);
      if (fId && uId) {
        const pairKey = `${fId}::${uId}`;
        pairOccurrences[pairKey] = (pairOccurrences[pairKey] || 0) + 1;
      }
    }

    const categoryCounts = createEmptyCategoryCounts();
    const findings: AnonymizedMembershipFinding[] = [];

    let canonicalActiveCount = 0;
    let canonicalInactiveValidCount = 0;
    let blockedUnderStrictRulesCount = 0;
    let nonCompliantCount = 0;

    for (const rec of memberships) {
      const data = rec.data || {};
      const categories = new Set<MembershipAnomalyCategory>();

      const familyId = asNonEmptyString(data.familyId);
      const legacyFamilyId = asNonEmptyString(data.family_id);
      const effectiveFamilyId = familyId || legacyFamilyId;

      const userId = asNonEmptyString(data.userId);
      const legacyUserId = asNonEmptyString(data.user_id);
      const effectiveUserId = userId || legacyUserId;

      const role = asNonEmptyString(data.role) || 'MISSING';
      const status = asNonEmptyString(data.status);
      const hasExplicitActiveFalse = 'active' in data && data.active === false;
      const hasInvalidActiveNonBool = 'active' in data && typeof data.active !== 'boolean';

      // 1. MISSING_OR_DIVERGENT_FAMILY_ID
      if (!familyId) {
        categories.add('MISSING_OR_DIVERGENT_FAMILY_ID');
      } else if (legacyFamilyId && legacyFamilyId !== familyId) {
        categories.add('MISSING_OR_DIVERGENT_FAMILY_ID');
      }

      // 2. MISSING_OR_DIVERGENT_USER_ID
      if (!userId) {
        categories.add('MISSING_OR_DIVERGENT_USER_ID');
      } else if (legacyUserId && legacyUserId !== userId) {
        categories.add('MISSING_OR_DIVERGENT_USER_ID');
      }

      // 7. INCOMPATIBLE_DOC_ID (checa padrão ${familyId}_${userId} e divergência entre ID e payload)
      if (!effectiveFamilyId || !effectiveUserId) {
        categories.add('INCOMPATIBLE_DOC_ID');
      } else {
        const expectedDocId = `${effectiveFamilyId}_${effectiveUserId}`;
        if (rec.docId !== expectedDocId) {
          categories.add('INCOMPATIBLE_DOC_ID');
          // Se o docId segue padrão prefixado com outro sufixo/prefixo, marca também divergência se campos baterem errado
          const splitIdx = rec.docId.indexOf('_');
          if (splitIdx > 0) {
            const docPrefixFam = rec.docId.slice(0, splitIdx);
            const docSuffixUid = rec.docId.slice(splitIdx + 1);
            if (familyId && docPrefixFam !== familyId && docSuffixUid === userId) {
              categories.add('MISSING_OR_DIVERGENT_FAMILY_ID');
            }
            if (userId && docSuffixUid !== userId && docPrefixFam === familyId) {
              categories.add('MISSING_OR_DIVERGENT_USER_ID');
            }
          }
        }
      }

      // 3. MISSING_OR_INVALID_STATUS
      if (!status || !KNOWN_VALID_STATUSES.has(status)) {
        categories.add('MISSING_OR_INVALID_STATUS');
      }

      // 6. EXPLICIT_ACTIVE_FALSE
      if (hasExplicitActiveFalse || hasInvalidActiveNonBool) {
        categories.add('EXPLICIT_ACTIVE_FALSE');
      }

      // 4. ADMIN_NON_ACTIVE_STATUS
      if (role === 'ADMIN' && (status !== 'ACTIVE' || hasExplicitActiveFalse)) {
        categories.add('ADMIN_NON_ACTIVE_STATUS');
      }

      // 5. MEMBER_REVOKED_OR_REMOVED
      if (role !== 'ADMIN' && (status === 'REVOKED' || status === 'REMOVED')) {
        categories.add('MEMBER_REVOKED_OR_REMOVED');
      }

      // 8. ORPHAN_MEMBERSHIP
      if (!effectiveFamilyId || !familySet.has(effectiveFamilyId)) {
        categories.add('ORPHAN_MEMBERSHIP');
      }

      // 9. POSSIBLE_DUPLICATE_MEMBERSHIP
      if (effectiveFamilyId && effectiveUserId) {
        const pairKey = `${effectiveFamilyId}::${effectiveUserId}`;
        if ((pairOccurrences[pairKey] || 0) > 1) {
          categories.add('POSSIBLE_DUPLICATE_MEMBERSHIP');
        }
      }

      // 10. FAMILY_MEMBERS_INCOMPATIBILITY (membership -> families/{familyId}/members)
      const memberIdRef = asNonEmptyString(data.memberId) || asNonEmptyString(data.member_id);
      if (effectiveFamilyId && familySet.has(effectiveFamilyId)) {
        const famMembers = familyMemberMaps[effectiveFamilyId];
        if (status === 'ACTIVE' && !hasExplicitActiveFalse) {
          if (!memberIdRef) {
            categories.add('FAMILY_MEMBERS_INCOMPATIBILITY');
          } else {
            const mDoc = famMembers?.[memberIdRef];
            if (!mDoc) {
              categories.add('FAMILY_MEMBERS_INCOMPATIBILITY');
            } else {
              const mRole = asNonEmptyString(mDoc.role);
              const mUid = asNonEmptyString(mDoc.userId) || asNonEmptyString(mDoc.user_id);
              const mActive = 'active' in mDoc ? mDoc.active === true : true;
              if (
                (mRole && mRole !== role) ||
                (effectiveUserId && mUid && mUid !== effectiveUserId) ||
                !mActive
              ) {
                categories.add('FAMILY_MEMBERS_INCOMPATIBILITY');
              }
            }
          }
        }
      }

      const strictlyAllowed = passesStrictMembershipRules(rec.docId, data);
      if (strictlyAllowed) {
        canonicalActiveCount++;
        if (familyId && userId) {
          canonicalActivePairSet.add(`${familyId}::${userId}`);
        }
      } else {
        blockedUnderStrictRulesCount++;
      }

      // Avaliar se é um vínculo inativo canônico legítimo (REVOKED / REMOVED / PENDING / INVITED sem erro estrutural)
      const structuralCategories = Array.from(categories).filter(
        c => c !== 'MEMBER_REVOKED_OR_REMOVED' && c !== 'ADMIN_NON_ACTIVE_STATUS' && c !== 'EXPLICIT_ACTIVE_FALSE'
      );
      const isCleanInactiveState =
        !strictlyAllowed &&
        structuralCategories.length === 0 &&
        status !== null &&
        status !== 'ACTIVE' &&
        KNOWN_VALID_STATUSES.has(status);

      if (isCleanInactiveState && !categories.has('ADMIN_NON_ACTIVE_STATUS') && !categories.has('EXPLICIT_ACTIVE_FALSE')) {
        // Estado inativo canônico (ex: membro removido/revogado mantendo registro para histórico)
        // Ainda contabilizamos nas métricas de categoria caso aplicável, mas distinguimos de corrupção estrutural
        canonicalInactiveValidCount++;
      }

      if (categories.size > 0) {
        if (!isCleanInactiveState || categories.has('MEMBER_REVOKED_OR_REMOVED') || categories.has('ADMIN_NON_ACTIVE_STATUS') || categories.has('EXPLICIT_ACTIVE_FALSE')) {
          nonCompliantCount++;
        }
        for (const cat of categories) {
          categoryCounts[cat]++;
        }
        findings.push({
          docRefHash: `mem_${anonymizeId(rec.docId)}`,
          categories: Array.from(categories),
          wouldBeAllowedUnderStrictRules: strictlyAllowed,
          roleSnapshot: role,
          statusSnapshot: status || 'MISSING',
          activeFlagSnapshot:
            !('active' in data)
              ? 'ABSENT'
              : typeof data.active === 'boolean'
                ? String(data.active)
                : `INVALID_${typeof data.active}`
        });
      }
    }

    // 10b. FAMILY_MEMBERS_INCOMPATIBILITY reversa:
    // Member ativo vinculado a userId em families/{familyId}/members sem familyMemberships/{familyId}_{userId} ativo canônico
    for (const fam of families) {
      for (const mbr of fam.members || []) {
        const mData = mbr.data || {};
        const mUid = asNonEmptyString(mData.userId) || asNonEmptyString(mData.user_id);
        const mActive = 'active' in mData ? mData.active === true : true;
        if (mUid && mActive && !canonicalActivePairSet.has(`${fam.familyId}::${mUid}`)) {
          categoryCounts.FAMILY_MEMBERS_INCOMPATIBILITY++;
          nonCompliantCount++;
          findings.push({
            docRefHash: `mbr_${anonymizeId(`${fam.familyId}/${mbr.memberId}`)}`,
            categories: ['FAMILY_MEMBERS_INCOMPATIBILITY'],
            wouldBeAllowedUnderStrictRules: false,
            roleSnapshot: asNonEmptyString(mData.role) || 'MISSING',
            statusSnapshot: 'MISSING_CANONICAL_MEMBERSHIP',
            activeFlagSnapshot: String(mActive)
          });
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      mode: params.mode,
      projectId,
      databaseId,
      readOnlyVerified: true,
      totalMembershipsScanned: memberships.length,
      totalFamiliesScanned: families.length,
      totalFamilyMembersScanned,
      canonicalActiveCount,
      canonicalInactiveValidCount,
      blockedUnderStrictRulesCount,
      nonCompliantCount,
      categoryCounts,
      findings
    };
  }

  /**
   * Executa varredura estritamente READ-ONLY contra uma instância Firestore explícita (Emulator ou futuro ambiente autorizado).
   * BLOQUEIA acesso remoto não autorizado por padrão (fail-closed).
   */
  public static async auditFirestoreDatabase(params: {
    firestoreDb: Firestore;
    target: AuditTargetConfig;
  }): Promise<MembershipAuditReport> {
    const { projectId, databaseId } = validateAuditTargetConfig(params.target);
    const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST?.trim());

    if (!isEmulator) {
      const hasTicket = Boolean(params.target.authorizedReadOnlyTicket?.trim());
      if (params.target.allowRemoteReadOnly !== true || !hasTicket) {
        throw new MembershipAuditError(
          'REMOTE_READ_NOT_AUTHORIZED',
          'Acesso remoto bloqueado por segurança (fail-closed): FIRESTORE_EMULATOR_HOST ausente e autorização explícita de auditoria read-only não fornecida.'
        );
      }
    }

    const db = params.firestoreDb;
    const [membershipsSnap, familiesSnap] = await Promise.all([
      db.collection('familyMemberships').get(),
      db.collection('families').get()
    ]);

    const memberships: SyntheticMembershipRecord[] = membershipsSnap.docs.map(d => ({
      docId: d.id,
      data: (d.data() || {}) as Record<string, unknown>
    }));

    const families: SyntheticFamilyRecord[] = [];
    for (const famDoc of familiesSnap.docs) {
      const membersSnap = await famDoc.ref.collection('members').get();
      families.push({
        familyId: famDoc.id,
        data: (famDoc.data() || {}) as Record<string, unknown>,
        members: membersSnap.docs.map(m => ({
          memberId: m.id,
          data: (m.data() || {}) as Record<string, unknown>
        }))
      });
    }

    return this.auditDataset({
      mode: isEmulator ? 'emulator' : 'authorized-readonly',
      target: { ...params.target, projectId, databaseId },
      dataset: { memberships, families }
    });
  }

  /**
   * Gera fixture sintética representativa cobrindo cenários canônicos e todas as 10 anomalias
   * para execução local sem acesso ao Firestore real.
   */
  public static buildSyntheticDiagnosticFixture(): SyntheticAuditDataset {
    return {
      families: [
        {
          familyId: 'fam-syn-01',
          data: { name: 'Casa Sintética 1', ownerUserId: 'uid-admin-1' },
          members: [
            { memberId: 'mbr-admin-1', data: { userId: 'uid-admin-1', role: 'ADMIN', active: true } },
            { memberId: 'mbr-mem-ok', data: { userId: 'uid-mem-ok', role: 'MEMBER', active: true } },
            { memberId: 'mbr-role-mismatch', data: { userId: 'uid-mismatch', role: 'MEMBER', active: true } },
            { memberId: 'mbr-no-membership', data: { userId: 'uid-unlinked', role: 'MEMBER', active: true } }
          ]
        }
      ],
      memberships: [
        // Canônico ADMIN
        {
          docId: 'fam-syn-01_uid-admin-1',
          data: { familyId: 'fam-syn-01', userId: 'uid-admin-1', memberId: 'mbr-admin-1', role: 'ADMIN', status: 'ACTIVE' }
        },
        // Canônico MEMBER com active: true
        {
          docId: 'fam-syn-01_uid-mem-ok',
          data: { familyId: 'fam-syn-01', userId: 'uid-mem-ok', memberId: 'mbr-mem-ok', role: 'MEMBER', status: 'ACTIVE', active: true }
        },
        // 1 + 2: familyId/userId divergentes / ausentes (legado snake_case sem camelCase)
        {
          docId: 'fam-syn-01_uid-legacy',
          data: { family_id: 'fam-syn-01', user_id: 'uid-legacy', memberId: 'mbr-legacy', role: 'ADMIN', status: 'ACTIVE' }
        },
        // 3 + 4: status ausente em ADMIN
        {
          docId: 'fam-syn-01_uid-admin-nostatus',
          data: { familyId: 'fam-syn-01', userId: 'uid-admin-nostatus', memberId: 'mbr-admin-1', role: 'ADMIN' }
        },
        // 4: ADMIN PENDING
        {
          docId: 'fam-syn-01_uid-admin-pending',
          data: { familyId: 'fam-syn-01', userId: 'uid-admin-pending', memberId: 'mbr-admin-1', role: 'ADMIN', status: 'PENDING' }
        },
        // 5: MEMBER REMOVED
        {
          docId: 'fam-syn-01_uid-mem-removed',
          data: { familyId: 'fam-syn-01', userId: 'uid-mem-removed', memberId: 'mbr-old', role: 'MEMBER', status: 'REMOVED' }
        },
        // 6: active === false explícito com status ACTIVE
        {
          docId: 'fam-syn-01_uid-active-false',
          data: { familyId: 'fam-syn-01', userId: 'uid-active-false', memberId: 'mbr-mem-ok', role: 'MEMBER', status: 'ACTIVE', active: false }
        },
        // 7: DocId incompatível + 9: duplicidade com uid-admin-1
        {
          docId: 'legacy-random-doc-id-99',
          data: { familyId: 'fam-syn-01', userId: 'uid-admin-1', memberId: 'mbr-admin-1', role: 'ADMIN', status: 'ACTIVE' }
        },
        // 8: Órfã (família inexistente)
        {
          docId: 'fam-inexistente_uid-orphan',
          data: { familyId: 'fam-inexistente', userId: 'uid-orphan', memberId: 'mbr-x', role: 'MEMBER', status: 'ACTIVE' }
        },
        // 10: Divergência role membership ADMIN vs member.role MEMBER
        {
          docId: 'fam-syn-01_uid-mismatch',
          data: { familyId: 'fam-syn-01', userId: 'uid-mismatch', memberId: 'mbr-role-mismatch', role: 'ADMIN', status: 'ACTIVE' }
        }
      ]
    };
  }
}
