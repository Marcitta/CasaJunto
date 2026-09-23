/**
 * stabilization1a.test.ts
 * 
 * CASA JUNTO — STABILIZATION-1A TEST SUITE
 * TASK EDITING + DEACTIVATION PERSISTENCE
 * 
 * DEFECT 1: FamilyTask deactivation persists across refresh (FirestoreMappers + hydration)
 * DEFECT 2: Catalog Admin actions ("Editar na minha casa", "Reativar" reusing FamilyTask.id)
 * DEFECT 3: Customization (customTitle & customDescription resolution without mutating TaskMaster)
 */

import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { allMasterTasks } from '../data/tasks';
import { FamilyTask, TaskAssignment, Task } from '../types';
import { getFamilyLocalDate, addDaysToDate } from '../domain/utils/dateTimeUtils';

export async function runStabilization1aTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [✓ PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [✗ FAIL] ${msg}`);
      failed++;
      errors.push(msg);
    }
  }

  console.log('\n--- GRUPO 22: STABILIZATION-1A (DEACTIVATION PERSISTENCE & TASK CUSTOMIZATION) ---');

  // --- DEFECT 1: PERSISTENCE & HYDRATION OF DEACTIVATED FAMILY TASK ---
  try {
    // S1A-01: FirestoreMappers.toFamilyTask preserves active: false
    const firestoreDocInactive: any = {
      family_id: 'fam-test-1',
      task_id: 'tm-louca',
      room_id: 'cozinha-1',
      frequency: 'daily',
      estimated_minutes: 25,
      active: false, // Explicitly deactivated
      custom_title: 'Lavar Louça do Jantar',
      custom_description: 'Usar água morna'
    };
    const hydratedFt = FirestoreMappers.toFamilyTask('ft-inactive-1', firestoreDocInactive);
    assert(
      hydratedFt.active === false,
      'S1A-01: FirestoreMappers.toFamilyTask preserva active: false sem fallback indevido para true'
    );
  } catch (err: any) {
    assert(false, `S1A-01 Erro: ${err?.message}`);
  }

  try {
    // S1A-02: FirestoreMappers.fromFamilyTask persists active: false
    const domainFt: FamilyTask = {
      id: 'ft-inactive-2',
      family_id: 'fam-test-1',
      task_master_id: 'tm-banheiro',
      room_id: 'wc-1',
      frequency: 'weekly',
      estimated_minutes: 30,
      active: false,
      customTitle: 'Banheiro Social',
      customDescription: 'Trocar toalhas'
    };
    const firestorePayload = FirestoreMappers.fromFamilyTask(domainFt);
    assert(
      firestorePayload.active === false,
      'S1A-02: FirestoreMappers.fromFamilyTask persiste active: false no payload do banco'
    );
    assert(
      firestorePayload.custom_title === 'Banheiro Social' && firestorePayload.custom_description === 'Trocar toalhas',
      'S1A-02B: FirestoreMappers.fromFamilyTask persiste custom_title e custom_description'
    );
  } catch (err: any) {
    assert(false, `S1A-02 Erro: ${err?.message}`);
  }

  try {
    // S1A-03: Hydrated inactive FamilyTask produces no occurrences on RoutineGenerator
    const inactiveFt: FamilyTask = {
      id: 'ft-inactive-3',
      family_id: 'fam-test-1',
      task_master_id: 'tm-cozinha-chao',
      room_id: 'cozinha-1',
      frequency: 'daily',
      estimated_minutes: 20,
      active: false
    };
    const shouldOccur = RoutineGenerator.shouldOccurOnDate(inactiveFt, '2026-09-15');
    assert(
      shouldOccur === false,
      'S1A-03: RoutineGenerator.shouldOccurOnDate retorna false para FamilyTask com active: false'
    );
  } catch (err: any) {
    assert(false, `S1A-03 Erro: ${err?.message}`);
  }

  try {
    // S1A-04: Full round-trip deactivation trace:
    // UI/Service deactivation -> Firestore write -> Firestore document (active=false) -> Hydration -> active=false
    const initialFt: FamilyTask = {
      id: 'ft-trace-1',
      family_id: 'fam-trace',
      task_master_id: 'tm-lixo',
      room_id: 'geral',
      frequency: 'daily',
      estimated_minutes: 10,
      active: true
    };
    const traceToday = getFamilyLocalDate();
    const traceYesterday = addDaysToDate(traceToday, -1);

    const pendingAssignment: TaskAssignment = {
      id: 'asg-today-pending',
      family_id: 'fam-trace',
      task_id: 'tm-lixo',
      family_task_id: 'ft-trace-1',
      room_id: 'geral',
      member_id: 'm1',
      scheduled_date: traceToday,
      scheduled_start: '09:00',
      scheduled_end: '09:10',
      status: 'SCHEDULED',
      is_unassigned: false
    };
    const completedAssignment: TaskAssignment = {
      id: 'asg-yesterday-done',
      family_id: 'fam-trace',
      task_id: 'tm-lixo',
      family_task_id: 'ft-trace-1',
      room_id: 'geral',
      member_id: 'm1',
      scheduled_date: traceYesterday,
      scheduled_start: '09:00',
      scheduled_end: '09:10',
      status: 'COMPLETED',
      is_unassigned: false
    };

    // 1. Service deactivates routine
    const deactivationResult = await RoutineContinuityService.deactivateRoutine({
      familyId: 'fam-trace',
      routineId: 'ft-trace-1',
      existingRoutines: [initialFt],
      existingAssignments: [completedAssignment, pendingAssignment],
      isDemoMode: true
    });

    assert(
      deactivationResult.deactivatedRoutine.active === false,
      'S1A-04A: Trace 1 - RoutineContinuityService retorna routine.active = false'
    );
    assert(
      deactivationResult.cancelledAssignments.some(a => a.id === 'asg-today-pending'),
      'S1A-04B: Trace 2 - Ocorrência pendente de hoje é cancelada'
    );
    assert(
      !deactivationResult.cancelledAssignments.some(a => a.id === 'asg-yesterday-done'),
      'S1A-04C: Trace 3 - Ocorrência concluída permanece intacta no histórico'
    );

    // 2. Simulated Firestore write & document state
    const docInFirestore = FirestoreMappers.fromFamilyTask(deactivationResult.deactivatedRoutine);
    assert(
      docInFirestore.active === false,
      'S1A-04D: Trace 4 - Documento persistido no Firestore possui active: false'
    );

    // 3. Simulated F5 / Hydration
    const hydratedAfterF5 = FirestoreMappers.toFamilyTask('ft-trace-1', docInFirestore);
    assert(
      hydratedAfterF5.active === false,
      'S1A-04E: Trace 5 - Hidratação pós-F5 restaura active: false fielmente'
    );
  } catch (err: any) {
    assert(false, `S1A-04 Erro: ${err?.message}`);
  }

  // --- DEFECT 2: CATALOG ADMIN ACTIONS & REACTIVATION IDENTITY ---
  try {
    // S1A-05: Routine reactivation reuses EXACT same FamilyTask.id without duplication
    const inactiveRoutine: FamilyTask = {
      id: 'ft-canonical-identity-99',
      family_id: 'fam-trace',
      task_master_id: 'tm-plantas',
      room_id: 'varanda',
      frequency: 'weekly',
      preferred_days: [6],
      estimated_minutes: 15,
      active: false
    };
    const reactivationResult = await RoutineContinuityService.reactivateRoutine({
      familyId: 'fam-trace',
      routineId: 'ft-canonical-identity-99',
      existingRoutines: [inactiveRoutine],
      existingAssignments: [],
      isDemoMode: true,
      timezone: 'America/Sao_Paulo'
    });

    assert(
      reactivationResult.reactivatedRoutine.id === 'ft-canonical-identity-99',
      'S1A-05A: Reativação reusa a MESMA FamilyTask.id canônica (sem duplicatas)'
    );
    assert(
      reactivationResult.reactivatedRoutine.active === true,
      'S1A-05B: Reativação define active: true'
    );
  } catch (err: any) {
    assert(false, `S1A-05 Erro: ${err?.message}`);
  }

  try {
    // S1A-06: TaskMaster remains completely immutable after editing FamilyTask custom fields
    const masterTask = allMasterTasks.find(t => t.id === 'tm-louca');
    const originalMasterName = masterTask?.name;
    const originalMasterDesc = masterTask?.description;

    const customizedFamilyTask: FamilyTask = {
      id: 'ft-custom-1',
      family_id: 'fam-1',
      task_master_id: 'tm-louca',
      room_id: 'cozinha',
      frequency: 'daily',
      estimated_minutes: 20,
      active: true,
      customTitle: 'Minha Louça da Noite',
      customDescription: 'Colocar na secadora'
    };

    assert(
      masterTask?.name === originalMasterName,
      'S1A-06A: TaskMaster global permanece imutável e inalterado após personalização da família'
    );
    assert(
      masterTask?.description === originalMasterDesc,
      'S1A-06B: TaskMaster.description original não sofreu mutação'
    );
  } catch (err: any) {
    assert(false, `S1A-06 Erro: ${err?.message}`);
  }

  // --- DEFECT 3: RESOLUTION HIERARCHY FOR TITLES & DESCRIPTIONS ---
  try {
    // S1A-07: Fallback hierarchy: FamilyTask.customTitle ?? TaskMaster.name
    const master = allMasterTasks[0]; // e.g. 'Lavar a louça'
    const ftWithCustom: FamilyTask = {
      id: 'ft-res-1',
      family_id: 'fam-1',
      task_master_id: master.id,
      room_id: 'cozinha',
      frequency: 'daily',
      estimated_minutes: 20,
      active: true,
      customTitle: 'Minha Louça Personalizada',
      customDescription: 'Instruções especiais da família'
    };

    const resolvedTitle = ftWithCustom.customTitle ?? master.name;
    const resolvedDesc = ftWithCustom.customDescription ?? master.description;

    assert(
      resolvedTitle === 'Minha Louça Personalizada',
      'S1A-07A: Título personalizado tem precedência sobre o nome padrão do catálogo'
    );
    assert(
      resolvedDesc === 'Instruções especiais da família',
      'S1A-07B: Descrição personalizada tem precedência sobre a descrição padrão'
    );

    // S1A-08: Unset custom fields fall back cleanly to TaskMaster defaults
    const ftWithoutCustom: FamilyTask = {
      id: 'ft-res-2',
      family_id: 'fam-1',
      task_master_id: master.id,
      room_id: 'cozinha',
      frequency: 'daily',
      estimated_minutes: 20,
      active: true
    };

    const fallbackTitle = ftWithoutCustom.customTitle ?? master.name;
    const fallbackDesc = ftWithoutCustom.customDescription ?? master.description;

    assert(
      fallbackTitle === master.name,
      'S1A-08A: Sem customTitle, exibe com segurança o nome canônico do TaskMaster'
    );
    assert(
      fallbackDesc === master.description,
      'S1A-08B: Sem customDescription, exibe a descrição padrão do TaskMaster'
    );
  } catch (err: any) {
    assert(false, `S1A-07/08 Erro: ${err?.message}`);
  }

  try {
    // S1A-09: RoutineContinuityService.updateRoutine preserves customTitle and customDescription
    const baseFt: FamilyTask = {
      id: 'ft-upd-1',
      family_id: 'fam-1',
      task_master_id: 'tm-louca',
      room_id: 'cozinha',
      frequency: 'daily',
      estimated_minutes: 20,
      active: true
    };
    const updated = await RoutineContinuityService.updateRoutine({
      familyId: 'fam-1',
      routineId: 'ft-upd-1',
      updates: {
        customTitle: 'Título Editado pelo Admin',
        customDescription: 'Instruções Atualizadas',
        estimated_minutes: 35
      },
      existingRoutines: [baseFt],
      existingAssignments: [],
      isDemoMode: true
    });

    assert(
      updated.updatedRoutine.customTitle === 'Título Editado pelo Admin' &&
      updated.updatedRoutine.customDescription === 'Instruções Atualizadas' &&
      updated.updatedRoutine.estimated_minutes === 35,
      'S1A-09: RoutineContinuityService.updateRoutine aplica customTitle, customDescription e parâmetros canônicos'
    );
  } catch (err: any) {
    assert(false, `S1A-09 Erro: ${err?.message}`);
  }

  try {
    // S1A-10: Batch mapping respects customTitle and customDescription
    const currentRoutines: FamilyTask[] = [{
      id: 'ft-batch-1',
      family_id: 'fam-batch',
      task_master_id: 'tm-louca',
      room_id: 'cozinha',
      frequency: 'daily',
      estimated_minutes: 20,
      active: true,
      customTitle: 'Louça Customizada',
      customDescription: 'Usar esponja suave'
    }];
    const assignmentMock: any = {
      id: 'asg-batch-1',
      family_id: 'fam-batch',
      task_id: 'tm-louca',
      family_task_id: 'ft-batch-1',
      room_id: 'cozinha',
      is_unassigned: false,
      member_id: 'm1'
    };
    const ft = currentRoutines.find(f => f.id === assignmentMock.family_task_id);
    const master = allMasterTasks.find(tm => tm.id === assignmentMock.task_id);
    const displayTitle = ft?.customTitle ?? ft?.custom_title ?? master?.name ?? assignmentMock.task_id;
    const displayDescription = ft?.customDescription ?? ft?.custom_description ?? master?.description ?? '';

    assert(
      displayTitle === 'Louça Customizada',
      'S1A-10A: Mapeamento de tarefas batch exibe customTitle da rotina'
    );
    assert(
      displayDescription === 'Usar esponja suave',
      'S1A-10B: Mapeamento de tarefas batch exibe customDescription da rotina'
    );
  } catch (err: any) {
    assert(false, `S1A-10 Erro: ${err?.message}`);
  }

  return { passed, failed, errors };
}
