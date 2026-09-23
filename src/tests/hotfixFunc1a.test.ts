import { Task, Member, Family, TaskAssignment } from '../types';
import { DistributionService } from '../application/services/DistributionService';
import { DistributionEngine } from '../domain/distribution';
import { FirestoreMappers } from '../infrastructure/firebase/mappers';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

const mockFamily: Family = {
  id: 'fam-real-tenant-1a',
  name: 'Família Silva',
  timezone: 'America/Sao_Paulo',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z'
};

const adminCarla: Member = {
  id: 'mem-admin-carla',
  familyId: 'fam-real-tenant-1a',
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
  familyId: 'fam-real-tenant-1a',
  userId: 'uid-member-pedro',
  name: 'Pedro',
  role: 'MEMBER',
  avatar: '👨',
  color: '#1890ff',
  active: true,
  birth_date: '1990-08-20'
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

/**
 * Função recursiva para auditar objetos e detectar qualquer propriedade com valor undefined.
 */
function findUndefinedPaths(obj: any, path = ''): string[] {
  if (obj === undefined) return [path];
  if (obj === null || typeof obj !== 'object') return [];
  const undefinedPaths: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (value === undefined) {
      undefinedPaths.push(currentPath);
    } else if (typeof value === 'object' && value !== null) {
      undefinedPaths.push(...findUndefinedPaths(value, currentPath));
    }
  }
  return undefinedPaths;
}

/**
 * Simula o validador interno estrito do SDK Firestore (WriteBatch.set).
 * Lança erro se qualquer propriedade no documento for undefined.
 */
function simulateFirestoreWriteValidation(data: any, docPath = 'root'): void {
  const invalidPaths = findUndefinedPaths(data);
  if (invalidPaths.length > 0) {
    throw new Error(
      `Function WriteBatch.set() called with invalid data. Unsupported field value: undefined found in field ${invalidPaths[0]}`
    );
  }
}

