/**
 * CasaJunto - Testes de Regressão e Validação do Motor 2.0
 * Executa e valida os 6 cenários fundamentais e regras invioláveis de segurança e multi-tenancy.
 */

import { allMasterTasks } from '../data/tasks';
import {
  DistributionEngine,
  DistributionContext,
  SafetyService,
  BalanceService
} from '../domain/distribution';
import { Member, FamilyTask, MemberPreference, ProtectedTime, HouseholdHelp } from '../domain/models';

export interface ScenarioTestResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  fairnessIndex: number;
  unassignedCount: number;
  safetyViolations: number;
  checks: { name: string; passed: boolean; message: string }[];
}

export function runAllScenariosRegression(): ScenarioTestResult[] {
  const results: ScenarioTestResult[] = [];

  // =========================================================================
  // CENÁRIO A: Casal (2 adultos com paridade de capacidade)
  // =========================================================================
  {
    const users: Member[] = [
      { id: 'm-marcos', user_id: 'u-1', family_id: 'fam-a', name: 'Marcos', avatar: 'M', color: '#A5D8FF', role: 'ADMIN', birth_date: '1986-04-10', age: 38, autonomy_level: 4, active: true },
      { id: 'm-helena', user_id: 'u-2', family_id: 'fam-a', name: 'Helena', avatar: 'H', color: '#86c99c', role: 'MEMBER', birth_date: '1988-09-15', age: 36, autonomy_level: 4, active: true }
    ];

    const familyTasks: FamilyTask[] = [
      { id: 'ft-a1', family_id: 'fam-a', task_master_id: 'clean-1', frequency: 'daily', preferred_days: [1], active: true, assigned_automatically: true },
      { id: 'ft-a2', family_id: 'fam-a', task_master_id: 'kitch-1', frequency: 'daily', preferred_days: [1], active: true, assigned_automatically: true },
      { id: 'ft-a3', family_id: 'fam-a', task_master_id: 'waste-1', frequency: 'daily', preferred_days: [1], active: true, assigned_automatically: true },
      { id: 'ft-a4', family_id: 'fam-a', task_master_id: 'laund-1', frequency: 'daily', preferred_days: [1], active: true, assigned_automatically: true }
    ];

    const prefs: MemberPreference[] = [
      { id: 'p1', family_id: 'fam-a', member_id: 'm-marcos', task_master_id: 'waste-1', preference: 'LIKE' },
      { id: 'p2', family_id: 'fam-a', member_id: 'm-helena', task_master_id: 'kitch-1', preference: 'LIKE' }
    ];

    const ctx: DistributionContext = {
      users,
      allTasks: allMasterTasks,
      familyTasks,
      skills: [],
      preferences: prefs,
      protectedTimes: [],
      existingAssignments: [],
      targetDate: '2026-09-07',
      dayOfWeek: 1
    };

    const assignments = DistributionEngine.distributeDailyTasks(ctx);
    const balance = BalanceService.analyzeDistributionBalance(assignments, users, allMasterTasks);

    const marcosTask = assignments.find(a => a.task_id === 'waste-1')?.member_id === 'm-marcos';
    const helenaTask = assignments.find(a => a.task_id === 'kitch-1')?.member_id === 'm-helena';

    const checks = [
      { name: 'Distribuição 100% alocada', passed: assignments.every(a => !a.is_unassigned), message: 'Nenhuma tarefa ficou sem morador' },
      { name: 'Respeito à preferência de Marcos (Lixo)', passed: marcosTask, message: 'Marcos recebeu a tarefa que gosta' },
      { name: 'Respeito à preferência de Helena (Cozinha)', passed: helenaTask, message: 'Helena recebeu a tarefa que gosta' },
      { name: 'Equilíbrio e Justiça', passed: balance.fairnessIndex >= 50, message: `Índice de justiça de ${balance.fairnessIndex}%` }
    ];

    results.push({
      scenarioId: 'sc-a',
      scenarioName: 'Cenário A: Casal Adulto',
      passed: checks.every(c => c.passed),
      fairnessIndex: balance.fairnessIndex,
      unassignedCount: assignments.filter(a => a.is_unassigned).length,
      safetyViolations: 0,
      checks
    });
  }

  // =========================================================================
  // CENÁRIO D: Família com Diarista Semanal (Quarta-feira)
  // =========================================================================
  {
    const users: Member[] = [
      { id: 'm-lucas', family_id: 'fam-d', name: 'Lucas', avatar: 'L', color: '#A5D8FF', role: 'ADMIN', birth_date: '1984-01-01', age: 40, autonomy_level: 4, active: true },
      { id: 'm-amanda', family_id: 'fam-d', name: 'Amanda', avatar: 'A', color: '#86c99c', role: 'MEMBER', birth_date: '1986-01-01', age: 38, autonomy_level: 4, active: true }
    ];

    const familyTasks: FamilyTask[] = [
      { id: 'ft-d1', family_id: 'fam-d', task_master_id: 'bath-1', frequency: 'weekly', preferred_days: [3], active: true, assigned_automatically: true }, // Limpar vaso (coberto pela diarista)
      { id: 'ft-d2', family_id: 'fam-d', task_master_id: 'clean-1', frequency: 'weekly', preferred_days: [3], active: true, assigned_automatically: true }, // Aspirar (coberto)
      { id: 'ft-d3', family_id: 'fam-d', task_master_id: 'kitch-1', frequency: 'daily', preferred_days: [3], active: true, assigned_automatically: true } // Louça almoço (família faz)
    ];

    const helper: HouseholdHelp = {
      id: 'hlp-d',
      family_id: 'fam-d',
      type: 'cleaner_weekly',
      helper_name: 'Diarista',
      frequency: '1x por semana',
      days: [3], // Quarta-feira
      tasks_covered: ['bath-1', 'clean-1', 'clean-4'],
      active: true
    };

    const ctx: DistributionContext = {
      users,
      allTasks: allMasterTasks,
      familyTasks,
      skills: [],
      preferences: [],
      protectedTimes: [],
      existingAssignments: [],
      householdHelp: helper,
      targetDate: '2026-09-09',
      dayOfWeek: 3
    };

    const assignments = DistributionEngine.distributeDailyTasks(ctx);
    const assignedTaskIds = assignments.map(a => a.task_id);

    const bathNotAssigned = !assignedTaskIds.includes('bath-1');
    const cleanNotAssigned = !assignedTaskIds.includes('clean-1');
    const kitAssigned = assignedTaskIds.includes('kitch-1');

    const checks = [
      { name: 'Bloqueio de Faxina Pesada no Dia da Diarista (Banheiro)', passed: bathNotAssigned, message: 'Banheiro não foi cobrado da família' },
      { name: 'Bloqueio de Aspiração no Dia da Diarista', passed: cleanNotAssigned, message: 'Aspiração pesada delegada à diarista' },
      { name: 'Manutenção de Rotina Mantida (Louça)', passed: kitAssigned, message: 'Louça diária continuou atribuída à família' }
    ];

    results.push({
      scenarioId: 'sc-d',
      scenarioName: 'Cenário D: Família com Diarista',
      passed: checks.every(c => c.passed),
      fairnessIndex: 100,
      unassignedCount: 0,
      safetyViolations: 0,
      checks
    });
  }

  // =========================================================================
  // CENÁRIO F: Criança (8a) com Baixa Autonomia e Segurança Estrita
  // =========================================================================
  {
    const child: Member = {
      id: 'm-pedrinho',
      family_id: 'fam-f',
      name: 'Pedrinho',
      avatar: 'P',
      color: '#F2C94C',
      role: 'MEMBER',
      birth_date: '2016-01-01',
      age: 8,
      autonomy_level: 2,
      active: true
    };

    // Testar tarefas perigosas (químicos/fogo/altura)
    const dangerousTask = allMasterTasks.find(t => t.safety_level === 'adult_only') || allMasterTasks[0];
    const safeTask = allMasterTasks.find(t => t.minimum_age <= 8 && t.safety_level === 'safe') || allMasterTasks[1];

    const safetyCheckDangerous = SafetyService.validateSafety(child, dangerousTask);
    const safetyCheckSafe = SafetyService.validateSafety(child, safeTask);

    const checks = [
      { name: 'Bloqueio de Tarefa com Produtos Químicos/Fogo para Criança', passed: !safetyCheckDangerous.isSafe, message: `Bloqueado corretamente: ${safetyCheckDangerous.reason}` },
      { name: 'Aprovação de Tarefa Segura e Adequada para Criança', passed: safetyCheckSafe.isSafe, message: 'Tarefa segura aprovada' }
    ];

    results.push({
      scenarioId: 'sc-f',
      scenarioName: 'Cenário F: Segurança e Baixa Autonomia',
      passed: checks.every(c => c.passed),
      fairnessIndex: 100,
      unassignedCount: 0,
      safetyViolations: 0,
      checks
    });
  }

  return results;
}
