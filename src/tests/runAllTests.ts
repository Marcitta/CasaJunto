import { runTaskCatalogTestSuite } from './taskCatalogBatch.test';
import { runAdminDashboardTestSuite } from './adminDashboard.test';
import { runAllScenariosRegression } from './distributionRegression.test';
import { runConcurrencyTestSuite } from './concurrency.test';
import { runAdminManagementTestSuite } from './adminManagement.test';
import { runAdminInvariantTestSuite } from './adminInvariant.test';
import { runBootstrapRulesTestSuite } from './bootstrapRules.test';
import { runAuthAndFamilyEntryTests } from './authAndFamilyEntry.test';
import { runMemberProfileTestSuite } from './memberProfile.test';
import { runAvailabilityTestSuite } from './availability.test';
import { runDistributionIntegrationTestSuite } from './distributionIntegration.test';
import { runRoomManagementTestSuite } from './roomManagement.test';
import { runCoreJourneyTestSuite } from './coreJourney.test';
import { runCompletionAuthTestSuite } from './completionAuth.test';
import { runRoutineContinuityTestSuite } from './routineContinuity.test';
import { runTodayViewScopeTestSuite } from './todayViewScope.test';
import { runTaskCatalogBatchTests } from './taskCatalogBatchUI.test';
import { runResponsiveShellTestSuite } from './responsiveShell.test';
import { runTodayMobileHardeningTestSuite } from './todayMobileHardening.test';
import { runHotfixFunc1TestSuite } from './hotfixFunc1.test';
import { runHotfixFunc1aTestSuite } from './hotfixFunc1a.test';
import { runStabilization1aTests } from './stabilization1a.test';
import { runStabilization1bTests } from './stabilization1b.test';
import { runTaskCatalogRedesignUXTests } from './taskCatalogRedesignUX.test';
import { runStabilization1cTests } from './stabilization1c.test';
import { runEditTaskModalUXTests } from './editTaskModalUX.test';
import { runHotfixDup1Tests } from './hotfixDup1.test';
import { runDataRepairDup1TestSuite } from './dataRepairDup1.test';
import { runTodayProgressMetricTestSuite } from './todayProgressMetric.test';
import { runFamilyJoinTestSuite } from './familyJoin.test';
import { runMemberRbac1TestSuite } from './memberRbac1.test';
import { runInviteLifecycleUXTestSuite } from './inviteLifecycleUX.test';
import { runChaosSession1aTestSuite } from './chaosSession1a.test';
import { runChaosSession1bTestSuite } from './chaosSession1b.test';
import { runChaosSession1cTestSuite } from './chaosSession1c.test';
import { runChaosSession1dTestSuite } from './chaosSession1d.test';
import { runChaosSession1dHf1TestSuite } from './chaosSession1dHf1.test';
import { runChaosSession1dHf2TestSuite } from './chaosSession1dHf2.test';
import { runChaosSession1dHf3TestSuite } from './chaosSession1dHf3.test';
import { runCanonicalCustomTaskTests } from './canonicalCustomTask.test';
import { runFamilyLoadErrorTestSuite } from './familyLoadError.test';
import { runSecurityRecoveryRulesTestSuite } from './securityRecoveryRules.test';
import { runRoutineDecouplingR2DTestSuite } from './routineDecouplingR2D.test';
import { runChaosSession1dHf4TestSuite } from './chaosSession1dHf4.test';
import { runChaosSession1dHf4R3TestSuite } from './chaosSession1dHf4R3.test';
import { runChaosSession1dHf5TestSuite } from './chaosSession1dHf5.test';
import { runStabilizationCloseout1aTestSuite } from './stabilizationCloseout1a.test';
import { runDomesticSupport1aTestSuite } from './domesticSupport1a.test';
import { runDomesticSupport1bTestSuite } from './domesticSupport1b.test';

console.log('================================================================');
console.log('CASA JUNTO — SUÍTE INTEGRADA COMPLETA DE REGRESSÃO');
console.log('================================================================\n');

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;

