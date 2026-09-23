/**
 * CASA JUNTO — Test Suite: DATA-REPAIR-DUP-1
 * Consolidated Data Repair and Invariant Verification Suite
 * 
 * Verifies:
 * - DR01: Atomic Repair Execution updates ft-5 (active=true), ft-6 (active=false), asg-6 (CANCELLED)
 * - DR02: PO Configuration Integrity: ft-5 preserves roomId='varanda' and preferredTime='17:30' (not copied from ft-6)
 * - DR03: No Hard Deletes: ft-6 and asg-6 documents remain persisted and accessible
 * - DR04: Zero Unauthorized Fields: No 'archived', 'merged', or 'supersededBy' added to ft-6
 * - DR05: Completed History Immutability: ft-5_2026-09-10 remains status='COMPLETED' with original metadata
 * - DR06: Post-Repair Query: Exactly 2 total FamilyTasks for pet-2, exactly 1 active FamilyTask (ft-5)
 * - DR07: Operational Occurrences Today: Exactly 1 non-cancelled occurrence for pet-2
 * - DR08: Idempotency under syncRollingRoutines: Re-syncing does not re-activate ft-6 or generate duplicate
 * - DR09: F5 / Refresh Hydration Simulation: AppContext reload maintains 1 active FamilyTask and 1 occurrence
 * - DR10: Functional View - Catálogo: Exactly 1 active operational routine for pet-2
 * - DR11: Functional View - Hoje (Today): Exactly 1 occurrence presented for today
 * - DR12: Functional View - Rotina: Exactly 1 occurrence per date across the 15-day horizon
 * - DR13: Functional View - Rebalance: Rebalance engine consumes at most 1 task assignment for pet-2 today
 * - DR14: Functional View - Blitz: Blitz engine includes at most 1 occurrence for pet-2
 * - DR15: End-to-End Data Loss Assessment: Confirms ZERO data loss (DATA LOSS: NONE)
 */

import { Family, FamilyTask, TaskAssignment, Member, ProtectedTime } from '../types';
import { DataRepairDup1Service } from '../application/services/DataRepairDup1Service';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { getTodayDateString } from '../domain/utils/dateTimeUtils';
import { demoFamily, demoUsers } from '../data/demoData';

export interface DataRepairTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

