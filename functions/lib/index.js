"use strict";
/**
 * CASA JUNTO — FIREBASE CLOUD FUNCTIONS ENTRYPOINT
 * Camada backend server-side (NOTIFICATIONS-1B.1).
 *
 * PROIBIDO:
 * 1. Não criar endpoints HTTP públicos sem autenticação.
 * 2. Não expor rota para acionamento arbitrário de notificações de outros usuários.
 * 3. Operar exclusivamente no Firestore canônico ai-studio-casajunto-a7d5bf10-b348-4406-bdbf-36200cb3f48c.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TEMPORARY_ERROR_CODES = exports.DEFINITIVE_INVALID_TOKEN_ERROR_CODES = exports.PushDeliveryService = exports.getAdminMessaging = exports.getAdminFirestore = exports.getAdminApp = exports.CASAJUNTO_FIRESTORE_DATABASE_ID = void 0;
var firebaseAdmin_1 = require("./firebaseAdmin");
Object.defineProperty(exports, "CASAJUNTO_FIRESTORE_DATABASE_ID", { enumerable: true, get: function () { return firebaseAdmin_1.CASAJUNTO_FIRESTORE_DATABASE_ID; } });
Object.defineProperty(exports, "getAdminApp", { enumerable: true, get: function () { return firebaseAdmin_1.getAdminApp; } });
Object.defineProperty(exports, "getAdminFirestore", { enumerable: true, get: function () { return firebaseAdmin_1.getAdminFirestore; } });
Object.defineProperty(exports, "getAdminMessaging", { enumerable: true, get: function () { return firebaseAdmin_1.getAdminMessaging; } });
var pushDeliveryService_1 = require("./services/pushDeliveryService");
Object.defineProperty(exports, "PushDeliveryService", { enumerable: true, get: function () { return pushDeliveryService_1.PushDeliveryService; } });
Object.defineProperty(exports, "DEFINITIVE_INVALID_TOKEN_ERROR_CODES", { enumerable: true, get: function () { return pushDeliveryService_1.DEFINITIVE_INVALID_TOKEN_ERROR_CODES; } });
Object.defineProperty(exports, "TEMPORARY_ERROR_CODES", { enumerable: true, get: function () { return pushDeliveryService_1.TEMPORARY_ERROR_CODES; } });
//# sourceMappingURL=index.js.map