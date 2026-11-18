/**
 * CASA JUNTO — B.5.5-PRE-PILOT-G1 / G1-HF1 (BLOCO B & C)
 * Testes unitários e de segurança da ferramenta read-only de auditoria de familyMemberships.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  ALL_MEMBERSHIP_ANOMALY_CATEGORIES,
  CANONICAL_DATABASE_ID,
  DisabledFutureRemoteAuditAdapter,
  MembershipAuditError,
  MembershipAuditTool,
  parseAndValidateLocalEmulatorHost,
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
      target: { projectId: 'synthetic-local-fixture', databaseId: CANONICAL_DATABASE_ID },
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
      target: { projectId: 'synthetic-local-fixture', databaseId: CANONICAL_DATABASE_ID },
      dataset: fixture
    });

    if (!report.readOnlyVerified) throw new Error('readOnlyVerified deve ser true');
    if (report.canonicalActiveCount !== 4) throw new Error(`Esperado 4 aptos por documento, obteve ${report.canonicalActiveCount}`);
    if (report.blockedUnderStrictRulesCount !== 6) throw new Error(`Esperado 6 bloqueados pelas rules estritas, obteve ${report.blockedUnderStrictRulesCount}`);
    if (report.nonCompliantCount < 8) throw new Error(`Esperado >=8 achados não-conformes, obteve ${report.nonCompliantCount}`);

    for (const cat of ALL_MEMBERSHIP_ANOMALY_CATEGORIES) {
      if (report.categoryCounts[cat] < 1) {
        throw new Error(`Categoria obrigatória "${cat}" teve contagem 0 na fixture sintética`);
      }
    }
  });

  // MAT-03: Rejeição estrita de banco (default), vazio, projectId ausente e target mismatch
  await record('MAT-03', 'rejeita (default), default, vazio, projectId ausente e divergência de expected target', () => {
    const fixture = { families: [], memberships: [] };
    const invalidConfigs = [
      { projectId: 'demo-no-project', databaseId: '(default)', expectCode: 'DEFAULT_DATABASE_FORBIDDEN' },
      { projectId: 'demo-no-project', databaseId: 'default', expectCode: 'DEFAULT_DATABASE_FORBIDDEN' },
      { projectId: 'demo-no-project', databaseId: '', expectCode: 'INVALID_TARGET_CONFIG' },
      { projectId: '', databaseId: CANONICAL_DATABASE_ID, expectCode: 'INVALID_TARGET_CONFIG' },
      {
        projectId: 'demo-wrong',
        databaseId: CANONICAL_DATABASE_ID,
        expectedProjectId: 'demo-expected',
        expectCode: 'TARGET_MISMATCH'
      },
      {
        projectId: 'demo-no-project',
        databaseId: 'other-db',
        expectedDatabaseId: CANONICAL_DATABASE_ID,
        expectCode: 'TARGET_MISMATCH'
      }
    ];

    for (const cfg of invalidConfigs) {
      let threw = false;
      try {
        MembershipAuditTool.auditDataset({
          mode: 'synthetic',
          target: {
            projectId: cfg.projectId,
            databaseId: cfg.databaseId,
            ...(cfg.expectedProjectId ? { expectedProjectId: cfg.expectedProjectId } : {}),
            ...(cfg.expectedDatabaseId ? { expectedDatabaseId: cfg.expectedDatabaseId } : {})
          },
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

  // MAT-04: Bloqueio fail-closed contra acesso remoto sem FIRESTORE_EMULATOR_HOST e mesmo com allowRemoteReadOnly/ticket arbitrários
  await record('MAT-04', 'auditFirestoreDatabase bloqueia acesso remoto sem FIRESTORE_EMULATOR_HOST E rejeita allowRemoteReadOnly/ticket arbitrários', async () => {
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

      // Tentativa 1: Sem FIRESTORE_EMULATOR_HOST
      let threwMissing = false;
      try {
        await MembershipAuditTool.auditFirestoreDatabase({
          firestoreDb: fakeDb as any,
          target: {
            projectId: 'demo-no-project',
            databaseId: CANONICAL_DATABASE_ID
          }
        });
      } catch (err: any) {
        threwMissing = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'INVALID_EMULATOR_HOST') {
          throw new Error(`Erro inesperado (sem emulador): ${err?.code || err?.message}`);
        }
      }
      if (!threwMissing) throw new Error('Deveria bloquear ausência de FIRESTORE_EMULATOR_HOST.');

      // Tentativa 2: Bypass via allowRemoteReadOnly: true + authorizedReadOnlyTicket arbitrário
      const fakeSecretTicket = 'SECRET-FORGED-TICKET-9999';
      let threwBypass = false;
      try {
        await MembershipAuditTool.auditFirestoreDatabase({
          firestoreDb: fakeDb as any,
          target: {
            projectId: 'trusty-coder-386311',
            databaseId: CANONICAL_DATABASE_ID,
            allowRemoteReadOnly: true,
            authorizedReadOnlyTicket: fakeSecretTicket
          } as any
        });
      } catch (err: any) {
        threwBypass = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'REMOTE_ACCESS_DISABLED_IN_GATE') {
          throw new Error(`Erro inesperado (bypass remoto): ${err?.code || err?.message}`);
        }
        if (String(err.message).includes(fakeSecretTicket)) {
          throw new Error('Mensagem de erro vazou o ticket informado!');
        }
      }
      if (!threwBypass) throw new Error('Deveria bloquear allowRemoteReadOnly/ticket arbitrários.');

      // Tentativa 3: Mesmo COM FIRESTORE_EMULATOR_HOST, flags remotas ou modo authorized-readonly são rejeitados
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
      let threwMode = false;
      try {
        MembershipAuditTool.auditDataset({
          mode: 'authorized-readonly' as any,
          target: { projectId: 'trusty-coder-386311', databaseId: CANONICAL_DATABASE_ID },
          dataset: { families: [], memberships: [] }
        });
      } catch (err: any) {
        threwMode = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'REMOTE_ACCESS_DISABLED_IN_GATE') {
          throw new Error(`Erro inesperado para mode=authorized-readonly: ${err?.code || err?.message}`);
        }
      }
      if (!threwMode) throw new Error('Deveria bloquear mode="authorized-readonly".');

      // Tentativa 4: Adaptador remoto futuro não executa neste gate
      let threwAdapter = false;
      try {
        await DisabledFutureRemoteAuditAdapter.executeAuthorizedRemoteAudit({
          target: { projectId: 'trusty-coder-386311', databaseId: CANONICAL_DATABASE_ID },
          proof: {
            ticketId: 't1',
            signedByBackendUid: 'srv',
            targetProjectId: 'trusty-coder-386311',
            targetDatabaseId: CANONICAL_DATABASE_ID,
            expiresAt: '2099-01-01T00:00:00Z',
            signature: 'sig'
          }
        });
      } catch (err: any) {
        threwAdapter = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'REMOTE_ACCESS_DISABLED_IN_GATE') {
          throw new Error(`Adaptador remoto futuro falhou com código inesperado: ${err?.code}`);
        }
      }
      if (!threwAdapter) throw new Error('Adaptador remoto futuro deveria falhar fechado neste gate.');

      if (getCalled) throw new Error('collection() foi chamado apesar do fail-closed guard.');
    } finally {
      if (prevHost !== undefined) {
        process.env.FIRESTORE_EMULATOR_HOST = prevHost;
      } else {
        delete process.env.FIRESTORE_EMULATOR_HOST;
      }
    }
  });

  // MAT-05: Ausência de PII, emails, tokens e IDs brutos no relatório
  await record('MAT-05', 'relatório anonimiza IDs e não vaza PII, e-mails, nomes ou tokens', () => {
    const report = MembershipAuditTool.auditDataset({
      mode: 'synthetic',
      target: { projectId: 'synthetic-local-fixture', databaseId: CANONICAL_DATABASE_ID },
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

  // MAT-06: Garantia estrita estática de zero escritas e zero import de runtime Firebase em synthetic
  await record('MAT-06', 'verificação estática garante ZERO operações de escrita no Firestore e modo synthetic sem cliente/rede', () => {
    const toolPath = path.resolve(__dirname, '../services/membershipAuditTool.ts');
    const code = fs.readFileSync(toolPath, 'utf-8');
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
      /WriteBatch/,
      /initializeApp\s*\(/,
      /getFirestore\s*\(/
    ];

    for (const re of forbiddenWritePatterns) {
      if (re.test(stripped)) {
        throw new Error(`Operação proibida encontrada em membershipAuditTool.ts: ${re}`);
      }
    }

    // Garante que import é apenas type-only (`import type { Firestore }`)
    if (!/import\s+type\s*\{\s*Firestore\s*\}\s*from\s*['"]firebase-admin\/firestore['"]/.test(code)) {
      throw new Error('membershipAuditTool.ts deve importar apenas tipo Firestore (sem inicialização de SDK).');
    }

    if (!passesStrictMembershipRules('f_u', { familyId: 'f', userId: 'u', role: 'ADMIN', status: 'ACTIVE' })) {
      throw new Error('passesStrictMembershipRules falhou para active omitido');
    }
    if (passesStrictMembershipRules('f_u', { familyId: 'f', userId: 'u', role: 'ADMIN', status: 'ACTIVE', active: false })) {
      throw new Error('passesStrictMembershipRules deveria bloquear active=false');
    }
  });

  // MAT-07: Validação estrita de FIRESTORE_EMULATOR_HOST (hosts locais válidos vs remotos/malformados)
  await record('MAT-07', 'rejeita hosts remotos, esquemas e portas inválidas em FIRESTORE_EMULATOR_HOST', () => {
    const validHosts = ['127.0.0.1:8088', 'localhost:8088', '[::1]:8088'];
    for (const vh of validHosts) {
      const parsed = parseAndValidateLocalEmulatorHost(vh);
      if (parsed.port !== 8088) throw new Error(`Porta incorreta ao parsear ${vh}`);
    }

    const invalidHosts = [
      undefined,
      '',
      '   ',
      'firestore.googleapis.com:443',
      'us-central1-firestore.googleapis.com:443',
      '10.0.0.5:8088',
      '0.0.0.0:8088',
      '8.8.8.8:8088',
      'http://127.0.0.1:8088',
      '127.0.0.1',
      'localhost:0',
      'localhost:65536',
      '127.0.0.1:abc',
      '127.0.0.1:8088/path'
    ];

    for (const bad of invalidHosts) {
      let threw = false;
      try {
        parseAndValidateLocalEmulatorHost(bad);
      } catch (err: any) {
        threw = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'INVALID_EMULATOR_HOST') {
          throw new Error(`Código inesperado para host="${bad}": ${err?.code}`);
        }
      }
      if (!threw) {
        throw new Error(`Host inválido/remoto deveria ser rejeitado: "${bad}"`);
      }
    }
  });

  // MAT-08: Instância real Firebase Admin inicializada SEM emulador, com projeto errado ou banco (default) falha fail-closed SEM I/O
  await record('MAT-08', 'rejeita instância Admin Firestore sem endpoint de emulador, com projectId divergente ou banco (default)', async () => {
    const prevHost = process.env.FIRESTORE_EMULATOR_HOST;

    // Cenário 8a: Instância criada SEM FIRESTORE_EMULATOR_HOST (mesmo se env for spoofing depois)
    delete process.env.FIRESTORE_EMULATOR_HOST;
    const appNoEmu = initializeApp({ projectId: 'demo-no-project' }, `mat08-noemu-${Date.now()}`);
    const dbNoEmu = getFirestore(appNoEmu, CANONICAL_DATABASE_ID);

    // Cenário 8b: Instância criada COM FIRESTORE_EMULATOR_HOST apontando para (default) ou outro projectId
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
    const appWrongProj = initializeApp({ projectId: 'wrong-project-id' }, `mat08-wrongproj-${Date.now()}`);
    const dbWrongProj = getFirestore(appWrongProj, CANONICAL_DATABASE_ID);

    const appDefaultDb = initializeApp({ projectId: 'demo-no-project' }, `mat08-defaultdb-${Date.now()}`);
    const dbDefault = getFirestore(appDefaultDb); // (default)!
    const dbValid8088 = getFirestore(appDefaultDb, CANONICAL_DATABASE_ID);

    try {
      // Testa dbNoEmu mesmo após setar env spoofado -> deve falhar por endpoint ausente no _settings
      let threwNoEmu = false;
      try {
        await MembershipAuditTool.auditFirestoreDatabase({
          firestoreDb: dbNoEmu as any,
          target: { projectId: 'demo-no-project', databaseId: CANONICAL_DATABASE_ID }
        });
      } catch (err: any) {
        threwNoEmu = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'REMOTE_ACCESS_DISABLED_IN_GATE') {
          throw new Error(`Esperado REMOTE_ACCESS_DISABLED_IN_GATE para dbNoEmu, obteve ${err?.code}: ${err?.message}`);
        }
      }
      if (!threwNoEmu) throw new Error('Instância inicializada sem emulador deveria ser bloqueada!');

      // Testa dbWrongProj (divergência entre target e _settings.projectId)
      let threwWrongProj = false;
      try {
        await MembershipAuditTool.auditFirestoreDatabase({
          firestoreDb: dbWrongProj as any,
          target: { projectId: 'demo-no-project', databaseId: CANONICAL_DATABASE_ID }
        });
      } catch (err: any) {
        threwWrongProj = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'TARGET_MISMATCH') {
          throw new Error(`Esperado TARGET_MISMATCH para dbWrongProj, obteve ${err?.code}: ${err?.message}`);
        }
      }
      if (!threwWrongProj) throw new Error('Divergência de projectId na instância deveria falhar!');

      // Testa dbDefault (instância apontando para (default) mesmo com target informando banco canônico!)
      let threwDefaultDb = false;
      try {
        await MembershipAuditTool.auditFirestoreDatabase({
          firestoreDb: dbDefault as any,
          target: { projectId: 'demo-no-project', databaseId: CANONICAL_DATABASE_ID }
        });
      } catch (err: any) {
        threwDefaultDb = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'DEFAULT_DATABASE_FORBIDDEN') {
          throw new Error(`Esperado DEFAULT_DATABASE_FORBIDDEN para dbDefault, obteve ${err?.code}: ${err?.message}`);
        }
      }
      if (!threwDefaultDb) throw new Error('Instância apontando para (default) deveria ser bloqueada!');

      // Testa host divergente (instância criada para 127.0.0.1:8088, mas env mudou para localhost:9999)
      process.env.FIRESTORE_EMULATOR_HOST = 'localhost:9999';
      let threwHostMismatch = false;
      try {
        await MembershipAuditTool.auditFirestoreDatabase({
          firestoreDb: dbValid8088 as any,
          target: { projectId: 'demo-no-project', databaseId: CANONICAL_DATABASE_ID }
        });
      } catch (err: any) {
        threwHostMismatch = true;
        if (!(err instanceof MembershipAuditError) || err.code !== 'TARGET_MISMATCH') {
          throw new Error(`Esperado TARGET_MISMATCH para endpoint divergente, obteve ${err?.code}: ${err?.message}`);
        }
      }
      if (!threwHostMismatch) throw new Error('Divergência entre host da instância e FIRESTORE_EMULATOR_HOST deveria falhar!');
    } finally {
      if (prevHost !== undefined) {
        process.env.FIRESTORE_EMULATOR_HOST = prevHost;
      } else {
        delete process.env.FIRESTORE_EMULATOR_HOST;
      }
      await Promise.allSettled([
        deleteApp(appNoEmu),
        deleteApp(appWrongProj),
        deleteApp(appDefaultDb)
      ]);
    }
  });

  // MAT-09: Modo synthetic executa sem FIRESTORE_EMULATOR_HOST e com FIRESTORE_EMULATOR_HOST remoto sem iniciar rede
  await record('MAT-09', 'modo synthetic executa puramente em memória mesmo sem FIRESTORE_EMULATOR_HOST e sem rede', () => {
    const prevHost = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
    try {
      const report = MembershipAuditTool.auditDataset({
        mode: 'synthetic',
        target: { projectId: 'synthetic-local-fixture', databaseId: CANONICAL_DATABASE_ID },
        dataset: MembershipAuditTool.buildSyntheticDiagnosticFixture()
      });
      if (report.mode !== 'synthetic' || report.totalMembershipsScanned !== 10) {
        throw new Error('Falha na execução em memória no modo synthetic');
      }
    } finally {
      if (prevHost !== undefined) {
        process.env.FIRESTORE_EMULATOR_HOST = prevHost;
      }
    }
  });

  return { passed, failed, results };
}