// 1. Task Catalog
console.log('--- GRUPO 1: TASK CATALOG (10 TESTES) ---');
const catalogResults = runTaskCatalogTestSuite();
for (const r of catalogResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Catálogo T${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Catálogo T${r.id}: ${r.name}`);
  }
}

// 2. Admin Dashboard
console.log('\n--- GRUPO 2: ADMIN DASHBOARD (12 TESTES) ---');
const dashboardResults = runAdminDashboardTestSuite();
for (const r of dashboardResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Dashboard T${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Dashboard T${r.id}: ${r.name}`);
  }
}

// 3. Motor 2.0 Regression
console.log('\n--- GRUPO 3: MOTOR 2.0 REGRESSION (3 CENÁRIOS) ---');
const motorResults = runAllScenariosRegression();
for (const r of motorResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Motor 2.0 ${r.scenarioId}: ${r.scenarioName} (Fairness: ${r.fairnessIndex}%)`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Motor 2.0 ${r.scenarioId}: ${r.scenarioName}`);
  }
}

// 4. Concurrency / Idempotency
console.log('\n--- GRUPO 4: CONCURRENCY & IDEMPOTENCY (4 TESTES) ---');
const concurrencyResults = runConcurrencyTestSuite();
for (const r of concurrencyResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Concurrency T${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Concurrency T${r.id}: ${r.name}`);
  }
}

// 5. Admin Management
console.log('\n--- GRUPO 5: ADMIN MANAGEMENT (11 TESTES) ---');
const adminMgmtResults = runAdminManagementTestSuite();
for (const r of adminMgmtResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Admin Mgmt ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Admin Mgmt ${r.id}: ${r.name}`);
  }
}

// 6. Admin Invariant
console.log('\n--- GRUPO 6: ADMIN INVARIANT (17 TESTES) ---');
const adminInvariantResults = runAdminInvariantTestSuite();
for (const r of adminInvariantResults.results) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Invariant ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Invariant ${r.id}: ${r.name}`);
  }
}

// 7. Bootstrap Rules
console.log('\n--- GRUPO 7: BOOTSTRAP RULES (6 TESTES) ---');
const bootstrapResults = runBootstrapRulesTestSuite();
for (const r of bootstrapResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Bootstrap ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Bootstrap ${r.id}: ${r.name}`);
  }
}

// 8. Authentication, Family Entry & Real Family Onboarding
console.log('\n--- GRUPO 8: AUTHENTICATION, FAMILY ENTRY & ONBOARDING (21 TESTES) ---');
const authPassed = runAuthAndFamilyEntryTests();
// AF01 to AF21
const afTestCount = 21;
totalTests += afTestCount;
if (authPassed) {
  totalPassed += afTestCount;
} else {
  totalFailed += afTestCount;
}

// 9. Member Profile 1.0A
console.log('\n--- GRUPO 9: MEMBER PROFILE 1.0A (8 TESTES) ---');
const profileResults = runMemberProfileTestSuite();
for (const r of profileResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Perfil ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Perfil ${r.id}: ${r.name} - ${r.details || ''}`);
  }
}

// 10. Availability & Protected Times 1.0A
console.log('\n--- GRUPO 10: AVAILABILITY & PROTECTED TIMES 1.0A (10 TESTES) ---');
const availabilityResults = runAvailabilityTestSuite();
for (const r of availabilityResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Agenda ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Agenda ${r.id}: ${r.name} - ${r.details || ''}`);
  }
}

// 11. Distribution Engine Integration 1.0B
console.log('\n--- GRUPO 11: DISTRIBUTION ENGINE INTEGRATION 1.0B (12 TESTES) ---');
const distributionResults = runDistributionIntegrationTestSuite();
for (const r of distributionResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Distribuição ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Distribuição ${r.id}: ${r.name} - ${r.details || ''}`);
  }
}

// 12. Room / Environment Management 1.0
console.log('\n--- GRUPO 12: ROOM / ENVIRONMENT MANAGEMENT 1.0 (18 TESTES) ---');
const roomResults = runRoomManagementTestSuite();
for (const r of roomResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Ambientes ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Ambientes ${r.id}: ${r.name} - ${r.details || ''}`);
  }
}

