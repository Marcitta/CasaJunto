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
