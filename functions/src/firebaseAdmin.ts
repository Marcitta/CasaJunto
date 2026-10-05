/**
 * CASA JUNTO — FIREBASE ADMIN INITIALIZATION
 * Camada backend server-side isolada (Cloud Functions).
 *
 * REGRA CRÍTICA:
 * O CasaJunto NÃO usa o banco Firestore (default).
 * O banco Firestore canônico é explicitamente nomeado:
 * ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c
 */

import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getMessaging, Messaging } from 'firebase-admin/messaging';

/**
 * CASAJUNTO_FIRESTORE_DATABASE_ID
 * Identificador canônico do banco Firestore dedicado ao projeto CasaJunto.
 */
export const CASAJUNTO_FIRESTORE_DATABASE_ID = 'ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c';

let adminApp: admin.app.App | null = null;
let firestoreDb: Firestore | null = null;
let messagingInstance: Messaging | null = null;

/**
 * Retorna ou inicializa o App do Firebase Admin usando as credenciais do ambiente Google Cloud.
 * PROIBIDO: Carregar chaves privadas, service accounts ou expor segredos.
 */
export function getAdminApp(): admin.app.App {
  if (!adminApp) {
    if (admin.apps.length > 0 && admin.apps[0]) {
      adminApp = admin.apps[0];
    } else {
      adminApp = admin.initializeApp({
        projectId: process.env.GCLOUD_PROJECT || 'trusty-coder-386311'
      });
    }
  }
  return adminApp;
}

/**
 * Retorna a instância do Firestore explicitamente vinculada ao databaseId canônico do CasaJunto.
 * Nunca utiliza o banco "(default)".
 */
export function getAdminFirestore(customDatabaseId?: string): Firestore {
  const targetDbId = customDatabaseId || CASAJUNTO_FIRESTORE_DATABASE_ID;
  if (!firestoreDb || customDatabaseId) {
    const app = getAdminApp();
    const db = getFirestore(app, targetDbId);
    if (!customDatabaseId) {
      firestoreDb = db;
    }
    return db;
  }
  return firestoreDb;
}

/**
 * Retorna a instância de Firebase Cloud Messaging (Admin SDK).
 */
export function getAdminMessaging(): Messaging {
  if (!messagingInstance) {
    const app = getAdminApp();
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}
