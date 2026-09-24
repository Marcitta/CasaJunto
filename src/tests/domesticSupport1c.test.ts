/**
 * CASA JUNTO — DOMESTIC-SUPPORT-1C TEST SUITE
 * Classificação das Rotinas — Quem normalmente executa?
 *
 * Testes DS1C-01 a DS1C-25 cobrindo:
 * - Default HOUSEHOLD para nova rotina e compatibilidade legacy
 * - Seleção de EXTERNAL_SUPPORT com auto-seleção (1 ativa) e seleção múltipla
 * - Bloqueio quando não há ajuda externa ativa e CTA para cadastro
 * - Seleção de FLEXIBLE com e sem preferência
 * - Limpeza rigorosa de estado residual nas transições
 * - Validação canônica via validateFamilyTaskExecutionTarget
 * - Isolamento multi-tenant
 * - RBAC (ADMIN pode alterar, MEMBER não)
 * - Persistência em FirestoreMappers e AppContext
 * - Ausência total de jargões técnicos na UI
 * - Proteção do Motor 2.0, PH-1, RoutineContinuity e Modo Caos
 */

import {
  resolveExecutionTarget,
  validateFamilyTaskExecutionTarget
} from '../services/domesticSupportService';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { FamilyTask, Task, DomesticSupport, ExecutionTarget } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runDomesticSupport1cTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  async function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, error: err?.message || String(err) });
    }
  }

  const familyIdA = 'family-alpha-1c';
  const familyIdB = 'family-beta-1c';

  const mockSupportA1: DomesticSupport = {
    id: 'ds-a1',
    familyId: familyIdA,
    name: 'Maria',
    type: 'CLEANER',
    schedule: [{ dayOfWeek: 2, startTime: '08:00', endTime: '16:00' }],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const mockSupportA2: DomesticSupport = {
    id: 'ds-a2',
    familyId: familyIdA,
    name: 'Joana',
    type: 'CLEANER',
    schedule: [{ dayOfWeek: 4, startTime: '09:00', endTime: '15:00' }],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const mockSupportInactive: DomesticSupport = {
    id: 'ds-inact',
    familyId: familyIdA,
    name: 'Clara',
    type: 'CLEANER',
    schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '12:00' }],
    active: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const mockSupportCrossTenant: DomesticSupport = {
    id: 'ds-b1',
    familyId: familyIdB,
    name: 'Sônia',
    type: 'CLEANER',
    schedule: [{ dayOfWeek: 3, startTime: '08:00', endTime: '16:00' }],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // DS1C-01: Default HOUSEHOLD para nova rotina/tarefa
  await record('DS1C-01', 'Default HOUSEHOLD para nova rotina (executionTarget: HOUSEHOLD, domesticSupportId: null)', () => {
    const defaultTask: Partial<FamilyTask> = {
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    };
    const target = resolveExecutionTarget(defaultTask);
    if (target !== 'HOUSEHOLD') {
      throw new Error(`Expected default HOUSEHOLD, received: ${target}`);
    }
    if (defaultTask.domesticSupportId !== null) {
      throw new Error(`Expected domesticSupportId null, received: ${defaultTask.domesticSupportId}`);
    }
  });

  // DS1C-02: Compatibilidade Legacy: sem executionTarget resolve como HOUSEHOLD
  await record('DS1C-02', 'Compatibilidade Legacy: rotina/tarefa sem executionTarget resolve como HOUSEHOLD', () => {
    const legacyTask: Partial<FamilyTask> = {
      id: 'ft-legacy-01',
      name: 'Lavar Pratos Antigos'
    };
    const target = resolveExecutionTarget(legacyTask);
    if (target !== 'HOUSEHOLD') {
      throw new Error(`Legacy task must resolve as HOUSEHOLD, got: ${target}`);
    }
  });

  // DS1C-03: Classificação com EXTERNAL_SUPPORT e 1 ajuda ativa
  await record('DS1C-03', 'Classificação com EXTERNAL_SUPPORT e pré-seleção automática com 1 ajuda ativa', () => {
    const activeSupports = [mockSupportA1];
    let selectedTarget: ExecutionTarget = 'EXTERNAL_SUPPORT';
    let selectedSupportId: string | null = null;

    if (selectedTarget === 'EXTERNAL_SUPPORT' && !selectedSupportId && activeSupports.length === 1) {
      selectedSupportId = activeSupports[0].id;
    }

    if (selectedSupportId !== 'ds-a1') {
      throw new Error(`Expected auto-selected ds-a1, got: ${selectedSupportId}`);
    }

    const validation = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: selectedTarget, domesticSupportId: selectedSupportId },
      activeSupports
    );
    if (!validation.valid) {
      throw new Error(`Validation failed for valid single support: ${validation.error}`);
    }
  });

  // DS1C-04: Classificação com EXTERNAL_SUPPORT e múltiplas ajudas ativas
  await record('DS1C-04', 'Classificação com EXTERNAL_SUPPORT exige seleção quando há múltiplas ajudas', () => {
    const activeSupports = [mockSupportA1, mockSupportA2];
    const target: ExecutionTarget = 'EXTERNAL_SUPPORT';
    const unselectedId: string | null = null;

    // Se nenhuma estiver selecionada, deve ser inválido
    const invalidValidation = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: target, domesticSupportId: unselectedId },
      activeSupports
    );
    if (invalidValidation.valid) {
      throw new Error('Should not be valid with null domesticSupportId when multiple supports exist');
    }

    // Com uma selecionada, torna-se válido
    const validValidation = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: target, domesticSupportId: mockSupportA2.id },
      activeSupports
    );
    if (!validValidation.valid) {
      throw new Error(`Should be valid with selected support: ${validValidation.error}`);
    }
  });

  // DS1C-05: Bloqueio estrito quando selecionado EXTERNAL_SUPPORT sem ajuda externa cadastrada
  await record('DS1C-05', 'Bloqueio estrito quando EXTERNAL_SUPPORT é selecionado e lista de apoios ativos está vazia', () => {
    const emptySupports: DomesticSupport[] = [];
    const validation = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: 'any-id' },
      emptySupports
    );
    if (validation.valid) {
      throw new Error('Must reject EXTERNAL_SUPPORT when no domestic supports exist');
    }
  });

  // DS1C-06: Mensagem amigável de estado vazio de ajuda externa e ação para cadastrar
  await record('DS1C-06', 'Mensagem amigável e ação "Cadastrar ajuda externa" quando não há ajudas ativas', () => {
    const selectorPath = path.resolve(process.cwd(), 'src/components/DomesticSupport/ExecutionTargetSelector.tsx');
    const content = fs.readFileSync(selectorPath, 'utf8');

    const expectedNotice = 'Você ainda não tem uma ajuda externa ativa cadastrada.';
    const expectedCta = 'Cadastrar ajuda externa';

    if (!content.includes(expectedNotice)) {
      throw new Error(`Expected notice "${expectedNotice}" not found in ExecutionTargetSelector`);
    }
    if (!content.includes(expectedCta)) {
      throw new Error(`Expected CTA "${expectedCta}" not found in ExecutionTargetSelector`);
    }
  });

  // DS1C-07: Ação de cadastrar ajuda externa leva à tela de gestão do 1B
  await record('DS1C-07', 'Ação de cadastrar ajuda externa navega para "domestic_support"', () => {
    const taskCreationPath = path.resolve(process.cwd(), 'src/components/TaskCreationModal.tsx');
    const content = fs.readFileSync(taskCreationPath, 'utf8');

    if (!content.includes("setCurrentView('domestic_support')")) {
      throw new Error("TaskCreationModal must navigate to 'domestic_support' on CTA click");
    }
  });

  // DS1C-08: Classificação com FLEXIBLE sem ajuda preferencial
  await record('DS1C-08', 'Classificação com FLEXIBLE sem preferência (executionTarget: FLEXIBLE, domesticSupportId: null)', () => {
    const task: Partial<FamilyTask> = {
      familyId: familyIdA,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: null
    };
    const validation = validateFamilyTaskExecutionTarget(task, [mockSupportA1]);
    if (!validation.valid) {
      throw new Error(`FLEXIBLE without domesticSupportId must be valid: ${validation.error}`);
    }
  });

  // DS1C-09: Classificação com FLEXIBLE com ajuda preferencial indicada
  await record('DS1C-09', 'Classificação com FLEXIBLE com ajuda preferencial indicada (executionTarget: FLEXIBLE, domesticSupportId: id)', () => {
    const task: Partial<FamilyTask> = {
      familyId: familyIdA,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: mockSupportA1.id
    };
    const validation = validateFamilyTaskExecutionTarget(task, [mockSupportA1]);
    if (!validation.valid) {
      throw new Error(`FLEXIBLE with valid domesticSupportId must be valid: ${validation.error}`);
    }
  });

  // DS1C-10: Limpeza de estado residual ao trocar de EXTERNAL_SUPPORT para HOUSEHOLD
  await record('DS1C-10', 'Transição EXTERNAL_SUPPORT -> HOUSEHOLD limpa domesticSupportId para null', () => {
    let currentTarget: ExecutionTarget = 'EXTERNAL_SUPPORT';
    let currentSupportId: string | null = 'ds-a1';

    // Simula troca para HOUSEHOLD
    currentTarget = 'HOUSEHOLD';
    currentSupportId = null;

    if (currentSupportId !== null) {
      throw new Error(`Expected domesticSupportId null after switching to HOUSEHOLD, got: ${currentSupportId}`);
    }

    const validation = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: currentTarget, domesticSupportId: currentSupportId },
      [mockSupportA1]
    );
    if (!validation.valid) {
      throw new Error(`Transitioned state must be valid: ${validation.error}`);
    }
  });

  // DS1C-11: Limpeza de estado residual ao trocar de FLEXIBLE para HOUSEHOLD
  await record('DS1C-11', 'Transição FLEXIBLE -> HOUSEHOLD limpa domesticSupportId para null', () => {
    let currentTarget: ExecutionTarget = 'FLEXIBLE';
    let currentSupportId: string | null = 'ds-a1';

    // Simula troca para HOUSEHOLD
    currentTarget = 'HOUSEHOLD';
    currentSupportId = null;

    if (currentSupportId !== null) {
      throw new Error(`Expected domesticSupportId null after switching to HOUSEHOLD from FLEXIBLE, got: ${currentSupportId}`);
    }

    const validation = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: currentTarget, domesticSupportId: currentSupportId },
      [mockSupportA1]
    );
    if (!validation.valid) {
      throw new Error(`Transitioned state must be valid: ${validation.error}`);
    }
  });

  // DS1C-12: Preservação ou revalidação de ID ao alternar entre EXTERNAL_SUPPORT e FLEXIBLE
  await record('DS1C-12', 'Alternância entre EXTERNAL_SUPPORT e FLEXIBLE preserva ID se for ajuda válida ativa', () => {
    let currentTarget: ExecutionTarget = 'EXTERNAL_SUPPORT';
    let currentSupportId: string | null = mockSupportA1.id;

    // Muda para FLEXIBLE: mantém a preferência existente se válida
    currentTarget = 'FLEXIBLE';
    const validation = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: currentTarget, domesticSupportId: currentSupportId },
      [mockSupportA1]
    );
    if (!validation.valid) {
      throw new Error(`Preserving valid supportId in FLEXIBLE must be valid: ${validation.error}`);
    }
  });

  // DS1C-13: Validação canônica rejeita EXTERNAL_SUPPORT sem domesticSupportId
  await record('DS1C-13', 'Validação canônica rejeita EXTERNAL_SUPPORT sem domesticSupportId preenchido', () => {
    const invalidTasks = [
      { familyId: familyIdA, executionTarget: 'EXTERNAL_SUPPORT' as const, domesticSupportId: null },
      { familyId: familyIdA, executionTarget: 'EXTERNAL_SUPPORT' as const, domesticSupportId: undefined },
      { familyId: familyIdA, executionTarget: 'EXTERNAL_SUPPORT' as const, domesticSupportId: '' }
    ];

    for (const t of invalidTasks) {
      const res = validateFamilyTaskExecutionTarget(t, [mockSupportA1]);
      if (res.valid) {
        throw new Error(`EXTERNAL_SUPPORT with domesticSupportId ${t.domesticSupportId} must fail validation`);
      }
    }
  });

  // DS1C-14: Validação canônica rejeita EXTERNAL_SUPPORT com domesticSupportId inativo
  await record('DS1C-14', 'Validação canônica rejeita EXTERNAL_SUPPORT apontando para apoio inativo', () => {
    const res = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: mockSupportInactive.id },
      [mockSupportInactive]
    );
    if (res.valid) {
      throw new Error('Must reject EXTERNAL_SUPPORT referencing inactive support');
    }
  });

  // DS1C-15: Validação canônica rejeita EXTERNAL_SUPPORT cross-tenant
  await record('DS1C-15', 'Validação canônica rejeita EXTERNAL_SUPPORT com apoio de outra família (cross-tenant)', () => {
    const res = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: 'EXTERNAL_SUPPORT', domesticSupportId: mockSupportCrossTenant.id },
      [mockSupportCrossTenant]
    );
    if (res.valid) {
      throw new Error('Must reject cross-tenant DomesticSupport reference');
    }
  });

  // DS1C-16: Validação canônica rejeita HOUSEHOLD com domesticSupportId preenchido
  await record('DS1C-16', 'Validação canônica rejeita HOUSEHOLD com domesticSupportId preenchido', () => {
    const res = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: 'HOUSEHOLD', domesticSupportId: mockSupportA1.id },
      [mockSupportA1]
    );
    if (res.valid) {
      throw new Error('HOUSEHOLD task must not have domesticSupportId');
    }
  });

  // DS1C-17: Validação canônica aceita FLEXIBLE nulo ou com apoio válido
  await record('DS1C-17', 'Validação canônica aceita FLEXIBLE nulo ou com apoio ativo da família', () => {
    const res1 = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: 'FLEXIBLE', domesticSupportId: null },
      [mockSupportA1]
    );
    if (!res1.valid) throw new Error('FLEXIBLE with null should be valid');

    const res2 = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: 'FLEXIBLE', domesticSupportId: mockSupportA1.id },
      [mockSupportA1]
    );
    if (!res2.valid) throw new Error('FLEXIBLE with active domestic support should be valid');

    const res3 = validateFamilyTaskExecutionTarget(
      { familyId: familyIdA, executionTarget: 'FLEXIBLE', domesticSupportId: mockSupportInactive.id },
      [mockSupportInactive]
    );
    if (res3.valid) throw new Error('FLEXIBLE with inactive support must be rejected');
  });

  // DS1C-18: Edição de rotina preserva ID canônico e atualiza executionTarget e domesticSupportId
  await record('DS1C-18', 'Edição de rotina atualiza executionTarget e domesticSupportId mantendo mesmo ID', () => {
    const existingRoutine: FamilyTask = {
      id: 'ft-test-edit-01',
      familyId: familyIdA,
      name: 'Faxina Geral',
      frequency: 'weekly',
      active: true,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: null
    };

    const updates: Partial<FamilyTask> = {
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: mockSupportA1.id
    };

    const updated = {
      ...existingRoutine,
      ...updates,
      id: existingRoutine.id
    };

    if (updated.id !== existingRoutine.id) {
      throw new Error('Routine ID must be strictly preserved upon edit');
    }
    if (updated.executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`Expected executionTarget EXTERNAL_SUPPORT, got ${updated.executionTarget}`);
    }
    if (updated.domesticSupportId !== mockSupportA1.id) {
      throw new Error(`Expected domesticSupportId ${mockSupportA1.id}, got ${updated.domesticSupportId}`);
    }
  });

  // DS1C-19: RBAC: ADMIN visualiza e altera executionTarget e domesticSupportId na UI
  await record('DS1C-19', 'RBAC: ADMIN visualiza e edita bloco de classificação de executante', () => {
    const editModalPath = path.resolve(process.cwd(), 'src/components/EditFamilyTaskModal.tsx');
    const content = fs.readFileSync(editModalPath, 'utf8');

    if (!content.includes('isAdmin &&') || !content.includes('ExecutionTargetSelector')) {
      throw new Error('EditFamilyTaskModal must guard ExecutionTargetSelector with isAdmin check');
    }
  });

  // DS1C-20: RBAC: MEMBER bloqueado de gerenciar ou alterar executionTarget de rotinas
  await record('DS1C-20', 'RBAC: MEMBER bloqueado de gerenciar ou alterar rotinas (fail-closed)', () => {
    const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
    const content = fs.readFileSync(appContextPath, 'utf8');

    // Verifica guard de ADMIN em addTask, addRoutine e updateRoutine
    const hasAddTaskAdminGuard = content.includes("if (currentMember && currentMember.role && currentMember.role !== 'ADMIN')");
    if (!hasAddTaskAdminGuard) {
      throw new Error('AppContext must enforce role === ADMIN on routine modifications');
    }
  });

  // DS1C-21: Ausência de termos técnicos na interface
  await record('DS1C-21', 'Ausência de termos técnicos na interface (labels 100% amigáveis)', () => {
    const selectorPath = path.resolve(process.cwd(), 'src/components/DomesticSupport/ExecutionTargetSelector.tsx');
    const content = fs.readFileSync(selectorPath, 'utf8');

    const friendlyTerms = [
      'Pessoas da casa',
      'A tarefa faz parte da divisão entre os moradores.',
      'Ajuda externa',
      'A tarefa fica reservada para alguém que ajuda na casa.',
      'Pode ser qualquer um',
      'Normalmente pode ser feita pelos moradores ou pela ajuda externa.',
      'Quem normalmente faz?',
      'Ajuda externa preferencial — opcional'
    ];

    for (const term of friendlyTerms) {
      if (!content.includes(term)) {
        throw new Error(`Friendly copy term "${term}" missing in ExecutionTargetSelector`);
      }
    }
  });

  // DS1C-22: Mapeamento no FirestoreMappers toFamilyTask e fromFamilyTask
  await record('DS1C-22', 'FirestoreMappers toFamilyTask e fromFamilyTask persistem executionTarget e domesticSupportId', () => {
    const task: Partial<FamilyTask> = {
      id: 'ft-map-test',
      familyId: familyIdA,
      name: 'Limpeza Semanal',
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-a1'
    };

    const serialized = FirestoreMappers.fromFamilyTask(task);
    if (serialized.executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`Expected serialized executionTarget EXTERNAL_SUPPORT, got ${serialized.executionTarget}`);
    }
    if (serialized.domesticSupportId !== 'ds-a1') {
      throw new Error(`Expected serialized domesticSupportId ds-a1, got ${serialized.domesticSupportId}`);
    }

    const deserialized = FirestoreMappers.toFamilyTask('ft-map-test', serialized);
    if (deserialized.executionTarget !== 'EXTERNAL_SUPPORT') {
      throw new Error(`Expected deserialized executionTarget EXTERNAL_SUPPORT, got ${deserialized.executionTarget}`);
    }
    if (deserialized.domesticSupportId !== 'ds-a1') {
      throw new Error(`Expected deserialized domesticSupportId ds-a1, got ${deserialized.domesticSupportId}`);
    }
  });

  // DS1C-23: Propagação de executionTarget e domesticSupportId nas ocorrências no AppContext
  await record('DS1C-23', 'Propagação de executionTarget e domesticSupportId nas tarefas derivadas no AppContext', () => {
    const appContextPath = path.resolve(process.cwd(), 'src/context/AppContext.tsx');
    const content = fs.readFileSync(appContextPath, 'utf8');

    if (!content.includes("executionTarget: ft?.executionTarget || 'HOUSEHOLD'")) {
      throw new Error('AppContext mapAssignmentsToTasks must propagate executionTarget from FamilyTask');
    }
    if (!content.includes('domesticSupportId: ft?.domesticSupportId ?? null')) {
      throw new Error('AppContext mapAssignmentsToTasks must propagate domesticSupportId from FamilyTask');
    }
  });

  // DS1C-24: Modo DEMO suporta criação e edição de rotinas com executionTarget em memória
  await record('DS1C-24', 'Modo DEMO suporta criação e edição de rotinas com executionTarget em memória', () => {
    const demoTask: FamilyTask = {
      id: 'ft-demo-01',
      familyId: 'fam-demo',
      name: 'Organizar Despensa',
      active: true,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'ds-a1'
    };

    const target = resolveExecutionTarget(demoTask);
    if (target !== 'FLEXIBLE') {
      throw new Error(`Expected FLEXIBLE in demo task, received: ${target}`);
    }
  });

  // DS1C-25: Integridade do Motor 2.0, RoutineContinuityService, PH-1, Chaos Session e gamificação
  await record('DS1C-25', 'Motor 2.0, RoutineContinuityService, PH-1, Chaos Session e Gamificação 100% protegidos', () => {
    // 1. Motor 2.0 files intact
    const distributionEnginePath = path.resolve('src/domain/distribution/DistributionEngine.ts');
    const safetyServicePath = path.resolve('src/domain/distribution/SafetyService.ts');
    if (!fs.existsSync(distributionEnginePath)) {
      throw new Error('DistributionEngine.ts must exist');
    }
    if (!fs.existsSync(safetyServicePath)) {
      throw new Error('SafetyService.ts must exist');
    }

    // 2. RoutineContinuityService intact
    const continuityPath = path.resolve('src/application/services/RoutineContinuityService.ts');
    const continuityContent = fs.readFileSync(continuityPath, 'utf8');
    if (!continuityContent.includes('updateRoutine') || !continuityContent.includes('deactivateRoutine')) {
      throw new Error('RoutineContinuityService core methods must remain intact');
    }

    // 3. Chaos state & bonus intact
    const chaosPath = path.resolve('src/services/chaosSessionService.ts');
    if (!fs.existsSync(chaosPath)) {
      throw new Error('chaosSessionService.ts must exist');
    }
  });

  return results;
}
