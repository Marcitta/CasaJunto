/**
 * CasaJunto — B.5.5-HF1-D-B2B: Feature Flags para Infraestrutura Transacional Multiambiente
 * 
 * DIRETRIZES DE SEGURANÇA E ISOLAMENTO:
 * 1. Desativada por padrão em todos os ambientes (default: false).
 * 2. Bloqueio absoluto para a família de produção Rua Juriti ('fam-mtm1580s' / 'fam-juriti-prod').
 * 3. Permite ativação seletiva controlada via override em memória para testes e homologação isolada.
 * 4. Não permite mistura de escritores legados e transacionais na mesma combinação.
 */

export const PROTECTED_PRODUCTION_FAMILY_IDS = ['fam-mtm1580s', 'fam-juriti-prod'];

export interface RoutineFeatureFlagsConfig {
  transactionalMultiRoomEnabled?: boolean;
}

let inMemoryFlagOverride: boolean | null = null;
const familySpecificOverrides = new Map<string, boolean>();
const suspendedFamilies = new Set<string>();

export const RoutineFeatureFlags = {
  /**
   * Verifica se a infraestrutura transacional multiambiente está ativa para a família informada.
   * Por padrão é FALSE.
   * Se for a família Rua Juriti ('fam-mtm1580s'), retorna SEMPRE FALSE (proteção estrita de produção).
   */
  isTransactionalMultiRoomEnabled(familyId?: string): boolean {
    if (!familyId) return false;

    // Proteção absoluta contra ativação na família Rua Juriti
    const cleanFam = familyId.trim().toLowerCase();
    if (PROTECTED_PRODUCTION_FAMILY_IDS.some(id => cleanFam === id.toLowerCase() || cleanFam.includes('fam-mtm1580s'))) {
      return false;
    }

    // Override específico por tenant
    if (familySpecificOverrides.has(familyId)) {
      return familySpecificOverrides.get(familyId)!;
    }

    // Override global em memória (para testes unitários controlados)
    if (inMemoryFlagOverride !== null) {
      return inMemoryFlagOverride;
    }

    // Default estrito: FALSE em produção e runtime normal
    return false;
  },

  /**
   * Ativa ou desativa a feature flag globalmente em memória (exclusivo para testes).
   */
  setTransactionalMultiRoomOverride(enabled: boolean | null): void {
    inMemoryFlagOverride = enabled;
  },

  /**
   * Ativa ou desativa a feature flag para uma família específica (exclusivo para testes).
   * Se for a família Rua Juriti, o override é rejeitado.
   */
  setFamilyTransactionalOverride(familyId: string, enabled: boolean): void {
    const cleanFam = familyId.trim().toLowerCase();
    if (PROTECTED_PRODUCTION_FAMILY_IDS.some(id => cleanFam === id.toLowerCase() || cleanFam.includes('fam-mtm1580s'))) {
      throw new Error(`[RoutineFeatureFlags] Bloqueio de segurança violado: proibido ativar a flag transacional para a família real ${familyId}.`);
    }
    familySpecificOverrides.set(familyId, enabled);
  },

  /**
   * Verifica se novas escritas de rotinas estão suspensas para a família (Safe Suspension Strategy - AUD-B2C-03).
   */
  isNewWritesSuspended(familyId?: string): boolean {
    if (!familyId) return false;
    return suspendedFamilies.has(familyId);
  },

  /**
   * Suspende ou reativa novas escritas para uma família durante procedimento de rollback ou manutenção segura.
   */
  suspendNewWrites(familyId: string, suspended: boolean): void {
    if (suspended) {
      suspendedFamilies.add(familyId);
    } else {
      suspendedFamilies.delete(familyId);
    }
  },

  /**
   * Reseta todas as configurações e overrides de feature flag para o padrão seguro.
   */
  reset(): void {
    inMemoryFlagOverride = null;
    familySpecificOverrides.clear();
    suspendedFamilies.clear();
  }
};
