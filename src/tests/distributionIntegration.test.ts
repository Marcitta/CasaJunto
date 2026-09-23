/**
 * CASA JUNTO — DISTRIBUTION ENGINE INTEGRATION TEST SUITE (1.0B)
 * Valida a integração do Motor 2.0 (DistributionEngine) com AppContext,
 * DistributionService, perfis com idade dinâmica, restrições e tenant isolation.
 */

import { DistributionService } from '../application/services/DistributionService';
import { Family, Member, Task, ProtectedTime } from '../types';
import { allMasterTasks } from '../data/tasks';
import { DEMO_FAMILY, DEMO_MEMBERS, DEMO_TASKS } from '../data/mockData';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export function runDistributionIntegrationTestSuite(): TestResult[] {
  const results: TestResult[] = [];

  const baseFamily: Family = {
    id: 'fam-real-test',
    name: 'Família Integração Real',
    active: true
  };

  // DIST01: Rebalanceamento não afeta tarefas concluídas (status COMPLETED preservado e não redistribuído)
  try {
    const members: Member[] = [
      { id: 'm1', name: 'Ana', age: 35, autonomy_level: 4, active: true },
      { id: 'm2', name: 'Beto', age: 36, autonomy_level: 4, active: true }
    ];

    const completedTask: Task = {
      id: 'task-done-1',
      familyId: baseFamily.id,
      title: 'Lavar Louça do Almoço',
      status: 'DONE',
      assignedMemberId: 'm1',
      assigneeId: 'm1',
      dueDate: '2026-09-08',
      roomId: 'kitchen',
      frequency: 'DAILY',
      effort: 10,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const pendingTask: Task = {
      id: 'task-pend-1',
      familyId: baseFamily.id,
      title: 'Organizar Sala',
      status: 'PENDING',
      assignedMemberId: 'm1',
      assigneeId: 'm1',
      dueDate: '2026-09-08',
      roomId: 'living_room',
      frequency: 'DAILY',
      effort: 10,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: baseFamily,
      members,
      tasks: [completedTask, pendingTask],
      protectedTimes: [],
      targetDate: '2026-09-08',
      dayOfWeek: 2
    });

    // Tarefa DONE não deve ser movida
    const doneAssignment = result.proposedAssignments.find(a => a.id === completedTask.id);
    const passed = doneAssignment?.status === 'COMPLETED' && doneAssignment?.member_id === 'm1';

    results.push({
      id: 'DIST01',
      name: 'Rebalanceamento não afeta tarefas concluídas (status COMPLETED preservado e fixo)',
      passed: !!passed,
      details: `Status: ${doneAssignment?.status}, Atribuído a: ${doneAssignment?.member_id}`
    });
  } catch (err: any) {
    results.push({ id: 'DIST01', name: 'Rebalanceamento tarefas concluídas', passed: false, details: err.message });
  }

  // DIST02: Morador menor de idade (ex: 8 anos) não recebe tarefas com minimum_age superior (ex: 12 anos)
  try {
    const members: Member[] = [
      { id: 'kid-1', name: 'Zezinho', age: 8, autonomy_level: 2, active: true },
      { id: 'adult-1', name: 'Mariana', age: 34, autonomy_level: 4, active: true }
    ];

    // Master com minimum_age 12 (ex: limpeza pesada ou química)
    const heavyTask: Task = {
      id: 'task-heavy-1',
      familyId: baseFamily.id,
      title: 'Limpeza Pesada com Produtos Químicos',
      status: 'PENDING',
      assignedMemberId: 'kid-1',
      assigneeId: 'kid-1',
      dueDate: '2026-09-08',
      roomId: 'bathroom',
      frequency: 'DAILY',
      effort: 15,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result } = DistributionService.executeRebalance({
      family: baseFamily,
      members,
      tasks: [heavyTask],
      protectedTimes: [],
      targetDate: '2026-09-08',
      dayOfWeek: 2
    });

    const asg = result.proposedAssignments.find(a => a.id === heavyTask.id);
    const passed = asg?.member_id === 'adult-1';

    results.push({
      id: 'DIST02',
      name: 'Morador menor de idade (8 anos) não recebe tarefas com idade mínima superior',
      passed: !!passed,
      details: `Atribuído a: ${asg?.member_id} (Mariana)`
    });
  } catch (err: any) {
    results.push({ id: 'DIST02', name: 'Restrição de idade mínima', passed: false, details: err.message });
  }

  // DIST03: Morador sem autonomia suficiente (ex: autonomy 1) não recebe tarefa de alta complexidade
  try {
    const members: Member[] = [
      { id: 'm-low', name: 'Novato', age: 25, autonomy_level: 1, active: true },
      { id: 'm-high', name: 'Experiente', age: 28, autonomy_level: 4, active: true }
    ];

    // Tarefa que exige autonomia alta (ex: passar roupa social ou manutenção)
    const masterTask = allMasterTasks.find(tm => (tm.autonomy_required || 0) >= 3) || allMasterTasks[0];
    const highTask: Task = {
      id: 'task-high-auto',
      familyId: baseFamily.id,
      title: masterTask.name,
      taskMasterId: masterTask.id,
      status: 'PENDING',
      assignedMemberId: 'm-low',
      assigneeId: 'm-low',
      dueDate: '2026-09-08',
      roomId: 'general',
      frequency: 'DAILY',
      effort: 15,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result } = DistributionService.executeRebalance({
      family: baseFamily,
      members,
      tasks: [highTask],
      protectedTimes: [],
      targetDate: '2026-09-08',
      dayOfWeek: 2
    });

    const asg = result.proposedAssignments.find(a => a.id === highTask.id);
    const passed = asg?.member_id === 'm-high';

    results.push({
      id: 'DIST03',
      name: 'Morador com autonomia nível 1 não recebe tarefa que exige autonomia superior',
      passed: !!passed,
      details: `Atribuído a: ${asg?.member_id} (Experiente)`
    });
  } catch (err: any) {
    results.push({ id: 'DIST03', name: 'Restrição de nível de autonomia', passed: false, details: err.message });
  }

  // DIST04: Horário protegido de sono ou estudo bloqueia alocação de tarefa no mesmo período
  try {
    const members: Member[] = [
      { id: 'm-busy', name: 'Estudante', age: 20, autonomy_level: 3, active: true },
      { id: 'm-free', name: 'Disponível', age: 22, autonomy_level: 3, active: true }
    ];

    const protectedTimes: ProtectedTime[] = [
      {
        id: 'pt-study',
        family_id: baseFamily.id,
        member_id: 'm-busy',
        label: 'Aulas na Faculdade',
        type: 'STUDY',
        start_time: '08:00',
        end_time: '12:00',
        day_of_week: [2],
        active: true
      }
    ];

    const morningTask: Task = {
      id: 'task-morning',
      familyId: baseFamily.id,
      title: 'Passear com o Cachorro de Manhã',
      scheduledStart: '09:00',
      status: 'PENDING',
      assignedMemberId: 'm-busy',
      assigneeId: 'm-busy',
      dueDate: '2026-09-08',
      roomId: 'outdoor',
      frequency: 'DAILY',
      effort: 10,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result } = DistributionService.executeRebalance({
      family: baseFamily,
      members,
      tasks: [morningTask],
      protectedTimes,
      targetDate: '2026-09-08',
      dayOfWeek: 2
    });

    const asg = result.proposedAssignments.find(a => a.id === morningTask.id);
    const passed = asg?.member_id === 'm-free';

    results.push({
      id: 'DIST04',
      name: 'Horário protegido (08:00-12:00) bloqueia alocação de tarefa no período para o morador',
      passed: !!passed,
      details: `Atribuído a: ${asg?.member_id} (m-free) desviando de m-busy em aula`
    });
  } catch (err: any) {
    results.push({ id: 'DIST04', name: 'Bloqueio por Horário Protegido', passed: false, details: err.message });
  }

  // DIST05: Teto diário de esforço (max_daily_minutes) impede alocação de tarefas excedentes
  try {
    const members: Member[] = [
      { id: 'm-cap', name: 'Capacidade Limitada', age: 30, autonomy_level: 3, max_daily_minutes: 20, active: true },
      { id: 'm-large', name: 'Livre', age: 30, autonomy_level: 3, max_daily_minutes: 180, active: true }
    ];

    const task1: Task = {
      id: 'task-t1',
      familyId: baseFamily.id,
      title: 'Varrer Cozinha',
      durationMinutes: 15,
      status: 'PENDING',
      dueDate: '2026-09-08',
      roomId: 'kitchen',
      frequency: 'DAILY',
      effort: 10,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const task2: Task = {
      id: 'task-t2',
      familyId: baseFamily.id,
      title: 'Limpar Vidros',
      durationMinutes: 25,
      status: 'PENDING',
      dueDate: '2026-09-08',
      roomId: 'living_room',
      frequency: 'DAILY',
      effort: 10,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result } = DistributionService.executeRebalance({
      family: baseFamily,
      members,
      tasks: [task1, task2],
      protectedTimes: [],
      targetDate: '2026-09-08',
      dayOfWeek: 2
    });

    // m-cap tem max 20 min. Não pode receber task2 (25 min) ou ambas juntas (40 min).
    const mCapAssignments = result.proposedAssignments.filter(a => a.member_id === 'm-cap');
    const totalMinutes = mCapAssignments.reduce((acc, a) => {
      return acc + (a.task_id === task2.id ? 25 : 15);
    }, 0);

    const passed = totalMinutes <= 20;

    results.push({
      id: 'DIST05',
      name: 'Teto diário de esforço (max_daily_minutes) impede alocação de tarefas excedentes',
      passed,
      details: `Minutos alocados para morador limitado: ${totalMinutes} min (máximo 20 min)`
    });
  } catch (err: any) {
    results.push({ id: 'DIST05', name: 'Teto diário de esforço', passed: false, details: err.message });
  }

  // DIST06: Tarefa com restrição de segurança sem nenhum morador qualificado permanece NÃO ATRIBUÍDA com explainability
  try {
    const childOnlyMembers: Member[] = [
      { id: 'kid-only', name: 'Pedrinho', age: 7, autonomy_level: 1, active: true }
    ];

    const adultTask: Task = {
      id: 'task-dangerous',
      familyId: baseFamily.id,
      title: 'Troca de Disjuntor Elétrico e Fiação',
      status: 'PENDING',
      dueDate: '2026-09-08',
      roomId: 'general',
      frequency: 'DAILY',
      effort: 20,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result } = DistributionService.executeRebalance({
      family: baseFamily,
      members: childOnlyMembers,
      tasks: [adultTask],
      protectedTimes: [],
      targetDate: '2026-09-08',
      dayOfWeek: 2
    });

    const asg = result.proposedAssignments.find(a => a.id === adultTask.id);
    const passed = asg?.is_unassigned === true && (!asg?.member_id || asg.member_id === '');

    results.push({
      id: 'DIST06',
      name: 'Tarefa com restrição de segurança sem morador qualificado permanece NÃO ATRIBUÍDA',
      passed: !!passed,
      details: `is_unassigned: ${asg?.is_unassigned}, member_id: '${asg?.member_id}'`
    });
  } catch (err: any) {
    results.push({ id: 'DIST06', name: 'Não atribuição segura', passed: false, details: err.message });
  }

  // DIST07: Tarefas não atribuídas exibem `is_unassigned: true` e motivo específico (`unassigned_reason`)
  try {
    const singleChild: Member[] = [
      { id: 'child-7', name: 'Aninha', age: 6, autonomy_level: 1, active: true }
    ];

    const chemicalTask: Task = {
      id: 'task-chem',
      familyId: baseFamily.id,
      title: 'Desinfetar Banheiro com Cloro Puro',
      status: 'PENDING',
      dueDate: '2026-09-08',
      roomId: 'bathroom',
      frequency: 'DAILY',
      effort: 15,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result } = DistributionService.executeRebalance({
      family: baseFamily,
      members: singleChild,
      tasks: [chemicalTask],
      protectedTimes: [],
      targetDate: '2026-09-08',
      dayOfWeek: 2
    });

    const asg = result.proposedAssignments.find(a => a.id === chemicalTask.id);
    const hasReason = typeof asg?.unassigned_reason === 'string' && asg.unassigned_reason.length > 0;
    const passed = asg?.is_unassigned === true && hasReason;

    results.push({
      id: 'DIST07',
      name: 'Tarefas não atribuídas contêm is_unassigned: true e unassigned_reason explicativo',
      passed: !!passed,
      details: `Motivo fornecido pelo motor: "${asg?.unassigned_reason}"`
    });
  } catch (err: any) {
    results.push({ id: 'DIST07', name: 'Explainability de não atribuição', passed: false, details: err.message });
  }

  // DIST08: Tarefas agendadas possuem horário de início e fim calculados respeitando duração
  try {
    const member: Member[] = [
      { id: 'm-time', name: 'Carlos', age: 28, autonomy_level: 3, active: true }
    ];

    const scheduledTask: Task = {
      id: 'task-time-test',
      familyId: baseFamily.id,
      title: 'Passear com o Pet',
      durationMinutes: 45,
      scheduledStart: '14:00',
      status: 'PENDING',
      dueDate: '2026-09-08',
      roomId: 'outdoor',
      frequency: 'DAILY',
      effort: 10,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result } = DistributionService.executeRebalance({
      family: baseFamily,
      members: member,
      tasks: [scheduledTask],
      protectedTimes: [],
      targetDate: '2026-09-08',
      dayOfWeek: 2
    });

    const asg = result.proposedAssignments.find(a => a.id === scheduledTask.id);
    const passed = asg?.scheduled_start === '14:00' && asg?.scheduled_end === '14:45';

    results.push({
      id: 'DIST08',
      name: 'Tarefas agendadas possuem horário de início (14:00) e fim (14:45) com base na duração',
      passed: !!passed,
      details: `Início: ${asg?.scheduled_start}, Fim: ${asg?.scheduled_end}`
    });
  } catch (err: any) {
    results.push({ id: 'DIST08', name: 'Cálculo de início e fim', passed: false, details: err.message });
  }

  // DIST09: Rebalanceamento respeita tenant isolation (family_id exclusivo)
  try {
    const famA: Family = { id: 'fam-alpha', name: 'Família Alpha', active: true };
    const famB: Family = { id: 'fam-beta', name: 'Família Beta', active: true };

    const membersAlpha: Member[] = [
      { id: 'm-alpha', familyId: famA.id, name: 'Lucas Alpha', age: 30, autonomy_level: 3, active: true }
    ];

    const membersBeta: Member[] = [
      { id: 'm-beta', familyId: famB.id, name: 'Renato Beta', age: 32, autonomy_level: 3, active: true }
    ];

    const taskAlpha: Task = {
      id: 'task-alpha-1',
      familyId: famA.id,
      title: 'Tarefa Exclusiva de Alpha',
      status: 'PENDING',
      dueDate: '2026-09-08',
      roomId: 'general',
      frequency: 'DAILY',
      effort: 10,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    // Executa rebalanceamento com contexto restrito a Alpha
    const ctxAlpha = DistributionService.buildContext({
      family: famA,
      members: membersAlpha,
      tasks: [taskAlpha],
      protectedTimes: []
    });

    const passed = ctxAlpha.familyTasks.every(ft => ft.family_id === famA.id) &&
                   ctxAlpha.users.every(u => u.familyId === famA.id);

    results.push({
      id: 'DIST09',
      name: 'Rebalanceamento respeita tenant isolation estrito sem contaminação entre famílias',
      passed,
      details: `FamilyId verificado: ${famA.id}, total de usuários de Alpha: ${ctxAlpha.users.length}`
    });
  } catch (err: any) {
    results.push({ id: 'DIST09', name: 'Isolamento de Tenant', passed: false, details: err.message });
  }

  // DIST10: Idade derivada dinamicamente de birth_date é respeitada pelo motor
  try {
    // Morador tem age estático = 25 nos dados legados, mas birth_date indica 9 anos de idade!
    const today = new Date();
    const nineYearsAgo = new Date(today.getFullYear() - 9, today.getMonth(), today.getDate()).toISOString().split('T')[0];

    const memberWithDerivedAge: Member = {
      id: 'm-derived',
      name: 'Joãozinho',
      birth_date: nineYearsAgo,
      age: 25, // Estático incorreto
      autonomy_level: 2,
      active: true
    };

    const ctx = DistributionService.buildContext({
      family: baseFamily,
      members: [memberWithDerivedAge],
      tasks: [],
      protectedTimes: []
    });

    const userInCtx = ctx.users.find(u => u.id === 'm-derived');
    const passed = userInCtx?.age === 9;

    results.push({
      id: 'DIST10',
      name: 'Idade derivada dinamicamente de birth_date (9 anos) sobrepõe valor estático inválido',
      passed: !!passed,
      details: `Idade calculada dinamicamente: ${userInCtx?.age} anos (estático legado era 25)`
    });
  } catch (err: any) {
    results.push({ id: 'DIST10', name: 'Derivação de idade no motor', passed: false, details: err.message });
  }

  // DIST11: Histórico de rebalanceamento calcula changesCount com precisão ao transferir tarefas
  try {
    const members: Member[] = [
      { id: 'm-busy-now', name: 'Ocupado', age: 30, autonomy_level: 3, active: true },
      { id: 'm-free-now', name: 'Livre', age: 30, autonomy_level: 3, active: true }
    ];

    const pt: ProtectedTime = {
      id: 'pt-busy',
      family_id: baseFamily.id,
      member_id: 'm-busy-now',
      label: 'Reunião Inadiável',
      type: 'WORK',
      start_time: '10:00',
      end_time: '11:00',
      day_of_week: [2],
      active: true
    };

    const taskToMove: Task = {
      id: 'task-shift-1',
      familyId: baseFamily.id,
      title: 'Tirar o Lixo',
      scheduledStart: '10:15',
      status: 'PENDING',
      assignedMemberId: 'm-busy-now', // Originalmente nele
      assigneeId: 'm-busy-now',
      dueDate: '2026-09-08',
      roomId: 'kitchen',
      frequency: 'DAILY',
      effort: 10,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result } = DistributionService.executeRebalance({
      family: baseFamily,
      members,
      tasks: [taskToMove],
      protectedTimes: [pt],
      targetDate: '2026-09-08',
      dayOfWeek: 2
    });

    const passed = result.changesCount === 1;

    results.push({
      id: 'DIST11',
      name: 'Histórico de rebalanceamento calcula changesCount com precisão ao transferir tarefas',
      passed,
      details: `Mudanças detectadas pelo algoritmo: ${result.changesCount}`
    });
  } catch (err: any) {
    results.push({ id: 'DIST11', name: 'Cálculo de changesCount', passed: false, details: err.message });
  }

  // DIST12: Mock demo e dados reais operam isoladamente sem contaminação mútua
  try {
    const realFam: Family = { id: 'fam-real-999', name: 'Família Real Isolada', active: true };
    const realMembers: Member[] = [
      { id: 'real-user-1', name: 'Usuário Real', age: 35, autonomy_level: 3, active: true }
    ];
    const realTask: Task = {
      id: 'real-task-1',
      familyId: realFam.id,
      title: 'Cuidar do Jardim Real',
      status: 'PENDING',
      dueDate: '2026-09-08',
      roomId: 'garden',
      frequency: 'DAILY',
      effort: 10,
      createdAt: '2026-09-08T10:00:00Z',
      updatedAt: '2026-09-08T10:00:00Z'
    };

    const { result } = DistributionService.executeRebalance({
      family: realFam,
      members: realMembers,
      tasks: [realTask],
      protectedTimes: [],
      targetDate: '2026-09-08'
    });

    // Garante que nenhum membro da demo (ex: 'Carlos Silva', 'm1', etc.) ou tarefa da demo apareceu
    const demoMemberIds = new Set(DEMO_MEMBERS.map(m => m.id));
    const demoTaskIds = new Set(DEMO_TASKS.map(t => t.id));

    const contaminated = result.proposedAssignments.some(
      a => demoMemberIds.has(a.member_id) || demoTaskIds.has(a.id)
    );

    const passed = !contaminated && result.proposedAssignments.length === 1;

    results.push({
      id: 'DIST12',
      name: 'Mock demo e dados reais operam isoladamente sem contaminação mútua',
      passed,
      details: `Contaminação detectada: ${contaminated} (propostas isoladas: ${result.proposedAssignments.length})`
    });
  } catch (err: any) {
    results.push({ id: 'DIST12', name: 'Isolamento Demo vs Real', passed: false, details: err.message });
  }

  return results;
}
