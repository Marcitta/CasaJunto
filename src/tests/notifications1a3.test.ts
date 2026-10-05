/**
 * CASA JUNTO — TEST SUITE NOTIFICATIONS-1A.3
 * Minimal PWA / iOS Home Screen Readiness:
 * 
 * N1A3-01: manifest.webmanifest existe.
 * N1A3-02: manifest possui name, short_name, start_url, scope, display=standalone.
 * N1A3-03: manifest possui ícone 192x192.
 * N1A3-04: manifest possui ícone 512x512.
 * N1A3-05: index.html referencia manifest.webmanifest.
 * N1A3-06: index.html possui apple-touch-icon.
 * N1A3-07: index.html possui configuração standalone compatível com iOS.
 * N1A3-08: nenhum novo Service Worker foi criado (apenas o de Firebase Messaging).
 * N1A3-09: firebase-messaging-sw.js permanece funcional e não recebeu lógica de offline/cache.
 * N1A3-10: PushActivationService continua impedindo solicitação de permissão em iOS fora de standalone.
 * N1A3-11: nenhuma credencial privada ou token foi introduzido.
 * N1A3-12: Motor 2.0 permanece completamente intocado.
 */

import fs from 'fs';
import path from 'path';
import { PushActivationService } from '../services/pushActivationService';

