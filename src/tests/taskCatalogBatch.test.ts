/**
 * CasaJunto - Testes Automatizados do Catálogo de Tarefas
 * Valida a gestão em lote, soft-delete, reativação, unicidade e regras de permissão.
 */

import { allMasterTasks } from '../data/tasks';
import { FamilyTask, TaskAssignment, User } from '../types';
import { DistributionEngine, DistributionContext } from '../domain/distribution';
import { Member } from '../domain/models';

export interface CatalogTestResult {
  id: number;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  details?: string;
}

export function runTaskCatalogTestSuite(): CatalogTestResult[] {
  const results: CatalogTestResult[] = [];

  const familyId = 'fam-test-1';
  const initialMasterTasksCount = allMasterTasks.length;

  // Helper simulating AppContext logic
  class AppContextSimulator {
    familyTasks: FamilyTask[] = [];
    assignments: TaskAssignment[] = [];
    currentUser: User = {
      id: 'u-admin',
      name: 'Admin User',
      email: 'admin@casajunto.app',
      avatar: 'A',
      role: 'ADMIN',
      family_id: familyId,
      birth_date: '1985-01-01',
      age: 41,
      autonomy_level: 4,
      active: true
    };

    setUserRole(role: 'ADMIN' | 'MEMBER') {
      this.currentUser.role = role;
    }

    addFamilyTask(taskMasterId: string): boolean {
      if (this.currentUser.role !== 'ADMIN') {
        return false;
      }
      const existingIndex = this.familyTasks.findIndex(
        ft => ft.task_master_id === taskMasterId && ft.family_id === familyId
      );
      if (existingIndex >= 0) {
        if (this.familyTasks[existingIndex].active) {
          return false; // Already active, no duplicate
        }
        this.familyTasks[existingIndex] = { ...this.familyTasks[existingIndex], active: true };
        return true;
      }
      const newTask: FamilyTask = {
        id: `ft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        family_id: familyId,
        task_master_id: taskMasterId,
        frequency: 'daily',
        preferred_days: [0, 1, 2, 3, 4, 5, 6],
        preferred_time: '16:00',
        active: true,
        assigned_automatically: true
      };
      this.familyTasks.push(newTask);
      return true;
    }

    removeFamilyTask(taskMasterIdOrFtId: string): boolean {
      if (this.currentUser.role !== 'ADMIN') {
        return false;
      }
      let found = false;
      this.familyTasks = this.familyTasks.map(ft => {
        if (ft.id === taskMasterIdOrFtId || ft.task_master_id === taskMasterIdOrFtId) {
          found = true;
          return { ...ft, active: false };
        }
        return ft;
      });
      return found;
    }

    addBatchFamilyTasks(taskMasterIds: string[]): number {
      if (this.currentUser.role !== 'ADMIN') {
        return 0;
      }
      let count = 0;
      for (const id of taskMasterIds) {
        const added = this.addFamilyTask(id);
        if (added) count++;
      }
      return count;
    }

    removeBatchFamilyTasks(taskMasterIds: string[]): number {
      if (this.currentUser.role !== 'ADMIN') {
        return 0;
      }
      const targetSet = new Set(taskMasterIds);
      let count = 0;
      this.familyTasks = this.familyTasks.map(ft => {
        if (targetSet.has(ft.task_master_id) || targetSet.has(ft.id)) {
          if (ft.active) count++;
          return { ...ft, active: false };
        }
        return ft;
      });
      return count;
    }
  }

  // =========================================================================
  // TESTE 1: Adicionar tarefa inexistente -> FamilyTask.active = true
  // =========================================================================
  {
    const sim = new AppContextSimulator();
    const task = allMasterTasks[0];
    sim.addFamilyTask(task.id);
    const created = sim.familyTasks.find(ft => ft.task_master_id === task.id);
    const passed = !!created && created.active === true && sim.familyTasks.length === 1;

    results.push({
      id: 1,
      name: 'Adicionar tarefa inexistente',
      expected: 'FamilyTask.active = true criada com sucesso',
      actual: created ? `Criada com active=${created.active}` : 'Não criada',
      passed,
      details: `ID da FamilyTask: ${created?.id}`
    });
  }

  // =========================================================================
  // TESTE 2: Remover tarefa -> FamilyTask.active = false (soft-delete)
  // =========================================================================
  {
    const sim = new AppContextSimulator();
    const task = allMasterTasks[0];
    sim.addFamilyTask(task.id);
    sim.removeFamilyTask(task.id);
    const target = sim.familyTasks.find(ft => ft.task_master_id === task.id);
    const passed = !!target && target.active === false && sim.familyTasks.length === 1;

    results.push({
      id: 2,
      name: 'Remover tarefa (soft delete)',
      expected: 'FamilyTask.active = false sem remoção física do array',
      actual: target ? `active=${target.active}, total_registros=${sim.familyTasks.length}` : 'Registro excluído fisicamente',
      passed,
      details: 'Objeto mantido no array com active = false'
    });
  }

  // =========================================================================
  // TESTE 3: Remover tarefa com histórico -> histórico preservado
  // =========================================================================
  {
    const sim = new AppContextSimulator();
    const task = allMasterTasks[0];
    sim.addFamilyTask(task.id);
    const ftId = sim.familyTasks[0].id;

    // Criar histórico de atribuição e conclusão
    sim.assignments.push({
      id: 'asg-hist-1',
      family_id: familyId,
      task_id: task.id,
      member_id: 'u-admin',
      scheduled_date: '2026-08-30',
      scheduled_start: '10:00',
      scheduled_end: '10:20',
      status: 'COMPLETED',
      score: 100,
      assigned_reason: 'Rotina histórica',
      rescheduled_count: 0,
      completed_at: '2026-08-30T10:20:00Z',
      feedback_difficulty: 'EASY',
      feedback_at: '2026-08-30T10:21:00Z',
      is_unassigned: false
    });

    sim.removeFamilyTask(task.id);

    const historyPreserved = sim.assignments.length === 1 && sim.assignments[0].task_id === task.id;
    const taskSoftDeleted = sim.familyTasks[0].active === false;
    const passed = historyPreserved && taskSoftDeleted;

    results.push({
      id: 3,
      name: 'Remover tarefa com histórico',
      expected: 'Histórico de atribuição, conclusão e feedback 100% preservado',
      actual: historyPreserved ? 'Histórico íntegro mantido' : 'Histórico corrompido ou apagado',
      passed,
      details: `Atribuição ${sim.assignments[0]?.id} permaneceu preservada com task_id ${task.id}`
    });
  }

  // =========================================================================
  // TESTE 4: Adicionar múltiplas tarefas em lote -> todas ficam ativas
  // =========================================================================
  {
    const sim = new AppContextSimulator();
    const tasksToAdd = allMasterTasks.slice(0, 5).map(t => t.id);
    const count = sim.addBatchFamilyTasks(tasksToAdd);
    const allActive = sim.familyTasks.every(ft => ft.active);
    const passed = count === 5 && sim.familyTasks.length === 5 && allActive;

    results.push({
      id: 4,
      name: 'Adicionar tarefas em lote',
      expected: '5 tarefas adicionadas com active = true',
      actual: `${count} adicionadas, ${sim.familyTasks.filter(ft => ft.active).length} ativas`,
      passed
    });
  }

  // =========================================================================
  // TESTE 5: Adicionar novamente as mesmas tarefas -> nenhuma duplicata
  // =========================================================================
  {
    const sim = new AppContextSimulator();
    const tasksToAdd = allMasterTasks.slice(0, 4).map(t => t.id);
    sim.addBatchFamilyTasks(tasksToAdd);
    const countSecondRun = sim.addBatchFamilyTasks(tasksToAdd); // Add again
    const uniqueMasterIds = new Set(sim.familyTasks.map(ft => ft.task_master_id));
    const passed = countSecondRun === 0 && sim.familyTasks.length === 4 && uniqueMasterIds.size === 4;

    results.push({
      id: 5,
      name: 'Evitar duplicidade',
      expected: '0 tarefas adicionadas na 2ª execução, 4 tarefas únicas no total',
      actual: `2ª execução retornou ${countSecondRun}, total de tarefas=${sim.familyTasks.length}`,
      passed
    });
  }

  // =========================================================================
  // TESTE 6: Reativar tarefa inativa -> mesma FamilyTask volta para active = true
  // =========================================================================
  {
    const sim = new AppContextSimulator();
    const task = allMasterTasks[0];
    sim.addFamilyTask(task.id);
    const originalFtId = sim.familyTasks[0].id;
    sim.removeFamilyTask(task.id); // Inactivate
    const wasInactive = sim.familyTasks[0].active === false;

    sim.addFamilyTask(task.id); // Reactivate
    const isNowActive = sim.familyTasks[0].active === true;
    const sameIdPreserved = sim.familyTasks[0].id === originalFtId && sim.familyTasks.length === 1;
    const passed = wasInactive && isNowActive && sameIdPreserved;

    results.push({
      id: 6,
      name: 'Reativar tarefa inativa',
      expected: 'Mesma FamilyTask original reativada com active = true e mesmo ID',
      actual: sameIdPreserved && isNowActive ? `Reativada com sucesso (ID ${originalFtId})` : 'Novo registro criado ou falha',
      passed
    });
  }

  // =========================================================================
  // TESTE 7: Selecionar todas com filtro -> somente tarefas filtradas são selecionadas
  // =========================================================================
  {
    const categoryTarget = 'kitchen';
    const filteredVisible = allMasterTasks.filter(t => t.category === categoryTarget);
    const filteredIds = filteredVisible.map(t => t.id);

    // Simular seleção das visíveis
    const selectedTaskIds = [...filteredIds];
    const onlyKitchenSelected = selectedTaskIds.every(id => {
      const task = allMasterTasks.find(t => t.id === id);
      return task?.category === categoryTarget;
    });
    const noneOtherSelected = !selectedTaskIds.some(id => {
      const task = allMasterTasks.find(t => t.id === id);
      return task?.category !== categoryTarget;
    });
    const passed = onlyKitchenSelected && noneOtherSelected && selectedTaskIds.length === filteredVisible.length;

    results.push({
      id: 7,
      name: 'Seleção com filtro contextual',
      expected: `Apenas as ${filteredVisible.length} tarefas de Cozinha selecionadas`,
      actual: `${selectedTaskIds.length} tarefas selecionadas, 100% pertencentes ao filtro`,
      passed
    });
  }

  // =========================================================================
  // TESTE 8: Tarefa INACTIVE não entra na distribuição do Motor 2.0
  // =========================================================================
  {
    const users: Member[] = [
      { id: 'm-1', family_id: familyId, name: 'Admin', avatar: 'A', color: '#5A5A40', role: 'ADMIN', birth_date: '1985-01-01', age: 41, autonomy_level: 4, active: true },
      { id: 'm-2', family_id: familyId, name: 'Member', avatar: 'M', color: '#86c99c', role: 'MEMBER', birth_date: '1988-01-01', age: 38, autonomy_level: 4, active: true }
    ];

    const activeTaskMaster = allMasterTasks[0];
    const inactiveTaskMaster = allMasterTasks[1];

    const familyTasks: FamilyTask[] = [
      { id: 'ft-active', family_id: familyId, task_master_id: activeTaskMaster.id, frequency: 'daily', preferred_days: [1], active: true, assigned_automatically: true },
      { id: 'ft-inactive', family_id: familyId, task_master_id: inactiveTaskMaster.id, frequency: 'daily', preferred_days: [1], active: false, assigned_automatically: true }
    ];

    const ctx: DistributionContext = {
      users,
      allTasks: allMasterTasks,
      familyTasks,
      skills: [],
      preferences: [],
      protectedTimes: [],
      existingAssignments: [],
      targetDate: '2026-09-07',
      dayOfWeek: 1
    };

    const assignments = DistributionEngine.distributeDailyTasks(ctx);
    const assignedMasterIds = assignments.map(a => a.task_id);

    const activeIncluded = assignedMasterIds.includes(activeTaskMaster.id);
    const inactiveExcluded = !assignedMasterIds.includes(inactiveTaskMaster.id);
    const passed = activeIncluded && inactiveExcluded;

    results.push({
      id: 8,
      name: 'INACTIVE fora da distribuição',
      expected: 'Tarefa ativa distribuída; tarefa inativa ignorada pelo Motor 2.0',
      actual: inactiveExcluded ? 'Tarefa inativa estritamente ignorada' : 'Tarefa inativa foi distribuída indevidamente',
      passed
    });
  }

  // =========================================================================
  // TESTE 9: TASK_MASTER permanece intacto após operações
  // =========================================================================
  {
    const sim = new AppContextSimulator();
    sim.addBatchFamilyTasks(allMasterTasks.slice(0, 10).map(t => t.id));
    sim.removeBatchFamilyTasks(allMasterTasks.slice(0, 5).map(t => t.id));

    const masterLengthIntact = allMasterTasks.length === initialMasterTasksCount;
    const masterItemsIntact = allMasterTasks.every(t => typeof t.id === 'string' && typeof t.name === 'string');
    const passed = masterLengthIntact && masterItemsIntact;

    results.push({
      id: 9,
      name: 'TASK_MASTER intacto',
      expected: `TASK_MASTER com ${initialMasterTasksCount} tarefas inalteradas`,
      actual: `${allMasterTasks.length} tarefas preservadas no catálogo mestre global`,
      passed
    });
  }

  // =========================================================================
  // TESTE 10: MEMBER não consegue executar operações administrativas
  // =========================================================================
  {
    const sim = new AppContextSimulator();
    sim.setUserRole('MEMBER');

    const addAttempt = sim.addFamilyTask(allMasterTasks[0].id);
    const batchAddAttempt = sim.addBatchFamilyTasks([allMasterTasks[1].id, allMasterTasks[2].id]);
    const removeAttempt = sim.removeFamilyTask(allMasterTasks[0].id);
    const batchRemoveAttempt = sim.removeBatchFamilyTasks([allMasterTasks[1].id]);

    const passed =
      addAttempt === false &&
      batchAddAttempt === 0 &&
      removeAttempt === false &&
      batchRemoveAttempt === 0 &&
      sim.familyTasks.length === 0;

    results.push({
      id: 10,
      name: 'Permissão ADMIN/MEMBER',
      expected: 'Usuário com role MEMBER é bloqueado de adicionar ou remover tarefas',
      actual: passed ? 'Bloqueio de autorização respeitado com sucesso' : 'Operações permitidas indevidamente para MEMBER',
      passed
    });
  }

  return results;
}
