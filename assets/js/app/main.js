/**
 * Ponto de entrada.
 * Isola o bootstrap em try/catch para exibir um erro amigável (error boundary
 * em versão vanilla) em vez de uma tela branca.
 */

import { bootstrap } from './app.js';

function renderFatal(error) {
  console.error('[bootstrap]', error);
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div style="display:grid;place-items:center;height:100dvh;padding:24px;font-family:system-ui">
      <div style="max-width:520px;text-align:center">
        <h1 style="font-size:18px;margin-bottom:8px">Não foi possível iniciar o app</h1>
        <p style="color:#9c9caa;font-size:13px;line-height:1.6;margin-bottom:16px">
          Algo deu errado ao carregar os módulos. Tente recarregar a página.
          Se o erro persistir, limpe os dados do site (o histórico local pode estar corrompido).
        </p>
        <pre style="text-align:left;overflow:auto;padding:12px;border-radius:8px;background:#17171f;color:#fb7185;font-size:11px">${String(
          error && error.message ? error.message : error,
        ).replace(/</g, '&lt;')}</pre>
        <button
          onclick="try{localStorage.clear()}catch(e){};location.reload()"
          style="margin-top:14px;padding:8px 14px;border-radius:8px;border:1px solid #33333f;background:#17171f;color:#f1f1f4;cursor:pointer;font-size:13px"
        >
          Limpar dados e recarregar
        </button>
      </div>
    </div>
  `;
}

try {
  bootstrap();
} catch (error) {
  renderFatal(error);
}

// Erros assíncronos não tratados também são registrados (sem quebrar a UI).
window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandled]', event.reason);
});

/* ------------------------- Service Worker (PWA) ------------------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Registro silencioso: se falhar (ex.: arquivo local), o app segue funcionando.
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
