/**
 * STORE CENTRAL (state management sem framework)
 * ==============================================
 * Implementação minúscula de store observável com:
 *  - `getState()` / `setState(patch, meta)` — meta alimenta o histórico
 *  - `subscribe(fn)` — notificação única por transação
 *  - `select(fn)` — assinatura em um recorte do estado (evita re-render inútil)
 *
 * Por que não uma lib? O estado é pequeno e o app é vanilla; um store próprio de
 * ~80 linhas elimina 30kB de dependência e mantém o controle do undo/redo.
 *
 * O store guarda o "estado do usuário" (lista + pipeline + preferências).
 * O resultado do pipeline é sempre derivado (ver app/derive.js).
 */

import { parseTextToRows, rowsToText } from '../core/parser.js';
import { normalizeStep } from '../core/steps.js';
import { uid } from '../core/utils.js';

const STORAGE_KEY = 'editor-texto-lote-v5';
const STORAGE_VERSION = 1;
const HISTORY_LIMIT = 120;

const DEFAULT_PREFERENCES = {
  theme: 'system', // dark | light | system (padrão: respeita o SO)
  accent: 'violet',
  preserveExtension: true,
  contentMode: 'filenames', // filenames | text
  reducedMotion: false,
  inputWidth: 30, // % do painel de entrada
  pipelineWidth: 32, // % do painel de pipeline
  showRemoved: true,
};

function initialState() {
  return {
    /** @type {{id:string, originalName:string, extension:string, preserveExt:boolean|null, selected:boolean, locked:boolean}[]} */
    rows: [],
    /** @type {object[]} passos do pipeline */
    pipeline: [],
    preferences: { ...DEFAULT_PREFERENCES },

    /* histórico (snapshots imutáveis) */
    history: [],
    historyIndex: -1,

    /* UI */
    activeStepId: null,
    searchQuery: '',
    rowFilter: 'all',
    focusMode: false,
    mobilePanel: 'input',
    sourceText: '',
  };
}

export class Store {
  constructor() {
    this.state = initialState();
    this.listeners = new Set();
    this.batchDepth = 0;
    this.batching = false;
  }

  /* ------------------------------ API base ------------------------------ */

  getState() {
    return this.state;
  }

  /**
   * Atualiza o estado e notifica assinantes uma única vez.
   * @param {object|((state:object)=>object)} patch
   * @param {{ silent?: boolean }} [meta]
   */
  setState(patch, meta = {}) {
    const next = typeof patch === 'function' ? patch(this.state) : patch;
    if (!next) return;
    this.state = { ...this.state, ...next };
    if (!meta.silent) this.emit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    if (this.batchDepth > 0) {
      this.batching = true;
      return;
    }
    for (const listener of this.listeners) listener(this.state);
  }

