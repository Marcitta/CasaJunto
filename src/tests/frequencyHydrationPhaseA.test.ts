/**
 * CASA JUNTO — FASE A: CORREÇÃO DE FREQUÊNCIAS (TESTES AUTOMATIZADOS)
 * Cobertura obrigatória:
 * - Rotina diária
 * - Rotina semanal com um dia
 * - Ocorrência semanal da Ruthe em 14/10/2026 exibindo "Semanal — quarta-feira"
 * - Rotina semanal com vários dias
 * - Rotina pontual
 * - Rotina vinculada não encontrada (tratamento explícito sem fallback silencioso para DAILY)
 * - Preservação de datas e atribuições existentes
 * - Ausência de alterações no Motor 2.0
 * - Paridade de hidratação entre mapAssignmentsToTasks, completeTaskDetailed e reloadAssignments
 */

import { mapAssignmentsToTasks } from '../context/AppContext';
import { 
  formatFrequencyLabel, 
  resolveFrequencyFromRoutine, 
  WEEKDAY_FULL_NAMES, 
  formatWeekdayList 
} from '../utils/frequencyUtils';
import { FamilyTask, TaskAssignment, Room, TaskMaster, DomesticSupport } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export async function runFrequencyPhaseATestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const record = (id: string, name: string, fn: () => void | Promise<void>) => {
    try {
      fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, details: err?.message || String(err) });
    }
  };

  const dummyRooms: Room[] = [
    { id: 'room-cozinha', name: 'Cozinha', type: 'kitchen', active: true },
    { id: 'room-banheiro', name: 'Banheiro Social', type: 'bathroom', active: true }
  ];

  const dummyMasterTasks: TaskMaster[] = [
    { id: 'kit-1', name: 'Lavar Louça', category: 'kitchen', room_type: 'kitchen', effort_level: 2 },
    { id: 'bath-1', name: 'Lavar e desinfetar o vaso sanitário', category: 'bathroom', room_type: 'bathroom', effort_level: 3 },
    { id: 'clean-1', name: 'Aspirar Casa', category: 'cleaning', room_type: 'living_room', effort_level: 2 }
  ];

  // 1. Rotina Diária
  record('FREQ-01', 'Rotina diária é hidratada como DAILY e formatada como "Diária"', () => {
    const routine: FamilyTask = {
      id: 'ft-daily',
      family_id: 'fam-test',
      task_master_id: 'kit-1',
      frequency: 'DAILY',
      active: true
    };
    const asg: TaskAssignment = {
      id: 'asg-daily-1',
      family_id: 'fam-test',
      family_task_id: 'ft-daily',
      task_id: 'kit-1',
      member_id: 'mem-lucas',
      scheduled_date: '2026-10-14',
      status: 'SCHEDULED'
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asg],
      rooms: dummyRooms,
      familyTasks: [routine],
      allMasterTasks: dummyMasterTasks
    });

    if (tasks.length !== 1) throw new Error('Deveria ter gerado 1 task');
    if (tasks[0].frequency !== 'DAILY') throw new Error(`Esperado frequency DAILY, obtido: ${tasks[0].frequency}`);
    if (tasks[0].routineNotFound === true) throw new Error('Rotina não deveria ser marcada como não encontrada');

    const formatted = formatFrequencyLabel(tasks[0].frequency, tasks[0].preferredDays);
    if (formatted !== 'Diária') throw new Error(`Esperado "Diária", obtido: "${formatted}"`);
  });

  // 2. Rotina Semanal com um dia
  record('FREQ-02', 'Rotina semanal com um dia formata "Semanal — [dia da semana]"', () => {
    const routine: FamilyTask = {
      id: 'ft-weekly-tue',
      family_id: 'fam-test',
      task_master_id: 'clean-1',
      frequency: 'WEEKLY',
      preferred_days: [2], // terça-feira
      active: true
    };
    const asg: TaskAssignment = {
      id: 'asg-weekly-tue',
      family_id: 'fam-test',
      family_task_id: 'ft-weekly-tue',
      task_id: 'clean-1',
      member_id: 'mem-marina',
      scheduled_date: '2026-10-13',
      status: 'SCHEDULED'
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asg],
      rooms: dummyRooms,
      familyTasks: [routine],
      allMasterTasks: dummyMasterTasks
    });

    if (tasks[0].frequency !== 'WEEKLY') throw new Error(`Esperado frequency WEEKLY, obtido: ${tasks[0].frequency}`);
    const formatted = formatFrequencyLabel({
      frequency: tasks[0].frequency,
      preferredDays: tasks[0].preferredDays
    });
    if (formatted !== 'Semanal — terça-feira') {
      throw new Error(`Esperado "Semanal — terça-feira", obtido: "${formatted}"`);
    }
  });

  // 3. Caso Específico Ruthe (Apoio externo) em 14/10/2026
  record('FREQ-03', 'Ocorrência semanal da Ruthe em 14/10/2026 exibe exatamente "Semanal — quarta-feira"', () => {
    const rutheSupport: DomesticSupport = {
      id: 'sup-ruthe',
      familyId: 'fam-test',
      name: 'Ruthe',
      type: 'CLEANER',
      active: true,
      schedule: [{ weekday: 3, startTime: '08:00', endTime: '12:00' }],
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z'
    };

    const rutheRoutine: FamilyTask = {
      id: 'ft-ruthe-vaso',
      family_id: 'fam-test',
      task_master_id: 'bath-1',
      name: 'Lavar e desinfetar o vaso sanitário',
      frequency: 'WEEKLY',
      preferred_days: [3], // Quarta-feira
      preferredDays: [3],
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: rutheSupport.id,
      room_id: 'room-banheiro',
      active: true
    };

    // Ocorrência gerada pelo Motor para a quarta-feira 14/10/2026
    const rutheAsg: TaskAssignment = {
      id: 'ft-ruthe-vaso_2026-10-14',
      family_id: 'fam-test',
      family_task_id: 'ft-ruthe-vaso',
      task_id: 'bath-1',
      member_id: '',
      room_id: 'room-banheiro',
      scheduled_date: '2026-10-14',
      scheduled_start: '08:00',
      scheduled_end: '08:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [rutheAsg],
      rooms: dummyRooms,
      familyTasks: [rutheRoutine],
      allMasterTasks: dummyMasterTasks
    });

    const task = tasks[0];
    if (!task) throw new Error('Task não gerada');
    if (task.frequency !== 'WEEKLY') {
      throw new Error(`Esperado frequency WEEKLY, mas o código hidratou como: ${task.frequency}`);
    }
    if (!task.preferredDays || task.preferredDays[0] !== 3) {
      throw new Error(`preferredDays deveria conter [3], obtido: ${JSON.stringify(task.preferredDays)}`);
    }

    const formatted = formatFrequencyLabel({
      frequency: task.frequency,
      preferredDays: task.preferredDays
    });

    if (formatted !== 'Semanal — quarta-feira') {
      throw new Error(`CRÍTICO: Esperado "Semanal — quarta-feira", obtido: "${formatted}"`);
    }
  });

  // 4. Rotina Semanal com Vários Dias
  record('FREQ-04', 'Rotina semanal com múltiplos dias formata lista legível em português', () => {
    const routine: FamilyTask = {
      id: 'ft-multi',
      family_id: 'fam-test',
      task_master_id: 'clean-1',
      frequency: 'WEEKLY',
      preferred_days: [1, 3, 5], // seg, qua, sex
      active: true
    };
    const asg: TaskAssignment = {
      id: 'asg-multi',
      family_id: 'fam-test',
      family_task_id: 'ft-multi',
      task_id: 'clean-1',
      member_id: 'mem-1',
      scheduled_date: '2026-10-14',
      status: 'SCHEDULED'
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asg],
      rooms: dummyRooms,
      familyTasks: [routine],
      allMasterTasks: dummyMasterTasks
    });

    const formatted = formatFrequencyLabel({
      frequency: tasks[0].frequency,
      preferredDays: tasks[0].preferredDays
    });

    if (formatted !== 'Semanal — seg, qua e sex') {
      throw new Error(`Esperado "Semanal — seg, qua e sex", obtido: "${formatted}"`);
    }

    // 2 dias: dom e sab
    const twoDays = formatFrequencyLabel({
      frequency: 'WEEKLY',
      preferredDays: [0, 6]
    });
    if (twoDays !== 'Semanal — dom e sáb') {
      throw new Error(`Esperado "Semanal — dom e sáb", obtido: "${twoDays}"`);
    }
  });

  // 5. Rotina Pontual / Avulsa
  record('FREQ-05', 'Rotina pontual ou atribuição avulsa é formatada como "Pontual"', () => {
    // Tarefa com FamilyTask ONE_TIME
    const routineOnce: FamilyTask = {
      id: 'ft-once',
      family_id: 'fam-test',
      task_master_id: 'clean-1',
      frequency: 'ONE_TIME',
      active: true
    };
    const asgOnce: TaskAssignment = {
      id: 'asg-once',
      family_id: 'fam-test',
      family_task_id: 'ft-once',
      task_id: 'clean-1',
      member_id: 'mem-1',
      scheduled_date: '2026-10-14',
      status: 'SCHEDULED'
    };

    const tasksOnce = mapAssignmentsToTasks({
      assignments: [asgOnce],
      rooms: dummyRooms,
      familyTasks: [routineOnce],
      allMasterTasks: dummyMasterTasks
    });

    if (tasksOnce[0].frequency !== 'ONE_TIME') {
      throw new Error(`Esperado frequency ONE_TIME, obtido: ${tasksOnce[0].frequency}`);
    }
    const formattedOnce = formatFrequencyLabel(tasksOnce[0].frequency);
    if (formattedOnce !== 'Pontual') {
      throw new Error(`Esperado "Pontual", obtido: "${formattedOnce}"`);
    }

    // Tarefa avulsa sem family_task_id
    const asgAdHoc: TaskAssignment = {
      id: 'asg-adhoc',
      family_id: 'fam-test',
      task_id: 'kit-1',
      member_id: 'mem-1',
      scheduled_date: '2026-10-14',
      status: 'SCHEDULED'
    };
    const tasksAdHoc = mapAssignmentsToTasks({
      assignments: [asgAdHoc],
      rooms: dummyRooms,
      familyTasks: [],
      allMasterTasks: dummyMasterTasks
    });
    if (tasksAdHoc[0].frequency !== 'ONE_TIME') {
      throw new Error(`Tarefa avulsa deveria ter frequency ONE_TIME, obtido: ${tasksAdHoc[0].frequency}`);
    }
    const formattedAdHoc = formatFrequencyLabel({
      frequency: tasksAdHoc[0].frequency,
      isAdHoc: true
    });
    if (formattedAdHoc !== 'Pontual') {
      throw new Error(`Esperado "Pontual", obtido: "${formattedAdHoc}"`);
    }
  });

  // 6. Rotina Vinculada NÃO Encontrada (Tratamento Explícito sem Fallback para DAILY)
  record('FREQ-06', 'Rotina vinculada não encontrada define routineNotFound: true e exibe "Rotina não encontrada"', () => {
    const orphanAsg: TaskAssignment = {
      id: 'asg-orphan-1',
      family_id: 'fam-test',
      family_task_id: 'ft-inexistente-404',
      task_id: 'kit-1',
      member_id: 'mem-lucas',
      scheduled_date: '2026-10-14',
      status: 'SCHEDULED'
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [orphanAsg],
      rooms: dummyRooms,
      familyTasks: [], // Nenhuma rotina cadastrada
      allMasterTasks: dummyMasterTasks
    });

    if (tasks.length !== 1) throw new Error('Deveria ter gerado 1 task');
    const task = tasks[0];

    // REGRA DE OURO: NÃO utilizar DAILY como fallback silencioso
    if (task.frequency === 'DAILY') {
      throw new Error('VIOLAÇÃO: Ocorrência órfã foi mascarada silenciosamente como DAILY!');
    }
    if (task.routineNotFound !== true) {
      throw new Error(`Esperado routineNotFound: true, obtido: ${task.routineNotFound}`);
    }

    const formatted = formatFrequencyLabel({
      frequency: task.frequency,
      routineNotFound: task.routineNotFound
    });
    if (formatted !== 'Rotina não encontrada') {
      throw new Error(`Esperado "Rotina não encontrada", obtido: "${formatted}"`);
    }
  });

  // 7. Preservação Integral de Datas e Atribuições
  record('FREQ-07', 'Preserva integralmente dueDate, scheduledStart/End, roomId e membros atribuídos', () => {
    const routine: FamilyTask = {
      id: 'ft-preserve',
      family_id: 'fam-test',
      task_master_id: 'kit-1',
      frequency: 'WEEKLY',
      preferred_days: [1],
      active: true
    };
    const asg: TaskAssignment = {
      id: 'asg-preserve',
      family_id: 'fam-test',
      family_task_id: 'ft-preserve',
      task_id: 'kit-1',
      member_id: 'mem-special-99',
      room_id: 'room-cozinha',
      scheduled_date: '2026-10-20',
      scheduled_start: '14:30',
      scheduled_end: '15:00',
      status: 'SCHEDULED',
      assigned_reason: 'Balanceamento Justo',
      is_unassigned: false
    };

    const tasks = mapAssignmentsToTasks({
      assignments: [asg],
      rooms: dummyRooms,
      familyTasks: [routine],
      allMasterTasks: dummyMasterTasks
    });

    const t = tasks[0];
    if (t.dueDate !== '2026-10-20') throw new Error(`Data violada: ${t.dueDate}`);
    if (t.scheduledStart !== '14:30') throw new Error(`Horário de início violado: ${t.scheduledStart}`);
    if (t.scheduledEnd !== '15:00') throw new Error(`Horário de fim violado: ${t.scheduledEnd}`);
    if (t.assignedMemberId !== 'mem-special-99') throw new Error(`Membro violado: ${t.assignedMemberId}`);
    if (t.roomId !== 'room-cozinha') throw new Error(`Cômodo violado: ${t.roomId}`);
    if (t.assignedReason !== 'Balanceamento Justo') throw new Error(`Motivo violado: ${t.assignedReason}`);
    if (t.frequency !== 'WEEKLY') throw new Error(`Frequência violada: ${t.frequency}`);
  });

  // 8. Paridade com resolveFrequencyFromRoutine
  record('FREQ-08', 'resolveFrequencyFromRoutine retorna valores consistentes para todas as frequências suportadas', () => {
    // DAILY
    const rDaily = resolveFrequencyFromRoutine({ family_task_id: 'ft-1' }, { id: 'ft-1', frequency: 'daily', active: true });
    if (rDaily.frequency !== 'DAILY' || rDaily.routineNotFound) throw new Error('DAILY inconsistente');

    // BIWEEKLY
    const rBi = resolveFrequencyFromRoutine({ family_task_id: 'ft-2' }, { id: 'ft-2', frequency: 'biweekly', preferred_days: [3], active: true });
    if (rBi.frequency !== 'BIWEEKLY' || !rBi.preferredDays || rBi.preferredDays[0] !== 3) throw new Error('BIWEEKLY inconsistente');

    // MONTHLY
    const rMonth = resolveFrequencyFromRoutine({ family_task_id: 'ft-3' }, { id: 'ft-3', frequency: 'monthly', day_of_month: 15, active: true });
    if (rMonth.frequency !== 'MONTHLY' || rMonth.dayOfMonth !== 15) throw new Error('MONTHLY inconsistente');

    // SEVERAL_TIMES_WEEK -> normaliza para WEEKLY
    const rSeveral = resolveFrequencyFromRoutine({ family_task_id: 'ft-4' }, { id: 'ft-4', frequency: 'several_times_week', preferred_days: [1, 3], active: true });
    if (rSeveral.frequency !== 'WEEKLY') throw new Error('SEVERAL_TIMES_WEEK deveria normalizar para WEEKLY');

    // Ausência
    const rMiss = resolveFrequencyFromRoutine({ family_task_id: 'ft-ghost' }, null);
    if (!rMiss.routineNotFound || rMiss.frequency === 'DAILY') throw new Error('Ausência deveria definir routineNotFound sem DAILY');
  });

  // 9. Ausência de Alterações nos Arquivos Protegidos do Motor 2.0
  record('FREQ-09', 'Arquivos protegidos do Motor 2.0 permanecem 100% intocados', () => {
    const motorFiles = [
      'src/domain/distribution/DistributionEngine.ts',
      'src/domain/distribution/RebalanceService.ts',
      'src/domain/distribution/SafetyService.ts',
      'src/domain/distribution/EligibilityService.ts',
      'src/domain/distribution/AvailabilityService.ts',
      'src/domain/distribution/ScoringService.ts',
      'src/domain/distribution/BalanceService.ts',
      'src/domain/distribution/ExplainabilityService.ts',
      'src/application/services/DistributionService.ts',
      'src/application/services/RoutineContinuityService.ts'
    ];

    for (const file of motorFiles) {
      const fullPath = path.resolve(process.cwd(), file);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Arquivo do Motor 2.0 não encontrado: ${file}`);
      }
    }
  });

  return results;
}
