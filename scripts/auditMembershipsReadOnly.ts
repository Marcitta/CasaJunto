/**
 * CLI estritamente READ-ONLY para diagnóstico de familyMemberships (B.5.5-PRE-PILOT-G1 / BLOCO C).
 *
 * Uso seguro local (sintético, sem rede):
 *   npx tsx scripts/auditMembershipsReadOnly.ts --mode=synthetic
 *
 * Uso contra Firebase Emulator local:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 npx tsx scripts/auditMembershipsReadOnly.ts \
 *     --mode=emulator \
 *     --project-id=demo-no-project \
 *     --database-id=ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c
 */

import {
  CANONICAL_DATABASE_ID,
  MembershipAuditTool
} from '../functions/src/services/membershipAuditTool';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const mode = parseArg('mode') || 'synthetic';
  const projectId = parseArg('project-id') || 'trusty-coder-386311';
  const databaseId = parseArg('database-id') || CANONICAL_DATABASE_ID;

  if (mode === 'synthetic') {
    const dataset = MembershipAuditTool.buildSyntheticDiagnosticFixture();
    const report = MembershipAuditTool.auditDataset({
      mode: 'synthetic',
      target: { projectId, databaseId },
      dataset
    });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (mode === 'emulator') {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      console.error('BLOQUEADO: --mode=emulator exige FIRESTORE_EMULATOR_HOST definido.');
      process.exit(1);
    }
    const { initializeApp, deleteApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    const app = initializeApp({ projectId }, `cli-audit-${Date.now()}`);
    try {
      const db = getFirestore(app, databaseId);
      const report = await MembershipAuditTool.auditFirestoreDatabase({
        firestoreDb: db as any,
        target: { projectId, databaseId }
      });
      console.log(JSON.stringify(report, null, 2));
    } finally {
      await deleteApp(app);
    }
    return;
  }

  console.error(
    `BLOQUEADO: Modo "${mode}" não permitido neste gate local (somente --mode=synthetic ou --mode=emulator).`
  );
  process.exit(1);
}

main().catch(err => {
  console.error(`ERRO NA AUDITORIA READ-ONLY: ${err?.message || String(err)}`);
  process.exit(1);
});
