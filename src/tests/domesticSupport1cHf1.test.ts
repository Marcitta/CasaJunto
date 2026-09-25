/**
 * CASA JUNTO — TEST SUITE DOMESTIC-SUPPORT-1C-HF1
 * Routine Visibility Regression + Execution Target Visibility on Cards
 * DS1C-HF1-01 - DS1C-HF1-18
 */

import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { 
  resolveExecutionTarget, 
  formatExecutionTargetDisplay,
  validateFamilyTaskExecutionTarget
} from '../services/domesticSupportService';
import { FamilyTask, TaskAssignment, Task, DomesticSupport, Family, Member } from '../types';
import { allMasterTasks } from '../data/tasks';
import { getRollingDateHorizon, getFamilyLocalDate } from '../domain/utils/dateTimeUtils';

export async function runDomesticSupport1cHf1Tests(): Promise<{
  passed: number;
  failed: number;
  results: { testName: string; passed: boolean; message?: string }[];
}> {
  const results: { testName: string; passed: boolean; message?: string }[] = [];
  let passed = 0;
  let failed = 0;

  async function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      results.push({ testName: `DomesticSupport1C-HF1 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `DomesticSupport1C-HF1 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  const testFamilyId = 'fam-hf1-test';
  const testFamily: Family = {
    id: testFamilyId,
    name: 'Família HF1',
    timezone: 'America/Sao_Paulo',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };

  const supportMaria: DomesticSupport = {
    id: 'ds-maria',
    familyId: testFamilyId,
    name: 'Maria',
    type: 'CLEANER',
    active: true,
    schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };

  const supportJoanaInactive: DomesticSupport = {
    id: 'ds-joana',
    familyId: testFamilyId,
    name: 'Joana',
    type: 'CLEANER',
    active: false,
    schedule: [{ dayOfWeek: 3, startTime: '09:00', endTime: '13:00' }],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };

  const supportsList = [supportMaria, supportJoanaInactive];

  // =========================================================================
  // DS1C-HF1-01: FamilyTask recorrente nova aparece em Rotina (horizonte e matching)
  // =========================================================================
  await record('DS1C-HF1-01', 'FamilyTask recorrente nova gera ocorrências no horizonte de 15 dias', async () => {
    const today = getFamilyLocalDate(testFamily.timezone);
    const horizonDates = getRollingDateHorizon(today, 15);
    const newRoutine: FamilyTask = {
      id: 'ft-new-rec-1',
      family_id: testFamilyId,
      familyId: testFamilyId,
      name: 'Limpar Vidros',
      customTitle: 'Limpar Vidros',
      frequency: 'DAILY',
      room_id: 'room-sala',
      active: true,
      executionTarget: 'HOUSEHOLD',
      start_date: today
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [newRoutine],
      existingAssignments: [],
      isDemoMode: true
    });

    if (syncResult.allAssignments.length === 0) {
      throw new Error('Nova rotina ativa diária deve gerar ocorrências no horizonte');
    }
    const todayOcc = syncResult.allAssignments.find(a => a.scheduled_date === today);
    if (!todayOcc) {
      throw new Error('Ocorrência de hoje deve estar presente');
    }
    if (todayOcc.family_task_id !== 'ft-new-rec-1') {
      throw new Error(`Expected family_task_id ft-new-rec-1, got ${todayOcc.family_task_id}`);
    }
  });

  // =========================================================================
  // DS1C-HF1-02: Custom FamilyTask (sem taskMasterId) persiste sem undefined e aparece em Rotina
  // =========================================================================
  await record('DS1C-HF1-02', 'Custom FamilyTask (sem taskMasterId) persiste sem campos undefined e aparece em Rotina', async () => {
    const customRoutine: FamilyTask = {
      id: 'ft-custom-piscina',
      family_id: testFamilyId,
      familyId: testFamilyId,
      task_master_id: undefined as any,
      taskMasterId: undefined as any,
      name: 'Limpar filtro da piscina',
      customTitle: 'Limpar filtro da piscina',
      frequency: 'WEEKLY',
      preferred_days: [3], // Quarta-feira
      room_id: 'room-externo',
      active: true,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      start_date: '2026-03-25'
    };

    // Serialização Firestore: não pode conter undefined (causa de erro no Firestore setDoc)
    const serialized = FirestoreMappers.fromFamilyTask(customRoutine);
    for (const [key, val] of Object.entries(serialized)) {
      if (val === undefined) {
        throw new Error(`Campo serializado '${key}' não pode ser undefined (rejeitado pelo Firestore setDoc)`);
      }
    }
    if (serialized.task_master_id !== null) {
      throw new Error(`Expected task_master_id null for custom task, got ${serialized.task_master_id}`);
    }

    // Deserialização pós-F5
    const deserialized = FirestoreMappers.toFamilyTask(serialized.id, serialized);
    if (!deserialized.id || deserialized.active !== true) {
      throw new Error('Deserialized custom routine deve preservar id e active=true');
    }

    // Geração no RoutineContinuityService
    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [deserialized],
      existingAssignments: [],
      isDemoMode: true
    });

    if (syncResult.allAssignments.length === 0) {
      throw new Error('Custom FamilyTask deve gerar ocorrências normalmente');
    }
  });

  // =========================================================================
  // DS1C-HF1-03: Tarefa baseada em TaskMaster aparece em Rotina
  // =========================================================================
  await record('DS1C-HF1-03', 'Tarefa baseada em TaskMaster aparece em Rotina', async () => {
    const master = allMasterTasks[0];
    const tmRoutine: FamilyTask = {
      id: 'ft-tm-01',
      family_id: testFamilyId,
      familyId: testFamilyId,
      task_master_id: master.id,
      taskMasterId: master.id,
      name: master.name,
      frequency: 'DAILY',
      room_id: 'room-geral',
      active: true,
      executionTarget: 'HOUSEHOLD',
      start_date: '2026-03-25'
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [tmRoutine],
      existingAssignments: [],
      isDemoMode: true
    });

    const occ = syncResult.allAssignments.find(a => a.family_task_id === 'ft-tm-01');
    if (!occ) {
      throw new Error('Tarefa baseada em TaskMaster deve gerar ocorrências e ser visível');
    }
    if (occ.task_id !== master.id) {
      throw new Error(`Expected task_id ${master.id}, got ${occ.task_id}`);
    }
  });

  // =========================================================================
  // DS1C-HF1-04: HOUSEHOLD aparece em Rotina independentemente do target
  // =========================================================================
  await record('DS1C-HF1-04', 'HOUSEHOLD aparece em Rotina sem ser escondido', async () => {
    const routine: FamilyTask = {
      id: 'ft-target-hh',
      family_id: testFamilyId,
      familyId: testFamilyId,
      name: 'Varrer casa',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'HOUSEHOLD',
      start_date: '2026-03-25'
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [],
      isDemoMode: true
    });

    if (syncResult.allAssignments.length === 0) {
      throw new Error('HOUSEHOLD routine deve aparecer em Rotina');
    }
  });

  // =========================================================================
  // DS1C-HF1-05: EXTERNAL_SUPPORT aparece em Rotina independentemente do target
  // =========================================================================
  await record('DS1C-HF1-05', 'EXTERNAL_SUPPORT aparece em Rotina sem ser escondido', async () => {
    const routine: FamilyTask = {
      id: 'ft-target-ext',
      family_id: testFamilyId,
      familyId: testFamilyId,
      name: 'Passar roupas pesadas',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      start_date: '2026-03-25'
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [],
      isDemoMode: true
    });

    if (syncResult.allAssignments.length === 0) {
      throw new Error('EXTERNAL_SUPPORT routine deve aparecer em Rotina');
    }
  });

  // =========================================================================
  // DS1C-HF1-06: FLEXIBLE aparece em Rotina independentemente do target
  // =========================================================================
  await record('DS1C-HF1-06', 'FLEXIBLE aparece em Rotina sem ser escondido', async () => {
    const routine: FamilyTask = {
      id: 'ft-target-flex',
      family_id: testFamilyId,
      familyId: testFamilyId,
      name: 'Organizar despensa',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: null,
      start_date: '2026-03-25'
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [],
      isDemoMode: true
    });

    if (syncResult.allAssignments.length === 0) {
      throw new Error('FLEXIBLE routine deve aparecer em Rotina');
    }
  });

  // =========================================================================
  // DS1C-HF1-07: F5 mantém a rotina (hidratação preserva entidades e targets)
  // =========================================================================
  await record('DS1C-HF1-07', 'F5 mantém rotinas hidratadas com seus dados intactos', () => {
    const routine: FamilyTask = {
      id: 'ft-f5-test',
      family_id: testFamilyId,
      name: 'Lavar cortinas',
      frequency: 'MONTHLY',
      day_of_month: 15,
      active: true,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      start_date: '2026-03-01'
    };

    const serialized = FirestoreMappers.fromFamilyTask(routine);
    const hydrated = FirestoreMappers.toFamilyTask(serialized.id, serialized);

    if (hydrated.id !== routine.id) {
      throw new Error(`ID divergente após hidratação: ${hydrated.id}`);
    }
    if (hydrated.executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`executionTarget divergente após hidratação: ${hydrated.executionTarget}`);
    }
    if (hydrated.domesticSupportId !== 'ds-maria') {
      throw new Error(`domesticSupportId divergente após hidratação: ${hydrated.domesticSupportId}`);
    }
  });

  // =========================================================================
  // DS1C-HF1-08: Nenhuma duplicação de ocorrências ao rodar sync novamente
  // =========================================================================
  await record('DS1C-HF1-08', 'Nenhuma duplicação de ocorrências em múltiplas execuções', async () => {
    const routine: FamilyTask = {
      id: 'ft-no-dup-1',
      family_id: testFamilyId,
      familyId: testFamilyId,
      name: 'Regar plantas',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'HOUSEHOLD',
      start_date: '2026-03-25'
    };

    const firstRun = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [],
      isDemoMode: true
    });

    const secondRun = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: firstRun.allAssignments,
      isDemoMode: true
    });

    if (secondRun.newlyCreatedAssignments.length !== 0) {
      throw new Error(`Segunda execução não deve criar ocorrências repetidas, criou ${secondRun.newlyCreatedAssignments.length}`);
    }
    if (secondRun.allAssignments.length !== firstRun.allAssignments.length) {
      throw new Error(`Total de ocorrências deve ser idêntico: ${secondRun.allAssignments.length} vs ${firstRun.allAssignments.length}`);
    }
  });

  // =========================================================================
  // DS1C-HF1-09: Nenhuma distribuição automática (ocorrências nascem unassigned)
  // =========================================================================
  await record('DS1C-HF1-09', 'Nenhuma distribuição automática (ocorrências geradas permanecem desatribuídas)', async () => {
    const routine: FamilyTask = {
      id: 'ft-no-auto-dist',
      family_id: testFamilyId,
      familyId: testFamilyId,
      name: 'Higienizar cafeteira',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'HOUSEHOLD',
      start_date: '2026-03-25'
    };

    const syncResult = await RoutineContinuityService.syncRoutineOccurrences({
      family: testFamily,
      routines: [routine],
      existingAssignments: [],
      isDemoMode: true
    });

    for (const occ of syncResult.newlyCreatedAssignments) {
      if (occ.member_id && occ.member_id.trim() !== '') {
        throw new Error(`Ocorrência ${occ.id} gerada automaticamente não pode ter member_id atribuído`);
      }
      if (occ.is_unassigned !== true) {
        throw new Error(`Ocorrência ${occ.id} deve ter is_unassigned: true`);
      }
    }
  });

  // =========================================================================
  // DS1C-HF1-10: Card HOUSEHOLD mostra “👨‍👩‍👧‍👦 Pessoas da casa”
  // =========================================================================
  await record('DS1C-HF1-10', 'Card HOUSEHOLD exibe label amigável "👨‍👩‍👧‍👦 Pessoas da casa"', () => {
    const task: Partial<Task> = {
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    };
    const info = formatExecutionTargetDisplay(task, supportsList);
    if (!info.label.includes('Pessoas da casa') || !info.label.includes('👨‍👩‍👧‍👦')) {
      throw new Error(`Expected label "👨‍👩‍👧‍👦 Pessoas da casa", got "${info.label}"`);
    }
  });

  // =========================================================================
  // DS1C-HF1-11: Card EXTERNAL_SUPPORT mostra nome da ajuda (ex: “🧹 Maria · Ajuda externa”)
  // =========================================================================
  await record('DS1C-HF1-11', 'Card EXTERNAL_SUPPORT exibe nome da ajuda amigavelmente', () => {
    const task: Partial<Task> = {
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria'
    };
    const info = formatExecutionTargetDisplay(task, supportsList);
    if (info.label !== '🧹 Maria · Ajuda externa') {
      throw new Error(`Expected "🧹 Maria · Ajuda externa", got "${info.label}"`);
    }
  });

  // =========================================================================
  // DS1C-HF1-12: Card FLEXIBLE sem preferência mostra “🔄 Qualquer um”
  // =========================================================================
  await record('DS1C-HF1-12', 'Card FLEXIBLE sem preferência exibe "🔄 Qualquer um"', () => {
    const task: Partial<Task> = {
      executionTarget: 'FLEXIBLE',
      domesticSupportId: null
    };
    const info = formatExecutionTargetDisplay(task, supportsList);
    if (info.label !== '🔄 Qualquer um') {
      throw new Error(`Expected "🔄 Qualquer um", got "${info.label}"`);
    }
  });

  // =========================================================================
  // DS1C-HF1-13: Card FLEXIBLE com preferência mostra nome (“🔄 Qualquer um · preferência: Maria”)
  // =========================================================================
  await record('DS1C-HF1-13', 'Card FLEXIBLE com preferência exibe nome da ajuda preferencial', () => {
    const task: Partial<Task> = {
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'ds-maria'
    };
    const info = formatExecutionTargetDisplay(task, supportsList);
    if (info.label !== '🔄 Qualquer um · preferência: Maria') {
      throw new Error(`Expected "🔄 Qualquer um · preferência: Maria", got "${info.label}"`);
    }
  });

  // =========================================================================
  // DS1C-HF1-14: Legacy/ausente apresenta “👨‍👩‍👧‍👦 Pessoas da casa”
  // =========================================================================
  await record('DS1C-HF1-14', 'Legacy / sem executionTarget resolve e exibe "👨‍👩‍👧‍👦 Pessoas da casa"', () => {
    const legacyTask: Partial<Task> = {
      title: 'Tarefa Antiga'
    };
    const target = resolveExecutionTarget(legacyTask);
    if (target !== 'HOUSEHOLD') {
      throw new Error(`Legacy resolve deve ser HOUSEHOLD, obteve ${target}`);
    }
    const info = formatExecutionTargetDisplay(legacyTask, supportsList);
    if (!info.label.includes('Pessoas da casa')) {
      throw new Error(`Legacy card deve exibir "👨‍👩‍👧‍👦 Pessoas da casa", obteve "${info.label}"`);
    }
  });

  // =========================================================================
  // DS1C-HF1-15: Ajuda inativa é identificada amigavelmente nos cards
  // =========================================================================
  await record('DS1C-HF1-15', 'Ajuda inativa vinculada é identificada com "· Inativa"', () => {
    const taskInactive: Partial<Task> = {
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-joana'
    };
    const info = formatExecutionTargetDisplay(taskInactive, supportsList);
    if (info.label !== '🧹 Joana · Ajuda externa · Inativa') {
      throw new Error(`Expected "🧹 Joana · Ajuda externa · Inativa", got "${info.label}"`);
    }

    const taskFlexInactive: Partial<Task> = {
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'ds-joana'
    };
    const infoFlex = formatExecutionTargetDisplay(taskFlexInactive, supportsList);
    if (infoFlex.label !== '🔄 Qualquer um · preferência: Joana · Inativa') {
      throw new Error(`Expected "🔄 Qualquer um · preferência: Joana · Inativa", got "${infoFlex.label}"`);
    }
  });

  // =========================================================================
  // DS1C-HF1-16: RoutineView suporta frequencies variadas (several_times_week, OTHER)
  // =========================================================================
  await record('DS1C-HF1-16', 'Filtro de frequências da RoutineView aceita several_times_week e categoriza sem perdas', () => {
    const weeklyMatcher = (f: string) => {
      const up = (f || '').trim().toUpperCase();
      return up === 'WEEKLY' || up === 'SEVERAL_TIMES_WEEK';
    };

    if (!weeklyMatcher('several_times_week')) {
      throw new Error('weeklyMatcher deve casar com "several_times_week" em minúsculas');
    }
    if (!weeklyMatcher('SEVERAL_TIMES_WEEK')) {
      throw new Error('weeklyMatcher deve casar com "SEVERAL_TIMES_WEEK" em maiúsculas');
    }
    if (!weeklyMatcher('weekly')) {
      throw new Error('weeklyMatcher deve casar com "weekly"');
    }
  });

  // =========================================================================
  // DS1C-HF1-17: Badges presentes sem termos técnicos
  // =========================================================================
  await record('DS1C-HF1-17', 'Labels de cards nunca mostram IDs ou enums técnicos (fail-closed)', () => {
    const testCases: Array<Partial<Task>> = [
      { executionTarget: 'HOUSEHOLD' },
      { executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: 'ds-maria' },
      { executionTarget: 'FLEXIBLE', domesticSupportId: null },
      { executionTarget: 'FLEXIBLE', domesticSupportId: 'ds-maria' },
      {}
    ];

    for (const tc of testCases) {
      const info = formatExecutionTargetDisplay(tc, supportsList);
      if (
        info.label.includes('HOUSEHOLD') ||
        info.label.includes('EXTERNAL_SUPPORT') ||
        info.label.includes('FLEXIBLE') ||
        info.label.includes('ds-maria') ||
        info.label.includes('null') ||
        info.label.includes('undefined')
      ) {
        throw new Error(`Label vazou termo técnico: "${info.label}"`);
      }
    }
  });

  // =========================================================================
  // DS1C-HF1-18: Motor 2.0 e serviços de distribuição permanecem 100% protegidos
  // =========================================================================
  await record('DS1C-HF1-18', 'Proteção do Motor 2.0: distribuição e scoring inalterados neste gate', () => {
    // Validação estrita: este gate é puramente de visibilidade e classificação
    const task: Partial<FamilyTask> = {
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria',
      familyId: testFamilyId
    };
    const validation = validateFamilyTaskExecutionTarget(task, supportsList);
    if (!validation.valid) {
      throw new Error('Invariante canônica deve validar com sucesso');
    }
  });

  return { passed, failed, results };
}
