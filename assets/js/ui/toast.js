/**
 * Toasts não-bloqueantes, acessíveis (aria-live polite).
 * Máximo de 4 simultâneos; toasts antigos são removidos automaticamente.
 */

import { icon } from './icons.js';

const VARIANTS = {
  success: { icon: 'check-circle', color: 'var(--success)' },
  error: { icon: 'x-circle', color: 'var(--danger)' },
  warning: { icon: 'alert-triangle', color: 'var(--warning)' },
  info: { icon: 'info', color: 'var(--info)' },
};

let container = null;
const MAX_TOASTS = 4;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toaster';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.append(container);
  return container;
}

/**
 * @param {string} title
 * @param {{ description?: string, variant?: keyof typeof VARIANTS, duration?: number, action?: {label:string, run:Function} }} [options]
 */
export function toast(title, options = {}) {
  const { description = '', variant = 'info', duration = 3600, action = null } = options;
  const host = ensureContainer();
  const meta = VARIANTS[variant] ?? VARIANTS.info;

  const node = document.createElement('div');
  node.className = `toast ${variant}`;
  node.innerHTML = `
    <span class="lead" style="color:${meta.color}">${icon(meta.icon, { size: 15 })}</span>
    <div class="toast-body">
      <strong></strong>
      ${description ? '<p></p>' : ''}
      ${action ? '<button class="btn btn-sm btn-ghost" style="padding:0;height:auto;margin-top:4px;color:var(--accent);font-weight:600"></button>' : ''}
    </div>
    <button class="toast-close" aria-label="Fechar notificação">${icon('x', { size: 12 })}</button>
  `;

  // Sempre via textContent: títulos podem conter nomes de arquivo com HTML.
  node.querySelector('.toast-body strong').textContent = title;
  if (description) node.querySelector('.toast-body p').textContent = description;

  const close = () => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 200);
  };

  node.querySelector('.toast-close').addEventListener('click', close);

  if (action) {
    const button = node.querySelector('.toast-body button');
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.run();
      close();
    });
  }

  host.append(node);

  // Mantém a pilha curta: remove os mais antigos.
  const all = host.querySelectorAll('.toast');
  if (all.length > MAX_TOASTS) all[0].remove();

  if (duration > 0) setTimeout(close, duration);
  return node;
}

export const notify = {
  success: (title, description) => toast(title, { description, variant: 'success' }),
  error: (title, description) => toast(title, { description, variant: 'error', duration: 5200 }),
  warning: (title, description) => toast(title, { description, variant: 'warning', duration: 4800 }),
  info: (title, description) => toast(title, { description, variant: 'info' }),
};