// 13. Core Journey 1.0A (6 TESTES: CJ21 - CJ26)
console.log('\n--- GRUPO 13: CORE JOURNEY 1.0A (6 TESTES: CJ21 - CJ26) ---');
const coreJourneyResults = runCoreJourneyTestSuite();
for (const r of coreJourneyResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Core Journey ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Core Journey ${r.id}: ${r.name} - ${r.details || ''}`);
  }
}

// 14. PH-1 Completion Authorization & Proactivity (22 TESTES: AUTH01 - AUTH22)
console.log('\n--- GRUPO 14: PH-1 COMPLETION AUTHORIZATION & PROACTIVITY (22 TESTES: AUTH01 - AUTH22) ---');
const authResults = runCompletionAuthTestSuite();
for (const r of authResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Autorização ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Autorização ${r.id}: ${r.name} - Esperado: ${r.expected} | Obtido: ${r.actual}`);
  }
}

// 15. Routine Continuity 1.0 (42 TESTES: RC01 - RC42)
console.log('\n--- GRUPO 15: ROUTINE CONTINUITY 1.0 (42 TESTES: RC01 - RC42) ---');
const routineResults = runRoutineContinuityTestSuite();
for (const r of routineResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Rotina Contínua ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Rotina Contínua ${r.id}: ${r.name} - Esperado: ${r.expected} | Obtido: ${r.actual}`);
  }
}

// 16. TodayView Date Scope Hotfix PV2-HF1 (17 TESTES: TV01 - TV17)
console.log('\n--- GRUPO 16: TODAYVIEW DATE SCOPE HOTFIX (17 TESTES: TV01 - TV17) ---');
const todayViewResults = runTodayViewScopeTestSuite();
for (const r of todayViewResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] TodayView ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] TodayView ${r.id}: ${r.name} - Esperado: ${r.expected} | Obtido: ${r.actual}`);
  }
}

// 17. Task Catalog Batch UI (16 TESTES: TC-B01 - TC-B16)
console.log('\n--- GRUPO 17: TASK CATALOG BATCH UI (16 TESTES: TC-B01 - TC-B16) ---');
const batchUIResults = await runTaskCatalogBatchTests();
totalTests += batchUIResults.passed + batchUIResults.failed;
totalPassed += batchUIResults.passed;
totalFailed += batchUIResults.failed;

// 18. Mobile-1B: Core Navigation & Responsive Shell (18 TESTES: MB01 - MB18)
console.log('\n--- GRUPO 18: MOBILE-1B RESPONSIVE SHELL (18 TESTES: MB01 - MB18) ---');
const shellResults = runResponsiveShellTestSuite();
for (const r of shellResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Responsive Shell ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Responsive Shell ${r.id}: ${r.name} - Esperado: ${r.expected} | Obtido: ${r.actual}`);
  }
}

// 19. Mobile-1C: Today Mobile Hardening (24 TESTES: MC01 - MC24)
console.log('\n--- GRUPO 19: MOBILE-1C TODAY MOBILE HARDENING (24 TESTES: MC01 - MC24) ---');
const mobileResults = runTodayMobileHardeningTestSuite();
for (const r of mobileResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Mobile-1C ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Mobile-1C ${r.id}: ${r.name} - Esperado: ${r.expected} | Obtido: ${r.actual}`);
  }
}

// 20. HOTFIX-FUNC-1: Manual Assignment + Rebalance Save (14 TESTES: HF01 - HF14)
console.log('\n--- GRUPO 20: HOTFIX-FUNC-1 MANUAL ASSIGNMENT & REBALANCE SAVE (14 TESTES: HF01 - HF14) ---');
const hotfixResults = await runHotfixFunc1TestSuite();
for (const r of hotfixResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Hotfix-1 ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Hotfix-1 ${r.id}: ${r.name} - Esperado: ${r.expected} | Obtido: ${r.actual}`);
  }
}

// 21. HOTFIX-FUNC-1A: Firestore Undefined Payload (10 TESTES: HR01 - HR10)
console.log('\n--- GRUPO 21: HOTFIX-FUNC-1A FIRESTORE UNDEFINED PAYLOAD (10 TESTES: HR01 - HR10) ---');
const hotfix1aResults = await runHotfixFunc1aTestSuite();
for (const r of hotfix1aResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Hotfix-1A ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Hotfix-1A ${r.id}: ${r.name} - Esperado: ${r.expected} | Obtido: ${r.actual}`);
  }
}

