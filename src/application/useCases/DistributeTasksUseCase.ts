/**
 * CasaJunto - DistributeTasksUseCase
 * Caso de Uso: Executa a distribuição diária de tarefas para a família.
 */

import { TaskAssignment } from '../../domain/models';
import { DistributionEngine, DistributionContext } from '../../domain/distribution/DistributionEngine';

export class DistributeTasksUseCase {
  public execute(ctx: DistributionContext): TaskAssignment[] {
    // Camada de Aplicação / Orquestração:
    // Filtra EXTERNAL_SUPPORT antes de invocar o Motor 2.0
    const filteredFamilyTasks = ctx.familyTasks.filter(
      ft => (ft.executionTarget || 'HOUSEHOLD') !== 'EXTERNAL_SUPPORT'
    );
    return DistributionEngine.distributeDailyTasks({
      ...ctx,
      familyTasks: filteredFamilyTasks
    });
  }
}
