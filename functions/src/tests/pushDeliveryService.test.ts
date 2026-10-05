/**
 * CASA JUNTO — FUNCTIONS LOCAL TEST RUNNER
 */

import { runNotifications1b1Tests } from '../../../src/tests/notifications1b1.test';
import { runNotifications1b1Hf1Tests } from '../../../src/tests/notifications1b1Hf1.test';

async function main() {
  console.log('--- EXECUTANDO TESTES ISOLADOS DE CLOUD FUNCTIONS (NOTIFICATIONS-1B.1 & 1B.1-HF1) ---');
  let failed = 0;
  let total = 0;
  let passed = 0;

  const res1 = await runNotifications1b1Tests();
  for (const r of res1.results) {
    total++;
    if (r.passed) {
      passed++;
      console.log(`[✓ PASS] ${r.testName}`);
    } else {
      failed++;
      console.error(`[✗ FAIL] ${r.testName}: ${r.message}`);
    }
  }

  const res2 = await runNotifications1b1Hf1Tests();
  for (const r of res2.results) {
    total++;
    if (r.passed) {
      passed++;
      console.log(`[✓ PASS] ${r.testName}`);
    } else {
      failed++;
      console.error(`[✗ FAIL] ${r.testName}: ${r.message}`);
    }
  }

  console.log(`\nTOTAL: ${total} | PASS: ${passed} | FAIL: ${failed}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
