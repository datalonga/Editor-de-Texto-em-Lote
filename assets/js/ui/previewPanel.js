/**
 * Painel de resultado: lista virtualizada + diff + estatísticas.
 *
 * VIRTUALIZAÇÃO (implementação própria, ~120 linhas)
 * Só renderizamos as linhas visíveis (+ overscan). Isso permite 100k linhas a
 * 60fps sem nenhuma biblioteca. Estratégia:
 *   - container com altura total = linhas * alturaDaLinha
 *   - cada linha posicionada com `translateY`, reciclada a cada scroll
 *   - um "pool" de nós evita criar/destruir elementos
 */

import { icon } from './icons.js';
import { toast } from './toast.js';
import { escapeHtml, formatNumber, debounce, copyToClipboard } from '../core/utils.js';
import { openCompare } from './compareDialog.js';

const ROW_HEIGHT = 30;
const OVERSCAN = 8;

export function createPreviewPanel({ store, onChange, getPreview }) {
  const root = document.createElement('section');
  root.className = 'panel';
  root.id = 'panel-preview';
  root.setAttribute('aria-label', 'Resultado do processamento');

  root.innerHTML = `
    <div class="panel-header">
      ${icon('eye', { size: 14 })}
      <h2 class="panel-title">Resultado</h2>
      <span class="badge" data-changed-badge hidden></span>
      <span class="badge badge-info" data-worker-badge hidden title="Processado em Web Worker">${icon('zap', { size: 10 })} worker</span>
      <div class="panel-spacer"></div>
      <button class="btn btn-icon" data-action="copy" data-tip="Copiar resultado" aria-label="Copiar resultado">${icon('copy')}</button>
      <button class="btn btn-icon" data-action="toggle-removed" data-tip="Mostrar/ocultar removidos" aria-label="Mostrar ou ocultar removidos">${icon('eye')}</button>
      <button class="btn btn-icon" data-action="compare" data-tip="Comparar lado a lado" aria-label="Comparar">${icon('scale')}</button>
    </div>

    <div class="preview-toolbar">
      <div class="search-wrap">
        ${icon('search', { size: 13 })}
        <input class="input" data-search type="search" placeholder="Filtrar itens… (Ctrl+Shift+F)" aria-label="Filtrar itens" />
        <button class="search-clear" data-action="clear-search" aria-label="Limpar filtro" hidden>${icon('x', { size: 11 })}</button>
      </div>
      <div class="filter-chips" role="group" aria-label="Filtro de linhas">
        <button data-filter="all" aria-pressed="true">Todos</button>
        <button data-filter="changed" aria-pressed="false">Alterados</button>
        <button data-filter="issues" aria-pressed="false">Problemas</button>
        <button data-filter="removed" aria-pressed="false">Removidos</button>
      </div>
    </div>

    <div class="list-scroll" data-scroll tabindex="0" role="region" aria-label="Lista de resultados">
      <div class="list-head" aria-hidden="true">
        <span>#</span>
        <span></span>
        <span>Original</span>
        <span></span>
        <span>Novo</span>
        <span>Status</span>
      </div>
      <div class="list-body" data-body></div>
      <div data-empty-preview hidden></div>
    </div>

    <div class="warn-bar" data-warn hidden>${icon('file-warning')}<span data-warn-text></span></div>

    <div class="list-footer">
      <div class="stat"><b data-stat="input">0</b><span>Entrada</span></div>
      <div class="stat accent"><b data-stat="output">0</b><span>Saída</span></div>
      <div class="stat success"><b data-stat="changed">0</b><span>Alterados</span></div>
      <div class="stat warning"><b data-stat="removed">0</b><span>Removidos</span></div>
      <div class="stat warning"><b data-stat="duplicates">0</b><span>Duplicados</span></div>
      <div class="stat danger"><b data-stat="invalid">0</b><span>Inválidos</span></div>
    </div>
  `;

  const body = root.querySelector('[data-body]');
  const scroll = root.querySelector('[data-scroll]');
  const emptyBox = root.querySelector("[data-empty-preview]");
  const searchInput = root.querySelector('[data-search]');
  const clearSearch = root.querySelector('[data-action="clear-search"]');
  const changedBadge = root.querySelector('[data-changed-badge]');
  const workerBadge = root.querySelector('[data-worker-badge]');
  const warnBar = root.querySelector('[data-warn]');
  const warnText = root.querySelector('[data-warn-text]');

  /** @type {{filtered: object[], preview: object}} */
  let view = { filtered: [], preview: { results: [], stats: {} } };
  let rendered = new Map(); // index -> element
  let lastRange = { start: -1, end: -1 };
  let filter = 'all';

  /* ------------------------- Filtro & busca ------------------------- */

  function computeFiltered() {
    const { preview } = view;
    const query = store.getState().searchQuery.trim().toLowerCase();
    const showRemoved = store.getState().preferences.showRemoved;

    return preview.results.filter((result) => {
      if (!showRemoved && result.removed) return false;
      if (filter === 'changed' && !result.changed) return false;
      if (filter === 'issues' && result.issues.length === 0) return false;
      if (filter === 'removed' && !result.removed) return false;
      if (!query) return true;
      return result.before.toLowerCase().includes(query) || result.after.toLowerCase().includes(query);
    });
  }

  /* --------------------------- Virtualização ------------------------- */

  function createRow() {
    const node = document.createElement('div');
    node.className = 'row';
    node.innerHTML = `
      <span class="row-num"></span>
      <button class="row-lock" aria-label="Travar linha">${icon('lock', { size: 11 })}</button>
      <span class="cell cell-before"></span>
      <span class="cell-arrow">${icon('arrow-right', { size: 11 })}</span>
      <span class="cell cell-after"></span>
      <span class="row-status"></span>
    `;
    node.querySelector('.row-lock').addEventListener('click', (event) => {
      event.stopPropagation();
      const id = node.dataset.rowId;
      if (id) {
        store.toggleRowLock(id);
        renderRows(true);
      }
    });
    node.addEventListener('click', (event) => {
      const id = node.dataset.rowId;
      if (!id) return;
      store.toggleRowSelect(id, event.shiftKey || event.metaKey || event.ctrlKey);
    });
    return node;
  }

  /** Renderiza o highlight de diff de forma barata (prefixo/sufixo comum). */
  function diffHtml(before, after) {
    if (before === after) return escapeHtml(after);

    const max = Math.min(before.length, after.length);
    let prefix = 0;
    while (prefix < max && before[prefix] === after[prefix]) prefix += 1;

    let suffix = 0;
    while (suffix < max - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;

    const head = after.slice(0, prefix);
    const mid = after.slice(prefix, after.length - suffix);
    const tail = suffix ? after.slice(after.length - suffix) : '';

    return `${escapeHtml(head)}<mark>${escapeHtml(mid || '∅')}</mark>${escapeHtml(tail)}`;
  }

  function fillRow(node, result, index) {
    const selected = store.getState().rows.find((row) => row.id === result.id)?.selected;
    node.dataset.rowId = result.id;
    node.className = `row ${result.removed ? 'removed' : ''} ${selected ? 'selected' : ''}`;
    node.style.transform = `translateY(${index * ROW_HEIGHT}px)`;

    node.querySelector('.row-num').textContent = index + 1;

    const lock = node.querySelector('.row-lock');
    lock.classList.toggle('locked', Boolean(result.locked));
    lock.setAttribute('aria-label', result.locked ? 'Destravar linha' : 'Travar linha');
    lock.innerHTML = icon(result.locked ? 'lock' : 'unlock', { size: 11 });

    const beforeCell = node.querySelector('.cell-before');
    beforeCell.textContent = result.before || '(vazio)';
    beforeCell.title = result.before;

    const afterCell = node.querySelector('.cell-after');
    afterCell.innerHTML = result.changed ? diffHtml(result.before, result.after) : escapeHtml(result.after);
    afterCell.title = result.after;

    const status = node.querySelector('.row-status');
    if (result.removed) {
      status.innerHTML = `<span class="badge badge-danger">removido</span>`;
    } else if (result.issues.some((issue) => issue.severity === 'error')) {
      status.innerHTML = `<span class="status-error" title="${escapeHtml(result.issues.map((i) => i.message).join(' · '))}">${icon('x-circle', { size: 12 })}</span>`;
    } else if (result.issues.length) {
      status.innerHTML = `<span class="status-warn" title="${escapeHtml(result.issues.map((i) => i.message).join(' · '))}">${icon('alert-triangle', { size: 12 })}</span>`;
    } else if (result.changed) {
      status.innerHTML = `<span class="status-ok" title="Alterado">${icon('check', { size: 12 })}</span>`;
    } else {
      status.innerHTML = '';
    }
  }

  /** Atualiza somente as linhas na janela visível (reciclando nós). */
  function renderRows(force = false) {
    const total = view.filtered.length;
    body.style.height = `${total * ROW_HEIGHT}px`;

    if (!total) {
      rendered.forEach((node) => node.remove());
      rendered.clear();
      return;
    }

    const scrollTop = scroll.scrollTop;
    const viewport = scroll.clientHeight || 400;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(total, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);

    if (!force && start === lastRange.start && end === lastRange.end) {
      // Mesma janela: só atualiza conteúdo (mudanças de seleção/diff).
      for (let i = start; i < end; i += 1) {
        const node = rendered.get(i);
        if (node) fillRow(node, view.filtered[i], i);
      }
      return;
    }

    // Remove nós fora da janela
    for (const [index, node] of rendered) {
      if (index < start || index >= end) {
        node.remove();
        rendered.delete(index);
      }
    }

    // Cria/reaproveita nós dentro da janela
    for (let i = start; i < end; i += 1) {
      let node = rendered.get(i);
      if (!node) {
        node = createRow();
        body.append(node);
        rendered.set(i, node);
      }
      fillRow(node, view.filtered[i], i);
    }

    lastRange = { start, end };
  }

  const onScroll = () => renderRows();

  // requestAnimationFrame evita múltiplos renders por frame no scroll rápido.
  let scrollScheduled = false;
  scroll.addEventListener(
    'scroll',
    () => {
      if (scrollScheduled) return;
      scrollScheduled = true;
      requestAnimationFrame(() => {
        scrollScheduled = false;
        onScroll();
      });
    },
    { passive: true },
  );

  const onResize = debounce(() => renderRows(true), 120);
  window.addEventListener('resize', onResize);

  /* ----------------------------- Render ----------------------------- */

  function renderEmpty() {
    const { preview } = view;
    const hasRows = preview.results.length > 0;

    if (store.getState().rows.length === 0) {
      emptyBox.hidden = false;
      emptyBox.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${icon('sparkles', { size: 20 })}</div>
          <h3>A prévia aparece aqui</h3>
          <p>Cole nomes na entrada e adicione passos ao pipeline. Tudo é calculado localmente, em tempo real.</p>
        </div>
      `;
      body.innerHTML = '';
      return;
    }

    if (!hasRows || view.filtered.length === 0) {
      emptyBox.hidden = false;
      const query = store.getState().searchQuery;
      emptyBox.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${icon('search', { size: 20 })}</div>
          <h3>Nenhum item corresponde ao filtro</h3>
          <p>${query ? `Nada encontrado para "${escapeHtml(query)}".` : 'Tente outro filtro.'}</p>
          <div class="empty-actions">
            <button class="btn btn-sm btn-ghost" data-clear-filters>Limpar filtros</button>
          </div>
        </div>
      `;
      emptyBox.querySelector('[data-clear-filters]')?.addEventListener('click', () => {
        searchInput.value = '';
        store.setUI({ searchQuery: '' });
        setFilter('all');
      });
      body.innerHTML = '';
      return;
    }

    emptyBox.hidden = true;
  }

  function setFilter(next) {
    filter = next;
    root.querySelectorAll('[data-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.filter === next));
    });
    view.filtered = computeFiltered();
    lastRange = { start: -1, end: -1 };
    renderRows(true);
    renderEmpty();
  }

  function renderStats() {
    const stats = view.preview.stats ?? {};
    const put = (key, value) => {
      const node = root.querySelector(`[data-stat="${key}"]`);
      if (node) node.textContent = formatNumber(value ?? 0);
    };
    put('input', stats.inputLines);
    put('output', stats.outputLines);
    put('changed', stats.changed);
    put('removed', stats.removed);
    put('duplicates', stats.duplicates);
    put('invalid', stats.invalid);

    changedBadge.hidden = !stats.changed;
    changedBadge.textContent = `${formatNumber(stats.changed)} alterado(s)`;
    changedBadge.className = `badge ${stats.changed ? 'badge-accent' : ''}`;

    const invalid = stats.invalid ?? 0;
    const isFilenames = store.getState().preferences.contentMode === 'filenames';
    warnBar.hidden = !(invalid > 0 && isFilenames);
    if (!warnBar.hidden) {
      warnText.textContent = `${formatNumber(invalid)} nome(s) inválido(s) para o sistema de arquivos — corrija antes de aplicar.`;
    }

    workerBadge.hidden = !view.preview.usingWorker;
  }

  function render() {
    const state = store.getState();
    searchInput.value = state.searchQuery;
    clearSearch.hidden = !state.searchQuery;

    view.filtered = computeFiltered();
    lastRange = { start: -1, end: -1 };
    renderRows(true);
    renderEmpty();
    renderStats();
  }

  /** Chamado pelo app quando um novo preview é calculado. */
  function setPreview(preview) {
    const keepScroll = scroll.scrollTop;
    view.preview = preview;
    view.filtered = computeFiltered();
    lastRange = { start: -1, end: -1 };
    body.innerHTML = '';
    rendered.clear();
    renderRows(true);
    // Preserva a posição de leitura: recalcular a cada tecla não deve jogar o
    // usuário de volta ao topo da lista.
    if (scroll.scrollTop !== keepScroll) scroll.scrollTop = keepScroll;
    renderEmpty();
    renderStats();
  }

  /* ----------------------------- Eventos ----------------------------- */

  const onSearch = debounce(() => {
    store.setUI({ searchQuery: searchInput.value });
    view.filtered = computeFiltered();
    lastRange = { start: -1, end: -1 };
    body.innerHTML = '';
    rendered.clear();
    renderRows(true);
    renderEmpty();
  }, 120);

  searchInput.addEventListener('input', () => {
    clearSearch.hidden = !searchInput.value;
    onSearch();
  });

  root.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => setFilter(button.dataset.filter));
  });

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'clear-search') {
      searchInput.value = '';
      store.setUI({ searchQuery: '' });
      clearSearch.hidden = true;
      onSearch.flush();
      searchInput.focus();
    } else if (action === 'copy') {
      const text = view.preview.results
        .filter((result) => !result.removed)
        .map((result) => result.after)
        .join('\n');
      if (!text) {
        toast('Nada para copiar', { variant: 'warning' });
        return;
      }
      const ok = await copyToClipboard(text);
      toast(ok ? 'Lista copiada!' : 'Falha ao copiar', {
        description: ok ? `${formatNumber(view.preview.stats.outputLines)} itens` : undefined,
        variant: ok ? 'success' : 'error',
      });
    } else if (action === 'toggle-removed') {
      store.setPreference('showRemoved', !store.getState().preferences.showRemoved);
      onChange?.('toggle-removed');
    } else if (action === 'compare') {
      openCompare({ results: view.preview.results });
    }
  });

  const unsubscribe = store.subscribe(() => {
    // Só re-renderiza a lista quando algo visual relevante muda.
    render();
  });

  return {
    element: root,
    setPreview,
    render,
    focusSearch: () => searchInput.focus(),
    scrollToTop: () => {
      scroll.scrollTop = 0;
      renderRows(true);
    },
    destroy: () => {
      unsubscribe();
      window.removeEventListener('resize', onResize);
    },
  };
}
