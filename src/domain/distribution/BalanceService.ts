/**
 * CasaJunto - BalanceService
 * Camada 4 do Pipeline de Distribuição:
 * Cálculo de esforço ponderado (minutos × peso), análise de equilíbrio familiar e métricas.
 */

import {
  Member,
  TaskAssignment,
  TaskMaster,
  MemberStats
} from '../models';
import { SCORING_CONFIG } from './config/scoringConfig';
import { getActiveMembers } from '../selectors';

export interface BalanceAnalysis {
  isBalanced: boolean;
  status: 'balanced' | 'needs_adjustment';
  fairnessIndex: number; // 0..100%
  message: string;
  imbalanceDetails: string[];
  memberStats: {
    userId: string;
    userName: string;
    minutes: number;
    effortPoints: number;
    tasksCount: number;
  }[];
}

export class BalanceService {
  /**
   * 5. ESFORÇO: Multiplica duração em minutos pelo peso de esforço (1 a 5).
   */
  public static calculateEffortPoints(durationMinutes: number, effortLevel: number): number {
    const weight = Math.max(1, Math.min(5, effortLevel || 3));
    return durationMinutes * weight;
  }

  /**
   * Retorna o rótulo textual legível do esforço.
   */
  public static getEffortLabel(effortLevel: number): string {
    switch (effortLevel) {
      case 1:
        return 'Muito baixo';
      case 2:
        return 'Baixo';
      case 3:
        return 'Médio';
      case 4:
        return 'Alto';
      case 5:
        return 'Muito alto';
      default:
        return 'Médio';
    }
  }

  /**
   * Avalia a paridade de esforço entre todos os moradores ativos da família.
   */
  public static analyzeDistributionBalance(
    assignments: TaskAssignment[],
    members: Member[],
    tasks: TaskMaster[]
  ): BalanceAnalysis {
    const activeMembers = getActiveMembers(members);
    if (activeMembers.length <= 1) {
      return {
        isBalanced: true,
        status: 'balanced',
        fairnessIndex: 100,
        message: 'Distribuição individual ativa.',
        imbalanceDetails: [],
        memberStats: []
      };
    }

    const memberStats = activeMembers.map(m => {
      const userAssignments = assignments.filter(a => a.member_id === m.id && !a.is_unassigned);
      let minutes = 0;
      let effortPoints = 0;

      for (const asg of userAssignments) {
        const t = tasks.find(item => item.id === asg.task_id);
        if (t) {
          minutes += t.duration_minutes;
          effortPoints += this.calculateEffortPoints(t.duration_minutes, t.effort_level);
        }
      }

      return {
        userId: m.id,
        userName: m.name,
        minutes,
        effortPoints,
        tasksCount: userAssignments.length
      };
    });

    const efforts = memberStats.map(s => s.effortPoints);
    const maxEffort = Math.max(...efforts, 0);
    const minEffort = Math.min(...efforts, 0);
    const avgEffort = efforts.reduce((a, b) => a + b, 0) / (activeMembers.length || 1);

    // Variação de esforço relativa à média
    const variance = avgEffort > 0 ? (maxEffort - minEffort) / avgEffort : 0;
    const fairnessIndex = Math.max(40, Math.min(100, Math.round(100 - variance * 40)));

    const imbalanceDetails: string[] = [];
    let isBalanced = true;

    if (variance > 0.6 && avgEffort >= SCORING_CONFIG.BALANCE.MINIMUM_SIGNIFICANT_AVG_EFFORT) {
      isBalanced = false;
      const highest = memberStats.find(s => s.effortPoints === maxEffort);
      const lowest = memberStats.find(s => s.effortPoints === minEffort);
      if (highest && lowest) {
        imbalanceDetails.push(
          `${highest.userName} está com ${highest.effortPoints} pts de esforço, enquanto ${lowest.userName} está com ${lowest.effortPoints} pts.`
        );
      }
    }

    return {
      isBalanced,
      status: isBalanced ? 'balanced' : 'needs_adjustment',
      fairnessIndex,
      message: isBalanced
        ? 'A distribuição da casa está equilibrada e justa para todos os moradores.'
        : 'Há uma disparidade de esforço que pode ser corrigida com um clique.',
      imbalanceDetails,
      memberStats
    };
  }

  /**
   * Calcula as métricas e pontuações consolidadas do morador.
   */
  public static calculateMemberStats(
    memberId: string,
    assignments: TaskAssignment[],
    allTasks: TaskMaster[]
  ): MemberStats {
    const userAssignments = assignments.filter(a => a.member_id === memberId && !a.is_unassigned);
    const completed = userAssignments.filter(a => a.status === 'COMPLETED');
    const missed = userAssignments.filter(a => a.status === 'MISSED');
    const rescheduled = userAssignments.reduce((acc, a) => acc + (a.rescheduled_count || 0), 0);

    let totalMinutes = 0;
    let totalEffort = 0;

    for (const asg of userAssignments) {
      const t = allTasks.find(item => item.id === asg.task_id);
      if (t) {
        totalMinutes += t.duration_minutes;
        totalEffort += this.calculateEffortPoints(t.duration_minutes, t.effort_level);
      }
    }

    const completedMinutes = completed.reduce((acc, a) => {
      const t = allTasks.find(item => item.id === a.task_id);
      return acc + (t ? t.duration_minutes : 15);
    }, 0);

    const contributionScore = Math.min(100, Math.round((completed.length / (userAssignments.length || 1)) * 100));
    const weeklyEffortScore = totalEffort;
    const balanceScore = Math.min(100, Math.max(20, Math.round((completedMinutes / 180) * 100)));

    return {
      member_id: memberId,
      points: completed.length * 15 + totalEffort,
      completed_tasks_count: completed.length,
      minutes_contributed: completedMinutes,
      streak_days: completed.length > 0 ? 3 : 0,
      skills_learned_count: 5,
      fair_ratio: balanceScore,
      total_minutes: totalMinutes,
      total_effort: totalEffort,
      completed_tasks: completed.length,
      missed_tasks: missed.length,
      rescheduled_tasks: rescheduled,
      contribution_score: contributionScore,
      weekly_contribution_score: completedMinutes,
      weekly_effort_score: weeklyEffortScore,
      balance_score: balanceScore
    };
  }
}