// 22. STABILIZATION-1A: Task Editing & Deactivation Persistence (10 TESTES: S1A-01 - S1A-10)
const stab1aResults = await runStabilization1aTests();
totalTests += (stab1aResults.passed + stab1aResults.failed);
totalPassed += stab1aResults.passed;
totalFailed += stab1aResults.failed;

// 23. STABILIZATION-1B: Member Deactivation Consistency (12 TESTES: MD01 - MD12)
const stab1bResults = await runStabilization1bTests();
totalTests += (stab1bResults.passed + stab1bResults.failed);
totalPassed += stab1bResults.passed;
totalFailed += stab1bResults.failed;

// 24. UX-CATALOG-1: Task Catalog Redesign UX (14 TESTES: UXC01 - UXC14)
console.log('\n--- GRUPO 24: UX-CATALOG-1 TASK CATALOG REDESIGN (14 TESTES: UXC01 - UXC14) ---');
const uxcResults = await runTaskCatalogRedesignUXTests();
for (const r of uxcResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] UX-Catalog ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] UX-Catalog ${r.id}: ${r.name} - Esperado: ${r.expected} | Obtido: ${r.actual}`);
  }
}

// 25. STABILIZATION-1C: Disabled Routine Leakage into Today (13 TESTES: DL01 - DL12)
const stab1cResults = await runStabilization1cTests();
totalTests += (stab1cResults.passed + stab1cResults.failed);
totalPassed += stab1cResults.passed;
totalFailed += stab1cResults.failed;

// 26. UX-TASK-EDIT-1: Remove Internal Technical Language From Edit Task Modal (8 TESTES: ET01 - ET08)
console.log('\n--- GRUPO 26: UX-TASK-EDIT-1 (EDIT TASK MODAL COPY REFINEMENT - ET01-ET08) ---');
const editModalResults = await runEditTaskModalUXTests();
for (const r of editModalResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] EditModal ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] EditModal ${r.id}: ${r.name} - Esperado: ${r.expected} | Obtido: ${r.actual}`);
  }
}

// 27. HOTFIX-DUP-1: Canonical Occurrence Duplication Prevention (15 TESTES: DU01 - DU15)
const hotfixDupResults = await runHotfixDup1Tests();
totalTests += (hotfixDupResults.passed + hotfixDupResults.failed);
totalPassed += hotfixDupResults.passed;
totalFailed += hotfixDupResults.failed;

// 28. DATA-REPAIR-DUP-1: Existing Duplicate FamilyTask Consolidation & PO Decision (15 TESTES: DR01 - DR15)
console.log('\n--- GRUPO 28: DATA-REPAIR-DUP-1 (DATA REPAIR CONSOLIDATION - DR01-DR15) ---');
const dataRepairResults = await runDataRepairDup1TestSuite();
for (const r of dataRepairResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] DataRepair ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] DataRepair ${r.id}: ${r.name} - ${r.message}`);
  }
}

// 29. HOTFIX-METRIC-1: Today Progress - Date Scope & Operational Data Integrity (15 TESTES: HM01 - HM15)
console.log('\n--- GRUPO 29: HOTFIX-METRIC-1 (TODAY PROGRESS - HM01-HM15) ---');
const metricResults = runTodayProgressMetricTestSuite();
for (const r of metricResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Metric ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Metric ${r.id}: ${r.name} - ${r.actual}`);
  }
}

