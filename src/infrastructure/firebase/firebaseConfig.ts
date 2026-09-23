import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import appletConfig from '../../../firebase-applet-config.json';

const getEnvVar = (key: string): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
    return (import.meta as any).env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key] as string;
  }
  return '';
};

// Ler de variáveis de ambiente com fallback direto para firebase-applet-config.json
const rawApiKey = getEnvVar('VITE_FIREBASE_API_KEY') || appletConfig.apiKey || '';
const authDomain = getEnvVar('VITE_FIREBASE_AUTH_DOMAIN') || appletConfig.authDomain || '';
const projectId = getEnvVar('VITE_FIREBASE_PROJECT_ID') || appletConfig.projectId || '';
const storageBucket = getEnvVar('VITE_FIREBASE_STORAGE_BUCKET') || appletConfig.storageBucket || '';
const messagingSenderId = getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID') || appletConfig.messagingSenderId || '';
const appId = getEnvVar('VITE_FIREBASE_APP_ID') || appletConfig.appId || '';
const databaseId = getEnvVar('VITE_FIREBASE_DATABASE_ID') || appletConfig.firestoreDatabaseId || 'ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c';

const isConfigured = Boolean(
  rawApiKey &&
  projectId &&
  appId &&
  rawApiKey.startsWith('AIza') &&
  rawApiKey.length >= 35 &&
  !rawApiKey.includes('Dummy') &&
  !rawApiKey.includes('placeholder')
);

const firebaseConfig = {
  apiKey: rawApiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const isFirebaseConfigured = isConfigured;

export default app;

