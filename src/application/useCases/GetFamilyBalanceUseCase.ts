/**
 * CasaJunto - GetFamilyBalanceUseCase
 * Caso de Uso: Calcula o índice de justiça (Fairness Index), estatísticas e conselhos inteligentes.
 */

import { Member, TaskAssignment, TaskMaster } from '../../domain/models';
import { DistributionEngine } from '../../domain/distribution/DistributionEngine';
import { BalanceAnalysis } from '../../domain/distribution/BalanceService';

export interface GetFamilyBalanceInput {
  familyId: string;
  members: Member[];
  assignments: TaskAssignment[];
  allTasks: TaskMaster[];
}

export class GetFamilyBalanceUseCase {
  public execute(input: GetFamilyBalanceInput): {
    balanceAnalysis: BalanceAnalysis;
    smartAdvice: string;
  } {
    const familyMembers = input.members.filter(m => m.family_id === input.familyId);
    const familyAssignments = input.assignments.filter(a => a.family_id === input.familyId);

    const balanceAnalysis = DistributionEngine.analyzeBalance(
      familyAssignments,
      familyMembers,
      input.allTasks
    );

    const smartAdvice = DistributionEngine.getSmartAdvice(
      familyAssignments,
      familyMembers,
      input.allTasks
    );

    return {
      balanceAnalysis,
      smartAdvice
    };
  }
}
