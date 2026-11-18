/**
 * CASA JUNTO — B.5.5-PRE-PILOT-G1 / G1-HF1 (BLOCO B)
 * Ferramenta Estritamente Read-Only de Auditoria Diagnóstica de familyMemberships.
 *
 * GARANTIAS DE SEGURANÇA (FAIL-CLOSED):
 * 1. ZERO mutações: não executa set, update, delete, create, batch ou transaction.
 * 2. FAIL-CLOSED no banco: exige projectId e databaseId explícitos (e expectedProjectId/expectedDatabaseId
 *    quando informados), rejeitando terminantemente "(default)" / "default" ou divergências.
 * 3. Acesso remoto 100% DESABILITADO neste gate:
 *    - Somente modos 'synthetic' (em memória, zero cliente/rede) e 'emulator' (local validado) executam.
 *    - Rejeita allowRemoteReadOnly e authorizedReadOnlyTicket arbitrários mesmo se fornecidos.
 *    - Valida host local + porta (127.0.0.1, localhost, [::1]) de FIRESTORE_EMULATOR_HOST.
 *    - Valida metadados internos (_settings/_databaseId) da instância Firestore antes de qualquer leitura.
 * 4. Adaptador remoto futuro definido apenas como contrato não-executável neste gate.
 * 5. Zero exposição de PII/tokens/credenciais em logs, erros ou relatórios (apenas hashes curtos SHA-256).
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
const ALLOWED_LOCAL_EMULATOR_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export type AuditExecutionMode = 'synthetic' | 'emulator';

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
  /** Quando informados, exigem correspondência exata com projectId/databaseId declarados e com a instância. */
  expectedProjectId?: string;
  expectedDatabaseId?: string;
  /**
   * Campos legados estritamente desabilitados neste gate.
   * Qualquer tentativa de envio (inclusive via `as any`) dispara erro fail-closed antes de ler o banco.
   */
  allowRemoteReadOnly?: never;
  authorizedReadOnlyTicket?: never;
}

/**
 * Contrato explícito NÃO-EXECUTÁVEL reservado para um gate futuro com prova verificável em backend.
 */
export interface RemoteReadOnlyAuthorizationProof {
  readonly ticketId: string;
  readonly signedByBackendUid: string;
  readonly targetProjectId: string;
  readonly targetDatabaseId: string;
  readonly expiresAt: string;
  readonly signature: string;
}

export interface FutureRemoteMembershipAuditAdapter {
  readonly gateStatus: 'DISABLED_IN_CURRENT_GATE';
  executeAuthorizedRemoteAudit(params: {
    target: AuditTargetConfig;
    proof: RemoteReadOnlyAuthorizationProof;
  }): Promise<never>;
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
  mode: AuditExecutionMode;
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

export type MembershipAuditErrorCode =
  | 'INVALID_TARGET_CONFIG'
  | 'DEFAULT_DATABASE_FORBIDDEN'
  | 'INVALID_EMULATOR_HOST'
  | 'TARGET_MISMATCH'
  | 'REMOTE_ACCESS_DISABLED_IN_GATE'
  | 'INSTANCE_NOT_VERIFIED_AS_LOCAL_EMULATOR';

export class MembershipAuditError extends Error {
  public readonly code: MembershipAuditErrorCode;

