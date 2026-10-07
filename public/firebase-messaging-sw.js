// CasaJunto - Firebase Cloud Messaging Service Worker
// Compatível com Firebase v10 Web SDK (Scripts compatíveis para service worker em background)
/* eslint-disable no-undef */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Configuração pública do Firebase para o Service Worker
const firebaseConfig = {
  apiKey: "AIzaSyC6a4f8jMPcbl256q2K-60CBMTeC3FIsww",
  authDomain: "trusty-coder-386311.firebaseapp.com",
  projectId: "trusty-coder-386311",
  storageBucket: "trusty-coder-386311.firebasestorage.app",
  messagingSenderId: "386481930109",
  appId: "1:386481930109:web:c56582faaeedc03f2a9614"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || payload.data?.title || 'CasaJunto';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/casajunto-compact.png',
    badge: '/brand/casajunto-simbolo-fundo-branco.png',
    data: payload.data || {}
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

/**
 * Resolução segura de destino para impedir qualquer navegação externa.
 * Regras:
 * - default = '/'
 * - aceitar somente rota same-origin
 * - URL externa deve virar '/'
 * - protocol-relative //evil.example deve virar '/'
 * - javascript: deve virar '/'
 * - data: deve virar '/'
 * - URL inválida deve virar '/'
 */
function getSafeDestination(candidate) {
  if (!candidate || typeof candidate !== 'string') {
    return '/';
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return '/';
  }
  // Impedir protocol-relative, backslashes maliciosos e schemes perigosos
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.startsWith('\\\\')) {
    return '/';
  }
  try {
    const resolved = new URL(trimmed, self.location.origin);
    // Deve pertencer estritamente à mesma origem
    if (resolved.origin !== self.location.origin) {
      return '/';
    }
    // Se continha scheme explícito (://) que não correspondia à origem base
    if (trimmed.includes('://') && !trimmed.startsWith(self.location.origin + '/')) {
      return '/';
    }
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    // URL inválida ou erro de parsing
    return '/';
  }
}

// Manipulador de clique na notificação para navegação/foco
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = event.notification.data && event.notification.data.url;
  const urlToOpen = getSafeDestination(rawUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. Se já existir uma aba/janela aberta da mesma origem, foca nela
      for (const client of clientList) {
        if ('focus' in client && client.url) {
          try {
            if (new URL(client.url).origin === self.location.origin) {
              return client.focus();
            }
          } catch {
            // Ignora cliente com URL inválida
          }
        }
      }

      // 2. Se nenhuma janela estiver aberta, abre uma nova janela/PWA
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
