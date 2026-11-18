/**
 * CASA JUNTO — B.5.5-PRE-PILOT-G1 (BLOCO C)
 * Testes unitários da ferramenta read-only de auditoria de familyMemberships.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALL_MEMBERSHIP_ANOMALY_CATEGORIES,
  CANONICAL_DATABASE_ID,
  MembershipAuditError,
  MembershipAuditTool,
  passesStrictMembershipRules
} from '../services/membershipAuditTool';

export async function runMembershipAuditToolTests(): Promise<{
  passed: number;
  failed: number;
  results: Array<{ testName: string; passed: boolean; message?: string }>;
}> {
  const results: Array<{ testName: string; passed: boolean; message?: string }> = [];
  let passed = 0;
  let failed = 0;

  async function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      results.push({ testName: `MembershipAuditTool ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({
        testName: `MembershipAuditTool ${id}: ${name}`,
        passed: false,
        message: err?.message || String(err)
      });
    }
  }

  // MAT-01: Registros canônicos limpos produzem 0 não-conformidades e passam nas regras estritas
  await record('MAT-01', 'dataset canônico limpo resulta em 0 anomalias e 100% conformidade', () => {
    const report = MembershipAuditTool.auditDataset({
      mode: 'synthetic',
      target: { projectId: 'trusty-coder-386311', databaseId: CANONICAL_DATABASE_ID },
      dataset: {
        families: [
          {
            familyId: 'fam-clean',
            data: { ownerUserId: 'uid-a' },
            members: [
              { memberId: 'mbr-a', data: { userId: 'uid-a', role: 'ADMIN', active: true } },
              { memberId: 'mbr-b', data: { userId: 'uid-b', role: 'MEMBER', active: true } }
            ]
          }
        ],
        memberships: [
          {
            docId: 'fam-clean_uid-a',
            data: { familyId: 'fam-clean', userId: 'uid-a', memberId: 'mbr-a', role: 'ADMIN', status: 'ACTIVE' }
          },
          {
            docId: 'fam-clean_uid-b',
            data: { familyId: 'fam-clean', userId: 'uid-b', memberId: 'mbr-b', role: 'MEMBER', status: 'ACTIVE', active: true }
          }
        ]
      }
    });

    if (report.canonicalActiveCount !== 2) throw new Error(`Esperado canonicalActiveCount=2, obteve ${report.canonicalActiveCount}`);
    if (report.nonCompliantCount !== 0) throw new Error(`Esperado nonCompliantCount=0, obteve ${report.nonCompliantCount}`);
    if (report.blockedUnderStrictRulesCount !== 0) throw new Error(`Esperado blocked=0, obteve ${report.blockedUnderStrictRulesCount}`);
    if (report.findings.length !== 0) throw new Error(`Esperado 0 findings, obteve ${report.findings.length}`);
  });

  // MAT-02: Todas as 10 categorias de anomalia detectadas na fixture sintética
  await record('MAT-02', 'fixture sintética cobre e contabiliza todas as 10 categorias obrigatórias', () => {
    const fixture = MembershipAuditTool.buildSyntheticDiagnosticFixture();
    const report = MembershipAuditTool.auditDataset({
      mode: 'synthetic',
      target: { projectId: 'trusty-coder-386311', databaseId: CANONICAL_DATABASE_ID },
      dataset: fixture
    });

    if (!report.readOnlyVerified) throw new Error('readOnlyVerified deve ser true');
    // 2 canônicos limpos + 2 válidos em documento mas com anomalia cross-doc (ORPHAN / FAMILY_MEMBERS_INCOMPATIBILITY)
    if (report.canonicalActiveCount !== 4) throw new Error(`Esperado 4 aptos por documento, obteve ${report.canonicalActiveCount}`);
    if (report.blockedUnderStrictRulesCount !== 6) throw new Error(`Esperado 6 bloqueados pelas rules estritas, obteve ${report.blockedUnderStrictRulesCount}`);
    if (report.nonCompliantCount < 8) throw new Error(`Esperado >=8 achados não-conformes, obteve ${report.nonCompliantCount}`);

    for (const cat of ALL_MEMBERSHIP_ANOMALY_CATEGORIES) {
      if (report.categoryCounts[cat] < 1) {
        throw new Error(`Categoria obrigatória "${cat}" teve contagem 0 na fixture sintética`);
      }
    }
  });

  // MAT-03: Rejeição estrita de banco (default), vazio e projectId ausente
  await record('MAT-03', 'rejeita (default), default, vazio e projectId ausente', () => {
    const fixture = { families: [], memberships: [] };
    const invalidConfigs = [
      { projectId: 'trusty-coder-386311', databaseId: '(default)', expectCode: 'DEFAULT_DATABASE_FORBIDDEN' },
      { projectId: 'trusty-coder-386311', databaseId: 'default', expectCode: 'DEFAULT_DATABASE_FORBIDDEN' },
      { projectId: 'trusty-coder-386311', databaseId: '', expectCode: 'INVALID_TARGET_CONFIG' },
      { projectId: '', databaseId: CANONICAL_DATABASE_ID, expectCode: 'INVALID_TARGET_CONFIG' }
    ];

    for (const cfg of invalidConfigs) {
      let threw = false;
      try {
        MembershipAuditTool.auditDataset({
          mode: 'synthetic',
          target: { projectId: cfg.projectId, databaseId: cfg.databaseId },
          dataset: fixture
        });
      } catch (err: any) {
        threw = true;
        if (!(err instanceof MembershipAuditError) || err.code !== cfg.expectCode) {
          throw new Error(`Código inesperado para db="${cfg.databaseId}": ${err?.code || err?.message}`);
        }
      }
      if (!threw) {
        throw new Error(`Deveria rejeitar target projectId="${cfg.projectId}", databaseId="${cfg.databaseId}"`);
      }
    }
  });

  // MAT-04: Proteção fail-closed contra acesso remoto sem autorização explícita
  await record('MAT-04', 'auditFirestoreDatabase bloqueia acesso remoto sem FIRESTORE_EMULATOR_HOST nem autorização explícita', async () => {
    const prevHost = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    try {
      let getCalled = false;
      const fakeDb = {
        collection: () => {
          getCalled = true;
          throw new Error('Não deveria chamar collection() antes da validação fail-closed!');
        }
      };

      let threw = false;
      try {
        await MembershipAuditTool.auditFirestoreDatabase({
          firestoreDb: fakeDb as any,
          target: {
            projectId: 'trusty-coder-386311',
            databaseId: CANONICAL_DATABASE_ID
          }
        });
      } catch (err: any) {
        threw = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'REMOTE_READ_NOT_AUTHORIZED') {
          throw new Error(`Erro inesperado: ${err?.code || err?.message}`);
        }
      }
      if (!threw) throw new Error('Deveria bloquear acesso remoto não autorizado.');
      if (getCalled) throw new Error('collection() foi chamado apesar do fail-closed guard.');
    } finally {
      if (prevHost !== undefined) {
        process.env.FIRESTORE_EMULATOR_HOST = prevHost;
      }
    }
  });

  // MAT-05: Ausência de PII, emails, tokens e IDs brutos no relatório
  await record('MAT-05', 'relatório anonimiza IDs e não vaza PII, e-mails, nomes ou tokens', () => {
    const report = MembershipAuditTool.auditDataset({
      mode: 'synthetic',
      target: { projectId: 'trusty-coder-386311', databaseId: CANONICAL_DATABASE_ID },
      dataset: {
        families: [
          {
            familyId: 'fam-secret-ruajuriti',
            data: { name: 'Família Secreta PII' },
            members: [
              {
                memberId: 'mbr-pii-1',
                data: {
                  userId: 'uid-sensitive-marina-999',
                  name: 'Marina Silva',
                  email: 'marina@example.com',
                  fcmToken: 'super-secret-fcm-token',
                  role: 'ADMIN',
                  active: true
                }
              }
            ]
          }
        ],
        memberships: [
          {
            docId: 'fam-secret-ruajuriti_uid-sensitive-marina-999',
            data: {
              familyId: 'fam-secret-ruajuriti',
              userId: 'uid-sensitive-marina-999',
              userEmail: 'marina@example.com',
              displayName: 'Marina Silva',
              role: 'ADMIN',
              status: 'PENDING'
            }
          }
        ]
      }
    });

    const serialized = JSON.stringify(report);
    const forbiddenLiterals = [
      'marina@example.com',
      'Marina Silva',
      'Família Secreta PII',
      'uid-sensitive-marina-999',
      'fam-secret-ruajuriti',
      'super-secret-fcm-token'
    ];
    for (const term of forbiddenLiterals) {
      if (serialized.includes(term)) {
        throw new Error(`Vazamento de dado sensível/bruto no relatório: "${term}"`);
      }
    }
    if (!report.findings[0]?.docRefHash.startsWith('mem_')) {
      throw new Error('Finding deve usar docRefHash anonimizado com prefixo mem_');
    }
  });

  // MAT-06: Garantia estrita estática de zero escritas em membershipAuditTool.ts
  await record('MAT-06', 'verificação estática de código garante ZERO operações de escrita no Firestore', () => {
    const toolPath = path.resolve(__dirname, '../services/membershipAuditTool.ts');
    const code = fs.readFileSync(toolPath, 'utf-8');
    // Remover comentários e node:crypto createHash(...).update antes de inspecionar mutações Firestore
    const stripped = code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/createHash\('sha256'\)\.update\(/g, '');

    const forbiddenWritePatterns = [
      /\.set\s*\(/,
      /\.update\s*\(/,
      /\.delete\s*\(/,
      /\.create\s*\(/,
      /\.batch\s*\(/,
      /runTransaction\s*\(/,
      /WriteBatch/
    ];

    for (const re of forbiddenWritePatterns) {
      if (re.test(stripped)) {
        throw new Error(`Operação de mutação proibida encontrada em membershipAuditTool.ts: ${re}`);
      }
    }

    // Confirma também coerência de passesStrictMembershipRules com active: true / omitted / false
    if (!passesStrictMembershipRules('f_u', { familyId: 'f', userId: 'u', role: 'ADMIN', status: 'ACTIVE' })) {
      throw new Error('passesStrictMembershipRules falhou para active omitido');
    }
    if (passesStrictMembershipRules('f_u', { familyId: 'f', userId: 'u', role: 'ADMIN', status: 'ACTIVE', active: false })) {
      throw new Error('passesStrictMembershipRules deveria bloquear active=false');
    }
  });

  return { passed, failed, results };
}
