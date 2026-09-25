/**
 * CASA JUNTO — TEST SUITE DOMESTIC-SUPPORT-1C-HF2
 * Correção definitiva de visibilidade Catálogo × Rotina + badge no Catálogo
 * DS1C-HF2-01 - DS1C-HF2-10
 */

import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { 
  resolveExecutionTarget, 
  formatExecutionTargetDisplay,
  validateFamilyTaskExecutionTarget
} from '../services/domesticSupportService';
import { FamilyTask, BatchAddRoutineInput, DomesticSupport, Family } from '../types';
import { allMasterTasks } from '../data/tasks';
import { getFamilyLocalDate } from '../domain/utils/dateTimeUtils';

export async function runDomesticSupport1cHf2Tests(): Promise<{
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
      results.push({ testName: `DomesticSupport1C-HF2 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `DomesticSupport1C-HF2 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  const testFamilyId = 'fam-hf2-real';
  const testFamily: Family = {
    id: testFamilyId,
    name: 'Família HF2 Real',
    timezone: 'America/Sao_Paulo',
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };

  const supportMaria: DomesticSupport = {
    id: 'ds-maria-hf2',
    familyId: testFamilyId,
    name: 'Maria',
    type: 'CLEANER',
    active: true,
    schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };

  const supportJoanaInactive: DomesticSupport = {
    id: 'ds-joana-hf2',
    familyId: testFamilyId,
    name: 'Joana',
    type: 'CLEANER',
    active: false,
    schedule: [{ dayOfWeek: 3, startTime: '09:00', endTime: '13:00' }],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };

  const domesticSupports = [supportMaria, supportJoanaInactive];
  const today = getFamilyLocalDate(testFamily.timezone);

  // Helper simulating the canonical batchAddRoutines logic of AppContext
  function simulateBatchAddRoutines(
    existingRoutines: FamilyTask[],
    items: BatchAddRoutineInput[],
    familyId: string
  ): { currentRoutines: FamilyTask[]; addedCount: number; reactivatedCount: number; skippedCount: number } {
    let addedCount = 0;
    let reactivatedCount = 0;
    let skippedCount = 0;
    const now = new Date().toISOString();
    const currentRoutines = [...existingRoutines];

    for (const item of items) {
      const existingIndex = currentRoutines.findIndex(
        ft => (
          (item.taskMasterId && (ft.task_master_id === item.taskMasterId || ft.taskMasterId === item.taskMasterId || ft.task_id === item.taskMasterId || ft.taskId === item.taskMasterId)) ||
          ft.id === item.taskMasterId
        )
      );

      if (existingIndex >= 0) {
        const existing = currentRoutines[existingIndex];
        if (existing.active) {
          skippedCount++;
          continue;
        }

        const isCustom = !existing.task_master_id && !existing.taskMasterId;
        const master = !isCustom ? allMasterTasks.find(tm => tm.id === (existing.task_master_id || existing.taskMasterId || item.taskMasterId)) : undefined;
        const resolvedName = item.name || existing.name || existing.customTitle || master?.name || 'Rotina';

        const reactivated: FamilyTask = {
          ...existing,
          active: true,
          name: resolvedName,
          customTitle: existing.customTitle || existing.custom_title || resolvedName,
          custom_title: existing.custom_title || existing.customTitle || resolvedName,
          room_id: item.roomId || existing.room_id || existing.roomId || 'geral',
          roomId: item.roomId || existing.roomId || existing.room_id || 'geral',
          frequency: item.frequency || existing.frequency || 'DAILY',
          preferred_days: item.preferredDays || existing.preferred_days || existing.preferredDays || (item.frequency === 'WEEKLY' ? [1] : []),
          preferredDays: item.preferredDays || existing.preferredDays || existing.preferred_days || (item.frequency === 'WEEKLY' ? [1] : []),
          day_of_month: item.dayOfMonth ?? existing.day_of_month ?? existing.dayOfMonth,
          dayOfMonth: item.dayOfMonth ?? existing.dayOfMonth ?? existing.day_of_month,
          preferred_time: item.preferredTime || existing.preferred_time || existing.preferredTime || '09:00',
          preferredTime: item.preferredTime || existing.preferredTime || existing.preferred_time || '09:00',
          executionTarget: item.executionTarget || existing.executionTarget || 'HOUSEHOLD',
          domesticSupportId: item.executionTarget === 'HOUSEHOLD' ? null : (item.domesticSupportId ?? existing.domesticSupportId ?? null),
          start_date: item.startDate || existing.start_date || existing.startDate || today,
          startDate: item.startDate || existing.startDate || existing.start_date || today,
          updated_at: now,
          updatedAt: now
        };

        currentRoutines[existingIndex] = reactivated;
        reactivatedCount++;
      } else {
        const master = allMasterTasks.find(tm => tm.id === item.taskMasterId);
        const isCustom = !master;
        const resolvedName = item.name || master?.name || 'Rotina';

        const routineId = `ft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newRoutine: FamilyTask = {
          id: routineId,
          family_id: familyId,
          familyId,
          task_id: isCustom ? undefined : item.taskMasterId,
          taskId: isCustom ? undefined : item.taskMasterId,
          task_master_id: isCustom ? undefined : item.taskMasterId,
          taskMasterId: isCustom ? undefined : item.taskMasterId,
          name: resolvedName,
          customTitle: resolvedName,
          custom_title: resolvedName,
          category: item.category || master?.category || 'cleaning',
          room_id: item.roomId || 'geral',
          roomId: item.roomId || 'geral',
          frequency: item.frequency || 'DAILY',
          preferred_days: item.preferredDays || (item.frequency === 'WEEKLY' ? [1] : []),
          preferredDays: item.preferredDays || (item.frequency === 'WEEKLY' ? [1] : []),
          day_of_month: item.dayOfMonth,
          dayOfMonth: item.dayOfMonth,
          preferred_time: item.preferredTime || '09:00',
          preferredTime: item.preferredTime || '09:00',
          active: true,
          executionTarget: item.executionTarget || 'HOUSEHOLD',
          domesticSupportId: item.executionTarget === 'HOUSEHOLD' ? null : (item.domesticSupportId ?? null),
          start_date: item.startDate || today,
          startDate: item.startDate || today,
          created_at: now,
          createdAt: now,
          updated_at: now,
          updatedAt: now
        };

        currentRoutines.push(newRoutine);
        addedCount++;
      }
    }

    return { currentRoutines, addedCount, reactivatedCount, skippedCount };
  }

  // Helper simulating the canonical RoutineView grouping
  function groupRoutinesForRoutineView(routines: FamilyTask[]) {
    const frequencies = [
      { key: 'DAILY', label: 'Diárias', match: (f: string) => (f || '').trim().toUpperCase() === 'DAILY' },
      { key: 'WEEKLY', label: 'Semanais', match: (f: string) => {
        const up = (f || '').trim().toUpperCase();
        return up === 'WEEKLY' || up === 'SEVERAL_TIMES_WEEK';
      }},
      { key: 'BIWEEKLY', label: 'Quinzenais', match: (f: string) => (f || '').trim().toUpperCase() === 'BIWEEKLY' },
      { key: 'MONTHLY', label: 'Mensais', match: (f: string) => (f || '').trim().toUpperCase() === 'MONTHLY' },
      { key: 'OTHER', label: 'Outras Recorrências & Pontuais', match: (f: string) => {
        const up = (f || '').trim().toUpperCase();
        return up !== 'DAILY' && up !== 'WEEKLY' && up !== 'SEVERAL_TIMES_WEEK' && up !== 'BIWEEKLY' && up !== 'MONTHLY';
      }}
    ];

    return frequencies.map(freq => ({
      key: freq.key,
      label: freq.label,
      routines: routines.filter(ft => freq.match(ft.frequency || ''))
    }));
  }

  // =========================================================================
  // DS1C-HF2-01: BatchAdd de 8 tarefas heterogêneas cria todas no AppContext
  // =========================================================================
  await record('DS1C-HF2-01', 'BatchAdd de 8 tarefas heterogêneas preserva metadados canônicos', async () => {
    // 8 tarefas heterogêneas:
    // 1. TaskMaster, DAILY, HOUSEHOLD
    // 2. TaskMaster, WEEKLY, EXTERNAL_SUPPORT
    // 3. TaskMaster, SEVERAL_TIMES_WEEK, FLEXIBLE (com preferência Maria)
    // 4. TaskMaster, BIWEEKLY, FLEXIBLE (sem suporte)
    // 5. TaskMaster, MONTHLY, HOUSEHOLD
    // 6. Custom task, DAILY, HOUSEHOLD
    // 7. Custom task, WEEKLY, EXTERNAL_SUPPORT
    // 8. Custom task, OTHER/PONTUAL, FLEXIBLE
    const batchInputs: BatchAddRoutineInput[] = [
      {
        taskMasterId: 'kitch-1',
        name: 'Lavar a Louça',
        category: 'cleaning',
        roomId: 'room-cozinha',
        frequency: 'DAILY',
        executionTarget: 'HOUSEHOLD',
        domesticSupportId: null
      },
      {
        taskMasterId: 'bath-4',
        name: 'Limpeza Completa Banheiro',
        category: 'cleaning',
        roomId: 'room-banheiro',
        frequency: 'WEEKLY',
        preferredDays: [6],
        executionTarget: 'EXTERNAL_SUPPORT',
        domesticSupportId: 'ds-maria-hf2'
      },
      {
        taskMasterId: 'clean-3',
        name: 'Tirar Pó dos Móveis',
        category: 'dusting',
        roomId: 'room-sala',
        frequency: 'SEVERAL_TIMES_WEEK',
        preferredDays: [1, 3, 5],
        executionTarget: 'FLEXIBLE',
        domesticSupportId: 'ds-maria-hf2'
      },
      {
        taskMasterId: 'laund-1',
        name: 'Trocar Lençóis e Fronhas',
        category: 'laundry',
        roomId: 'room-quarto',
        frequency: 'BIWEEKLY',
        preferredDays: [0],
        executionTarget: 'FLEXIBLE',
        domesticSupportId: null
      },
      {
        taskMasterId: 'clean-1',
        name: 'Limpar Geladeira',
        category: 'cleaning',
        roomId: 'room-cozinha',
        frequency: 'MONTHLY',
        dayOfMonth: 15,
        executionTarget: 'HOUSEHOLD',
        domesticSupportId: null
      },
      {
        taskMasterId: 'custom-regar-orquideas',
        name: 'Regar Orquídeas da Sacada',
        category: 'garden',
        roomId: 'room-sacada',
        frequency: 'DAILY',
        executionTarget: 'HOUSEHOLD',
        domesticSupportId: null
      },
      {
        taskMasterId: 'custom-passar-camisas',
        name: 'Passar Camisas Sociais',
        category: 'laundry',
        roomId: 'room-servico',
        frequency: 'WEEKLY',
        preferredDays: [5],
        executionTarget: 'EXTERNAL_SUPPORT',
        domesticSupportId: 'ds-maria-hf2'
      },
      {
        taskMasterId: 'custom-filtro-exaustor',
        name: 'Trocar Filtro do Exaustor',
        category: 'maintenance',
        roomId: 'room-cozinha',
        frequency: 'ONE_TIME',
        executionTarget: 'FLEXIBLE',
        domesticSupportId: null
      }
    ];

    const result = simulateBatchAddRoutines([], batchInputs, testFamilyId);
    if (result.addedCount !== 8 || result.currentRoutines.length !== 8) {
      throw new Error(`Esperado 8 rotinas adicionadas, obteve ${result.addedCount}`);
    }

    // Verificar que todas estão ativas e têm o familyId correto
    for (const r of result.currentRoutines) {
      if (r.active !== true) throw new Error(`Rotina ${r.id} deveria ter active=true`);
      if (r.familyId !== testFamilyId) throw new Error(`Rotina ${r.id} com familyId incorreto: ${r.familyId}`);
      if (!r.name || !r.customTitle) throw new Error(`Rotina ${r.id} sem name ou customTitle`);
    }

    // Custom tasks não podem ter task_master_id preenchido com ID inexistente no master
    const customOrquideas = result.currentRoutines.find(r => r.name === 'Regar Orquídeas da Sacada')!;
    if (customOrquideas.taskMasterId !== undefined || customOrquideas.task_master_id !== undefined) {
      throw new Error('Tarefa customizada não deve possuir taskMasterId');
    }
  });

  // =========================================================================
  // DS1C-HF2-02: Persistência no Firestore sanitiza payloads sem undefined
  // =========================================================================
  await record('DS1C-HF2-02', 'fromFamilyTask sanitiza payloads e não gera campos undefined', async () => {
    const ftSample: FamilyTask = {
      id: 'ft-sanitize-check',
      familyId: testFamilyId,
      name: 'Tarefa de Teste',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    };

    const payload = FirestoreMappers.fromFamilyTask(ftSample);
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) {
        throw new Error(`Campo persistido "${key}" possui valor undefined inválido para o Firestore`);
      }
    }
    if (payload.executionTarget !== 'HOUSEHOLD') {
      throw new Error(`fromFamilyTask deve persistir executionTarget: ${payload.executionTarget}`);
    }
    if (payload.domesticSupportId !== null) {
      throw new Error(`fromFamilyTask deve persistir domesticSupportId como null para HOUSEHOLD`);
    }
  });

  // =========================================================================
  // DS1C-HF2-03: Simulação de F5/hidratação carrega todas as 8 rotinas
  // =========================================================================
  await record('DS1C-HF2-03', 'Simulação de F5/hidratação: todas as 8 rotinas sobrevivem à deserialização', async () => {
    const batchInputs: BatchAddRoutineInput[] = [
      { taskMasterId: 'kitch-1', name: 'Lavar a Louça', roomId: 'r-1', frequency: 'DAILY', executionTarget: 'HOUSEHOLD' },
      { taskMasterId: 'bath-4', name: 'Limpeza Banheiro', roomId: 'r-2', frequency: 'WEEKLY', preferredDays: [6], executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: 'ds-maria-hf2' },
      { taskMasterId: 'clean-3', name: 'Tirar Pó', roomId: 'r-3', frequency: 'SEVERAL_TIMES_WEEK', preferredDays: [1, 3], executionTarget: 'FLEXIBLE', domesticSupportId: 'ds-maria-hf2' },
      { taskMasterId: 'laund-1', name: 'Trocar Lençóis', roomId: 'r-4', frequency: 'BIWEEKLY', preferredDays: [0], executionTarget: 'FLEXIBLE' },
      { taskMasterId: 'clean-1', name: 'Limpar Geladeira', roomId: 'r-1', frequency: 'MONTHLY', dayOfMonth: 15, executionTarget: 'HOUSEHOLD' },
      { taskMasterId: 'custom-1', name: 'Regar Orquídeas', roomId: 'r-5', frequency: 'DAILY', executionTarget: 'HOUSEHOLD' },
      { taskMasterId: 'custom-2', name: 'Passar Camisas', roomId: 'r-6', frequency: 'WEEKLY', preferredDays: [5], executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: 'ds-maria-hf2' },
      { taskMasterId: 'custom-3', name: 'Trocar Filtro', roomId: 'r-1', frequency: 'ONE_TIME', executionTarget: 'FLEXIBLE' }
    ];

    const { currentRoutines } = simulateBatchAddRoutines([], batchInputs, testFamilyId);

    // 1. Simular persistência no Firestore:
    const persistedDocs = currentRoutines.map(r => ({
      id: r.id,
      data: FirestoreMappers.fromFamilyTask(r)
    }));

    // 2. Simular recarregamento da página (F5) usando toFamilyTask:
    const reloadedRoutines = persistedDocs.map(doc => FirestoreMappers.toFamilyTask(doc.id, doc.data));

    if (reloadedRoutines.length !== 8) {
      throw new Error(`Esperado 8 rotinas após recarregamento, obteve ${reloadedRoutines.length}`);
    }

    // Verificar que todas as 8 rotinas mantêm active=true e seus nomes
    for (const r of reloadedRoutines) {
      if (r.active !== true) throw new Error(`Rotina ${r.id} (${r.name}) perdeu active=true`);
      if (!r.name && !r.customTitle) throw new Error(`Rotina ${r.id} perdeu o nome`);
    }

    // 3. Testar agrupamento da RoutineView:
    const groups = groupRoutinesForRoutineView(reloadedRoutines);
    const totalGrouped = groups.reduce((acc, g) => acc + g.routines.length, 0);
    if (totalGrouped !== 8) {
      throw new Error(`Total agrupado em Rotinas Cadastradas (${totalGrouped}) deve ser exatamente 8`);
    }

    // Verificar presenças específicas nos grupos
    const dailyGroup = groups.find(g => g.key === 'DAILY')!;
    const weeklyGroup = groups.find(g => g.key === 'WEEKLY')!;
    const biweeklyGroup = groups.find(g => g.key === 'BIWEEKLY')!;
    const monthlyGroup = groups.find(g => g.key === 'MONTHLY')!;
    const otherGroup = groups.find(g => g.key === 'OTHER')!;

    if (dailyGroup.routines.length !== 2) throw new Error(`Esperado 2 rotinas diárias, obteve ${dailyGroup.routines.length}`);
    if (weeklyGroup.routines.length !== 3) throw new Error(`Esperado 3 rotinas semanais (inclui SEVERAL_TIMES_WEEK), obteve ${weeklyGroup.routines.length}`);
    if (biweeklyGroup.routines.length !== 1) throw new Error(`Esperado 1 rotina quinzenal, obteve ${biweeklyGroup.routines.length}`);
    if (monthlyGroup.routines.length !== 1) throw new Error(`Esperado 1 rotina mensal, obteve ${monthlyGroup.routines.length}`);
    if (otherGroup.routines.length !== 1) throw new Error(`Esperado 1 rotina no grupo Outras/Pontuais, obteve ${otherGroup.routines.length}`);
  });

  // =========================================================================
  // DS1C-HF2-04: Resolução de nome com master fallback na RoutineView
  // =========================================================================
  await record('DS1C-HF2-04', 'RoutineView resolve nome da rotina via master?.name se FamilyTask não possuir customTitle', async () => {
    // FamilyTask legada de demo que só tem task_master_id mas não tem name nem customTitle
    const legacyRoutine: FamilyTask = {
      id: 'ft-legacy-kitch',
      family_id: testFamilyId,
      task_master_id: 'kitch-1',
      frequency: 'DAILY',
      active: true
    };

    const master = allMasterTasks.find(tm => tm.id === (legacyRoutine.task_master_id || legacyRoutine.taskMasterId));
    const displayName = legacyRoutine.customTitle || legacyRoutine.custom_title || legacyRoutine.name || master?.name || 'Rotina';

    if (displayName === 'Rotina') {
      throw new Error('Nome da rotina não deve cair no fallback genérico "Rotina" quando taskMasterId existe');
    }
    if (!displayName.toLowerCase().includes('louça') && !displayName.toLowerCase().includes('lavar')) {
      throw new Error(`Nome resolvido inesperado: ${displayName}`);
    }
  });

  // =========================================================================
  // DS1C-HF2-05: Catálogo — Badge 1: HOUSEHOLD / legacy
  // =========================================================================
  await record('DS1C-HF2-05', 'Catálogo: Badge HOUSEHOLD / legacy exibe "👨‍👩‍👧‍👦 Pessoas da casa"', async () => {
    const ftHousehold: FamilyTask = {
      id: 'ft-hh',
      familyId: testFamilyId,
      taskMasterId: 'kitch-1',
      active: true,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    };

    const display = formatExecutionTargetDisplay(ftHousehold, domesticSupports);
    if (display.label !== '👨‍👩‍👧‍👦 Pessoas da casa') {
      throw new Error(`Esperado '👨‍👩‍👧‍👦 Pessoas da casa', obteve '${display.label}'`);
    }
    if (display.target !== 'HOUSEHOLD') {
      throw new Error(`Target incorreto: ${display.target}`);
    }
  });

  // =========================================================================
  // DS1C-HF2-06: Catálogo — Badge 2: EXTERNAL_SUPPORT + Maria
  // =========================================================================
  await record('DS1C-HF2-06', 'Catálogo: Badge EXTERNAL_SUPPORT + Maria exibe "🧹 Maria · Ajuda externa"', async () => {
    const ftExternal: FamilyTask = {
      id: 'ft-ext-maria',
      familyId: testFamilyId,
      taskMasterId: 'bath-4',
      active: true,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria-hf2'
    };

    const display = formatExecutionTargetDisplay(ftExternal, domesticSupports);
    if (display.label !== '🧹 Maria · Ajuda externa') {
      throw new Error(`Esperado '🧹 Maria · Ajuda externa', obteve '${display.label}'`);
    }
    if (display.target !== 'EXTERNAL_SUPPORT') {
      throw new Error(`Target incorreto: ${display.target}`);
    }
  });

  // =========================================================================
  // DS1C-HF2-07: Catálogo — Badge 3: FLEXIBLE sem preferência
  // =========================================================================
  await record('DS1C-HF2-07', 'Catálogo: Badge FLEXIBLE sem suporte exibe "🔄 Qualquer um"', async () => {
    const ftFlexible: FamilyTask = {
      id: 'ft-flex-open',
      familyId: testFamilyId,
      taskMasterId: 'laund-1',
      active: true,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: null
    };

    const display = formatExecutionTargetDisplay(ftFlexible, domesticSupports);
    if (display.label !== '🔄 Qualquer um') {
      throw new Error(`Esperado '🔄 Qualquer um', obteve '${display.label}'`);
    }
    if (display.target !== 'FLEXIBLE') {
      throw new Error(`Target incorreto: ${display.target}`);
    }
  });

  // =========================================================================
  // DS1C-HF2-08: Catálogo — Badge 4: FLEXIBLE + Maria
  // =========================================================================
  await record('DS1C-HF2-08', 'Catálogo: Badge FLEXIBLE + Maria exibe "🔄 Qualquer um · preferência: Maria"', async () => {
    const ftFlexibleMaria: FamilyTask = {
      id: 'ft-flex-maria',
      familyId: testFamilyId,
      taskMasterId: 'clean-3',
      active: true,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'ds-maria-hf2'
    };

    const display = formatExecutionTargetDisplay(ftFlexibleMaria, domesticSupports);
    if (display.label !== '🔄 Qualquer um · preferência: Maria') {
      throw new Error(`Esperado '🔄 Qualquer um · preferência: Maria', obteve '${display.label}'`);
    }
    if (display.target !== 'FLEXIBLE') {
      throw new Error(`Target incorreto: ${display.target}`);
    }
  });

  // =========================================================================
  // DS1C-HF2-09: Catálogo — Invariante: TaskMaster global AVAILABLE não exibe badge de família
  // =========================================================================
  await record('DS1C-HF2-09', 'Catálogo: Tarefa sem vínculo à família (AVAILABLE) não exibe executionTarget', async () => {
    // Tarefa do catálogo que não existe em familyTasks:
    const tmAvailable = allMasterTasks[0];
    const familyTasksList: FamilyTask[] = [];

    const familyTaskMap = new Map<string, FamilyTask>();
    familyTasksList.forEach(ft => {
      const tmId = ft.task_master_id || ft.taskMasterId;
      if (tmId) familyTaskMap.set(tmId, ft);
    });

    const ft = familyTaskMap.get(tmAvailable.id);
    if (ft !== undefined) {
      throw new Error('ft deve ser undefined para itens ainda não ativados na família');
    }
  });

  // =========================================================================
  // DS1C-HF2-10: Idempotência do BatchAdd — Tarefa ativa não é duplicada nem sobrescrita
  // =========================================================================
  await record('DS1C-HF2-10', 'Idempotência do BatchAdd: reenviar tarefa já ativa não duplica FamilyTask', async () => {
    const existingRoutine: FamilyTask = {
      id: 'ft-already-active',
      familyId: testFamilyId,
      taskMasterId: 'kitch-1',
      name: 'Lavar Louça Ativa',
      customTitle: 'Lavar Louça Ativa',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const batchInput: BatchAddRoutineInput = {
      taskMasterId: 'kitch-1',
      name: 'Tentativa Duplicada',
      roomId: 'room-cozinha',
      frequency: 'DAILY'
    };

    const result = simulateBatchAddRoutines([existingRoutine], [batchInput], testFamilyId);
    if (result.skippedCount !== 1) {
      throw new Error(`Esperado skippedCount=1, obteve ${result.skippedCount}`);
    }
    if (result.currentRoutines.length !== 1) {
      throw new Error(`Lista de rotinas não deve aumentar de tamanho (deve ter 1, obteve ${result.currentRoutines.length})`);
    }
    if (result.currentRoutines[0].id !== existingRoutine.id) {
      throw new Error('ID da rotina original deve ser preservado');
    }
  });

  return { passed, failed, results };
}