// 30. FAMILY-JOIN-1 / 1B / 1D / 1F / 1G / 1I: Existing Family Join, Reuse Hotfix & Optional Member Fields (80 TESTES: FJ01 - FJ80)
console.log('\n--- GRUPO 30: FAMILY-JOIN-1 / 1D / 1F / 1G / 1I (CANONICAL INVITE, ATOMIC ACCEPT & RULES HOTFIX - FJ01-FJ80) ---');
const joinResults = runFamilyJoinTestSuite();
for (const r of joinResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] FamilyJoin ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] FamilyJoin ${r.id}: ${r.name} - ${r.message || ''}`);
  }
}

// 31. MEMBER-RBAC-1: Member Role-Based Access Control & Defense in Depth (RB01 - RB36)
console.log('\n--- GRUPO 31: MEMBER-RBAC-1 (AUTHORIZATION & DEFENSE IN DEPTH - RB01-RB36) ---');
const rbacResults = runMemberRbac1TestSuite();
for (const r of rbacResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] MemberRBAC ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] MemberRBAC ${r.id}: ${r.name} - ${r.actual}`);
  }
}

// 32. UX-INVITE-1: Invite Code Lifecycle — Regenerate Invite Code (15 TESTES: UXI01 - UXI15)
console.log('\n--- GRUPO 32: UX-INVITE-1 (INVITE CODE LIFECYCLE & REGENERATION - UXI01-UXI15) ---');
const uxiResults = runInviteLifecycleUXTestSuite();
for (const r of uxiResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] InviteLifecycle ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] InviteLifecycle ${r.id}: ${r.name} - ${r.message || ''}`);
  }
}

// 33. CHAOS-1A: Modo Caos — Domain, Persistence & Security Foundation (30 TESTES: CHA01 - CHA30)
console.log('\n--- GRUPO 33: CHAOS-1A (MODO CAOS DOMAIN, CONCURRENCY LOCK & SECURITY - CHA01-CHA30) ---');
const chaosResults = runChaosSession1aTestSuite();
for (const r of chaosResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1A ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1A ${r.id}: ${r.name} - ${r.actual || r.message || ''}`);
  }
}

// 34. CHAOS-1B: Modo Caos — Task Integration + Motor 2.0 + PH-1 (43 TESTES: CHB01 - CHB43)
console.log('\n--- GRUPO 34: CHAOS-1B (MODO CAOS TASK INTEGRATION, MOTOR 2.0 & PH-1 - CHB01-CHB43) ---');
const chaos1bResults = await runChaosSession1bTestSuite();
for (const r of chaos1bResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1B ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1B ${r.id}: ${r.name} - ${r.actual || r.message || ''}`);
  }
}

// 35. CHAOS-1C: Modo Caos — Bonus + Closure + Time Extension + Historical Snapshot (50 TESTES: CHC01 - CHC50)
console.log('\n--- GRUPO 35: CHAOS-1C (MODO CAOS BONUS, CLOSURE, EXTENSION & SNAPSHOT - CHC01-CHC50) ---');
const chaos1cResults = await runChaosSession1cTestSuite();
for (const r of chaos1cResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1C ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1C ${r.id}: ${r.name} - ${r.actual || r.message || ''}`);
  }
}

// 36. CHAOS-1D: Modo Caos — UX + End-to-End Product Integration (56 TESTES: CHD01 - CHD56)
console.log('\n--- GRUPO 36: CHAOS-1D (MODO CAOS UX + END-TO-END PRODUCT INTEGRATION - CHD01-CHD56) ---');
const chaos1dResults = runChaosSession1dTestSuite();
for (const r of chaos1dResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1D ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1D ${r.id}: ${r.name} - ${r.error || ''}`);
  }
}

// 37. CHAOS-1D-HF1: Manual QA Hotfix — Start Failure + Batch Task Selection + Strategy Clarity (15 TESTES: HF1-01 - HF1-15)
console.log('\n--- GRUPO 37: CHAOS-1D-HF1 (MANUAL QA HOTFIX — HF1-01-HF1-15) ---');
const chaos1dHf1Results = await runChaosSession1dHf1TestSuite();
for (const r of chaos1dHf1Results) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1D-HF1 ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1D-HF1 ${r.id}: ${r.name} - ${r.error || ''}`);
  }
}

