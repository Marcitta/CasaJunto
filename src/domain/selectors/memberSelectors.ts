/**
 * CasaJunto — Seletor Canônico Centralizado de Moradores
 * STABILIZATION-1B: MEMBER DEACTIVATION CONSISTENCY
 * 
 * Regra Arquitetural:
 * Centraliza a resolução de membros ativos/inativos para garantir que
 * nenhuma tela operacional precise reinventar filtros ad-hoc como
 * `members.filter(m => m.active !== false)`.
 */

import { Member } from '../../types';

/**
 * Retorna se um membro é considerado operacionalmente ativo.
 * Campo canônico: `member.active` (boolean).
 * Convenção canônica do CasaJunto:
 * - `active === false`: Inativo / Desativado
 * - `active === true` ou `undefined`: Ativo por padrão
 * - `status === 'DEACTIVATED'` ou `'REMOVED'`: Inativo defensivo
 */
export function isMemberActive(member: Member | null | undefined): boolean {
  if (!member) return false;
  if (member.active === false) return false;
  const status = (member as any).status;
  if (status === 'DEACTIVATED' || status === 'REMOVED' || status === 'INACTIVE') {
    return false;
  }
  return true;
}

/**
 * Seletor canônico principal: Retorna apenas membros ativos da família.
 * Usado estritamente por:
 * - Barra de progresso / distribuição visual do lar
 * - Dropdowns e selects de atribuição
 * - Motor 2.0 (Rebalance e distribuição diária)
 * - Modo Blitz
 * - Métricas e contadores operacionais
 */
export function getActiveMembers(members: Member[] | null | undefined): Member[] {
  if (!Array.isArray(members)) return [];
  return members.filter(isMemberActive);
}

/**
 * Retorna apenas administradores ativos da família.
 * Usado para auditoria e governança do invariante de administradores (Mín 1, Máx 2).
 */
export function getActiveAdmins(members: Member[] | null | undefined): Member[] {
  return getActiveMembers(members).filter(m => m.role === 'ADMIN');
}

/**
 * Retorna apenas moradores comuns ativos da família.
 */
export function getActiveNonAdmins(members: Member[] | null | undefined): Member[] {
  return getActiveMembers(members).filter(m => m.role === 'MEMBER');
}

/**
 * Retorna os moradores desativados da família.
 * Usado para gerenciamento da família (aba "Desativados") e histórico.
 */
export function getDeactivatedMembers(members: Member[] | null | undefined): Member[] {
  if (!Array.isArray(members)) return [];
  return members.filter(m => m && !isMemberActive(m));
}
