/**
 * CASA JUNTO — ROUTINE CONTINUITY 1.0
 * Script de Verificação Canônica da Família Real (Seção 4: A - I)
 *
 * Família de Teste:
 * - Marina (ADMIN)
 * - Lucas (MEMBER)
 * - Clara (MEMBER)
 *
 * Rotinas:
 * - R1: DAILY — Lavar Louça
 * - R2: WEEKLY — Sábado
 * - R3: BIWEEKLY
 * - R4: MONTHLY — dia 31
 * - R5: ONE_TIME
 */

import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import {
  getFamilyLocalDate,
  getRollingDateHorizon,
  addDaysToDate,
  DEFAULT_TIMEZONE
} from '../domain/utils/dateTimeUtils';
import { Family, FamilyTask, TaskAssignment, Member, ProtectedTime } from '../types';

async function verifyRealFamilySuite() {
  console.log('====================================================');
  console.log('CASA JUNTO — VERIFICAÇÃO CANÔNICA DE FAMÍLIA REAL');
  console.log('====================================================\n');

  const family: Family = {
    id: 'fam-real-marina',
    name: 'Família Marina & Lucas',
    ownerUserId: 'usr-marina',
    timezone: 'America/Sao_Paulo',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z'
  };

  const members: Member[] = [
    {
      id: 'mem-marina',
      familyId: family.id,
      name: 'Marina',
      role: 'ADMIN',
      avatar: '👩',
      color: '#5A5A40',
      autonomyLevel: 4,
      points: 150,
      streak: 7,
      tasksCompleted: 15
    },
    {
      id: 'mem-lucas',
      familyId: family.id,
      name: 'Lucas',
      role: 'MEMBER',
      avatar: '👦',
      color: '#3B82F6',
      autonomyLevel: 2,
      points: 80,
      streak: 4,
      tasksCompleted: 8
    },
    {
      id: 'mem-clara',
      familyId: family.id,
      name: 'Clara',
      role: 'MEMBER',
      avatar: '👧',
      color: '#EC4899',
      autonomyLevel: 1,
      points: 40,
      streak: 2,
      tasksCompleted: 4
    }
  ];

  const protectedTimes: ProtectedTime[] = [];

  const today = getFamilyLocalDate(family.timezone);
  const tomorrow = addDaysToDate(today, 1);
  const horizon = getRollingDateHorizon(today, 15);

  console.log(`Data Base da Família (${family.timezone}): Hoje = ${today}, Amanhã = ${tomorrow}`);
  console.log(`Horizonte de 15 dias: ${horizon[0]} até ${horizon[14]}\n`);

  // Rotinas Canônicas
  const R1: FamilyTask = {
    id: 'ft-r1-lavar-louca',
    family_id: family.id,
    task_id: 'lavar-louca',
    frequency: 'DAILY',
    active: true,
    start_date: today,
    preferred_time: '09:00',
    room_id: 'cozinha'
  };

  const R2: FamilyTask = {
    id: 'ft-r2-faxina-sabado',
    family_id: family.id,
    task_id: 'faxina-geral',
    frequency: 'WEEKLY',
    preferred_days: [6], // Sábado
    active: true,
    start_date: today,
    preferred_time: '10:00',
    room_id: 'sala'
  };

  const R3: FamilyTask = {
    id: 'ft-r3-troca-cama',
    family_id: family.id,
    task_id: 'trocar-roupa-cama',
    frequency: 'BIWEEKLY',
    active: true,
    start_date: today,
    preferred_time: '14:00',
    room_id: 'quarto'
  };

  const R4: FamilyTask = {
    id: 'ft-r4-filtro-ar',
    family_id: family.id,
    task_id: 'limpar-filtro-ar',
    frequency: 'MONTHLY',
    day_of_month: 31,
    active: true,
    start_date: '2026-01-31',
    preferred_time: '11:00',
    room_id: 'sala'
  };

  const R5: FamilyTask = {
    id: 'ft-r5-reparo-avulso',
    family_id: family.id,
    task_id: 'reparo-torneira',
    frequency: 'ONE_TIME',
    active: true,
    start_date: today,
    preferred_time: '16:00',
    room_id: 'cozinha'
  };

  const allRoutines = [R1, R2, R3, R4, R5];

  // --------------------------------------------------
  // A. GERAÇÃO (R1 DAILY)
  // --------------------------------------------------
  console.log('--- A. GERAÇÃO (R1 DAILY) ---');
  const r1Occurrences = RoutineGenerator.generateMissingOccurrences({
    routine: R1,
    familyId: family.id,
    horizonDates: horizon,
    existingOccurrences: []
  });

  const uniqueIds = new Set(r1Occurrences.map(o => o.id));
  const r1Exact15 = r1Occurrences.length === 15;
  const noDuplicates = uniqueIds.size === 15;
  const allMatchFamilyTaskId = r1Occurrences.every(o => o.family_task_id === R1.id);
  const allMatchRoomId = r1Occurrences.every(o => o.room_id === 'cozinha');
  const allMatchTime = r1Occurrences.every(o => o.scheduled_start === '09:00');
  const datesMatch = r1Occurrences.map(o => o.scheduled_date);
  const datesExactHorizon = JSON.stringify(datesMatch) === JSON.stringify(horizon);

  console.log(`R1 Ocorrências geradas: ${r1Occurrences.length} (esperado 15) -> ${r1Exact15 ? 'PASS' : 'FAIL'}`);
  console.log(`IDs únicos: ${uniqueIds.size} / 15 -> ${noDuplicates ? 'PASS' : 'FAIL'}`);
  console.log(`family_task_id preservado: ${allMatchFamilyTaskId ? 'PASS' : 'FAIL'}`);
  console.log(`room_id = 'cozinha' em todas: ${allMatchRoomId ? 'PASS' : 'FAIL'}`);
  console.log(`preferred_time = '09:00' em todas: ${allMatchTime ? 'PASS' : 'FAIL'}`);
  console.log(`Datas cobrem hoje a hoje+14: ${datesExactHorizon ? 'PASS' : 'FAIL'}`);

  // --------------------------------------------------
  // B. RECORRÊNCIA (R1 a R5)
  // --------------------------------------------------
  console.log('\n--- B. RECORRÊNCIA ---');
  // R1 Daily
  console.log(`R1 DAILY: ${r1Occurrences.length} ocorrências (${r1Occurrences[0].scheduled_date} a ${r1Occurrences[14].scheduled_date})`);
  // R2 Weekly
  const r2Occs = RoutineGenerator.generateMissingOccurrences({
    routine: R2,
    familyId: family.id,
    horizonDates: horizon,
    existingOccurrences: []
  });
  console.log(`R2 WEEKLY (Sábado): ${r2Occs.length} ocorrências -> datas: ${r2Occs.map(o => o.scheduled_date).join(', ')}`);
  // R3 Biweekly
  const r3Occs = RoutineGenerator.generateMissingOccurrences({
    routine: R3,
    familyId: family.id,
    horizonDates: horizon,
    existingOccurrences: []
  });
  console.log(`R3 BIWEEKLY: ${r3Occs.length} ocorrências -> datas: ${r3Occs.map(o => o.scheduled_date).join(', ')}`);
  // R4 Monthly clamp: Testado com horizonte de fim de mês curto (Fevereiro/Abril) para validar clamp
  const horizonMonthEnd = getRollingDateHorizon('2026-02-20', 15); // 2026-02-20 a 2026-03-06 (Fevereiro 28 dias)
  const r4OccsClamp = RoutineGenerator.generateMissingOccurrences({
    routine: R4,
    familyId: family.id,
    horizonDates: horizonMonthEnd,
    existingOccurrences: []
  });
  const clampedToFeb28 = r4OccsClamp.some(o => o.scheduled_date === '2026-02-28');
  console.log(`R4 MONTHLY (clamp dia 31 no mês de Fevereiro -> 2026-02-28): ${clampedToFeb28 ? 'PASS' : 'FAIL'} (data: ${r4OccsClamp.map(o => o.scheduled_date).join(', ')})`);
  // R5 One-Time
  const r5Occs = RoutineGenerator.generateMissingOccurrences({
    routine: R5,
    familyId: family.id,
    horizonDates: horizon,
    existingOccurrences: []
  });
  console.log(`R5 ONE_TIME: ${r5Occs.length} ocorrências (excluído do gerador contínuo) -> ${r5Occs.length === 0 ? 'PASS' : 'FAIL'}`);

  // --------------------------------------------------
  // C. DISTRIBUIÇÃO
  // --------------------------------------------------
  console.log('\n--- C. DISTRIBUIÇÃO ---');
  const sync1 = await RoutineContinuityService.syncRollingRoutines({
    family,
    routines: allRoutines,
    existingAssignments: [],
    members,
    protectedTimes,
    isDemoMode: true
  });

  const allAssigned = sync1.allAssignments;
  const todayTasks = allAssigned.filter(a => a.scheduled_date === today);
  const tomorrowTasks = allAssigned.filter(a => a.scheduled_date === tomorrow);
  const futureDaysTasks = allAssigned.filter(a => a.scheduled_date > tomorrow);

  const todayEligible = todayTasks.length > 0;
  const tomorrowEligible = tomorrowTasks.length > 0;
  const futureAllUnassigned = futureDaysTasks.every(a => a.is_unassigned === true && (!a.member_id || a.member_id === ''));

  console.log(`Hoje (${today}): ${todayTasks.length} ocorrências elegíveis para distribuição`);
  console.log(`Amanhã (${tomorrow}): ${tomorrowTasks.length} ocorrências elegíveis para distribuição`);
  console.log(`D2-D14 (${futureDaysTasks.length} tarefas): todas desatribuídas? -> ${futureAllUnassigned ? 'PASS' : 'FAIL'}`);

  // Checa se segundo sync não causa reshuffle
  const sync1Repeat = await RoutineContinuityService.syncRollingRoutines({
    family,
    routines: allRoutines,
    existingAssignments: sync1.allAssignments,
    members,
    protectedTimes,
    isDemoMode: true
  });

  const sameAssignments = sync1.allAssignments.every(orig => {
    const repeated = sync1Repeat.allAssignments.find(r => r.id === orig.id);
    return repeated && repeated.member_id === orig.member_id && repeated.status === orig.status;
  });
  console.log(`Segundo sync não altera atribuições nem status: ${sameAssignments ? 'PASS' : 'FAIL'}`);

  // --------------------------------------------------
  // D. F5 (PERSISTÊNCIA / REIDRATAÇÃO)
  // --------------------------------------------------
  console.log('\n--- D. F5 / REIDRATAÇÃO ---');
  // Simula recarregamento reidratando a partir da lista persistida
  const rehydratedStore = [...sync1.allAssignments];
  const r1Rehydrated = rehydratedStore.filter(a => a.family_task_id === R1.id);
  const r1Count15 = r1Rehydrated.length === 15;
  const r1RoomsPersisted = r1Rehydrated.every(a => a.room_id === 'cozinha');
  const r1DatesPersisted = r1Rehydrated.every(a => a.scheduled_date >= today);
  const r1FutureUnassigned = r1Rehydrated.filter(a => a.scheduled_date > tomorrow).every(a => a.is_unassigned === true);

  console.log(`Ocorrências 15 dias persistem: ${r1Count15 ? 'PASS' : 'FAIL'}`);
  console.log(`room_id 'cozinha' persiste: ${r1RoomsPersisted ? 'PASS' : 'FAIL'}`);
  console.log(`Datas persistem: ${r1DatesPersisted ? 'PASS' : 'FAIL'}`);
  console.log(`Estado não atribuído futuro persiste: ${r1FutureUnassigned ? 'PASS' : 'FAIL'}`);

  // --------------------------------------------------
  // E. SEGUNDA SESSÃO / CONCORRÊNCIA MULTI-DISPOSITIVO
  // --------------------------------------------------
  console.log('\n--- E. SEGUNDA SESSÃO / CONCORRÊNCIA MULTI-DISPOSITIVO ---');
  // Dispositivo 2 abre a mesma família com os mesmos dados existentes
  const syncDevice2 = await RoutineContinuityService.syncRollingRoutines({
    family,
    routines: allRoutines,
    existingAssignments: rehydratedStore,
    members,
    protectedTimes,
    isDemoMode: true
  });

  const dev2NewCount = syncDevice2.newAssignments.length;
  const dev2TotalCount = syncDevice2.allAssignments.length;
  console.log(`Ocorrências novas geradas no dispositivo 2: ${dev2NewCount} (esperado 0) -> ${dev2NewCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Total de ocorrências preservado: ${dev2TotalCount === rehydratedStore.length ? 'PASS' : 'FAIL'}`);

  // --------------------------------------------------
  // F. OCORRÊNCIA CONCLUÍDA
  // --------------------------------------------------
  console.log('\n--- F. OCORRÊNCIA CONCLUÍDA ---');
  const todayR1 = rehydratedStore.find(a => a.family_task_id === R1.id && a.scheduled_date === today)!;
  // Conclui a tarefa de hoje
  const completedTodayR1: TaskAssignment = {
    ...todayR1,
    status: 'COMPLETED',
    member_id: 'mem-marina',
    completed_at: new Date().toISOString(),
    completed_by: 'mem-marina',
    completion_type: 'SELF_CLAIMED',
    is_unassigned: false
  };

  const storeWithCompleted = rehydratedStore.map(a => a.id === completedTodayR1.id ? completedTodayR1 : a);

  // Novo sync de rotinas
  const syncAfterDone = await RoutineContinuityService.syncRollingRoutines({
    family,
    routines: allRoutines,
    existingAssignments: storeWithCompleted,
    members,
    protectedTimes,
    isDemoMode: true
  });

  const checkDone = syncAfterDone.allAssignments.find(a => a.id === completedTodayR1.id);
  const doneStatusPreserved = checkDone?.status === 'COMPLETED';
  const doneMemberPreserved = checkDone?.member_id === 'mem-marina';
  const doneCompletedByPreserved = checkDone?.completed_by === 'mem-marina';
  const doneTypePreserved = checkDone?.completion_type === 'SELF_CLAIMED';

  console.log(`Status permanece COMPLETED: ${doneStatusPreserved ? 'PASS' : 'FAIL'}`);
  console.log(`member_id preservado (mem-marina): ${doneMemberPreserved ? 'PASS' : 'FAIL'}`);
  console.log(`completed_by preservado (mem-marina): ${doneCompletedByPreserved ? 'PASS' : 'FAIL'}`);
  console.log(`completion_type preservado (SELF_CLAIMED): ${doneTypePreserved ? 'PASS' : 'FAIL'}`);

  // --------------------------------------------------
  // G. DESATIVAÇÃO
  // --------------------------------------------------
  console.log('\n--- G. DESATIVAÇÃO ---');
  const deactResult = await RoutineContinuityService.deactivateRoutine({
    familyId: family.id,
    routineId: R1.id,
    existingRoutines: allRoutines,
    existingAssignments: storeWithCompleted,
    isDemoMode: true,
    timezone: family.timezone
  });

  const isDeactivated = deactResult.deactivatedRoutine.active === false;
  const completedUntouched = !deactResult.cancelledAssignments.some(a => a.id === completedTodayR1.id);
  const futureCancelled = deactResult.cancelledAssignments.every(a => a.status === 'CANCELLED');

  console.log(`FamilyTask.active = false: ${isDeactivated ? 'PASS' : 'FAIL'}`);
  console.log(`Ocorrência COMPLETED intocada: ${completedUntouched ? 'PASS' : 'FAIL'}`);
  console.log(`Ocorrências futuras SCHEDULED canceladas: ${futureCancelled ? 'PASS' : 'FAIL'}`);

  // --------------------------------------------------
  // H. REATIVAÇÃO
  // --------------------------------------------------
  console.log('\n--- H. REATIVAÇÃO ---');
  // Aplica cancelamento no store para testar reativação
  const storeAfterDeact = storeWithCompleted.map(a => {
    const cancelled = deactResult.cancelledAssignments.find(c => c.id === a.id);
    return cancelled || a;
  });

  const reactResult = await RoutineContinuityService.reactivateRoutine({
    familyId: family.id,
    routineId: R1.id,
    existingRoutines: [deactResult.deactivatedRoutine, R2, R3, R4, R5],
    existingAssignments: storeAfterDeact,
    isDemoMode: true,
    timezone: family.timezone
  });

  const reactivatedSameId = reactResult.reactivatedRoutine.id === R1.id;
  const reactivatedActive = reactResult.reactivatedRoutine.active === true;
  const noPastBackfill = reactResult.newAssignments.every(a => a.scheduled_date >= today);
  const restoredFutureScheduled = reactResult.restoredAssignments.every(a => a.status === 'SCHEDULED');

  console.log(`Mesmo FamilyTask ID mantido: ${reactivatedSameId ? 'PASS' : 'FAIL'}`);
  console.log(`active = true: ${reactivatedActive ? 'PASS' : 'FAIL'}`);
  console.log(`Sem backfill no passado: ${noPastBackfill ? 'PASS' : 'FAIL'}`);
  console.log(`Ocorrências futuras restauradas para SCHEDULED: ${restoredFutureScheduled ? 'PASS' : 'FAIL'}`);

  // --------------------------------------------------
  // I. DAY ROLLOVER
  // --------------------------------------------------
  console.log('\n--- I. DAY ROLLOVER ---');
  const dayN_today = '2026-03-10';
  const dayN_horizon = getRollingDateHorizon(dayN_today, 15);
  const rolloverRoutine: FamilyTask = { ...R1, start_date: '2026-03-01' };
  const dayN_occs = RoutineGenerator.generateMissingOccurrences({
    routine: rolloverRoutine,
    familyId: family.id,
    horizonDates: dayN_horizon,
    existingOccurrences: []
  });

  const dayN1_today = '2026-03-11';
  const dayN1_horizon = getRollingDateHorizon(dayN1_today, 15);
  const dayN1_missing = RoutineGenerator.generateMissingOccurrences({
    routine: rolloverRoutine,
    familyId: family.id,
    horizonDates: dayN1_horizon,
    existingOccurrences: dayN_occs
  });

  const dayN1NewDates = dayN1_missing.map(o => o.scheduled_date);
  const correctNewDate = dayN1_missing.length === 1 && dayN1_missing[0].scheduled_date === '2026-03-25';
  console.log(`Day N (2026-03-10) gerou ${dayN_occs.length} ocorrências (${dayN_horizon[0]} a ${dayN_horizon[14]})`);
  console.log(`Day N+1 (2026-03-11) gerou ${dayN1_missing.length} ocorrência adicional -> ${dayN1NewDates.join(', ')}`);
  console.log(`Data adicionada é exatamente D14 (2026-03-25): ${correctNewDate ? 'PASS' : 'FAIL'}`);

  console.log('\n====================================================');
  console.log('FIM DA AUDITORIA DA FAMÍLIA REAL');
  console.log('====================================================');
}

verifyRealFamilySuite().catch(console.error);
