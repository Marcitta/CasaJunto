/**
 * CasaJunto - Firebase & Firestore Initialization
 * Inicializa a instância do Firebase e Firestore com suporte a multi-tenancy e autenticação.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Inicialização do Auth
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

// Inicialização do Firestore usando databaseId dedicado configurado no applet
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export { app };