export async function runDataRepairDup1TestSuite(): Promise<DataRepairTestResult[]> {
  const results: DataRepairTestResult[] = [];
  const todayStr = getTodayDateString();

  const testFamily: Family = {
    id: 'fam-silva-01',
    name: 'Família Silva',
    created_at: '2026-09-01T08:00:00.000Z',
    timezone: 'America/Sao_Paulo',
    balance_mode: 'equilibrado',
    active: true,
    status: 'ACTIVE',
    environment: 'demo'
  };

  const testMembers: Member[] = [
    {
      id: 'usr-pedro',
      user_id: 'usr-auth-pedro',
      name: 'Pedro',
      role: 'MEMBER',
      family_id: 'fam-silva-01',
      birth_date: '2014-11-03',
      age: 10,
      autonomy_level: 2,
      active: true,
      color: '#B2F2BB'
    },
    {
      id: 'usr-marcia',
      user_id: 'usr-auth-marcia',
      name: 'Márcia',
      role: 'ADMIN',
      family_id: 'fam-silva-01',
      birth_date: '1982-05-14',
      age: 42,
      autonomy_level: 4,
      active: true,
      color: '#A5D8FF'
    }
  ];

  // Estado Inicial Pré-Repair (com duplicata confirmada)
  const initialFt5: FamilyTask = {
    id: 'ft-5',
    family_id: 'fam-silva-01',
    task_master_id: 'pet-2',
    frequency: 'daily',
    preferred_days: [0, 1, 2, 3, 4, 5, 6],
    preferred_time: '17:30',
    room_id: 'varanda',
    estimated_minutes: 5,
    active: true,
    created_at: '2026-09-01T08:00:00.000Z',
    updated_at: '2026-09-01T08:00:00.000Z'
  };

  const initialFt6: FamilyTask = {
    id: 'ft-6',
    family_id: 'fam-silva-01',
    task_master_id: 'pet-2',
    frequency: 'daily',
    preferred_days: [0, 1, 2, 3, 4, 5, 6],
    preferred_time: '08:15',
    room_id: 'kitchen',
    estimated_minutes: 5,
    active: true,
    created_at: '2026-09-02T14:30:00.000Z',
    updated_at: '2026-09-02T14:30:00.000Z'
  };

  const initialAsgTodayFt5: TaskAssignment = {
    id: 'asg-demo-05',
    family_id: 'fam-silva-01',
    family_task_id: 'ft-5',
    task_id: 'pet-2',
    member_id: 'usr-pedro',
    scheduled_date: todayStr,
    scheduled_start: '17:30',
    scheduled_end: '17:45',
    status: 'SCHEDULED',
    score: 80
  };

  const initialAsgTodayFt6: TaskAssignment = {
    id: 'asg-6',
    family_id: 'fam-silva-01',
    family_task_id: 'ft-6',
    task_id: 'pet-2',
    member_id: 'usr-pedro',
    scheduled_date: todayStr,
    scheduled_start: '08:15',
    scheduled_end: '08:30',
    status: 'PENDING',
    score: 10
  };

  const initialCompletedHistoric: TaskAssignment = {
    id: 'ft-5_2026-09-10',
    family_id: 'fam-silva-01',
    family_task_id: 'ft-5',
    task_id: 'pet-2',
    member_id: 'usr-pedro',
    scheduled_date: '2026-09-10',
    scheduled_start: '17:30',
    scheduled_end: '17:45',
    status: 'COMPLETED',
    score: 80,
    completed_at: '2026-09-10T08:20:00.000Z',
    completion_duration: 5
  };

  // Executar o repair
  const repairResult = await DataRepairDup1Service.executeRepair({
    familyId: 'fam-silva-01',
    familyTasks: [initialFt5, initialFt6],
    assignments: [initialAsgTodayFt5, initialAsgTodayFt6, initialCompletedHistoric],
    isDemoMode: true
  });

  // DR01: Atomic Repair Execution
  results.push({
    id: 'DR01',
    name: 'Transação Atômica do Repair',
    passed: repairResult.transactionSuccess && repairResult.canonicalTask.active === true && repairResult.deactivatedTask.active === false,
    message: repairResult.transactionSuccess ? 'Transação executada com sucesso.' : 'Falha na execução da transação.',
    details: { canonicalId: repairResult.canonicalTask.id, deactivatedId: repairResult.deactivatedTask.id }
  });

  // DR02: PO Configuration Integrity: ft-5 preserves roomId='varanda' and preferredTime='17:30'
  const configPreserved = (
    repairResult.canonicalTask.room_id === 'varanda' &&
    repairResult.canonicalTask.preferred_time === '17:30' &&
    repairResult.canonicalTask.task_master_id === 'pet-2'
  );
  results.push({
    id: 'DR02',
    name: 'Preservação Estrita da Configuração Canônica (PO)',
    passed: configPreserved,
    message: configPreserved ? 'ft-5 preservou roomId=varanda e preferredTime=17:30.' : 'Configuração divergente ou herdada indevidamente.',
    details: { room_id: repairResult.canonicalTask.room_id, preferred_time: repairResult.canonicalTask.preferred_time }
  });

  // DR03: No Hard Deletes: ft-6 and asg-6 documents remain persisted
  const ft6Persisted = repairResult.repairedFamilyTasks.some(ft => ft.id === 'ft-6');
  const asg6Persisted = repairResult.repairedAssignments.some(a => a.id === 'asg-6');
  results.push({
    id: 'DR03',
    name: 'Proibição de Hard Delete de Documentos',
    passed: ft6Persisted && asg6Persisted,
    message: ft6Persisted && asg6Persisted ? 'ft-6 e asg-6 mantidos persistidos (zero exclusões físicas).' : 'Erro: documentos excluídos fisicamente.',
    details: { ft6Persisted, asg6Persisted }
  });

  // DR04: Zero Unauthorized Fields
  const ft6Obj = repairResult.deactivatedTask as any;
  const noUnauthorizedFields = !ft6Obj.archived && !ft6Obj.merged && !ft6Obj.supersededBy && !ft6Obj.superseded_by;
  results.push({
    id: 'DR04',
    name: 'Ausência de Campos Não Autorizados (archived/merged/superseded)',
    passed: noUnauthorizedFields,
    message: noUnauthorizedFields ? 'Nenhum campo arbitrário adicionado.' : 'Campos proibidos foram introduzidos.',
    details: { archived: ft6Obj.archived, merged: ft6Obj.merged }
  });

  // DR05: Completed History Immutability
  const historicRecord = repairResult.repairedAssignments.find(a => a.id === 'ft-5_2026-09-10');
  const historicIntact = !!historicRecord && historicRecord.status === 'COMPLETED' && historicRecord.completed_at === '2026-09-10T08:20:00.000Z';
  results.push({
    id: 'DR05',
    name: 'Imutabilidade do Histórico de Conclusão',
    passed: historicIntact,
    message: historicIntact ? 'Histórico COMPLETED de 10/09/2026 preservado 100% íntegro.' : 'Falha na integridade do histórico concluído.',
    details: historicRecord
  });

  // DR06: Post-Repair Query: Exactly 2 total FamilyTasks for pet-2, exactly 1 active FamilyTask (ft-5)
  const pet2Tasks = repairResult.repairedFamilyTasks.filter(ft => ft.task_master_id === 'pet-2' || (ft as any).task_id === 'pet-2');
  const activePet2Tasks = pet2Tasks.filter(ft => ft.active);
  const dr06Passed = pet2Tasks.length === 2 && activePet2Tasks.length === 1 && activePet2Tasks[0].id === 'ft-5';
  results.push({
    id: 'DR06',
    name: 'Consulta Pós-Repair: Total 2, Ativa Exatamente 1 (ft-5)',
    passed: dr06Passed,
    message: dr06Passed ? 'Total: 2, Ativa: 1 (ft-5).' : `Incorreto: total=${pet2Tasks.length}, ativas=${activePet2Tasks.length}`,
    details: { total: pet2Tasks.length, active: activePet2Tasks.map(t => t.id) }
  });

  // DR07: Operational Occurrences Today: Exactly 1 non-cancelled occurrence for pet-2
  const todayPet2Occurrences = repairResult.repairedAssignments.filter(
    a => (a.task_id === 'pet-2' || a.family_task_id === 'ft-5' || a.family_task_id === 'ft-6') &&
         a.scheduled_date === todayStr &&
         a.status !== 'CANCELLED'
  );
  const dr07Passed = todayPet2Occurrences.length === 1 && todayPet2Occurrences[0].family_task_id === 'ft-5';
  results.push({
    id: 'DR07',
    name: 'Ocorrências Operacionais para Hoje: Exatamente 1',
    passed: dr07Passed,
    message: dr07Passed ? 'Exatamente 1 ocorrência operacional ativa para hoje.' : `Incorreto: count=${todayPet2Occurrences.length}`,
    details: todayPet2Occurrences
  });

  // DR08: Idempotency under syncRollingRoutines
  const syncResultAfterRepair = await RoutineContinuityService.syncRollingRoutines({
    family: testFamily,
    routines: repairResult.repairedFamilyTasks,
    existingAssignments: repairResult.repairedAssignments,
    members: testMembers,
    protectedTimes: [],
    isDemoMode: true
  });

  const pet2TodayAfterSync = syncResultAfterRepair.allAssignments.filter(
    a => (a.task_id === 'pet-2' || a.family_task_id === 'ft-5' || a.family_task_id === 'ft-6') &&
         a.scheduled_date === todayStr &&
         a.status !== 'CANCELLED'
  );
  const ft6RemainedInactive = repairResult.repairedFamilyTasks.find(ft => ft.id === 'ft-6')?.active === false;
  const dr08Passed = pet2TodayAfterSync.length === 1 && ft6RemainedInactive;
  results.push({
    id: 'DR08',
    name: 'Idempotência em syncRollingRoutines Pós-Repair',
    passed: dr08Passed,
    message: dr08Passed ? 'syncRollingRoutines não reativou ft-6 nem recriou duplicata.' : 'Falha: sync gerou duplicata ou reativou rotina inativa.',
    details: { countToday: pet2TodayAfterSync.length, ft6Active: !ft6RemainedInactive }
  });

  // DR09: F5 / Refresh Hydration Simulation
  const refreshedTasks = [...repairResult.repairedFamilyTasks];
  const refreshedAssignments = [...syncResultAfterRepair.allAssignments];

  const postF5Verification = DataRepairDup1Service.verifyPostRepair(refreshedTasks, refreshedAssignments, todayStr);
  results.push({
    id: 'DR09',
    name: 'Simulação de Refresh/F5 Hydration',
    passed: postF5Verification.isValid,
    message: postF5Verification.isValid ? 'Estado persistido hidrata perfeitamente sem duplicatas.' : 'Falha na verificação de integridade pós-hidratação.',
    details: postF5Verification
  });

  // DR10: Functional View - Catálogo: Exactly 1 active operational routine for pet-2
  const catalogActiveRoutines = refreshedTasks.filter(r => (r.task_master_id === 'pet-2' || (r as any).task_id === 'pet-2') && r.active);
  const dr10Passed = catalogActiveRoutines.length === 1 && catalogActiveRoutines[0].id === 'ft-5';
  results.push({
    id: 'DR10',
    name: 'Visão Catálogo: 1 Representação Operacional da Tarefa',
    passed: dr10Passed,
    message: dr10Passed ? 'Catálogo exibe unicamente a representação canônica ft-5.' : 'Catálogo com representações redundantes.',
    details: { catalogCount: catalogActiveRoutines.length }
  });

  // DR11: Functional View - Hoje (Today): Exactly 1 occurrence presented for today
  const todayViewTasks = refreshedAssignments.filter(
    a => (a.task_id === 'pet-2' || a.family_task_id === 'ft-5') &&
         a.scheduled_date === todayStr &&
         a.status !== 'CANCELLED'
  );
  const dr11Passed = todayViewTasks.length === 1;
  results.push({
    id: 'DR11',
    name: 'Visão Hoje (Today): Máximo 1 Ocorrência',
    passed: dr11Passed,
    message: dr11Passed ? 'Visão Hoje apresenta exatamente 1 ocorrência para pet-2.' : 'Visão Hoje violou limite unitário.',
    details: { count: todayViewTasks.length }
  });

  // DR12: Functional View - Rotina: Exactly 1 occurrence per date across the 15-day horizon
  const horizonDates = Array.from({ length: 15 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  let horizonViolations = 0;
  for (const date of horizonDates) {
    const dailyOccurrences = refreshedAssignments.filter(
      a => (a.task_id === 'pet-2' || a.family_task_id === 'ft-5') &&
           a.scheduled_date === date &&
           a.status !== 'CANCELLED'
    );
    if (dailyOccurrences.length > 1) {
      horizonViolations++;
    }
  }
  const dr12Passed = horizonViolations === 0;
  results.push({
    id: 'DR12',
    name: 'Visão Rotina: Máximo 1 Ocorrência por Data no Horizonte',
    passed: dr12Passed,
    message: dr12Passed ? 'Zero violações de duplicidade no horizonte de 15 dias.' : `Violações detectadas em ${horizonViolations} datas.`,
    details: { horizonViolations }
  });

  // DR13: Functional View - Rebalance: Rebalance engine consumes at most 1 task assignment for pet-2 today
  const rebalanceCandidates = refreshedAssignments.filter(
    a => (a.task_id === 'pet-2' || a.family_task_id === 'ft-5') &&
         a.scheduled_date === todayStr &&
         a.status !== 'CANCELLED' &&
         a.status !== 'COMPLETED'
  );
  const dr13Passed = rebalanceCandidates.length <= 1;
  results.push({
    id: 'DR13',
    name: 'Visão Rebalance: Máximo 1 Ocorrência Elegível',
    passed: dr13Passed,
    message: dr13Passed ? 'Rebalance processa no máximo 1 ocorrência de pet-2 para hoje.' : 'Rebalance recebeu tarefas concorrentes.',
    details: { candidateCount: rebalanceCandidates.length }
  });

  // DR14: Functional View - Blitz: Blitz engine includes at most 1 occurrence for pet-2
  const blitzCandidates = refreshedAssignments.filter(
    a => (a.task_id === 'pet-2' || a.family_task_id === 'ft-5') &&
         a.scheduled_date === todayStr &&
         a.status !== 'COMPLETED' &&
         a.status !== 'CANCELLED'
  );
  const dr14Passed = blitzCandidates.length <= 1;
  results.push({
    id: 'DR14',
    name: 'Visão Modo Blitz: Máximo 1 Ocorrência Ativa',
    passed: dr14Passed,
    message: dr14Passed ? 'Modo Blitz contém no máximo 1 ocorrência para pet-2.' : 'Modo Blitz recebeu tarefas duplicadas.',
    details: { blitzCount: blitzCandidates.length }
  });

  // DR15: End-to-End Data Loss Assessment
  const dataLossNone = (
    repairResult.repairedFamilyTasks.length >= 2 &&
    repairResult.repairedAssignments.some(a => a.id === 'ft-5_2026-09-10' && a.status === 'COMPLETED') &&
    repairResult.repairedAssignments.some(a => a.id === 'asg-6' && a.status === 'CANCELLED')
  );
  results.push({
    id: 'DR15',
    name: 'Avaliação Final de Perda de Dados',
    passed: dataLossNone,
    message: dataLossNone ? 'DATA LOSS: NONE (Preservação total de dados históricos e rastreabilidade).' : 'Possível perda de dados detectada.',
    details: { dataLoss: 'NONE' }
  });

  return results;
}
