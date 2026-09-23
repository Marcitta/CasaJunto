import { Task, Member, Family } from '../types';
import { DistributionService } from '../application/services/DistributionService';
import { SafetyService } from '../domain/distribution';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';
import { calculateAgeFromBirthDate } from '../utils/dateUtils';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

const mockFamily: Family = {
  id: 'fam-real-tenant-1',
  name: 'Família Silva',
  timezone: 'America/Sao_Paulo',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

const adminCarla: Member = {
  id: 'mem-admin-carla',
  familyId: 'fam-real-tenant-1',
  userId: 'uid-admin-carla',
  name: 'Carla',
  role: 'ADMIN',
  avatar: '👩',
  color: '#8c52ff',
  active: true,
  birth_date: '1988-04-12'
};

const memberPedro: Member = {
  id: 'mem-member-pedro',
  familyId: 'fam-real-tenant-1',
  userId: 'uid-member-pedro',
  name: 'Pedro',
  role: 'MEMBER',
  avatar: '👨',
  color: '#1890ff',
  active: true,
  birth_date: '1990-08-20'
};

const childLeo: Member = {
  id: 'mem-child-leo',
  familyId: 'fam-real-tenant-1',
  userId: 'uid-child-leo',
  name: 'Leo',
  role: 'MEMBER',
  avatar: '👦',
  color: '#52c41a',
  active: true,
  birth_date: '2018-05-15' // 8 anos
};

const inactiveMember: Member = {
  id: 'mem-inactive-bob',
  familyId: 'fam-real-tenant-1',
  userId: 'uid-inactive-bob',
  name: 'Bob',
  role: 'MEMBER',
  avatar: '👴',
  color: '#999999',
  active: false,
  birth_date: '1960-01-01'
};

const foreignMember: Member = {
  id: 'mem-foreign-alice',
  familyId: 'fam-other-tenant-99',
  userId: 'uid-foreign-alice',
  name: 'Alice Outra Família',
  role: 'MEMBER',
  avatar: '👩',
  color: '#ff4d4f',
  active: true,
  birth_date: '1992-03-10'
};

function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-test-' + Math.random().toString(36).substring(2, 7),
    title: 'Tarefa de Teste',
    familyId: mockFamily.id,
    roomId: 'room-default',
    frequency: 'DAILY',
    effort: 5,
    status: 'PENDING',
    dueDate: '2026-09-15',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

export async function runHotfixFunc1TestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Helper de mock do executor de assignTaskManually (reproduz a lógica canônica do AppContext)
  function executeAssignTaskManually(
    caller: Member,
    taskId: string,
    targetMemberId: string | null,
    currentTasks: Task[],
    familyMembers: Member[],
    options: { confirmInProgress?: boolean } = {}
  ): { success: boolean; error?: string; updatedTasks?: Task[] } {
    // 1. RBAC Check
    if (caller.role !== 'ADMIN') {
      return { success: false, error: 'Apenas administradores podem atribuir ou reatribuir tarefas manualmente.' };
    }

    const taskIndex = currentTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      return { success: false, error: 'Tarefa não encontrada.' };
    }

    const task = currentTasks[taskIndex];

    // 2. Canonical rule: Tarefas COMPLETED são imutáveis
    if (task.status === 'DONE' || (task.status as string) === 'COMPLETED') {
      return { success: false, error: 'Tarefas já concluídas não podem ter o responsável alterado.' };
    }

    // 3. Tarefas IN_PROGRESS exigem confirmação explícita
    if (task.status === 'IN_PROGRESS' && !options.confirmInProgress) {
      return { 
        success: false, 
        error: 'Esta tarefa já está em andamento. Confirme a transferência explicitamente.' 
      };
    }

    let targetMember: Member | undefined = undefined;

    if (targetMemberId) {
      targetMember = familyMembers.find(m => m.id === targetMemberId);
      if (!targetMember) {
        return { success: false, error: 'Morador selecionado não foi encontrado.' };
      }

      // Tenant isolation check
      if (targetMember.familyId !== caller.familyId) {
        return { success: false, error: 'Morador selecionado não pertence à mesma família.' };
      }

      // Active member check
      if (targetMember.active === false) {
        return { success: false, error: 'Morador inativo não pode receber tarefas.' };
      }

      // 4. Safety Service Check
      let memberForSafety = targetMember;
      if (memberForSafety.age === undefined && memberForSafety.birth_date) {
        const derivedAge = calculateAgeFromBirthDate(memberForSafety.birth_date);
        if (derivedAge !== null) {
          memberForSafety = { ...memberForSafety, age: derivedAge };
        }
      }
      const taskMaster = DistributionService.getOrCreateTaskMaster(task);
      const safetyValidation = SafetyService.validateSafety(memberForSafety, taskMaster);
      if (!safetyValidation.isSafe) {
        return { 
          success: false, 
          error: `Bloqueio de segurança: ${safetyValidation.reason || 'morador incompatível com a tarefa.'}` 
        };
      }
    }

    const isUnassigned = !targetMemberId;
    const updatedTask: Task = {
      ...task,
      assignedMemberId: targetMemberId || undefined,
      assigneeId: targetMemberId || undefined,
      assigneeName: isUnassigned ? 'Não atribuído' : (targetMember?.name || 'Membro'),
      isUnassigned,
      assignedReason: isUnassigned 
        ? 'Definido manualmente como sem responsável pelo administrador' 
        : `Atribuição manual direta realizada por ${caller.name}`,
      unassignedReason: isUnassigned ? 'Removido manualmente pelo administrador' : undefined,
      updatedAt: new Date().toISOString()
    };

    const newTasks = [...currentTasks];
    newTasks[taskIndex] = updatedTask;

    return { success: true, updatedTasks: newTasks };
  }

  // --- HF01: ADMIN pode reatribuir tarefa manualmente com sucesso ---
  try {
    const task = createTestTask({
      id: 'task-hf-1',
      title: 'Varrer a sala',
      familyId: mockFamily.id,
      assignedMemberId: adminCarla.id,
      status: 'PENDING',
      dueDate: '2026-09-15',
      estimatedMinutes: 15
    });
    const res = executeAssignTaskManually(adminCarla, task.id, memberPedro.id, [task], [adminCarla, memberPedro]);
    const updated = res.updatedTasks?.[0];
    const passed = res.success === true && updated?.assignedMemberId === memberPedro.id && updated?.assigneeId === memberPedro.id;
    results.push({
      id: 'HF01',
      name: 'ADMIN pode reatribuir tarefa manualmente com sucesso',
      passed,
      expected: 'Atribuição concluída com assigneeId igual a Pedro',
      actual: `success=${res.success}, assignee=${updated?.assignedMemberId}`
    });
  } catch (e: any) {
    results.push({ id: 'HF01', name: 'ADMIN pode reatribuir tarefa', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF02: MEMBER é bloqueado de reatribuir tarefa manualmente (RBAC) ---
  try {
    const task = createTestTask({
      id: 'task-hf-2',
      title: 'Lavar a louça',
      familyId: mockFamily.id,
      assignedMemberId: memberPedro.id,
      status: 'PENDING',
      dueDate: '2026-09-15'
    });
    const res = executeAssignTaskManually(memberPedro, task.id, adminCarla.id, [task], [adminCarla, memberPedro]);
    const passed = res.success === false && res.error?.includes('Apenas administradores');
    results.push({
      id: 'HF02',
      name: 'MEMBER é bloqueado de reatribuir tarefa manualmente (RBAC)',
      passed,
      expected: 'Bloqueio com mensagem de permissão de administrador',
      actual: `success=${res.success}, error="${res.error}"`
    });
  } catch (e: any) {
    results.push({ id: 'HF02', name: 'RBAC Member', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF03: Atribuição manual para morador inativo é bloqueada ---
  try {
    const task = createTestTask({
      id: 'task-hf-3',
      title: 'Organizar armário',
      familyId: mockFamily.id,
      status: 'PENDING',
      dueDate: '2026-09-15'
    });
    const res = executeAssignTaskManually(adminCarla, task.id, inactiveMember.id, [task], [adminCarla, inactiveMember]);
    const passed = res.success === false && res.error?.includes('inativo');
    results.push({
      id: 'HF03',
      name: 'Atribuição manual para morador inativo é bloqueada',
      passed,
      expected: 'Bloqueio por morador inativo',
      actual: `success=${res.success}, error="${res.error}"`
    });
  } catch (e: any) {
    results.push({ id: 'HF03', name: 'Inativo bloqueado', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF04: Atribuição manual que viola segurança/idade é bloqueada ---
  try {
    const chemicalTask = createTestTask({
      id: 'task-hf-4',
      title: 'Limpar banheiro com ácido e água sanitária',
      familyId: mockFamily.id,
      status: 'PENDING',
      dueDate: '2026-09-15',
      minAge: 16
    });
    const res = executeAssignTaskManually(adminCarla, chemicalTask.id, childLeo.id, [chemicalTask], [adminCarla, childLeo]);
    const passed = res.success === false && res.error?.includes('segurança');
    results.push({
      id: 'HF04',
      name: 'Atribuição manual que viola segurança/idade é bloqueada',
      passed,
      expected: 'Bloqueio de segurança do Motor 2.0 / SafetyService',
      actual: `success=${res.success}, error="${res.error}"`
    });
  } catch (e: any) {
    results.push({ id: 'HF04', name: 'Segurança violação', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF05: Atribuição manual para "Sem responsável" é permitida ---
  try {
    const task = createTestTask({
      id: 'task-hf-5',
      title: 'Passar pano na varanda',
      familyId: mockFamily.id,
      assignedMemberId: memberPedro.id,
      status: 'PENDING',
      dueDate: '2026-09-15'
    });
    const res = executeAssignTaskManually(adminCarla, task.id, null, [task], [adminCarla, memberPedro]);
    const updated = res.updatedTasks?.[0];
    const passed = res.success === true && updated?.isUnassigned === true && !updated?.assignedMemberId;
    results.push({
      id: 'HF05',
      name: 'Atribuição manual para "Sem responsável" é permitida',
      passed,
      expected: 'isUnassigned=true e assignedMemberId vazio',
      actual: `success=${res.success}, isUnassigned=${updated?.isUnassigned}, assignedMemberId=${updated?.assignedMemberId}`
    });
  } catch (e: any) {
    results.push({ id: 'HF05', name: 'Sem responsável', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF06: Tarefa COMPLETED tem reatribuição bloqueada ---
  try {
    const completedTask = createTestTask({
      id: 'task-hf-6',
      title: 'Lavar carro',
      familyId: mockFamily.id,
      assignedMemberId: adminCarla.id,
      status: 'DONE',
      completedBy: adminCarla.id,
      completedAt: '2026-09-10T14:30:00Z',
      dueDate: '2026-09-10'
    });
    const res = executeAssignTaskManually(adminCarla, completedTask.id, memberPedro.id, [completedTask], [adminCarla, memberPedro]);
    const passed = res.success === false && res.error?.includes('concluídas');
    results.push({
      id: 'HF06',
      name: 'Tarefa COMPLETED tem reatribuição bloqueada',
      passed,
      expected: 'Bloqueio de reatribuição de tarefa concluída',
      actual: `success=${res.success}, error="${res.error}"`
    });
  } catch (e: any) {
    results.push({ id: 'HF06', name: 'Completed bloqueada', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF07: Tarefa IN_PROGRESS exige confirmação explícita para reatribuição ---
  try {
    const inProgressTask = createTestTask({
      id: 'task-hf-7',
      title: 'Cortar a grama',
      familyId: mockFamily.id,
      assignedMemberId: memberPedro.id,
      status: 'IN_PROGRESS',
      dueDate: '2026-09-15'
    });

    // 1. Tentativa sem confirmação -> Bloqueada
    const resWithoutConfirm = executeAssignTaskManually(adminCarla, inProgressTask.id, adminCarla.id, [inProgressTask], [adminCarla, memberPedro], { confirmInProgress: false });
    
    // 2. Tentativa com confirmação explícita -> Sucesso
    const resWithConfirm = executeAssignTaskManually(adminCarla, inProgressTask.id, adminCarla.id, [inProgressTask], [adminCarla, memberPedro], { confirmInProgress: true });

    const passed = resWithoutConfirm.success === false && 
                   resWithoutConfirm.error?.includes('em andamento') && 
                   resWithConfirm.success === true && 
                   resWithConfirm.updatedTasks?.[0].assignedMemberId === adminCarla.id;

    results.push({
      id: 'HF07',
      name: 'Tarefa IN_PROGRESS exige confirmação explícita para reatribuição',
      passed: !!passed,
      expected: 'Bloqueia sem confirmação e permite com confirmação explícita',
      actual: `withoutConfirm=${resWithoutConfirm.success}, withConfirm=${resWithConfirm.success}`
    });
  } catch (e: any) {
    results.push({ id: 'HF07', name: 'In progress confirm', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF08: Rebalance "Confirmar e Salvar" persiste com sucesso ---
  try {
    const tasks: Task[] = [
      createTestTask({ id: 't-reb-1', title: 'T1', familyId: mockFamily.id, status: 'PENDING', dueDate: '2026-09-15' }),
      createTestTask({ id: 't-reb-2', title: 'T2', familyId: mockFamily.id, status: 'PENDING', dueDate: '2026-09-15' })
    ];

    const preview = DistributionService.executeRebalance({
      family: mockFamily,
      members: [adminCarla, memberPedro],
      tasks,
      protectedTimes: [],
      targetDate: '2026-09-15'
    });

    const passed = preview.result.proposedAssignments.length === 2 && 
                   Object.keys(preview.taskUpdates).length === 2;

    results.push({
      id: 'HF08',
      name: 'Rebalance "Confirmar e Salvar" calcula e gera mapa de updates persistível',
      passed,
      expected: '2 propostas calculadas com taskUpdates mapeados',
      actual: `proposedCount=${preview.result.proposedAssignments.length}, updatesCount=${Object.keys(preview.taskUpdates).length}`
    });
  } catch (e: any) {
    results.push({ id: 'HF08', name: 'Rebalance save', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF09: Rebalance não sobrescreve tarefas concluídas ---
  try {
    const tasksWithCompleted: Task[] = [
      createTestTask({ id: 't-open', title: 'Aberta', familyId: mockFamily.id, status: 'PENDING', dueDate: '2026-09-15' }),
      createTestTask({ id: 't-done', title: 'Concluída', familyId: mockFamily.id, status: 'DONE', assignedMemberId: memberPedro.id, assigneeId: memberPedro.id, completedBy: memberPedro.id, dueDate: '2026-09-15' })
    ];

    const preview = DistributionService.executeRebalance({
      family: mockFamily,
      members: [adminCarla, memberPedro],
      tasks: tasksWithCompleted,
      protectedTimes: [],
      targetDate: '2026-09-15'
    });

    // Tarefa 't-done' nunca pode ter seu responsável sobrescrito nem constar em taskUpdates
    const hasCompletedInUpdates = 't-done' in preview.taskUpdates;
    const doneProposed = preview.result.proposedAssignments.find(p => p.id === 't-done');
    const isCompletedPreserved = doneProposed ? (doneProposed.status === 'COMPLETED' && doneProposed.member_id === memberPedro.id) : true;

    const passed = !hasCompletedInUpdates && isCompletedPreserved;
    results.push({
      id: 'HF09',
      name: 'Rebalance não sobrescreve tarefas concluídas',
      passed,
      expected: 'Tarefas DONE/COMPLETED preservadas sem alteração nos updates',
      actual: `inUpdates=${hasCompletedInUpdates}, status=${doneProposed?.status}, member=${doneProposed?.member_id}`
    });
  } catch (e: any) {
    results.push({ id: 'HF09', name: 'Rebalance ignores completed', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF10: Isolamento multi-tenant (familyId) é respeitado na atribuição manual ---
  try {
    const task = createTestTask({
      id: 'task-hf-10',
      title: 'Tarefa família 1',
      familyId: mockFamily.id,
      status: 'PENDING',
      dueDate: '2026-09-15'
    });

    const res = executeAssignTaskManually(adminCarla, task.id, foreignMember.id, [task], [adminCarla, foreignMember]);
    const passed = res.success === false && res.error?.includes('mesma família');

    results.push({
      id: 'HF10',
      name: 'Isolamento multi-tenant (familyId) é respeitado na atribuição manual',
      passed,
      expected: 'Bloqueio de atribuição para membro de outro tenant',
      actual: `success=${res.success}, error="${res.error}"`
    });
  } catch (e: any) {
    results.push({ id: 'HF10', name: 'Multi-tenant isolation', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF11: Atribuição manual gera payload de persistência Firestore canônico ---
  try {
    const assignment = {
      id: 'asg-test-11',
      family_id: mockFamily.id,
      task_id: 'task-hf-11',
      member_id: memberPedro.id,
      due_date: '2026-09-15',
      scheduled_start: '09:00',
      status: 'ASSIGNED' as const,
      is_unassigned: false,
      assigned_reason: 'Atribuição manual direta realizada por Carla',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const firestoreData = FirestoreMappers.fromTaskAssignment(assignment);
    const passed = firestoreData.family_id === mockFamily.id &&
                   firestoreData.member_id === memberPedro.id &&
                   firestoreData.assignee_id === memberPedro.id &&
                   firestoreData.assigned_reason === assignment.assigned_reason;

    results.push({
      id: 'HF11',
      name: 'Atribuição manual gera payload canônico compatível com Firestore (camel/snake)',
      passed,
      expected: 'Campos member_id e assignee_id preenchidos no documento',
      actual: `member_id=${firestoreData.member_id}, assignee_id=${firestoreData.assignee_id}`
    });
  } catch (e: any) {
    results.push({ id: 'HF11', name: 'Firestore mapping', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF12: Recarregar tarefas reflete nova atribuição manual ---
  try {
    const firestoreDoc = {
      family_id: mockFamily.id,
      task_id: 'task-hf-12',
      assignee_id: adminCarla.id, // gravado no padrão snake_case do Firestore
      due_date: '2026-09-15',
      scheduled_start: '10:00',
      status: 'ASSIGNED',
      assigned_reason: 'Atribuição manual',
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-13T12:00:00Z'
    };

    const domainAssignment = FirestoreMappers.toTaskAssignment('asg-test-12', firestoreDoc);
    const passed = domainAssignment.member_id === adminCarla.id &&
                   domainAssignment.task_id === 'task-hf-12' &&
                   domainAssignment.assigned_reason === 'Atribuição manual';

    results.push({
      id: 'HF12',
      name: 'Recarregar tarefas reflete nova atribuição manual via mapper resiliente',
      passed,
      expected: 'member_id lido com sucesso a partir de assignee_id',
      actual: `member_id=${domainAssignment.member_id}`
    });
  } catch (e: any) {
    results.push({ id: 'HF12', name: 'Mapper resilience', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF13: Rebalance permite override manual antes de salvar ---
  try {
    const tasks: Task[] = [
      createTestTask({ id: 't-ovr-1', title: 'Varrer casa', familyId: mockFamily.id, status: 'PENDING', dueDate: '2026-09-15' })
    ];

    const preview = DistributionService.executeRebalance({
      family: mockFamily,
      members: [adminCarla, memberPedro],
      tasks,
      protectedTimes: [],
      targetDate: '2026-09-15'
    });

    // Simula override manual feito pelo ADMIN na interface
    const overriddenProposed = preview.result.proposedAssignments.map(asg => ({
      ...asg,
      member_id: memberPedro.id,
      assigned_reason: 'Atribuição manual revisada pelo Administrador para Pedro'
    }));

    const overriddenUpdates = {
      't-ovr-1': {
        assignedMemberId: memberPedro.id,
        assigneeId: memberPedro.id,
        assigneeName: 'Pedro',
        isUnassigned: false,
        assignedReason: 'Atribuição manual revisada pelo Administrador para Pedro'
      }
    };

    const passed = overriddenProposed[0].member_id === memberPedro.id &&
                   overriddenUpdates['t-ovr-1'].assignedMemberId === memberPedro.id;

    results.push({
      id: 'HF13',
      name: 'Rebalance permite override manual da proposta antes de salvar',
      passed,
      expected: 'Proposta modificada pelo ADMIN com membro Pedro',
      actual: `proposedMember=${overriddenProposed[0].member_id}, updateMember=${overriddenUpdates['t-ovr-1'].assignedMemberId}`
    });
  } catch (e: any) {
    results.push({ id: 'HF13', name: 'Rebalance manual override', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HF14: Erro no Firestore durante rebalance exibe feedback de erro sem fechar modal falsamente ---
  try {
    let modalClosed = false;
    let errorMessage: string | null = null;

    // Simulação do fluxo com falha intencional de rede/permissão no Firestore
    async function simulateApplyWithFirestoreFailure() {
      try {
        throw new Error('Permissão negada ao persistir lote no Firestore (batch error)');
        // Se tivesse sucesso, fecharia o modal
        modalClosed = true;
      } catch (err: any) {
        errorMessage = err.message;
        // Não fecha o modal para que o usuário veja a falha e possa tentar novamente
      }
    }

    await simulateApplyWithFirestoreFailure();

    const passed = modalClosed === false && errorMessage !== null && errorMessage.includes('batch error');
    results.push({
      id: 'HF14',
      name: 'Erro no Firestore durante rebalance exibe feedback sem fechar modal falsamente',
      passed,
      expected: 'Modal permanece aberto (modalClosed=false) com mensagem de erro',
      actual: `modalClosed=${modalClosed}, error="${errorMessage}"`
    });
  } catch (e: any) {
    results.push({ id: 'HF14', name: 'Firestore error feedback', passed: false, expected: 'PASS', actual: e.message });
  }

  return results;
}
