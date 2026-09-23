import { runTaskCatalogTestSuite } from './taskCatalogBatch.test';

console.log('=====================================================');
console.log('CASA JUNTO — TESTES DO CATÁLOGO DE TAREFAS');
console.log('=====================================================');

const results = runTaskCatalogTestSuite();
let allPassed = true;

for (const res of results) {
  const statusIcon = res.passed ? '✓ PASS' : '✗ FAIL';
  console.log(`[${statusIcon}] TESTE ${res.id}: ${res.name}`);
  console.log(`       Esperado: ${res.expected}`);
  console.log(`       Obtido:   ${res.actual}`);
  if (res.details) {
    console.log(`       Detalhes: ${res.details}`);
  }
  if (!res.passed) {
    allPassed = false;
  }
}

console.log('=====================================================');
if (allPassed) {
  console.log('STATUS FINAL: TODOS OS 10 TESTES PASSARAM COM SUCESSO! (10/10 PASS)');
} else {
  console.log('STATUS FINAL: ALGUNS TESTES FALHARAM!');
  process.exit(1);
}