  constructor(code: MembershipAuditErrorCode, message: string) {
    super(message);
    this.name = 'MembershipAuditError';
    this.code = code;
  }
}

export const DisabledFutureRemoteAuditAdapter: FutureRemoteMembershipAuditAdapter = {
  gateStatus: 'DISABLED_IN_CURRENT_GATE',
  async executeAuthorizedRemoteAudit(): Promise<never> {
    throw new MembershipAuditError(
      'REMOTE_ACCESS_DISABLED_IN_GATE',
      'Acesso remoto está estritamente desabilitado no gate B.5.5-PRE-PILOT-G1-HF1; nenhum adaptador remoto pode ser executado.'
    );
  }
};

function anonymizeId(rawId: string): string {
  return createHash('sha256').update(rawId).digest('hex').slice(0, 12);
}

function asNonEmptyString(val: unknown): string | null {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : null;
}

function normalizeLoopbackHost(host: string): string {
  const lower = host.trim().toLowerCase();
  if (lower.startsWith('[') && lower.endsWith(']')) {
    return lower.slice(1, -1);
  }
  return lower;
}

/**
 * Analisa e valida rigorosamente FIRESTORE_EMULATOR_HOST para garantir que aponta EXCLUSIVAMENTE
 * para host local (127.0.0.1, localhost ou [::1]) e porta TCP válida (1..65535).
 */
export function parseAndValidateLocalEmulatorHost(rawHost: string | undefined): {
  host: string;
  port: number;
  normalized: string;
} {
  const trimmed = asNonEmptyString(rawHost);
  if (!trimmed) {
    throw new MembershipAuditError(
      'INVALID_EMULATOR_HOST',
      'FIRESTORE_EMULATOR_HOST ausente: execução contra Firestore requer emulador local explícito.'
    );
  }

  // Rejeita esquemas HTTP/HTTPS, caminhos, query strings, espaços ou múltiplas entradas
  if (/[/?#\s,@]/.test(trimmed)) {
    throw new MembershipAuditError(
      'INVALID_EMULATOR_HOST',
      'FIRESTORE_EMULATOR_HOST malformado: utilize apenas "<host_local>:<porta>" sem protocolo ou caminho.'
    );
  }

  const match = /^(127\.0\.0\.1|localhost|\[::1\]):([0-9]{1,5})$/i.exec(trimmed);
  if (!match) {
    throw new MembershipAuditError(
      'INVALID_EMULATOR_HOST',
      'FIRESTORE_EMULATOR_HOST rejeitado: somente hosts locais (127.0.0.1, localhost, [::1]) com porta explícita são permitidos.'
    );
  }

  const host = normalizeLoopbackHost(match[1]);
  const port = Number.parseInt(match[2], 10);

  if (!ALLOWED_LOCAL_EMULATOR_HOSTS.has(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new MembershipAuditError(
      'INVALID_EMULATOR_HOST',
      'Porta de FIRESTORE_EMULATOR_HOST inválida: informe uma porta inteira entre 1 e 65535.'
    );
  }

  return {
    host,
    port,
    normalized: `${match[1].toLowerCase()}:${port}`
  };
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
  expectedProjectId?: string;
  expectedDatabaseId?: string;
} {
  const rawConfig = (config || {}) as unknown as Record<string, unknown>;

  // Rejeição absoluta de flags/tickets remotos arbitrários neste gate (sem ecoar conteúdo sensível)
  if (
    ('allowRemoteReadOnly' in rawConfig && rawConfig.allowRemoteReadOnly !== undefined) ||
    ('authorizedReadOnlyTicket' in rawConfig && rawConfig.authorizedReadOnlyTicket !== undefined)
  ) {
    throw new MembershipAuditError(
      'REMOTE_ACCESS_DISABLED_IN_GATE',
      'Acesso remoto (allowRemoteReadOnly / authorizedReadOnlyTicket) está desabilitado neste gate.'
    );
  }

  const projectId = asNonEmptyString(config?.projectId);
  const databaseId = asNonEmptyString(config?.databaseId);

  if (!projectId || /\s/.test(projectId)) {
    throw new MembershipAuditError(
      'INVALID_TARGET_CONFIG',
      'projectId explícito e não-vazio é obrigatório para a auditoria read-only.'
    );
  }

  if (!databaseId || /\s/.test(databaseId)) {
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

  let expectedProjectId: string | undefined;
  if ('expectedProjectId' in rawConfig && rawConfig.expectedProjectId !== undefined) {
    const expProj = asNonEmptyString(rawConfig.expectedProjectId);
    if (!expProj) {
      throw new MembershipAuditError(
        'INVALID_TARGET_CONFIG',
        'expectedProjectId, quando informado, deve ser uma string não-vazia.'
      );
    }
    if (projectId !== expProj) {
      throw new MembershipAuditError(
        'TARGET_MISMATCH',
        `Divergência de projectId: informado "${projectId}", esperado "${expProj}".`
      );
    }
    expectedProjectId = expProj;
  }

  let expectedDatabaseId: string | undefined;
  if ('expectedDatabaseId' in rawConfig && rawConfig.expectedDatabaseId !== undefined) {
    const expDb = asNonEmptyString(rawConfig.expectedDatabaseId);
    if (!expDb) {
      throw new MembershipAuditError(
        'INVALID_TARGET_CONFIG',
        'expectedDatabaseId, quando informado, deve ser uma string não-vazia.'
      );
    }
    if (expDb.toLowerCase() === '(default)' || expDb.toLowerCase() === 'default') {
      throw new MembershipAuditError(
        'DEFAULT_DATABASE_FORBIDDEN',
        `Banco esperado "${expDb}" é proibido.`
      );
    }
    if (databaseId !== expDb) {
      throw new MembershipAuditError(
        'TARGET_MISMATCH',
        `Divergência de databaseId: informado "${databaseId}", esperado "${expDb}".`
      );
    }
    expectedDatabaseId = expDb;
  }

  return { projectId, databaseId, expectedProjectId, expectedDatabaseId };
}

/**
 * Inspeciona metadados internos da instância Firestore Admin SDK sem realizar I/O de rede,
 * garantindo que aponta exatamente para o emulador local, projectId e databaseId validados.
 */
function verifyFirestoreInstanceTargetsLocalEmulator(params: {
  firestoreDb: Firestore;
  projectId: string;
  databaseId: string;
  emulatorHost: string;
  emulatorPort: number;
}): void {
  const dbAny = params.firestoreDb as unknown as Record<string, unknown> | null;
  if (!dbAny || typeof dbAny !== 'object' || typeof dbAny.collection !== 'function') {
    throw new MembershipAuditError(
      'INSTANCE_NOT_VERIFIED_AS_LOCAL_EMULATOR',
      'Instância Firestore inválida ou ausente.'
    );
  }

  const settings = (dbAny._settings ?? dbAny.settings) as Record<string, unknown> | undefined;
  if (!settings || typeof settings !== 'object') {
    throw new MembershipAuditError(
      'INSTANCE_NOT_VERIFIED_AS_LOCAL_EMULATOR',
      'Não foi possível verificar as configurações de destino da instância Firestore (fail-closed).'
    );
  }

  if (settings.ssl === true) {
    throw new MembershipAuditError(
      'REMOTE_ACCESS_DISABLED_IN_GATE',
      'Instância Firestore configurada com SSL remoto é proibida neste gate.'
    );
  }

  const instanceProjectId = asNonEmptyString(settings.projectId) ?? asNonEmptyString(dbAny._projectId);
  if (!instanceProjectId) {
    throw new MembershipAuditError(
      'INSTANCE_NOT_VERIFIED_AS_LOCAL_EMULATOR',
      'projectId da instância Firestore não identificável (fail-closed).'
    );
  }
  if (instanceProjectId !== params.projectId) {
    throw new MembershipAuditError(
      'TARGET_MISMATCH',
      `projectId da instância Firestore ("${instanceProjectId}") diverge do target ("${params.projectId}").`
    );
  }

  const instanceDatabaseId = asNonEmptyString(settings.databaseId) ?? asNonEmptyString(dbAny._databaseId);
  if (!instanceDatabaseId) {
    throw new MembershipAuditError(
      'INSTANCE_NOT_VERIFIED_AS_LOCAL_EMULATOR',
      'databaseId da instância Firestore não identificável (fail-closed).'
    );
  }
  if (instanceDatabaseId.toLowerCase() === '(default)' || instanceDatabaseId.toLowerCase() === 'default') {
    throw new MembershipAuditError(
      'DEFAULT_DATABASE_FORBIDDEN',
      'Instância Firestore apontando para "(default)" é terminantemente proibida.'
    );
  }
  if (instanceDatabaseId !== params.databaseId) {
    throw new MembershipAuditError(
      'TARGET_MISMATCH',
      `databaseId da instância Firestore ("${instanceDatabaseId}") diverge do target ("${params.databaseId}").`
    );
  }

  const rawInstanceHost = asNonEmptyString(settings.servicePath) ?? asNonEmptyString(settings.host);
  const rawInstancePort = typeof settings.port === 'number'
    ? settings.port
    : typeof settings.port === 'string'
      ? Number.parseInt(settings.port, 10)
      : Number.NaN;

  // Se o Admin SDK foi inicializado antes de FIRESTORE_EMULATOR_HOST existir, servicePath/port ficam ausentes
  // e o SDK tentaria conectar em firestore.googleapis.com:443 — bloquear imediatamente!
  if (!rawInstanceHost || !Number.isInteger(rawInstancePort)) {
    throw new MembershipAuditError(
      'REMOTE_ACCESS_DISABLED_IN_GATE',
      'Instância Firestore sem endpoint local explícito de emulador (possível alvo remoto bloqueado).'
    );
  }

  const normalizedInstanceHost = normalizeLoopbackHost(rawInstanceHost);
  if (!ALLOWED_LOCAL_EMULATOR_HOSTS.has(normalizedInstanceHost)) {
    throw new MembershipAuditError(
      'REMOTE_ACCESS_DISABLED_IN_GATE',
      'Endpoint da instância Firestore não é um host local de emulador.'
    );
  }

  if (normalizedInstanceHost !== params.emulatorHost || rawInstancePort !== params.emulatorPort) {
    throw new MembershipAuditError(
      'TARGET_MISMATCH',
      'Endpoint da instância Firestore diverge de FIRESTORE_EMULATOR_HOST validado.'
    );
  }
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
   * Analisa um conjunto de dados em memória (sintético ou já coletado no emulador local).
   * No modo 'synthetic', nunca inicializa cliente Firestore nem realiza I/O de rede.
   */
  public static auditDataset(params: {
    mode: AuditExecutionMode;
    target: AuditTargetConfig;
    dataset: SyntheticAuditDataset;
  }): MembershipAuditReport {
    if (params.mode !== 'synthetic' && params.mode !== 'emulator') {
      throw new MembershipAuditError(
        'REMOTE_ACCESS_DISABLED_IN_GATE',
        `Modo "${String(params.mode)}" não permitido neste gate (apenas "synthetic" e "emulator").`
      );
    }

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

    // 10b. FAMILY_MEMBERS_INCOMPATIBILITY reversa
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
   * Executa varredura estritamente READ-ONLY exclusivamente contra um Firestore Emulator local validado.
   * Acesso remoto é 100% DESABILITADO neste gate (fail-closed antes de qualquer leitura).
   */
  public static async auditFirestoreDatabase(params: {
    firestoreDb: Firestore;
    target: AuditTargetConfig;
  }): Promise<MembershipAuditReport> {
    // 1. Valida target e rejeita flags/tickets remotos antes de tudo
    const { projectId, databaseId, expectedProjectId, expectedDatabaseId } = validateAuditTargetConfig(params.target);

    // 2. Exige banco nomeado esperado explícito ou canônico
    const requiredDatabaseId = expectedDatabaseId ?? CANONICAL_DATABASE_ID;
    if (databaseId !== requiredDatabaseId) {
      throw new MembershipAuditError(
        'TARGET_MISMATCH',
        `databaseId "${databaseId}" não autorizado neste gate (esperado: "${requiredDatabaseId}").`
      );
    }

    // 3. Valida estritamente FIRESTORE_EMULATOR_HOST (host local + porta válida)
    const emulatorEndpoint = parseAndValidateLocalEmulatorHost(process.env.FIRESTORE_EMULATOR_HOST);

    // 4. Verifica metadados da instância Firestore sem I/O de rede
    verifyFirestoreInstanceTargetsLocalEmulator({
      firestoreDb: params.firestoreDb,
      projectId,
      databaseId,
      emulatorHost: emulatorEndpoint.host,
      emulatorPort: emulatorEndpoint.port
    });

    // 5. Leituras estritamente read-only no emulador local validado
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
      mode: 'emulator',
      target: {
        projectId,
        databaseId,
        expectedProjectId: expectedProjectId ?? projectId,
        expectedDatabaseId: requiredDatabaseId
      },
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
