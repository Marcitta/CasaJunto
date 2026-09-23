/**
 * CasaJunto - InMemoryAuditLogRepository
 * Registro de auditoria estruturado para rastreamento de ações no sistema.
 */

import { AuditLog } from '../../domain/models';
import { IAuditLogRepository } from '../../domain/repositories/IPersistenceRepository';

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  private logs: AuditLog[] = [];

  public async logEvent(event: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    const entry: AuditLog = {
      ...event,
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    this.logs.unshift(entry);
    // Manter últimos 500 registros em memória
    if (this.logs.length > 500) {
      this.logs = this.logs.slice(0, 500);
    }
  }

  public async getLogsByFamily(familyId: string, limit: number = 50): Promise<AuditLog[]> {
    return this.logs.filter(l => l.family_id === familyId).slice(0, limit);
  }
}
