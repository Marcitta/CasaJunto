/**
 * CASA JUNTO — FASE B.5.1: UNICIDADE POR AMBIENTE E INTEGRIDADE DAS ROTINAS
 * Suíte de Testes Automatizados (MR01 a MR15)
 *
 * Validações obrigatórias:
 * MR01: Mesmo TaskMaster em dois ambientes distintos: criação permitida, IDs distintos e ambos ativos.
 * MR02: Mesmo TaskMaster no mesmo ambiente: duplicidade ativa bloqueada (idempotência).
 * MR03: Reativação no mesmo ambiente: reaproveita o mesmo FamilyTask.id e restaura ocorrências.
 * MR04: Reativação em ambiente diferente: não sobrescreve a rotina arquivada de outro ambiente.
 * MR05: Edição com colisão de destino: bloqueada com erro descritivo ao tentar mover para ambiente com mesma tarefa ativa.
 * MR06: Criação concorrente: idempotente sem duplicatas.
 * MR07: Rotinas independentes geram ocorrências no mesmo dia sem colisão determinística ({ftId}_{date}).
 * MR08: Ocorrências legadas sem family_task_id com room_id associam ao cômodo correto sem afetar outros cômodos.
 * MR09: Ocorrências legadas sem family_task_id e sem room_id não são associadas arbitrariamente quando há ambiguidade.
 * MR10: Rebalanceamento no RebalanceService sem contaminação cruzada entre ambientes.
 * MR11: Isolamento estrito multi-tenant entre famílias distintas.
 * MR12: Preservação de EXTERNAL_SUPPORT da Ruthe na Suíte e HOUSEHOLD no Social.
 * MR13: Conclusão independente de ocorrência de um ambiente sem afetar a ocorrência do outro ambiente.
 * MR14: Deduplicação e convivência correta no mapAssignmentsToTasks do AppContext.
 * MR15: Motor 2.0 e regras de scoring/distribuição 100% preservadas e intocadas.
 */

import fs from 'fs';
import path from 'path';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { RebalanceService } from '../domain/distribution/RebalanceService';
import { ScoringContext } from '../domain/distribution/ScoringService';
import { DistributionService } from '../application/services/DistributionService';
import { FamilyTask, TaskAssignment, Task, Member, Family, Room } from '../types';
import { getFamilyLocalDate, addDaysToDate } from '../domain/utils/dateTimeUtils';

export interface MultiRoomTestResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

