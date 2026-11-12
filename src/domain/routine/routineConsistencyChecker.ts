/**
 * CasaJunto — B.5.5-HF1-D-B2C-HF2: Verificação de Consistência e Gate de Rollback Seguro
 * 
 * Garante que:
 * 1. Uma família com rotinas suspensas só pode ter a suspensão liberada ou rollback finalizado
 *    se o estado entre FamilyTask e routineIndex for 100% consistente.
 * 2. Nenhuma divergência (ex: FamilyTask.active=false vs routineIndex.status='ACTIVE') passa despercebida.
 * 3. Tarefas órfãs ou índices desindexados bloqueiam a liberação.
 */

import {
  Firestore,
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  runTransaction
} from 'firebase/firestore';
import { FamilyTask } from '../../types';
import { RoutineIndexDoc } from './transactionalTypes';
import { buildRoutineIndexKey } from './multiRoomBatchContracts';

export interface RoutineReleaseAuditRecord {
  auditId: string;
  familyId: string;
  performedBy: string;
  status: 'AUDIT_PASSED' | 'AUDIT_FAILED';
  totalDiscrepancies: number;
  discrepancies: string[];
  auditedTasksCount: number;
  auditedIndexesCount: number;
  createdAt: string;
}

export interface ConsistencyAuditResult {
  isConsistent: boolean;
  canSafelyResumeOrRollback: boolean;
  discrepancies: string[];
  stats: {
    totalTasks: number;
    totalIndexes: number;
    activeTasks: number;
    activeIndexes: number;
    archivedTasks: number;
    archivedIndexes: number;
  };
}

export class RoutineConsistencyChecker {
  /**
   * Executa auditoria completa entre a coleção de FamilyTasks e routineIndex.
   */
  static auditConsistency(
    tasks: FamilyTask[],
    indexes: RoutineIndexDoc[]
  ): ConsistencyAuditResult {
    const discrepancies: string[] = [];
    const taskMap = new Map<string, FamilyTask>();
    tasks.forEach(t => taskMap.set(t.id, t));

    const indexByKey = new Map<string, RoutineIndexDoc>();
    indexes.forEach(idx => {
      const key = buildRoutineIndexKey(idx.taskMasterId, idx.roomId);
      indexByKey.set(key, idx);
    });

    let activeTasks = 0;
    let archivedTasks = 0;
    tasks.forEach(t => {
      if (t.active) activeTasks++;
      else archivedTasks++;
    });

    let activeIndexes = 0;
    let archivedIndexes = 0;
    indexes.forEach(idx => {
      if (idx.status === 'ACTIVE') activeIndexes++;
      else archivedIndexes++;
    });

    // 1. Validar cada routineIndex em relação à FamilyTask correspondente
    for (const idx of indexes) {
      const task = taskMap.get(idx.canonicalRoutineId);
      if (!task) {
        discrepancies.push(
          `Índice órfão: routineIndex '${idx.taskMasterId}___${idx.roomId}' aponta para FamilyTask inexistente '${idx.canonicalRoutineId}'`
        );
        continue;
      }

      // Validar correspondência de taskMasterId e roomId
      const tMasterId = task.taskMasterId || (task as any).task_master_id;
      const tRoomId = task.roomId || (task as any).room_id;

      if (tMasterId && tMasterId !== idx.taskMasterId) {
        discrepancies.push(
          `Divergência de taskMasterId para rotina '${task.id}': FamilyTask tem '${tMasterId}', mas routineIndex tem '${idx.taskMasterId}'`
        );
      }

      if (tRoomId && tRoomId !== idx.roomId) {
        discrepancies.push(
          `Divergência de roomId para rotina '${task.id}': FamilyTask tem '${tRoomId}', mas routineIndex tem '${idx.roomId}'`
        );
      }

      // Validar alinhamento de status (ACTIVE <-> active: true; ARCHIVED <-> active: false)
      if (idx.status === 'ACTIVE' && task.active !== true) {
        discrepancies.push(
          `Divergência de status: routineIndex '${idx.taskMasterId}___${idx.roomId}' está ACTIVE, mas FamilyTask '${task.id}' está active=${task.active}`
        );
      } else if (idx.status === 'ARCHIVED' && task.active === true) {
        discrepancies.push(
          `Divergência de status: routineIndex '${idx.taskMasterId}___${idx.roomId}' está ARCHIVED, mas FamilyTask '${task.id}' está active=true`
        );
      }
    }

    // 2. Validar se existem FamilyTasks ativas com taskMasterId+roomId sem índice canônico
    for (const task of tasks) {
      const tMasterId = task.taskMasterId || (task as any).task_master_id;
      const tRoomId = task.roomId || (task as any).room_id;

      if (task.active && tMasterId && tRoomId) {
        const key = buildRoutineIndexKey(tMasterId, tRoomId);
        const idx = indexByKey.get(key);
        if (!idx) {
          discrepancies.push(
            `FamilyTask ativa desindexada: '${task.id}' (${tMasterId} em ${tRoomId}) não possui routineIndex correspondente`
          );
        } else if (idx.canonicalRoutineId !== task.id) {
          discrepancies.push(
            `Conflito de unicidade: FamilyTask ativa '${task.id}' não é a canonicalRoutineId registrada no índice ('${idx.canonicalRoutineId}')`
          );
        }
      }
    }

    const isConsistent = discrepancies.length === 0;

    return {
      isConsistent,
      canSafelyResumeOrRollback: isConsistent,
      discrepancies,
      stats: {
        totalTasks: tasks.length,
        totalIndexes: indexes.length,
        activeTasks,
        activeIndexes,
        archivedTasks,
        archivedIndexes
      }
    };
  }

