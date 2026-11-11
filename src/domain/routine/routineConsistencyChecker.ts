/**
 * CasaJunto — B.5.5-HF1-D-B2C-HF2: Verificação de Consistência e Gate de Rollback Seguro
 * 
 * Garante que:
 * 1. Uma família com rotinas suspensas só pode ter a suspensão liberada ou rollback finalizado
 *    se o estado entre FamilyTask e routineIndex for 100% consistente.
 * 2. Nenhuma divergência (ex: FamilyTask.active=false vs routineIndex.status='ACTIVE') passa despercebida.
 * 3. Tarefas órfãs ou índices desindexados bloqueiam a liberação.
 */

import { FamilyTask } from '../../types';
import { RoutineIndexDoc } from './transactionalTypes';
import { buildRoutineIndexKey } from './multiRoomBatchContracts';

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
}
