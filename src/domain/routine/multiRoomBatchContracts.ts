/**
 * CasaJunto — B.5.5-HF1: Etapa D-A: Contratos e Helpers Puros de Persistência Multiambiente
 * Funções puras e determinísticas para identificação, agregação, idempotência e tratamento de falhas.
 * SEM dependências de infraestrutura ou chamadas diretas ao Firestore.
 */

import {
  BatchRoutineOperationStatus,
  BatchRoutineItemResult,
  GranularBatchAddResult,
  BatchAddRoutineInput
} from '../../types';

/**
 * Sanitiza componentes individuais de chave para garantir que caracteres especiais,
 * barras ou o delimitador canônico triplo ("___") não gerem ambiguidades.
 */
export function sanitizeKeyComponent(comp: string): string {
  if (!comp || typeof comp !== 'string') return 'unknown';
  return comp
    .trim()
    .replace(/%/g, '%25')
    .replace(/\//g, '%2F')
    .replace(/___/g, '%5F%5F%5F')
    .replace(/\s+/g, '_');
}

/**
 * Constrói a chave canônica local do documento no índice routineIndex:
 * families/{familyId}/routineIndex/{indexKey}
 * Formato: {taskMasterId}___{roomId}
 */
export function buildRoutineIndexKey(taskMasterId: string, roomId: string): string {
  const safeTm = sanitizeKeyComponent(taskMasterId);
  const safeRoom = sanitizeKeyComponent(roomId);
  return `${safeTm}___${safeRoom}`;
}

/**
 * Constrói a chave composta global com isolamento de tenant (familyId):
 * Formato: idx_{familyId}___{taskMasterId}___{roomId}
 */
export function buildTenantRoutineIndexKey(familyId: string, taskMasterId: string, roomId: string): string {
  const safeFam = sanitizeKeyComponent(familyId);
  const safeTm = sanitizeKeyComponent(taskMasterId);
  const safeRoom = sanitizeKeyComponent(roomId);
  return `idx_${safeFam}___${safeTm}___${safeRoom}`;
}

/**
 * Gera um identificador único e rastreável para a tentativa lógica do lote:
 * Formato: op_{familyId}_{timestamp}_{randomHex}
 */
export function generateBatchOperationId(familyId: string, clientSessionId?: string): string {
  const safeFam = sanitizeKeyComponent(familyId);
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  const sessionSuffix = clientSessionId ? `_${sanitizeKeyComponent(clientSessionId).slice(0, 8)}` : '';
  return `op_${safeFam}_${ts}_${rand}${sessionSuffix}`;
}

/**
 * Identifica combinações duplicadas de taskMasterId + roomId dentro do mesmo payload de entrada.
 */
export function detectDuplicatePayloadCombinations(items: Array<{ taskMasterId: string; roomId?: string }>): {
  hasDuplicates: boolean;
  duplicates: Array<{ taskMasterId: string; roomId: string; occurrences: number }>;
  uniqueItems: Array<{ taskMasterId: string; roomId?: string }>;
} {
  const countMap = new Map<string, { count: number; item: { taskMasterId: string; roomId: string } }>();
  const uniqueItems: Array<{ taskMasterId: string; roomId?: string }> = [];

  for (const it of items) {
    const rId = it.roomId || 'geral';
    const key = `${it.taskMasterId}___${rId}`;
    const existing = countMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      countMap.set(key, { count: 1, item: { taskMasterId: it.taskMasterId, roomId: rId } });
      uniqueItems.push(it);
    }
  }

  const duplicates: Array<{ taskMasterId: string; roomId: string; occurrences: number }> = [];
  for (const entry of countMap.values()) {
    if (entry.count > 1) {
      duplicates.push({
        taskMasterId: entry.item.taskMasterId,
        roomId: entry.item.roomId,
        occurrences: entry.count
      });
    }
  }

  return {
    hasDuplicates: duplicates.length > 0,
    duplicates,
    uniqueItems
  };
}

/**
 * Classifica o status granular de uma combinação tarefa + ambiente com base nas evidências de banco e execução.
 */