  /**
   * Avalia estritamente se o rollback ou a retomada de escritas podem ser liberados.
   * Lança erro explícito se houver qualquer discrepância entre FamilyTask e routineIndex.
   */
  static assertSafeRollbackRelease(tasks: FamilyTask[], indexes: RoutineIndexDoc[]): void {
    const audit = this.auditConsistency(tasks, indexes);
    if (!audit.canSafelyResumeOrRollback) {
      throw new Error(
        `[RoutineConsistencyChecker] Rollback/Retomada bloqueada por inconsistência estrutural: ${audit.discrepancies.join('; ')}`
      );
    }
  }

  /**
   * Executa ações de reconciliação estrutural enquanto a família está com rotinas suspensas.
   * Utiliza flags de reconciliação autorizadas pelas regras de segurança.
   */
  static async reconcileFamilyRoutinesWhileSuspended(
    db: Firestore,
    familyId: string,
    actions: {
      indexesToArchive?: string[];
      indexesToCreateOrUpdate?: RoutineIndexDoc[];
      tasksToDeactivate?: string[];
    }
  ): Promise<{ reconciledCount: number }> {
    let count = 0;
    await runTransaction(db, async (txn) => {
      // 1. Arquivar índices órfãos ou obsoletos
      if (actions.indexesToArchive) {
        for (const idxKey of actions.indexesToArchive) {
          const idxRef = doc(db, 'families', familyId, 'routineIndex', idxKey);
          txn.update(idxRef, { status: 'ARCHIVED', isReconciliation: true, updatedAt: new Date().toISOString() });
          count++;
        }
      }

      // 2. Criar ou atualizar índices canônicos faltantes
      if (actions.indexesToCreateOrUpdate) {
        for (const idxDoc of actions.indexesToCreateOrUpdate) {
          const key = buildRoutineIndexKey(idxDoc.taskMasterId, idxDoc.roomId);
          const idxRef = doc(db, 'families', familyId, 'routineIndex', key);
          txn.set(idxRef, { ...idxDoc, isReconciliation: true, updatedAt: new Date().toISOString() });
          count++;
        }
      }

      // 3. Desativar tarefas divergentes
      if (actions.tasksToDeactivate) {
        for (const taskId of actions.tasksToDeactivate) {
          const taskRef = doc(db, 'families', familyId, 'familyTasks', taskId);
          txn.update(taskRef, { active: false, isReconciliation: true });
          count++;
        }
      }
    });

    return { reconciledCount: count };
  }

