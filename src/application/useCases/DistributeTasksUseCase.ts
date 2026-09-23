/**
 * CasaJunto - DistributeTasksUseCase
 * Caso de Uso: Executa a distribuição diária de tarefas para a família.
 */

import { TaskAssignment } from '../../domain/models';
import { DistributionEngine, DistributionContext } from '../../domain/distribution/DistributionEngine';

export class DistributeTasksUseCase {
  public execute(ctx: DistributionContext): TaskAssignment[] {
    return DistributionEngine.distributeDailyTasks(ctx);
  }
}
