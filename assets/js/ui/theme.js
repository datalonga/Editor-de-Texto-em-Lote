/**
 * Tema claro/escuro/sistema + cor de destaque.
 * Tudo via CSS custom properties: trocar de tema não re-renderiza nada.
 */

export const ACCENTS = {
  violet: { label: 'Violeta', base: '#a78bfa', strong: '#8b5cf6', soft: 'rgba(167,139,250,0.14)' },
  blue: { label: 'Azul', base: '#60a5fa', strong: '#3b82f6', soft: 'rgba(96,165,250,0.14)' },
  emerald: { label: 'Esmeralda', base: '#34d399', strong: '#10b981', soft: 'rgba(52,211,153,0.14)' },
  amber: { label: 'Âmbar', base: '#fbbf24', strong: '#f59e0b', soft: 'rgba(251,191,36,0.14)' },
  rose: { label: 'Rosa', base: '#fb7185', strong: '#f43f5e', soft: 'rgba(251,113,133,0.14)' },
  cyan: { label: 'Ciano', base: '#22d3ee', strong: '#06b6d4', soft: 'rgba(34,211,238,0.14)' },
};

let mediaQuery = null;
let mediaHandler = null;

/**
 * Resolve o tema efetivo.
 * Modo 'system' respeita `prefers-color-scheme`. Se o usuário nunca escolheu,
 * usamos 'system' como padrão (ver store) para não "impor" o escuro no claro.
 */
function resolveTheme(mode) {
  if (mode === 'dark' || mode === 'light') return mode;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Aplica o tema. Em `system`, escuta mudanças do SO em tempo real.
 * @param {'dark'|'light'|'system'} mode
 */
export function applyTheme(mode) {
  const root = document.documentElement;

  const paint = () => {
    const resolved = resolveTheme(mode);
    root.classList.toggle('dark', resolved === 'dark');
    root.classList.toggle('light', resolved === 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'light' ? '#f6f6f8' : '#0b0b0f');
  };

  paint();

  // Remove listener anterior para não acumular trocas de tema.
  if (mediaQuery && mediaHandler) mediaQuery.removeEventListener('change', mediaHandler);
  mediaQuery = null;
  mediaHandler = null;

  if (mode === 'system') {
    mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    mediaHandler = () => paint();
    mediaQuery.addEventListener('change', mediaHandler);
  }
}

/** Aplica a cor de destaque (CSS vars). */
export function applyAccent(name) {
  const palette = ACCENTS[name] ?? ACCENTS.violet;
  const root = document.documentElement;
  root.style.setProperty('--accent', palette.base);
  root.style.setProperty('--accent-strong', palette.strong);
  root.style.setProperty('--accent-soft', palette.soft);
}
