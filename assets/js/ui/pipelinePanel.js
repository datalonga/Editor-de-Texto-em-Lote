/**
 * Painel do pipeline (builder visual).
 *
 * - cartões recolhíveis (progressive disclosure)
 * - reordenação por drag & drop nativo + botões de acessibilidade
 * - menu "adicionar passo" agrupado
 * - cada cartão mostra um resumo do que faz quando recolhido
 */

import { icon } from './icons.js';
import { STEP_META, STEP_GROUPS, summarizeStep } from '../core/steps.js';
import { createStepEditor } from './stepEditors.js';
import { escapeHtml, formatNumber } from '../core/utils.js';
import { openRecipeDialog } from './recipeDialog.js';
import { toast } from './toast.js';

export function createPipelinePanel({ store, onChange }) {
  const root = document.createElement('section');
  root.className = 'panel';
  root.id = 'panel-pipeline';
  root.setAttribute('aria-label', 'Pipeline de transformações');

  root.innerHTML = `
    <div class="panel-header">
      ${icon('workflow', { size: 14 })}
      <h2 class="panel-title">Pipeline</h2>
      <span class="badge badge-accent" data-step-count hidden></span>
      <div class="panel-spacer"></div>
      <button class="btn btn-icon" data-action="save-recipe" data-tip="Salvar como receita" aria-label="Salvar como receita">${icon('save')}</button>
      <button class="btn btn-icon" data-action="load-recipe" data-tip="Receitas e presets" aria-label="Receitas e presets">${icon('sparkles')}</button>
      <button class="btn btn-icon" data-action="clear-pipeline" data-tip="Limpar pipeline" aria-label="Limpar pipeline">${icon('trash')}</button>
    </div>
    <div class="panel-body flush" data-scroll>
      <div data-content></div>
      <div class="add-step" data-add hidden>
        <button class="btn btn-secondary btn-sm" data-action="add-step">${icon('plus')} Adicionar passo</button>
      </div>
    </div>
  `;

  const content = root.querySelector('[data-content]');
  const addWrap = root.querySelector('[data-add]');
  const stepCount = root.querySelector('[data-step-count]');
  const scrollHost = root.querySelector('[data-scroll]');

  let dragIndex = null;
  let dropIndex = null;
  /**
   * Assinatura estrutural do pipeline.
   * Editar um campo de um passo NÃO deve recriar os cartões (isso roubaria o
   * foco do input a cada tecla). Só re-renderizamos quando a estrutura muda:
   * quantidade, ordem, ids, habilitação ou passo expandido.
   */
  let lastSignature = '';

  function signature(state) {
    return [
      state.activeStepId ?? '',
      state.pipeline.length,
      ...state.pipeline.map((step) => `${step.id}:${step.enabled === false ? 0 : 1}`),
    ].join('|');
  }

  /* ---------------------------- Render ---------------------------- */

  function renderMenu() {
    const groups = STEP_GROUPS.map(
      ({ group, kinds }) => `
        <div class="step-menu-group">${escapeHtml(group)}</div>
        ${kinds
          .map(
            (kind) => `
            <button class="step-menu-item" data-kind="${kind}">
              <span class="dot" style="background:${STEP_META[kind].color}"></span>
              <span class="txt">
                <strong>${escapeHtml(STEP_META[kind].label)}</strong>
                <span>${escapeHtml(STEP_META[kind].description)}</span>
              </span>
            </button>`,
          )
          .join('')}
      `,
    ).join('<div class="step-menu-sep"></div>');

    return `<div class="step-menu" data-menu hidden>${groups}</div>`;
  }

  function emptyState() {
    return `
      <div class="empty">
        <div class="empty-icon">${icon('workflow', { size: 20 })}</div>
        <h3>Nenhum passo ainda</h3>
        <p>Adicione transformações e veja o resultado acumulado à direita. A ordem importa — arraste para reorganizar.</p>
        <div class="empty-actions">
          <button class="btn btn-sm btn-primary" data-action="add-step">${icon('plus')} Adicionar passo</button>
          <button class="btn btn-sm btn-ghost" data-action="load-recipe">${icon('sparkles')} Usar um preset pronto</button>
        </div>
      </div>
    `;
  }

  function stepCard(step, index, total) {
    const meta = STEP_META[step.kind] ?? { label: step.kind, color: 'var(--text-dim)' };
    const summary = summarizeStep(step);
    const expanded = store.getState().activeStepId === step.id;

    const node = document.createElement('li');
    node.className = `step ${expanded ? 'expanded' : ''} ${step.enabled === false ? 'disabled' : ''}`;
    node.draggable = true;
    node.dataset.stepId = step.id;
    node.dataset.index = String(index);

    node.innerHTML = `
      <div class="step-head">
        <span class="step-grip" aria-hidden="true">${icon('grip', { size: 13 })}</span>
        <span class="step-index" style="background:color-mix(in srgb, ${meta.color} 18%, transparent);color:${meta.color}">${index + 1}</span>
        <button class="step-toggle" aria-expanded="${expanded}" data-toggle>
          <span class="step-name">${escapeHtml(meta.label)}</span>
          ${summary ? `<span class="step-summary" title="${escapeHtml(summary)}">${escapeHtml(summary)}</span>` : ''}
          <span class="step-chevron">${icon('chevron-down', { size: 13 })}</span>
        </button>
        <div class="step-actions">
          <button class="btn btn-icon" data-act="toggle-enabled" aria-label="${step.enabled === false ? 'Ativar' : 'Desativar'} passo" data-tip="${step.enabled === false ? 'Ativar' : 'Desativar'}"
            style="color:${step.enabled === false ? 'var(--text-faint)' : 'var(--success)'}">${icon('power', { size: 12 })}</button>
          <button class="btn btn-icon" data-act="up" aria-label="Mover para cima" data-tip="Mover para cima" ${index === 0 ? 'disabled' : ''}>${icon('arrow-up', { size: 12 })}</button>
          <button class="btn btn-icon" data-act="down" aria-label="Mover para baixo" data-tip="Mover para baixo" ${index === total - 1 ? 'disabled' : ''}>${icon('arrow-down', { size: 12 })}</button>
          <button class="btn btn-icon" data-act="duplicate" aria-label="Duplicar passo" data-tip="Duplicar">${icon('copy', { size: 12 })}</button>
          <button class="btn btn-icon" data-act="remove" aria-label="Remover passo" data-tip="Remover">${icon('x', { size: 12 })}</button>
        </div>
      </div>
      ${expanded ? '<div class="step-body" data-body></div>' : ''}
    `;

    // Editor do passo (montado fora do innerHTML para preservar listeners).
    if (expanded) {
      const body = node.querySelector('[data-body]');
      body.append(
        createStepEditor(step, (patch) => {
          store.updateStep(step.id, patch, { skipHistory: true });
          onChange?.('step-edit');
          // Atualiza apenas o resumo do cabeçalho, sem recriar o editor.
          const summaryNode = node.querySelector('.step-summary');
          const nextSummary = summarizeStep({ ...step, ...patch });
          if (summaryNode) summaryNode.textContent = nextSummary;
        }),
      );
    }

    node.querySelector('[data-toggle]').addEventListener('click', () => {
      const current = store.getState().activeStepId;
      store.setActiveStep(current === step.id ? null : step.id);
    });

    node.querySelectorAll('[data-act]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const action = button.dataset.act;
        if (action === 'toggle-enabled') store.toggleStep(step.id);
        else if (action === 'up') store.moveStep(step.id, -1);
        else if (action === 'down') store.moveStep(step.id, 1);
        else if (action === 'duplicate') store.duplicateStep(step.id);
        else if (action === 'remove') {
          store.removeStep(step.id);
          toast('Passo removido', { description: 'Ctrl+Z para desfazer', variant: 'info', duration: 2200 });
        }
        onChange?.('pipeline');
        render(true);
      });
    });

    /* ----------------------- drag & drop ----------------------- */
    node.addEventListener('dragstart', (event) => {
      dragIndex = index;
      node.style.opacity = '0.45';
      event.dataTransfer.effectAllowed = 'move';
      // Firefox exige dados para iniciar o drag
      event.dataTransfer.setData('text/plain', String(index));
    });
    node.addEventListener('dragend', () => {
      node.style.opacity = '';
      dragIndex = null;
      dropIndex = null;
      content.querySelectorAll('.step').forEach((item) => item.classList.remove('drop-target'));
    });
    node.addEventListener('dragover', (event) => {
      if (dragIndex === null) return;
      event.preventDefault();
      dropIndex = index;
      content.querySelectorAll('.step').forEach((item) => item.classList.remove('drop-target'));
      if (dragIndex !== index) node.classList.add('drop-target');
    });
    node.addEventListener('drop', (event) => {
      event.preventDefault();
      if (dragIndex === null || dragIndex === index) return;
      store.reorderSteps(dragIndex, index);
      onChange?.('reorder');
    });

    return node;
  }

  function render(force = false) {
    const state = store.getState();
    const { pipeline } = state;

    const nextSignature = signature(state);
    if (!force && nextSignature === lastSignature) {
      // Nada estrutural mudou: atualiza apenas os resumos visíveis.
      const list = content.querySelector('.steps');
      if (list) {
        pipeline.forEach((step, index) => {
          const card = list.querySelector(`[data-step-id="${step.id}"]`);
          const summary = card?.querySelector('.step-summary');
          if (summary) {
            const text = summarizeStep(step);
            summary.textContent = text;
            summary.title = text;
          }
          // Números e estado habilitado também podem mudar sem mudar a assinatura?
          // Não — ambos estão na assinatura, então aqui basta o resumo.
          void index;
        });
      }
      return;
    }
    lastSignature = nextSignature;

    stepCount.hidden = pipeline.length === 0;
    stepCount.textContent = `${pipeline.filter((step) => step.enabled !== false).length}/${pipeline.length}`;
    addWrap.hidden = pipeline.length === 0;

    if (!pipeline.length) {
      content.innerHTML = emptyState();
      return;
    }

    const list = document.createElement('ol');
    list.className = 'steps';
    pipeline.forEach((step, index) => list.append(stepCard(step, index, pipeline.length)));
    content.replaceChildren(list);

    // Mantém o menu aberto entre renders (se estava aberto).
    const wasOpen = root.querySelector('[data-menu]') && !root.querySelector('[data-menu]').hidden;
    const addHost = addWrap;
    addHost.querySelector('[data-menu]')?.remove();
    if (wasOpen) openMenu();
  }

  /* ---------------------------- Menu ---------------------------- */

  function openMenu() {
    addWrap.insertAdjacentHTML('beforeend', renderMenu());
    const menu = addWrap.querySelector('[data-menu]');
    menu.hidden = false;
    menu.querySelector('[data-kind]')?.focus();

    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('mousedown', onOutside, true);
    };
    const onOutside = (event) => {
      if (!menu.contains(event.target) && !event.target.closest('[data-action="add-step"]')) closeMenu();
    };
    document.addEventListener('mousedown', onOutside, true);

    menu.addEventListener('click', (event) => {
      const item = event.target.closest('[data-kind]');
      if (!item) return;
      store.addStep(item.dataset.kind);
      onChange?.('add-step');
      render(true);
      closeMenu();
    });
  }

  /* --------------------------- Ações ---------------------------- */

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;

    if (action === 'add-step') {
      const existing = addWrap.querySelector('[data-menu]');
      if (existing) existing.remove();
      else openMenu();
    } else if (action === 'clear-pipeline') {
      if (!store.getState().pipeline.length) return;
      store.clearPipeline();
      onChange?.('clear-pipeline');
      toast('Pipeline limpo', { description: 'Ctrl+Z para desfazer', variant: 'info' });
    } else if (action === 'load-recipe') {
      openRecipeDialog('load', { store, onChange });
    } else if (action === 'save-recipe') {
      openRecipeDialog('save', { store, onChange });
    }
  });

  render(true);
  const unsubscribe = store.subscribe(() => render());

  return {
    element: root,
    destroy: unsubscribe,
    /** Expande o pipeline até um passo específico (usado pela paleta de comandos). */
    focusStep: (id) => {
      store.setActiveStep(id);
      requestAnimationFrame(() => {
        root.querySelector(`[data-step-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    },
    scrollHost,
  };
}