export async function runNotifications1a3Tests(): Promise<{
  passed: number;
  failed: number;
  results: { testName: string; passed: boolean; message?: string }[];
}> {
  const results: { testName: string; passed: boolean; message?: string }[] = [];
  let passed = 0;
  let failed = 0;

  async function record(id: string, name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      results.push({ testName: `Notifications-1A.3 ${id}: ${name}`, passed: true });
    } catch (err: any) {
      failed++;
      results.push({ testName: `Notifications-1A.3 ${id}: ${name}`, passed: false, message: err?.message || String(err) });
    }
  }

  // N1A3-01: manifest.webmanifest existe
  await record('N1A3-01', 'manifest.webmanifest existe em public/', () => {
    const manifestPath = path.resolve('public/manifest.webmanifest');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Arquivo public/manifest.webmanifest não encontrado');
    }
  });

  // N1A3-02: manifest possui name, short_name, start_url, scope, display=standalone
  await record('N1A3-02', 'manifest possui campos canônicos mínimos (name, short_name, start_url, scope, display=standalone)', () => {
    const manifestPath = path.resolve('public/manifest.webmanifest');
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const json = JSON.parse(content);

    if (json.name !== 'CasaJunto') {
      throw new Error(`Nome esperado "CasaJunto", obtido: "${json.name}"`);
    }
    if (json.short_name !== 'CasaJunto') {
      throw new Error(`short_name esperado "CasaJunto", obtido: "${json.short_name}"`);
    }
    if (json.start_url !== '/') {
      throw new Error(`start_url esperado "/", obtido: "${json.start_url}"`);
    }
    if (json.scope !== '/') {
      throw new Error(`scope esperado "/", obtido: "${json.scope}"`);
    }
    if (json.display !== 'standalone') {
      throw new Error(`display esperado "standalone", obtido: "${json.display}"`);
    }
    if (!json.theme_color) {
      throw new Error('theme_color deve estar definido no manifest');
    }
    if (!json.background_color) {
      throw new Error('background_color deve estar definido no manifest');
    }
  });

  // N1A3-03: manifest possui ícone 192x192
  await record('N1A3-03', 'manifest possui ícone 192x192 referenciando arquivo existente', () => {
    const manifestPath = path.resolve('public/manifest.webmanifest');
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const json = JSON.parse(content);

    if (!Array.isArray(json.icons) || json.icons.length === 0) {
      throw new Error('manifest deve conter array "icons" com ícones definidos');
    }

    const icon192 = json.icons.find((icon: any) => icon.sizes === '192x192');
    if (!icon192) {
      throw new Error('manifest deve conter ícone com sizes="192x192"');
    }

    const relSrc = icon192.src.startsWith('/') ? icon192.src.substring(1) : icon192.src;
    const iconFilePath = path.resolve('public', relSrc);
    if (!fs.existsSync(iconFilePath)) {
      throw new Error(`Arquivo do ícone 192x192 não existe em: ${iconFilePath}`);
    }
  });

  // N1A3-04: manifest possui ícone 512x512
  await record('N1A3-04', 'manifest possui ícone 512x512 referenciando arquivo existente', () => {
    const manifestPath = path.resolve('public/manifest.webmanifest');
    const content = fs.readFileSync(manifestPath, 'utf-8');
    const json = JSON.parse(content);

    const icon512 = json.icons.find((icon: any) => icon.sizes === '512x512');
    if (!icon512) {
      throw new Error('manifest deve conter ícone com sizes="512x512"');
    }

    const relSrc = icon512.src.startsWith('/') ? icon512.src.substring(1) : icon512.src;
    const iconFilePath = path.resolve('public', relSrc);
    if (!fs.existsSync(iconFilePath)) {
      throw new Error(`Arquivo do ícone 512x512 não existe em: ${iconFilePath}`);
    }
  });

  // N1A3-05: index.html referencia manifest.webmanifest
  await record('N1A3-05', 'index.html referencia manifest.webmanifest', () => {
    const indexPath = path.resolve('index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');

    if (!content.includes('href="/manifest.webmanifest"') || !content.includes('rel="manifest"')) {
      throw new Error('index.html deve conter tag <link rel="manifest" href="/manifest.webmanifest" />');
    }
  });

  // N1A3-06: index.html possui apple-touch-icon
  await record('N1A3-06', 'index.html possui apple-touch-icon referenciando arquivo existente', () => {
    const indexPath = path.resolve('index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');

    if (!content.includes('rel="apple-touch-icon"')) {
      throw new Error('index.html deve conter tag <link rel="apple-touch-icon" ... />');
    }

    const match = content.match(/<link[^>]*rel="apple-touch-icon"[^>]*href="([^"]+)"/);
    if (!match || !match[1]) {
      throw new Error('Não foi possível extrair href do apple-touch-icon');
    }

    const iconHref = match[1].startsWith('/') ? match[1].substring(1) : match[1];
    const iconPath = path.resolve('public', iconHref);
    if (!fs.existsSync(iconPath)) {
      throw new Error(`Arquivo apple-touch-icon não encontrado em: ${iconPath}`);
    }
  });

  // N1A3-07: index.html possui configuração standalone compatível com iOS
  await record('N1A3-07', 'index.html possui meta tags para execução standalone compatível com iOS', () => {
    const indexPath = path.resolve('index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');

    if (!content.includes('name="apple-mobile-web-app-capable"') || !content.includes('content="yes"')) {
      throw new Error('index.html deve conter <meta name="apple-mobile-web-app-capable" content="yes">');
    }
    if (!content.includes('name="apple-mobile-web-app-status-bar-style"')) {
      throw new Error('index.html deve conter <meta name="apple-mobile-web-app-status-bar-style" ...>');
    }
    if (!content.includes('name="apple-mobile-web-app-title"') || !content.includes('content="CasaJunto"')) {
      throw new Error('index.html deve conter <meta name="apple-mobile-web-app-title" content="CasaJunto">');
    }
    if (!content.includes('name="theme-color"')) {
      throw new Error('index.html deve conter <meta name="theme-color" ...>');
    }
  });

  // N1A3-08: nenhum novo Service Worker foi criado (apenas o de Firebase Messaging)
  await record('N1A3-08', 'nenhum novo Service Worker concorrente foi criado (apenas firebase-messaging-sw.js)', () => {
    const publicFiles = fs.readdirSync(path.resolve('public'));
    const swFiles = publicFiles.filter(f => f.includes('sw') || f.includes('service-worker'));

    if (swFiles.length !== 1 || swFiles[0] !== 'firebase-messaging-sw.js') {
      throw new Error(`Esperado unicamente firebase-messaging-sw.js em public/, encontrados: ${swFiles.join(', ')}`);
    }

    // Verifica que vite-plugin-pwa e workbox não estão no package.json
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
    const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (allDeps['vite-plugin-pwa'] || allDeps['workbox-window'] || allDeps['workbox-core']) {
      throw new Error('Violação: bibliotecas de Service Worker concorrentes encontradas no package.json');
    }
  });

  // N1A3-09: firebase-messaging-sw.js permanece funcional e não recebeu lógica de offline/cache
  await record('N1A3-09', 'firebase-messaging-sw.js permanece dedicado a FCM sem lógica de offline/cache', () => {
    const swPath = path.resolve('public/firebase-messaging-sw.js');
    const content = fs.readFileSync(swPath, 'utf-8');

    if (!content.includes('firebase.messaging()') || !content.includes('onBackgroundMessage')) {
      throw new Error('firebase-messaging-sw.js deve manter handler de push onBackgroundMessage');
    }

    const forbiddenOfflineTerms = [
      'caches.open',
      'cache.put',
      'cache.match',
      'workbox',
      'precacheAndRoute',
      'fetch('
    ];

    for (const term of forbiddenOfflineTerms) {
      if (content.includes(term)) {
        throw new Error(`firebase-messaging-sw.js não deve conter lógica de cache/offline: "${term}"`);
      }
    }
  });

  // N1A3-10: PushActivationService continua impedindo solicitação de permissão em iOS fora de standalone
  await record('N1A3-10', 'PushActivationService continua impedindo solicitação de permissão em iOS fora de standalone', async () => {
    let permissionCalled = false;
    const mockIPhoneWin: any = {
      Notification: {
        permission: 'default',
        requestPermission: async () => {
          permissionCalled = true;
          return 'granted';
        }
      },
      navigator: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        standalone: false,
        serviceWorker: {
          register: async () => ({ scope: '/' }),
          ready: Promise.resolve({ scope: '/' })
        }
      },
      PushManager: {},
      matchMedia: () => ({ matches: false }),
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      }
    };

    const cap = PushActivationService.checkDeviceCapability(mockIPhoneWin);
    if (!cap.isIOS || cap.isStandalone || cap.canRequestPush) {
      throw new Error('iOS fora de standalone não pode ter canRequestPush === true');
    }

    const res = await PushActivationService.activatePushNotifications({
      userId: 'user-ios-test',
      mockWindow: mockIPhoneWin
    });

    if (permissionCalled) {
      throw new Error('Violação: Notification.requestPermission foi chamado indevidamente no iOS fora de standalone');
    }

    if (!res.message || !res.message.includes('Tela de Início')) {
      throw new Error('Mensagem deve conter orientação para adicionar à Tela de Início');
    }
  });

  // N1A3-11: nenhuma credencial privada ou token foi introduzido
  await record('N1A3-11', 'nenhuma credencial privada ou token foi introduzido no manifest ou HTML', () => {
    const filesToCheck = [
      'public/manifest.webmanifest',
      'index.html'
    ];

    const secretPatterns = [
      'private_key',
      'client_secret',
      'service_account',
      'PRIVATE KEY',
      'token-fcm',
      'fcm-token'
    ];

    for (const f of filesToCheck) {
      const fullPath = path.resolve(f);
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const pattern of secretPatterns) {
        if (content.includes(pattern)) {
          throw new Error(`Vazamento: Segredo ou token encontrado em ${f}: "${pattern}"`);
        }
      }
    }
  });

  // N1A3-12: Motor 2.0 permanece completamente intocado
  await record('N1A3-12', 'Motor 2.0 permanece estritamente puro e intocado', () => {
    const motorFiles = [
      'src/domain/distribution/DistributionEngine.ts',
      'src/domain/distribution/RebalanceService.ts',
      'src/domain/distribution/SafetyService.ts',
      'src/domain/distribution/EligibilityService.ts',
      'src/domain/distribution/AvailabilityService.ts',
      'src/domain/distribution/ScoringService.ts',
      'src/domain/distribution/BalanceService.ts',
      'src/domain/distribution/ExplainabilityService.ts',
      'src/application/services/DistributionService.ts',
      'src/application/services/RoutineContinuityService.ts'
    ];

    const forbiddenTerms = [
      'manifest',
      'pwa',
      'webmanifest',
      'apple-touch-icon',
      'standalone',
      'theme-color'
    ];

    for (const relPath of motorFiles) {
      const fullPath = path.resolve(relPath);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const term of forbiddenTerms) {
        if (content.includes(term)) {
          throw new Error(`Violação: ${relPath} contém termo indevido: "${term}"`);
        }
      }
    }
  });

  return { passed, failed, results };
}
