/**
 * CasaJunto - RebalanceFamilyUseCase
 * Caso de Uso: Reequilibra tarefas pendentes na rotina da família.
 */

import { TaskAssignment } from '../../domain/models';
import { DistributionEngine, DistributionContext } from '../../domain/distribution/DistributionEngine';
import { RebalanceResult } from '../../domain/distribution/RebalanceService';

export class RebalanceFamilyUseCase {
  public execute(ctx: DistributionContext): RebalanceResult {
    // Camada de Aplicação / Orquestração:
    // Separa externalAssignments intactas, envia apenas tarefas da casa ao Motor 2.0 e recompõe
    const externalAssignments = ctx.existingAssignments.filter(a => {
      const ft = ctx.familyTasks.find(f => f.id === a.family_task_id);
      return (ft?.executionTarget || (a as any).executionTarget) === 'EXTERNAL_SUPPORT';
    });

    const motorAssignments = ctx.existingAssignments.filter(a => {
      const ft = ctx.familyTasks.find(f => f.id === a.family_task_id);
      return (ft?.executionTarget || (a as any).executionTarget) !== 'EXTERNAL_SUPPORT';
    });

    const motorFamilyTasks = ctx.familyTasks.filter(
      ft => (ft.executionTarget || 'HOUSEHOLD') !== 'EXTERNAL_SUPPORT'
    );

    const motorResult = DistributionEngine.rebalance({
      ...ctx,
      familyTasks: motorFamilyTasks,
      existingAssignments: motorAssignments
    });

    return {
      ...motorResult,
      proposedAssignments: [...motorResult.proposedAssignments, ...externalAssignments]
    };
  }
}
