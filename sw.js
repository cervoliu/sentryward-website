// Cross-origin isolation for the demo page's playground. SentryWard runs there as WebAssembly with threads, which need
// SharedArrayBuffer, which a page has only when it is cross-origin isolated (COOP and COEP headers). GitHub Pages cannot
// set headers, so this worker adds them to the demo page and to the playground's worker scripts, nothing else: every
// other request passes through untouched, and nothing is cached. js/demo.mjs registers it when Run first needs it.
// COEP credentialless, not require-corp: a cross-origin image or font still loads, just without cookies.
const HEADERS = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };
const root = new URL(self.registration.scope);
const isDemo = url => url.pathname === `${root.pathname}demo/` || url.pathname === `${root.pathname}demo/index.html`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const { request } = event, url = new URL(request.url);
  if (url.origin !== root.origin) return;
  if (!(request.mode === 'navigate' && isDemo(url)) && request.destination !== 'worker') return;
  event.respondWith(fetch(request).then(response => {
    if (response.status === 0 || response.type === 'opaqueredirect') return response;
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(HEADERS)) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }));
});
