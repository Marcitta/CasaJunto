/**
 * CasaJunto - RebalanceFamilyUseCase
 * Caso de Uso: Reequilibra tarefas pendentes na rotina da família.
 */

import { TaskAssignment } from '../../domain/models';
import { DistributionEngine, DistributionContext } from '../../domain/distribution/DistributionEngine';
import { RebalanceResult } from '../../domain/distribution/RebalanceService';

export class RebalanceFamilyUseCase {
  public execute(ctx: DistributionContext): RebalanceResult {
    return DistributionEngine.rebalance(ctx);
  }
}
