/**
 * CASA JUNTO — DOMESTIC-SUPPORT-1A
 * Domain + Persistence Foundation for Ajuda Externa / Diarista
 *
 * Responsável por:
 * 1. Entidade canônica DomesticSupport (tipo CLEANER).
 * 2. Validação estrita de horários (schedule, múltiplos dias, sem sobreposição, startTime < endTime).
 * 3. Invariantes de desativação (soft delete via active=false) e reativação preservando ID e histórico.
 * 4. Invariantes da FamilyTask (HOUSEHOLD, EXTERNAL_SUPPORT, FLEXIBLE) e compatibilidade legacy.
 * 5. Persistência canônica isolada em /families/{familyId}/domesticSupports/{id} com RBAC (ADMIN write, MEMBER read-only).
 * 6. Proteção estrita: DomesticSupport NÃO é Member, não possui login, userId, gamificação ou contagem de admin.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../infrastructure/firebase/firebase';
import {
  DomesticSupport,
  DomesticSupportSchedule,
  DomesticSupportType,
  ExecutionTarget,
  FamilyTask,
  Task
} from '../types';

export const DOMESTIC_SUPPORT_WEEKDAYS = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terça-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sábado', short: 'Sáb' }
] as const;

/**
 * Formata os horários do DomesticSupport para exibição limpa e compacta na UI.
 * Exemplo com mesmo horário: "Segunda, Quarta e Sexta · 08:00–12:00"
 * Exemplo com horários distintos: ["Segunda-feira · 08:00–12:00", "Quarta-feira · 14:00–18:00"]
 */
export function formatScheduleCompact(schedule: DomesticSupportSchedule[]): string[] {
  if (!schedule || schedule.length === 0) return ['Sem horários definidos'];

  const weekdayMap: Record<number, string> = {
    0: 'Domingo',
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
    6: 'Sábado'
  };

  const shortWeekdayMap: Record<number, string> = {
    0: 'Domingo',
    1: 'Segunda',
    2: 'Terça',
    3: 'Quarta',
    4: 'Quinta',
    5: 'Sexta',
    6: 'Sábado'
  };

  const sorted = [...schedule].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  const first = sorted[0];
  const allSameHours = sorted.every(s => s.startTime === first.startTime && s.endTime === first.endTime);

  if (allSameHours && sorted.length > 1) {
    const dayNames = sorted.map(s => shortWeekdayMap[s.weekday]);
    let joinedDays = '';
    if (dayNames.length === 2) {
      joinedDays = `${dayNames[0]} e ${dayNames[1]}`;
    } else {
      joinedDays = `${dayNames.slice(0, -1).join(', ')} e ${dayNames[dayNames.length - 1]}`;
    }
    return [`${joinedDays} · ${first.startTime}–${first.endTime}`];
  }

  return sorted.map(s => `${weekdayMap[s.weekday]} · ${s.startTime}–${s.endTime}`);
}

/**
 * Validação de horários do DomesticSupport.
 * - weekday: 0-6 (0 = Domingo, 6 = Sábado)
 * - startTime < endTime (formato HH:mm)
 * - Múltiplos dias permitidos
 * - Não permitir horários duplicados ou sobrepostos no mesmo weekday
 */
