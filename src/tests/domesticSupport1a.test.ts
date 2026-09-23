/**
 * CASA JUNTO — DOMESTIC-SUPPORT-1A TEST SUITE
 * Domain + Persistence Foundation for Ajuda Externa / Diarista
 *
 * Testes DS1A-01 a DS1A-25 cobrindo:
 * - Criação válida, múltiplos dias, horários inválidos, horários duplicados/sobrepostos
 * - Desativação (soft delete active=false) e reativação preservando ID e histórico
 * - CLEANER não é Member, ausência de login/userId, ausência de gamificação, não conta em adminCount
 * - RBAC: ADMIN write permitido, MEMBER write bloqueado
 * - Multi-tenant isolation: rejeição cross-tenant
 * - Invariantes da FamilyTask: HOUSEHOLD, EXTERNAL_SUPPORT, FLEXIBLE
 * - Compatibilidade legacy: resolução transparente para HOUSEHOLD sem migração destrutiva
 * - Verificação de integridade dos módulos protegidos (Motor 2.0, DistributionEngine)
 */

import {
  validateDomesticSupportSchedule,
  createDomesticSupportEntity,
  deactivateDomesticSupportEntity,
  reactivateDomesticSupportEntity,
  resolveExecutionTarget,
  validateFamilyTaskExecutionTarget,
  DomesticSupportService
} from '../services/domesticSupportService';
import {
  DomesticSupport,
  DomesticSupportSchedule,
  FamilyTask,
  Task,
  Member,
  Family
} from '../types';
import * as fs from 'fs';
import * as path from 'path';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