// 38. CHAOS-1D-HF2: Manual QA Hotfix — Member Open_Pool Self-Claim + Realtime Propagation (16 TESTES: HF2-01 - HF2-16)
console.log('\n--- GRUPO 38: CHAOS-1D-HF2 (MEMBER OPEN_POOL SELF-CLAIM + REALTIME PROPAGATION - HF2-01-HF2-16) ---');
const chaos1dHf2Results = await runChaosSession1dHf2TestSuite();
for (const r of chaos1dHf2Results) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1D-HF2 ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1D-HF2 ${r.id}: ${r.name} - ${r.error || ''}`);
  }
}

// 39. CHAOS-1D-HF3: Manual QA Hotfix — Completed Task Eligibility + Assisted 100% Closure (28 TESTES: HF3-01 - HF3-28)
console.log('\n--- GRUPO 39: CHAOS-1D-HF3 (COMPLETED TASK ELIGIBILITY + ASSISTED 100% CLOSURE - HF3-01-HF3-28) ---');
const chaos1dHf3Results = await runChaosSession1dHf3TestSuite();
for (const r of chaos1dHf3Results) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1D-HF3 ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1D-HF3 ${r.id}: ${r.name} - ${r.error || ''}`);
  }
}

// 40. HOTFIX-TASK-CREATE-1: Canonical Custom Family Task Creation & Data Repair (30 TESTES: TC01 - TC30)
console.log('\n--- GRUPO 40: HOTFIX-TASK-CREATE-1 (CANONICAL CUSTOM FAMILY TASK CREATION & DATA REPAIR - TC01-TC30) ---');
const taskCreateResults = await runCanonicalCustomTaskTests();
for (const r of taskCreateResults.results) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] TaskCreate: ${r.testName}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] TaskCreate: ${r.testName} - ${r.message || ''}`);
  }
}

// 41. FAMILY-LOAD-ERROR: Quota Limit Exceeded & Technical Error Resilience (7 TESTES: FLE-01 - FLE-07)
console.log('\n--- GRUPO 41: FAMILY-LOAD-ERROR & QUOTA RESILIENCE (7 TESTES: FLE-01 - FLE-07) ---');
const familyLoadErrorResults = runFamilyLoadErrorTestSuite();
for (const r of familyLoadErrorResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] FamilyLoadError ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] FamilyLoadError ${r.id}: ${r.name} - ${r.error || ''}`);
  }
}

// 42. SECURITY-RECOVERY-RULES: Tenant Isolation & Strict RBAC Restoration (12 TESTES: SEC-REC-01 - SEC-REC-12)
console.log('\n--- GRUPO 42: SECURITY RECOVERY RULES (12 TESTES: SEC-REC-01 - SEC-REC-12) ---');
const secRecResults = runSecurityRecoveryRulesTestSuite();
for (const r of secRecResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] SecurityRecovery ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] SecurityRecovery ${r.id}: ${r.name} - ${r.reason || ''}`);
  }
}

// 43. HOTFIX-TASK-CREATE-1-R2D: Routine Generation & Distribution Decoupling (20 TESTES: TC-R2D-01 - TC-R2D-20)
console.log('\n--- GRUPO 43: HOTFIX-TASK-CREATE-1-R2D (ROUTINE DECOUPLING - TC-R2D-01 - TC-R2D-20) ---');
const r2dResults = await runRoutineDecouplingR2DTestSuite();
for (const r of r2dResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] RoutineDecouplingR2D ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] RoutineDecouplingR2D ${r.id}: ${r.name} - ${r.error || ''}`);
  }
}

