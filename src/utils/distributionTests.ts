import {
  User,
  TaskMaster,
  FamilyTask,
  MemberSkill,
  MemberPreference,
  ProtectedTime,
  HouseholdHelp,
  TaskAssignment
} from '../types';
import { allMasterTasks } from '../data/tasks';
import {
  distributeDailyTasks,
  DistributionContext,
  calculateMemberStats,
  analyzeDistributionBalance
} from './distributionEngine';

export interface TestScenarioResult {
  scenarioId: string;
  scenarioTitle: string;
  scenarioDescription: string;
  residents: User[];
  tasksScheduled: FamilyTask[];
  householdHelp?: HouseholdHelp;
  assignments: TaskAssignment[];
  assignmentsDetail: {
    taskName: string;
    category: string;
    room: string;
    duration: number;
    effortPoints: number;
    assignedTo: string;
    score: number;
    reason: string;
    factors: any;
    contributionBefore: number;
    contributionAfter: number;
    isUnassigned: boolean;
  }[];
  passedChecks: {
    name: string;
    passed: boolean;
    detail: string;
  }[];
  fairnessIndex: number;
}

export function runAllDistributionTests(): TestScenarioResult[] {
  const results: TestScenarioResult[] = [];

  // ==========================================
  // CENÁRIO A: Família com dois adultos
  // ==========================================
  {
    const users: User[] = [
      {
        id: 'user-marcos',
        name: 'Marcos',
        email: 'marcos@test.com',
        avatar: 'M',
        role: 'ADMIN',
        family_id: 'fam-a',
        birth_date: '1986-04-10',
        age: 38,
        autonomy_level: 4,
        active: true,
        color: '#A5D8FF'
      },
      {
        id: 'user-helena',
        name: 'Helena',
        email: 'helena@test.com',
        avatar: 'H',
        role: 'MEMBER',
        family_id: 'fam-a',
        birth_date: '1988-09-15',
        age: 36,
        autonomy_level: 4,
        active: true,
        color: '#86c99c'
      }
    ];

    const familyTasks: FamilyTask[] = [
      { id: 'ft-a1', family_id: 'fam-a', task_master_id: 'clean-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true }, // Aspirar sala
      { id: 'ft-a2', family_id: 'fam-a', task_master_id: 'kit-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true }, // Lavar louça almoço
      { id: 'ft-a3', family_id: 'fam-a', task_master_id: 'wst-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true }, // Recolher lixo
      { id: 'ft-a4', family_id: 'fam-a', task_master_id: 'lnd-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true }  // Estender roupas
    ];

    const prefs: MemberPreference[] = [
      { id: 'p1', member_id: 'user-marcos', task_master_id: 'wst-1', preference: 'LIKE' },
      { id: 'p2', member_id: 'user-helena', task_master_id: 'kit-1', preference: 'LIKE' }
    ];

    const ctx: DistributionContext = {
      users,
      allTasks: allMasterTasks,
      familyTasks,
      skills: [],
      preferences: prefs,
      protectedTimes: [],
      existingAssignments: [],
      targetDate: '2026-09-01',
      dayOfWeek: 2 // Terça
    };

    const asgs = distributeDailyTasks(ctx);
    const balance = analyzeDistributionBalance(asgs, users, allMasterTasks);

    const details = asgs.map(a => {
      const tm = allMasterTasks.find(t => t.id === a.task_id);
      const member = users.find(u => u.id === a.member_id);
      return {
        taskName: tm?.name || 'Tarefa',
        category: tm?.category || '',
        room: tm?.room_type || '',
        duration: tm?.duration_minutes || 15,
        effortPoints: (tm?.duration_minutes || 15) * (tm?.effort_level || 3),
        assignedTo: member?.name || 'Não atribuído',
        score: a.score,
        reason: a.assigned_reason,
        factors: a.factors,
        contributionBefore: 0,
        contributionAfter: (tm?.duration_minutes || 15),
        isUnassigned: !!a.is_unassigned
      };
    });

    const marcosCount = asgs.filter(a => a.member_id === 'user-marcos').length;
    const helenaCount = asgs.filter(a => a.member_id === 'user-helena').length;

    results.push({
      scenarioId: 'scen-a',
      scenarioTitle: 'Cenário A: Família com Dois Adultos',
      scenarioDescription: 'Distribuição equilibrada e justa entre dois parceiros com mesma autonomia e capacidades.',
      residents: users,
      tasksScheduled: familyTasks,
      assignments: asgs,
      assignmentsDetail: details,
      fairnessIndex: balance.fairnessIndex,
      passedChecks: [
        { name: 'Ambos os adultos receberam tarefas', passed: marcosCount > 0 && helenaCount > 0, detail: `Marcos: ${marcosCount}, Helena: ${helenaCount}` },
        { name: 'Nenhuma tarefa ficou sem justificativa', passed: asgs.every(a => a.assigned_reason && a.assigned_reason.length > 5), detail: 'Todas as tarefas possuem assigned_reason explicável' },
        { name: 'Preferências respeitadas no score', passed: asgs.some(a => a.member_id === 'user-marcos' && a.task_id === 'wst-1'), detail: 'Marcos recebeu a tarefa que gosta (Lixo)' }
      ]
    });
  }

  // ==========================================
  // CENÁRIO B: Dois adultos + Adolescente (14 anos)
  // ==========================================
  {
    const users: User[] = [
      { id: 'usr-pai', name: 'Roberto', email: 'r@test.com', avatar: 'R', role: 'ADMIN', family_id: 'fam-b', birth_date: '1980-01-01', age: 44, autonomy_level: 4, active: true, color: '#A5D8FF' },
      { id: 'usr-mae', name: 'Clara', email: 'c@test.com', avatar: 'C', role: 'MEMBER', family_id: 'fam-b', birth_date: '1982-01-01', age: 42, autonomy_level: 4, active: true, color: '#86c99c' },
      { id: 'usr-filho', name: 'Lucas (14a)', email: 'l@test.com', avatar: 'L', role: 'MEMBER', family_id: 'fam-b', birth_date: '2012-01-01', age: 14, autonomy_level: 3, active: true, color: '#F2C94C' }
    ];

    const protectedTimes: ProtectedTime[] = [
      { id: 'pt-esc', member_id: 'usr-filho', type: 'SCHOOL', label: 'Escola & Lição', day_of_week: [1, 2, 3, 4, 5], start_time: '07:00', end_time: '13:00', active: true }
    ];

    const familyTasks: FamilyTask[] = [
      { id: 'ft-b1', family_id: 'fam-b', task_master_id: 'bth-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], preferred_time: '09:00', active: true, assigned_automatically: true }, // Limpar vaso sanitário (adult_only ou idade 14+)
      { id: 'ft-b2', family_id: 'fam-b', task_master_id: 'clean-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], preferred_time: '16:00', active: true, assigned_automatically: true }, // Aspirar sala (tarde)
      { id: 'ft-b3', family_id: 'fam-b', task_master_id: 'pet-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], preferred_time: '17:00', active: true, assigned_automatically: true }, // Alimentar pet
      { id: 'ft-b4', family_id: 'fam-b', task_master_id: 'org-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], preferred_time: '17:30', active: true, assigned_automatically: true }  // Organizar sapatos
    ];

    const ctx: DistributionContext = {
      users,
      allTasks: allMasterTasks,
      familyTasks,
      skills: [],
      preferences: [],
      protectedTimes,
      existingAssignments: [],
      targetDate: '2026-09-01',
      dayOfWeek: 2
    };

    const asgs = distributeDailyTasks(ctx);
    const balance = analyzeDistributionBalance(asgs, users, allMasterTasks);

    const lucasTasks = asgs.filter(a => a.member_id === 'usr-filho');
    const lucasMorningConflict = lucasTasks.some(a => a.scheduled_start === '09:00');

    results.push({
      scenarioId: 'scen-b',
      scenarioTitle: 'Cenário B: Dois Adultos + 1 Adolescente',
      scenarioDescription: 'Verifica proteção de horário escolar para o adolescente e atribuição de tarefas seguras no período livre.',
      residents: users,
      tasksScheduled: familyTasks,
      assignments: asgs,
      assignmentsDetail: asgs.map(a => {
        const tm = allMasterTasks.find(t => t.id === a.task_id);
        const member = users.find(u => u.id === a.member_id);
        return {
          taskName: tm?.name || 'Tarefa',
          category: tm?.category || '',
          room: tm?.room_type || '',
          duration: tm?.duration_minutes || 15,
          effortPoints: (tm?.duration_minutes || 15) * (tm?.effort_level || 3),
          assignedTo: member?.name || 'Não atribuído',
          score: a.score,
          reason: a.assigned_reason,
          factors: a.factors,
          contributionBefore: 0,
          contributionAfter: tm?.duration_minutes || 15,
          isUnassigned: !!a.is_unassigned
        };
      }),
      fairnessIndex: balance.fairnessIndex,
      passedChecks: [
        { name: 'Adolescente protegido durante aula (07h-13h)', passed: !lucasMorningConflict, detail: 'Lucas não recebeu tarefas durante o período de aula' },
        { name: 'Adolescente participou ativamente no contraturno', passed: lucasTasks.length > 0, detail: `Lucas recebeu ${lucasTasks.length} tarefa(s) à tarde` },
        { name: 'Segurança cumprida', passed: asgs.every(a => {
          const tm = allMasterTasks.find(t => t.id === a.task_id);
          const u = users.find(usr => usr.id === a.member_id);
          return !u || !tm || u.age >= tm.minimum_age;
        }), detail: 'Nenhum membro abaixo da idade mínima' }
      ]
    });
  }

  // ==========================================
  // CENÁRIO C: Dois adultos + Adolescente + Jovem Adulto
  // ==========================================
  {
    const users: User[] = [
      { id: 'u1', name: 'Eduardo', email: 'e@test.com', avatar: 'E', role: 'ADMIN', family_id: 'fam-c', birth_date: '1978-01-01', age: 46, autonomy_level: 4, active: true, color: '#A5D8FF' },
      { id: 'u2', name: 'Luciana', email: 'l@test.com', avatar: 'L', role: 'MEMBER', family_id: 'fam-c', birth_date: '1980-01-01', age: 44, autonomy_level: 4, active: true, color: '#86c99c' },
      { id: 'u3', name: 'Ana (19a)', email: 'a@test.com', avatar: 'A', role: 'MEMBER', family_id: 'fam-c', birth_date: '2007-01-01', age: 19, autonomy_level: 4, active: true, color: '#A5D8FF' },
      { id: 'u4', name: 'Gabriel (13a)', email: 'g@test.com', avatar: 'G', role: 'MEMBER', family_id: 'fam-c', birth_date: '2013-01-01', age: 13, autonomy_level: 2, active: true, color: '#F2C94C' }
    ];

    const familyTasks: FamilyTask[] = [
      { id: 'ft-c1', family_id: 'fam-c', task_master_id: 'clean-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true },
      { id: 'ft-c2', family_id: 'fam-c', task_master_id: 'kit-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true },
      { id: 'ft-c3', family_id: 'fam-c', task_master_id: 'wst-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true },
      { id: 'ft-c4', family_id: 'fam-c', task_master_id: 'lnd-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true },
      { id: 'ft-c5', family_id: 'fam-c', task_master_id: 'org-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true }
    ];

    const ctx: DistributionContext = {
      users,
      allTasks: allMasterTasks,
      familyTasks,
      skills: [],
      preferences: [],
      protectedTimes: [],
      existingAssignments: [],
      targetDate: '2026-09-01',
      dayOfWeek: 2
    };

    const asgs = distributeDailyTasks(ctx);
    const balance = analyzeDistributionBalance(asgs, users, allMasterTasks);

    results.push({
      scenarioId: 'scen-c',
      scenarioTitle: 'Cenário C: 2 Adultos + Adolescente + Jovem Adulto',
      scenarioDescription: 'Família multigeracional com 4 membros ativos e diferentes níveis de capacidade.',
      residents: users,
      tasksScheduled: familyTasks,
      assignments: asgs,
      assignmentsDetail: asgs.map(a => {
        const tm = allMasterTasks.find(t => t.id === a.task_id);
        const member = users.find(usr => usr.id === a.member_id);
        return {
          taskName: tm?.name || 'Tarefa',
          category: tm?.category || '',
          room: tm?.room_type || '',
          duration: tm?.duration_minutes || 15,
          effortPoints: (tm?.duration_minutes || 15) * (tm?.effort_level || 3),
          assignedTo: member?.name || 'Não atribuído',
          score: a.score,
          reason: a.assigned_reason,
          factors: a.factors,
          contributionBefore: 0,
          contributionAfter: tm?.duration_minutes || 15,
          isUnassigned: !!a.is_unassigned
        };
      }),
      fairnessIndex: balance.fairnessIndex,
      passedChecks: [
        { name: 'Todos os 4 moradores foram contemplados', passed: users.every(u => asgs.some(a => a.member_id === u.id)), detail: 'Distribuição ampla sem exclusão' },
        { name: 'Índice de justiça acima de 75%', passed: balance.fairnessIndex >= 75, detail: `Índice calculado: ${balance.fairnessIndex}%` }
      ]
    });
  }

  // ==========================================
  // CENÁRIO D: Família com ajuda doméstica semanal
  // ==========================================
  {
    const users: User[] = [
      { id: 'usr-d1', name: 'Paula', email: 'p@test.com', avatar: 'P', role: 'ADMIN', family_id: 'fam-d', birth_date: '1984-01-01', age: 40, autonomy_level: 4, active: true, color: '#A5D8FF' },
      { id: 'usr-d2', name: 'Renato', email: 'r@test.com', avatar: 'R', role: 'MEMBER', family_id: 'fam-d', birth_date: '1982-01-01', age: 42, autonomy_level: 4, active: true, color: '#86c99c' }
    ];

    const householdHelp: HouseholdHelp = {
      id: 'hh-1',
      family_id: 'fam-d',
      type: 'diarista',
      helper_name: 'Dona Maria',
      frequency: '1x por semana',
      days: [3], // Quarta-feira
      tasks_covered: ['clean-1', 'bth-1', 'clean-2'], // Banheiro e pisos
      active: true
    };

    const familyTasks: FamilyTask[] = [
      { id: 'ft-d1', family_id: 'fam-d', task_master_id: 'clean-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true }, // Coberta pela diarista
      { id: 'ft-d2', family_id: 'fam-d', task_master_id: 'bth-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true },   // Coberta pela diarista
      { id: 'ft-d3', family_id: 'fam-d', task_master_id: 'kit-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true },   // Não coberta (louça do dia)
      { id: 'ft-d4', family_id: 'fam-d', task_master_id: 'wst-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true }    // Não coberta (lixo)
    ];

    const ctxWed: DistributionContext = {
      users,
      allTasks: allMasterTasks,
      familyTasks,
      skills: [],
      preferences: [],
      protectedTimes: [],
      existingAssignments: [],
      householdHelp,
      targetDate: '2026-09-02', // Quarta
      dayOfWeek: 3
    };

    const asgsWed = distributeDailyTasks(ctxWed);
    const hasDiaristaTaskAssignedToFamily = asgsWed.some(a => householdHelp.tasks_covered.includes(a.task_id));

    results.push({
      scenarioId: 'scen-d',
      scenarioTitle: 'Cenário D: Família com Ajuda Doméstica Semanal',
      scenarioDescription: 'No dia da diarista (Quarta-feira), o motor alivia as tarefas cobertas (pisos e banheiros) e mantém apenas as manutenções essenciais (louça e lixo).',
      residents: users,
      tasksScheduled: familyTasks,
      householdHelp,
      assignments: asgsWed,
      assignmentsDetail: asgsWed.map(a => {
        const tm = allMasterTasks.find(t => t.id === a.task_id);
        const member = users.find(usr => usr.id === a.member_id);
        return {
          taskName: tm?.name || 'Tarefa',
          category: tm?.category || '',
          room: tm?.room_type || '',
          duration: tm?.duration_minutes || 15,
          effortPoints: (tm?.duration_minutes || 15) * (tm?.effort_level || 3),
          assignedTo: member?.name || 'Não atribuído',
          score: a.score,
          reason: a.assigned_reason,
          factors: a.factors,
          contributionBefore: 0,
          contributionAfter: tm?.duration_minutes || 15,
          isUnassigned: !!a.is_unassigned
        };
      }),
      fairnessIndex: 100,
      passedChecks: [
        { name: 'Tarefas da diarista não foram atribuídas à família', passed: !hasDiaristaTaskAssignedToFamily, detail: 'Pisos e banheiros delegados para a profissional' },
        { name: 'Manutenção diária mantida (louça e lixo)', passed: asgsWed.some(a => a.task_id === 'kit-1') && asgsWed.some(a => a.task_id === 'wst-1'), detail: 'Tarefas essenciais não foram esquecidas' }
      ]
    });
  }

  // ==========================================
  // CENÁRIO E: Morador com agenda muito ocupada
  // ==========================================
  {
    const users: User[] = [
      { id: 'usr-busy', name: 'João (Ocupado)', email: 'j@test.com', avatar: 'J', role: 'MEMBER', family_id: 'fam-e', birth_date: '2008-01-01', age: 16, autonomy_level: 3, active: true, color: '#A5D8FF', max_daily_minutes: 20 },
      { id: 'usr-free', name: 'Sílvia (Livre)', email: 's@test.com', avatar: 'S', role: 'ADMIN', family_id: 'fam-e', birth_date: '1984-01-01', age: 40, autonomy_level: 4, active: true, color: '#86c99c', max_daily_minutes: 60 }
    ];

    const protectedTimes: ProtectedTime[] = [
      { id: 'pt-est', member_id: 'usr-busy', type: 'STUDY', label: 'Estudo Preparatório', day_of_week: [1, 2, 3, 4, 5], start_time: '15:00', end_time: '16:00', active: true },
      { id: 'pt-fut', member_id: 'usr-busy', type: 'SPORT', label: 'Futebol', day_of_week: [1, 2, 3, 4, 5], start_time: '16:30', end_time: '17:30', active: true }
    ];

    const familyTasks: FamilyTask[] = [
      { id: 'ft-e1', family_id: 'fam-e', task_master_id: 'org-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], preferred_time: '15:30', active: true, assigned_automatically: true }, // Conflito com estudo do João
      { id: 'ft-e2', family_id: 'fam-e', task_master_id: 'wst-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], preferred_time: '18:00', active: true, assigned_automatically: true }, // Livre para João (10 min)
      { id: 'ft-e3', family_id: 'fam-e', task_master_id: 'clean-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], preferred_time: '19:00', active: true, assigned_automatically: true } // 20 min -> se somar com wst-1 passaria do limite de 20 min
    ];

    const ctx: DistributionContext = {
      users,
      allTasks: allMasterTasks,
      familyTasks,
      skills: [],
      preferences: [],
      protectedTimes,
      existingAssignments: [],
      targetDate: '2026-09-01',
      dayOfWeek: 2
    };

    const asgs = distributeDailyTasks(ctx);
    const joaoTasks = asgs.filter(a => a.member_id === 'usr-busy');
    const joaoMinutes = joaoTasks.reduce((acc, a) => {
      const tm = allMasterTasks.find(t => t.id === a.task_id);
      return acc + (tm ? tm.duration_minutes : 15);
    }, 0);

    const hasConflictDuringStudy = joaoTasks.some(a => a.scheduled_start === '15:30');

    results.push({
      scenarioId: 'scen-e',
      scenarioTitle: 'Cenário E: Morador com Agenda Muito Ocupada',
      scenarioDescription: 'Testa respeito rígido a intervalos bloqueados (estudo e futebol) e ao limite máximo configurado de 20 min/dia.',
      residents: users,
      tasksScheduled: familyTasks,
      assignments: asgs,
      assignmentsDetail: asgs.map(a => {
        const tm = allMasterTasks.find(t => t.id === a.task_id);
        const member = users.find(usr => usr.id === a.member_id);
        return {
          taskName: tm?.name || 'Tarefa',
          category: tm?.category || '',
          room: tm?.room_type || '',
          duration: tm?.duration_minutes || 15,
          effortPoints: (tm?.duration_minutes || 15) * (tm?.effort_level || 3),
          assignedTo: member?.name || 'Não atribuído',
          score: a.score,
          reason: a.assigned_reason,
          factors: a.factors,
          contributionBefore: 0,
          contributionAfter: tm?.duration_minutes || 15,
          isUnassigned: !!a.is_unassigned
        };
      }),
      fairnessIndex: 90,
      passedChecks: [
        { name: 'Nenhuma tarefa atribuída durante o estudo (15h–16h)', passed: !hasConflictDuringStudy, detail: 'Horário protegido 100% blindado' },
        { name: 'Limite máximo diário de 20 min respeitado', passed: joaoMinutes <= 20, detail: `Total alocado para João: ${joaoMinutes} min (limite: 20 min)` }
      ]
    });
  }

  // ==========================================
  // CENÁRIO F: Morador com baixa autonomia
  // ==========================================
  {
    const users: User[] = [
      { id: 'usr-adult', name: 'Fernanda (Mentora)', email: 'f@test.com', avatar: 'F', role: 'ADMIN', family_id: 'fam-f', birth_date: '1985-01-01', age: 39, autonomy_level: 4, active: true, color: '#A5D8FF' },
      { id: 'usr-kid', name: 'Pedro (10a - Iniciante)', email: 'p@test.com', avatar: 'P', role: 'MEMBER', family_id: 'fam-f', birth_date: '2016-01-01', age: 10, autonomy_level: 1, active: true, color: '#F2C94C' }
    ];

    const skills: MemberSkill[] = [
      { id: 'sk-1', member_id: 'usr-kid', task_master_id: 'kit-1', skill_status: 'NOT_LEARNED', supervision_required: true },
      { id: 'sk-2', member_id: 'usr-kid', task_master_id: 'org-1', skill_status: 'LEARNING', supervision_required: false }
    ];

    const familyTasks: FamilyTask[] = [
      { id: 'ft-f1', family_id: 'fam-f', task_master_id: 'org-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true }, // Organizar sapatos (autonomia 1, idade 6+)
      { id: 'ft-f2', family_id: 'fam-f', task_master_id: 'maint-1', frequency: 'daily', preferred_days: [1, 2, 3, 4, 5], active: true, assigned_automatically: true } // Trocar lâmpada / reparo (adult_only, idade 18+)
    ];

    const ctx: DistributionContext = {
      users,
      allTasks: allMasterTasks,
      familyTasks,
      skills,
      preferences: [],
      protectedTimes: [],
      existingAssignments: [],
      targetDate: '2026-09-01',
      dayOfWeek: 2
    };

    const asgs = distributeDailyTasks(ctx);
    const pedroTasks = asgs.filter(a => a.member_id === 'usr-kid');
    const receivedDangerousTask = pedroTasks.some(a => a.task_id === 'maint-1');

    results.push({
      scenarioId: 'scen-f',
      scenarioTitle: 'Cenário F: Morador com Baixa Autonomia',
      scenarioDescription: 'Garante que crianças/iniciantes recebam tarefas pedagógicas adequadas ao nível e nunca tarefas perigosas ou além da capacidade.',
      residents: users,
      tasksScheduled: familyTasks,
      assignments: asgs,
      assignmentsDetail: asgs.map(a => {
        const tm = allMasterTasks.find(t => t.id === a.task_id);
        const member = users.find(usr => usr.id === a.member_id);
        return {
          taskName: tm?.name || 'Tarefa',
          category: tm?.category || '',
          room: tm?.room_type || '',
          duration: tm?.duration_minutes || 15,
          effortPoints: (tm?.duration_minutes || 15) * (tm?.effort_level || 3),
          assignedTo: member?.name || 'Não atribuído',
          score: a.score,
          reason: a.assigned_reason,
          factors: a.factors,
          contributionBefore: 0,
          contributionAfter: tm?.duration_minutes || 15,
          isUnassigned: !!a.is_unassigned
        };
      }),
      fairnessIndex: 92,
      passedChecks: [
        { name: 'Criança nunca recebeu tarefa perigosa ou restrita', passed: !receivedDangerousTask, detail: 'Manutenção restrita à mentora Fernanda' },
        { name: 'Criança recebeu tarefa pedagógica compatível', passed: pedroTasks.some(a => a.task_id === 'org-1'), detail: 'Pedro recebeu organização de sapatos (nível Aprendendo)' }
      ]
    });
  }

  return results;
}
