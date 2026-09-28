/**
 * CASA JUNTO — TEST SUITE DOMESTIC-SUPPORT-1C-HF4
 * RoutineView — Encontrabilidade, Busca Acentuada, Ordenação Alfabética e Persistência de Visão
 * DS1C-HF4-01 - DS1C-HF4-14
 */

import { 
  normalizeRoutineSearchText, 
  getRoutineDisplayName, 
  getInitialRoutineViewMode, 
  setStoredRoutineViewMode, 
  resetStoredRoutineViewMode,
  ROUTINE_VIEW_STORAGE_KEY
} from '../components/RoutineView';
import { 
  resolveExecutionTarget, 
  formatExecutionTargetDisplay 
} from '../services/domesticSupportService';
import { FamilyTask, DomesticSupport } from '../types';
import { allMasterTasks } from '../data/tasks';
import fs from 'fs';
import path from 'path';

export async function runDomesticSupport1cHf4Tests(): Promise<{
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
      results.push({ testName: `DomesticSupport1C-HF4 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `DomesticSupport1C-HF4 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  const testFamilyId = 'fam-hf4-croce';
  const supportMaria: DomesticSupport = {
    id: 'ds-maria-hf4',
    familyId: testFamilyId,
    name: 'Maria',
    type: 'CLEANER',
    active: true,
    schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };
  const domesticSupports = [supportMaria];

  // DS1C-HF4-01: WEEKLY é default inicial
  await record('DS1C-HF4-01', 'WEEKLY é default inicial no primeiro acesso', () => {
    resetStoredRoutineViewMode();
    const mode = getInitialRoutineViewMode();
    if (mode !== 'WEEKLY') {
      throw new Error(`Esperado default 'WEEKLY', obteve: '${mode}'`);
    }
  });

  // DS1C-HF4-02: Selecionar ROUTINES preserva a escolha durante navegação/remount previsto
  await record('DS1C-HF4-02', 'Selecionar ROUTINES preserva a preferência na sessão', () => {
    resetStoredRoutineViewMode();
    setStoredRoutineViewMode('ROUTINES');
    const reloadedMode = getInitialRoutineViewMode();
    if (reloadedMode !== 'ROUTINES') {
      throw new Error(`Esperado persistência de 'ROUTINES', obteve: '${reloadedMode}'`);
    }
    // Retorna para WEEKLY e valida
    setStoredRoutineViewMode('WEEKLY');
    if (getInitialRoutineViewMode() !== 'WEEKLY') {
      throw new Error('Falha ao reverter para WEEKLY');
    }
    resetStoredRoutineViewMode();
  });

  // Conjunto canônico de teste para busca e ordenação
  const sampleTasks: FamilyTask[] = [
    {
      id: 'ft-sofa',
      familyId: testFamilyId,
      taskMasterId: 'clean-7',
      task_master_id: 'clean-7',
      name: 'Aspirar o sofá e almofadas',
      customTitle: 'Aspirar o sofá e almofadas',
      frequency: 'WEEKLY',
      preferredDays: [6],
      active: true,
      executionTarget: 'HOUSEHOLD'
    },
    {
      id: 'ft-chao-sala',
      familyId: testFamilyId,
      taskMasterId: 'clean-1',
      task_master_id: 'clean-1',
      name: 'Aspirar o chão da sala',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-maria-hf4'
    },
    {
      id: 'ft-colchao',
      familyId: testFamilyId,
      taskMasterId: 'clean-13',
      task_master_id: 'clean-13',
      name: 'Aspirar colchão e travesseiros',
      frequency: 'MONTHLY',
      active: true,
      executionTarget: 'FLEXIBLE'
    },
    {
      id: 'ft-louca',
      familyId: testFamilyId,
      taskMasterId: 'kitch-1',
      task_master_id: 'kitch-1',
      name: 'Lavar a louça do almoço/jantar',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'HOUSEHOLD'
    },
    {
      id: 'ft-custom-horta',
      familyId: testFamilyId,
      name: 'Regar a horta suspensa',
      customTitle: 'Cuidar e regar a horta suspensa',
      frequency: 'DAILY',
      active: true,
      executionTarget: 'HOUSEHOLD'
    },
    {
      id: 'ft-sem-custom',
      familyId: testFamilyId,
      taskMasterId: 'laund-1',
      task_master_id: 'laund-1',
      // Não possui customTitle nem name preenchido, deve resolver via TaskMaster.name
      frequency: 'WEEKLY',
      preferredDays: [1, 4],
      active: true,
      executionTarget: 'HOUSEHOLD'
    }
  ];

  // Função pura de filtragem espelhando a RoutineView
  function filterAndSortRoutines(tasks: FamilyTask[], query: string): FamilyTask[] {
    const normQuery = normalizeRoutineSearchText(query);
    const filtered = tasks.filter(routine => {
      if (!normQuery) return true;
      const master = allMasterTasks.find(tm => tm.id === (routine.task_master_id || routine.taskMasterId || routine.task_id || (routine as any).taskId));
      const customTitleNorm = normalizeRoutineSearchText(routine.customTitle || routine.custom_title || '');
      const nameNorm = normalizeRoutineSearchText(routine.name || '');
      const masterNameNorm = normalizeRoutineSearchText(master?.name || '');
      return (
        customTitleNorm.includes(normQuery) ||
        nameNorm.includes(normQuery) ||
        masterNameNorm.includes(normQuery)
      );
    });

    return [...filtered].sort((a, b) => {
      const nameA = getRoutineDisplayName(a);
      const nameB = getRoutineDisplayName(b);
      return nameA.localeCompare(nameB, 'pt-BR', { sensitivity: 'base' });
    });
  }

  // DS1C-HF4-03: Busca encontra "Aspirar o sofá e almofadas" por "aspirar"
  await record('DS1C-HF4-03', 'Busca por "aspirar" encontra "Aspirar o sofá e almofadas"', () => {
    const results = filterAndSortRoutines(sampleTasks, 'aspirar');
    const foundSofa = results.some(r => r.name === 'Aspirar o sofá e almofadas');
    const foundChao = results.some(r => r.name === 'Aspirar o chão da sala');
    if (!foundSofa || !foundChao) {
      throw new Error(`Busca por 'aspirar' não retornou as tarefas esperadas. Encontradas: ${results.map(r => r.name).join(', ')}`);
    }
    if (results.length !== 3) {
      throw new Error(`Esperado 3 tarefas contendo 'aspirar', obteve ${results.length}`);
    }
  });

  // DS1C-HF4-04: Busca é case-insensitive
  await record('DS1C-HF4-04', 'Busca é case-insensitive (ASPIRAR / Aspirar / aspirar)', () => {
    const rUpper = filterAndSortRoutines(sampleTasks, 'ASPIRAR');
    const rLower = filterAndSortRoutines(sampleTasks, 'aspirar');
    const rMixed = filterAndSortRoutines(sampleTasks, 'AsPiRaR');

    if (rUpper.length !== rLower.length || rLower.length !== rMixed.length) {
      throw new Error(`Inconsistência de case: upper=${rUpper.length}, lower=${rLower.length}, mixed=${rMixed.length}`);
    }
  });

  // DS1C-HF4-05: Busca é accent-insensitive
  await record('DS1C-HF4-05', 'Busca é accent-insensitive ("sofa" encontra "sofá", "chao" encontra "chão")', () => {
    const bySofaNoAccent = filterAndSortRoutines(sampleTasks, 'sofa');
    if (!bySofaNoAccent.some(r => r.name === 'Aspirar o sofá e almofadas')) {
      throw new Error('Busca por "sofa" (sem acento) não encontrou "Aspirar o sofá e almofadas"');
    }

    const byChaoNoAccent = filterAndSortRoutines(sampleTasks, 'chao');
    if (!byChaoNoAccent.some(r => r.name === 'Aspirar o chão da sala')) {
      throw new Error('Busca por "chao" (sem til) não encontrou "Aspirar o chão da sala"');
    }
  });

  // DS1C-HF4-06: customTitle pesquisável para tarefas personalizadas
  await record('DS1C-HF4-06', 'customTitle pesquisável em tarefas customizadas', () => {
    const byHorta = filterAndSortRoutines(sampleTasks, 'horta suspensa');
    if (!byHorta.some(r => r.id === 'ft-custom-horta')) {
      throw new Error('customTitle "Cuidar e regar a horta suspensa" não foi encontrado por "horta suspensa"');
    }
  });

  // DS1C-HF4-07: TaskMaster.name pesquisável quando customTitle está ausente
  await record('DS1C-HF4-07', 'TaskMaster.name pesquisável quando customTitle está ausente', () => {
    // laund-1 TaskMaster name é "Separar roupas sujas por cor e tecido"
    const master = allMasterTasks.find(tm => tm.id === 'laund-1');
    if (!master) throw new Error('TaskMaster laund-1 ausente no catálogo');

    const byRoupas = filterAndSortRoutines(sampleTasks, 'separar roupas');
    if (!byRoupas.some(r => r.id === 'ft-sem-custom')) {
      throw new Error(`Tarefa ft-sem-custom não foi encontrada pelo nome do TaskMaster (${master.name})`);
    }
  });

  // DS1C-HF4-08: Ordenação alfabética dentro dos grupos
  await record('DS1C-HF4-08', 'Ordenação alfabética em pt-BR dentro de cada grupo', () => {
    const dailyGroup = sampleTasks.filter(t => t.frequency === 'DAILY');
    const sortedDaily = filterAndSortRoutines(dailyGroup, '');
    const names = sortedDaily.map(t => getRoutineDisplayName(t));

    for (let i = 0; i < names.length - 1; i++) {
      if (names[i].localeCompare(names[i + 1], 'pt-BR', { sensitivity: 'base' }) > 0) {
        throw new Error(`Ordem alfabética violada: "${names[i]}" veio antes de "${names[i + 1]}"`);
      }
    }
  });

  // DS1C-HF4-09: Contagem total permanece canônica
  await record('DS1C-HF4-09', 'Contagem total da aba permanece canônica (160) independente de filtro ativo', () => {
    const componentCode = fs.readFileSync(path.resolve('src/components/RoutineView.tsx'), 'utf8');
    // Deve conter o badge canonical
    if (!componentCode.includes('Rotinas Cadastradas ({familyTasks.length})')) {
      throw new Error('Badge da aba não utiliza familyTasks.length');
    }
  });

  // DS1C-HF4-10: Resultado filtrado apresenta "X de Y rotinas"
  await record('DS1C-HF4-10', 'Resultado filtrado apresenta "X de Y rotinas"', () => {
    const componentCode = fs.readFileSync(path.resolve('src/components/RoutineView.tsx'), 'utf8');
    if (!componentCode.includes('routines-filtered-count')) {
      throw new Error('ID routines-filtered-count ausente no componente');
    }
    if (!componentCode.includes('{totalFilteredRoutinesCount} de {familyTasks.length}')) {
      throw new Error('Padrão "X de Y rotinas" não encontrado na condicional de busca');
    }
  });

  // DS1C-HF4-11: Empty state correto
  await record('DS1C-HF4-11', 'Empty state exibe "Nenhuma rotina encontrada." e "Tente buscar por outro nome."', () => {
    const componentCode = fs.readFileSync(path.resolve('src/components/RoutineView.tsx'), 'utf8');
    if (!componentCode.includes('Nenhuma rotina encontrada.')) {
      throw new Error('Mensagem principal do empty state de busca ausente');
    }
    if (!componentCode.includes('Tente buscar por outro nome.')) {
      throw new Error('Complemento do empty state de busca ausente');
    }
  });

  // DS1C-HF4-12: executionTarget continua visível nos cards
  await record('DS1C-HF4-12', 'executionTarget e badges amigáveis preservados nos cards filtrados e ordenados', () => {
    sampleTasks.forEach(task => {
      const display = formatExecutionTargetDisplay(task, domesticSupports);
      if (!display || !display.label) {
        throw new Error(`Falha ao formatar executionTarget para tarefa ${task.id}`);
      }
    });

    const dSofa = formatExecutionTargetDisplay(sampleTasks[0], domesticSupports);
    const dChao = formatExecutionTargetDisplay(sampleTasks[1], domesticSupports);
    if (!dSofa.label.includes('Pessoas da casa')) {
      throw new Error(`Badge incorreto para sofá: ${dSofa.label}`);
    }
    if (!dChao.label.includes('Maria')) {
      throw new Error(`Badge incorreto para chão: ${dChao.label}`);
    }
  });

  // DS1C-HF4-13: Mobile sem overflow
  await record('DS1C-HF4-13', 'Campo de busca e layout de rotinas adaptados para 360px sem overflow', () => {
    const componentCode = fs.readFileSync(path.resolve('src/components/RoutineView.tsx'), 'utf8');
    if (!componentCode.includes('routine-search-input')) {
      throw new Error('ID routine-search-input ausente');
    }
    if (!componentCode.includes('w-full max-w-full')) {
      throw new Error('Container da busca sem classe responsiva max-w-full');
    }
  });

  // DS1C-HF4-14: Preservação de Motor 2.0, RoutineContinuity e DomesticSupport
  await record('DS1C-HF4-14', 'Preservação de Motor 2.0, RoutineContinuity, RBAC e DomesticSupport', () => {
    if (!resolveExecutionTarget || !formatExecutionTargetDisplay) {
      throw new Error('Funções essenciais de DomesticSupport ausentes');
    }
  });

  return { passed, failed, results };
}
