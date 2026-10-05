"use strict";
/**
 * CASA JUNTO — FIREBASE ADMIN INITIALIZATION
 * Camada backend server-side isolada (Cloud Functions).
 *
 * REGRA CRÍTICA:
 * O CasaJunto NÃO usa o banco Firestore (default).
 * O banco Firestore canônico é explicitamente nomeado:
 * ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CASAJUNTO_FIRESTORE_DATABASE_ID = void 0;
exports.getAdminApp = getAdminApp;
exports.getAdminFirestore = getAdminFirestore;
exports.getAdminMessaging = getAdminMessaging;
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
/**
 * CASAJUNTO_FIRESTORE_DATABASE_ID
 * Identificador canônico do banco Firestore dedicado ao projeto CasaJunto.
 */
exports.CASAJUNTO_FIRESTORE_DATABASE_ID = 'ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c';
let adminApp = null;
let firestoreDb = null;
let messagingInstance = null;
/**
 * Retorna ou inicializa o App do Firebase Admin usando as credenciais do ambiente Google Cloud.
 * PROIBIDO: Carregar chaves privadas, service accounts ou expor segredos.
 */
function getAdminApp() {
    if (!adminApp) {
        if (admin.apps.length > 0 && admin.apps[0]) {
            adminApp = admin.apps[0];
        }
        else {
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
function getAdminFirestore(customDatabaseId) {
    const targetDbId = customDatabaseId || exports.CASAJUNTO_FIRESTORE_DATABASE_ID;
    if (!firestoreDb || customDatabaseId) {
        const app = getAdminApp();
        const db = (0, firestore_1.getFirestore)(app, targetDbId);
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
function getAdminMessaging() {
    if (!messagingInstance) {
        const app = getAdminApp();
        messagingInstance = (0, messaging_1.getMessaging)(app);
    }
    return messagingInstance;
}
//# sourceMappingURL=firebaseAdmin.js.map