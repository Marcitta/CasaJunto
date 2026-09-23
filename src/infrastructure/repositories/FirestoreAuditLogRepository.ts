/**
 * CasaJunto - FirestoreAuditLogRepository
 * Implementa IAuditLogRepository persistindo logs imutáveis na subcoleção families/{familyId}/auditLogs.
 */

import { collection, addDoc, query, orderBy, limit as firestoreLimit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { FirestoreMappers } from '../firebase/mappers';
import { AuditLog } from '../../domain/models';
import { IAuditLogRepository } from '../../domain/repositories/IPersistenceRepository';

export class FirestoreAuditLogRepository implements IAuditLogRepository {
  public async logEvent(event: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
    try {
      const logsRef = collection(db, 'families', event.family_id, 'auditLogs');
      const now = new Date().toISOString();
      await addDoc(logsRef, {
        ...FirestoreMappers.fromAuditLog({
          ...event,
          timestamp: now
        })
      });
    } catch (err) {
      console.warn('[FirestoreAuditLogRepository] Não foi possível gravar log de auditoria no Firestore:', err);
    }
  }

  public async getLogsByFamily(familyId: string, maxLimit = 50): Promise<AuditLog[]> {
    try {
      const logsRef = collection(db, 'families', familyId, 'auditLogs');
      const q = query(logsRef, orderBy('timestamp', 'desc'), firestoreLimit(maxLimit));
      const snap = await getDocs(q);
      return snap.docs.map(d => FirestoreMappers.toAuditLog(d.id, d.data()));
    } catch (err) {
      console.error('[FirestoreAuditLogRepository] Erro ao recuperar logs de auditoria:', err);
      return [];
    }
  }
}
