/**
 * CasaJunto — B.5.5-HF1: Etapa D-A: Testes Automatizados de Contratos e Helpers Puros
 * Cobertura de Unicidade, Compatibilidade Retroativa, Agregações, Idempotência e Tratamento de Falhas.
 */

import {
  buildRoutineIndexKey,
  buildTenantRoutineIndexKey,
  generateBatchOperationId,
  detectDuplicatePayloadCombinations,
  classifyItemOperationStatus,
  aggregateGranularBatchResults,
  getRetryableBatchItems,
  identifyUnknownCommits,
  sanitizeKeyComponent
} from '../domain/routine/multiRoomBatchContracts';
import { BatchRoutineItemResult, GranularBatchAddResult, BatchAddResult } from '../types';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runTaskMultiRoomContractsBlocoDATests(): TestResult[] {
  const results: TestResult[] = [];

  // ---------------------------------------------------------------------------
  // TESTE 1: Unicidade de chaves e sanitização de caracteres especiais
  // ---------------------------------------------------------------------------
  try {
    const key1 = buildRoutineIndexKey('tm-cleaning', 'room-kitchen');
    const key2 = buildRoutineIndexKey('tm-cleaning', 'room-living');
    if (key1 === key2) {
      throw new Error(`Chaves para cômodos diferentes devem ser distintas. k1=${key1}, k2=${key2}`);
    }

    // Caracteres especiais: barras, espaços, e o delimitador triplo "___"
    const safeComp = sanitizeKeyComponent('quarto / suite principal ___ 100%');
    if (safeComp.includes('/') || safeComp.includes('___')) {
      throw new Error(`Sanitização não removeu barras ou delimitador triplo: ${safeComp}`);
    }

    const keySpecial1 = buildRoutineIndexKey('tm/special/task', 'room/suite');
    const keySpecial2 = buildRoutineIndexKey('tm-special-task', 'room-suite');
    if (keySpecial1 === keySpecial2) {
      throw new Error('Chaves com barras codificadas não devem colidir com chaves com hífens.');
    }

    results.push({
      id: 'B55HF1-DA-01',
      name: 'Unicidade de chaves canônicas e sanitização contra caracteres especiais e delimitadores',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-01',
      name: 'Unicidade de chaves canônicas e sanitização contra caracteres especiais e delimitadores',
      passed: false,
      details: err.message
    });
  }

  // ---------------------------------------------------------------------------
  // TESTE 2: Compatibilidade estrita com o contrato existente BatchAddResult
  // ---------------------------------------------------------------------------
  try {
    const items: BatchRoutineItemResult[] = [
      { taskMasterId: 'tm-1', roomId: 'r-1', status: 'CREATED', retryable: false },
      { taskMasterId: 'tm-2', roomId: 'r-2', status: 'REACTIVATED', retryable: false },
      { taskMasterId: 'tm-3', roomId: 'r-3', status: 'ALREADY_ACTIVE', retryable: false },
      { taskMasterId: 'tm-4', roomId: 'r-4', status: 'FAILED', error: 'Permissão negada', retryable: true }
    ];

    const aggregated: GranularBatchAddResult = aggregateGranularBatchResults(items, 'op_test_123');

    // Validação de tipos: atribuível diretamente a BatchAddResult
    const legacyCompatible: BatchAddResult = aggregated;

    if (legacyCompatible.added !== 1) {
      throw new Error(`added esperado 1, recebido: ${legacyCompatible.added}`);
    }
    if (legacyCompatible.reactivated !== 1) {
      throw new Error(`reactivated esperado 1, recebido: ${legacyCompatible.reactivated}`);
    }
    if (legacyCompatible.skipped !== 1) {
      throw new Error(`skipped esperado 1, recebido: ${legacyCompatible.skipped}`);
    }
    if (legacyCompatible.failed.length !== 1 || legacyCompatible.failed[0] !== 'tm-4') {
      throw new Error(`failed esperado ['tm-4'], recebido: ${JSON.stringify(legacyCompatible.failed)}`);
    }

    results.push({
      id: 'B55HF1-DA-02',
      name: 'Compatibilidade estrita com BatchAddResult (added, reactivated, skipped, failed)',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-02',
      name: 'Compatibilidade estrita com BatchAddResult (added, reactivated, skipped, failed)',
      passed: false,
      details: err.message
    });
  }

  // ---------------------------------------------------------------------------
  // TESTE 3: Cenário de Sucesso Parcial
  // ---------------------------------------------------------------------------
  try {
    const items: BatchRoutineItemResult[] = [
      { taskMasterId: 'tm-clean', roomId: 'sala', status: 'CREATED', retryable: false },
      { taskMasterId: 'tm-clean', roomId: 'cozinha', status: 'FAILED', error: 'Network timeout', retryable: true },
      { taskMasterId: 'tm-clean', roomId: 'quarto', status: 'CREATED', retryable: false }
    ];

    const result = aggregateGranularBatchResults(items);

    if (result.success !== false) {
      throw new Error('Em sucesso parcial, success deve ser false.');
    }
    if (result.added !== 2) {
      throw new Error(`added esperado 2, recebido: ${result.added}`);
    }
    if (result.failed.length !== 1 || result.failed[0] !== 'tm-clean') {
      throw new Error('Falha deve conter o taskMasterId do item com erro.');
    }
    if (result.summary?.failed !== 1 || result.summary?.created !== 2) {
      throw new Error('Summary diverge da contagem real.');
    }

    results.push({
      id: 'B55HF1-DA-03',
      name: 'Agregação correta em cenário de Sucesso Parcial',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-03',
      name: 'Agregação correta em cenário de Sucesso Parcial',
      passed: false,
      details: err.message
    });
  }

  // ---------------------------------------------------------------------------
  // TESTE 4: Cenário de Falha Total
  // ---------------------------------------------------------------------------
  try {
    const items: BatchRoutineItemResult[] = [
      { taskMasterId: 'tm-a', roomId: 'r-1', status: 'FAILED', error: 'Database locked', retryable: true },
      { taskMasterId: 'tm-b', roomId: 'r-2', status: 'FAILED', error: 'Permission denied', retryable: true }
    ];

    const result = aggregateGranularBatchResults(items);

    if (result.success !== false) {
      throw new Error('Falha total deve ter success = false.');
    }
    if (result.added !== 0 || result.reactivated !== 0 || result.skipped !== 0) {
      throw new Error('Contadores de sucesso devem ser zero.');
    }
    if (result.failed.length !== 2) {
      throw new Error(`failed esperado com 2 itens, recebido: ${result.failed.length}`);
    }

    results.push({
      id: 'B55HF1-DA-04',
      name: 'Agregação correta em cenário de Falha Total',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-04',
      name: 'Agregação correta em cenário de Falha Total',
      passed: false,
      details: err.message
    });
  }

  // ---------------------------------------------------------------------------
  // TESTE 5: Tratamento de UNKNOWN_COMMIT
  // ---------------------------------------------------------------------------
  try {
    const items: BatchRoutineItemResult[] = [
      { taskMasterId: 'tm-timeout', roomId: 'r-slow', status: 'UNKNOWN_COMMIT', error: 'Client timeout after 10s', retryable: true },
      { taskMasterId: 'tm-ok', roomId: 'r-fast', status: 'CREATED', retryable: false }
    ];

    const result = aggregateGranularBatchResults(items, 'op_timeout_test');

    if (!result.hasUnknownCommits) {
      throw new Error('hasUnknownCommits deve ser true.');
    }
    if (result.success !== false) {
      throw new Error('Lote com UNKNOWN_COMMIT não pode ser reportado como success = true.');
    }

    const unknowns = identifyUnknownCommits(result);
    if (unknowns.length !== 1 || unknowns[0].taskMasterId !== 'tm-timeout') {
      throw new Error('identifyUnknownCommits falhou em identificar o item em timeout.');
    }

    results.push({
      id: 'B55HF1-DA-05',
      name: 'Identificação e sinalização de estados UNKNOWN_COMMIT',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-05',
      name: 'Identificação e sinalização de estados UNKNOWN_COMMIT',
      passed: false,
      details: err.message
    });
  }

  // ---------------------------------------------------------------------------
  // TESTE 6: Tratamento de OCCURRENCE_SYNC_PENDING
  // ---------------------------------------------------------------------------
  try {
    const items: BatchRoutineItemResult[] = [
      { taskMasterId: 'tm-routine-saved', roomId: 'r-agenda-pending', status: 'OCCURRENCE_SYNC_PENDING', retryable: true },
      { taskMasterId: 'tm-all-done', roomId: 'r-all-done', status: 'CREATED', retryable: false }
    ];

    const result = aggregateGranularBatchResults(items);

    if (!result.hasPendingSync) {
      throw new Error('hasPendingSync deve ser true.');
    }
    if (result.success !== false) {
      throw new Error('Lote com agenda pendente não é success = true imediato.');
    }
    if (result.summary?.syncPending !== 1) {
      throw new Error(`syncPending esperado 1, recebido: ${result.summary?.syncPending}`);
    }

    results.push({
      id: 'B55HF1-DA-06',
      name: 'Tratamento e agregação de OCCURRENCE_SYNC_PENDING',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-06',
      name: 'Tratamento e agregação de OCCURRENCE_SYNC_PENDING',
      passed: false,
      details: err.message
    });
  }

  // ---------------------------------------------------------------------------
  // TESTE 7: Tratamento de AMBIGUOUS_LEGACY_CONFLICT
  // ---------------------------------------------------------------------------
  try {
    const statusResult = classifyItemOperationStatus({
      existsInDb: true,
      conflictingCount: 3 // Múltiplas rotinas legadas
    });

    if (statusResult.status !== 'AMBIGUOUS_LEGACY_CONFLICT') {
      throw new Error(`Status esperado AMBIGUOUS_LEGACY_CONFLICT, obtido: ${statusResult.status}`);
    }
    if (statusResult.retryable !== false) {
      throw new Error('Conflito ambíguo não deve ser automaticamente reexecutável sem ação do admin.');
    }

    const items: BatchRoutineItemResult[] = [
      {
        taskMasterId: 'tm-ambiguous',
        roomId: 'sala',
        status: 'AMBIGUOUS_LEGACY_CONFLICT',
        retryable: false,
        conflictDetails: { conflictingRoutineIds: ['ft-1', 'ft-2'], resolutionRequired: true }
      }
    ];

    const agg = aggregateGranularBatchResults(items);
    if (!agg.hasConflicts) {
      throw new Error('hasConflicts deve ser true.');
    }

    results.push({
      id: 'B55HF1-DA-07',
      name: 'Classificação e retenção segura de AMBIGUOUS_LEGACY_CONFLICT',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-07',
      name: 'Classificação e retenção segura de AMBIGUOUS_LEGACY_CONFLICT',
      passed: false,
      details: err.message
    });
  }

  // ---------------------------------------------------------------------------
  // TESTE 8: Filtro de Retry sem reenviar itens confirmados
  // ---------------------------------------------------------------------------
  try {
    const items: BatchRoutineItemResult[] = [
      { taskMasterId: 'tm-1', roomId: 'r-1', status: 'CREATED', retryable: false },
      { taskMasterId: 'tm-2', roomId: 'r-2', status: 'REACTIVATED', retryable: false },
      { taskMasterId: 'tm-3', roomId: 'r-3', status: 'ALREADY_ACTIVE', retryable: false },
      { taskMasterId: 'tm-4', roomId: 'r-4', status: 'FAILED', error: 'Connection reset', retryable: true },
      { taskMasterId: 'tm-5', roomId: 'r-5', status: 'UNKNOWN_COMMIT', error: 'Timeout', retryable: true },
      { taskMasterId: 'tm-6', roomId: 'r-6', status: 'AMBIGUOUS_LEGACY_CONFLICT', retryable: false }
    ];

    const retryable = getRetryableBatchItems(items);

    // Somente tm-4 e tm-5 devem ser reexecutáveis
    if (retryable.length !== 2) {
      throw new Error(`Esperado exatamente 2 itens para retry, recebido: ${retryable.length}`);
    }
    const retryTmIds = retryable.map(i => i.taskMasterId).sort();
    if (retryTmIds[0] !== 'tm-4' || retryTmIds[1] !== 'tm-5') {
      throw new Error(`Itens para retry incorretos: ${JSON.stringify(retryTmIds)}`);
    }

    results.push({
      id: 'B55HF1-DA-08',
      name: 'Filtro de retry protege rigorosamente itens confirmados (CREATED, REACTIVATED, ALREADY_ACTIVE)',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-08',
      name: 'Filtro de retry protege rigorosamente itens confirmados (CREATED, REACTIVATED, ALREADY_ACTIVE)',
      passed: false,
      details: err.message
    });
  }

  // ---------------------------------------------------------------------------
  // TESTE 9: Isolamento rigoroso entre famílias (Multi-tenant)
  // ---------------------------------------------------------------------------
  try {
    const keyFam1 = buildTenantRoutineIndexKey('fam-1', 'tm-dish', 'kitchen');
    const keyFam2 = buildTenantRoutineIndexKey('fam-2', 'tm-dish', 'kitchen');

    if (keyFam1 === keyFam2) {
      throw new Error('Chaves de famílias distintas não podem colidir.');
    }
    if (!keyFam1.startsWith('idx_fam-1___') || !keyFam2.startsWith('idx_fam-2___')) {
      throw new Error('Formato da chave não inclui o prefixo seguro de tenant.');
    }

    results.push({
      id: 'B55HF1-DA-09',
      name: 'Isolamento de tenant: chaves globais com prefixo seguro de família',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-09',
      name: 'Isolamento de tenant: chaves globais com prefixo seguro de família',
      passed: false,
      details: err.message
    });
  }

  // ---------------------------------------------------------------------------
  // TESTE 10: Detecção de combinações duplicadas no mesmo payload de entrada
  // ---------------------------------------------------------------------------
  try {
    const rawPayload = [
      { taskMasterId: 'tm-vaccum', roomId: 'sala' },
      { taskMasterId: 'tm-vaccum', roomId: 'quarto' },
      { taskMasterId: 'tm-vaccum', roomId: 'sala' } // Duplicata no mesmo lote!
    ];

    const dupCheck = detectDuplicatePayloadCombinations(rawPayload);

    if (!dupCheck.hasDuplicates) {
      throw new Error('Deveria ter detectado duplicata no payload.');
    }
    if (dupCheck.duplicates.length !== 1 || dupCheck.duplicates[0].occurrences !== 2) {
      throw new Error(`Contagem de duplicatas incorreta: ${JSON.stringify(dupCheck.duplicates)}`);
    }
    if (dupCheck.uniqueItems.length !== 2) {
      throw new Error(`Esperado 2 itens únicos, recebido: ${dupCheck.uniqueItems.length}`);
    }

    results.push({
      id: 'B55HF1-DA-10',
      name: 'Detecção determinística de combinações duplicadas no mesmo payload de entrada',
      passed: true
    });
  } catch (err: any) {
    results.push({
      id: 'B55HF1-DA-10',
      name: 'Detecção determinística de combinações duplicadas no mesmo payload de entrada',
      passed: false,
      details: err.message
    });
  }

  return results;
}
