/**
 * ORQUESTRADOR DA APLICAÇÃO
 * =========================
 * Responsabilidades:
 *  - montar os painéis e a barra de status;
 *  - reagir a mudanças do store recalculando o preview (sync ou Worker);
 *  - registrar atalhos de teclado, tema, accent e divisores redimensionáveis;
 *  - expor as ações usadas pela paleta de comandos e pelo header.
 *
 * Fluxo de dados (unidirecional):
 *   store (lista + pipeline + preferências)
 *     -> derive (engine pura, em Worker quando a lista é grande)
 *       -> previewPanel (render virtualizado) + statusbar
 */

import { store, configureStore, loadUserRecipes } from '../core/store.js';
import { createStep, cloneStep, STEP_META } from '../core/steps.js';
import { runPipeline } from '../core/engine.js';
import { EXAMPLES } from '../core/examples.js';
import { toast } from '../ui/toast.js';
import { createInputPanel } from '../ui/inputPanel.js';
import { createPipelinePanel } from '../ui/pipelinePanel.js';
import { createPreviewPanel } from '../ui/previewPanel.js';
import { openExportDialog } from '../ui/exportDialog.js';
import { openCommandPalette } from '../ui/commandPalette.js';
import { openRecipeDialog } from '../ui/recipeDialog.js';
import { openAbout, openShortcuts, openStats, openTimeline, openWelcome } from '../ui/dialogs.js';
import { confirmDialog, hasOpenModal } from '../ui/modal.js';
import { ACCENTS, applyAccent, applyTheme } from '../ui/theme.js';
import { icon } from '../ui/icons.js';
import { debounce, formatNumber, clamp, copyToClipboard } from '../core/utils.js';

/** Acima deste número de linhas o cálculo vai para o Web Worker. */
const WORKER_THRESHOLD = 2500;

configureStore({ createStep, cloneStep });

/* ------------------------------------------------------------------ *
 *  Shell da aplicação
 * ------------------------------------------------------------------ */

function buildShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <a class="skip-link" href="#panel-input">Pular para a lista</a>

    <header class="app-header">
      <div class="brand">
        <div class="brand-mark">${icon('wand', { size: 17 })}</div>
        <div class="brand-text">
          <div class="brand-title">
            Editor de Texto em Lote
            <span class="badge badge-accent">ULTRA v5</span>
          </div>
          <div class="brand-sub" data-brand-sub>Pipeline de nomes 100% local — nada sai do seu navegador</div>
        </div>
      </div>

      <div class="header-spacer"></div>

      <div class="header-group">
        <button class="btn btn-icon hide-mobile" data-act="undo" data-tip="Desfazer (Ctrl+Z)" aria-label="Desfazer">${icon('undo')}</button>
        <button class="btn btn-icon hide-mobile" data-act="redo" data-tip="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">${icon('redo')}</button>
      </div>

      <div class="header-divider hide-mobile"></div>

      <div class="header-group">
        <button class="btn btn-outline btn-sm hide-mobile" data-act="palette" aria-label="Abrir paleta de comandos (Ctrl+K)">
          ${icon('search')} Comandos <kbd style="margin-left:4px">Ctrl K</kbd>
        </button>
        <button class="btn btn-icon" data-act="palette-mobile" data-tip="Comandos (Ctrl+K)" aria-label="Abrir paleta de comandos" style="display:none">${icon('command')}</button>
      </div>

      <div class="header-group">
        <button class="btn btn-icon hide-mobile" data-act="accent" data-tip="Cor de destaque" aria-label="Cor de destaque">${icon('palette')}</button>
        <button class="btn btn-icon" data-act="theme" data-tip="Tema (claro/escuro/sistema)" aria-label="Alternar tema">${icon('moon')}</button>
        <button class="btn btn-icon hide-mobile" data-act="shortcuts" data-tip="Atalhos (Ctrl+/)" aria-label="Atalhos">${icon('keyboard')}</button>
      </div>

      <div class="header-divider hide-mobile"></div>

      <div class="header-group">
        <button class="btn btn-icon hide-mobile" data-act="timeline" data-tip="Timeline do histórico" aria-label="Histórico">${icon('history')}</button>
        <button class="btn btn-icon hide-mobile" data-act="stats" data-tip="Estatísticas" aria-label="Estatísticas">${icon('scale')}</button>
        <button class="btn btn-icon hide-mobile" data-act="focus" data-tip="Modo foco (Zen)" aria-label="Modo foco">${icon('maximize')}</button>
      </div>

      <button class="btn btn-primary btn-sm" data-act="export">${icon('download')} Exportar</button>
    </header>

    <div class="mobile-tabs" role="tablist" aria-label="Painéis">
      <button role="tab" data-panel="input" aria-selected="true">${icon('list')} Entrada</button>
      <button role="tab" data-panel="pipeline" aria-selected="false">${icon('workflow')} Pipeline</button>
      <button role="tab" data-panel="preview" aria-selected="false">${icon('eye')} Resultado</button>
    </div>

    <main class="workspace" data-workspace>
      <div class="panel-slot mobile-active" data-slot="input"></div>
      <div class="splitter" role="separator" aria-orientation="vertical" aria-label="Redimensionar entrada" tabindex="0" data-splitter="input"></div>
      <div class="panel-slot" data-slot="pipeline"></div>
      <div class="splitter" role="separator" aria-orientation="vertical" aria-label="Redimensionar pipeline" tabindex="0" data-splitter="pipeline"></div>
      <div class="panel-slot" data-slot="preview"></div>
    </main>

    <footer class="statusbar" role="status" aria-live="polite">
      <span class="row-flex" style="gap:5px"><span class="status-dot"></span><span data-status-engine>pronto</span></span>
      <span>Entrada: <strong data-status-input>0</strong></span>
      <span>Saída: <strong data-status-output>0</strong></span>
      <span>Alterados: <strong data-status-changed class="ok">0</strong></span>
      <span data-status-invalid-wrap hidden>Inválidos: <strong data-status-invalid class="bad">0</strong></span>
      <span>Duplicados: <strong data-status-dup class="warn">0</strong></span>
      <span class="grow"></span>
      <span data-status-time hidden></span>
      <span data-status-history>Histórico: 0</span>
      <span class="faint" data-status-mode>Nomes de arquivo</span>
      <button class="btn btn-icon" data-act="about" aria-label="Sobre o app" data-tip="Sobre" style="width:22px;height:22px">${icon('info', { size: 12 })}</button>
    </footer>
  `;

  return app;
}

/* ------------------------------------------------------------------ *
 *  Bootstrap
 * ------------------------------------------------------------------ */

export function bootstrap() {
  const app = buildShell();

  // Declarados antes de qualquer chamada que use o rótulo do tema (evita TDZ).
  const THEMES = ['dark', 'light', 'system'];
  const THEME_LABEL = { dark: 'escuro', light: 'claro', system: 'sistema' };

  const restored = store.hydrate();

  /* --------------------- Painéis --------------------- */

  const slots = {
    input: app.querySelector('[data-slot="input"]'),
    pipeline: app.querySelector('[data-slot="pipeline"]'),
    preview: app.querySelector('[data-slot="preview"]'),
  };

  const inputPanel = createInputPanel({ store, onChange: () => scheduleDerive('input') });
  const pipelinePanel = createPipelinePanel({ store, onChange: () => scheduleDerive('pipeline') });
  const previewPanel = createPreviewPanel({
    store,
    onChange: () => scheduleDerive('preview'),
    getPreview: () => lastPreview,
  });

  slots.input.append(inputPanel.element);
  slots.pipeline.append(pipelinePanel.element);
  slots.preview.append(previewPanel.element);

  /* --------------------- Tema & accent --------------------- */

  applyTheme(store.getState().preferences.theme);
  applyAccent(store.getState().preferences.accent);
  document.documentElement.classList.toggle('reduced-motion', store.getState().preferences.reducedMotion);
  updateThemeIcon();

  /* --------------------- Derivação (engine) --------------------- */

  let lastPreview = { results: [], stats: emptyStats(), usingWorker: false, durationMs: 0 };
  let worker = null;
  let workerRequestId = 0;

  function emptyStats() {
    return {
      inputLines: 0,
      outputLines: 0,
      changed: 0,
      unchanged: 0,
      removed: 0,
      duplicates: 0,
      invalid: 0,
      avgLength: 0,
      maxLength: 0,
      conflicts: 0,
    };
  }

  function engineOptions() {
    const { preferences } = store.getState();
    return {
      preserveExtension: preferences.preserveExtension,
      contentMode: preferences.contentMode,
      now: new Date(),
    };
  }

  function setEngineStatus(text, tone = '') {
    const node = app.querySelector('[data-status-engine]');
    if (!node) return;
    node.textContent = text;
    node.className = tone;
  }

  /** Calcula o preview: síncrono para listas pequenas, Worker para grandes. */
  function derive() {
    const { rows, pipeline } = store.getState();
    const options = engineOptions();

    if (rows.length === 0) {
      lastPreview = { results: [], stats: emptyStats(), usingWorker: false, durationMs: 0 };
      previewPanel.setPreview(lastPreview);
      updateStatus();
      setEngineStatus('pronto');
      return;
    }

    if (rows.length >= WORKER_THRESHOLD) {
      deriveInWorker(rows, pipeline, options);
      return;
    }

    const start = performance.now();
    try {
      const { results, stats } = runPipeline(rows, pipeline, options);
      const duration = performance.now() - start;
      lastPreview = { results, stats, usingWorker: false, durationMs: duration };
      syncStructuralChanges(results);
      previewPanel.setPreview(lastPreview);
      updateStatus();
      setEngineStatus(`pronto · ${duration.toFixed(1)} ms`);
    } catch (error) {
      console.error('[engine]', error);
      setEngineStatus('erro no pipeline', 'bad');
      toast('Erro ao processar o pipeline', { description: error.message, variant: 'error' });
    }
  }

  /**
   * Passos estruturais (ordenar, remover duplicados/vazias) mudam a ORDEM da
   * lista. Refletimos isso de volta no textarea, mas sem gerar um snapshot de
   * histórico a cada tecla — o texto é atualizado e `replaceHistory` apenas
   * corrige o snapshot atual.
   */
  function syncStructuralChanges(results) {
    const { rows } = store.getState();
    if (results.length !== rows.length) return;

    let orderChanged = false;
    for (let i = 0; i < results.length; i += 1) {
      if (results[i].id !== rows[i].id) {
        orderChanged = true;
        break;
      }
    }
    if (!orderChanged) return;

    const byId = new Map(store.getState().rows.map((row) => [row.id, row]));
    const nextRows = results
      .map((result) => byId.get(result.id))
      .filter(Boolean)
      .map((row) => ({ ...row }));
    if (nextRows.length !== rows.length) return;

    store.setRows(nextRows, 'Reordenar lista');
    inputPanel.sync();
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(new URL('../worker/engine.worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event) => {
      const data = event.data;
      // Descarta respostas obsoletas (usuário continuou editando).
      if (data.requestId !== workerRequestId) return;
      lastPreview = {
        results: data.results,
        stats: data.stats,
        usingWorker: true,
        durationMs: data.durationMs,
      };
      syncStructuralChanges(data.results);
      previewPanel.setPreview(lastPreview);
      updateStatus();
      setEngineStatus(`worker · ${data.durationMs.toFixed(1)} ms`);
    });
    worker.addEventListener('error', (error) => {
      console.error('[worker]', error);
      setEngineStatus('worker indisponível', 'warn');
      // Fallback: calcula na thread principal.
      const { rows, pipeline } = store.getState();
      const start = performance.now();
      const { results, stats } = runPipeline(rows, pipeline, engineOptions());
      lastPreview = { results, stats, usingWorker: false, durationMs: performance.now() - start };
      previewPanel.setPreview(lastPreview);
      updateStatus();
    });
    return worker;
  }

  function deriveInWorker(rows, pipeline, options) {
    setEngineStatus('calculando…', 'warn');
    workerRequestId += 1;
    ensureWorker().postMessage({ requestId: workerRequestId, rows, pipeline, options });
  }

  const scheduleDerive = debounce(derive, rowsAreBig() ? 160 : 10);

  function rowsAreBig() {
    return store.getState().rows.length >= WORKER_THRESHOLD;
  }

  /* --------------------- Barra de status --------------------- */

  function updateStatus() {
    const state = store.getState();
    const stats = lastPreview.stats ?? emptyStats();

    const put = (selector, value) => {
      const node = app.querySelector(selector);
      if (node) node.textContent = typeof value === 'number' ? formatNumber(value) : value;
    };

    put('[data-status-input]', stats.inputLines ?? state.rows.length);
    put('[data-status-output]', stats.outputLines ?? 0);
    put('[data-status-changed]', stats.changed ?? 0);
    put('[data-status-dup]', stats.duplicates ?? 0);
    put('[data-status-invalid]', stats.invalid ?? 0);

    const invalidWrap = app.querySelector('[data-status-invalid-wrap]');
    if (invalidWrap) invalidWrap.hidden = !(stats.invalid > 0 && state.preferences.contentMode === 'filenames');

    const timeNode = app.querySelector('[data-status-time]');
    if (timeNode) {
      timeNode.hidden = !lastPreview.durationMs;
      timeNode.textContent = `${lastPreview.durationMs.toFixed(1)} ms`;
    }

    const historyNode = app.querySelector('[data-status-history]');
    if (historyNode) historyNode.textContent = `Histórico: ${state.historyIndex + 1}/${state.history.length}`;

    const modeNode = app.querySelector('[data-status-mode]');
    if (modeNode) modeNode.textContent = state.preferences.contentMode === 'filenames' ? 'Nomes de arquivo' : 'Texto livre';

    const undo = app.querySelector('[data-act="undo"]');
    const redo = app.querySelector('[data-act="redo"]');
    if (undo) undo.disabled = !store.canUndo();
    if (redo) redo.disabled = !store.canRedo();

    // Rótulo do último estado no header (feedback sutil).
    const brandSub = app.querySelector('[data-brand-sub]');
    const current = state.history[state.historyIndex];
    if (brandSub) {
      brandSub.textContent = current
        ? `Última ação: ${current.label}`
        : 'Pipeline de nomes 100% local — nada sai do seu navegador';
    }

    // Título da aba reflete o trabalho em andamento.
    document.title =
      stats.changed > 0
        ? `(${formatNumber(stats.changed)}) Editor de Texto em Lote Ultra v5`
        : 'Editor de Texto em Lote Ultra v5';
  }

  /* --------------------- Ações globais --------------------- */

  const actions = {
    undo: () => {
      const label = store.undo();
      if (label === null) return;
      inputPanel.sync();
      derive();
      toast('Desfeito', { description: label, variant: 'info', duration: 2000 });
    },
    redo: () => {
      const label = store.redo();
      if (label === null) return;
      inputPanel.sync();
      derive();
      toast('Refeito', { description: label, variant: 'info', duration: 2000 });
    },
    export: () => openExportDialog({ results: lastPreview.results, stats: lastPreview.stats, store }),
    palette: () => openPalette(),
    stats: () => openStats({ results: lastPreview.results, stats: lastPreview.stats, pipeline: store.getState().pipeline }),
    shortcuts: () => openShortcuts(),
    about: () => openAbout(),
    timeline: () =>
      openTimeline({
        history: store.getState().history,
        historyIndex: store.getState().historyIndex,
        onJump: (index) => {
          store.jumpToHistory(index);
          inputPanel.sync();
          derive();
        },
      }),
    theme: () => cycleTheme(),
    accent: () => openAccentPicker(),
    focus: () => toggleFocus(),
    'copy-result': async () => {
      const text = lastPreview.results
        .filter((result) => !result.removed)
        .map((result) => result.after)
        .join('\n');
      if (!text) {
        toast('Nada para copiar', { variant: 'warning' });
        return;
      }
      const ok = await copyToClipboard(text);
      toast(ok ? 'Resultado copiado' : 'Falha ao copiar', {
        description: ok ? `${formatNumber(lastPreview.stats.outputLines)} itens` : undefined,
        variant: ok ? 'success' : 'error',
      });
    },
    'clear-all': async () => {
      if (!store.getState().rows.length) return;
      const confirmed = await confirmDialog({
        title: 'Limpar tudo?',
        message: 'A lista, o pipeline e o histórico serão apagados. Você pode desfazer com Ctrl+Z.',
        confirmLabel: 'Limpar tudo',
        danger: true,
      });
      if (!confirmed) return;
      store.clearAll();
      inputPanel.sync();
      derive();
      toast('Tudo limpo', { description: 'Ctrl+Z para desfazer', variant: 'info' });
    },
    example: () => {
      const example = EXAMPLES[Math.floor(Math.random() * (EXAMPLES.length - 1))];
      store.setSourceText(example.content, { label: `Exemplo: ${example.name}` });
      inputPanel.sync();
      derive();
      toast('Exemplo carregado', { description: example.name, variant: 'info' });
    },
    'load-recipe': () => openRecipeDialog('load', { store, onChange: () => derive() }),
    'save-recipe': () => openRecipeDialog('save', { store, onChange: () => derive() }),
    'big-list': () => {
      const big = EXAMPLES.find((example) => example.id === 'big');
      if (!big) return;
      store.setSourceText(big.content, { label: 'Exemplo: lista de 5.000 itens' });
      inputPanel.sync();
      derive();
      toast('Lista de teste carregada', {
        description: '5.000 itens — o processamento agora usa Web Worker',
        variant: 'info',
      });
    },
  };

  /* --------------------- Header / delegação --------------------- */

  app.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-act]');
    if (trigger) {
      const action = actions[trigger.dataset.act];
      if (action) {
        action();
        return;
      }
    }

    // Tabs mobile
    const tab = event.target.closest('[data-panel]');
    if (tab && tab.closest('.mobile-tabs')) {
      setMobilePanel(tab.dataset.panel);
    }
  });

  /* --------------------- Tema: ciclo e accent --------------------- */

  function updateThemeIcon() {
    const theme = store.getState().preferences.theme;
    const button = app.querySelector('[data-act="theme"]');
    if (!button) return;
    const name = theme === 'light' ? 'sun' : theme === 'system' ? 'monitor' : 'moon';
    button.innerHTML = icon(name, { size: 14 });
    button.dataset.tip = `Tema: ${THEME_LABEL[theme]}`;
  }

  function cycleTheme() {
    const current = store.getState().preferences.theme;
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    store.setPreference('theme', next);
    applyTheme(next);
    updateThemeIcon();
    toast(`Tema ${THEME_LABEL[next]}`, { duration: 1600, variant: 'info' });
  }

  function openAccentPicker() {
    const current = store.getState().preferences.accent;
    const body = document.createElement('div');
    body.innerHTML = `
      <p class="dim small" style="margin-bottom:10px">Escolha a cor de destaque da interface.</p>
      <div class="row-flex wrap" style="gap:10px">
        ${Object.entries(ACCENTS)
          .map(
            ([key, meta]) => `
          <button class="btn ${key === current ? 'btn-secondary' : 'btn-ghost'}" data-accent="${key}" style="padding:6px 10px">
            <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${meta.base}"></span>
            ${meta.label}
          </button>`,
          )
          .join('')}
      </div>
    `;

    import('../ui/modal.js').then(({ openModal }) => {
      const modal = openModal({ title: 'Cor de destaque', body, size: 'slim' });
      body.querySelectorAll('[data-accent]').forEach((button) => {
        button.addEventListener('click', () => {
          store.setPreference('accent', button.dataset.accent);
          applyAccent(button.dataset.accent);
          modal.close();
        });
      });
    });
  }

  /* --------------------- Modo foco --------------------- */

  function toggleFocus() {
    const next = !store.getState().focusMode;
    store.setUI({ focusMode: next });
    document.body.classList.toggle('focus-mode', next);
    toast(next ? 'Modo foco ativado' : 'Modo foco desativado', {
      description: next ? 'Esc para sair' : undefined,
      duration: 1800,
      variant: 'info',
    });
  }

  /* --------------------- Painéis mobile --------------------- */

  function setMobilePanel(panel) {
    store.setUI({ mobilePanel: panel });
    for (const [key, slot] of Object.entries(slots)) {
      slot.classList.toggle('mobile-active', key === panel);
    }
    app.querySelectorAll('.mobile-tabs [data-panel]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.panel === panel));
    });
  }

  // Em desktop todos os painéis aparecem; em mobile só o ativo.
  function syncMobile() {
    const isMobile = window.matchMedia('(max-width: 1024px)').matches;
    const mobilePalette = app.querySelector('[data-act="palette-mobile"]');
    if (mobilePalette) mobilePalette.style.display = isMobile ? 'inline-flex' : 'none';
    if (isMobile) {
      setMobilePanel(store.getState().mobilePanel ?? 'input');
    } else {
      // Em desktop todos os wrappers aparecem (o CSS de mobile não se aplica).
      for (const slot of Object.values(slots)) slot.classList.remove('mobile-active');
    }
  }

  window.addEventListener('resize', debounce(syncMobile, 150));
  syncMobile();

  /* --------------------- Splitters --------------------- */

  function setupSplitter(name) {
    const handle = app.querySelector(`[data-splitter="${name}"]`);
    if (!handle) return;

    const workspace = app.querySelector('[data-workspace]');
    const isInput = name === 'input';

    const apply = (value) => {
      const prefs = store.getState().preferences;
      const other = isInput ? prefs.pipelineWidth : prefs.inputWidth;
      const max = 100 - other - 18; // 18% reservado para o preview
      const next = clamp(value, 14, Math.max(18, max));
      if (isInput) store.setPreference('inputWidth', next, { skipPersist: true });
      else store.setPreference('pipelineWidth', next, { skipPersist: true });
      paintWidths();
    };

    let dragging = false;
    handle.addEventListener('pointerdown', (event) => {
      dragging = true;
      handle.classList.add('dragging');
      handle.setPointerCapture(event.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      const width = workspace.getBoundingClientRect().width;
      if (!width) return;
      const prefs = store.getState().preferences;
      const current = isInput ? prefs.inputWidth : prefs.pipelineWidth;
      apply(current + (event.movementX / width) * 100);
    });
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      store.persist();
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);

    handle.addEventListener('keydown', (event) => {
      const prefs = store.getState().preferences;
      const current = isInput ? prefs.inputWidth : prefs.pipelineWidth;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        apply(current - 2);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        apply(current + 2);
      }
    });
  }

  function paintWidths() {
    const { preferences } = store.getState();
    document.documentElement.style.setProperty('--w-input', `${preferences.inputWidth}%`);
    document.documentElement.style.setProperty('--w-pipeline', `${preferences.pipelineWidth}%`);
  }

  setupSplitter('input');
  setupSplitter('pipeline');
  paintWidths();

  /* --------------------- Paleta de comandos --------------------- */

  function paletteActions() {
    const { pipeline } = store.getState();

    return [
      { id: 'export', label: 'Exportar resultado / gerar script', group: 'Ações', hint: 'Ctrl E', icon: 'download', run: actions.export },
      { id: 'copy', label: 'Copiar resultado', group: 'Ações', hint: 'Ctrl Shift C', icon: 'copy', run: actions['copy-result'] },
      { id: 'example', label: 'Carregar lista de exemplo', group: 'Ações', hint: 'Ctrl Shift L', icon: 'sparkles', run: actions.example },
      { id: 'big', label: 'Carregar lista de 5.000 itens (teste)', group: 'Ações', icon: 'zap', run: actions['big-list'] },
      { id: 'clear', label: 'Limpar tudo', group: 'Ações', hint: 'Ctrl Shift X', icon: 'trash', run: actions['clear-all'] },
      { id: 'recipes', label: 'Abrir receitas e presets', group: 'Ações', icon: 'sparkles', run: actions['load-recipe'] },
      { id: 'save-recipe', label: 'Salvar pipeline como receita', group: 'Ações', icon: 'save', run: actions['save-recipe'] },
      { id: 'stats', label: 'Ver estatísticas', group: 'Visualizar', icon: 'scale', run: actions.stats },
      { id: 'timeline', label: 'Abrir timeline do histórico', group: 'Visualizar', hint: 'Ctrl Shift H', icon: 'history', run: actions.timeline },
      { id: 'focus', label: 'Alternar modo foco (Zen)', group: 'Visualizar', hint: 'Ctrl Shift M', icon: 'maximize', run: actions.focus },
      { id: 'theme', label: 'Alternar tema (claro/escuro/sistema)', group: 'Visualizar', icon: 'sun', run: actions.theme },
      { id: 'accent', label: 'Trocar cor de destaque', group: 'Visualizar', icon: 'palette', run: actions.accent },
      { id: 'shortcuts', label: 'Ver atalhos de teclado', group: 'Ajuda', hint: 'Ctrl /', icon: 'keyboard', run: actions.shortcuts },
      { id: 'about', label: 'Sobre o app', group: 'Ajuda', icon: 'info', run: actions.about },

      // Adicionar passos rapidamente pela paleta
      ...Object.entries(STEP_META).map(([kind, meta]) => ({
        id: `add-${kind}`,
        label: `Adicionar passo: ${meta.label}`,
        group: 'Pipeline',
        hint: meta.description.slice(0, 34),
        icon: meta.icon,
        run: () => {
          store.addStep(kind);
          derive();
        },
      })),

      // Ações por passo existente
      ...pipeline.map((step, index) => ({
        id: `goto-${step.id}`,
        label: `Editar passo ${index + 1}: ${STEP_META[step.kind]?.label ?? step.kind}`,
        group: 'Pipeline atual',
        icon: 'chevron-right',
        run: () => {
          setMobilePanelIfNeeded('pipeline');
          pipelinePanel.focusStep(step.id);
        },
      })),
    ];
  }

  function setMobilePanelIfNeeded(panel) {
    if (window.matchMedia('(max-width: 1024px)').matches) setMobilePanel(panel);
  }

  function openPalette() {
    openCommandPalette({ actions: paletteActions() });
  }

  /* --------------------- Atalhos de teclado --------------------- */

  function isEditing() {
    const element = document.activeElement;
    if (!element) return false;
    return (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable
    );
  }

  window.addEventListener('keydown', (event) => {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    // Escape: fecha modal (tratado no modal) / sai do modo foco.
    if (event.key === 'Escape' && !hasOpenModal()) {
      if (document.body.classList.contains('focus-mode')) {
        document.body.classList.remove('focus-mode');
        store.setUI({ focusMode: false });
      }
      return;
    }

    if (!ctrl) return;

    // Ctrl+K abre a paleta mesmo em inputs.
    if (key === 'k') {
      event.preventDefault();
      openPalette();
      return;
    }

    // Dentro de campos de texto, só Ctrl+Enter/Ctrl+/ e afins passam.
    if (isEditing() && key !== 'enter' && key !== '/') {
      return;
    }

    if (key === 'z' && event.shiftKey) {
      event.preventDefault();
      actions.redo();
    } else if (key === 'z') {
      event.preventDefault();
      actions.undo();
    } else if (key === 'y') {
      event.preventDefault();
      actions.redo();
    } else if (key === 'enter') {
      event.preventDefault();
      // "Aplicar": materializa o pipeline na lista original.
      applyPipeline();
    } else if (key === 'e' && event.shiftKey) {
      event.preventDefault();
      actions.example();
    } else if (key === 'e') {
      event.preventDefault();
      actions.export();
    } else if (key === 'f' && event.shiftKey) {
      event.preventDefault();
      setMobilePanelIfNeeded('preview');
      previewPanel.focusSearch();
    } else if (key === 'c' && event.shiftKey) {
      event.preventDefault();
      actions['copy-result']();
    } else if (key === 'x' && event.shiftKey) {
      event.preventDefault();
      actions['clear-all']();
    } else if (key === 'h' && event.shiftKey) {
      event.preventDefault();
      actions.timeline();
    } else if (key === 's' && event.shiftKey) {
      event.preventDefault();
      actions['save-recipe']();
    } else if (key === 'm' && event.shiftKey) {
      // Modo foco (Zen) em Ctrl+Shift+M: Ctrl+Shift+Z já é "refazer",
      // e atalhos de sistema como janela minimizada ficam fora do padrão web.
      event.preventDefault();
      actions.focus();
    } else if (key === '/') {
      event.preventDefault();
      actions.shortcuts();
    } else if (key === '1' && event.altKey) {
      event.preventDefault();
      setMobilePanelIfNeeded('input');
      inputPanel.focus();
    } else if (key === '2' && event.altKey) {
      event.preventDefault();
      setMobilePanelIfNeeded('pipeline');
    } else if (key === '3' && event.altKey) {
      event.preventDefault();
      setMobilePanelIfNeeded('preview');
    }
  });

  /**
   * "Aplicar" = transformar o resultado em nova entrada.
   * Isso é útil para congelar o estado e seguir trabalhando em outra etapa.
   */
  function applyPipeline() {
    const results = lastPreview.results;
    if (!results.length) {
      toast('Nada para aplicar', { description: 'A lista está vazia', variant: 'warning' });
      return;
    }
    const text = results
      .filter((result) => !result.removed)
      .map((result) => result.after)
      .join('\n');

    store.setSourceText(text, { label: 'Aplicar pipeline na lista' });
    store.setPipeline([], 'Aplicar pipeline na lista');
    inputPanel.sync();
    derive();
    toast('Pipeline aplicado', {
      description: 'O resultado virou a nova lista e os passos foram limpos',
      variant: 'success',
    });
  }

  /* --------------------- Assinatura do store --------------------- */

  store.subscribe(() => {
    updateStatus();
    paintWidths();
    // O preview é recalculado sempre que lista/pipeline/preferências mudam.
    scheduleDerive();
  });

  /* --------------------- Primeira renderização --------------------- */

  derive();
  updateStatus();

  if (restored) {
    toast('Sessão restaurada', {
      description: `${formatNumber(store.getState().rows.length)} item(ns) e ${store.getState().pipeline.length} passo(s) recuperados`,
      variant: 'info',
      duration: 3000,
    });
  }

  const seenWelcome = localStorage.getItem('editor-texto-lote-v5-welcome');
  if (!seenWelcome) {
    localStorage.setItem('editor-texto-lote-v5-welcome', '1');
    setTimeout(() => {
      openWelcome({
        onExample: actions.example,
        onDocs: actions.shortcuts,
      });
    }, 420);
  }

  // Ganchos para depuração/plugins (mantém a API pequena e explícita).
  window.EditorLote = {
    store,
    derive,
    actions,
    getPreview: () => lastPreview,
    openPalette,
    openExport: actions.export,
    version: '5.0.0',
    recipes: () => loadUserRecipes(),
  };
}
