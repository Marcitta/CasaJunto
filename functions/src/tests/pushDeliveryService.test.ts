/**
 * CASA JUNTO — FUNCTIONS LOCAL TEST RUNNER
 */

import { runNotifications1b1Tests } from '../../../src/tests/notifications1b1.test';
import { runNotifications1b1Hf1Tests } from '../../../src/tests/notifications1b1Hf1.test';
import { runNotifications1b2Tests } from '../../../src/tests/notifications1b2.test';
import { runNotifications1b2Hf1Tests } from '../../../src/tests/notifications1b2Hf1.test';

async function main() {
  console.log('--- EXECUTANDO TESTES ISOLADOS DE CLOUD FUNCTIONS (NOTIFICATIONS-1B.1, 1B.1-HF1, 1B.2, 1B.2-HF1) ---');
  let failed = 0;
  let total = 0;
  let passed = 0;

  const suites = [
    { name: '1B.1', fn: runNotifications1b1Tests },
    { name: '1B.1-HF1', fn: runNotifications1b1Hf1Tests },
    { name: '1B.2', fn: runNotifications1b2Tests },
    { name: '1B.2-HF1', fn: runNotifications1b2Hf1Tests }
  ];

  for (const suite of suites) {
    const res = await suite.fn();
    for (const r of res.results) {
      total++;
      if (r.passed) {
        passed++;
        console.log(`[✓ PASS] ${r.testName}`);
      } else {
        failed++;
        console.error(`[✗ FAIL] ${r.testName}: ${r.message}`);
      }
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