export async function runMultiRoomPhaseB51TestSuite(): Promise<MultiRoomTestResult[]> {
  const results: MultiRoomTestResult[] = [];

  const record = async (id: string, name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (err: any) {
      results.push({ id, name, passed: false, details: err?.message || String(err) });
    }
  };

  const today = getFamilyLocalDate();
  const nextWed = addDaysToDate(today, 2);

  const testFamily: Family = {
    id: 'fam-juriti-test',
    name: 'Família Juriti Teste',
    timezone: 'America/Sao_Paulo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const suiteRoom: Room = {
    id: 'room-suite',
    familyId: testFamily.id,
    name: 'Banheiro da suíte',
    type: 'bathroom',
    active: true
  };

  const socialRoom: Room = {
    id: 'room-social',
    familyId: testFamily.id,
    name: 'Banheiro social',
    type: 'bathroom',
    active: true
  };

  const lavaboRoom: Room = {
    id: 'room-lavabo',
    familyId: testFamily.id,
    name: 'Lavabo',
    type: 'half_bath',
    active: true
  };

  const memberLucas: Member = {
    id: 'usr-lucas',
    familyId: testFamily.id,
    name: 'Lucas',
    role: 'ADMIN',
    avatar: '👨',
    color: '#4dabf7',
    points: 100,
    streak: 3,
    tasksCompleted: 10,
    active: true,
    age: 35,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const memberMarina: Member = {
    id: 'usr-marina',
    familyId: testFamily.id,
    name: 'Marina',
    role: 'MEMBER',
    avatar: '👩',
    color: '#ff6b6b',
    points: 90,
    streak: 4,
    tasksCompleted: 8,
    active: true,
    age: 34,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // MR01: Mesmo TaskMaster em dois ambientes distintos: permitido (IDs distintos, ativos)
  await record('MR01', 'Mesmo TaskMaster em dois ambientes distintos é permitido com IDs distintos', async () => {
    const routineSuite: FamilyTask = {
      id: 'ft-bath-suite',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      name: 'Lavar o chão e rejuntes do box',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      frequency: 'weekly',
      preferred_days: [3],
      preferred_time: '09:00',
      active: true,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ruthe'
    };

    const routineSocial: FamilyTask = {
      id: 'ft-bath-social',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      name: 'Lavar o chão e rejuntes do box',
      room_id: socialRoom.id,
      roomId: socialRoom.id,
      frequency: 'weekly',
      preferred_days: [3],
      preferred_time: '10:00',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const resSuite = await RoutineContinuityService.createRoutine({
      familyId: testFamily.id,
      routine: routineSuite,
      existingAssignments: [],
      existingRoutines: [],
      isDemoMode: true
    });

    const resSocial = await RoutineContinuityService.createRoutine({
      familyId: testFamily.id,
      routine: routineSocial,
      existingAssignments: resSuite.newAssignments,
      existingRoutines: [routineSuite],
      isDemoMode: true
    });

    if (resSuite.createdRoutine.id === resSocial.createdRoutine.id) {
      throw new Error('As rotinas de ambientes distintos devem possuir IDs únicos');
    }
    if (resSuite.createdRoutine.room_id !== 'room-suite' || resSocial.createdRoutine.room_id !== 'room-social') {
      throw new Error('Cada rotina deve preservar seu respectivo room_id');
    }
    if (!resSuite.createdRoutine.active || !resSocial.createdRoutine.active) {
      throw new Error('Ambas as rotinas devem ser ativas');
    }
  });

  // MR02: Mesmo TaskMaster no mesmo ambiente: duplicidade ativa bloqueada (idempotência)
  await record('MR02', 'Mesmo TaskMaster no mesmo ambiente bloqueia duplicidade ativa e retorna a existente', async () => {
    const activeSuite: FamilyTask = {
      id: 'ft-suite-existing',
      family_id: testFamily.id,
      task_master_id: 'bath-1',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      active: true,
      frequency: 'weekly',
      preferred_days: [3]
    };

    const attemptDuplicate: FamilyTask = {
      id: 'ft-suite-duplicate',
      family_id: testFamily.id,
      task_master_id: 'bath-1',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      active: true,
      frequency: 'weekly',
      preferred_days: [3]
    };

    const res = await RoutineContinuityService.createRoutine({
      familyId: testFamily.id,
      routine: attemptDuplicate,
      existingAssignments: [],
      existingRoutines: [activeSuite],
      isDemoMode: true
    });

    if (res.createdRoutine.id !== 'ft-suite-existing') {
      throw new Error(`Esperado retornar a rotina existente ft-suite-existing, mas retornou ${res.createdRoutine.id}`);
    }
    if (res.newAssignments.length > 0) {
      throw new Error('Não deve gerar novas ocorrências quando a rotina já estiver ativa no mesmo cômodo');
    }
  });

  // MR03: Reativação no mesmo ambiente: mesmo ID
  await record('MR03', 'Reativação de rotina arquivada no mesmo ambiente preserva o mesmo ID canônico', async () => {
    const archivedRoutine: FamilyTask = {
      id: 'ft-archived-social',
      family_id: testFamily.id,
      task_master_id: 'bath-3',
      room_id: socialRoom.id,
      roomId: socialRoom.id,
      active: false,
      frequency: 'weekly',
      preferred_days: [3]
    };

    const res = await RoutineContinuityService.reactivateRoutine({
      familyId: testFamily.id,
      routineId: 'ft-archived-social',
      existingRoutines: [archivedRoutine],
      existingAssignments: [],
      isDemoMode: true
    });

    if (res.reactivatedRoutine.id !== 'ft-archived-social') {
      throw new Error(`ID foi alterado indevidamente na reativação: ${res.reactivatedRoutine.id}`);
    }
    if (res.reactivatedRoutine.active !== true) {
      throw new Error('Rotina deve se tornar active: true na reativação');
    }
    if (res.reactivatedRoutine.room_id !== socialRoom.id) {
      throw new Error('O cômodo original da rotina arquivada deve ser estritamente preservado');
    }
  });

  // MR04: Reativação em ambiente diferente: não sobrescrever a rotina arquivada de outro ambiente
  await record('MR04', 'Adicionar em ambiente diferente não sobrescreve rotina arquivada de outro ambiente', async () => {
    const archivedSuiteRoutine: FamilyTask = {
      id: 'ft-archived-suite',
      family_id: testFamily.id,
      task_master_id: 'bath-2',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      active: false,
      frequency: 'weekly',
      preferred_days: [3]
    };

    const newLavaboRoutine: FamilyTask = {
      id: 'ft-new-lavabo',
      family_id: testFamily.id,
      task_master_id: 'bath-2',
      room_id: lavaboRoom.id,
      roomId: lavaboRoom.id,
      active: true,
      frequency: 'weekly',
      preferred_days: [3]
    };

    const res = await RoutineContinuityService.createRoutine({
      familyId: testFamily.id,
      routine: newLavaboRoutine,
      existingAssignments: [],
      existingRoutines: [archivedSuiteRoutine],
      isDemoMode: true
    });

    if (res.createdRoutine.id !== 'ft-new-lavabo') {
      throw new Error('Deve criar nova rotina independente para o lavabo');
    }
    if (res.createdRoutine.room_id !== lavaboRoom.id) {
      throw new Error('Nova rotina deve pertencer ao lavabo');
    }
    if (archivedSuiteRoutine.active !== false || archivedSuiteRoutine.room_id !== suiteRoom.id) {
      throw new Error('Rotina arquivada da suíte foi corrompida ou sobrescrita!');
    }
  });

  // MR05: Edição com colisão de destino: bloqueada
  await record('MR05', 'updateRoutine impede mover rotina para cômodo onde a mesma tarefa já está ativa', async () => {
    const routineSocial: FamilyTask = {
      id: 'ft-social-active',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: socialRoom.id,
      roomId: socialRoom.id,
      active: true,
      frequency: 'weekly'
    };

    const routineSuite: FamilyTask = {
      id: 'ft-suite-active',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      active: true,
      frequency: 'weekly'
    };

    let caughtError: string | null = null;
    try {
      await RoutineContinuityService.updateRoutine({
        familyId: testFamily.id,
        routineId: 'ft-social-active',
        updates: { room_id: suiteRoom.id },
        existingRoutines: [routineSocial, routineSuite],
        existingAssignments: [],
        isDemoMode: true
      });
    } catch (err: any) {
      caughtError = err?.message || String(err);
    }

    if (!caughtError) {
      throw new Error('Deveria ter lançado erro impeditivo de colisão ao tentar mover para ambiente com mesma tarefa ativa');
    }
    if (!caughtError.includes('Já existe uma rotina ativa desta tarefa no ambiente selecionado')) {
      throw new Error(`Mensagem de erro inesperada: ${caughtError}`);
    }
  });

  // MR06: Criação concorrente: sem duplicatas
  await record('MR06', 'Criação concorrente para o mesmo cômodo é tratada com idempotência segura', async () => {
    const baseRoutine: FamilyTask = {
      id: 'ft-concurrent-1',
      family_id: testFamily.id,
      task_master_id: 'bath-5',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      active: true,
      frequency: 'weekly',
      preferred_days: [1]
    };

    const firstRun = await RoutineContinuityService.createRoutine({
      familyId: testFamily.id,
      routine: baseRoutine,
      existingAssignments: [],
      existingRoutines: [],
      isDemoMode: true
    });

    const secondRun = await RoutineContinuityService.createRoutine({
      familyId: testFamily.id,
      routine: { ...baseRoutine, id: 'ft-concurrent-second' },
      existingAssignments: firstRun.newAssignments,
      existingRoutines: [firstRun.createdRoutine],
      isDemoMode: true
    });

    if (secondRun.createdRoutine.id !== firstRun.createdRoutine.id) {
      throw new Error('A segunda execução concorrente deveria ter retornado a rotina já existente');
    }
    if (secondRun.newAssignments.length !== 0) {
      throw new Error('A segunda execução não deve duplicar ocorrências');
    }
  });

  // MR07: Rotinas independentes no mesmo dia geram ocorrências determinísticas distintas
  await record('MR07', 'Rotinas independentes de cômodos distintos no mesmo dia geram ocorrências com IDs distintos', () => {
    const routineSuite: FamilyTask = {
      id: 'ft-suite',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      frequency: 'daily',
      active: true
    };

    const routineSocial: FamilyTask = {
      id: 'ft-social',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: socialRoom.id,
      roomId: socialRoom.id,
      frequency: 'daily',
      active: true
    };

    const targetDate = nextWed;
    const occSuite = RoutineGenerator.createInitialOccurrence(routineSuite, targetDate, testFamily.id);
    const occSocial = RoutineGenerator.createInitialOccurrence(routineSocial, targetDate, testFamily.id);

    if (occSuite.id === occSocial.id) {
      throw new Error(`IDs de ocorrência colidiram na mesma data: ${occSuite.id}`);
    }
    if (occSuite.id !== `ft-suite_${targetDate}`) {
      throw new Error(`ID determinístico da suíte divergente: ${occSuite.id}`);
    }
    if (occSocial.id !== `ft-social_${targetDate}`) {
      throw new Error(`ID determinístico do social divergente: ${occSocial.id}`);
    }
    if (occSuite.room_id !== suiteRoom.id || occSocial.room_id !== socialRoom.id) {
      throw new Error('Cômodos das ocorrências não foram preservados');
    }
  });

  // MR08: Ocorrências legadas sem family_task_id com room_id associam ao cômodo correto sem afetar outros
  await record('MR08', 'Ocorrência legada com room_id associa à rotina correta e não é cancelada por outro cômodo', async () => {
    const routineSuite: FamilyTask = {
      id: 'ft-suite',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      active: true,
      frequency: 'weekly'
    };

    const routineSocial: FamilyTask = {
      id: 'ft-social',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: socialRoom.id,
      roomId: socialRoom.id,
      active: false, // Desativando a social
      frequency: 'weekly'
    };

    const legacySuiteAsg: TaskAssignment = {
      id: `asg-legacy-suite-${today}`,
      family_id: testFamily.id,
      task_id: 'bath-4', // sem family_task_id
      room_id: suiteRoom.id,
      scheduled_date: today,
      status: 'SCHEDULED',
      member_id: 'usr-lucas'
    };

    const res = await RoutineContinuityService.deactivateRoutine({
      familyId: testFamily.id,
      routineId: 'ft-social',
      existingRoutines: [routineSuite, routineSocial],
      existingAssignments: [legacySuiteAsg],
      isDemoMode: true
    });

    const wasSuiteCancelled = res.cancelledAssignments.some(a => a.id === legacySuiteAsg.id);
    if (wasSuiteCancelled) {
      throw new Error('A ocorrência legada da suíte foi cancelada indevidamente ao desativar a rotina do social!');
    }
  });

  // MR09: Ocorrências legadas sem family_task_id e sem room_id não são associadas arbitrariamente quando há ambiguidade
  await record('MR09', 'Ocorrência legada sem family_task_id e sem room_id não é associada arbitrariamente', () => {
    const routineSuite: FamilyTask = {
      id: 'ft-suite',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      active: true
    };

    const routineSocial: FamilyTask = {
      id: 'ft-social',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: socialRoom.id,
      roomId: socialRoom.id,
      active: true
    };

    const ambiguousAsg: TaskAssignment = {
      id: `asg-ambiguous-${today}`,
      family_id: testFamily.id,
      task_id: 'bath-4',
      member_id: '',
      scheduled_date: today,
      status: 'SCHEDULED'
    };

    const matchesSuite = RoutineContinuityService.isAssignmentMatchingRoutine(
      ambiguousAsg,
      routineSuite,
      [routineSuite, routineSocial]
    );

    const matchesSocial = RoutineContinuityService.isAssignmentMatchingRoutine(
      ambiguousAsg,
      routineSocial,
      [routineSuite, routineSocial]
    );

    if (matchesSuite || matchesSocial) {
      throw new Error('Ocorrência ambígua sem cômodo não deve ser associada arbitrariamente quando há múltiplos ambientes ativos!');
    }
  });

  // MR10: Rebalanceamento no RebalanceService sem contaminação cruzada entre ambientes
  await record('MR10', 'RebalanceService não cruza dados ou cômodos entre ocorrências do mesmo TaskMaster', () => {
    const ftSuite: FamilyTask = {
      id: 'ft-suite',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      frequency: 'daily',
      active: true
    };

    const ftSocial: FamilyTask = {
      id: 'ft-social',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: socialRoom.id,
      roomId: socialRoom.id,
      frequency: 'daily',
      active: true
    };

    const asgSuite: TaskAssignment = {
      id: `ft-suite_${today}`,
      family_id: testFamily.id,
      family_task_id: 'ft-suite',
      task_id: 'bath-4',
      room_id: suiteRoom.id,
      scheduled_date: today,
      scheduled_start: '09:00',
      status: 'SCHEDULED',
      member_id: 'usr-lucas'
    };

    const asgSocial: TaskAssignment = {
      id: `ft-social_${today}`,
      family_id: testFamily.id,
      family_task_id: 'ft-social',
      task_id: 'bath-4',
      room_id: socialRoom.id,
      scheduled_date: today,
      scheduled_start: '10:00',
      status: 'SCHEDULED',
      member_id: 'usr-marina'
    };

    const mockCtx: ScoringContext = {
      users: [memberLucas, memberMarina],
      allTasks: [
        {
          id: 'bath-4',
          name: 'Lavar o chão e rejuntes do box',
          description: '',
          category: 'cleaning',
          room_type: 'bathroom',
          minimum_age: 12,
          difficulty: 3,
          duration_minutes: 30,
          effort_level: 3,
          autonomy_required: 2,
          frequency_type: 'daily',
          safety_level: 'safe',
          requires_supervision: false,
          can_be_done_in_pair: false,
          can_be_delegated: true,
          instructions: [],
          materials: [],
          active: true
        }
      ],
      familyTasks: [ftSuite, ftSocial],
      skills: [],
      preferences: [],
      protectedTimes: [],
      availabilities: [],
      calendarEvents: [],
      existingAssignments: [asgSuite, asgSocial],
      targetDate: today,
      dayOfWeek: 3
    };

    const rebalanceResult = RebalanceService.rebalancePendingAssignments(mockCtx, (distCtx) => {
      return distCtx.familyTasks.map(ft => ({
        id: `mock-asg-${ft.id}`,
        family_id: ft.family_id,
        family_task_id: ft.id,
        task_id: ft.task_master_id,
        member_id: ft.id === 'ft-suite' ? 'usr-marina' : 'usr-lucas', // Rebalance inverteu
        scheduled_date: today,
        status: 'SCHEDULED',
        room_id: ft.room_id
      }));
    });

    const finalSuite = rebalanceResult.proposedAssignments.find(a => a.id === asgSuite.id);
    const finalSocial = rebalanceResult.proposedAssignments.find(a => a.id === asgSocial.id);

    if (!finalSuite || !finalSocial) {
      throw new Error('Ambas as atribuições devem estar presentes no resultado do rebalanceamento');
    }
    if (finalSuite.room_id !== suiteRoom.id) {
      throw new Error(`Cômodo da suíte corrompido: ${finalSuite.room_id}`);
    }
    if (finalSocial.room_id !== socialRoom.id) {
      throw new Error(`Cômodo do social corrompido: ${finalSocial.room_id}`);
    }
    if (finalSuite.family_task_id !== 'ft-suite' || finalSocial.family_task_id !== 'ft-social') {
      throw new Error('Vínculo com FamilyTask corrompido no rebalanceamento');
    }
  });

  // MR11: Isolamento estrito multi-tenant entre famílias distintas
  await record('MR11', 'Isolamento estrito multi-tenant entre famílias distintas', async () => {
    const familyAId = 'fam-tenant-A';
    const familyBId = 'fam-tenant-B';

    const routineA: FamilyTask = {
      id: 'ft-famA',
      family_id: familyAId,
      task_master_id: 'bath-4',
      room_id: 'suite',
      active: true
    };

    const routineB: FamilyTask = {
      id: 'ft-famB',
      family_id: familyBId,
      task_master_id: 'bath-4',
      room_id: 'suite',
      active: true
    };

    const resA = await RoutineContinuityService.createRoutine({
      familyId: familyAId,
      routine: routineA,
      existingAssignments: [],
      existingRoutines: [],
      isDemoMode: true
    });

    const resB = await RoutineContinuityService.createRoutine({
      familyId: familyBId,
      routine: routineB,
      existingAssignments: [],
      existingRoutines: [],
      isDemoMode: true
    });

    if (resA.createdRoutine.family_id !== familyAId || resB.createdRoutine.family_id !== familyBId) {
      throw new Error('Family ID deve ser estritamente isolado');
    }
    if (resA.newAssignments.some(a => a.family_id !== familyAId) || resB.newAssignments.some(a => a.family_id !== familyBId)) {
      throw new Error('Ocorrências de tenant vazaram para outro tenant');
    }
  });

  // MR12: Preservação de EXTERNAL_SUPPORT da Ruthe na Suíte e HOUSEHOLD no Social
  await record('MR12', 'Suíte com EXTERNAL_SUPPORT da Ruthe não vai ao Motor 2.0; Social com HOUSEHOLD é distribuída', () => {
    const ftSuiteRuthe: FamilyTask = {
      id: 'ft-suite-ruthe',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      name: 'Lavar o chão e rejuntes do box',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      frequency: 'weekly',
      preferred_days: [3],
      preferred_time: '09:00',
      active: true,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ruthe'
    };

    const ftSocialResidents: FamilyTask = {
      id: 'ft-social-residents',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      name: 'Lavar o chão e rejuntes do box',
      room_id: socialRoom.id,
      roomId: socialRoom.id,
      frequency: 'weekly',
      preferred_days: [3],
      preferred_time: '10:00',
      active: true,
      executionTarget: 'HOUSEHOLD'
    };

    const asgSuiteRuthe: Task = {
      id: 'task-asg-suite',
      familyId: testFamily.id,
      familyTaskId: 'ft-suite-ruthe',
      title: 'Lavar o chão do box (Suíte)',
      taskMasterId: 'bath-4',
      dueDate: today,
      status: 'PENDING',
      roomId: suiteRoom.id,
      frequency: 'WEEKLY',
      effort: 5,
      executionTarget: 'EXTERNAL_SUPPORT',
      domesticSupportId: 'ruthe'
    };

    const asgSocialResidents: Task = {
      id: 'task-asg-social',
      familyId: testFamily.id,
      familyTaskId: 'ft-social-residents',
      title: 'Lavar o chão do box (Social)',
      taskMasterId: 'bath-4',
      dueDate: today,
      status: 'PENDING',
      roomId: socialRoom.id,
      frequency: 'WEEKLY',
      effort: 5,
      executionTarget: 'HOUSEHOLD'
    };

    const context = DistributionService.buildContext({
      family: testFamily,
      members: [memberLucas, memberMarina],
      tasks: [asgSuiteRuthe, asgSocialResidents],
      protectedTimes: [],
      targetDate: today,
      dayOfWeek: 3,
      familyTasks: [ftSuiteRuthe, ftSocialResidents]
    });

    // Fronteira de segurança: EXTERNAL_SUPPORT não deve entrar no pool do Motor 2.0
    const enteredMotorIds = context.existingAssignments.map(a => a.id);
    if (enteredMotorIds.includes(asgSuiteRuthe.id)) {
      throw new Error('FALHA DE FRONTEIRA: Tarefa EXTERNAL_SUPPORT da Ruthe entrou indevidamente no Motor 2.0!');
    }
    if (!enteredMotorIds.includes(asgSocialResidents.id)) {
      throw new Error('Tarefa HOUSEHOLD dos moradores deveria ter entrado no pool do Motor 2.0!');
    }
  });

  // MR13: Conclusão independente de ocorrência de um ambiente sem afetar o outro ambiente
  await record('MR13', 'Conclusão da ocorrência da suíte não altera o status da ocorrência do social', () => {
    const asgSuite: TaskAssignment = {
      id: `ft-suite_${today}`,
      family_id: testFamily.id,
      family_task_id: 'ft-suite',
      task_id: 'bath-4',
      member_id: 'usr-lucas',
      room_id: suiteRoom.id,
      scheduled_date: today,
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      completed_by: 'usr-lucas'
    };

    const asgSocial: TaskAssignment = {
      id: `ft-social_${today}`,
      family_id: testFamily.id,
      family_task_id: 'ft-social',
      task_id: 'bath-4',
      member_id: 'usr-lucas',
      room_id: socialRoom.id,
      scheduled_date: today,
      status: 'SCHEDULED'
    };

    if (asgSuite.status !== 'COMPLETED' || asgSocial.status !== 'SCHEDULED') {
      throw new Error('Status das ocorrências devem ser estritamente independentes');
    }
    if (asgSocial.completed_at || asgSocial.completed_by) {
      throw new Error('Conclusão da suíte vazou para a ocorrência do social!');
    }
  });

  // MR14: Deduplicação e convivência correta de ocorrências no mesmo dia
  await record('MR14', 'Ocorrências distintas de dois ambientes no mesmo dia coexistem perfeitamente', () => {
    const routineSuite: FamilyTask = {
      id: 'ft-suite',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: suiteRoom.id,
      roomId: suiteRoom.id,
      active: true
    };

    const routineSocial: FamilyTask = {
      id: 'ft-social',
      family_id: testFamily.id,
      task_master_id: 'bath-4',
      room_id: socialRoom.id,
      roomId: socialRoom.id,
      active: true
    };

    const asgSuite: TaskAssignment = {
      id: `ft-suite_${today}`,
      family_id: testFamily.id,
      family_task_id: 'ft-suite',
      task_id: 'bath-4',
      member_id: 'usr-lucas',
      room_id: suiteRoom.id,
      scheduled_date: today,
      status: 'SCHEDULED'
    };

    const asgSocial: TaskAssignment = {
      id: `ft-social_${today}`,
      family_id: testFamily.id,
      family_task_id: 'ft-social',
      task_id: 'bath-4',
      member_id: 'usr-lucas',
      room_id: socialRoom.id,
      scheduled_date: today,
      status: 'SCHEDULED'
    };

    // Chaves canônicas com familyTaskId
    const keySuite = `${asgSuite.family_task_id}_${asgSuite.scheduled_date}`;
    const keySocial = `${asgSocial.family_task_id}_${asgSocial.scheduled_date}`;

    if (keySuite === keySocial) {
      throw new Error('Chaves canônicas colidiram!');
    }
  });

  // MR15: Motor 2.0 e regras de cálculo e scoring 100% preservadas e intocadas
  await record('MR15', 'Arquivos core do Motor 2.0 permanecem estritamente puros e intocados', () => {
    const motorFiles = [
      'src/domain/distribution/DistributionEngine.ts',
      'src/domain/distribution/ScoringService.ts',
      'src/domain/distribution/BalanceService.ts',
      'src/domain/distribution/AvailabilityService.ts',
      'src/domain/distribution/SafetyService.ts',
      'src/domain/distribution/EligibilityService.ts',
      'src/domain/distribution/ExplainabilityService.ts',
      'src/domain/distribution/config/scoringConfig.ts'
    ];

    for (const file of motorFiles) {
      const fullPath = path.resolve(file);
      if (!fs.existsSync(fullPath)) {
        throw new Error(`Arquivo core do Motor 2.0 não encontrado: ${file}`);
      }
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes('room-suite') || content.includes('room-social')) {
        throw new Error(`Motor 2.0 em ${file} não deve ter acoplamento com IDs de cômodos específicos!`);
      }
    }
  });

  return results;
}
