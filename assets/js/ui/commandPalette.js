/**
 * Command palette (Ctrl+K).
 *
 * Ações são registradas pelo app (não pelo módulo) para que a paleta não
 * conheça detalhes de implementação — fácil de estender e testar.
 */

import { openModal } from './modal.js';
import { icon } from './icons.js';
import { escapeHtml } from '../core/utils.js';

/**
 * @param {{ actions: {id:string,label:string,group?:string,hint?:string,icon?:string,run:Function}[], initialQuery?: string }} config
 */
export function openCommandPalette({ actions, initialQuery = '' }) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="cmdk-input">
      ${icon('search', { size: 15 })}
      <input type="text" placeholder="Digite um comando…" aria-label="Buscar comando" autocomplete="off" />
      <kbd>Esc</kbd>
    </div>
    <div class="cmdk-list" role="listbox" aria-label="Comandos"></div>
  `;

  const input = body.querySelector('input');
  const list = body.querySelector('.cmdk-list');

  let filtered = actions;
  let activeIndex = 0;

  const modal = openModal({
    title: 'Paleta de comandos',
    body,
    bare: true,
    initialFocus: '.cmdk-input input',
  });

  // Esconde o cabeçalho padrão: a paleta usa o próprio campo de busca.
  modal.element.querySelector('.modal-head').style.display = 'none';

  function renderList() {
    if (!filtered.length) {
      list.innerHTML = `<p class="cmdk-empty">Nenhum comando encontrado.</p>`;
      return;
    }

    let lastGroup = null;
    list.innerHTML = filtered
      .map((action, index) => {
        const group = action.group ?? 'Geral';
        const header = group !== lastGroup ? `<div class="cmdk-group">${escapeHtml(group)}</div>` : '';
        lastGroup = group;
        return `${header}
          <button class="cmdk-item" role="option" aria-selected="${index === activeIndex}" data-index="${index}">
            ${icon(action.icon ?? 'sparkles', { size: 14 })}
            <span>${escapeHtml(action.label)}</span>
            ${action.hint ? `<span class="hint">${escapeHtml(action.hint)}</span>` : ''}
          </button>`;
      })
      .join('');

    list.querySelectorAll('[data-index]').forEach((button) => {
      button.addEventListener('click', () => run(Number(button.dataset.index)));
      button.addEventListener('mouseenter', () => {
        activeIndex = Number(button.dataset.index);
        highlight();
      });
    });
  }

  function highlight() {
    list.querySelectorAll('[data-index]').forEach((button) => {
      button.setAttribute('aria-selected', String(Number(button.dataset.index) === activeIndex));
    });
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  function filterActions(query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return actions;
    return actions.filter((action) => {
      const haystack = `${action.label} ${action.group ?? ''} ${action.hint ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }

  function run(index) {
    const action = filtered[index];
    if (!action) return;
    modal.close();
    // Executa após o fechamento para o foco voltar corretamente.
    setTimeout(() => action.run(), 10);
  }

  input.value = initialQuery;
  filtered = filterActions(initialQuery);
  renderList();

  input.addEventListener('input', () => {
    filtered = filterActions(input.value);
    activeIndex = 0;
    renderList();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
      highlight();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlight();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(activeIndex);
    }
  });

  return modal;
}