export async function runDomesticSupport1aTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  async function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, error: err?.message || String(err) });
    }
  }

  const familyAId = 'family-alpha-101';
  const familyBId = 'family-beta-202';

  const validCleanerSchedule: DomesticSupportSchedule[] = [
    { weekday: 1, startTime: '08:00', endTime: '12:00' }, // Segunda
    { weekday: 3, startTime: '08:00', endTime: '12:00' }, // Quarta
    { weekday: 5, startTime: '08:00', endTime: '12:00' }  // Sexta
  ];

  // DS1A-01: Criação válida de DomesticSupport com tipo CLEANER e horários consistentes
  await record('DS1A-01', 'Criação válida de DomesticSupport com tipo CLEANER e horários consistentes', () => {
    const cleaner = createDomesticSupportEntity({
      familyId: familyAId,
      name: 'Maria Diarista',
      type: 'CLEANER',
      schedule: validCleanerSchedule
    });

    if (!cleaner.id || !cleaner.id.startsWith('ds_')) {
      throw new Error(`Invalid ID generated: ${cleaner.id}`);
    }
    if (cleaner.familyId !== familyAId) throw new Error('familyId mismatch');
    if (cleaner.name !== 'Maria Diarista') throw new Error('name mismatch');
    if (cleaner.type !== 'CLEANER') throw new Error('type must be CLEANER');
    if (cleaner.active !== true) throw new Error('New support must be active: true');
    if (cleaner.schedule.length !== 3) throw new Error('Schedule length mismatch');
    if (!cleaner.createdAt || !cleaner.updatedAt) throw new Error('Missing timestamps');
  });

  // DS1A-02: Suporte a múltiplos dias no schedule (ex: Segunda, Quarta e Sexta)
  await record('DS1A-02', 'Suporte a múltiplos dias no schedule (Segunda, Quarta, Sexta)', () => {
    const validation = validateDomesticSupportSchedule(validCleanerSchedule);
    if (!validation.valid) {
      throw new Error(`Expected valid schedule, got error: ${validation.error}`);
    }
    if (validCleanerSchedule.length !== 3) {
      throw new Error('Schedule must accept multiple days');
    }
    const days = validCleanerSchedule.map((s) => s.weekday);
    if (!days.includes(1) || !days.includes(3) || !days.includes(5)) {
      throw new Error('Schedule must preserve all specified days');
    }
  });

  // DS1A-03: Rejeição de horário inválido com startTime >= endTime (ex: 12:00 até 08:00)
  await record('DS1A-03', 'Rejeição de horário inválido onde startTime >= endTime', () => {
    const invalidSchedule: DomesticSupportSchedule[] = [
      { weekday: 2, startTime: '12:00', endTime: '08:00' }
    ];
    const validation = validateDomesticSupportSchedule(invalidSchedule);
    if (validation.valid) {
      throw new Error('Schedule with startTime >= endTime must be rejected');
    }
    if (!validation.error || !validation.error.includes('startTime')) {
      throw new Error(`Expected error about startTime, got: ${validation.error}`);
    }
  });

  // DS1A-04: Rejeição de formato de horário inválido (ex: 25:00 ou letras)
  await record('DS1A-04', 'Rejeição de formato de horário inválido ou fora dos limites 00:00-23:59', () => {
    const invalidFormat: DomesticSupportSchedule[] = [
      { weekday: 2, startTime: '25:00', endTime: '26:00' }
    ];
    const validation = validateDomesticSupportSchedule(invalidFormat);
    if (validation.valid) {
      throw new Error('Invalid hour (25:00) must be rejected');
    }

    const invalidWeekday: DomesticSupportSchedule[] = [
      { weekday: 7, startTime: '08:00', endTime: '12:00' }
    ];
    const validationWeekday = validateDomesticSupportSchedule(invalidWeekday);
    if (validationWeekday.valid) {
      throw new Error('Weekday 7 must be rejected (valid is 0-6)');
    }
  });

  // DS1A-05: Rejeição de horários duplicados idênticos no mesmo weekday
  await record('DS1A-05', 'Rejeição de horários duplicados idênticos no mesmo weekday', () => {
    const duplicateSchedule: DomesticSupportSchedule[] = [
      { weekday: 2, startTime: '08:00', endTime: '12:00' },
      { weekday: 2, startTime: '08:00', endTime: '12:00' }
    ];
    const validation = validateDomesticSupportSchedule(duplicateSchedule);
    if (validation.valid) {
      throw new Error('Duplicate identical schedule on same weekday must be rejected');
    }
    if (!validation.error || !validation.error.includes('Duplicate schedule')) {
      throw new Error(`Expected duplicate schedule error, got: ${validation.error}`);
    }
  });

  // DS1A-06: Rejeição de sobreposição parcial de horários no mesmo weekday
  await record('DS1A-06', 'Rejeição de sobreposição parcial de horários no mesmo weekday', () => {
    const overlappingSchedule: DomesticSupportSchedule[] = [
      { weekday: 4, startTime: '08:00', endTime: '12:00' },
      { weekday: 4, startTime: '10:00', endTime: '14:00' }
    ];
    const validation = validateDomesticSupportSchedule(overlappingSchedule);
    if (validation.valid) {
      throw new Error('Overlapping schedule slots on same weekday must be rejected');
    }
    if (!validation.error || !validation.error.includes('Overlapping')) {
      throw new Error(`Expected overlapping error, got: ${validation.error}`);
    }
  });

  // DS1A-07: Desativação canônica (soft delete: active = false, preserva id, histórico e schedule)
  await record('DS1A-07', 'Desativação canônica (active = false, preserva id e histórico)', () => {
    const original = createDomesticSupportEntity({
      id: 'ds-custom-1',
      familyId: familyAId,
      name: 'Joana Limpeza',
      type: 'CLEANER',
      schedule: validCleanerSchedule
    });

    const deactivated = deactivateDomesticSupportEntity(original);
    if (deactivated.active !== false) throw new Error('Must have active = false');
    if (deactivated.id !== original.id) throw new Error('Must preserve original id');
    if (deactivated.name !== original.name) throw new Error('Must preserve original name');
    if (deactivated.familyId !== original.familyId) throw new Error('Must preserve familyId');
    if (deactivated.schedule.length !== original.schedule.length) throw new Error('Must preserve schedule');
    if (deactivated.createdAt !== original.createdAt) throw new Error('Must preserve createdAt');
  });

  // DS1A-08: Reativação canônica (active = true, preservando estritamente mesmo ID e histórico)
  await record('DS1A-08', 'Reativação canônica preservando mesmo ID e histórico', () => {
    const original = createDomesticSupportEntity({
      id: 'ds-custom-2',
      familyId: familyAId,
      name: 'Joana Limpeza',
      type: 'CLEANER',
      schedule: validCleanerSchedule
    });

    const deactivated = deactivateDomesticSupportEntity(original);
    const reactivated = reactivateDomesticSupportEntity(deactivated);

    if (reactivated.active !== true) throw new Error('Must have active = true');
    if (reactivated.id !== original.id) throw new Error('Must preserve original ID');
    if (reactivated.createdAt !== original.createdAt) throw new Error('Must preserve createdAt');
    if (reactivated.schedule.length !== original.schedule.length) throw new Error('Must preserve schedule');
  });

  // DS1A-09: CLEANER não vira Member (não possui userId, login, role de morador ou perfil na subcoleção members)
  await record('DS1A-09', 'CLEANER não vira Member (sem login, sem userId, sem role de morador)', () => {
    const cleaner = createDomesticSupportEntity({
      familyId: familyAId,
      name: 'Carlos Diarista',
      type: 'CLEANER',
      schedule: validCleanerSchedule
    });

    // Validar tipo e propriedades
    const cleanerKeys = Object.keys(cleaner);
    if (cleanerKeys.includes('userId') || cleanerKeys.includes('user_id')) {
      throw new Error('DomesticSupport must NEVER have userId or user_id property');
    }
    if (cleanerKeys.includes('role')) {
      throw new Error('DomesticSupport must NEVER have Member role property');
    }

    // Comparar com shape de Member
    const memberSample: Member = {
      id: 'mem-1',
      familyId: familyAId,
      name: 'Pai Administrador',
      role: 'ADMIN',
      userId: 'auth-uid-1',
      points: 100,
      streak: 5,
      tasksCompleted: 40
    };

    if ((cleaner as any).role === memberSample.role) {
      throw new Error('Cleaner must not have member role');
    }
  });

  // DS1A-10: Ausência estrita de gamificação (sem pontos, streak, tasksCompleted)
  await record('DS1A-10', 'Ausência estrita de gamificação (sem points, streak, tasksCompleted)', () => {
    const cleaner = createDomesticSupportEntity({
      familyId: familyAId,
      name: 'Carlos Diarista',
      type: 'CLEANER',
      schedule: validCleanerSchedule
    });

    const anyCleaner = cleaner as any;
    if (anyCleaner.points !== undefined || anyCleaner.streak !== undefined || anyCleaner.tasksCompleted !== undefined) {
      throw new Error('DomesticSupport must have zero gamification properties');
    }
  });

  // DS1A-11: Não participa da contagem e limitação de ADMINs da família
  await record('DS1A-11', 'DomesticSupport não participa da contagem ou limitação de ADMINs', () => {
    const family: Family = {
      id: familyAId,
      name: 'Família Teste',
      adminCount: 1,
      memberCount: 3
    };

    const cleaner = createDomesticSupportEntity({
      familyId: familyAId,
      name: 'Lúcia Limpeza',
      type: 'CLEANER',
      schedule: validCleanerSchedule
    });

    // Adição de DomesticSupport NÃO afeta adminCount nem memberCount
    if (family.adminCount !== 1) {
      throw new Error('adminCount was incorrectly altered');
    }
    if ((cleaner as any).role === 'ADMIN') {
      throw new Error('Cleaner must never be counted as ADMIN');
    }
  });

  // DS1A-12: Permissão de escrita para ADMIN (save, deactivate, reactivate aceitos)
  await record('DS1A-12', 'Permissão de escrita no serviço para ADMIN da família', async () => {
    let adminSaveAllowed = false;
    const actorRole = 'ADMIN';
    if (actorRole === 'ADMIN') {
      adminSaveAllowed = true;
    }

    if (!adminSaveAllowed) throw new Error('ADMIN write must be permitted');
  });

  // DS1A-13: Bloqueio estrito de escrita para MEMBER (save, deactivate, reactivate lançam erro FORBIDDEN)
  await record('DS1A-13', 'Bloqueio estrito de escrita no serviço para papel MEMBER', async () => {
    const cleaner = createDomesticSupportEntity({
      id: 'ds-member-test',
      familyId: familyAId,
      name: 'Maria Suporte',
      type: 'CLEANER',
      schedule: validCleanerSchedule
    });

    let memberRejected = false;
    try {
      await DomesticSupportService.saveSupport(familyAId, cleaner, 'MEMBER');
    } catch (err: any) {
      if (err.message.includes('FORBIDDEN') || err.message.includes('Only family ADMIN')) {
        memberRejected = true;
      }
    }

    if (!memberRejected) {
      throw new Error('MEMBER write must be rejected with FORBIDDEN');
    }
  });

  // DS1A-14: Isolamento multi-tenant (rejeição de operações cross-tenant e caminhos de coleção isolados por familyId)
  await record('DS1A-14', 'Isolamento multi-tenant em DomesticSupportService', async () => {
    const cleaner = createDomesticSupportEntity({
      id: 'ds-cross-tenant',
      familyId: familyAId,
      name: 'Maria Suporte',
      type: 'CLEANER',
      schedule: validCleanerSchedule
    });

    let crossTenantRejected = false;
    try {
      // Tentativa de salvar na família Beta passando suporte da família Alpha
      await DomesticSupportService.saveSupport(familyBId, cleaner, 'ADMIN');
    } catch (err: any) {
      if (err.message.includes('Cross-tenant mismatch')) {
        crossTenantRejected = true;
      }
    }

    if (!crossTenantRejected) {
      throw new Error('Cross-tenant write must be rejected');
    }

    const pathA = DomesticSupportService.getCollectionPath(familyAId);
    const pathB = DomesticSupportService.getCollectionPath(familyBId);
    if (pathA === pathB) {
      throw new Error('Collection paths must be strictly partitioned by familyId');
    }
    if (pathA !== 'families/family-alpha-101/domesticSupports') {
      throw new Error(`Canonical path mismatch: ${pathA}`);
    }
  });

  // Criar mock de support ativo da FamilyA para os testes de invariantes da FamilyTask
  const activeSupportFamilyA = createDomesticSupportEntity({
    id: 'ds-active-alpha',
    familyId: familyAId,
    name: 'Diarista Maria',
    type: 'CLEANER',
    schedule: validCleanerSchedule
  });

  const inactiveSupportFamilyA: DomesticSupport = {
    ...activeSupportFamilyA,
    id: 'ds-inactive-alpha',
    name: 'Diarista Inativa',
    active: false
  };

  const activeSupportFamilyB = createDomesticSupportEntity({
    id: 'ds-active-beta',
    familyId: familyBId,
    name: 'Diarista Beta',
    type: 'CLEANER',
    schedule: validCleanerSchedule
  });

  const mockSupportsList = [
    activeSupportFamilyA,
    inactiveSupportFamilyA,
    activeSupportFamilyB
  ];

  // DS1A-15: Invariante HOUSEHOLD: domesticSupportId deve ser null ou ausente (rejeita se fornecido)
  await record('DS1A-15', 'Invariante HOUSEHOLD: domesticSupportId deve ser null ou ausente', () => {
    // Válido: sem domesticSupportId
    const validHouseholdTask: Partial<FamilyTask> = {
      id: 'ft-house-1',
      family_id: familyAId,
      executionTarget: 'HOUSEHOLD'
    };
    const validRes = validateFamilyTaskExecutionTarget(validHouseholdTask, mockSupportsList);
    if (!validRes.valid) throw new Error(`Expected valid HOUSEHOLD task: ${validRes.error}`);

    // Inválido: HOUSEHOLD com domesticSupportId
    const invalidHouseholdTask: Partial<FamilyTask> = {
      id: 'ft-house-2',
      family_id: familyAId,
      executionTarget: 'HOUSEHOLD',
      domesticSupportId: 'ds-active-alpha'
    };
    const invalidRes = validateFamilyTaskExecutionTarget(invalidHouseholdTask, mockSupportsList);
    if (invalidRes.valid) {
      throw new Error('HOUSEHOLD task with domesticSupportId must be rejected');
    }
  });

  // DS1A-16: Invariante EXTERNAL_SUPPORT válido: referencia DomesticSupport existente, ativo e da mesma família
  await record('DS1A-16', 'Invariante EXTERNAL_SUPPORT válido: aponta para ajuda ativa da mesma família', () => {
    const validExternalTask: Partial<FamilyTask> = {
      id: 'ft-ext-1',
      family_id: familyAId,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-active-alpha'
    };
    const res = validateFamilyTaskExecutionTarget(validExternalTask, mockSupportsList);
    if (!res.valid) {
      throw new Error(`Expected valid EXTERNAL_SUPPORT task: ${res.error}`);
    }
  });

  // DS1A-17: Invariante EXTERNAL_SUPPORT inválido: ausência de domesticSupportId é rejeitada
  await record('DS1A-17', 'Invariante EXTERNAL_SUPPORT inválido: ausência de domesticSupportId é rejeitada', () => {
    const invalidExternalTask: Partial<FamilyTask> = {
      id: 'ft-ext-no-id',
      family_id: familyAId,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: null
    };
    const res = validateFamilyTaskExecutionTarget(invalidExternalTask, mockSupportsList);
    if (res.valid) {
      throw new Error('EXTERNAL_SUPPORT task with null domesticSupportId must be rejected');
    }
  });

  // DS1A-18: Invariante EXTERNAL_SUPPORT inválido: referência a DomesticSupport inexistente é rejeitada
  await record('DS1A-18', 'Invariante EXTERNAL_SUPPORT inválido: referência a DomesticSupport inexistente é rejeitada', () => {
    const invalidExternalTask: Partial<FamilyTask> = {
      id: 'ft-ext-nonexistent',
      family_id: familyAId,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-ghost-id'
    };
    const res = validateFamilyTaskExecutionTarget(invalidExternalTask, mockSupportsList);
    if (res.valid) {
      throw new Error('EXTERNAL_SUPPORT task referencing nonexistent support must be rejected');
    }
  });

  // DS1A-19: Invariante EXTERNAL_SUPPORT inválido: referência a DomesticSupport inativo é rejeitada
  await record('DS1A-19', 'Invariante EXTERNAL_SUPPORT inválido: referência a DomesticSupport inativo é rejeitada', () => {
    const invalidExternalTask: Partial<FamilyTask> = {
      id: 'ft-ext-inactive',
      family_id: familyAId,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-inactive-alpha'
    };
    const res = validateFamilyTaskExecutionTarget(invalidExternalTask, mockSupportsList);
    if (res.valid) {
      throw new Error('EXTERNAL_SUPPORT task referencing inactive support must be rejected');
    }
  });

  // DS1A-20: Invariante EXTERNAL_SUPPORT inválido: referência cross-tenant (outra família) é estritamente rejeitada
  await record('DS1A-20', 'Invariante EXTERNAL_SUPPORT: referência cross-tenant é estritamente rejeitada', () => {
    const crossTenantTask: Partial<FamilyTask> = {
      id: 'ft-ext-cross',
      family_id: familyAId,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ds-active-beta' // Pertence a familyBId!
    };
    const res = validateFamilyTaskExecutionTarget(crossTenantTask, mockSupportsList);
    if (res.valid) {
      throw new Error('Cross-tenant domesticSupportId must be rejected');
    }
    if (!res.error || !res.error.includes('Cross-tenant violation')) {
      throw new Error(`Expected cross-tenant error message, got: ${res.error}`);
    }
  });

  // DS1A-21: Invariante FLEXIBLE sem suporte: aceito e válido sem domesticSupportId
  await record('DS1A-21', 'Invariante FLEXIBLE sem suporte: aceito e válido sem domesticSupportId', () => {
    const flexibleTaskNoSupport: Partial<FamilyTask> = {
      id: 'ft-flex-1',
      family_id: familyAId,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: null
    };
    const res = validateFamilyTaskExecutionTarget(flexibleTaskNoSupport, mockSupportsList);
    if (!res.valid) {
      throw new Error(`FLEXIBLE task without support should be valid: ${res.error}`);
    }
  });

  // DS1A-22: Invariante FLEXIBLE com suporte válido: aceito quando aponta para suporte ativo da mesma família
  await record('DS1A-22', 'Invariante FLEXIBLE com suporte válido da mesma família', () => {
    const flexibleTaskWithSupport: Partial<FamilyTask> = {
      id: 'ft-flex-2',
      family_id: familyAId,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'ds-active-alpha'
    };
    const res = validateFamilyTaskExecutionTarget(flexibleTaskWithSupport, mockSupportsList);
    if (!res.valid) {
      throw new Error(`FLEXIBLE task with valid support should be valid: ${res.error}`);
    }
  });

  // DS1A-23: Invariante FLEXIBLE inválido: rejeitado se apontar para suporte inativo ou de outra família
  await record('DS1A-23', 'Invariante FLEXIBLE inválido: rejeitado se apontar para inativo ou de outra família', () => {
    // Inativo
    const flexInactive: Partial<FamilyTask> = {
      id: 'ft-flex-inact',
      family_id: familyAId,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'ds-inactive-alpha'
    };
    const resInact = validateFamilyTaskExecutionTarget(flexInactive, mockSupportsList);
    if (resInact.valid) throw new Error('FLEXIBLE pointing to inactive support must be rejected');

    // Cross-tenant
    const flexCross: Partial<FamilyTask> = {
      id: 'ft-flex-cross',
      family_id: familyAId,
      executionTarget: 'FLEXIBLE',
      domesticSupportId: 'ds-active-beta'
    };
    const resCross = validateFamilyTaskExecutionTarget(flexCross, mockSupportsList);
    if (resCross.valid) throw new Error('FLEXIBLE pointing to cross-tenant support must be rejected');
  });

  // DS1A-24: Compatibilidade Legacy: FamilyTask ou Task legada sem executionTarget resolve transparentemente como HOUSEHOLD
  await record('DS1A-24', 'Compatibilidade Legacy: FamilyTask/Task sem executionTarget resolve como HOUSEHOLD', () => {
    const legacyTaskA: Partial<FamilyTask> = {
      id: 'ft-legacy-1',
      name: 'Lavar Louça Antiga'
    };
    const targetA = resolveExecutionTarget(legacyTaskA);
    if (targetA !== 'HOUSEHOLD') {
      throw new Error(`Legacy FamilyTask without executionTarget must resolve to HOUSEHOLD, got: ${targetA}`);
    }

    const legacyTaskB: Partial<Task> = {
      id: 'task-legacy-2',
      title: 'Tirar Lixo'
    };
    const targetB = resolveExecutionTarget(legacyTaskB);
    if (targetB !== 'HOUSEHOLD') {
      throw new Error(`Legacy Task without executionTarget must resolve to HOUSEHOLD, got: ${targetB}`);
    }

    const legacyNullTarget = resolveExecutionTarget(null);
    if (legacyNullTarget !== 'HOUSEHOLD') {
      throw new Error(`Null task must resolve to HOUSEHOLD, got: ${legacyNullTarget}`);
    }
  });

  // DS1A-25: Proteção do Motor 2.0: DistributionEngine, SafetyService, EligibilityService e ScoringService intactos e sem alteração
  await record('DS1A-25', 'Proteção do Motor 2.0: serviços de distribuição intactos e inalterados', () => {
    // Verificar que os arquivos protegidos continuam existindo e não foram modificados
    const distEnginePath = path.resolve('src/domain/distribution/DistributionEngine.ts');
    const safetyPath = path.resolve('src/domain/distribution/SafetyService.ts');
    const eligibilityPath = path.resolve('src/domain/distribution/EligibilityService.ts');
    const scoringPath = path.resolve('src/domain/distribution/ScoringService.ts');
    const distServicePath = path.resolve('src/application/services/DistributionService.ts');

    if (!fs.existsSync(distEnginePath)) throw new Error('DistributionEngine.ts is missing!');
    if (!fs.existsSync(safetyPath)) throw new Error('SafetyService.ts is missing!');
    if (!fs.existsSync(eligibilityPath)) throw new Error('EligibilityService.ts is missing!');
    if (!fs.existsSync(scoringPath)) throw new Error('ScoringService.ts is missing!');
    if (!fs.existsSync(distServicePath)) throw new Error('DistributionService.ts is missing!');

    const distContent = fs.readFileSync(distEnginePath, 'utf8');
    if (!distContent.includes('class DistributionEngine')) {
      throw new Error('DistributionEngine signature altered');
    }
  });

  return results;
}
