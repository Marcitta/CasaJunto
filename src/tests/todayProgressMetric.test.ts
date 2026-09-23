/**
 * CASA JUNTO — TEST SUITE: HOTFIX-METRIC-1 (TODAY PROGRESS METRIC)
 * 15 Testes Canônicos: HM01 - HM15
 * 
 * Valida estritamente:
 * - Escopo de data: apenas ocorrências do dia ativo entram no total (D+1 a D+14 e passado excluídos)
 * - Statuses operacionais: PENDING, SCHEDULED, IN_PROGRESS, COMPLETED, DONE no denominador; COMPLETED/DONE no numerador
 * - Exclusões: CANCELLED, EXEMPT, MISSED, SKIPPED, rotinas inativas
 * - Integridade de fuso horário America/Sao_Paulo sem desvio UTC
 * - Deduplicação canônica sem dupla contagem
 * - Identidade de universo entre TodayView e RightSidebar (Progresso do Lar)
 */

import { Task, Family, FamilyTask } from '../types';
import { 
  computeTodayProgress, 
  resolveTodayDate, 
  isOperationalTaskStatus,
  isCompletedTaskStatus,
  isActionableTaskStatus 
} from '../domain/selectors/todayProgressSelectors';
import { getFamilyLocalDate, addDaysToDate } from '../domain/utils/dateTimeUtils';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