// 44. CHAOS-1D-HF4: Participant Scoping & 100% Prompt (36 TESTES: CHF4-01 - CHF4-22, CHF4R1-01 - CHF4R1-14)
console.log('\n--- GRUPO 44: CHAOS-1D-HF4 (PARTICIPANT SCOPING & 100% PROMPT - CHF4-01 - CHF4-22) ---');
const hf4Results = await runChaosSession1dHf4TestSuite();
for (const r of hf4Results) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1D-HF4 ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1D-HF4 ${r.id}: ${r.name} - ${r.error || ''} [Expected: ${r.expected || ''}, Actual: ${r.actual || ''}]`);
  }
}

// 45. CHAOS-1D-HF4-R3: Runtime Firestore Serialization Boundary (15 TESTES: R3-01 - R3-15)
console.log('\n--- GRUPO 45: CHAOS-1D-HF4-R3 (RUNTIME FIRESTORE SERIALIZATION BOUNDARY - R3-01 - R3-15) ---');
const hf4r3Results = await runChaosSession1dHf4R3TestSuite();
for (const r of hf4r3Results) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1D-HF4-R3 ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1D-HF4-R3 ${r.id}: ${r.name} - ${r.error || ''} [Expected: ${r.expected || ''}, Actual: ${r.actual || ''}]`);
  }
}

// 46. CHAOS-1D-HF5: Session-Scoped Completion & ONE_TIME Eligibility (24 TESTES: HF5-01 - HF5-24)
console.log('\n--- GRUPO 46: CHAOS-1D-HF5 (SESSION-SCOPED COMPLETION & ONE_TIME ELIGIBILITY - HF5-01 - HF5-24) ---');
const hf5Results = await runChaosSession1dHf5TestSuite();
for (const r of hf5Results) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Chaos1D-HF5 ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Chaos1D-HF5 ${r.id}: ${r.name} - ${r.error || ''} [Expected: ${JSON.stringify(r.expected)}, Actual: ${JSON.stringify(r.actual)}]`);
  }
}

// 47. STABILIZATION-CLOSEOUT-1A: Canonical Assignment Reload & Scoped Completion (18 TESTES: SC1A-01 - SC1A-18)
console.log('\n--- GRUPO 47: STABILIZATION-CLOSEOUT-1A (CANONICAL ASSIGNMENT RELOAD & SCOPED COMPLETION - SC1A-01 - SC1A-18) ---');
const sc1aResults = await runStabilizationCloseout1aTestSuite();
for (const r of sc1aResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] Stabilization1A ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] Stabilization1A ${r.id}: ${r.name} - ${r.error || ''}`);
  }
}

// 48. DOMESTIC-SUPPORT-1A: Domain + Persistence Foundation for Ajuda Externa / Diarista (25 TESTES: DS1A-01 - DS1A-25)
console.log('\n--- GRUPO 48: DOMESTIC-SUPPORT-1A (DOMAIN & PERSISTENCE FOUNDATION - DS1A-01 - DS1A-25) ---');
const ds1aResults = await runDomesticSupport1aTestSuite();
for (const r of ds1aResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] DomesticSupport1A ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] DomesticSupport1A ${r.id}: ${r.name} - ${r.error || ''}`);
  }
}

// 49. DOMESTIC-SUPPORT-1B: Gestão da Ajuda Externa — ADMIN UX (25 TESTES: DS1B-01 - DS1B-25)
console.log('\n--- GRUPO 49: DOMESTIC-SUPPORT-1B (GESTÃO DA AJUDA EXTERNA - ADMIN UX - DS1B-01 - DS1B-25) ---');
const ds1bResults = await runDomesticSupport1bTestSuite();
for (const r of ds1bResults) {
  totalTests++;
  if (r.passed) {
    totalPassed++;
    console.log(`[✓ PASS] DomesticSupport1B ${r.id}: ${r.name}`);
  } else {
    totalFailed++;
    console.log(`[✗ FAIL] DomesticSupport1B ${r.id}: ${r.name} - ${r.error || ''}`);
  }
}

console.log('\n================================================================');
console.log('RESUMO DA SUÍTE INTEGRADA:');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`TOTAL PASS:  ${totalPassed}`);
console.log(`TOTAL FAIL:  ${totalFailed}`);
console.log('STATUS: ' + (totalFailed === 0 ? 'TODOS OS TESTES PASSARAM COM SUCESSO!' : 'FALHA'));
console.log('================================================================');

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