export function classifyItemOperationStatus(params: {
  existsInDb: boolean;
  isActiveInDb?: boolean;
  conflictingCount?: number;
  occurrenceSyncOk?: boolean;
  hadNetworkTimeout?: boolean;
  error?: string;
}): { status: BatchRoutineOperationStatus; retryable: boolean } {
  const {
    existsInDb,
    isActiveInDb = false,
    conflictingCount = 0,
    occurrenceSyncOk = true,
    hadNetworkTimeout = false,
    error
  } = params;

  // 1. Conflito de ambiguidades legadas
  if (conflictingCount > 1) {
    return { status: 'AMBIGUOUS_LEGACY_CONFLICT', retryable: false };
  }

  // 2. Timeout de rede com resultado desconhecido
  if (hadNetworkTimeout) {
    return { status: 'UNKNOWN_COMMIT', retryable: true };
  }

  // 3. Falha explícita com erro
  if (error) {
    return { status: 'FAILED', retryable: true };
  }

  // 4. Já ativa no banco
  if (existsInDb && isActiveInDb) {
    return { status: 'ALREADY_ACTIVE', retryable: false };
  }

  // 5. Reativação de rotina inativa
  if (existsInDb && !isActiveInDb) {
    if (!occurrenceSyncOk) {
      return { status: 'OCCURRENCE_SYNC_PENDING', retryable: true };
    }
    return { status: 'REACTIVATED', retryable: false };
  }

  // 6. Nova rotina criada
  if (!occurrenceSyncOk) {
    return { status: 'OCCURRENCE_SYNC_PENDING', retryable: true };
  }

  return { status: 'CREATED', retryable: false };
}

/**
 * Agrega os resultados granulares por item no contrato retrocompatível GranularBatchAddResult.
 * Preserva estritamente: added, reactivated, skipped, failed.
 */
export function aggregateGranularBatchResults(
  items: BatchRoutineItemResult[],
  operationId?: string
): GranularBatchAddResult {
  let createdCount = 0;
  let reactivatedCount = 0;
  let alreadyActiveCount = 0;
  let syncPendingCount = 0;
  let failedCount = 0;
  let unknownCount = 0;
  let conflictCount = 0;

  const failedTaskIds: string[] = [];

  for (const it of items) {
    switch (it.status) {
      case 'CREATED':
        createdCount++;
        break;
      case 'REACTIVATED':
        reactivatedCount++;
        break;
      case 'ALREADY_ACTIVE':
        alreadyActiveCount++;
        break;
      case 'OCCURRENCE_SYNC_PENDING':
        // A rotina em si foi salva, mas a agenda está pendente
        syncPendingCount++;
        break;
      case 'FAILED':
        failedCount++;
        failedTaskIds.push(it.taskMasterId);
        break;
      case 'UNKNOWN_COMMIT':
        unknownCount++;
        failedTaskIds.push(it.taskMasterId);
        break;
      case 'AMBIGUOUS_LEGACY_CONFLICT':
        conflictCount++;
        failedTaskIds.push(it.taskMasterId);
        break;
    }
  }

  const hasPendingSync = syncPendingCount > 0;
  const hasUnknownCommits = unknownCount > 0;
  const hasConflicts = conflictCount > 0;
  const totalFailures = failedCount + unknownCount + conflictCount;
  const success = totalFailures === 0 && !hasPendingSync;

  return {
    // 1. Retrocompatibilidade obrigatória
    added: createdCount,
    reactivated: reactivatedCount,
    skipped: alreadyActiveCount,
    failed: failedTaskIds,

    // 2. Granularidade do Bloco D
    items,
    operationId,
    hasPendingSync,
    hasUnknownCommits,
    hasConflicts,
    success,
    summary: {
      total: items.length,
      created: createdCount,
      reactivated: reactivatedCount,
      alreadyActive: alreadyActiveCount,
      syncPending: syncPendingCount,
      failed: failedCount,
      unknown: unknownCount,
      conflicts: conflictCount
    }
  };
}

/**
 * Filtra e retorna apenas os itens elegíveis para reenvio (retry),
 * protegendo rigorosamente itens já confirmados (CREATED, REACTIVATED, ALREADY_ACTIVE)
 * contra qualquer reenvio ou duplicação.
 */
export function getRetryableBatchItems(
  resultOrItems: GranularBatchAddResult | BatchRoutineItemResult[]
): BatchRoutineItemResult[] {
  const items = Array.isArray(resultOrItems) ? resultOrItems : resultOrItems.items;
  return items.filter(it => {
    // Itens confirmados NUNCA devem ser reenviados
    if (it.status === 'CREATED' || it.status === 'REACTIVATED' || it.status === 'ALREADY_ACTIVE') {
      return false;
    }
    // Conflitos ambíguos exigem resolução administrativa prévia
    if (it.status === 'AMBIGUOUS_LEGACY_CONFLICT') {
      return false;
    }
    return it.retryable || it.status === 'FAILED' || it.status === 'UNKNOWN_COMMIT';
  });
}

/**
 * Identifica os itens em estado UNKNOWN_COMMIT que necessitam de sondagem/verificação.
 */
export function identifyUnknownCommits(
  resultOrItems: GranularBatchAddResult | BatchRoutineItemResult[]
): BatchRoutineItemResult[] {
  const items = Array.isArray(resultOrItems) ? resultOrItems : resultOrItems.items;
  return items.filter(it => it.status === 'UNKNOWN_COMMIT');
}
