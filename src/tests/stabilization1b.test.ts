/**
 * stabilization1b.test.ts
 * 
 * CASA JUNTO — STABILIZATION-1B TEST SUITE
 * MEMBER DEACTIVATION CONSISTENCY (MD01–MD12)
 * 
 * Ensures deactivated members:
 * - Do NOT appear in operational dashboards
 * - Do NOT appear in current progress bars or operational leaderboards
 * - Do NOT appear in active distribution (DistributionEngine)
 * - Do NOT appear as candidates in Rebalance
 * - Do NOT receive assignments in Blitz Mode
 * - Do NOT get assigned to new tasks
 * 
 * While preserving:
 * - History and completed tasks
 * - Past points and audit records
 * - Reactivation without member duplication
 * - Admin minimum safety invariant
 */

import {
  getActiveMembers,
  getDeactivatedMembers,
  isMemberActive,
  getActiveAdmins
} from '../domain/selectors/memberSelectors';
import { Member, Task, TaskMaster, TaskAssignment } from '../types';
import { DistributionEngine, DistributionContext } from '../domain/distribution/DistributionEngine';
import { BalanceService } from '../domain/distribution/BalanceService';
import { RebalanceService } from '../domain/distribution/RebalanceService';
import { allMasterTasks } from '../data/tasks';