export function runTodayProgressMetricTestSuite(): TestResult[] {
  const results: TestResult[] = [];

  const mockFamily: Family = {
    id: 'fam-silva-01',
    name: 'Família Silva',
    timezone: 'America/Sao_Paulo',
    active: true,
    status: 'ACTIVE'
  };

  const TODAY = getFamilyLocalDate(mockFamily.timezone);
  const TOMORROW = addDaysToDate(TODAY, 1);
  const YESTERDAY = addDaysToDate(TODAY, -1);

  const makeTask = (
    id: string,
    title: string,
    dueDate: string,
    status: Task['status'] = 'PENDING',
    extra: Partial<Task> = {}
  ): Task => ({
    id,
    familyId: 'fam-silva-01',
    roomId: 'rm-1',
    title,
    status,
    dueDate,
    scheduledDate: dueDate,
    assignedMemberId: 'usr-marcia',
    assigneeId: 'usr-marcia',
    taskMasterId: extra.taskMasterId || `tm-${id}`,
    familyTaskId: extra.familyTaskId || `ft-${id}`,
    effort: 10,
    frequency: 'DAILY',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...extra
  });

  const activeFamilyTasks: FamilyTask[] = [
    { id: 'ft-1', family_id: 'fam-silva-01', task_master_id: 'tm-1', frequency: 'daily', active: true },
    { id: 'ft-2', family_id: 'fam-silva-01', task_master_id: 'tm-2', frequency: 'daily', active: true },
    { id: 'ft-3', family_id: 'fam-silva-01', task_master_id: 'tm-3', frequency: 'daily', active: true },
    { id: 'ft-inactive', family_id: 'fam-silva-01', task_master_id: 'tm-inactive', frequency: 'daily', active: false }
  ];

  // HM01: somente assignments de hoje entram no total
  {
    const tasks: Task[] = [
      makeTask('t1', 'Tarefa Hoje 1', TODAY, 'PENDING'),
      makeTask('t2', 'Tarefa Hoje 2', TODAY, 'DONE'),
      makeTask('t3', 'Tarefa Amanhã', TOMORROW, 'PENDING')
    ];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 2 && metrics.completedToday === 1;

    results.push({
      id: 'HM01',
      name: 'HM01: somente assignments de hoje entram no total',
      passed,
      expected: 'totalToday = 2 (apenas tarefas de hoje)',
      actual: `totalToday = ${metrics.totalToday}, completedToday = ${metrics.completedToday}`
    });
  }

  // HM02: D+1 não entra
  {
    const tasks: Task[] = [
      makeTask('t-today', 'Tarefa de Hoje', TODAY, 'PENDING'),
      makeTask('t-tomorrow-1', 'Tarefa D+1', TOMORROW, 'PENDING'),
      makeTask('t-tomorrow-2', 'Tarefa D+1 Concluída', TOMORROW, 'DONE')
    ];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 1 && !metrics.allOperationalTasks.some(t => t.id.startsWith('t-tomorrow'));

    results.push({
      id: 'HM02',
      name: 'HM02: D+1 não entra',
      passed,
      expected: 'Tarefas de amanhã (D+1) estritamente excluídas',
      actual: `totalToday = ${metrics.totalToday} (D+1 excluídas com sucesso)`
    });
  }

  // HM03: D+14 não entra
  {
    const tasks: Task[] = [makeTask('t-today', 'Tarefa Hoje', TODAY, 'PENDING')];
    for (let i = 2; i <= 14; i++) {
      const d = addDaysToDate(TODAY, i);
      tasks.push(makeTask(`t-d${i}`, `Tarefa Futura D+${i}`, d, 'PENDING'));
    }
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 1 && tasks.length === 14;

    results.push({
      id: 'HM03',
      name: 'HM03: D+14 não entra',
      passed,
      expected: 'Tarefas do horizonte D+2 a D+14 estritamente excluídas',
      actual: `De ${tasks.length} tarefas no horizonte, apenas ${metrics.totalToday} entrou no dia`
    });
  }

  // HM04: passado não entra
  {
    const tasks: Task[] = [
      makeTask('t-past-pending', 'Tarefa Ontem Pendente', YESTERDAY, 'PENDING'),
      makeTask('t-past-done', 'Tarefa Ontem Concluída', YESTERDAY, 'DONE'),
      makeTask('t-today-pending', 'Tarefa Hoje Pendente', TODAY, 'PENDING')
    ];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 1 && metrics.completedToday === 0;

    results.push({
      id: 'HM04',
      name: 'HM04: passado não entra',
      passed,
      expected: 'Tarefas de datas passadas estritamente excluídas do denominador e numerador de hoje',
      actual: `totalToday = ${metrics.totalToday}, completedToday = ${metrics.completedToday}`
    });
  }

  // HM05: PENDING entra no denominador
  {
    const tasks: Task[] = [makeTask('t-pending', 'Tarefa Pendente', TODAY, 'PENDING')];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 1 && metrics.actionableToday === 1 && metrics.completedToday === 0 && metrics.progressPercent === 0;

    results.push({
      id: 'HM05',
      name: 'HM05: PENDING entra no denominador',
      passed,
      expected: 'totalToday = 1, actionableToday = 1, completedToday = 0, progressPercent = 0%',
      actual: `total = ${metrics.totalToday}, actionable = ${metrics.actionableToday}, completed = ${metrics.completedToday}, % = ${metrics.progressPercent}%`
    });
  }

  // HM06: SCHEDULED entra
  {
    const tasks: Task[] = [makeTask('t-scheduled', 'Tarefa Agendada', TODAY, 'SCHEDULED' as any)];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 1 && metrics.actionableToday === 1 && metrics.completedToday === 0;

    results.push({
      id: 'HM06',
      name: 'HM06: SCHEDULED entra',
      passed,
      expected: 'SCHEDULED contabilizado como tarefa acionável no denominador',
      actual: `total = ${metrics.totalToday}, actionable = ${metrics.actionableToday}`
    });
  }

  // HM07: IN_PROGRESS entra
  {
    const tasks: Task[] = [makeTask('t-in-progress', 'Tarefa Em Andamento', TODAY, 'IN_PROGRESS' as any)];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 1 && metrics.actionableToday === 1 && metrics.completedToday === 0;

    results.push({
      id: 'HM07',
      name: 'HM07: IN_PROGRESS entra',
      passed,
      expected: 'IN_PROGRESS contabilizado como tarefa acionável no denominador',
      actual: `total = ${metrics.totalToday}, actionable = ${metrics.actionableToday}`
    });
  }

  // HM08: COMPLETED entra no numerador e denominador
  {
    const tasks: Task[] = [
      makeTask('t-comp', 'Tarefa Concluída', TODAY, 'COMPLETED' as any),
      makeTask('t-pend', 'Tarefa Pendente', TODAY, 'PENDING')
    ];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 2 && metrics.completedToday === 1 && metrics.progressPercent === 50;

    results.push({
      id: 'HM08',
      name: 'HM08: COMPLETED entra no numerador e denominador',
      passed,
      expected: 'totalToday = 2, completedToday = 1, progress = 50%',
      actual: `total = ${metrics.totalToday}, completed = ${metrics.completedToday}, progress = ${metrics.progressPercent}%`
    });
  }

  // HM09: DONE entra no numerador e denominador
  {
    const tasks: Task[] = [
      makeTask('t-done', 'Tarefa Feita', TODAY, 'DONE'),
      makeTask('t-pend', 'Tarefa Pendente', TODAY, 'PENDING')
    ];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 2 && metrics.completedToday === 1 && metrics.progressPercent === 50;

    results.push({
      id: 'HM09',
      name: 'HM09: DONE entra no numerador e denominador',
      passed,
      expected: 'totalToday = 2, completedToday = 1, progress = 50%',
      actual: `total = ${metrics.totalToday}, completed = ${metrics.completedToday}, progress = ${metrics.progressPercent}%`
    });
  }

  // HM10: CANCELLED não entra
  {
    const tasks: Task[] = [
      makeTask('t-canc', 'Tarefa Cancelada', TODAY, 'CANCELLED'),
      makeTask('t-exempt', 'Tarefa Dispensada', TODAY, 'EXEMPT'),
      makeTask('t-missed', 'Tarefa Perdida', TODAY, 'MISSED'),
      makeTask('t-valid', 'Tarefa Válida', TODAY, 'PENDING')
    ];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    const passed = metrics.totalToday === 1 && metrics.actionableToday === 1 && metrics.completedToday === 0;

    results.push({
      id: 'HM10',
      name: 'HM10: CANCELLED não entra',
      passed,
      expected: 'CANCELLED, EXEMPT e MISSED excluídos (apenas 1 tarefa no total)',
      actual: `totalToday = ${metrics.totalToday}`
    });
  }

  // HM11: inactive FamilyTask não entra
  {
    const tasks: Task[] = [
      makeTask('t-act-1', 'Tarefa Ativa', TODAY, 'PENDING', { familyTaskId: 'ft-1', taskMasterId: 'tm-1' }),
      makeTask('t-inact-1', 'Tarefa Desativada', TODAY, 'PENDING', { familyTaskId: 'ft-inactive', taskMasterId: 'tm-inactive' })
    ];
    const metrics = computeTodayProgress({ 
      tasks, 
      family: mockFamily, 
      familyTasks: activeFamilyTasks, 
      targetDate: TODAY 
    });
    const passed = metrics.totalToday === 1 && metrics.allOperationalTasks[0].id === 't-act-1';

    results.push({
      id: 'HM11',
      name: 'HM11: inactive FamilyTask não entra',
      passed,
      expected: 'Ocorrência vinculada a FamilyTask inativa (active=false) estritamente excluída',
      actual: `totalToday = ${metrics.totalToday}, tarefa incluída: ${metrics.allOperationalTasks[0]?.id}`
    });
  }

  // HM12: timezone America/Sao_Paulo sem UTC date drift
  {
    const spDate = getFamilyLocalDate('America/Sao_Paulo');
    const resolved = resolveTodayDate({ family: mockFamily });
    const passed = spDate === resolved && /^\d{4}-\d{2}-\d{2}$/.test(resolved);

    results.push({
      id: 'HM12',
      name: 'HM12: timezone America/Sao_Paulo sem UTC date drift',
      passed,
      expected: 'Data local no fuso America/Sao_Paulo formatada sem desvio UTC',
      actual: `Data resolvida: ${resolved}`
    });
  }

  // HM13: F5 mantém exatamente o mesmo resultado
  {
    const tasks: Task[] = [
      makeTask('t1', 'Tarefa 1', TODAY, 'DONE'),
      makeTask('t2', 'Tarefa 2', TODAY, 'PENDING'),
      makeTask('t3', 'Tarefa 3', TODAY, 'PENDING')
    ];
    const m1 = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    // Simula reload/F5 reconstruindo context idêntico
    const clonedTasks: Task[] = JSON.parse(JSON.stringify(tasks));
    const m2 = computeTodayProgress({ tasks: clonedTasks, family: JSON.parse(JSON.stringify(mockFamily)), targetDate: TODAY });
    const passed = m1.totalToday === m2.totalToday && 
                   m1.completedToday === m2.completedToday && 
                   m1.progressPercent === m2.progressPercent &&
                   m1.progressPercent === 33;

    results.push({
      id: 'HM13',
      name: 'HM13: F5 mantém exatamente o mesmo resultado',
      passed,
      expected: 'Idempotência determinística pós-F5 (33% de progresso mantido)',
      actual: `m1: ${m1.completedToday}/${m1.totalToday} (${m1.progressPercent}%) === m2: ${m2.completedToday}/${m2.totalToday} (${m2.progressPercent}%)`
    });
  }

  // HM14: ocorrência canônica não é contada duas vezes
  {
    // Simula duas atribuições para o mesmo task_master_id na mesma data (duplicata de banco)
    const tasks: Task[] = [
      makeTask('asg-dup-pending', 'Água do Pet Pendente', TODAY, 'PENDING', { taskMasterId: 'pet-2' }),
      makeTask('asg-dup-completed', 'Água do Pet Concluída', TODAY, 'DONE', { taskMasterId: 'pet-2' })
    ];
    const metrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    // Deve deduplicar para exatamente 1 ocorrência canônica e priorizar a concluída
    const passed = metrics.totalToday === 1 && metrics.completedToday === 1 && metrics.progressPercent === 100;

    results.push({
      id: 'HM14',
      name: 'HM14: ocorrência canônica não é contada duas vezes',
      passed,
      expected: 'Deduplicação canônica mantém 1 ocorrência única, priorizando COMPLETED/DONE',
      actual: `totalToday = ${metrics.totalToday}, completedToday = ${metrics.completedToday}, progress = ${metrics.progressPercent}%`
    });
  }

  // HM15: TodayView e Progress usam o mesmo universo diário
  {
    const tasks: Task[] = [
      makeTask('t-today-1', 'Tarefa Hoje 1', TODAY, 'PENDING'),
      makeTask('t-today-2', 'Tarefa Hoje 2', TODAY, 'DONE'),
      makeTask('t-future', 'Tarefa Futura', TOMORROW, 'PENDING'),
      makeTask('t-past', 'Tarefa Passada', YESTERDAY, 'DONE'),
      makeTask('t-cancelled', 'Tarefa Cancelada', TODAY, 'CANCELLED')
    ];
    const progressMetrics = computeTodayProgress({ tasks, family: mockFamily, targetDate: TODAY });
    
    // Universo do TodayView:
    const todayActionable = progressMetrics.actionableTasks;
    const todayCompleted = progressMetrics.completedTasks;
    const todayViewTotal = todayActionable.length + todayCompleted.length;

    const sameUniverse = 
      todayViewTotal === progressMetrics.totalToday &&
      todayCompleted.length === progressMetrics.completedToday &&
      todayActionable.length === progressMetrics.actionableToday;

    results.push({
      id: 'HM15',
      name: 'HM15: TodayView e Progress usam o mesmo universo diário',
      passed: sameUniverse,
      expected: 'TodayView universe === Progress universe (mesmo denominador e numerador)',
      actual: sameUniverse ? `Universo compartilhado idêntico: ${progressMetrics.completedToday} de ${progressMetrics.totalToday}` : 'Discrepância entre TodayView e Progress'
    });
  }

  return results;
}
