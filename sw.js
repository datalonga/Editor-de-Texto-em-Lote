/**
 * Service Worker — cache offline (PWA).
 *
 * Estratégia:
 *  - pré-cache dos arquivos do app (shell) na instalação;
 *  - navegações: network-first com fallback para o index.html em cache
 *    (garante que atualizações cheguem, mas funciona sem rede);
 *  - assets: stale-while-revalidate (rápido e sempre atualizado em background).
 *
 * Importante: nenhum dado do usuário passa por aqui — a lista fica no
 * localStorage/IndexedDB do navegador.
 */

const VERSION = 'v5.0.0';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/styles.css',
  './assets/js/app/main.js',
  './assets/js/app/app.js',
  './assets/js/core/utils.js',
  './assets/js/core/naming.js',
  './assets/js/core/text.js',
  './assets/js/core/engine.js',
  './assets/js/core/steps.js',
  './assets/js/core/parser.js',
  './assets/js/core/scripts.js',
  './assets/js/core/exporters.js',
  './assets/js/core/presets.js',
  './assets/js/core/examples.js',
  './assets/js/core/store.js',
  './assets/js/ui/icons.js',
  './assets/js/ui/toast.js',
  './assets/js/ui/modal.js',
  './assets/js/ui/fields.js',
  './assets/js/ui/stepEditors.js',
  './assets/js/ui/inputPanel.js',
  './assets/js/ui/pipelinePanel.js',
  './assets/js/ui/previewPanel.js',
  './assets/js/ui/compareDialog.js',
  './assets/js/ui/recipeDialog.js',
  './assets/js/ui/exportDialog.js',
  './assets/js/ui/commandPalette.js',
  './assets/js/ui/dialogs.js',
  './assets/js/ui/theme.js',
  './assets/js/worker/engine.worker.js',
  './assets/icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `addAll` falha inteiro se um recurso falhar; usamos requests individuais
      // para que um ícone ausente não impeça o app de funcionar offline.
      .then((cache) =>
        Promise.all(SHELL_ASSETS.map((asset) => cache.add(asset).catch(() => null))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Só lidamos com recursos da própria origem (fontes externas passam direto).
  if (url.origin !== self.location.origin) return;

  // Navegações: network-first com fallback offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match('./index.html'))
            .then((cached) => cached ?? new Response('Offline', { status: 503 })),
        ),
    );
    return;
  }

  // Assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached ?? new Response('', { status: 504 }));

      return cached ?? network;
    }),
  );
});
