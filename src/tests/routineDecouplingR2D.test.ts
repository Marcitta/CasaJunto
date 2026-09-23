/**
 * CasaJunto — routineDecouplingR2D.test.ts
 * HOTFIX-TASK-CREATE-1-R2D: Separate Routine Generation from Distribution
 * 
 * Regra Oficial de Produto:
 * CRIAR TAREFA ≠ DISTRIBUIR ≠ EQUILIBRAR CARGA.
 * 
 * Testes (TC-R2D-01 a TC-R2D-20):
 * TC-R2D-01: syncRoutineOccurrences gera ocorrências para rotinas ativas no horizonte de 15 dias.
 * TC-R2D-02: syncRoutineOccurrences NÃO executa DistributionService nem Motor 2.0.
 * TC-R2D-03: syncRoutineOccurrences gera ocorrências desatribuídas (is_unassigned: true, member_id: '').
 * TC-R2D-04: syncRoutineOccurrences preserva ocorrências existentes sem sobrescrever.
 * TC-R2D-05: syncRoutineOccurrences preserva status e membros já atribuídos.
 * TC-R2D-06: syncRoutineOccurrences cancela ocorrências futuras pendentes de rotinas inativas (active=false) sem alterar histórico concluído.
 * TC-R2D-07: syncRoutineOccurrences gera IDs determinísticos no padrão ${family_task_id}_${date}.
 * TC-R2D-08: distributeEligibleOccurrences distribui ocorrências desatribuídas para Hoje/Amanhã usando Motor 2.0.
 * TC-R2D-09: distributeEligibleOccurrences restringe distribuição ao escopo alvo; dias 3 a 15 continuam desatribuídos.
 * TC-R2D-10: distributeEligibleOccurrences não reatribui tarefas já atribuídas (estabilidade).
 * TC-R2D-11: distributeEligibleOccurrences nunca altera tarefas COMPLETED / DONE.
 * TC-R2D-12: Criação de rotina não dispara distribuição implícita.
 * TC-R2D-13: Criação de rotina DAILY gera 15 ocorrências, todas desatribuídas.
 * TC-R2D-14: Criação de tarefa ONE_TIME gera 1 ocorrência desatribuída sem redistribuir outras tarefas.
 * TC-R2D-15: Cenário R2C: 4 tarefas desatribuídas + criação da 5ª tarefa mantém TODAS as 5 tarefas desatribuídas.
 * TC-R2D-16: syncRollingRoutines mantém retrocompatibilidade executando geração e distribuição quando membros são fornecidos.
 * TC-R2D-17: Hidratação usa syncRoutineOccurrences sem disparar redistribuição no F5/recarregamento.
 * TC-R2D-18: batchAddRoutines gera ocorrências sem redistribuir a carga da família.
 * TC-R2D-19: Rebalanceamento explícito via DistributionService.executeRebalance continua funcionando normalmente sob comando explícito.
 * TC-R2D-20: Atribuições pré-existentes da família (inclusive do incidente R2C) não são alteradas ou resetadas na sincronização de rotinas.
 */

import {
  RoutineContinuityService,
  SyncRoutineOccurrencesParams,
  DistributeEligibleOccurrencesParams
} from '../application/services/RoutineContinuityService';
import { DistributionService } from '../application/services/DistributionService';
import { DistributionEngine } from '../domain/distribution';
import {
  Family,
  FamilyTask,
  TaskAssignment,
  Member,
  ProtectedTime
} from '../types';
import { getFamilyLocalDate, addDaysToDate, getRollingDateHorizon } from '../domain/utils/dateTimeUtils';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
}

const mockFamily: Family = {
  id: 'fam-croce-2026',
  name: 'Casa Croce',
  code: 'CROCE26',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  timezone: 'America/Sao_Paulo'
};

const mockMembers: Member[] = [
  {
    id: 'usr-marcia',
    familyId: 'fam-croce-2026',
    name: 'Marcia',
    role: 'ADMIN',
    active: true
  },
  {
    id: 'usr-matheus',
    familyId: 'fam-croce-2026',
    name: 'Matheus',
    role: 'MEMBER',
    active: true
  },
  {
    id: 'usr-daniel',
    familyId: 'fam-croce-2026',
    name: 'Daniel',
    role: 'MEMBER',
    active: true
  }
];

const mockProtectedTimes: ProtectedTime[] = [];

