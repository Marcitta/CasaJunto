/**
 * CasaJunto - PushDeviceService
 * Infraestrutura isolada para registro e gestão de dispositivos para Push Notifications (FCM).
 *
 * Arquitetura Canônica:
 * Firebase Auth uid -> /users/{uid}/pushDevices/{deviceId}
 *
 * Estrutura:
 * {
 *   id: string,
 *   userId: string,
 *   token: string,
 *   platform: 'WEB',
 *   active: boolean,
 *   createdAt: string,
 *   updatedAt: string,
 *   lastSeenAt: string
 * }
 */

import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../infrastructure/firebase/firebaseConfig';
import { PushDevice } from '../types';

export interface RegisterDeviceParams {
  userId: string;
  token: string;
  deviceId?: string;
  platform?: 'WEB';
  // Opcional para testes e injeção em memória
  inMemoryStore?: Map<string, PushDevice>;
}

export class PushDeviceService {
  private static readonly DEVICE_STORAGE_KEY = 'casajunto_push_device_id';

  /**
   * Obtém ou gera identificador único estável para o dispositivo web atual.
   * Não utiliza telefone nem email como identificador (requisito 7).
   */
  public static getOrCreateDeviceId(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(this.DEVICE_STORAGE_KEY);
        if (stored && stored.trim().length > 0) {
          return stored;
        }
        const newId = `dev_web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        window.localStorage.setItem(this.DEVICE_STORAGE_KEY, newId);
        return newId;
      } catch {
        // Fallback em caso de restrição de localStorage (cookies bloqueados, sandbox)
      }
    }
    return `dev_web_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Registra ou atualiza um dispositivo push sob o Firebase Auth UID do usuário.
   * Coleção canônica: /users/{userId}/pushDevices/{deviceId}
   */
  public static async registerDevice(params: RegisterDeviceParams): Promise<PushDevice> {
    const { userId, token, inMemoryStore } = params;

    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('Identificador de usuário (Auth UID) é obrigatório para registrar dispositivo push.');
    }

    if (!token || typeof token !== 'string' || token.trim() === '') {
      throw new Error('Token FCM de registro é obrigatório.');
    }

    // Validação de fronteira de segurança no cliente:
    // Se houver usuário autenticado no SDK, o userId deve ser exatamente igual ao request.auth.uid
    if (auth && auth.currentUser && auth.currentUser.uid && auth.currentUser.uid !== userId) {
      throw new Error(`Violação de segurança: Usuário autenticado (${auth.currentUser.uid}) não pode registrar dispositivo para o UID (${userId}).`);
    }

    const deviceId = params.deviceId && params.deviceId.trim().length > 0
      ? params.deviceId.trim()
      : this.getOrCreateDeviceId();

    const nowIso = new Date().toISOString();

    // Se estiver usando inMemoryStore (testes unitários isolados)
    if (inMemoryStore) {
      // Verificar se já existe dispositivo com este deviceId ou com este token para o usuário
      let existing: PushDevice | undefined;
      for (const dev of inMemoryStore.values()) {
        if (dev.userId === userId && (dev.id === deviceId || dev.token === token)) {
          existing = dev;
          break;
        }
      }

      const resolvedDeviceId = existing?.id || deviceId;
      const deviceData: PushDevice = {
        id: resolvedDeviceId,
        userId,
        token,
        platform: 'WEB',
        active: true,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
        lastSeenAt: nowIso
      };

      inMemoryStore.set(`${userId}_${resolvedDeviceId}`, deviceData);
      return deviceData;
    }

    // Persistência canônica no Firestore
    const deviceRef = doc(db, 'users', userId, 'pushDevices', deviceId);
    let existingData: PushDevice | null = null;

    try {
      const snap = await getDoc(deviceRef);
      if (snap.exists()) {
        existingData = snap.data() as PushDevice;
      }
    } catch {
      // Documento ainda não existe
    }

    const devicePayload: PushDevice = {
      id: deviceId,
      userId,
      token,
      platform: 'WEB',
      active: true,
      createdAt: existingData?.createdAt || nowIso,
      updatedAt: nowIso,
      lastSeenAt: nowIso
    };

    await setDoc(deviceRef, devicePayload, { merge: true });
    return devicePayload;
  }

  /**
   * Desativa um dispositivo ou token inválido sem remover o histórico.
   */
  public static async deactivateDevice(
    userId: string,
    deviceId: string,
    inMemoryStore?: Map<string, PushDevice>
  ): Promise<void> {
    if (!userId || !deviceId) {
      throw new Error('userId e deviceId são obrigatórios para desativar dispositivo.');
    }

    // Verificação de autorização no SDK
    if (auth && auth.currentUser && auth.currentUser.uid && auth.currentUser.uid !== userId) {
      throw new Error(`Violação de segurança: Usuário autenticado (${auth.currentUser.uid}) não pode alterar dispositivos do UID (${userId}).`);
    }

    const nowIso = new Date().toISOString();

    if (inMemoryStore) {
      const key = `${userId}_${deviceId}`;
      const dev = inMemoryStore.get(key);
      if (dev) {
        inMemoryStore.set(key, { ...dev, active: false, updatedAt: nowIso });
      }
      return;
    }

    const deviceRef = doc(db, 'users', userId, 'pushDevices', deviceId);
    await updateDoc(deviceRef, {
      active: false,
      updatedAt: nowIso
    });
  }

  /**
   * Atualiza o timestamp de última visualização/atividade do dispositivo.
   */
  public static async updateDeviceLastSeen(
    userId: string,
    deviceId: string,
    inMemoryStore?: Map<string, PushDevice>
  ): Promise<void> {
    if (!userId || !deviceId) return;
    const nowIso = new Date().toISOString();

    if (inMemoryStore) {
      const key = `${userId}_${deviceId}`;
      const dev = inMemoryStore.get(key);
      if (dev) {
        inMemoryStore.set(key, { ...dev, lastSeenAt: nowIso, updatedAt: nowIso });
      }
      return;
    }

    const deviceRef = doc(db, 'users', userId, 'pushDevices', deviceId);
    await updateDoc(deviceRef, {
      lastSeenAt: nowIso,
      updatedAt: nowIso
    });
  }

  /**
   * Lista todos os dispositivos registrados para o usuário especificado.
   */
  public static async getUserDevices(
    userId: string,
    inMemoryStore?: Map<string, PushDevice>
  ): Promise<PushDevice[]> {
    if (!userId) return [];

    if (auth && auth.currentUser && auth.currentUser.uid && auth.currentUser.uid !== userId) {
      throw new Error(`Violação de segurança: Usuário autenticado (${auth.currentUser.uid}) não pode consultar dispositivos do UID (${userId}).`);
    }

    if (inMemoryStore) {
      const list: PushDevice[] = [];
      for (const dev of inMemoryStore.values()) {
        if (dev.userId === userId) {
          list.push(dev);
        }
      }
      return list;
    }

    const devicesCol = collection(db, 'users', userId, 'pushDevices');
    const snap = await getDocs(devicesCol);
    return snap.docs.map(d => d.data() as PushDevice);
  }
}