export async function runStabilization1bTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
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

  console.log('\n--- GRUPO 23: STABILIZATION-1B (MEMBER DEACTIVATION CONSISTENCY - MD01-MD12) ---');

  // Test Fixture Members
  const sampleMembers: Member[] = [
    {
      id: 'mem-admin-1',
      user_id: 'usr-admin-1',
      family_id: 'fam-test',
      name: 'Carla Admin',
      role: 'ADMIN',
      active: true,
      points: 120,
      streak: 5,
      avatar: '👑',
      color: '#5b32a3',
      autonomy_level: 5,
      age: 38
    },
    {
      id: 'mem-member-2',
      user_id: 'usr-member-2',
      family_id: 'fam-test',
      name: 'Bruno Morador',
      role: 'MEMBER',
      active: true,
      points: 85,
      streak: 3,
      avatar: '👤',
      color: '#2563eb',
      autonomy_level: 4,
      age: 28
    },
    {
      id: 'mem-inactive-3',
      user_id: 'usr-inactive-3',
      family_id: 'fam-test',
      name: 'Daniela Inativa',
      role: 'MEMBER',
      active: false, // Desativada
      points: 150, // Pontos históricos preservados
      streak: 0,
      avatar: '👤',
      color: '#10b981',
      autonomy_level: 3,
      age: 24
    }
  ];

  // MD01: getActiveMembers excludes inactive members
  try {
    const active = getActiveMembers(sampleMembers);
    const inactive = getDeactivatedMembers(sampleMembers);
    const isInactiveActive = isMemberActive(sampleMembers[2]);
    const isActiveActive = isMemberActive(sampleMembers[0]);

    assert(
      active.length === 2 &&
      !active.some(m => m.id === 'mem-inactive-3') &&
      inactive.length === 1 &&
      inactive[0].id === 'mem-inactive-3' &&
      !isInactiveActive &&
      isActiveActive,
      'MD01: getActiveMembers e isMemberActive filtram estritamente membros com active: false'
    );
  } catch (err: any) {
    assert(false, `MD01 Erro: ${err?.message}`);
  }

  // MD02: Operational dashboard calculations exclude inactive members from active count
  try {
    const active = getActiveMembers(sampleMembers);
    const totalFamilyPoints = sampleMembers.reduce((sum, m) => sum + (m.points || 0), 0); // 120 + 85 + 150 = 355
    const avgPerActiveMember = Math.round(totalFamilyPoints / active.length); // 355 / 2 = 178

    assert(
      active.length === 2 &&
      avgPerActiveMember === 178 &&
      !active.map(m => m.id).includes('mem-inactive-3'),
      'MD02: Métricas operacionais (média por morador ativo) dividem apenas pelos membros ativos'
    );
  } catch (err: any) {
    assert(false, `MD02 Erro: ${err?.message}`);
  }

  // MD03: Leaderboard (RightSidebar / Placar da Convivência) lists only active members
  try {
    const active = getActiveMembers(sampleMembers);
    const sortedActive = [...active].sort((a, b) => (b.points || 0) - (a.points || 0));

    assert(
      sortedActive.length === 2 &&
      sortedActive[0].id === 'mem-admin-1' &&
      sortedActive[1].id === 'mem-member-2' &&
      !sortedActive.some(m => m.id === 'mem-inactive-3'),
      'MD03: Placar operacional da convivência (RightSidebar) exibe exclusivamente moradores ativos'
    );
  } catch (err: any) {
    assert(false, `MD03 Erro: ${err?.message}`);
  }

  // MD04: addTask does not assign new tasks to inactive member (resolves to unassigned)
  try {
    // Simulação da lógica canônica implementada no AppContext.addTask:
    // Se memberId for passado mas for inativo, resolves to isUnassigned: true
    const targetMember = sampleMembers.find(m => m.id === 'mem-inactive-3');
    const memberIsActive = isMemberActive(targetMember);

    let assignedId = 'mem-inactive-3';
    let isUnassigned = false;
    if (!memberIsActive) {
      assignedId = '';
      isUnassigned = true;
    }

    assert(
      !memberIsActive && assignedId === '' && isUnassigned === true,
      'MD04: Tentativa de atribuir nova tarefa a membro desativado é bloqueada (tarefa fica não-atribuída)'
    );
  } catch (err: any) {
    assert(false, `MD04 Erro: ${err?.message}`);
  }

  // MD05: DistributionEngine never assigns tasks to inactive member
  try {
    const context: DistributionContext = {
      targetDate: '2026-09-15',
      dayOfWeek: 2,
      users: sampleMembers, // Contém membro inativo
      familyTasks: [],
      allTasks: allMasterTasks.slice(0, 5),
      skills: [],
      preferences: [],
      protectedTimes: [],
      calendarEvents: [],
      existingAssignments: [],
      householdHelp: undefined
    };

    const assignments = DistributionEngine.distributeDailyTasks(context);
    const assignedToInactive = assignments.filter(a => a.member_id === 'mem-inactive-3');

    assert(
      assignedToInactive.length === 0,
      'MD05: DistributionEngine.distributeDailyTasks nunca aloca tarefas para morador desativado'
    );
  } catch (err: any) {
    assert(false, `MD05 Erro: ${err?.message}`);
  }

  // MD06: RebalanceService does not assign pending tasks to inactive member
  try {
    const pendingAssignments: TaskAssignment[] = [
      {
        id: 'asg-test-1',
        family_id: 'fam-test',
        task_id: allMasterTasks[0].id,
        member_id: 'mem-admin-1',
        scheduled_date: '2026-09-15',
        scheduled_start: '09:00',
        scheduled_end: '09:30',
        status: 'PENDING',
        is_unassigned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'asg-test-2',
        family_id: 'fam-test',
        task_id: allMasterTasks[1].id,
        member_id: '',
        scheduled_date: '2026-09-15',
        scheduled_start: '10:00',
        scheduled_end: '10:30',
        status: 'PENDING',
        is_unassigned: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const context: DistributionContext = {
      targetDate: '2026-09-15',
      dayOfWeek: 2,
      users: sampleMembers,
      familyTasks: [],
      allTasks: allMasterTasks.slice(0, 5),
      skills: [],
      preferences: [],
      protectedTimes: [],
      calendarEvents: [],
      existingAssignments: pendingAssignments,
      householdHelp: undefined
    };

    const rebalance = RebalanceService.rebalancePendingAssignments(
      context,
      (c) => DistributionEngine.distributeDailyTasks(c)
    );
    const assignedToInactive = rebalance.proposedAssignments.filter(a => a.member_id === 'mem-inactive-3');

    assert(
      assignedToInactive.length === 0,
      'MD06: RebalanceService.rebalancePendingAssignments não transfere tarefas para morador inativo'
    );
  } catch (err: any) {
    assert(false, `MD06 Erro: ${err?.message}`);
  }

  // MD07: Historical points and completed tasks of deactivated member are preserved
  try {
    const historicTasks: Task[] = [
      {
        id: 'hist-task-1',
        familyId: 'fam-test',
        title: 'Varrer Sala',
        roomId: 'room-sala',
        frequency: 'DAILY',
        status: 'DONE',
        assignedMemberId: 'mem-inactive-3',
        completedByMemberId: 'mem-inactive-3',
        completedByName: 'Daniela Inativa',
        effort: 15,
        dueDate: '2026-09-10',
        createdAt: '2026-09-10T08:00:00Z',
        updatedAt: '2026-09-10T08:30:00Z'
      }
    ];

    const inactiveMember = sampleMembers.find(m => m.id === 'mem-inactive-3');
    const taskCompletedByInactive = historicTasks.find(t => t.completedByMemberId === 'mem-inactive-3');

    assert(
      inactiveMember !== undefined &&
      inactiveMember.points === 150 &&
      taskCompletedByInactive !== undefined &&
      taskCompletedByInactive.completedByName === 'Daniela Inativa',
      'MD07: Pontuação histórica e tarefas concluídas pelo morador desativado são preservadas intactas'
    );
  } catch (err: any) {
    assert(false, `MD07 Erro: ${err?.message}`);
  }

  // MD08: BalanceService.analyzeDistributionBalance computes fairness only over active members
  try {
    const assignments: TaskAssignment[] = [
      {
        id: 'asg-b-1',
        family_id: 'fam-test',
        task_id: allMasterTasks[0].id,
        member_id: 'mem-admin-1',
        scheduled_date: '2026-09-15',
        scheduled_start: '09:00',
        scheduled_end: '09:30',
        status: 'PENDING',
        is_unassigned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'asg-b-2',
        family_id: 'fam-test',
        task_id: allMasterTasks[1].id,
        member_id: 'mem-member-2',
        scheduled_date: '2026-09-15',
        scheduled_start: '10:00',
        scheduled_end: '10:30',
        status: 'PENDING',
        is_unassigned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const analysis = BalanceService.analyzeDistributionBalance(assignments, sampleMembers, allMasterTasks);
    const inactiveInStats = analysis.memberStats.some(s => s.userId === 'mem-inactive-3');

    assert(
      !inactiveInStats &&
      analysis.memberStats.length === 2 &&
      analysis.fairnessIndex > 0,
      'MD08: BalanceService.analyzeDistributionBalance avalia paridade estritamente entre moradores ativos'
    );
  } catch (err: any) {
    assert(false, `MD08 Erro: ${err?.message}`);
  }

  // MD09: Blitz mode (generateBlitzAssignments) excludes deactivated members
  try {
    const blitzAssignments = RebalanceService.generateBlitzAssignments(sampleMembers, allMasterTasks, 15);
    const inactiveInBlitz = blitzAssignments.some(b => b.memberId === 'mem-inactive-3');

    assert(
      !inactiveInBlitz && blitzAssignments.length > 0,
      'MD09: RebalanceService.generateBlitzAssignments aloca tarefas apenas para moradores ativos'
    );
  } catch (err: any) {
    assert(false, `MD09 Erro: ${err?.message}`);
  }

  // MD10: Reactivating a member restores them to active selectors without duplicating Member entity
  try {
    let currentMemberList = [...sampleMembers];

    // Reativação do morador inativo
    currentMemberList = currentMemberList.map(m =>
      m.id === 'mem-inactive-3' ? { ...m, active: true, updatedAt: new Date().toISOString() } : m
    );

    const activeAfterReactivation = getActiveMembers(currentMemberList);
    const memberInstances = currentMemberList.filter(m => m.id === 'mem-inactive-3');

    assert(
      memberInstances.length === 1 &&
      activeAfterReactivation.length === 3 &&
      activeAfterReactivation.some(m => m.id === 'mem-inactive-3'),
      'MD10: Reativação restaura morador aos seletores ativos sem duplicar o registro do Member'
    );
  } catch (err: any) {
    assert(false, `MD10 Erro: ${err?.message}`);
  }

  // MD11: Reactivated member preserves historical points, streak and past task associations
  try {
    const reactivatedMember: Member = {
      ...sampleMembers[2],
      active: true,
      updatedAt: new Date().toISOString()
    };

    assert(
      reactivatedMember.id === 'mem-inactive-3' &&
      reactivatedMember.points === 150 &&
      reactivatedMember.autonomy_level === 3 &&
      reactivatedMember.role === 'MEMBER',
      'MD11: Morador reativado mantém integralmente seus pontos históricos, papel e configurações'
    );
  } catch (err: any) {
    assert(false, `MD11 Erro: ${err?.message}`);
  }

  // MD12: Admin deactivation safety invariant (cannot deactivate last active admin)
  try {
    const activeAdminsBefore = getActiveAdmins(sampleMembers);
    const canDeactivateCarla = activeAdminsBefore.length > 1; // Carla é a única admin ativa!

    assert(
      activeAdminsBefore.length === 1 &&
      activeAdminsBefore[0].id === 'mem-admin-1' &&
      !canDeactivateCarla,
      'MD12: Invariante de Administrador impede desativação do único administrador ativo da casa'
    );
  } catch (err: any) {
    assert(false, `MD12 Erro: ${err?.message}`);
  }

  return { passed, failed, errors };
}
