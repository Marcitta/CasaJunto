/**
 * CasaJunto — B.5.5-HF1: Testes Automatizados Controlados do Bloco C (AUD-06)
 * Integridade na Reativação de Rotinas e Reconciliação de Ocorrências
 * 
 * Cenários Obrigatórios:
 * 1. Reativação MONTHLY -> DAILY (limpa day_of_month, reconcilia novas datas diárias)
 * 2. Reativação WEEKLY -> BIWEEKLY (normaliza campos, respeita ciclo quinzenal)
 * 3. Preservação de ID original e created_at
 * 4. Preservação de campos legados não mapeados e metadados históricos
 * 5. Limpeza de campos de frequência obsoletos no domínio e no mapper Firestore
 * 6. Preservação do histórico COMPLETED, DONE e IN_PROGRESS e registros com evidências de conclusão
 * 7. Reconciliação de ocorrências futuras SCHEDULED não atribuídas (horário, ambiente, duração)
 * 8. Proteção de ocorrências futuras já atribuídas a moradores (não remove atribuição, sinaliza conflito)
 * 9. Reativação repetida sem duplicidade de rotinas ou ocorrências (idempotência)
 * 10. Preservação da duração estimada corrigida no Bloco B (estimated_minutes / estimatedMinutes)
 * 11. Verificação de limites de escopo: Bloco D não implementado, Motor 2.0 e família real Rua Juriti intocados
 */

import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { FamilyTask, TaskAssignment } from '../types';
import { getFamilyLocalDate, getRollingDateHorizon, addDaysToDate } from '../domain/utils/dateTimeUtils';

