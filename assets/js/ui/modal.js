/**
 * Gerenciador de modais acessível.
 *
 * - `role="dialog"` + `aria-modal`
 * - focus trap (Tab cicla dentro), restauração de foco ao fechar
 * - fecha com Escape e clique no backdrop
 * - apenas um modal "principal" por vez (a paleta de comandos é um caso à parte)
 */

import { icon } from './icons.js';

const stack = [];

function focusables(root) {
  return Array.from(
    root.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);
}

let keyHandlerBound = false;

function bindKeys() {
  if (keyHandlerBound) return;
  keyHandlerBound = true;

  document.addEventListener(
    'keydown',
    (event) => {
      const top = stack[stack.length - 1];
      if (!top) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        top.close();
        return;
      }

      if (event.key !== 'Tab') return;
      const items = focusables(top.element);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    true,
  );
}

/**
 * Abre um modal a partir de uma definição declarativa.
 *
 * @param {{
 *   title: string, description?: string, size?: 'default'|'wide'|'slim',
 *   body: string|Node, footer?: string|Node, bare?: boolean,
 *   onMount?: (root: HTMLElement, api: { close: Function }) => void,
 *   onClose?: Function, initialFocus?: string
 * }} options
 */
export function openModal(options) {
  bindKeys();

  const { title, description = '', size = 'default', body, footer = null, bare = false, onMount, onClose, initialFocus } = options;

  const previouslyFocused = document.activeElement;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop open';
  backdrop.innerHTML = `
    <div class="modal ${size === 'wide' ? 'wide' : size === 'slim' ? 'slim' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head">
        <div>
          <h2 id="modal-title"></h2>
          ${description ? '<p></p>' : ''}
        </div>
        <button class="btn btn-icon" data-close aria-label="Fechar">${icon('x', { size: 15 })}</button>
      </div>
      <div class="modal-body ${bare ? 'flush' : ''}"></div>
      ${footer ? '<div class="modal-foot"></div>' : ''}
    </div>
  `;

  backdrop.querySelector('h2').textContent = title;
  if (description) backdrop.querySelector('.modal-head p').textContent = description;

  const bodyHost = backdrop.querySelector('.modal-body');
  if (body instanceof Node) bodyHost.append(body);
  else bodyHost.innerHTML = body;

  if (footer) {
    const footerHost = backdrop.querySelector('.modal-foot');
    if (footer instanceof Node) footerHost.append(footer);
    else footerHost.innerHTML = footer;
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('open');
    backdrop.remove();
    const index = stack.findIndex((entry) => entry.element === backdrop);
    if (index >= 0) stack.splice(index, 1);
    if (!stack.length) document.body.style.removeProperty('overflow');
    onClose?.();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
  };

  backdrop.querySelector('[data-close]').addEventListener('click', close);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close();
  });

  document.body.append(backdrop);
  document.body.style.overflow = 'hidden';
  stack.push({ element: backdrop, close });

  // Foco inicial: campo indicado, primeiro input ou o container.
  requestAnimationFrame(() => {
    const target =
      (initialFocus && backdrop.querySelector(initialFocus)) ||
      backdrop.querySelector('input, textarea, select') ||
      focusables(backdrop)[0];
    target?.focus({ preventScroll: true });
  });

  onMount?.(backdrop, { close });
  return { element: backdrop, close };
}

/** Fecha o modal mais recente (usado por atalhos globais). */
export function closeTopModal() {
  const top = stack[stack.length - 1];
  if (top) {
    top.close();
    return true;
  }
  return false;
}

export function hasOpenModal() {
  return stack.length > 0;
}

/* --------------------------- Helpers de UI --------------------------- */

/** Cria um elemento a partir de HTML (retorna o primeiro filho). */
export function h(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/** Modal de confirmação com promessa — evita callbacks aninhados. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let resolved = false;
    const api = openModal({
      title,
      size: 'slim',
      body: `<p class="dim" style="font-size:12.5px;line-height:1.6"></p>`,
      footer: `
        <button class="btn btn-secondary" data-cancel>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${confirmLabel}</button>
      `,
      onClose: () => {
        if (!resolved) resolve(false);
      },
      onMount: (root, { close }) => {
        root.querySelector('.dim').textContent = message;
        root.querySelector('[data-cancel]').addEventListener('click', close);
        root.querySelector('[data-confirm]').addEventListener('click', () => {
          resolved = true;
          resolve(true);
          close();
        });
      },
    });
    void api;
  });
}
