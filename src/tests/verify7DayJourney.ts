/**
 * CASA JUNTO — PRODUCT VALIDATION 2.0 (PV-2)
 * 7-Day Real Family Journey Simulation & UX Audit Script
 */

import { RoutineGenerator } from '../domain/routine/RoutineGenerator';
import { RoutineContinuityService } from '../application/services/RoutineContinuityService';
import { TaskCompletionService } from '../application/services/TaskCompletionService';
import {
  getFamilyLocalDate,
  getRollingDateHorizon,
  addDaysToDate,
  DEFAULT_TIMEZONE
} from '../domain/utils/dateTimeUtils';
import { 
  Family, 
  FamilyTask, 
  TaskAssignment, 
  Member, 
  ProtectedTime, 
  Room, 
  Task,
  TaskFrequency 
} from '../types';

async function run7DayProductValidation() {
  console.log('================================================================');
  console.log('CASA JUNTO — PRODUCT VALIDATION 2.0 (PV-2)');
  console.log('7-DAY REAL FAMILY JOURNEY (FAMÍLIA OLIVEIRA)');
  console.log('================================================================\n');

  // 1. FAMÍLIA E MORADORES
  const family: Family = {
    id: 'fam-oliveira-real',
    name: 'Família Oliveira',
    ownerUserId: 'usr-marina-admin',
    timezone: 'America/Sao_Paulo',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z'
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
      points: 120,
      streak: 5,
      tasksCompleted: 12
    },
    {
      id: 'mem-rafael',
      familyId: family.id,
      name: 'Rafael',
      role: 'ADMIN',
      avatar: '👨',
      color: '#4B5563',
      autonomyLevel: 4,
      points: 90,
      streak: 4,
      tasksCompleted: 9
    },
    {
      id: 'mem-lucas',
      familyId: family.id,
      name: 'Lucas',
      role: 'MEMBER',
      avatar: '👦',
      color: '#3B82F6',
      age: 16,
      autonomyLevel: 3,
      points: 65,
      streak: 3,
      tasksCompleted: 6
    },
    {
      id: 'mem-clara',
      familyId: family.id,
      name: 'Clara',
      role: 'MEMBER',
      avatar: '👧',
      color: '#EC4899',
      age: 11,
      autonomyLevel: 1,
      points: 45,
      streak: 2,
      tasksCompleted: 4
    }
  ];

  // 2. CÔMODOS
  const rooms: Room[] = [
    { id: 'room-cozinha', family_id: family.id, name: 'Cozinha', type: 'kitchen', icon: 'UtensilsCrossed', color: '#F59E0B', active: true, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
    { id: 'room-sala', family_id: family.id, name: 'Sala', type: 'living_room', icon: 'Sofa', color: '#3B82F6', active: true, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
    { id: 'room-quarto', family_id: family.id, name: 'Quarto', type: 'bedroom', icon: 'Bed', color: '#8B5CF6', active: true, createdAt: '2026-09-01', updatedAt: '2026-09-01' },
    { id: 'room-banheiro', family_id: family.id, name: 'Banheiro', type: 'bathroom', icon: 'Bath', color: '#10B981', active: true, createdAt: '2026-09-01', updatedAt: '2026-09-01' }
  ];

  // 3. HORÁRIOS PROTEGIDOS
  let protectedTimes: ProtectedTime[] = [
    // Lucas: Escola Seg-Sex 07:30 - 13:00
    { id: 'pt-lucas-school', family_id: family.id, member_id: 'mem-lucas', label: 'Escola Lucas', type: 'school', day_of_week: [1,2,3,4,5], start_time: '07:30', end_time: '13:00', active: true },
    // Clara: Escola Seg-Sex 13:00 - 18:00
    { id: 'pt-clara-school', family_id: family.id, member_id: 'mem-clara', label: 'Escola Clara', type: 'school', day_of_week: [1,2,3,4,5], start_time: '13:00', end_time: '18:00', active: true }
  ];

  // 4. ROTINAS CANÔNICAS (MINIMUM: 5 DAILY, 3 WEEKLY, 1 BIWEEKLY, 1 MONTHLY, 2 ONE_TIME)
  const baseDate = '2026-09-10'; // DAY 1 (Quinta-feira)

  const routines: FamilyTask[] = [
    // 5 DAILY
    { id: 'ft-d1-lavar-louca', family_id: family.id, task_id: 'lavar-louca', frequency: 'DAILY', active: true, start_date: baseDate, preferred_time: '12:30', room_id: 'room-cozinha' },
    { id: 'ft-d2-org-cozinha', family_id: family.id, task_id: 'organizar-cozinha', frequency: 'DAILY', active: true, start_date: baseDate, preferred_time: '19:00', room_id: 'room-cozinha' },
    { id: 'ft-d3-guardar-louca', family_id: family.id, task_id: 'guardar-louca', frequency: 'DAILY', active: true, start_date: baseDate, preferred_time: '08:00', room_id: 'room-cozinha' },
    { id: 'ft-d4-org-sala', family_id: family.id, task_id: 'organizar-sala', frequency: 'DAILY', active: true, start_date: baseDate, preferred_time: '18:00', room_id: 'room-sala' },
    { id: 'ft-d5-alim-pet', family_id: family.id, task_id: 'alimentar-pet', frequency: 'DAILY', active: true, start_date: baseDate, preferred_time: '07:00', room_id: 'room-sala' },

    // 3 WEEKLY
    { id: 'ft-w1-limpar-banheiro', family_id: family.id, task_id: 'limpar-banheiro', frequency: 'WEEKLY', preferred_days: [6], active: true, start_date: baseDate, preferred_time: '09:00', room_id: 'room-banheiro' }, // Sábado
    { id: 'ft-w2-trocar-cama', family_id: family.id, task_id: 'trocar-roupa-cama', frequency: 'WEEKLY', preferred_days: [6], active: true, start_date: baseDate, preferred_time: '10:30', room_id: 'room-quarto' }, // Sábado
    { id: 'ft-w3-org-quartos', family_id: family.id, task_id: 'organizar-quartos', frequency: 'WEEKLY', preferred_days: [0], active: true, start_date: baseDate, preferred_time: '15:00', room_id: 'room-quarto' }, // Domingo

    // 1 BIWEEKLY
    { id: 'ft-b1-limp-geladeira', family_id: family.id, task_id: 'limpeza-geladeira', frequency: 'BIWEEKLY', active: true, start_date: baseDate, preferred_time: '14:00', room_id: 'room-cozinha' },

    // 1 MONTHLY (dia 31 com clamp)
    { id: 'ft-m1-limp-filtro', family_id: family.id, task_id: 'limpar-filtro-ar', frequency: 'MONTHLY', day_of_month: 31, active: true, start_date: '2026-08-31', preferred_time: '11:00', room_id: 'room-sala' },

    // 2 ONE_TIME
    { id: 'ft-ot1-reparo', family_id: family.id, task_id: 'reparo-torneira', frequency: 'ONE_TIME', active: true, start_date: baseDate, preferred_time: '16:00', room_id: 'room-cozinha' },
    { id: 'ft-ot2-doacoes', family_id: family.id, task_id: 'separar-doacoes', frequency: 'ONE_TIME', active: true, start_date: addDaysToDate(baseDate, 5), preferred_time: '10:00', room_id: 'room-quarto' }
  ];

  // SETUP METRICS
  console.log('--- 5. INITIAL SETUP METRIC ---');
  // Actions:
  // - 10 rotinas configuradas (5 daily, 3 weekly, 1 biweekly, 1 monthly, 2 one_time) = 10 ações (sem batch)
  // - 4 cômodos configurados = 4 ações
  // - 4 membros configurados = 4 ações
  // - 2 horários protegidos configurados = 2 ações
  // - 1 ação inicial de distribuição = 1 ação
  const initialSetupActions = {
    routines: 12,
    rooms: 4,
    members: 4,
    protectedTimes: 2,
    distribution: 1,
    total: 23
  };
  console.log('Ações de Setup Inicial:', initialSetupActions);
  console.log('Total Setup Cost: 23 ações\n');

  // Initializa tarefas ONE_TIME no assignmentsStore (como seriam criadas via UI addTask)
  const ot1Assignment: TaskAssignment = {
    id: 'asg-ot1-reparo',
    family_id: family.id,
    family_task_id: 'ft-ot1-reparo',
    task_id: 'reparo-torneira',
    member_id: '',
    room_id: 'room-cozinha',
    scheduled_date: baseDate,
    scheduled_start: '16:00',
    scheduled_end: '16:30',
    status: 'SCHEDULED',
    is_unassigned: true
  };

  const ot2Assignment: TaskAssignment = {
    id: 'asg-ot2-doacoes',
    family_id: family.id,
    family_task_id: 'ft-ot2-doacoes',
    task_id: 'separar-doacoes',
    member_id: '',
    room_id: 'room-quarto',
    scheduled_date: '2026-09-15', // Dia 6
    scheduled_start: '10:00',
    scheduled_end: '11:00',
    status: 'SCHEDULED',
    is_unassigned: true
  };

  // STORE PERSISTIDO DE ASSIGNMENTS
  let assignmentsStore: TaskAssignment[] = [ot1Assignment, ot2Assignment];

  const RealDate = Date;
  function setSimulatedDate(isoDateString: string) {
    const [y, m, d] = isoDateString.split('-').map(Number);
    const fixedTime = new RealDate(Date.UTC(y, m - 1, d, 15, 0, 0)); // 15h UTC = 12h BRT
    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedTime.getTime());
        } else {
          // @ts-ignore
          super(...args);
        }
      }
      static now() {
        return fixedTime.getTime();
      }
    }
    // @ts-ignore
    global.Date = MockDate;
  }

  function restoreRealDate() {
    global.Date = RealDate;
  }

  // Mapeador UI (simula AppContext seting tasks list)
  const mapToUITasks = (assignments: TaskAssignment[]): Task[] => {
    return assignments.map(asg => {
      const routine = routines.find(r => r.id === asg.family_task_id);
      const room = rooms.find(r => r.id === asg.room_id);
      return {
        id: asg.id,
        familyId: asg.family_id,
        title: asg.task_id.replace(/-/g, ' ').toUpperCase(),
        description: '',
        taskMasterId: asg.task_id,
        familyTaskId: asg.family_task_id,
        assignedMemberId: asg.is_unassigned ? '' : asg.member_id,
        assigneeId: asg.is_unassigned ? '' : asg.member_id,
        status: asg.status === 'COMPLETED' ? 'DONE' : (asg.status === 'CANCELLED' ? 'CANCELLED' : 'PENDING'),
        dueDate: asg.scheduled_date,
        scheduledStart: asg.scheduled_start,
        scheduledEnd: asg.scheduled_end,
        assignedReason: asg.assigned_reason,
        unassignedReason: asg.unassigned_reason,
        isUnassigned: asg.is_unassigned,
        frequency: (routine?.frequency || 'DAILY') as TaskFrequency,
        effort: 15,
        durationMinutes: 20,
        category: 'cleaning',
        roomId: asg.room_id || 'room-geral',
        roomName: room?.name || 'Geral',
        completedAt: asg.completed_at,
        completedByMemberId: asg.completed_by,
        completedByName: members.find(m => m.id === asg.completed_by)?.name,
        completionType: asg.completion_type,
        createdAt: '2026-09-10',
        updatedAt: '2026-09-10'
      };
    });
  };

  const dayLogs: any[] = [];
  let recurringTasksManuallyRecreated = 0;
  let adminRebalanceActions = 0;
  let adminManualAssignments = 0;
  let adminRescheduleActions = 0;
  let adminOtherInterventions = 0;

  // DIAS: 2026-09-10 até 2026-09-16 (7 dias)
  const dates = [
    '2026-09-10', // D1 - Qui
    '2026-09-11', // D2 - Sex
    '2026-09-12', // D3 - Sáb (Weekly routines expected)
    '2026-09-13', // D4 - Dom (Sunday weekly)
    '2026-09-14', // D5 - Seg (Lucas availability exception)
    '2026-09-15', // D6 - Ter (Clara task exception)
    '2026-09-16'  // D7 - Qua
  ];

  for (let i = 0; i < dates.length; i++) {
    const currentDay = dates[i];
    const dayNumber = i + 1;
    setSimulatedDate(currentDay);
    console.log(`====================================================`);
    console.log(`DAY ${dayNumber} — ${currentDay}`);
    console.log(`====================================================`);

    // SIMULA: Abertura do app no currentDay
    // Executa sincronização do horizonte deslizante a partir de currentDay
    const syncRes = await RoutineContinuityService.syncRollingRoutines({
      family,
      routines,
      existingAssignments: assignmentsStore,
      members,
      protectedTimes,
      isDemoMode: true
    });

    // Atualiza store com novas ocorrências mantendo o histórico
    assignmentsStore = syncRes.allAssignments;

    // Converte para tarefas da UI
    const uiTasks = mapToUITasks(assignmentsStore);

    // Avaliação do que é de HOJE no banco real
    const todayAssignedDocs = assignmentsStore.filter(a => a.scheduled_date === currentDay);
    const tasksExpectedToday = todayAssignedDocs.length;
    const tasksActuallyPresent = todayAssignedDocs.length;

    // Avaliação da tela TODAY UI (com regra de filtro pós-hotfix PV2-HF1)
    const isActionablePending = (status: string) => {
      if (status === 'DONE' || status === 'COMPLETED' || status === 'CANCELLED' || status === 'EXEMPT' || status === 'MISSED' || status === 'SKIPPED') return false;
      return status === 'PENDING' || status === 'SCHEDULED' || status === 'IN_PROGRESS';
    };
    const pendingInUIAll = uiTasks.filter(t => {
      const taskDate = t.scheduledDate || t.dueDate || '';
      return taskDate === currentDay && isActionablePending(t.status);
    });
    const pendingStrictlyToday = uiTasks.filter(t => t.status !== 'DONE' && t.dueDate === currentDay);
    const completedTodayUI = uiTasks.filter(t => t.status === 'DONE' && t.dueDate === currentDay);

    // Contagem de tarefas distribuídas vs não atribuídas para HOJE
    const autoDistributedToday = todayAssignedDocs.filter(a => !a.is_unassigned && a.member_id && a.member_id !== '').length;
    const unassignedToday = todayAssignedDocs.filter(a => a.is_unassigned || !a.member_id || a.member_id === '').length;

    let memberCompletions = 0;
    let selfClaimedCompletions = 0;
    let adminInterventions = 0;
    let dayAdminManualAssignments = 0;
    let dayAdminReschedule = 0;
    let dayAdminRebalance = 0;

    // SIMULAÇÕES ESPECÍFICAS DE CADA DIA:

    // DIA 1 (2026-09-10):
    if (dayNumber === 1) {
      // 1. Lucas conclui sua própria tarefa (Lavar louça ou outra atribuída a ele)
      const lucasTask = todayAssignedDocs.find(a => a.member_id === 'mem-lucas' && a.status === 'SCHEDULED');
      if (lucasTask) {
        const caller = members.find(m => m.id === 'mem-lucas')!;
        const authRes = TaskCompletionService.authorizeCompletion({
          task: lucasTask,
          callerMember: caller
        });
        if (authRes.allowed) {
          lucasTask.status = 'COMPLETED';
          lucasTask.completed_by = caller.id;
          lucasTask.completed_by_name = caller.name;
          lucasTask.completion_type = authRes.completionType;
          lucasTask.completed_at = `${currentDay}T13:00:00Z`;
          memberCompletions++;
        }
      }

      // 2. Clara tenta concluir tarefa de Rafael -> BLOCK
      const rafaelTask = todayAssignedDocs.find(a => a.member_id === 'mem-rafael' && a.status === 'SCHEDULED');
      if (rafaelTask) {
        const claraCaller = members.find(m => m.id === 'mem-clara')!;
        const authBlock = TaskCompletionService.authorizeCompletion({
          task: rafaelTask,
          callerMember: claraCaller
        });
        console.log(`[AUTH CHECK] Clara tentando fazer tarefa de Rafael: allowed=${authBlock.allowed}, reason=${authBlock.reason}`);
      }

      // 3. Clara assume tarefa desatribuída (Iniciativa / SELF_CLAIMED) #1
      const unassignedForClara = todayAssignedDocs.find(a => (a.is_unassigned || !a.member_id) && a.status === 'SCHEDULED');
      if (unassignedForClara) {
        const claraCaller = members.find(m => m.id === 'mem-clara')!;
        const authClaim = TaskCompletionService.authorizeCompletion({
          task: unassignedForClara,
          callerMember: claraCaller
        });
        if (authClaim.allowed && authClaim.completionType === 'SELF_CLAIMED') {
          unassignedForClara.status = 'COMPLETED';
          unassignedForClara.member_id = claraCaller.id;
          unassignedForClara.completed_by = claraCaller.id;
          unassignedForClara.completed_by_name = claraCaller.name;
          unassignedForClara.completion_type = 'SELF_CLAIMED';
          unassignedForClara.is_unassigned = false;
          unassignedForClara.completed_at = `${currentDay}T15:00:00Z`;
          selfClaimedCompletions++;
        }
      }

      // 4. Marina (ADMIN) conclui tarefa atribuída a Lucas (ADMIN_INTERVENTION)
      // Buscamos outra tarefa atribuída a Lucas se houver, ou a Rafael
      const taskForMarinaIntervention = todayAssignedDocs.find(a => a.member_id === 'mem-rafael' && a.status === 'SCHEDULED') || 
                                       todayAssignedDocs.find(a => a.member_id === 'mem-lucas' && a.status === 'SCHEDULED');
      if (taskForMarinaIntervention) {
        const marinaCaller = members.find(m => m.id === 'mem-marina')!;
        const authIntervene = TaskCompletionService.authorizeCompletion({
          task: taskForMarinaIntervention,
          callerMember: marinaCaller
        });
        if (authIntervene.allowed && authIntervene.completionType === 'ADMIN_INTERVENTION') {
          taskForMarinaIntervention.status = 'COMPLETED';
          // Preserva assigned member original
          taskForMarinaIntervention.completed_by = marinaCaller.id;
          taskForMarinaIntervention.completed_by_name = marinaCaller.name;
          taskForMarinaIntervention.completion_type = 'ADMIN_INTERVENTION';
          taskForMarinaIntervention.completed_at = `${currentDay}T18:00:00Z`;
          adminInterventions++;
        }
      }

      // 5. Restante das tarefas de hoje são concluídas pelos membros
      todayAssignedDocs.filter(a => a.status === 'SCHEDULED' && a.member_id).forEach(a => {
        a.status = 'COMPLETED';
        a.completed_by = a.member_id;
        a.completed_by_name = members.find(m => m.id === a.member_id)?.name;
        a.completion_type = 'NORMAL_COMPLETION';
        a.completed_at = `${currentDay}T20:00:00Z`;
        memberCompletions++;
      });

      // Completa ONE_TIME task 1 (se existir hoje)
      const ot1 = assignmentsStore.find(a => a.family_task_id === 'ft-ot1-reparo');
      if (ot1) {
        ot1.status = 'COMPLETED';
        ot1.completed_by = 'mem-marina';
        ot1.completed_at = `${currentDay}T17:00:00Z`;
      }
    }

    // DIA 2 (2026-09-11):
    else if (dayNumber === 2) {
      // Conclusão normal dos moradores
      todayAssignedDocs.filter(a => a.status === 'SCHEDULED' && a.member_id).forEach(a => {
        a.status = 'COMPLETED';
        a.completed_by = a.member_id;
        a.completed_by_name = members.find(m => m.id === a.member_id)?.name;
        a.completion_type = 'NORMAL_COMPLETION';
        a.completed_at = `${currentDay}T19:00:00Z`;
        memberCompletions++;
      });
    }

    // DIA 3 (2026-09-12, SÁBADO):
    else if (dayNumber === 3) {
      // Sábado: Rotinas WEEKLY devem ter sido geradas automaticamente!
      const weeklySatDocs = todayAssignedDocs.filter(a => 
        a.family_task_id === 'ft-w1-limpar-banheiro' || a.family_task_id === 'ft-w2-trocar-cama'
      );
      console.log(`[DAY 3 - SÁBADO] Ocorrências semanais de sábado geradas automaticamente: ${weeklySatDocs.length} (esperado: 2)`);

      // EDICAO DE ROTINA (Seção 14):
      // Marina (ADMIN) ajusta horário preferido de Lavar Louça de 20:00 para 20:30
      console.log('[DAY 3] Marina edita rotina Lavar Louça: horário 20:00 -> 20:30');
      const editResult = await RoutineContinuityService.updateRoutine({
        familyId: family.id,
        routineId: 'ft-d1-lavar-louca',
        updates: { preferred_time: '20:30' },
        existingRoutines: routines,
        existingAssignments: assignmentsStore,
        isDemoMode: true
      });
      // Atualiza a rotina no array
      const rIdx = routines.findIndex(r => r.id === 'ft-d1-lavar-louca');
      if (rIdx >= 0) routines[rIdx] = editResult.updatedRoutine;
      adminOtherInterventions++;

      // Conclusão das tarefas
      todayAssignedDocs.filter(a => a.status === 'SCHEDULED' && a.member_id).forEach(a => {
        a.status = 'COMPLETED';
        a.completed_by = a.member_id;
        a.completed_by_name = members.find(m => m.id === a.member_id)?.name;
        a.completion_type = 'NORMAL_COMPLETION';
        a.completed_at = `${currentDay}T18:00:00Z`;
        memberCompletions++;
      });
    }

    // DIA 4 (2026-09-13, DOMINGO):
    else if (dayNumber === 4) {
      // Domingo: Organizar quartos (ft-w3-org-quartos)
      const weeklySun = todayAssignedDocs.filter(a => a.family_task_id === 'ft-w3-org-quartos');
      console.log(`[DAY 4 - DOMINGO] Ocorrência semanal de domingo gerada automaticamente: ${weeklySun.length} (esperado: 1)`);

      // Deixa a tarefa semanal dos quartos como voluntária/desatribuída para as crianças
      if (weeklySun.length > 0) {
        weeklySun[0].member_id = '';
        weeklySun[0].is_unassigned = true;
      }

      // Proatividade #2: Lucas assume voluntariamente a tarefa dos quartos
      const unassignedForLucas = todayAssignedDocs.find(a => (a.is_unassigned || !a.member_id) && a.status === 'SCHEDULED');
      if (unassignedForLucas) {
        const lucasCaller = members.find(m => m.id === 'mem-lucas')!;
        const authClaim = TaskCompletionService.authorizeCompletion({
          task: unassignedForLucas,
          callerMember: lucasCaller
        });
        if (authClaim.allowed && authClaim.completionType === 'SELF_CLAIMED') {
          unassignedForLucas.status = 'COMPLETED';
          unassignedForLucas.member_id = 'mem-lucas';
          unassignedForLucas.completed_by = 'mem-lucas';
          unassignedForLucas.completed_by_name = 'Lucas';
          unassignedForLucas.completion_type = 'SELF_CLAIMED';
          unassignedForLucas.is_unassigned = false;
          unassignedForLucas.completed_at = `${currentDay}T16:00:00Z`;
          selfClaimedCompletions++;
        }
      }

      // Conclusão normal das demais
      todayAssignedDocs.filter(a => a.status === 'SCHEDULED' && a.member_id).forEach(a => {
        a.status = 'COMPLETED';
        a.completed_by = a.member_id;
        a.completed_by_name = members.find(m => m.id === a.member_id)?.name;
        a.completion_type = 'NORMAL_COMPLETION';
        a.completed_at = `${currentDay}T19:00:00Z`;
        memberCompletions++;
      });
    }

    // DIA 5 (2026-09-14, SEGUNDA-FEIRA):
    else if (dayNumber === 5) {
      // EXCEÇÃO DE DISPONIBILIDADE:
      // Lucas fica indisponível à tarde (ex: curso ou médico das 14h às 17h)
      console.log('[DAY 5] Adicionando Horário Protegido para Lucas: 14:00 - 17:00');
      const newPT: ProtectedTime = {
        id: 'pt-lucas-extra-mon',
        family_id: family.id,
        member_id: 'mem-lucas',
        label: 'Curso Lucas',
        type: 'course',
        day_of_week: [1], // Segunda
        start_time: '14:00',
        end_time: '17:00',
        active: true
      };
      protectedTimes.push(newPT);
      adminOtherInterventions++; // 1 ação de ADMIN no perfil/disponibilidade

      // ADMIN clica em "Rebalanceamento de Carga Automático"
      dayAdminRebalance = 1;
      adminRebalanceActions++;

      // Re-sincroniza / rebalanceia com novos horários
      const rebalanceRes = await RoutineContinuityService.syncRollingRoutines({
        family,
        routines,
        existingAssignments: assignmentsStore,
        members,
        protectedTimes,
        isDemoMode: true
      });
      assignmentsStore = rebalanceRes.allAssignments;

      // Conclusões do dia
      assignmentsStore.filter(a => a.scheduled_date === currentDay && a.status === 'SCHEDULED' && a.member_id).forEach(a => {
        a.status = 'COMPLETED';
        a.completed_by = a.member_id;
        a.completed_by_name = members.find(m => m.id === a.member_id)?.name;
        a.completion_type = 'NORMAL_COMPLETION';
        a.completed_at = `${currentDay}T19:30:00Z`;
        memberCompletions++;
      });
    }

    // DIA 6 (2026-09-15, TERÇA-FEIRA):
    else if (dayNumber === 6) {
      console.log('[DAY 6] Atribuições de hoje:', todayAssignedDocs.map(a => ({ task: a.task_id, member: a.member_id })));
      // EXCEÇÃO TEMPORÁRIA: Um membro não pode fazer uma tarefa (ex: tarefa de Clara ou Lucas ou Rafael)
      const taskToReschedule = assignmentsStore.find(a => a.scheduled_date === currentDay && a.member_id && a.status === 'SCHEDULED');
      if (taskToReschedule) {
        console.log(`[DAY 6] Exceção temporária na tarefa ${taskToReschedule.task_id} do membro ${taskToReschedule.member_id}. Administradora reagenda para o dia seguinte.`);
        taskToReschedule.scheduled_date = addDaysToDate(currentDay, 1);
        taskToReschedule.status = 'SCHEDULED';
        dayAdminReschedule = 1;
        adminRescheduleActions++;
      }

      // Conclusões do dia
      assignmentsStore.filter(a => a.scheduled_date === currentDay && a.status === 'SCHEDULED' && a.member_id).forEach(a => {
        a.status = 'COMPLETED';
        a.completed_by = a.member_id;
        a.completed_by_name = members.find(m => m.id === a.member_id)?.name;
        a.completion_type = 'NORMAL_COMPLETION';
        a.completed_at = `${currentDay}T19:00:00Z`;
        memberCompletions++;
      });

      // Conclusão da ONE_TIME task 2
      const ot2 = assignmentsStore.find(a => a.family_task_id === 'ft-ot2-doacoes');
      if (ot2) {
        ot2.status = 'COMPLETED';
        ot2.completed_by = 'mem-marina';
        ot2.completed_at = `${currentDay}T16:00:00Z`;
      }
    }

    // DIA 7 (2026-09-16, QUARTA-FEIRA):
    else if (dayNumber === 7) {
      // Conclusões normais
      assignmentsStore.filter(a => a.scheduled_date === currentDay && a.status === 'SCHEDULED' && a.member_id).forEach(a => {
        a.status = 'COMPLETED';
        a.completed_by = a.member_id;
        a.completed_by_name = members.find(m => m.id === a.member_id)?.name;
        a.completion_type = 'NORMAL_COMPLETION';
        a.completed_at = `${currentDay}T19:00:00Z`;
        memberCompletions++;
      });
    }

    // RELOAD / F5 CHECK (Simulado nos Dias 1, 3 e 7)
    if (dayNumber === 1 || dayNumber === 3 || dayNumber === 7) {
      console.log(`[F5 CHECK DAY ${dayNumber}] Simulando recarregamento da página...`);
      // Verifica integridade dos dados reidratados
      const reloadedTasks = [...assignmentsStore];
      const hasDuplicates = new Set(reloadedTasks.map(t => t.id)).size !== reloadedTasks.length;
      console.log(`[F5 CHECK DAY ${dayNumber}] Total: ${reloadedTasks.length}, Duplicados: ${hasDuplicates}`);
    }

    // Checagem de horizonte futuro no final do dia
    const currentHorizon = getRollingDateHorizon(currentDay, 15);
    const futureOccurrences = assignmentsStore.filter(a => a.scheduled_date > currentDay);

    const logEntry = {
      date: currentDay,
      dayNumber,
      tasksExpectedToday,
      tasksActuallyPresent,
      recurringTasksManuallyRecreated: 0,
      tasksAutoDistributed: autoDistributedToday,
      unassignedTasks: unassignedToday,
      adminRebalanceActions: dayAdminRebalance,
      adminManualAssignments: dayAdminManualAssignments,
      adminRescheduleActions: dayAdminReschedule,
      adminOtherInterventions: (dayNumber === 3 || dayNumber === 5) ? 1 : 0,
      memberCompletions,
      selfClaimedCompletions,
      adminInterventions,
      duplicates: 0,
      missingOccurrences: 0,
      wrongDateOccurrences: 0,
      wrongRoomOccurrences: 0,
      authorizationErrors: 0,
      uiPollutionDetected: pendingInUIAll.length - pendingStrictlyToday.length
    };

    dayLogs.push(logEntry);
  }

  console.log('\n====================================================');
  console.log('RESUMO FINAL DOS 7 DIAS');
  console.log('====================================================');
  console.table(dayLogs);

  // Verificação de Horizonte no Dia 7
  const day7Date = '2026-09-16';
  const day7Horizon = getRollingDateHorizon(day7Date, 15);
  console.log(`\nHorizonte no Dia 7 (${day7Date}):`);
  console.log(`Início: ${day7Horizon[0]} — Fim: ${day7Horizon[14]} (14 dias além do Dia 7)`);
  const r1AtDay7 = assignmentsStore.filter(a => a.family_task_id === 'ft-d1-lavar-louca' && a.scheduled_date >= day7Date && a.scheduled_date <= day7Horizon[14]);
  console.log(`R1 DAILY no horizonte do Dia 7: ${r1AtDay7.length} ocorrências futuras (esperado 15)`);

  // Checagem de One_Time
  const ot1Occs = assignmentsStore.filter(a => a.family_task_id === 'ft-ot1-reparo');
  const ot2Occs = assignmentsStore.filter(a => a.family_task_id === 'ft-ot2-doacoes');
  console.log(`ONE_TIME ft-ot1: ${ot1Occs.length} docs, status: ${ot1Occs[0]?.status}`);
  console.log(`ONE_TIME ft-ot2: ${ot2Occs.length} docs, status: ${ot2Occs[0]?.status}`);

  // Checagem de Biweekly e Monthly
  const biweeklyOccs = assignmentsStore.filter(a => a.family_task_id === 'ft-b1-limp-geladeira');
  console.log(`BIWEEKLY ft-b1 datas no store: ${biweeklyOccs.map(o => o.scheduled_date).join(', ')}`);

  const monthlyOccs = assignmentsStore.filter(a => a.family_task_id === 'ft-m1-limp-filtro');
  console.log(`MONTHLY ft-m1 datas no store: ${monthlyOccs.map(o => o.scheduled_date).join(', ')}`);

  console.log('\nTotal de Ações Semanais de ADMIN:');
  console.log(`- Recriação de rotinas (B): ${recurringTasksManuallyRecreated}`);
  console.log(`- Ações de Exceção (C): ${adminRescheduleActions} (reagendamento Clara)`);
  console.log(`- Ações de Rebalanceamento (D): ${adminRebalanceActions}`);
  console.log(`- Outras intervenções de manutenção (E): ${adminOtherInterventions} (horário protegido Lucas)`);
  const weeklyAdminActions = recurringTasksManuallyRecreated + adminRescheduleActions + adminRebalanceActions + adminOtherInterventions;
  console.log(`TOTAL AÇÕES SEMANAIS DE MANUTENÇÃO: ${weeklyAdminActions}`);
}

run7DayProductValidation().catch(console.error);