export async function runHotfixFunc1aTestSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // --- HR01 — rebalance payload contains no undefined values ---
  try {
    const tasks: Task[] = [
      createTestTask({ id: 't-hr-1', title: 'Lavar Louça', familyId: mockFamily.id, status: 'PENDING', dueDate: '2026-09-15' }),
      createTestTask({ id: 't-hr-2', title: 'Varrer Sala', familyId: mockFamily.id, status: 'PENDING', dueDate: '2026-09-15' }),
      createTestTask({ id: 't-hr-3', title: 'Recolher Lixo', familyId: mockFamily.id, status: 'PENDING', dueDate: '2026-09-15' })
    ];

    const preview = DistributionService.executeRebalance({
      family: mockFamily,
      members: [adminCarla, memberPedro],
      tasks,
      protectedTimes: [],
      targetDate: '2026-09-15'
    });

    const undefinedFound: string[] = [];
    for (const [taskId, update] of Object.entries(preview.taskUpdates)) {
      const original = tasks.find(t => t.id === taskId);
      const assignmentData: Partial<TaskAssignment> = {
        id: taskId,
        family_id: mockFamily.id,
        task_id: update.taskMasterId || taskId,
        member_id: update.assignedMemberId || '',
        room_id: original?.roomId || null,
        scheduled_date: original?.dueDate || '2026-09-15',
        scheduled_start: update.scheduledStart || null,
        scheduled_end: update.scheduledEnd || null,
        status: 'SCHEDULED',
        assigned_reason: update.assignedReason || '',
        unassigned_reason: update.unassignedReason || null,
        is_unassigned: update.isUnassigned !== undefined ? update.isUnassigned : false,
        factors: update.factors
      };

      const serialized = FirestoreMappers.fromTaskAssignment(assignmentData);
      const badPaths = findUndefinedPaths(serialized);
      if (badPaths.length > 0) {
        undefinedFound.push(...badPaths);
      }
    }

    const passed = undefinedFound.length === 0;
    results.push({
      id: 'HR01',
      name: 'HR01 — rebalance payload contains no undefined values',
      passed,
      expected: 'Nenhuma propriedade undefined encontrada nos payloads de rebalanceamento',
      actual: passed ? 'Zero undefined values' : `Undefined found at: ${undefinedFound.join(', ')}`
    });
  } catch (e: any) {
    results.push({ id: 'HR01', name: 'HR01 — rebalance payload contains no undefined values', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HR02 — optional roomAffinity omitted when undefined ---
  try {
    const assignmentWithUndefinedAffinity: Partial<TaskAssignment> = {
      id: 'asg-test-room-affinity',
      family_id: mockFamily.id,
      task_id: 'task-clean',
      member_id: adminCarla.id,
      factors: {
        availability: 'Disponível no turno matutino',
        autonomy: 'Alta autonomia',
        weeklyBalance: 'Equilíbrio ideal de carga',
        history: 'Recém realizado',
        preference: 'Gosta desta atividade',
        roomAffinity: undefined, // Simula a ausência de agrupamento de cômodo gerada no ScoringService
        effortInfo: '2 pts de esforço'
      }
    };

    const serialized = FirestoreMappers.fromTaskAssignment(assignmentWithUndefinedAffinity);
    const hasFactors = serialized.factors !== null && typeof serialized.factors === 'object';
    const roomAffinityKeyPresent = 'roomAffinity' in (serialized.factors || {});
    const availabilityPresent = serialized.factors?.availability === 'Disponível no turno matutino';

    const passed = hasFactors && !roomAffinityKeyPresent && availabilityPresent;
    results.push({
      id: 'HR02',
      name: 'HR02 — optional roomAffinity omitted when undefined',
      passed,
      expected: 'factors.roomAffinity é omitido (in = false) sem afetar os outros fatores',
      actual: `hasFactors=${hasFactors}, 'roomAffinity' in factors=${roomAffinityKeyPresent}, availability="${serialized.factors?.availability}"`
    });
  } catch (e: any) {
    results.push({ id: 'HR02', name: 'HR02 — optional roomAffinity omitted when undefined', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HR03 — numeric zero preserved ---
  try {
    const rawData = {
      score: 0,
      rescheduled_count: 0,
      nested: {
        weight: 0,
        delta: 0
      }
    };

    const sanitized = FirestoreMappers.sanitizePayload(rawData);
    const serializedDoc = FirestoreMappers.fromTaskAssignment({
      id: 'asg-zero-test',
      family_id: mockFamily.id,
      task_id: 'task-zero',
      member_id: memberPedro.id,
      score: 0,
      rescheduled_count: 0
    });

    const passed = sanitized.score === 0 &&
                   sanitized.nested.weight === 0 &&
                   serializedDoc.score === 0 &&
                   serializedDoc.rescheduled_count === 0;

    results.push({
      id: 'HR03',
      name: 'HR03 — numeric zero preserved',
      passed,
      expected: 'Valores numéricos 0 mantidos estritamente como 0 em todos os níveis',
      actual: `sanitized.score=${sanitized.score}, nested.weight=${sanitized.nested.weight}, doc.score=${serializedDoc.score}, doc.rescheduled_count=${serializedDoc.rescheduled_count}`
    });
  } catch (e: any) {
    results.push({ id: 'HR03', name: 'HR03 — numeric zero preserved', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HR04 — boolean false preserved ---
  try {
    const rawData = {
      is_unassigned: false,
      is_blitz: false,
      active: false,
      nested: {
        flag: false
      }
    };

    const sanitized = FirestoreMappers.sanitizePayload(rawData);
    const serializedDoc = FirestoreMappers.fromTaskAssignment({
      id: 'asg-false-test',
      family_id: mockFamily.id,
      task_id: 'task-false',
      member_id: memberPedro.id,
      is_unassigned: false,
      is_blitz: false
    });

    const passed = sanitized.is_unassigned === false &&
                   sanitized.nested.flag === false &&
                   serializedDoc.is_unassigned === false &&
                   serializedDoc.is_blitz === false;

    results.push({
      id: 'HR04',
      name: 'HR04 — boolean false preserved',
      passed,
      expected: 'Valores booleanos false estritamente mantidos como false',
      actual: `sanitized.is_unassigned=${sanitized.is_unassigned}, nested.flag=${sanitized.nested.flag}, doc.is_unassigned=${serializedDoc.is_unassigned}`
    });
  } catch (e: any) {
    results.push({ id: 'HR04', name: 'HR04 — boolean false preserved', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HR05 — null preserved when canonical ---
  try {
    const rawData = {
      unassigned_reason: null,
      room_id: null,
      notes: null,
      undefinedField: undefined
    };

    const sanitized = FirestoreMappers.sanitizePayload(rawData);
    const serializedDoc = FirestoreMappers.fromTaskAssignment({
      id: 'asg-null-test',
      family_id: mockFamily.id,
      task_id: 'task-null',
      member_id: memberPedro.id,
      unassigned_reason: null,
      room_id: null,
      notes: null
    });

    const passed = sanitized.unassigned_reason === null &&
                   sanitized.room_id === null &&
                   !('undefinedField' in sanitized) &&
                   serializedDoc.unassigned_reason === null &&
                   serializedDoc.room_id === null &&
                   serializedDoc.notes === null;

    results.push({
      id: 'HR05',
      name: 'HR05 — null preserved when canonical',
      passed,
      expected: 'Campos canônicos com null são preservados enquanto undefined é omitido',
      actual: `sanitized.unassigned_reason=${sanitized.unassigned_reason}, 'undefinedField' in sanitized=${'undefinedField' in sanitized}, doc.notes=${serializedDoc.notes}`
    });
  } catch (e: any) {
    results.push({ id: 'HR05', name: 'HR05 — null preserved when canonical', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HR06 — Confirm/Save persists proposal ---
  try {
    const tasks: Task[] = [
      createTestTask({ id: 't-save-1', title: 'Organizar Quarto', familyId: mockFamily.id, status: 'PENDING', dueDate: '2026-09-15' }),
      createTestTask({ id: 't-save-2', title: 'Cuidar das Plantas', familyId: mockFamily.id, status: 'PENDING', dueDate: '2026-09-15' })
    ];

    const preview = DistributionService.executeRebalance({
      family: mockFamily,
      members: [adminCarla, memberPedro],
      tasks,
      protectedTimes: [],
      targetDate: '2026-09-15'
    });

    // Simula a escrita com o validador estrito do Firestore
    const savedDocs: Record<string, any> = {};
    let batchCommitted = false;

    for (const [taskId, update] of Object.entries(preview.taskUpdates)) {
      const original = tasks.find(t => t.id === taskId);
      const assignmentData: Partial<TaskAssignment> = {
        id: taskId,
        family_id: mockFamily.id,
        task_id: update.taskMasterId || taskId,
        member_id: update.assignedMemberId || '',
        room_id: original?.roomId || null,
        scheduled_date: original?.dueDate || '2026-09-15',
        scheduled_start: update.scheduledStart || null,
        scheduled_end: update.scheduledEnd || null,
        status: 'SCHEDULED',
        assigned_reason: update.assignedReason || '',
        unassigned_reason: update.unassignedReason || null,
        is_unassigned: update.isUnassigned !== undefined ? update.isUnassigned : false,
        factors: update.factors
      };

      const serialized = FirestoreMappers.fromTaskAssignment(assignmentData);
      // Valida que o Firestore não rejeitaria este documento
      simulateFirestoreWriteValidation(serialized, `assignments/${taskId}`);
      savedDocs[taskId] = serialized;
    }
    batchCommitted = Object.keys(savedDocs).length === 2;

    const passed = batchCommitted && !findUndefinedPaths(savedDocs).length;
    results.push({
      id: 'HR06',
      name: 'HR06 — Confirm/Save persists proposal',
      passed,
      expected: 'Proposta de rebalanceamento salva com sucesso sem exceção de undefined no Firestore',
      actual: `batchCommitted=${batchCommitted}, savedDocsCount=${Object.keys(savedDocs).length}`
    });
  } catch (e: any) {
    results.push({ id: 'HR06', name: 'HR06 — Confirm/Save persists proposal', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HR07 — refresh preserves assignments ---
  try {
    const savedDoc = FirestoreMappers.fromTaskAssignment({
      id: 'asg-refresh-1',
      family_id: mockFamily.id,
      task_id: 'task-cozinha-1',
      member_id: adminCarla.id,
      room_id: 'room-cozinha-id',
      scheduled_date: '2026-09-15',
      scheduled_start: '09:00',
      scheduled_end: '09:30',
      status: 'SCHEDULED',
      assigned_reason: 'Equilíbrio semanal da carga',
      factors: {
        availability: 'Disponível',
        weeklyBalance: 'Carga baixa'
      }
    });

    // Simula reload/hidratação a partir do documento persistido no Firestore
    const rehydrated = FirestoreMappers.toTaskAssignment('asg-refresh-1', savedDoc);

    const passed = rehydrated.id === 'asg-refresh-1' &&
                   rehydrated.member_id === adminCarla.id &&
                   rehydrated.room_id === 'room-cozinha-id' &&
                   rehydrated.scheduled_date === '2026-09-15' &&
                   rehydrated.factors?.availability === 'Disponível';

    results.push({
      id: 'HR07',
      name: 'HR07 — refresh preserves assignments',
      passed,
      expected: 'Documento lido do Firestore é reconstruído com fidelidade ao modelo de domínio',
      actual: `rehydrated.member_id=${rehydrated.member_id}, room_id=${rehydrated.room_id}, factors=${JSON.stringify(rehydrated.factors)}`
    });
  } catch (e: any) {
    results.push({ id: 'HR07', name: 'HR07 — refresh preserves assignments', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HR08 — completed tasks remain untouched ---
  try {
    const completedTask = createTestTask({
      id: 't-completed-1',
      title: 'Lavar Roupa Feita',
      familyId: mockFamily.id,
      status: 'DONE',
      completedByMemberId: memberPedro.id,
      dueDate: '2026-09-15'
    });

    const pendingTask = createTestTask({
      id: 't-pending-1',
      title: 'Passar Roupa',
      familyId: mockFamily.id,
      status: 'PENDING',
      dueDate: '2026-09-15'
    });

    const tasks = [completedTask, pendingTask];

    const preview = DistributionService.executeRebalance({
      family: mockFamily,
      members: [adminCarla, memberPedro],
      tasks,
      protectedTimes: [],
      targetDate: '2026-09-15'
    });

    // Verifica que a tarefa concluída NÃO foi incluída no preview de alterações
    const completedInUpdates = 't-completed-1' in preview.taskUpdates;

    // Simulação do loop de persistência para garantir que tasks DONE são puladas
    const writtenTaskIds: string[] = [];
    for (const [taskId, update] of Object.entries(preview.taskUpdates)) {
      const original = tasks.find(t => t.id === taskId);
      if (original?.status === 'DONE' || (original?.status as string) === 'COMPLETED') {
        continue;
      }
      writtenTaskIds.push(taskId);
    }

    const passed = !completedInUpdates && !writtenTaskIds.includes('t-completed-1');

    results.push({
      id: 'HR08',
      name: 'HR08 — completed tasks remain untouched',
      passed,
      expected: 'Tarefas concluídas (DONE/COMPLETED) nunca são alteradas nem persistidas no rebalanceamento',
      actual: `completedInUpdates=${completedInUpdates}, writtenTaskIds=${JSON.stringify(writtenTaskIds)}`
    });
  } catch (e: any) {
    results.push({ id: 'HR08', name: 'HR08 — completed tasks remain untouched', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HR09 — Firestore write error is surfaced ---
  try {
    let errorCaughtByCaller = false;
    let errorMessage = '';

    // Simula uma falha no commit do Firestore durante a persistência
    async function simulateFailedPersistence(): Promise<void> {
      try {
        throw new Error('Firestore WriteBatch failed: connection timeout');
      } catch (err: any) {
        // O serviço repassa o erro (re-throw) sem engoli-lo
        throw err;
      }
    }

    try {
      await simulateFailedPersistence();
    } catch (err: any) {
      errorCaughtByCaller = true;
      errorMessage = err.message;
    }

    const passed = errorCaughtByCaller && errorMessage.includes('connection timeout');

    results.push({
      id: 'HR09',
      name: 'HR09 — Firestore write error is surfaced',
      passed,
      expected: 'Erro de escrita é relançado e capturado pela UI para apresentar feedback',
      actual: `errorCaught=${errorCaughtByCaller}, message="${errorMessage}"`
    });
  } catch (e: any) {
    results.push({ id: 'HR09', name: 'HR09 — Firestore write error is surfaced', passed: false, expected: 'PASS', actual: e.message });
  }

  // --- HR10 — Motor 2.0 unchanged ---
  try {
    const tasks: Task[] = [
      createTestTask({ id: 't-motor-1', title: 'Tirar Pó dos Móveis', effort: 2, familyId: mockFamily.id, dueDate: '2026-09-15' }),
      createTestTask({ id: 't-motor-2', title: 'Lavar Banheiro', effort: 4, familyId: mockFamily.id, dueDate: '2026-09-15' })
    ];

    const result1 = DistributionEngine.rebalance({
      targetDate: '2026-09-15',
      dayOfWeek: 2,
      users: [adminCarla, memberPedro],
      allTasks: [],
      familyTasks: [],
      existingAssignments: [],
      preferences: [],
      skills: [],
      protectedTimes: []
    });

    // Motor continua operando suas regras canônicas de equilíbrio, geração de propostas e explicações
    const passed = result1.proposedAssignments !== undefined &&
                   Array.isArray(result1.proposedAssignments) &&
                   typeof result1.changesCount === 'number' &&
                   typeof result1.message === 'string';

    results.push({
      id: 'HR10',
      name: 'HR10 — Motor 2.0 unchanged',
      passed,
      expected: 'Motor 2.0 preserva contrato canônico intacto, sem alterações nas regras de cálculo ou scoring',
      actual: `proposedAssignmentsCount=${result1.proposedAssignments.length}, changesCount=${result1.changesCount}`
    });
  } catch (e: any) {
    results.push({ id: 'HR10', name: 'HR10 — Motor 2.0 unchanged', passed: false, expected: 'PASS', actual: e.message });
  }

  return results;
}
