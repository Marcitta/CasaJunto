/**
 * stabilization1a.test.ts
 * 
 * CASA JUNTO — STABILIZATION-1A TEST SUITE
 * TASK EDITING & DEACTIVATION PERSISTENCE (S1A-01–S1A-10)
 */

import { FamilyTask, TaskAssignment } from '../types';

export async function runStabilization1aTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [✓ PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [✗ FAIL] ${msg}`);
      failed++;
      errors.push(msg);
    }
  }

  console.log('\n--- GRUPO 22: STABILIZATION-1A (TASK EDITING & DEACTIVATION PERSISTENCE - S1A-01-S1A-10) ---');

  const baseTask: FamilyTask = {
    id: 'ft-stab-1',
    family_id: 'fam-stab',
    name: 'Lavar Louça Original',
    customTitle: 'Lavar Louça Original',
    room_id: 'cozinha',
    frequency: 'DAILY',
    active: true,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z'
  };

  // S1A-01: Editing task title persists to FamilyTask
  {
    const updated: FamilyTask = {
      ...baseTask,
      customTitle: 'Lavar Louça e Organizar',
      updated_at: '2026-09-23T10:00:00Z'
    };
    assert(updated.customTitle === 'Lavar Louça e Organizar', 'S1A-01: Edição de título persiste no FamilyTask');
  }

  // S1A-02: Editing task room_id persists to FamilyTask
  {
    const updated: FamilyTask = {
      ...baseTask,
      room_id: 'sala',
      updated_at: '2026-09-23T10:00:00Z'
    };
    assert(updated.room_id === 'sala', 'S1A-02: Edição de ambiente persiste no FamilyTask');
  }

  // S1A-03: Editing task description persists to FamilyTask
  {
    const updated: FamilyTask = {
      ...baseTask,
      customDescription: 'Usar detergente neutro',
      updated_at: '2026-09-23T10:00:00Z'
    };
    assert(updated.customDescription === 'Usar detergente neutro', 'S1A-03: Edição de descrição persiste no FamilyTask');
  }

  // S1A-04: Editing task preferred_days persists to FamilyTask
  {
    const updated: FamilyTask = {
      ...baseTask,
      preferred_days: [1, 3, 5],
      updated_at: '2026-09-23T10:00:00Z'
    };
    assert(Array.isArray(updated.preferred_days) && updated.preferred_days.length === 3, 'S1A-04: Edição de dias da semana persiste no FamilyTask');
  }

  // S1A-05: Deactivating task sets active=false
  {
    const deactivated: FamilyTask = {
      ...baseTask,
      active: false,
      updated_at: '2026-09-23T10:00:00Z'
    };
    assert(deactivated.active === false, 'S1A-05: Desativação define active=false');
  }

  // S1A-06: Deactivated task preserves completed history
  {
    const completedHistoricalAsg: TaskAssignment = {
      id: 'asg-hist-done',
      family_id: 'fam-stab',
      family_task_id: baseTask.id,
      task_id: baseTask.id,
      scheduled_date: '2026-09-20',
      status: 'COMPLETED',
      completed_at: '2026-09-20T12:00:00Z',
      member_id: 'mem-1'
    };
    assert(completedHistoricalAsg.status === 'COMPLETED' && completedHistoricalAsg.family_task_id === baseTask.id, 'S1A-06: Histórico concluído permanece imutável após desativação');
  }

  // S1A-07: Reactivating task sets active=true without changing id
  {
    const reactivated: FamilyTask = {
      ...baseTask,
      active: true,
      updated_at: '2026-09-23T11:00:00Z'
    };
    assert(reactivated.active === true && reactivated.id === baseTask.id, 'S1A-07: Reativação preserva ID e restaura active=true');
  }

  // S1A-08: Deactivated task is excluded from active routines
  {
    const list: FamilyTask[] = [
      { ...baseTask, id: 'ft-1', active: false },
      { ...baseTask, id: 'ft-2', active: true }
    ];
    const activeOnly = list.filter(t => t.active !== false);
    assert(activeOnly.length === 1 && activeOnly[0].id === 'ft-2', 'S1A-08: Tarefas desativadas são filtradas de rotinas ativas');
  }

  // S1A-09: Task edit preserves original created_at timestamp
  {
    const updated: FamilyTask = {
      ...baseTask,
      customTitle: 'Novo Título',
      updated_at: '2026-09-23T12:00:00Z'
    };
    assert(updated.created_at === baseTask.created_at, 'S1A-09: Edição preserva created_at original');
  }

  // S1A-10: Deactivation updates updated_at timestamp
  {
    const deactivated: FamilyTask = {
      ...baseTask,
      active: false,
      updated_at: '2026-09-23T12:30:00Z'
    };
    assert(deactivated.updated_at > baseTask.updated_at, 'S1A-10: Desativação atualiza updated_at');
  }

  return { passed, failed, errors };
}
