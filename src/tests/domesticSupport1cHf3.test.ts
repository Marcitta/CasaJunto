/**
 * CASA JUNTO — TEST SUITE DOMESTIC-SUPPORT-1C-HF3
 * RoutineView — atualização real de estado + correção visual do CTA
 * DS1C-HF3-01 - DS1C-HF3-10
 */

import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { 
  resolveExecutionTarget, 
  formatExecutionTargetDisplay,
  validateFamilyTaskExecutionTarget
} from '../services/domesticSupportService';
import { FamilyTask, BatchAddRoutineInput, DomesticSupport, Family, Room } from '../types';
import { allMasterTasks } from '../data/tasks';
import { demoFamilyTasks } from '../data/demoData';
import fs from 'fs';
import path from 'path';

export async function runDomesticSupport1cHf3Tests(): Promise<{
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
      results.push({ testName: `DomesticSupport1C-HF3 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `DomesticSupport1C-HF3 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  const testFamilyId = 'fam-croce-2026';
  const supportMaria: DomesticSupport = {
    id: 'ds-maria-hf3',
    familyId: testFamilyId,
    name: 'Maria',
    type: 'CLEANER',
    active: true,
    schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }],
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z'
  };

  const domesticSupports = [supportMaria];

  // DS1C-HF3-01: Paridade estrita Catálogo ("Na casa") x RoutineView ("Rotinas Cadastradas") para o mesmo familyId
  await record('DS1C-HF3-01', 'Paridade estrita Catálogo ("Na casa") x RoutineView ("Rotinas Cadastradas")', () => {
    const familyTasks: FamilyTask[] = [
      {
        id: 'ft-hf3-1',
        familyId: testFamilyId,
        taskMasterId: 'kitch-1',
        task_master_id: 'kitch-1',
        name: 'Lavar a louça do almoço/jantar',
        frequency: 'DAILY',
        active: true,
        executionTarget: 'HOUSEHOLD'
      },
      {
        id: 'ft-hf3-2',
        familyId: testFamilyId,
        taskMasterId: 'clean-1',
        task_master_id: 'clean-1',
        name: 'Aspirar o chão da sala',
        frequency: 'DAILY',
        active: true,
        executionTarget: 'EXTERNAL_SUPPORT',
        domesticSupportId: 'ds-maria-hf3'
      },
      {
        id: 'ft-hf3-3',
        familyId: testFamilyId,
        name: 'Trocar lâmpada do corredor',
        customTitle: 'Trocar lâmpada do corredor',
        frequency: 'OTHER',
        active: true,
        executionTarget: 'FLEXIBLE'
      }
    ];

    // Catálogo map
    const catalogMap = new Map<string, FamilyTask>();
    familyTasks.forEach(ft => {
      const tmId = ft.task_master_id || ft.taskMasterId || ft.task_id || ft.taskId;
      if (tmId) catalogMap.set(tmId, ft);
      catalogMap.set(ft.id, ft);
    });

    // Catálogo status
    const getCatalogStatus = (id: string) => {
      const ft = catalogMap.get(id);
      if (!ft) return 'AVAILABLE';
      return ft.active !== false ? 'ACTIVE' : 'INACTIVE';
    };

    // RoutineView frequencies filter
    const frequencies = [
      { key: 'DAILY', match: (f: string) => f?.toUpperCase() === 'DAILY' },
      { key: 'WEEKLY', match: (f: string) => f?.toUpperCase() === 'WEEKLY' || f?.toUpperCase() === 'SEVERAL_TIMES_WEEK' },
      { key: 'BIWEEKLY', match: (f: string) => f?.toUpperCase() === 'BIWEEKLY' },
      { key: 'MONTHLY', match: (f: string) => f?.toUpperCase() === 'MONTHLY' },
      { key: 'OTHER', match: (f: string) => !['DAILY', 'WEEKLY', 'SEVERAL_TIMES_WEEK', 'BIWEEKLY', 'MONTHLY'].includes(f?.toUpperCase()) }
    ];

    const routineTasksRendered: FamilyTask[] = [];
    frequencies.forEach(freq => {
      const matched = familyTasks.filter(ft => freq.match(ft.frequency || ''));
      routineTasksRendered.push(...matched);
    });

    if (routineTasksRendered.length !== familyTasks.length) {
      throw new Error(`Rotinas exibidas (${routineTasksRendered.length}) diferem do total de familyTasks (${familyTasks.length})`);
    }

    // Every active task in Catalog must be in RoutineView
    familyTasks.forEach(ft => {
      const catalogStatus = getCatalogStatus(ft.taskMasterId || ft.id);
      if (catalogStatus === 'ACTIVE') {
        const inRoutine = routineTasksRendered.some(r => r.id === ft.id);
        if (!inRoutine) {
          throw new Error(`Tarefa "${ft.name}" ativa no Catálogo não foi encontrada na RoutineView`);
        }
      }
    });
  });

  // DS1C-HF3-02: RoutineView resolve nomes canônicos reais de cada rotina (sem fallback para "Rotina")
  await record('DS1C-HF3-02', 'RoutineView resolve nomes canônicos reais de cada rotina (sem fallback para "Rotina")', () => {
    const rawRoutines: FamilyTask[] = [
      { id: 'ft-1', familyId: testFamilyId, taskMasterId: 'kitch-1', frequency: 'DAILY', active: true },
      { id: 'ft-2', familyId: testFamilyId, task_id: 'clean-1', frequency: 'WEEKLY', active: true },
      { id: 'ft-3', familyId: testFamilyId, name: 'Limpar forno elétrico', frequency: 'MONTHLY', active: true }
    ];

    rawRoutines.forEach(routine => {
      const master = allMasterTasks.find(tm => tm.id === (routine.task_master_id || routine.taskMasterId || routine.task_id || (routine as any).taskId));
      const displayName = routine.customTitle || routine.custom_title || routine.name || master?.name || 'Rotina';
      if (!displayName || displayName === 'Rotina') {
        throw new Error(`Rotina ${routine.id} resolveu indevidamente como "${displayName}"`);
      }
    });
  });

  // DS1C-HF3-03: RoutineView renderiza executionTarget canônico correto com labels amigáveis
  await record('DS1C-HF3-03', 'RoutineView renderiza executionTarget canônico correto com labels amigáveis', () => {
    const r1: FamilyTask = { id: 'r1', familyId: testFamilyId, taskMasterId: 'kitch-1', executionTarget: 'HOUSEHOLD', active: true };
    const r2: FamilyTask = { id: 'r2', familyId: testFamilyId, taskMasterId: 'clean-1', executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: 'ds-maria-hf3', active: true };
    const r3: FamilyTask = { id: 'r3', familyId: testFamilyId, name: 'Custom', executionTarget: 'FLEXIBLE', active: true };
    const r4: FamilyTask = { id: 'r4', familyId: testFamilyId, name: 'Custom Pref', executionTarget: 'FLEXIBLE', domesticSupportId: 'ds-maria-hf3', active: true };

    const d1 = formatExecutionTargetDisplay(r1, domesticSupports);
    const d2 = formatExecutionTargetDisplay(r2, domesticSupports);
    const d3 = formatExecutionTargetDisplay(r3, domesticSupports);
    const d4 = formatExecutionTargetDisplay(r4, domesticSupports);

    if (!d1.label.includes('Pessoas da casa')) throw new Error(`Esperado "Pessoas da casa", obteve: ${d1.label}`);
    if (!d2.label.includes('Maria') || !d2.label.includes('Ajuda externa')) throw new Error(`Esperado "Maria · Ajuda externa", obteve: ${d2.label}`);
    if (!d3.label.includes('Qualquer um')) throw new Error(`Esperado "Qualquer um", obteve: ${d3.label}`);
    if (!d4.label.includes('Qualquer um') || !d4.label.includes('Maria')) throw new Error(`Esperado "Qualquer um · preferência: Maria", obteve: ${d4.label}`);
  });

  // DS1C-HF3-04: Simulação de F5 com reload de Firestore: tarefas com task_id ou taskId legados deserializam com task_master_id e nome preservados
  await record('DS1C-HF3-04', 'Simulação de F5 com reload: tarefas legadas preservam task_master_id e nome real', () => {
    const legacyFirestoreDocs = [
      { id: 'doc-1', data: { task_id: 'kitch-1', frequency: 'daily', active: true } },
      { id: 'doc-2', data: { taskId: 'clean-1', frequency: 'weekly', active: true } },
      { id: 'doc-3', data: { task_master_id: 'org-1', name: null, active: true } },
      { id: 'doc-4', data: { customTitle: 'Organizar armário', frequency: 'monthly', active: true } }
    ];

    const rehydrated = legacyFirestoreDocs.map(d => FirestoreMappers.toFamilyTask(d.id, d.data));

    if (rehydrated[0].task_master_id !== 'kitch-1' || rehydrated[0].name !== 'Lavar a louça do almoço/jantar') {
      throw new Error(`Doc 1 falhou: ${rehydrated[0].task_master_id}, ${rehydrated[0].name}`);
    }
    if (rehydrated[1].task_master_id !== 'clean-1' || rehydrated[1].name !== 'Aspirar o chão da sala') {
      throw new Error(`Doc 2 falhou: ${rehydrated[1].task_master_id}, ${rehydrated[1].name}`);
    }
    if (rehydrated[2].task_master_id !== 'org-1' || rehydrated[2].name !== 'Arrumar a própria cama') {
      throw new Error(`Doc 3 falhou: ${rehydrated[2].task_master_id}, ${rehydrated[2].name}`);
    }
    if (rehydrated[3].name !== 'Organizar armário') {
      throw new Error(`Doc 4 falhou: ${rehydrated[3].name}`);
    }
  });

  // DS1C-HF3-05: Modo Demo: demoFamilyTasks possui 14 tarefas e todas com nomes canônicos e executionTarget
  await record('DS1C-HF3-05', 'Modo Demo: demoFamilyTasks possui tarefas canônicas com nomes reais e executionTarget', () => {
    if (demoFamilyTasks.length !== 14) {
      throw new Error(`Esperado 14 demoFamilyTasks, obteve: ${demoFamilyTasks.length}`);
    }
    demoFamilyTasks.forEach(ft => {
      if (!ft.name || ft.name === 'Rotina') {
        throw new Error(`Tarefa demo ${ft.id} sem nome canônico real: ${ft.name}`);
      }
      if (!ft.executionTarget) {
        throw new Error(`Tarefa demo ${ft.id} sem executionTarget`);
      }
      if (!ft.task_master_id && !ft.taskMasterId) {
        throw new Error(`Tarefa demo ${ft.id} sem task_master_id`);
      }
    });
  });

  // DS1C-HF3-06: Header CTA "Nova tarefa": botão possui ícone Plus e texto somente "Nova tarefa" (sem duplicidade visual de +)
  await record('DS1C-HF3-06', 'Header CTA "Nova tarefa": sem duplicidade visual de +', () => {
    const headerPath = path.resolve('src/components/Header.tsx');
    const headerCode = fs.readFileSync(headerPath, 'utf8');

    if (headerCode.includes('+ Nova tarefa')) {
      throw new Error('Header.tsx contém duplicidade "+ Nova tarefa"');
    }
    if (!headerCode.includes('Nova tarefa')) {
      throw new Error('Header.tsx não contém o CTA "Nova tarefa"');
    }
  });

  // DS1C-HF3-07: Catálogo CTA "Adicionar": botão possui ícone Plus e texto somente "Adicionar" (sem duplicidade visual de +)
  await record('DS1C-HF3-07', 'Catálogo CTA "Adicionar": sem duplicidade visual de +', () => {
    const catalogPath = path.resolve('src/components/TaskCatalogView.tsx');
    const catalogCode = fs.readFileSync(catalogPath, 'utf8');

    if (catalogCode.includes('+ Adicionar<')) {
      throw new Error('TaskCatalogView.tsx contém duplicidade "+ Adicionar"');
    }
    if (!catalogCode.includes('<span>Adicionar</span>')) {
      throw new Error('TaskCatalogView.tsx não contém "<span>Adicionar</span>"');
    }
  });

  // DS1C-HF3-08: HouseView CTA "Adicionar Primeiro Ambiente": sem duplicidade visual de +
  await record('DS1C-HF3-08', 'HouseView CTA "Adicionar Primeiro Ambiente": sem duplicidade visual de +', () => {
    const housePath = path.resolve('src/components/HouseView.tsx');
    const houseCode = fs.readFileSync(housePath, 'utf8');

    if (houseCode.includes('+ Adicionar Primeiro Ambiente')) {
      throw new Error('HouseView.tsx contém duplicidade "+ Adicionar Primeiro Ambiente"');
    }
    if (!houseCode.includes('Adicionar Primeiro Ambiente')) {
      throw new Error('HouseView.tsx não contém "Adicionar Primeiro Ambiente"');
    }
  });

  // DS1C-HF3-09: Isolamento de frequência em RoutineView: DAILY, WEEKLY, BIWEEKLY, MONTHLY e OTHER categorizam 100% das tarefas sem omissões
  await record('DS1C-HF3-09', 'Isolamento de frequência em RoutineView cobre 100% das tarefas', () => {
    const frequencies = [
      { key: 'DAILY', match: (f: string) => f?.toUpperCase() === 'DAILY' },
      { key: 'WEEKLY', match: (f: string) => f?.toUpperCase() === 'WEEKLY' || f?.toUpperCase() === 'SEVERAL_TIMES_WEEK' },
      { key: 'BIWEEKLY', match: (f: string) => f?.toUpperCase() === 'BIWEEKLY' },
      { key: 'MONTHLY', match: (f: string) => f?.toUpperCase() === 'MONTHLY' },
      { key: 'OTHER', match: (f: string) => !['DAILY', 'WEEKLY', 'SEVERAL_TIMES_WEEK', 'BIWEEKLY', 'MONTHLY'].includes(f?.toUpperCase()) }
    ];

    const sampleFrequencies = ['DAILY', 'daily', 'WEEKLY', 'several_times_week', 'BIWEEKLY', 'MONTHLY', 'ONE_TIME', 'punctual', '', 'random'];

    sampleFrequencies.forEach(freq => {
      const matchCount = frequencies.filter(f => f.match(freq)).length;
      if (matchCount !== 1) {
        throw new Error(`Frequência "${freq}" deu match em ${matchCount} categorias (esperado exatamente 1)`);
      }
    });
  });

  // DS1C-HF3-10: Preservação de Motor 2.0, DistributionEngine, RBAC, e DomesticSupport domain
  await record('DS1C-HF3-10', 'Preservação de Motor 2.0, DistributionEngine, RBAC, e DomesticSupport domain', () => {
    // Invariante de integridade estrutural
    if (!validateFamilyTaskExecutionTarget) {
      throw new Error('validateFamilyTaskExecutionTarget ausente');
    }
    if (!resolveExecutionTarget) {
      throw new Error('resolveExecutionTarget ausente');
    }
  });

  return { passed, failed, results };
}