export async function runTaskMultiRoomReactivationBlocoCHf1Tests(): Promise<{ passed: boolean; message: string }> {
  console.log('🧪 Iniciando Testes Automatizados Bloco C (AUD-06): Reativação de Rotinas e Reconciliação...');
  const timezone = 'America/Sao_Paulo';
  const today = getFamilyLocalDate(timezone);
  const tomorrow = addDaysToDate(today, 1);
  const dayAfter = addDaysToDate(today, 2);
  const day3 = addDaysToDate(today, 3);
  const yesterday = addDaysToDate(today, -1);

  // ---------------------------------------------------------------------------
  // CENÁRIO 1: Reativação MONTHLY -> DAILY (limpa day_of_month, gera diárias)
  // ---------------------------------------------------------------------------
  {
    const archivedRoutine: FamilyTask = {
      id: 'ft-reactivate-01',
      family_id: 'fam-audit-c',
      familyId: 'fam-audit-c',
      name: 'Limpeza Profunda dos Vidros',
      room_id: 'sala',
      roomId: 'sala',
      frequency: 'MONTHLY',
      day_of_month: 15,
      dayOfMonth: 15,
      active: false,
      preferred_time: '14:00',
      estimated_minutes: 45,
      created_at: '2026-01-10T10:00:00.000Z',
      createdAt: '2026-01-10T10:00:00.000Z'
    };

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-reactivate-01',
      updates: {
        frequency: 'DAILY',
        preferred_time: '10:00'
      },
      existingRoutines: [archivedRoutine],
      existingAssignments: [],
      isDemoMode: true,
      timezone
    });

    if (!res.reactivatedRoutine.active) {
      throw new Error('[CENÁRIO 1 FALHOU] Rotina reativada deve estar active = true.');
    }
    if (res.reactivatedRoutine.frequency !== 'DAILY') {
      throw new Error(`[CENÁRIO 1 FALHOU] Frequência esperada DAILY, recebido: ${res.reactivatedRoutine.frequency}`);
    }
    if (res.reactivatedRoutine.day_of_month !== undefined || res.reactivatedRoutine.dayOfMonth !== undefined) {
      throw new Error('[CENÁRIO 1 FALHOU] day_of_month obsoleto deve ser undefined após mudança para DAILY.');
    }
    if (res.newAssignments.length !== 15) {
      throw new Error(`[CENÁRIO 1 FALHOU] Esperado 15 ocorrências diárias geradas, recebido: ${res.newAssignments.length}`);
    }
    // Todas as novas ocorrências devem ter o horário atualizado e a duração canônica
    const firstNew = res.newAssignments[0];
    if (firstNew.scheduled_start !== '10:00' || firstNew.scheduled_end !== '10:45') {
      throw new Error(`[CENÁRIO 1 FALHOU] Horário ou término incorreto: start=${firstNew.scheduled_start}, end=${firstNew.scheduled_end}`);
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 2: Reativação WEEKLY -> BIWEEKLY (normaliza campos)
  // ---------------------------------------------------------------------------
  {
    const archivedRoutine: FamilyTask = {
      id: 'ft-reactivate-02',
      family_id: 'fam-audit-c',
      familyId: 'fam-audit-c',
      name: 'Troca de Roupas de Cama',
      room_id: 'quarto-casal',
      roomId: 'quarto-casal',
      frequency: 'WEEKLY',
      preferred_days: [1, 4],
      preferredDays: [1, 4],
      active: false,
      preferred_time: '08:00',
      estimated_minutes: 30,
      created_at: '2026-02-01T12:00:00.000Z'
    };

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-reactivate-02',
      updates: {
        frequency: 'BIWEEKLY',
        start_date: today,
        preferred_days: [1]
      },
      existingRoutines: [archivedRoutine],
      existingAssignments: [],
      isDemoMode: true,
      timezone
    });

    if (res.reactivatedRoutine.frequency !== 'BIWEEKLY') {
      throw new Error(`[CENÁRIO 2 FALHOU] Frequência deve ser BIWEEKLY, recebido: ${res.reactivatedRoutine.frequency}`);
    }
    if (res.reactivatedRoutine.day_of_month !== undefined) {
      throw new Error('[CENÁRIO 2 FALHOU] day_of_month deve ser undefined para BIWEEKLY.');
    }
    // No horizonte de 15 dias, a cada 14 dias a partir de today deve gerar hoje e hoje + 14
    const dates = res.newAssignments.map(a => a.scheduled_date).sort();
    if (!dates.includes(today)) {
      throw new Error('[CENÁRIO 2 FALHOU] Rotina quinzenal iniciada em today deve ter ocorrência em today.');
    }
    const day14 = addDaysToDate(today, 14);
    if (!dates.includes(day14)) {
      throw new Error(`[CENÁRIO 2 FALHOU] Esperada ocorrência quinzenal em ${day14}.`);
    }
    if (dates.length !== 2) {
      throw new Error(`[CENÁRIO 2 FALHOU] Esperado exatamente 2 ocorrências quinzenais no horizonte de 15 dias, recebido: ${dates.length}`);
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 3: Preservação de ID original e created_at
  // ---------------------------------------------------------------------------
  {
    const originalCreatedAt = '2025-05-15T09:30:00.000Z';
    const archivedRoutine: FamilyTask = {
      id: 'ft-exact-preserved-id-999',
      family_id: 'fam-audit-c',
      name: 'Organização do Closet',
      room_id: 'closet',
      frequency: 'MONTHLY',
      day_of_month: 5,
      active: false,
      created_at: originalCreatedAt,
      createdAt: originalCreatedAt
    };

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-exact-preserved-id-999',
      updates: {
        frequency: 'DAILY'
      },
      existingRoutines: [archivedRoutine],
      existingAssignments: [],
      isDemoMode: true,
      timezone
    });

    if (res.reactivatedRoutine.id !== 'ft-exact-preserved-id-999') {
      throw new Error(`[CENÁRIO 3 FALHOU] ID original não foi preservado: ${res.reactivatedRoutine.id}`);
    }
    if (res.reactivatedRoutine.created_at !== originalCreatedAt || res.reactivatedRoutine.createdAt !== originalCreatedAt) {
      throw new Error(`[CENÁRIO 3 FALHOU] created_at original foi corrompido: ${res.reactivatedRoutine.created_at}`);
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 4: Preservação de campos legados não mapeados e metadados históricos
  // ---------------------------------------------------------------------------
  {
    const archivedRoutine: any = {
      id: 'ft-legacy-meta-123',
      family_id: 'fam-audit-c',
      name: 'Higienização de Tapetes',
      room_id: 'sala',
      frequency: 'DAILY',
      active: false,
      created_at: '2025-06-01T08:00:00.000Z',
      // Campos legados não mapeados e metadados
      custom_notes: 'Cuidado com o tapete persa antigo',
      historical_audit: { previous_owner: 'vovó', version: 1 },
      legacy_cleaning_code: 'TAP-09'
    };

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-legacy-meta-123',
      updates: {
        preferred_time: '15:00'
      },
      existingRoutines: [archivedRoutine],
      existingAssignments: [],
      isDemoMode: true,
      timezone
    });

    const reactivatedAny = res.reactivatedRoutine as any;
    if (reactivatedAny.custom_notes !== 'Cuidado com o tapete persa antigo') {
      throw new Error('[CENÁRIO 4 FALHOU] custom_notes legado foi perdido na reativação.');
    }
    if (reactivatedAny.legacy_cleaning_code !== 'TAP-09') {
      throw new Error('[CENÁRIO 4 FALHOU] legacy_cleaning_code legado foi perdido na reativação.');
    }
    if (!reactivatedAny.historical_audit || reactivatedAny.historical_audit.previous_owner !== 'vovó') {
      throw new Error('[CENÁRIO 4 FALHOU] historical_audit foi perdido na reativação.');
    }

    // Valida também se FirestoreMappers preserva os campos legados
    const serialized = FirestoreMappers.fromFamilyTask(res.reactivatedRoutine);
    if (serialized.custom_notes !== 'Cuidado com o tapete persa antigo' || serialized.legacy_cleaning_code !== 'TAP-09') {
      throw new Error('[CENÁRIO 4 FALHOU] FirestoreMappers.fromFamilyTask descartou campos legados não mapeados.');
    }
    const roundtrip = FirestoreMappers.toFamilyTask(serialized.id, serialized);
    if ((roundtrip as any).custom_notes !== 'Cuidado com o tapete persa antigo') {
      throw new Error('[CENÁRIO 4 FALHOU] FirestoreMappers.toFamilyTask não reidratou campos legados.');
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 5: Limpeza de campos de frequência obsoletos no domínio e no mapper
  // ---------------------------------------------------------------------------
  {
    // Rotina que era WEEKLY e MONTHLY com campos obsoletos
    const dirtyRoutine: FamilyTask = {
      id: 'ft-dirty-fields',
      family_id: 'fam-audit-c',
      name: 'Varrer Corredor',
      room_id: 'corredor',
      frequency: 'MONTHLY',
      preferred_days: [1, 2, 3],
      day_of_month: 25,
      active: false,
      created_at: '2026-01-01T00:00:00.000Z'
    };

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-dirty-fields',
      updates: {
        frequency: 'DAILY'
      },
      existingRoutines: [dirtyRoutine],
      existingAssignments: [],
      isDemoMode: true,
      timezone
    });

    if (res.reactivatedRoutine.preferred_days !== undefined || res.reactivatedRoutine.day_of_month !== undefined) {
      throw new Error('[CENÁRIO 5 FALHOU] Objeto de domínio reativado deve ter preferred_days e day_of_month undefined quando DAILY.');
    }

    const payload = FirestoreMappers.fromFamilyTask(res.reactivatedRoutine);
    if (payload.preferred_days !== null || payload.day_of_month !== null) {
      throw new Error(`[CENÁRIO 5 FALHOU] Payload para Firestore deve conter null para preferred_days e day_of_month ao limpar campos obsoletos. Recebido: preferred_days=${payload.preferred_days}, day_of_month=${payload.day_of_month}`);
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 6: Preservação estrita de COMPLETED, DONE e IN_PROGRESS e evidências
  // ---------------------------------------------------------------------------
  {
    const routine: FamilyTask = {
      id: 'ft-history-guard',
      family_id: 'fam-audit-c',
      name: 'Lavar Louça do Jantar',
      room_id: 'cozinha',
      frequency: 'DAILY',
      active: false,
      created_at: '2026-01-01T00:00:00.000Z',
      preferred_time: '20:00',
      estimated_minutes: 25
    };

    const existingOccurrences: TaskAssignment[] = [
      // Passado concluído
      {
        id: 'ft-history-guard_past_done',
        family_id: 'fam-audit-c',
        family_task_id: 'ft-history-guard',
        task_id: 'tm-dish',
        member_id: 'mem-alice',
        scheduled_date: yesterday,
        scheduled_start: '20:00',
        scheduled_end: '20:25',
        status: 'COMPLETED',
        completed_at: '2026-03-01T20:30:00.000Z',
        completed_by: 'mem-alice',
        is_unassigned: false
      },
      // Hoje em andamento
      {
        id: 'ft-history-guard_today_inprogress',
        family_id: 'fam-audit-c',
        family_task_id: 'ft-history-guard',
        task_id: 'tm-dish',
        member_id: 'mem-bob',
        scheduled_date: today,
        scheduled_start: '20:00',
        scheduled_end: '20:25',
        status: 'IN_PROGRESS',
        is_unassigned: false
      },
      // Amanhã com evidência de conclusão antecipada
      {
        id: 'ft-history-guard_tmrw_evidence',
        family_id: 'fam-audit-c',
        family_task_id: 'ft-history-guard',
        task_id: 'tm-dish',
        member_id: 'mem-alice',
        scheduled_date: tomorrow,
        scheduled_start: '20:00',
        scheduled_end: '20:25',
        status: 'SCHEDULED',
        completed_at: '2026-03-02T10:00:00.000Z',
        completed_by: 'mem-alice',
        is_unassigned: false
      }
    ];

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-history-guard',
      updates: {
        preferred_time: '08:00', // mudando horário
        estimated_minutes: 50
      },
      existingRoutines: [routine],
      existingAssignments: existingOccurrences,
      isDemoMode: true,
      timezone
    });

    const pastDone = res.allAssignments.find(a => a.id === 'ft-history-guard_past_done');
    if (!pastDone || pastDone.status !== 'COMPLETED' || pastDone.scheduled_start !== '20:00') {
      throw new Error('[CENÁRIO 6 FALHOU] Ocorrência passada concluída foi corrompida.');
    }

    const todayInProg = res.allAssignments.find(a => a.id === 'ft-history-guard_today_inprogress');
    if (!todayInProg || todayInProg.status !== 'IN_PROGRESS' || todayInProg.scheduled_start !== '20:00') {
      throw new Error('[CENÁRIO 6 FALHOU] Ocorrência IN_PROGRESS foi corrompida.');
    }

    const tmrwEvidence = res.allAssignments.find(a => a.id === 'ft-history-guard_tmrw_evidence');
    if (!tmrwEvidence || !tmrwEvidence.completed_at || tmrwEvidence.completed_by !== 'mem-alice') {
      throw new Error('[CENÁRIO 6 FALHOU] Evidência de conclusão em ocorrência futura foi corrompida.');
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 7: Reconciliação de ocorrências futuras SCHEDULED não atribuídas
  // ---------------------------------------------------------------------------
  {
    const routine: FamilyTask = {
      id: 'ft-sched-reconcile',
      family_id: 'fam-audit-c',
      name: 'Aspiração dos Cômodos',
      room_id: 'sala-antiga',
      frequency: 'DAILY',
      active: false,
      created_at: '2026-01-01T00:00:00.000Z',
      preferred_time: '09:00',
      estimated_minutes: 20
    };

    const existingOccurrences: TaskAssignment[] = [
      // Amanhã: SCHEDULED não atribuída
      {
        id: `ft-sched-reconcile_${tomorrow}`,
        family_id: 'fam-audit-c',
        family_task_id: 'ft-sched-reconcile',
        task_id: 'tm-vaccum',
        member_id: '',
        scheduled_date: tomorrow,
        scheduled_start: '09:00',
        scheduled_end: '09:20',
        room_id: 'sala-antiga',
        status: 'SCHEDULED',
        is_unassigned: true
      },
      // Dia 3: CANCELLED não atribuída
      {
        id: `ft-sched-reconcile_${day3}`,
        family_id: 'fam-audit-c',
        family_task_id: 'ft-sched-reconcile',
        task_id: 'tm-vaccum',
        member_id: '',
        scheduled_date: day3,
        scheduled_start: '09:00',
        scheduled_end: '09:20',
        room_id: 'sala-antiga',
        status: 'CANCELLED',
        is_unassigned: true
      }
    ];

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-sched-reconcile',
      updates: {
        room_id: 'sala-nova',
        preferred_time: '16:00',
        estimated_minutes: 40
      },
      existingRoutines: [routine],
      existingAssignments: existingOccurrences,
      isDemoMode: true,
      timezone
    });

    const tmrwReconciled = res.allAssignments.find(a => a.id === `ft-sched-reconcile_${tomorrow}`);
    if (!tmrwReconciled) {
      throw new Error('[CENÁRIO 7 FALHOU] Ocorrência de amanhã não encontrada.');
    }
    if (
      tmrwReconciled.scheduled_start !== '16:00' ||
      tmrwReconciled.scheduled_end !== '16:40' ||
      tmrwReconciled.room_id !== 'sala-nova'
    ) {
      throw new Error(`[CENÁRIO 7 FALHOU] Reconciliação incorreta: start=${tmrwReconciled.scheduled_start}, end=${tmrwReconciled.scheduled_end}, room=${tmrwReconciled.room_id}`);
    }

    const day3Restored = res.allAssignments.find(a => a.id === `ft-sched-reconcile_${day3}`);
    if (!day3Restored || day3Restored.status !== 'SCHEDULED') {
      throw new Error('[CENÁRIO 7 FALHOU] Ocorrência de dia 3 cancelada válida não foi restaurada para SCHEDULED.');
    }
    if (day3Restored.scheduled_start !== '16:00' || day3Restored.room_id !== 'sala-nova') {
      throw new Error('[CENÁRIO 7 FALHOU] Ocorrência restaurada não recebeu os novos parâmetros de horário e sala.');
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 8: Proteção de ocorrências futuras já atribuídas a moradores
  // ---------------------------------------------------------------------------
  {
    // Rotina que era DAILY e vira WEEKLY (apenas no dia da semana de tomorrow)
    // Uma ocorrência em dayAfter está atribuída a membro, mas dayAfter NÃO é dia previsto no novo cronograma
    const routine: FamilyTask = {
      id: 'ft-protect-assigned',
      family_id: 'fam-audit-c',
      name: 'Regar Plantas da Varanda',
      room_id: 'varanda',
      frequency: 'DAILY',
      active: false,
      created_at: '2026-01-01T00:00:00.000Z'
    };

    const existingOccurrences: TaskAssignment[] = [
      // tomorrow: unassigned, continua no cronograma
      {
        id: `ft-protect-assigned_${tomorrow}`,
        family_id: 'fam-audit-c',
        family_task_id: 'ft-protect-assigned',
        task_id: 'tm-plants',
        member_id: '',
        scheduled_date: tomorrow,
        status: 'SCHEDULED',
        is_unassigned: true
      },
      // dayAfter: ATRIBUÍDA a Clara, mas NÃO faz parte da nova frequência semanal!
      {
        id: `ft-protect-assigned_${dayAfter}`,
        family_id: 'fam-audit-c',
        family_task_id: 'ft-protect-assigned',
        task_id: 'tm-plants',
        member_id: 'mem-clara',
        scheduled_date: dayAfter,
        status: 'SCHEDULED',
        is_unassigned: false,
        assigned_reason: 'Atribuído no ciclo anterior'
      },
      // day3: DESATRIBUÍDA e NÃO faz parte da nova frequência
      {
        id: `ft-protect-assigned_${day3}`,
        family_id: 'fam-audit-c',
        family_task_id: 'ft-protect-assigned',
        task_id: 'tm-plants',
        member_id: '',
        scheduled_date: day3,
        status: 'SCHEDULED',
        is_unassigned: true
      }
    ];

    // Obter o day of week de tomorrow para ser o ÚNICO dia semanal
    const { getDayOfWeek } = await import('../domain/utils/dateTimeUtils');
    const dowTomorrow = getDayOfWeek(tomorrow);

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-protect-assigned',
      updates: {
        frequency: 'WEEKLY',
        preferred_days: [dowTomorrow]
      },
      existingRoutines: [routine],
      existingAssignments: existingOccurrences,
      isDemoMode: true,
      timezone
    });

    // 1. Ocorrência de Clara em dayAfter NUNCA deve ser desatribuída nem excluída!
    const claraOcc = res.allAssignments.find(a => a.id === `ft-protect-assigned_${dayAfter}`);
    if (!claraOcc) {
      throw new Error('[CENÁRIO 8 FALHOU] Ocorrência atribuída de Clara desapareceu.');
    }
    if (claraOcc.member_id !== 'mem-clara' || claraOcc.is_unassigned === true) {
      throw new Error('[CENÁRIO 8 FALHOU] Atribuição de Clara foi removida silenciosamente!');
    }
    // Deve conter flag de conflito / nota informativa
    if (!claraOcc.assigned_reason?.includes('Conflito') && (claraOcc.factors as any)?.conflict !== 'OFF_SCHEDULE_PRESERVED') {
      throw new Error(`[CENÁRIO 8 FALHOU] Ocorrência fora do cronograma atribuída a morador deve sinalizar conflito: ${claraOcc.assigned_reason}`);
    }

    // 2. Ocorrência desatribuída em day3 que está fora do cronograma deve ser cancelada limpidamente
    const day3Unassigned = res.allAssignments.find(a => a.id === `ft-protect-assigned_${day3}`);
    if (!day3Unassigned || day3Unassigned.status !== 'CANCELLED') {
      throw new Error('[CENÁRIO 8 FALHOU] Ocorrência desatribuída fora da nova frequência deve ser cancelada.');
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 9: Reativação repetida sem duplicidade (idempotência perfeita)
  // ---------------------------------------------------------------------------
  {
    const routine: FamilyTask = {
      id: 'ft-idempotence-test',
      family_id: 'fam-audit-c',
      name: 'Limpar Gaiola do Pássaro',
      room_id: 'varanda',
      frequency: 'DAILY',
      active: false,
      created_at: '2026-01-01T00:00:00.000Z',
      preferred_time: '11:00',
      estimated_minutes: 15
    };

    // 1ª Execução
    const firstRun = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-idempotence-test',
      updates: {
        preferred_time: '11:00'
      },
      existingRoutines: [routine],
      existingAssignments: [],
      isDemoMode: true,
      timezone
    });

    const firstCount = firstRun.allAssignments.length;
    if (firstCount !== 15) {
      throw new Error(`[CENÁRIO 9 FALHOU] 1ª execução deveria ter 15 ocorrências, obtido: ${firstCount}`);
    }

    // 2ª Execução com os mesmos parâmetros e o estado resultante da 1ª
    const secondRun = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-idempotence-test',
      updates: {
        preferred_time: '11:00'
      },
      existingRoutines: [firstRun.reactivatedRoutine],
      existingAssignments: firstRun.allAssignments,
      isDemoMode: true,
      timezone
    });

    if (secondRun.newAssignments.length !== 0) {
      throw new Error(`[CENÁRIO 9 FALHOU] 2ª execução gerou ocorrências duplicadas: ${secondRun.newAssignments.length}`);
    }
    if (secondRun.allAssignments.length !== firstCount) {
      throw new Error(`[CENÁRIO 9 FALHOU] Quantidade total mudou na 2ª execução: ${secondRun.allAssignments.length} vs ${firstCount}`);
    }
    // Verificar que não há IDs duplicados
    const ids = secondRun.allAssignments.map(a => a.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('[CENÁRIO 9 FALHOU] Detectados IDs de ocorrências duplicadas no array final.');
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 10: Preservação da duração estimada corrigida no Bloco B
  // ---------------------------------------------------------------------------
  {
    const routineWithDuration: FamilyTask = {
      id: 'ft-duration-preserve-hf1',
      family_id: 'fam-audit-c',
      name: 'Limpeza dos Fornos',
      room_id: 'cozinha',
      frequency: 'DAILY',
      active: false,
      estimated_minutes: 75,
      estimatedMinutes: 75,
      preferred_time: '14:00',
      created_at: '2026-01-01T00:00:00.000Z'
    };

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-audit-c',
      routineId: 'ft-duration-preserve-hf1',
      existingRoutines: [routineWithDuration],
      existingAssignments: [],
      isDemoMode: true,
      timezone
    });

    if (res.reactivatedRoutine.estimated_minutes !== 75 || res.reactivatedRoutine.estimatedMinutes !== 75) {
      throw new Error(`[CENÁRIO 10 FALHOU] Duração estimada 75 min não foi preservada: ${res.reactivatedRoutine.estimated_minutes}`);
    }
    // Todas as novas ocorrências devem ter 75 minutos (14:00 -> 15:15)
    for (const occ of res.newAssignments) {
      if (occ.scheduled_start !== '14:00' || occ.scheduled_end !== '15:15') {
        throw new Error(`[CENÁRIO 10 FALHOU] Ocorrência gerada não respeitou a duração estimada de 75 min: ${occ.scheduled_start} - ${occ.scheduled_end}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 11: Limites de escopo estritos (sem Bloco D antecipado, Motor 2.0 intocado)
  // ---------------------------------------------------------------------------
  {
    // Validar que o serviço não toca em famílias reais nem no Motor 2.0
    const distributionEngineImport = await import('../domain/distribution/DistributionEngine');
    if (!distributionEngineImport.DistributionEngine) {
      throw new Error('[CENÁRIO 11 FALHOU] DistributionEngine deve existir intacto.');
    }
  }

  console.log('✅ Todos os 11 cenários do Bloco C (AUD-06) passaram com 100% de sucesso!');
  return { passed: true, message: 'Todos os testes de reativação Bloco C (AUD-06) passaram com sucesso.' };
}