  /** Agrupa várias mudanças em uma notificação (mais fluido no drag). */
  batch(fn) {
    this.batchDepth += 1;
    try {
      fn();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.batching) {
        this.batching = false;
        this.emit();
      }
    }
  }

  /* ------------------------------ Lista ------------------------------ */

  /**
   * Define a lista a partir do texto (fonte da verdade da entrada).
   * @param {string} text
   * @param {{ skipHistory?: boolean, label?: string }} [options]
   */
  setSourceText(text, options = {}) {
    const rows = parseTextToRows(text, { removeEmpty: true });
    this.setState({ rows, sourceText: text });
    if (!options.skipHistory) this.pushHistory(options.label ?? 'Editar lista');
  }

  appendRows(newRows, label = 'Adicionar itens') {
    this.setState((state) => ({ rows: [...state.rows, ...newRows] }));
    this.pushHistory(label);
  }

  /**
   * Substitui a lista inteira já estruturada (ex.: reordenação causada por um
   * passo de sort). Mantém `sourceText` em sincronia para que o textarea e a
   * persistência reflitam a nova ordem.
   */
  setRows(rows, label = 'Reordenar lista') {
    this.setState({ rows, sourceText: rowsToText(rows) });
    this.pushHistory(label);
  }

  clearAll() {
    this.setState({ rows: [], sourceText: '', pipeline: [], activeStepId: null, searchQuery: '' });
    this.pushHistory('Limpar tudo');
  }

  toggleRowLock(id) {
    this.setState((state) => ({
      rows: state.rows.map((row) => (row.id === id ? { ...row, locked: !row.locked } : row)),
    }));
  }

  toggleRowPreserve(id) {
    this.setState((state) => ({
      rows: state.rows.map((row) =>
        row.id === id
          ? { ...row, preserveExt: row.preserveExt === null ? !state.preferences.preserveExtension : !row.preserveExt }
          : row,
      ),
    }));
  }

  toggleRowSelect(id, additive = false) {
    this.setState((state) => ({
      rows: state.rows.map((row) =>
        row.id === id
          ? { ...row, selected: additive ? !row.selected : true }
          : additive
            ? row
            : { ...row, selected: false },
      ),
    }));
  }

  selectAll(value) {
    this.setState((state) => ({ rows: state.rows.map((row) => ({ ...row, selected: value })) }));
  }

  deleteSelectedRows() {
    const count = this.state.rows.filter((row) => row.selected).length;
    if (!count) return 0;
    this.setState((state) => ({ rows: state.rows.filter((row) => !row.selected) }));
    this.pushHistory(`Remover ${count} linha(s)`);
    return count;
  }

  getSelectedIds() {
    return this.state.rows.filter((row) => row.selected).map((row) => row.id);
  }

  /* ----------------------------- Pipeline ---------------------------- */

  addStep(kind, atIndex = null) {
    const { createStep } = this.stepFactory;
    const step = createStep(kind);
    this.setState((state) => {
      const pipeline = [...state.pipeline];
      pipeline.splice(atIndex ?? pipeline.length, 0, step);
      return { pipeline, activeStepId: step.id };
    });
    this.pushHistory('Adicionar passo');
    return step;
  }

  updateStep(id, patch, options = {}) {
    this.setState((state) => ({
      pipeline: state.pipeline.map((step) => (step.id === id ? { ...step, ...patch } : step)),
    }));
    // Passos com muitos campos (slider, digitação) não precisam poluir o histórico.
    if (!options.skipHistory) this.pushHistory('Editar passo');
  }

  removeStep(id) {
    this.setState((state) => ({
      pipeline: state.pipeline.filter((step) => step.id !== id),
      activeStepId: state.activeStepId === id ? null : state.activeStepId,
    }));
    this.pushHistory('Remover passo');
  }

  duplicateStep(id) {
    const index = this.state.pipeline.findIndex((step) => step.id === id);
    if (index === -1) return;
    const { cloneStep } = this.stepFactory;
    const clone = cloneStep(this.state.pipeline[index]);
    this.setState((state) => {
      const pipeline = [...state.pipeline];
      pipeline.splice(index + 1, 0, clone);
      return { pipeline, activeStepId: clone.id };
    });
    this.pushHistory('Duplicar passo');
  }

  moveStep(id, delta) {
    const index = this.state.pipeline.findIndex((step) => step.id === id);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= this.state.pipeline.length) return;
    this.reorderSteps(index, target);
  }

  reorderSteps(from, to) {
    if (from === to || from < 0 || to < 0) return;
    this.setState((state) => {
      const pipeline = [...state.pipeline];
      const [moved] = pipeline.splice(from, 1);
      pipeline.splice(to, 0, moved);
      return { pipeline };
    });
    this.pushHistory('Reordenar pipeline');
  }

  toggleStep(id) {
    this.setState((state) => ({
      pipeline: state.pipeline.map((step) => (step.id === id ? { ...step, enabled: !step.enabled } : step)),
    }));
  }

  clearPipeline() {
    this.setState({ pipeline: [], activeStepId: null });
    this.pushHistory('Limpar pipeline');
  }

  /**
   * Carrega um pipeline (receita) normalizando cada passo.
   * Passos desconhecidos são descartados — importar receita nunca deve quebrar.
   */
  setPipeline(steps, label = 'Carregar receita') {
    const pipeline = (steps ?? []).map(normalizeStep).filter(Boolean);
    this.setState({ pipeline, activeStepId: pipeline[0]?.id ?? null });
    this.pushHistory(label);
    return pipeline;
  }

  setActiveStep(id) {
    this.setState({ activeStepId: id });
  }

  /* --------------------------- Preferências -------------------------- */

  setPreference(key, value, options = {}) {
    this.setState((state) => ({ preferences: { ...state.preferences, [key]: value } }));
    if (!options.skipPersist) this.persistSoon();
  }

  /* ----------------------------- Histórico --------------------------- */

  /**
   * Cria um snapshot do estado atual (lista + pipeline + preservação).
   * Snapshots são imutáveis: nunca referenciamos objetos mutáveis do state.
   */
  pushHistory(label) {
    const state = this.state;
    const snapshot = {
      label,
      timestamp: Date.now(),
      text: rowsToText(state.rows),
      pipeline: JSON.parse(JSON.stringify(state.pipeline)),
      preserveExtension: state.preferences.preserveExtension,
      contentMode: state.preferences.contentMode,
    };

    const base = state.history.slice(0, state.historyIndex + 1);
    base.push(snapshot);
    const overflow = Math.max(0, base.length - HISTORY_LIMIT);
    const history = overflow ? base.slice(overflow) : base;

    this.setState({ history, historyIndex: history.length - 1 }, { silent: true });
    this.emit();
    this.persistSoon();
  }

  /** Substitui o snapshot atual em vez de criar um novo (ex.: digitação). */
  replaceHistory(label) {
    const state = this.state;
    if (state.historyIndex < 0) return this.pushHistory(label);
    const history = [...state.history];
    history[state.historyIndex] = {
      label,
      timestamp: Date.now(),
      text: rowsToText(state.rows),
      pipeline: JSON.parse(JSON.stringify(state.pipeline)),
      preserveExtension: state.preferences.preserveExtension,
      contentMode: state.preferences.contentMode,
    };
    this.setState({ history }, { silent: true });
    this.emit();
    this.persistSoon();
  }

  canUndo() {
    return this.state.historyIndex > 0;
  }

  canRedo() {
    return this.state.historyIndex < this.state.history.length - 1;
  }

  undo() {
    if (!this.canUndo()) return null;
    const index = this.state.historyIndex - 1;
    this.applySnapshot(index);
    return this.state.history[index + 1]?.label ?? null;
  }

  redo() {
    if (!this.canRedo()) return null;
    const index = this.state.historyIndex + 1;
    this.applySnapshot(index);
    return this.state.history[index]?.label ?? null;
  }

  jumpToHistory(index) {
    if (index < 0 || index >= this.state.history.length) return;
    this.applySnapshot(index);
  }

  applySnapshot(index) {
    const snapshot = this.state.history[index];
    if (!snapshot) return;
    this.setState({
      rows: parseTextToRows(snapshot.text),
      sourceText: snapshot.text,
      pipeline: JSON.parse(JSON.stringify(snapshot.pipeline)),
      activeStepId: null,
      historyIndex: index,
      preferences: {
        ...this.state.preferences,
        preserveExtension: snapshot.preserveExtension,
      },
    });
  }

  /* ------------------------------- UI -------------------------------- */

  setUI(patch) {
    this.setState(patch);
  }

  /* --------------------------- Persistência -------------------------- */

  persistSoon() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persist(), 400);
  }

  persist() {
    try {
      const state = this.state;
      const payload = {
        version: STORAGE_VERSION,
        preferences: state.preferences,
        pipeline: state.pipeline,
        sourceText: rowsToText(state.rows).slice(0, 2_000_000), // limite de segurança
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Quota estourada / modo privado: falha silenciosa, o app continua funcional.
    }
  }

  hydrate() {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      stored = null;
    }

    if (!stored) {
      this.pushHistory('Estado inicial');
      return false;
    }

    const preferences = { ...DEFAULT_PREFERENCES, ...(stored.preferences ?? {}) };
    const rows = stored.sourceText ? parseTextToRows(stored.sourceText) : [];
    const pipeline = Array.isArray(stored.pipeline) ? stored.pipeline.map(normalizeStep).filter(Boolean) : [];

    this.setState({
      rows,
      pipeline,
      preferences,
      sourceText: rowsToText(rows),
    });
    this.pushHistory('Sessão restaurada');
    return true;
  }

  resetStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignora
    }
  }
}

/** Injeção da fábrica de passos (evita import circular dentro do store). */
Store.prototype.stepFactory = {};

export function configureStore(stepFactory) {
  Store.prototype.stepFactory = stepFactory;
}

export const store = new Store();

/* ------------------- Receitas do usuário (localStorage) ------------------- */

const RECIPES_KEY = 'editor-texto-lote-v5-recipes';

export function loadUserRecipes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECIPES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveUserRecipe(recipe) {
  const recipes = loadUserRecipes();
  const entry = {
    ...recipe,
    id: recipe.id && !recipe.id.startsWith('step') ? recipe.id : uid('recipe'),
    builtin: false,
    savedAt: Date.now(),
  };
  const index = recipes.findIndex((item) => item.id === entry.id);
  if (index >= 0) recipes[index] = entry;
  else recipes.push(entry);
  try {
    localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
  } catch {
    return null;
  }
  return entry;
}

export function deleteUserRecipe(id) {
  const recipes = loadUserRecipes().filter((recipe) => recipe.id !== id);
  try {
    localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
  } catch {
    // ignora
  }
  return recipes;
}
