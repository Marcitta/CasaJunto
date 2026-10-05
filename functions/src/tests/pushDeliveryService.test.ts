/**
 * CASA JUNTO — FUNCTIONS LOCAL TEST RUNNER
 */

import { runNotifications1b1Tests } from '../../../src/tests/notifications1b1.test';

async function main() {
  console.log('--- EXECUTANDO TESTES ISOLADOS DE CLOUD FUNCTIONS (NOTIFICATIONS-1B.1) ---');
  const res = await runNotifications1b1Tests();
  let failed = 0;
  for (const r of res.results) {
    if (r.passed) {
      console.log(`[✓ PASS] ${r.testName}`);
    } else {
      failed++;
      console.error(`[✗ FAIL] ${r.testName}: ${r.message}`);
    }
  }
  console.log(`\nTOTAL: ${res.results.length} | PASS: ${res.passed} | FAIL: ${res.failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