export function validateDomesticSupportSchedule(
  schedule: DomesticSupportSchedule[]
): { valid: boolean; error?: string } {
  if (!Array.isArray(schedule)) {
    return { valid: false, error: 'Schedule must be an array of schedule slots' };
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  for (let i = 0; i < schedule.length; i++) {
    const slot = schedule[i];

    if (
      typeof slot.weekday !== 'number' ||
      !Number.isInteger(slot.weekday) ||
      slot.weekday < 0 ||
      slot.weekday > 6
    ) {
      return {
        valid: false,
        error: `Invalid weekday at index ${i}: must be an integer between 0 (Sunday) and 6 (Saturday)`
      };
    }

    if (!slot.startTime || !timeRegex.test(slot.startTime)) {
      return {
        valid: false,
        error: `Invalid startTime at index ${i}: must match HH:mm format (00:00 to 23:59)`
      };
    }

    if (!slot.endTime || !timeRegex.test(slot.endTime)) {
      return {
        valid: false,
        error: `Invalid endTime at index ${i}: must match HH:mm format (00:00 to 23:59)`
      };
    }

    if (slot.startTime >= slot.endTime) {
      return {
        valid: false,
        error: `Invalid time range on weekday ${slot.weekday}: startTime (${slot.startTime}) must be earlier than endTime (${slot.endTime})`
      };
    }
  }

  // Verificar sobreposições ou horários duplicados no mesmo weekday
  for (let i = 0; i < schedule.length; i++) {
    for (let j = i + 1; j < schedule.length; j++) {
      const a = schedule[i];
      const b = schedule[j];

      if (a.weekday === b.weekday) {
        // Horários idênticos
        if (a.startTime === b.startTime && a.endTime === b.endTime) {
          return {
            valid: false,
            error: `Duplicate schedule detected on weekday ${a.weekday} (${a.startTime} - ${a.endTime})`
          };
        }
        // Sobreposição de horários: a.start < b.end && a.end > b.start
        if (a.startTime < b.endTime && a.endTime > b.startTime) {
          return {
            valid: false,
            error: `Overlapping schedule detected on weekday ${a.weekday} between [${a.startTime}-${a.endTime}] and [${b.startTime}-${b.endTime}]`
          };
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Criação da entidade canônica DomesticSupport.
 * Invariantes garantidas:
 * - Não é Member (sem userId, sem login, sem role de membro)
 * - Não possui gamificação (sem points, streak, tasksCompleted)
 * - Não participa do limite de ADMINs
 */
export function createDomesticSupportEntity(input: {
  id?: string;
  familyId: string;
  name: string;
  type?: DomesticSupportType;
  schedule?: DomesticSupportSchedule[];
}): DomesticSupport {
  if (!input.familyId || typeof input.familyId !== 'string' || !input.familyId.trim()) {
    throw new Error('familyId is required to create DomesticSupport');
  }

  const trimmedName = input.name ? input.name.trim() : '';
  if (!trimmedName || trimmedName.length < 2) {
    throw new Error('name must have at least 2 characters');
  }

  const scheduleValidation = validateDomesticSupportSchedule(input.schedule || []);
  if (!scheduleValidation.valid) {
    throw new Error(scheduleValidation.error || 'Invalid schedule configuration');
  }

  const now = new Date().toISOString();
  const id = input.id && input.id.trim()
    ? input.id.trim()
    : `ds_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  return {
    id,
    familyId: input.familyId,
    name: trimmedName,
    type: input.type || 'CLEANER',
    active: true,
    schedule: input.schedule || [],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Desativação da entidade (soft delete, preservando histórico e dados).
 */
export function deactivateDomesticSupportEntity(
  support: DomesticSupport
): DomesticSupport {
  return {
    ...support,
    active: false,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Reativação da entidade preservando o mesmo ID e todo o histórico.
 */
export function reactivateDomesticSupportEntity(
  support: DomesticSupport
): DomesticSupport {
  return {
    ...support,
    active: true,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Resolução do executionTarget para FamilyTask / Task.
 * Compatibilidade Legacy:
 * Tarefas legadas sem executionTarget resolvem transparentemente como 'HOUSEHOLD'.
 * Não requer migração destrutiva ou mass update no Firestore.
 */
export function resolveExecutionTarget(
  task: Partial<FamilyTask> | Partial<Task> | null | undefined
): ExecutionTarget {
  if (!task || !task.executionTarget) {
    return 'HOUSEHOLD';
  }

  if (
    task.executionTarget === 'HOUSEHOLD' ||
    task.executionTarget === 'EXTERNAL_SUPPORT' ||
    task.executionTarget === 'FLEXIBLE'
  ) {
    return task.executionTarget;
  }

  return 'HOUSEHOLD';
}

/**
 * Validação de invariantes entre FamilyTask e DomesticSupport:
 * 1. HOUSEHOLD: domesticSupportId deve ser null ou ausente.
 * 2. EXTERNAL_SUPPORT: deve referenciar um DomesticSupport existente, ativo e da mesma família.
 * 3. FLEXIBLE: domesticSupportId pode ser null ou apontar para DomesticSupport existente, ativo e da mesma família.
 * 4. Isolamento multi-tenant estrito: nunca aceitar referência cross-tenant.
 */
export function validateFamilyTaskExecutionTarget(
  task: Partial<FamilyTask>,
  supports: DomesticSupport[]
): { valid: boolean; error?: string } {
  const target = resolveExecutionTarget(task);
  const taskFamilyId = task.familyId || task.family_id;

  if (target === 'HOUSEHOLD') {
    if (task.domesticSupportId !== null && task.domesticSupportId !== undefined && task.domesticSupportId !== '') {
      return {
        valid: false,
        error: 'HOUSEHOLD task must not reference a domesticSupportId'
      };
    }
    return { valid: true };
  }

  if (target === 'EXTERNAL_SUPPORT') {
    if (!task.domesticSupportId || typeof task.domesticSupportId !== 'string') {
      return {
        valid: false,
        error: 'EXTERNAL_SUPPORT task requires a valid domesticSupportId'
      };
    }

    const referencedSupport = supports.find((s) => s.id === task.domesticSupportId);
    if (!referencedSupport) {
      return {
        valid: false,
        error: `Referenced DomesticSupport '${task.domesticSupportId}' not found`
      };
    }

    // Invariante de tenant:
    if (taskFamilyId && referencedSupport.familyId !== taskFamilyId) {
      return {
        valid: false,
        error: `Cross-tenant violation: DomesticSupport belongs to family '${referencedSupport.familyId}', but task belongs to '${taskFamilyId}'`
      };
    }

    // Invariante de atividade:
    if (!referencedSupport.active) {
      return {
        valid: false,
        error: `Referenced DomesticSupport '${referencedSupport.name}' is inactive`
      };
    }

    return { valid: true };
  }

  if (target === 'FLEXIBLE') {
    // Se domesticSupportId for nulo/ausente, é válido
    if (!task.domesticSupportId) {
      return { valid: true };
    }

    const referencedSupport = supports.find((s) => s.id === task.domesticSupportId);
    if (!referencedSupport) {
      return {
        valid: false,
        error: `Referenced DomesticSupport '${task.domesticSupportId}' not found`
      };
    }

    // Invariante de tenant:
    if (taskFamilyId && referencedSupport.familyId !== taskFamilyId) {
      return {
        valid: false,
        error: `Cross-tenant violation: DomesticSupport belongs to family '${referencedSupport.familyId}', but task belongs to '${taskFamilyId}'`
      };
    }

    // Invariante de atividade:
    if (!referencedSupport.active) {
      return {
        valid: false,
        error: `Referenced DomesticSupport '${referencedSupport.name}' is inactive`
      };
    }

    return { valid: true };
  }

  return { valid: true };
}

/**
 * Serviço de persistência canônica para DomesticSupport.
 * Caminho: /families/{familyId}/domesticSupports/{domesticSupportId}
 * RBAC: ADMIN write (create, update, deactivate, reactivate), MEMBER read-only.
 * Soft delete estrito: nunca executa deleteDoc.
 */
export class DomesticSupportService {
  /**
   * Caminho canônico da subcoleção.
   */
  static getCollectionPath(familyId: string): string {
    return `families/${familyId}/domesticSupports`;
  }

  /**
   * Carrega todos os registros de DomesticSupport da família.
   * Acesso: Qualquer membro autenticado da família (ADMIN ou MEMBER).
   */
  static async getSupports(familyId: string): Promise<DomesticSupport[]> {
    if (!familyId) return [];

    try {
      const colRef = collection(db, 'families', familyId, 'domesticSupports');
      const snap = await getDocs(colRef);
      const list: DomesticSupport[] = [];

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          familyId: data.familyId || familyId,
          name: data.name || '',
          type: data.type || 'CLEANER',
          active: data.active !== false,
          schedule: Array.isArray(data.schedule) ? data.schedule : [],
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString()
        });
      });

      return list;
    } catch (err) {
      console.error('Failed to load domestic supports:', err);
      return [];
    }
  }

  /**
   * Carrega um registro individual por ID.
   */
  static async getSupportById(
    familyId: string,
    supportId: string
  ): Promise<DomesticSupport | null> {
    if (!familyId || !supportId) return null;

    try {
      const docRef = doc(db, 'families', familyId, 'domesticSupports', supportId);
      const snap = await getDoc(docRef);

      if (!snap.exists()) return null;

      const data = snap.data();
      return {
        id: snap.id,
        familyId: data.familyId || familyId,
        name: data.name || '',
        type: data.type || 'CLEANER',
        active: data.active !== false,
        schedule: Array.isArray(data.schedule) ? data.schedule : [],
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString()
      };
    } catch (err) {
      console.error(`Failed to load domestic support ${supportId}:`, err);
      return null;
    }
  }

  /**
   * Salva ou atualiza um registro de DomesticSupport.
   * RBAC: Apenas ADMIN pode salvar.
   */
  static async saveSupport(
    familyId: string,
    support: DomesticSupport,
    actorRole: 'ADMIN' | 'MEMBER' | string
  ): Promise<DomesticSupport> {
    if (actorRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only family ADMIN can create or update DomesticSupport');
    }

    if (support.familyId !== familyId) {
      throw new Error(`Cross-tenant mismatch: support familyId '${support.familyId}' !== '${familyId}'`);
    }

    const scheduleValidation = validateDomesticSupportSchedule(support.schedule || []);
    if (!scheduleValidation.valid) {
      throw new Error(scheduleValidation.error || 'Invalid schedule configuration');
    }

    const docRef = doc(db, 'families', familyId, 'domesticSupports', support.id);
    const payload = {
      id: support.id,
      familyId: support.familyId,
      name: support.name.trim(),
      type: support.type || 'CLEANER',
      active: support.active,
      schedule: support.schedule || [],
      createdAt: support.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(docRef, payload, { merge: true });

    return {
      ...support,
      updatedAt: payload.updatedAt
    };
  }

  /**
   * Desativação via serviço (active = false).
   * RBAC: Apenas ADMIN pode desativar.
   * Não executa hard delete.
   */
  static async deactivateSupport(
    familyId: string,
    supportId: string,
    actorRole: 'ADMIN' | 'MEMBER' | string
  ): Promise<DomesticSupport> {
    if (actorRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only family ADMIN can deactivate DomesticSupport');
    }

    const current = await this.getSupportById(familyId, supportId);
    if (!current) {
      throw new Error(`DomesticSupport '${supportId}' not found`);
    }

    const deactivated = deactivateDomesticSupportEntity(current);
    const docRef = doc(db, 'families', familyId, 'domesticSupports', supportId);

    await updateDoc(docRef, {
      active: false,
      updatedAt: deactivated.updatedAt
    });

    return deactivated;
  }

  /**
   * Reativação via serviço (active = true) preservando o mesmo ID e histórico.
   * RBAC: Apenas ADMIN pode reativar.
   */
  static async reactivateSupport(
    familyId: string,
    supportId: string,
    actorRole: 'ADMIN' | 'MEMBER' | string
  ): Promise<DomesticSupport> {
    if (actorRole !== 'ADMIN') {
      throw new Error('FORBIDDEN: Only family ADMIN can reactivate DomesticSupport');
    }

    const current = await this.getSupportById(familyId, supportId);
    if (!current) {
      throw new Error(`DomesticSupport '${supportId}' not found`);
    }

    const reactivated = reactivateDomesticSupportEntity(current);
    const docRef = doc(db, 'families', familyId, 'domesticSupports', supportId);

    await updateDoc(docRef, {
      active: true,
      updatedAt: reactivated.updatedAt
    });

    return reactivated;
  }
}