export async function runRoutineDecouplingR2DTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const assert = (id: string, name: string, condition: boolean, errorDetail?: string) => {
    results.push({
      id,
      name,
      passed: Boolean(condition),
      error: condition ? undefined : (errorDetail || 'Falha na asserção')
    });
  };

  const today = getFamilyLocalDate(mockFamily.timezone);
  const tomorrow = addDaysToDate(today, 1);
  const horizonDates = getRollingDateHorizon(today, 15);

  // =========================================================================
  // TC-R2D-01: syncRoutineOccurrences gera ocorrências para rotinas ativas no horizonte de 15 dias
  // =========================================================================
  try {
    const routine: FamilyTask = {
      id: 'ft-r2d-01',
      family_id: mockFamily.id,
      customTitle: 'Lavar Louça',
      room_id: 'cozinha',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [routine],
      existingAssignments: [],
      isDemoMode: true
    });

    const datesCovered = new Set(res.allAssignments.map(a => a.scheduled_date));
    const all15Covered = horizonDates.every(d => datesCovered.has(d));
    assert(
      'TC-R2D-01',
      'syncRoutineOccurrences gera ocorrências para rotinas ativas no horizonte de 15 dias',
      res.allAssignments.length === 15 && all15Covered,
      `Esperado 15 ocorrências, obtido ${res.allAssignments.length}`
    );
  } catch (err: any) {
    assert('TC-R2D-01', 'syncRoutineOccurrences gera ocorrências para rotinas ativas', false, err.message);
  }

  // =========================================================================
  // TC-R2D-02: syncRoutineOccurrences NÃO executa DistributionService nem Motor 2.0
  // =========================================================================
  try {
    let rebalanceCalled = false;
    const origRebalance = DistributionService.executeRebalance;
    (DistributionService as any).executeRebalance = () => {
      rebalanceCalled = true;
      throw new Error('DistributionService.executeRebalance NÃO deveria ser chamado em syncRoutineOccurrences');
    };

    try {
      const routine: FamilyTask = {
        id: 'ft-r2d-02',
        family_id: mockFamily.id,
        customTitle: 'Tirar Lixo',
        room_id: 'cozinha',
        frequency: 'DAILY',
        preferred_days: [0, 1, 2, 3, 4, 5, 6],
        active: true,
        start_date: today
      };

      await RoutineContinuityService.syncRoutineOccurrences({
        family: mockFamily,
        routines: [routine],
        existingAssignments: [],
        isDemoMode: true
      });

      assert(
        'TC-R2D-02',
        'syncRoutineOccurrences NÃO executa DistributionService nem Motor 2.0',
        !rebalanceCalled,
        'DistributionService foi chamado indevidamente durante a geração de ocorrências'
      );
    } finally {
      (DistributionService as any).executeRebalance = origRebalance;
    }
  } catch (err: any) {
    assert('TC-R2D-02', 'syncRoutineOccurrences não executa DistributionService', false, err.message);
  }

  // =========================================================================
  // TC-R2D-03: syncRoutineOccurrences gera ocorrências desatribuídas (is_unassigned: true, member_id: '')
  // =========================================================================
  try {
    const routine: FamilyTask = {
      id: 'ft-r2d-03',
      family_id: mockFamily.id,
      customTitle: 'Limpar Banheiro',
      room_id: 'banheiro',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [routine],
      existingAssignments: [],
      isDemoMode: true
    });

    const allUnassigned = res.allAssignments.every(a => a.is_unassigned === true && (!a.member_id || a.member_id === ''));
    assert(
      'TC-R2D-03',
      'syncRoutineOccurrences gera ocorrências desatribuídas (is_unassigned: true, member_id: "")',
      res.allAssignments.length > 0 && allUnassigned,
      'Alguma ocorrência gerada foi indevidamente atribuída a um membro'
    );
  } catch (err: any) {
    assert('TC-R2D-03', 'syncRoutineOccurrences gera ocorrências desatribuídas', false, err.message);
  }

  // =========================================================================
  // TC-R2D-04: syncRoutineOccurrences preserva ocorrências existentes sem sobrescrever
  // =========================================================================
  try {
    const routine: FamilyTask = {
      id: 'ft-r2d-04',
      family_id: mockFamily.id,
      customTitle: 'Regar Plantas',
      room_id: 'jardim',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const existingOccurrence: TaskAssignment = {
      id: `${routine.id}_${today}`,
      family_id: mockFamily.id,
      task_id: routine.id,
      family_task_id: routine.id,
      room_id: 'jardim',
      member_id: 'usr-matheus',
      scheduled_date: today,
      scheduled_start: '10:00',
      scheduled_end: '10:30',
      status: 'SCHEDULED',
      is_unassigned: false,
      assigned_reason: 'Atribuição prévia manual'
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [routine],
      existingAssignments: [existingOccurrence],
      isDemoMode: true
    });

    const todayOcc = res.allAssignments.find(a => a.id === existingOccurrence.id);
    const preserved = Boolean(
      todayOcc &&
      todayOcc.member_id === 'usr-matheus' &&
      todayOcc.is_unassigned === false &&
      todayOcc.assigned_reason === 'Atribuição prévia manual'
    );

    assert(
      'TC-R2D-04',
      'syncRoutineOccurrences preserva ocorrências existentes sem sobrescrever',
      preserved,
      'Ocorrência pré-existente foi sobrescrita ou teve seus dados alterados'
    );
  } catch (err: any) {
    assert('TC-R2D-04', 'syncRoutineOccurrences preserva ocorrências existentes', false, err.message);
  }

  // =========================================================================
  // TC-R2D-05: syncRoutineOccurrences preserva status e membros já atribuídos
  // =========================================================================
  try {
    const routine: FamilyTask = {
      id: 'ft-r2d-05',
      family_id: mockFamily.id,
      customTitle: 'Organizar Despensa',
      room_id: 'cozinha',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const completedOccurrence: TaskAssignment = {
      id: `${routine.id}_${today}`,
      family_id: mockFamily.id,
      task_id: routine.id,
      family_task_id: routine.id,
      room_id: 'cozinha',
      member_id: 'usr-marcia',
      scheduled_date: today,
      scheduled_start: '08:00',
      scheduled_end: '08:30',
      status: 'COMPLETED',
      is_unassigned: false,
      completed_at: '2026-03-30T08:25:00Z',
      completed_by: 'usr-marcia',
      completed_by_name: 'Marcia'
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [routine],
      existingAssignments: [completedOccurrence],
      isDemoMode: true
    });

    const found = res.allAssignments.find(a => a.id === completedOccurrence.id);
    const perfectlyPreserved = Boolean(
      found &&
      found.status === 'COMPLETED' &&
      found.member_id === 'usr-marcia' &&
      found.completed_by === 'usr-marcia'
    );

    assert(
      'TC-R2D-05',
      'syncRoutineOccurrences preserva status e membros já atribuídos',
      perfectlyPreserved,
      'Status COMPLETED ou membro atribuído foi revertido'
    );
  } catch (err: any) {
    assert('TC-R2D-05', 'syncRoutineOccurrences preserva status e membros', false, err.message);
  }

  // =========================================================================
  // TC-R2D-06: syncRoutineOccurrences cancela ocorrências futuras pendentes de rotinas inativas sem alterar concluídas
  // =========================================================================
  try {
    const inactiveRoutine: FamilyTask = {
      id: 'ft-r2d-06',
      family_id: mockFamily.id,
      customTitle: 'Pintar Parede',
      room_id: 'sala',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: false, // INATIVA
      start_date: today
    };

    const completedPastOcc: TaskAssignment = {
      id: `${inactiveRoutine.id}_past`,
      family_id: mockFamily.id,
      task_id: inactiveRoutine.id,
      family_task_id: inactiveRoutine.id,
      room_id: 'sala',
      member_id: 'usr-daniel',
      scheduled_date: today,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'COMPLETED',
      is_unassigned: false
    };

    const pendingFutureOcc: TaskAssignment = {
      id: `${inactiveRoutine.id}_${tomorrow}`,
      family_id: mockFamily.id,
      task_id: inactiveRoutine.id,
      family_task_id: inactiveRoutine.id,
      room_id: 'sala',
      member_id: 'usr-daniel',
      scheduled_date: tomorrow,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: false
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [inactiveRoutine],
      existingAssignments: [completedPastOcc, pendingFutureOcc],
      isDemoMode: true
    });

    const past = res.allAssignments.find(a => a.id === completedPastOcc.id);
    const future = res.allAssignments.find(a => a.id === pendingFutureOcc.id);

    const validCancellation = past?.status === 'COMPLETED' && future?.status === 'CANCELLED';
    assert(
      'TC-R2D-06',
      'syncRoutineOccurrences cancela ocorrências futuras pendentes de rotinas inativas sem alterar histórico concluído',
      Boolean(validCancellation),
      `Status obtidos: past=${past?.status}, future=${future?.status}`
    );
  } catch (err: any) {
    assert('TC-R2D-06', 'syncRoutineOccurrences cancelamento de inativas', false, err.message);
  }

  // =========================================================================
  // TC-R2D-07: syncRoutineOccurrences gera IDs determinísticos no padrão ${family_task_id}_${date}
  // =========================================================================
  try {
    const routine: FamilyTask = {
      id: 'ft-r2d-07',
      family_id: mockFamily.id,
      customTitle: 'Varrer Corredor',
      room_id: 'corredor',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [routine],
      existingAssignments: [],
      isDemoMode: true
    });

    const allDeterministic = res.allAssignments.every(a => a.id === `${routine.id}_${a.scheduled_date}`);
    assert(
      'TC-R2D-07',
      'syncRoutineOccurrences gera IDs determinísticos no padrão ${family_task_id}_${date}',
      allDeterministic && res.allAssignments.length === 15,
      'IDs de ocorrências não seguem o padrão canônico determinístico'
    );
  } catch (err: any) {
    assert('TC-R2D-07', 'syncRoutineOccurrences IDs determinísticos', false, err.message);
  }

  // =========================================================================
  // TC-R2D-08: distributeEligibleOccurrences distribui ocorrências desatribuídas para Hoje/Amanhã usando Motor 2.0
  // =========================================================================
  try {
    const occToday: TaskAssignment = {
      id: `occ-dist-today`,
      family_id: mockFamily.id,
      task_id: 'ft-dist-1',
      family_task_id: 'ft-dist-1',
      room_id: 'cozinha',
      member_id: '',
      scheduled_date: today,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const occTomorrow: TaskAssignment = {
      id: `occ-dist-tomorrow`,
      family_id: mockFamily.id,
      task_id: 'ft-dist-1',
      family_task_id: 'ft-dist-1',
      room_id: 'cozinha',
      member_id: '',
      scheduled_date: tomorrow,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const distRes = await RoutineContinuityService.distributeEligibleOccurrences({
      family: mockFamily,
      assignments: [occToday, occTomorrow],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });

    const todayDistributed = distRes.allAssignments.find(a => a.id === occToday.id);
    const tomorrowDistributed = distRes.allAssignments.find(a => a.id === occTomorrow.id);

    const bothAssigned = Boolean(
      todayDistributed && !todayDistributed.is_unassigned && todayDistributed.member_id &&
      tomorrowDistributed && !tomorrowDistributed.is_unassigned && tomorrowDistributed.member_id
    );

    assert(
      'TC-R2D-08',
      'distributeEligibleOccurrences distribui ocorrências desatribuídas para Hoje/Amanhã usando Motor 2.0',
      bothAssigned,
      'Ocorrências de Hoje/Amanhã não foram distribuídas por distributeEligibleOccurrences'
    );
  } catch (err: any) {
    assert('TC-R2D-08', 'distributeEligibleOccurrences distribui Hoje/Amanhã', false, err.message);
  }

  // =========================================================================
  // TC-R2D-09: distributeEligibleOccurrences restringe distribuição ao escopo alvo; dias 3 a 15 continuam desatribuídos
  // =========================================================================
  try {
    const day3 = addDaysToDate(today, 2);
    const day10 = addDaysToDate(today, 9);

    const occToday: TaskAssignment = {
      id: `occ-scope-today`,
      family_id: mockFamily.id,
      task_id: 'ft-scope-1',
      family_task_id: 'ft-scope-1',
      room_id: 'sala',
      member_id: '',
      scheduled_date: today,
      scheduled_start: '10:00',
      scheduled_end: '10:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const occDay3: TaskAssignment = {
      id: `occ-scope-day3`,
      family_id: mockFamily.id,
      task_id: 'ft-scope-1',
      family_task_id: 'ft-scope-1',
      room_id: 'sala',
      member_id: '',
      scheduled_date: day3,
      scheduled_start: '10:00',
      scheduled_end: '10:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const occDay10: TaskAssignment = {
      id: `occ-scope-day10`,
      family_id: mockFamily.id,
      task_id: 'ft-scope-1',
      family_task_id: 'ft-scope-1',
      room_id: 'sala',
      member_id: '',
      scheduled_date: day10,
      scheduled_start: '10:00',
      scheduled_end: '10:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const distRes = await RoutineContinuityService.distributeEligibleOccurrences({
      family: mockFamily,
      assignments: [occToday, occDay3, occDay10],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });

    const day3After = distRes.allAssignments.find(a => a.id === occDay3.id);
    const day10After = distRes.allAssignments.find(a => a.id === occDay10.id);

    const days3And10Unassigned = Boolean(
      day3After?.is_unassigned === true && (!day3After?.member_id) &&
      day10After?.is_unassigned === true && (!day10After?.member_id)
    );

    assert(
      'TC-R2D-09',
      'distributeEligibleOccurrences restringe distribuição ao escopo alvo; dias 3 a 15 continuam desatribuídos',
      days3And10Unassigned,
      'Tarefas dos dias 3 ou 10 foram indevidamente distribuídas'
    );
  } catch (err: any) {
    assert('TC-R2D-09', 'distributeEligibleOccurrences escopo temporal restrito', false, err.message);
  }

  // =========================================================================
  // TC-R2D-10: distributeEligibleOccurrences não reatribui tarefas já atribuídas (estabilidade)
  // =========================================================================
  try {
    const alreadyAssigned: TaskAssignment = {
      id: `occ-stable-today`,
      family_id: mockFamily.id,
      task_id: 'ft-stable-1',
      family_task_id: 'ft-stable-1',
      room_id: 'cozinha',
      member_id: 'usr-matheus',
      scheduled_date: today,
      scheduled_start: '14:00',
      scheduled_end: '14:30',
      status: 'SCHEDULED',
      is_unassigned: false,
      assigned_reason: 'Atribuição original preservada'
    };

    const distRes = await RoutineContinuityService.distributeEligibleOccurrences({
      family: mockFamily,
      assignments: [alreadyAssigned],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });

    const after = distRes.allAssignments.find(a => a.id === alreadyAssigned.id);
    const preserved = Boolean(
      after &&
      after.member_id === 'usr-matheus' &&
      after.is_unassigned === false &&
      distRes.updatedAssignments.length === 0
    );

    assert(
      'TC-R2D-10',
      'distributeEligibleOccurrences não reatribui tarefas já atribuídas (estabilidade)',
      preserved,
      'Tarefa estável foi modificada ou reatribuída'
    );
  } catch (err: any) {
    assert('TC-R2D-10', 'distributeEligibleOccurrences estabilidade', false, err.message);
  }

  // =========================================================================
  // TC-R2D-11: distributeEligibleOccurrences nunca altera tarefas COMPLETED / DONE
  // =========================================================================
  try {
    const completedTask: TaskAssignment = {
      id: `occ-completed-today`,
      family_id: mockFamily.id,
      task_id: 'ft-done-1',
      family_task_id: 'ft-done-1',
      room_id: 'sala',
      member_id: 'usr-marcia',
      scheduled_date: today,
      scheduled_start: '08:00',
      scheduled_end: '08:30',
      status: 'COMPLETED',
      is_unassigned: false,
      completed_at: '2026-03-30T08:15:00Z',
      completed_by: 'usr-marcia'
    };

    const distRes = await RoutineContinuityService.distributeEligibleOccurrences({
      family: mockFamily,
      assignments: [completedTask],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });

    const after = distRes.allAssignments.find(a => a.id === completedTask.id);
    const untampered = Boolean(
      after &&
      after.status === 'COMPLETED' &&
      after.member_id === 'usr-marcia' &&
      distRes.updatedAssignments.length === 0
    );

    assert(
      'TC-R2D-11',
      'distributeEligibleOccurrences nunca altera tarefas COMPLETED / DONE',
      untampered,
      'Tarefa COMPLETED foi adulterada pela distribuição'
    );
  } catch (err: any) {
    assert('TC-R2D-11', 'distributeEligibleOccurrences tarefas concluídas intocadas', false, err.message);
  }

  // =========================================================================
  // TC-R2D-12: Criação de rotina não dispara distribuição implícita
  // =========================================================================
  try {
    const newRoutine: FamilyTask = {
      id: 'ft-r2d-12',
      family_id: mockFamily.id,
      customTitle: 'Cuidar do Aquário',
      room_id: 'sala',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    // Chamada pura de geração como ocorre ao criar rotina
    const syncRes = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [newRoutine],
      existingAssignments: [],
      isDemoMode: true
    });

    const anyAssigned = syncRes.allAssignments.some(a => !a.is_unassigned || Boolean(a.member_id));
    assert(
      'TC-R2D-12',
      'Criação de rotina não dispara distribuição implícita',
      !anyAssigned && syncRes.allAssignments.length === 15,
      'Ocorrências da nova rotina foram atribuídas automaticamente sem ordem explícita'
    );
  } catch (err: any) {
    assert('TC-R2D-12', 'Criação de rotina sem distribuição implícita', false, err.message);
  }

  // =========================================================================
  // TC-R2D-13: Criação de rotina DAILY gera 15 ocorrências, todas desatribuídas
  // =========================================================================
  try {
    const routine: FamilyTask = {
      id: 'ft-r2d-13',
      family_id: mockFamily.id,
      customTitle: 'Trocar Água dos Bichos',
      room_id: 'geral',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [routine],
      existingAssignments: [],
      isDemoMode: true
    });

    const isCount15 = res.allAssignments.length === 15;
    const allUnassigned = res.allAssignments.every(a => a.is_unassigned === true && (!a.member_id || a.member_id === ''));

    assert(
      'TC-R2D-13',
      'Criação de rotina DAILY gera 15 ocorrências, todas desatribuídas',
      isCount15 && allUnassigned,
      `Esperado 15 desatribuídas, obtido: total=${res.allAssignments.length}`
    );
  } catch (err: any) {
    assert('TC-R2D-13', 'Criação de rotina DAILY 15 desatribuídas', false, err.message);
  }

  // =========================================================================
  // TC-R2D-14: Criação de tarefa ONE_TIME gera 1 ocorrência desatribuída sem redistribuir outras tarefas
  // =========================================================================
  try {
    const existingUnassigned: TaskAssignment = {
      id: `occ-other-task`,
      family_id: mockFamily.id,
      task_id: 'ft-other',
      family_task_id: 'ft-other',
      room_id: 'sala',
      member_id: '',
      scheduled_date: today,
      scheduled_start: '11:00',
      scheduled_end: '11:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const oneTimeTask: FamilyTask = {
      id: 'ft-onetime-14',
      family_id: mockFamily.id,
      customTitle: 'Comprar Lâmpada',
      room_id: 'geral',
      frequency: 'ONE_TIME',
      preferred_days: [],
      active: true,
      start_date: today
    };

    // No modelo canônico do AppContext.addTask, tarefas ONE_TIME criam sua ocorrência inicial desatribuída
    const oneTimeOcc: TaskAssignment = {
      id: `${oneTimeTask.id}_${today}`,
      family_id: mockFamily.id,
      task_id: oneTimeTask.id,
      family_task_id: oneTimeTask.id,
      room_id: 'geral',
      member_id: '',
      scheduled_date: today,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [oneTimeTask],
      existingAssignments: [existingUnassigned, oneTimeOcc],
      isDemoMode: true
    });

    const existingAfter = res.allAssignments.find(a => a.id === existingUnassigned.id);
    const oneTimeAfter = res.allAssignments.find(a => a.family_task_id === oneTimeTask.id);

    const validOneTime = Boolean(
      oneTimeAfter &&
      oneTimeAfter.is_unassigned === true &&
      (!oneTimeAfter.member_id) &&
      existingAfter &&
      existingAfter.is_unassigned === true &&
      (!existingAfter.member_id) &&
      res.newAssignments.length === 0
    );

    assert(
      'TC-R2D-14',
      'Criação de tarefa ONE_TIME gera 1 ocorrência desatribuída sem redistribuir outras tarefas',
      validOneTime,
      'Criação de ONE_TIME alterou ou redistribuiu outras tarefas'
    );
  } catch (err: any) {
    assert('TC-R2D-14', 'Criação de tarefa ONE_TIME desatribuída', false, err.message);
  }

  // =========================================================================
  // TC-R2D-15: Cenário R2C: 4 tarefas desatribuídas + criação da 5ª tarefa mantém TODAS as 5 tarefas desatribuídas
  // =========================================================================
  try {
    // 4 tarefas existentes do QA (testes caos 1, 2, 3, 4)
    const qaTask1: TaskAssignment = {
      id: 'asg-qa-1',
      family_id: mockFamily.id,
      task_id: 'ft-qa-1',
      family_task_id: 'ft-qa-1',
      room_id: 'geral',
      member_id: '',
      scheduled_date: today,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };
    const qaTask2: TaskAssignment = {
      id: 'asg-qa-2',
      family_id: mockFamily.id,
      task_id: 'ft-qa-2',
      family_task_id: 'ft-qa-2',
      room_id: 'geral',
      member_id: '',
      scheduled_date: today,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };
    const qaTask3: TaskAssignment = {
      id: 'asg-qa-3',
      family_id: mockFamily.id,
      task_id: 'ft-qa-3',
      family_task_id: 'ft-qa-3',
      room_id: 'geral',
      member_id: '',
      scheduled_date: today,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };
    const qaTask4: TaskAssignment = {
      id: 'asg-qa-4',
      family_id: mockFamily.id,
      task_id: 'ft-qa-4',
      family_task_id: 'ft-qa-4',
      room_id: 'geral',
      member_id: '',
      scheduled_date: today,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    // 5ª tarefa criada: 'teste criação canônica 5'
    const qaRoutine5: FamilyTask = {
      id: 'ft-canonical-5',
      family_id: mockFamily.id,
      customTitle: 'teste criação canônica 5',
      room_id: 'geral',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [qaRoutine5],
      existingAssignments: [qaTask1, qaTask2, qaTask3, qaTask4],
      isDemoMode: true
    });

    const task1After = res.allAssignments.find(a => a.id === qaTask1.id);
    const task2After = res.allAssignments.find(a => a.id === qaTask2.id);
    const task3After = res.allAssignments.find(a => a.id === qaTask3.id);
    const task4After = res.allAssignments.find(a => a.id === qaTask4.id);
    const task5Today = res.allAssignments.find(a => a.family_task_id === qaRoutine5.id && a.scheduled_date === today);

    const all5Unassigned = Boolean(
      task1After?.is_unassigned === true && (!task1After?.member_id) &&
      task2After?.is_unassigned === true && (!task2After?.member_id) &&
      task3After?.is_unassigned === true && (!task3After?.member_id) &&
      task4After?.is_unassigned === true && (!task4After?.member_id) &&
      task5Today?.is_unassigned === true && (!task5Today?.member_id)
    );

    assert(
      'TC-R2D-15',
      'Cenário R2C: 4 tarefas desatribuídas + criação da 5ª tarefa mantém TODAS as 5 tarefas desatribuídas',
      all5Unassigned,
      'Falha na separação: Ocorrência ou tarefa existente foi redistribuída indevidamente'
    );
  } catch (err: any) {
    assert('TC-R2D-15', 'Cenário R2C 5 tarefas desatribuídas', false, err.message);
  }

  // =========================================================================
  // TC-R2D-16: syncRollingRoutines mantém retrocompatibilidade executando geração e distribuição quando membros são fornecidos
  // =========================================================================
  try {
    const routine: FamilyTask = {
      id: 'ft-r2d-16',
      family_id: mockFamily.id,
      customTitle: 'Recolher Correspondência',
      room_id: 'portaria',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const res = await RoutineContinuityService.syncRollingRoutines({
      family: mockFamily,
      routines: [routine],
      existingAssignments: [],
      members: mockMembers,
      protectedTimes: mockProtectedTimes,
      isDemoMode: true
    });

    const todayOcc = res.allAssignments.find(a => a.family_task_id === routine.id && a.scheduled_date === today);
    const tomorrowOcc = res.allAssignments.find(a => a.family_task_id === routine.id && a.scheduled_date === tomorrow);
    const day3Occ = res.allAssignments.find(a => a.family_task_id === routine.id && a.scheduled_date === addDaysToDate(today, 2));

    const retroCompatible = Boolean(
      todayOcc && !todayOcc.is_unassigned && todayOcc.member_id &&
      tomorrowOcc && !tomorrowOcc.is_unassigned && tomorrowOcc.member_id &&
      day3Occ && day3Occ.is_unassigned && !day3Occ.member_id
    );

    assert(
      'TC-R2D-16',
      'syncRollingRoutines mantém retrocompatibilidade executando geração e distribuição quando membros são fornecidos',
      retroCompatible,
      'Retrocompatibilidade de syncRollingRoutines falhou'
    );
  } catch (err: any) {
    assert('TC-R2D-16', 'syncRollingRoutines retrocompatibilidade', false, err.message);
  }

  // =========================================================================
  // TC-R2D-17: Hidratação usa syncRoutineOccurrences sem disparar redistribuição no F5/recarregamento
  // =========================================================================
  try {
    const unassignedTask: TaskAssignment = {
      id: 'asg-f5-unassigned',
      family_id: mockFamily.id,
      task_id: 'ft-f5-1',
      family_task_id: 'ft-f5-1',
      room_id: 'geral',
      member_id: '',
      scheduled_date: today,
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      is_unassigned: true
    };

    const ft: FamilyTask = {
      id: 'ft-f5-1',
      family_id: mockFamily.id,
      customTitle: 'Tarefa Sem Distribuição F5',
      room_id: 'geral',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    // Simula a hidratação chamando syncRoutineOccurrences
    const hydrationRes = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [ft],
      existingAssignments: [unassignedTask],
      isDemoMode: true
    });

    const afterF5 = hydrationRes.allAssignments.find(a => a.id === unassignedTask.id);
    const preservedUnassigned = Boolean(afterF5 && afterF5.is_unassigned === true && !afterF5.member_id);

    assert(
      'TC-R2D-17',
      'Hidratação usa syncRoutineOccurrences sem disparar redistribuição no F5/recarregamento',
      preservedUnassigned,
      'Tarefa desatribuída foi atribuída durante a hidratação'
    );
  } catch (err: any) {
    assert('TC-R2D-17', 'Hidratação não redistribui', false, err.message);
  }

  // =========================================================================
  // TC-R2D-18: batchAddRoutines gera ocorrências sem redistribuir a carga da família
  // =========================================================================
  try {
    const routineA: FamilyTask = {
      id: 'ft-batch-a',
      family_id: mockFamily.id,
      customTitle: 'Batch A',
      room_id: 'cozinha',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const routineB: FamilyTask = {
      id: 'ft-batch-b',
      family_id: mockFamily.id,
      customTitle: 'Batch B',
      room_id: 'sala',
      frequency: 'DAILY',
      preferred_days: [0, 1, 2, 3, 4, 5, 6],
      active: true,
      start_date: today
    };

    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines: [routineA, routineB],
      existingAssignments: [],
      isDemoMode: true
    });

    const allUnassigned = res.allAssignments.every(a => a.is_unassigned === true && (!a.member_id || a.member_id === ''));
    assert(
      'TC-R2D-18',
      'batchAddRoutines gera ocorrências sem redistribuir a carga da família',
      res.allAssignments.length === 30 && allUnassigned,
      `Esperado 30 ocorrências desatribuídas no batch, obtido ${res.allAssignments.length}`
    );
  } catch (err: any) {
    assert('TC-R2D-18', 'batchAddRoutines sem redistribuição', false, err.message);
  }

  // =========================================================================
  // TC-R2D-19: Rebalanceamento explícito via DistributionService.executeRebalance continua funcionando normalmente sob comando explícito
  // =========================================================================
  try {
    const unassignedTasks = [
      {
        id: 'task-reb-1',
        familyId: mockFamily.id,
        familyTaskId: 'ft-reb-1',
        title: 'Varrer casa',
        description: '',
        taskMasterId: 'ft-reb-1',
        assignedMemberId: '',
        assigneeId: '',
        status: 'PENDING' as const,
        dueDate: today,
        roomId: 'geral',
        roomName: 'Geral',
        category: 'cleaning' as const,
        durationMinutes: 20,
        effort: 10,
        frequency: 'DAILY' as const,
        isUnassigned: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'task-reb-2',
        familyId: mockFamily.id,
        familyTaskId: 'ft-reb-2',
        title: 'Passar pano',
        description: '',
        taskMasterId: 'ft-reb-2',
        assignedMemberId: '',
        assigneeId: '',
        status: 'PENDING' as const,
        dueDate: today,
        roomId: 'geral',
        roomName: 'Geral',
        category: 'cleaning' as const,
        durationMinutes: 20,
        effort: 10,
        frequency: 'DAILY' as const,
        isUnassigned: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    const { result, taskUpdates } = DistributionService.executeRebalance({
      family: mockFamily,
      members: mockMembers,
      tasks: unassignedTasks,
      protectedTimes: mockProtectedTimes,
      targetDate: today
    });

    const distributed = Object.keys(taskUpdates).length > 0 && result.proposedAssignments.length > 0;
    assert(
      'TC-R2D-19',
      'Rebalanceamento explícito via DistributionService.executeRebalance continua funcionando normalmente sob comando explícito',
      distributed,
      'Motor 2.0 não gerou atribuições no rebalanceamento explícito'
    );
  } catch (err: any) {
    assert('TC-R2D-19', 'Rebalanceamento explícito via DistributionService', false, err.message);
  }

  // =========================================================================
  // TC-R2D-20: Atribuições pré-existentes da família (inclusive do incidente R2C) não são alteradas ou resetadas na sincronização de rotinas
  // =========================================================================
  try {
    // Simula as 5 tarefas exatamente como ficaram atribuídas após o incidente R2C:
    // teste criação canônica 5 → Matheus
    // testes caos 1 → Marcia
    // testes caos 2 → Marcia
    // testes caos 3 → Marcia
    // testes caos 4 → Daniel
    const incidentAssignments: TaskAssignment[] = [
      {
        id: 'asg-inc-1',
        family_id: mockFamily.id,
        task_id: 'ft-qa-1',
        family_task_id: 'ft-qa-1',
        room_id: 'geral',
        member_id: 'usr-marcia',
        scheduled_date: today,
        scheduled_start: '09:00',
        scheduled_end: '09:30',
        status: 'SCHEDULED',
        is_unassigned: false,
        assigned_reason: 'Atribuição incidente R2C'
      },
      {
        id: 'asg-inc-2',
        family_id: mockFamily.id,
        task_id: 'ft-qa-2',
        family_task_id: 'ft-qa-2',
        room_id: 'geral',
        member_id: 'usr-marcia',
        scheduled_date: today,
        scheduled_start: '09:00',
        scheduled_end: '09:30',
        status: 'SCHEDULED',
        is_unassigned: false,
        assigned_reason: 'Atribuição incidente R2C'
      },
      {
        id: 'asg-inc-3',
        family_id: mockFamily.id,
        task_id: 'ft-qa-3',
        family_task_id: 'ft-qa-3',
        room_id: 'geral',
        member_id: 'usr-marcia',
        scheduled_date: today,
        scheduled_start: '09:00',
        scheduled_end: '09:30',
        status: 'SCHEDULED',
        is_unassigned: false,
        assigned_reason: 'Atribuição incidente R2C'
      },
      {
        id: 'asg-inc-4',
        family_id: mockFamily.id,
        task_id: 'ft-qa-4',
        family_task_id: 'ft-qa-4',
        room_id: 'geral',
        member_id: 'usr-daniel',
        scheduled_date: today,
        scheduled_start: '09:00',
        scheduled_end: '09:30',
        status: 'SCHEDULED',
        is_unassigned: false,
        assigned_reason: 'Atribuição incidente R2C'
      },
      {
        id: 'asg-inc-5',
        family_id: mockFamily.id,
        task_id: 'ft-qa-5',
        family_task_id: 'ft-qa-5',
        room_id: 'geral',
        member_id: 'usr-matheus',
        scheduled_date: today,
        scheduled_start: '09:00',
        scheduled_end: '09:30',
        status: 'SCHEDULED',
        is_unassigned: false,
        assigned_reason: 'Atribuição incidente R2C'
      }
    ];

    const routines: FamilyTask[] = [
      { id: 'ft-qa-1', family_id: mockFamily.id, customTitle: 'testes caos 1', room_id: 'geral', frequency: 'ONE_TIME', preferred_days: [], active: true, start_date: today },
      { id: 'ft-qa-2', family_id: mockFamily.id, customTitle: 'testes caos 2', room_id: 'geral', frequency: 'ONE_TIME', preferred_days: [], active: true, start_date: today },
      { id: 'ft-qa-3', family_id: mockFamily.id, customTitle: 'testes caos 3', room_id: 'geral', frequency: 'ONE_TIME', preferred_days: [], active: true, start_date: today },
      { id: 'ft-qa-4', family_id: mockFamily.id, customTitle: 'testes caos 4', room_id: 'geral', frequency: 'ONE_TIME', preferred_days: [], active: true, start_date: today },
      { id: 'ft-qa-5', family_id: mockFamily.id, customTitle: 'teste criação canônica 5', room_id: 'geral', frequency: 'ONE_TIME', preferred_days: [], active: true, start_date: today }
    ];

    // O deploy e a sincronização NÃO devem alterar essas 5 tarefas automaticamente
    const res = await RoutineContinuityService.syncRoutineOccurrences({
      family: mockFamily,
      routines,
      existingAssignments: incidentAssignments,
      isDemoMode: true
    });

    const a1 = res.allAssignments.find(a => a.id === 'asg-inc-1');
    const a2 = res.allAssignments.find(a => a.id === 'asg-inc-2');
    const a3 = res.allAssignments.find(a => a.id === 'asg-inc-3');
    const a4 = res.allAssignments.find(a => a.id === 'asg-inc-4');
    const a5 = res.allAssignments.find(a => a.id === 'asg-inc-5');

    const unchanged = Boolean(
      a1?.member_id === 'usr-marcia' &&
      a2?.member_id === 'usr-marcia' &&
      a3?.member_id === 'usr-marcia' &&
      a4?.member_id === 'usr-daniel' &&
      a5?.member_id === 'usr-matheus' &&
      res.newAssignments.length === 0
    );

    assert(
      'TC-R2D-20',
      'Atribuições pré-existentes da família (inclusive do incidente R2C) não são alteradas ou resetadas na sincronização de rotinas',
      unchanged,
      'Atribuições existentes foram modificadas ou resetadas indevidamente durante a sincronização'
    );
  } catch (err: any) {
    assert('TC-R2D-20', 'Preservação estrita das atribuições existentes', false, err.message);
  }

  return results;
}
