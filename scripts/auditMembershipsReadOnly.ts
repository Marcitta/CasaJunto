/**
 * CLI estritamente READ-ONLY para diagnóstico de familyMemberships (B.5.5-PRE-PILOT-G1 / G1-HF1).
 *
 * Uso seguro local (sintético, zero cliente/rede):
 *   npx tsx scripts/auditMembershipsReadOnly.ts --mode=synthetic
 *
 * Uso contra Firebase Emulator local (exige FIRESTORE_EMULATOR_HOST local + --project-id + --database-id):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 npx tsx scripts/auditMembershipsReadOnly.ts \
 *     --mode=emulator \
 *     --project-id=demo-no-project \
 *     --database-id=ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c
 */

import {
  CANONICAL_DATABASE_ID,
  MembershipAuditError,
  MembershipAuditTool,
  parseAndValidateLocalEmulatorHost,
  validateAuditTargetConfig
} from '../functions/src/services/membershipAuditTool';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  const exact = `--${name}`;
  const prefix = `--${name}=`;
  return process.argv.slice(2).some(a => a === exact || a.startsWith(prefix));
}

async function main() {
  // Bloqueio imediato de qualquer flag de acesso remoto neste gate
  if (
    hasFlag('allow-remote-readonly') ||
    hasFlag('allowRemoteReadOnly') ||
    hasFlag('authorized-readonly-ticket') ||
    hasFlag('authorizedReadOnlyTicket') ||
    hasFlag('ticket')
  ) {
    throw new MembershipAuditError(
      'REMOTE_ACCESS_DISABLED_IN_GATE',
      'Parâmetros de acesso remoto não são permitidos neste gate.'
    );
  }

  const mode = parseArg('mode') || 'synthetic';
  const expectedProjectId = parseArg('expected-project-id');
  const expectedDatabaseId = parseArg('expected-database-id');

  if (mode === 'synthetic') {
    const projectId = parseArg('project-id') || 'synthetic-local-fixture';
    const databaseId = parseArg('database-id') || CANONICAL_DATABASE_ID;
    // Modo sintético: NUNCA importa firebase-admin nem inicia rede
    const dataset = MembershipAuditTool.buildSyntheticDiagnosticFixture();
    const report = MembershipAuditTool.auditDataset({
      mode: 'synthetic',
      target: {
        projectId,
        databaseId,
        ...(expectedProjectId ? { expectedProjectId } : {}),
        ...(expectedDatabaseId ? { expectedDatabaseId } : {})
      },
      dataset
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (mode === 'emulator') {
    const projectId = parseArg('project-id');
    const databaseId = parseArg('database-id') || CANONICAL_DATABASE_ID;
    const requiredDb = expectedDatabaseId || CANONICAL_DATABASE_ID;

    if (!projectId) {
      throw new MembershipAuditError(
        'INVALID_TARGET_CONFIG',
        '--mode=emulator exige --project-id explícito (sem fallback para projeto de produção).'
      );
    }

    // Valida FIRESTORE_EMULATOR_HOST local e target ANTES de importar firebase-admin
    parseAndValidateLocalEmulatorHost(process.env.FIRESTORE_EMULATOR_HOST);
    validateAuditTargetConfig({
      projectId,
      databaseId,
      expectedProjectId: expectedProjectId || projectId,
      expectedDatabaseId: requiredDb
    });

    const { initializeApp, deleteApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const app = initializeApp({ projectId }, `cli-audit-${Date.now()}`);
    try {
      const db = getFirestore(app, databaseId);
      const report = await MembershipAuditTool.auditFirestoreDatabase({
        firestoreDb: db as any,
        target: {
          projectId,
          databaseId,
          expectedProjectId: expectedProjectId || projectId,
          expectedDatabaseId: requiredDb
        }
      });
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await deleteApp(app);
    }
    return;
  }

  throw new MembershipAuditError(
    'REMOTE_ACCESS_DISABLED_IN_GATE',
    `Modo "${mode}" não permitido neste gate local (somente --mode=synthetic ou --mode=emulator).`
  );
}

main().catch(err => {
  const code = err instanceof MembershipAuditError ? `[${err.code}] ` : '';
  console.error(`ERRO NA AUDITORIA READ-ONLY: ${code}${err?.message || String(err)}`);
  process.exit(1);
});
