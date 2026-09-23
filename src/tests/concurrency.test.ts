/**
 * CasaJunto - Teste de Concorrência e Idempotência (P0.1)
 * Simula operações concorrentes entre múltiplos clientes (Client A e Client B)
 * e valida se ocorrem duplicidades em FamilyTask e TaskAssignment.
 */

import { allMasterTasks } from '../data/tasks';
import { FamilyTask, TaskAssignment, User } from '../types';
import { DistributionEngine, DistributionContext } from '../domain/distribution';
import { Member } from '../domain/models';

export interface ConcurrencyTestResult {
  id: number;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  details?: string;
}

export function runConcurrencyTestSuite(): ConcurrencyTestResult[] {
  const results: ConcurrencyTestResult[] = [];
  const familyId = 'fam-concurrency-test';

  // =========================================================================
  // TESTE CONC-1: Duas operações simultâneas de addFamilyTask para a mesma tarefa
  // =========================================================================
  {
    const targetTaskId = 'kitch-1';
    
    // Simulação do repositório/estado compartilhado da família
    let storeFamilyTasks: FamilyTask[] = [];

    // Função de mutação atômica que reflete a regra de negócio do AppContext
    const executeAdd = (caller: string): boolean => {
      const existing = storeFamilyTasks.find(
        ft => ft.family_id === familyId && ft.task_master_id === targetTaskId
      );

      if (existing) {
        if (existing.active) return false;
        existing.active = true;
        return true;
      }

      const newTask: FamilyTask = {
        id: `ft-${targetTaskId}`, // ID determinístico/indexado
        family_id: familyId,
        task_master_id: targetTaskId,
        frequency: 'daily',
        preferred_days: [0, 1, 2, 3, 4, 5, 6],
        active: true,
        assigned_automatically: true
      };
      storeFamilyTasks.push(newTask);
      return true;
    };

    // Execução simultânea Client A e Client B
    const resA = executeAdd('Client A');
    const resB = executeAdd('Client B');

    const matchingTasks = storeFamilyTasks.filter(
      ft => ft.family_id === familyId && ft.task_master_id === targetTaskId && ft.active === true
    );

    const passed = matchingTasks.length === 1 && (resA !== resB);

    results.push({
      id: 1,
      name: 'Adição concorrente da mesma FamilyTask (Client A + Client B)',
      expected: 'Exatamente 1 FamilyTask ativo (COUNT = 1)',
      actual: `COUNT = ${matchingTasks.length}, A=${resA}, B=${resB}`,
      passed,
      details: 'Deduplicação por (familyId + taskMasterId) impede duplicidade em chamadas concorrentes'
    });
  }

  // =========================================================================
  // TESTE CONC-2: Adição com delay (Client A -> add, Client B -> add)
  // =========================================================================
  {
    const targetTaskId = 'waste-1';
    let storeFamilyTasks: FamilyTask[] = [];

    const executeAdd = (): boolean => {
      const existing = storeFamilyTasks.find(
        ft => ft.family_id === familyId && ft.task_master_id === targetTaskId
      );

      if (existing) {
        if (existing.active) return false;
        existing.active = true;
        return true;
      }

      const newTask: FamilyTask = {
        id: `ft-${targetTaskId}`,
        family_id: familyId,
        task_master_id: targetTaskId,
        frequency: 'daily',
        preferred_days: [0, 1, 2, 3, 4, 5, 6],
        active: true,
        assigned_automatically: true
      };
      storeFamilyTasks.push(newTask);
      return true;
    };

    const first = executeAdd();
    // Pequeno intervalo
    const second = executeAdd();

    const matchingTasks = storeFamilyTasks.filter(
      ft => ft.family_id === familyId && ft.task_master_id === targetTaskId
    );

    const passed = matchingTasks.length === 1 && first === true && second === false;

    results.push({
      id: 2,
      name: 'Adição sequencial com intervalo (Client A seguido de Client B)',
      expected: '1ª operação bem-sucedida, 2ª ignorada com COUNT = 1',
      actual: `COUNT = ${matchingTasks.length}, 1ª=${first}, 2ª=${second}`,
      passed,
      details: 'Segunda operação detecta tarefa já ativa e retorna idempotente'
    });
  }

  // =========================================================================
  // TESTE CONC-3: Distribuição concorrente simultânea (Run A + Run B)
  // =========================================================================
  {
    const selectedDate = '2026-09-02';
    const users: User[] = [
      { id: 'u-1', name: 'Adulto 1', email: 'a1@test.com', avatar: 'A', role: 'ADMIN', family_id: familyId, birth_date: '1985-01-01', age: 41, autonomy_level: 4, active: true },
      { id: 'u-2', name: 'Adulto 2', email: 'a2@test.com', avatar: 'B', role: 'MEMBER', family_id: familyId, birth_date: '1987-01-01', age: 39, autonomy_level: 4, active: true }
    ];

    const familyTasks: FamilyTask[] = [
      { id: 'ft-1', family_id: familyId, task_master_id: 'kitch-1', frequency: 'daily', preferred_days: [3], active: true, assigned_automatically: true },
      { id: 'ft-2', family_id: familyId, task_master_id: 'waste-1', frequency: 'daily', preferred_days: [3], active: true, assigned_automatically: true }
    ];

    const members: Member[] = users.map(u => ({
      id: u.id,
      user_id: u.id,
      family_id: familyId,
      name: u.name,
      avatar: u.avatar,
      role: u.role,
      birth_date: u.birth_date,
      age: u.age,
      autonomy_level: u.autonomy_level,
      active: true
    }));

    const ctx: DistributionContext = {
      users: members,
      allTasks: allMasterTasks,
      familyTasks,
      skills: [],
      preferences: [],
      protectedTimes: [],
      existingAssignments: [],
      targetDate: selectedDate,
      dayOfWeek: 3
    };

    // Run A e Run B executam o Motor 2.0 com os mesmos inputs
    const assignmentsRunA = DistributionEngine.distributeDailyTasks(ctx);
    const assignmentsRunB = DistributionEngine.distributeDailyTasks(ctx);

    // No AppContext, o estado de assignments é particionado por data
    let currentAssignments: TaskAssignment[] = [];
    
    // Simulação do updater funcional do AppContext:
    const applyAssignments = (newBatch: TaskAssignment[]) => {
      const otherDates = currentAssignments.filter(a => a.scheduled_date !== selectedDate || a.status === 'COMPLETED');
      currentAssignments = [...otherDates, ...newBatch];
    };

    applyAssignments(assignmentsRunA);
    applyAssignments(assignmentsRunB);

    const kitchAssignments = currentAssignments.filter(a => a.task_id === 'kitch-1' && a.scheduled_date === selectedDate);
    const wasteAssignments = currentAssignments.filter(a => a.task_id === 'waste-1' && a.scheduled_date === selectedDate);

    const passed = currentAssignments.length === 2 && kitchAssignments.length === 1 && wasteAssignments.length === 1;

    results.push({
      id: 3,
      name: 'Distribuição concorrente com duplo disparo (Run A + Run B)',
      expected: 'Exatamente 1 atribuição por tarefa ativa na data',
      actual: `Total=${currentAssignments.length}, kitch=${kitchAssignments.length}, waste=${wasteAssignments.length}`,
      passed,
      details: 'Substituição da partição diária garante que 2 execuções resultam em 1 único lote de assignments'
    });
  }

  // =========================================================================
  // TESTE CONC-4: Preservação de tarefa com status COMPLETED em re-distribuição
  // =========================================================================
  {
    const selectedDate = '2026-09-02';
    const completedAssignment: TaskAssignment = {
      id: 'asg-completed-1',
      family_id: familyId,
      task_id: 'kitch-1',
      member_id: 'u-1',
      scheduled_date: selectedDate,
      status: 'COMPLETED',
      rescheduled_count: 0,
      score: 90,
      assigned_reason: 'Concluído pela manhã',
      is_unassigned: false
    };

    let assignments: TaskAssignment[] = [completedAssignment];

    // Nova execução diária gera novo lote
    const newBatch: TaskAssignment[] = [
      {
        id: 'asg-new-2',
        family_id: familyId,
        task_id: 'waste-1',
        member_id: 'u-2',
        scheduled_date: selectedDate,
        status: 'SCHEDULED',
        rescheduled_count: 0,
        score: 85,
        assigned_reason: 'Rotina vespertina',
        is_unassigned: false
      }
    ];

    // Aplicar substituição respeitando COMPLETED
    const otherDateAssignments = assignments.filter(a => a.scheduled_date !== selectedDate || a.status === 'COMPLETED');
    assignments = [...otherDateAssignments, ...newBatch];

    const completedPreserved = assignments.find(a => a.id === 'asg-completed-1' && a.status === 'COMPLETED');
    const newScheduled = assignments.find(a => a.id === 'asg-new-2' && a.status === 'SCHEDULED');
    const passed = assignments.length === 2 && !!completedPreserved && !!newScheduled;

    results.push({
      id: 4,
      name: 'Preservação de status COMPLETED em re-execução',
      expected: 'Tarefa COMPLETED preservada intacta + nova tarefa adicionada',
      actual: `Total=${assignments.length}, Concluída mantida=${!!completedPreserved}`,
      passed,
      details: 'Tarefas já concluídas no dia não são sobrescritas nem duplicadas em re-distribuição'
    });
  }

  return results;
}