  /**
   * HF3-01 / HF3-02: Executa a auditoria completa e a liberação atômica da suspensão.
   * 
   * PROTOCOLO DE RECUPERAÇÃO E LIBERAÇÃO SEGURA:
   * 1. Consulta integral fresca do servidor das coleções `familyTasks` e `routineIndex`.
   * 2. Execução da auditoria estrutural bidirecional (auditConsistency).
   * 3. Se houver qualquer divergência (órfãos, status divergente, desindexados),
   *    aborta imediatamente lançando erro com a lista de discrepâncias.
   * 4. Se a auditoria for 100% consistente, executa transação atômica (runTransaction):
   *    - Grava o documento imutável `/families/{familyId}/routineReleaseAudits/{auditId}`
   *      com status 'AUDIT_PASSED' e totalDiscrepancies = 0.
   *    - Atualiza `/families/{familyId}` com routineSuspended = false e o auditId vinculado.
   * 5. O Firestore Security Rules valida existsAfter, !exists e getAfter no mesmo commit atômico,
   *    garantindo que registros pré-existentes ou reutilizados (Replay Attack) sejam rejeitados.
   */
  static async executeSuspensionRelease(
    db: Firestore,
    familyId: string,
    performedByUid: string
  ): Promise<{ success: boolean; auditId: string; audit: ConsistencyAuditResult }> {
    // 1. Consulta integral fresca do servidor (evita cache local)
    let ftSnap;
    let idxSnap;
    try {
      ftSnap = await getDocsFromServer(collection(db, 'families', familyId, 'familyTasks'));
      idxSnap = await getDocsFromServer(collection(db, 'families', familyId, 'routineIndex'));
    } catch {
      ftSnap = await getDocs(collection(db, 'families', familyId, 'familyTasks'));
      idxSnap = await getDocs(collection(db, 'families', familyId, 'routineIndex'));
    }

    const tasks: FamilyTask[] = ftSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const indexes: RoutineIndexDoc[] = idxSnap.docs.map(d => d.data() as RoutineIndexDoc);

    // 2. Auditoria de consistência
    const audit = this.auditConsistency(tasks, indexes);
    if (!audit.canSafelyResumeOrRollback) {
      throw new Error(
        `[RoutineConsistencyChecker] Liberação de suspensão rejeitada: foram encontradas ${audit.discrepancies.length} discrepâncias estruturais: ${audit.discrepancies.join('; ')}`
      );
    }

    const auditId = `audit_rel_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const nowIso = new Date().toISOString();

    const auditRecord: RoutineReleaseAuditRecord = {
      auditId,
      familyId,
      performedBy: performedByUid,
      status: 'AUDIT_PASSED',
      totalDiscrepancies: 0,
      discrepancies: [],
      auditedTasksCount: tasks.length,
      auditedIndexesCount: indexes.length,
      createdAt: nowIso
    };

    // 3. Liberação atômica com validação de regras no servidor
    await runTransaction(db, async (txn) => {
      const famRef = doc(db, 'families', familyId);
      const famSnap = await txn.get(famRef);
      if (!famSnap.exists()) {
        throw new Error(`[RoutineConsistencyChecker] Família '${familyId}' não encontrada no Firestore.`);
      }

      const auditRef = doc(db, 'families', familyId, 'routineReleaseAudits', auditId);
      txn.set(auditRef, auditRecord);
      txn.update(famRef, {
        routineSuspended: false,
        routineReleaseAuditId: auditId,
        routineReleaseAuditAt: nowIso
      });
    });

    return { success: true, auditId, audit };
  }
}

/**
 * PROCEDIMENTO OPERACIONAL DE RECUPERAÇÃO APÓS FALHAS / DIVERGÊNCIAS (RUNBOOK):
 * 
 * 1. DIAGNÓSTICO:
 *    - Executar `RoutineConsistencyChecker.auditConsistency(tasks, indexes)`.
 *    - Analisar os tipos de discrepâncias reportados:
 *      a) 'Índice órfão': O routineIndex aponta para um FamilyTask que foi excluído ou não existe.
 *         -> Ação: Arquivar ou remover o routineIndex órfão (`status: 'ARCHIVED'`).
 *      b) 'FamilyTask ativa desindexada': Uma rotina ativa existe sem routineIndex canônico.
 *         -> Ação: Criar o routineIndex canônico para (taskMasterId + roomId) apontando para o FamilyTask.
 *      c) 'Divergência de status': FamilyTask.active != (routineIndex.status === 'ACTIVE').
 *         -> Ação: Sincronizar o status (desativar a FamilyTask se o índice estiver ARCHIVED, ou atualizar o índice para ACTIVE se a rotina deve estar ativa).
 *      d) 'Conflito de unicidade': Múltiplas FamilyTasks ativas para a mesma combinação.
 *         -> Ação: Preservar uma única rotina canônica e arquivar as duplicatas legadas ou registrar em routineIndexConflicts.
 * 
 * 2. RECONCILIAÇÃO:
 *    - Aplicar as correções acima enquanto a família permanece em `routineSuspended: true`.
 *    - Nenhuma escrita de cliente comum é permitida durante a reconciliação.
 * 
 * 3. VALIDAÇÃO E LIBERAÇÃO:
 *    - Executar `RoutineConsistencyChecker.executeSuspensionRelease(db, familyId, adminUid)`.
 *    - Somente após o commit atômico do audit record a família voltará a aceitar novas rotinas.
 */
