/**
 * Diálogo de receitas: salvar o pipeline atual como receita e carregar presets.
 * Receitas embutidas vêm de core/presets.js; as do usuário do localStorage.
 */

import { openModal } from './modal.js';
import { icon } from './icons.js';
import { BUILDIN_RECIPES } from '../core/presets.js';
import { loadUserRecipes, saveUserRecipe, deleteUserRecipe } from '../core/store.js';
import { parseRecipe, serializeRecipe } from '../core/exporters.js';
import { STEP_META } from '../core/steps.js';
import { escapeHtml, downloadFile, readFileAsText } from '../core/utils.js';
import { toast } from './toast.js';

/**
 * @param {'save'|'load'} mode
 * @param {{ store: object, onChange: Function }} context
 */
export function openRecipeDialog(mode, { store, onChange }) {
  if (mode === 'save') {
    openSaveDialog({ store, onChange });
    return;
  }

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" aria-selected="true" data-tab="builtin">Presets prontos</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="user">Minhas receitas</button>
    </div>
    <div data-panel="builtin" class="tab-panel active"></div>
    <div data-panel="user" class="tab-panel" style="padding-top:10px">
      <div class="recipe-list" data-user-list></div>
      <div class="row-flex" style="margin-top:10px">
        <button class="btn btn-sm btn-secondary" data-act="import">${icon('upload')} Importar JSON</button>
      </div>
      <input type="file" accept=".json,application/json" hidden data-file />
    </div>
  `;

  const bodyHost = body;
  const builtinPanel = body.querySelector('[data-panel="builtin"]');
  const userPanel = body.querySelector('[data-panel="user"]');
  const userList = body.querySelector('[data-user-list]');
  const fileInput = body.querySelector('[data-file]');

  const modal = openModal({
    title: 'Receitas e presets',
    description: 'Um pipeline pronto para aplicar em um clique. Você pode editar os passos depois.',
    body: bodyHost,
    size: 'default',
    onMount: (root) => {
      // Move os painéis para ficarem fora do container de tabs.
      bodyHost.prepend(bodyHost.querySelector('.tabs'));
      void root;
    },
  });

  /* --------------------------- Tabs --------------------------- */
  body.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      body.querySelectorAll('[data-tab]').forEach((other) => other.setAttribute('aria-selected', String(other === tab)));
      builtinPanel.classList.toggle('active', tab.dataset.tab === 'builtin');
      userPanel.classList.toggle('active', tab.dataset.tab === 'user');
    });
  });

  /* ------------------------- Presets -------------------------- */
  function recipeCard(recipe, options = {}) {
    const kinds = new Set(recipe.steps.map((step) => step.kind));
    const preview = recipe.steps
      .slice(0, 4)
      .map((step) => STEP_META[step.kind]?.label ?? step.kind)
      .join(' → ');

    return `
      <div class="recipe-card" data-recipe="${escapeHtml(recipe.id)}">
        <div class="info">
          <strong>${escapeHtml(recipe.name)}</strong>
          <p>${escapeHtml(recipe.description ?? '')}</p>
          <div class="meta">
            <span class="badge">${recipe.steps.length} passo(s)</span>
            ${[...kinds].slice(0, 3).map((kind) => `<span class="badge badge-accent">${escapeHtml(STEP_META[kind]?.label ?? kind)}</span>`).join('')}
          </div>
          <p class="mono" style="margin-top:4px;font-size:10px;color:var(--text-faint);opacity:.8">${escapeHtml(preview)}</p>
        </div>
        <div class="row-flex">
          ${options.user ? `<button class="btn btn-icon" data-delete="${escapeHtml(recipe.id)}" aria-label="Excluir receita" data-tip="Excluir">${icon('trash')}</button>` : ''}
          <button class="btn btn-sm ${options.user ? 'btn-secondary' : 'btn-primary'}" data-apply="${escapeHtml(recipe.id)}">Aplicar</button>
        </div>
      </div>
    `;
  }

  function renderBuiltin() {
    builtinPanel.innerHTML = `<div class="recipe-list" style="padding-top:6px">${BUILDIN_RECIPES.map((recipe) => recipeCard(recipe)).join('')}</div>`;
    builtinPanel.querySelectorAll('[data-apply]').forEach((button) => {
      button.addEventListener('click', () => applyRecipe(BUILDIN_RECIPES.find((recipe) => recipe.id === button.dataset.apply)));
    });
  }

  function renderUser() {
    const recipes = loadUserRecipes();
    if (!recipes.length) {
      userList.innerHTML = `
        <div class="empty" style="padding:26px 10px">
          <div class="empty-icon">${icon('save', { size: 20 })}</div>
          <h3>Nenhuma receita salva</h3>
          <p>Monte um pipeline e use "Salvar receita" para reutilizar depois. Você também pode importar um JSON.</p>
        </div>
      `;
      return;
    }
    userList.innerHTML = recipes.map((recipe) => recipeCard(recipe, { user: true })).join('');

    userList.querySelectorAll('[data-apply]').forEach((button) => {
      button.addEventListener('click', () => applyRecipe(recipes.find((recipe) => recipe.id === button.dataset.apply)));
    });
    userList.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteUserRecipe(button.dataset.delete);
        renderUser();
        toast('Receita excluída', { variant: 'info' });
      });
    });
  }

  function applyRecipe(recipe) {
    if (!recipe) return;
    store.setPipeline(recipe.steps, `Receita: ${recipe.name}`);
    onChange?.('recipe');
    modal.close();
    toast('Receita aplicada', { description: recipe.name, variant: 'success' });
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const parsed = parseRecipe(text);
      if (!parsed.ok) {
        toast('Receita inválida', { description: parsed.error, variant: 'error' });
        return;
      }
      saveUserRecipe({ ...parsed.recipe, name: parsed.recipe.name || file.name.replace(/\.json$/i, '') });
      renderUser();
      body.querySelector('[data-tab="user"]').click();
      toast('Receita importada', { description: parsed.recipe.name, variant: 'success' });
    } catch {
      toast('Falha ao ler o arquivo', { variant: 'error' });
    }
  });

  body.querySelector('[data-act="import"]').addEventListener('click', () => fileInput.click());

  renderBuiltin();
  renderUser();

  bodyHost.querySelector('.tabs')?.focus();
}

/* ------------------------------ Salvar ------------------------------ */

function openSaveDialog({ store, onChange }) {
  const { pipeline } = store.getState();

  if (!pipeline.length) {
    toast('O pipeline está vazio', { description: 'Adicione ao menos um passo antes de salvar', variant: 'warning' });
    return;
  }

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="stack">
      <div class="field">
        <div class="field-label-row"><label class="field-label" for="recipe-name">Nome da receita</label></div>
        <input id="recipe-name" class="input" placeholder="Ex.: Limpeza padrão de downloads" />
      </div>
      <div class="field">
        <div class="field-label-row"><label class="field-label" for="recipe-desc">Descrição (opcional)</label></div>
        <input id="recipe-desc" class="input" placeholder="Para que serve esta receita?" />
      </div>
      <div class="preview-box">
        <div class="label">Passos incluídos (${pipeline.length})</div>
        <div class="chips" style="margin-top:5px">
          ${pipeline.map((step) => `<span class="chip">${escapeHtml(STEP_META[step.kind]?.label ?? step.kind)}</span>`).join('')}
        </div>
      </div>
      <label class="check" for="recipe-export">
        <input id="recipe-export" type="checkbox" />
        <span>Também baixar o arquivo .json</span>
      </label>
    </div>
  `;

  const footer = document.createElement('div');
  footer.className = 'row-flex';
  footer.style.width = '100%';
  footer.innerHTML = `
    <button class="btn btn-sm btn-ghost" data-close>Cancelar</button>
    <button class="btn btn-sm btn-primary" data-save>${icon('save')} Salvar receita</button>
  `;

  const modal = openModal({
    title: 'Salvar como receita',
    description: 'Salva o pipeline atual para reutilizar depois. Fica guardado no seu navegador.',
    body,
    footer,
    initialFocus: '#recipe-name',
  });

  const nameInput = body.querySelector('#recipe-name');
  const descInput = body.querySelector('#recipe-desc');
  const exportCheck = body.querySelector('#recipe-export');

  const submit = () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.classList.add('invalid');
      nameInput.focus();
      toast('Informe um nome para a receita', { variant: 'warning' });
      return;
    }
    const recipe = saveUserRecipe({
      name,
      description: descInput.value.trim(),
      steps: pipeline,
    });

    if (!recipe) {
      toast('Não foi possível salvar', { description: 'Armazenamento local indisponível', variant: 'error' });
      return;
    }

    if (exportCheck.checked) {
      downloadFile(
        `${name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'receita'}.json`,
        serializeRecipe(recipe),
        'application/json',
      );
    }

    onChange?.('save-recipe');
    modal.close();
    toast('Receita salva', { description: name, variant: 'success' });
  };

  footer.querySelector('[data-close]').addEventListener('click', () => modal.close());
  footer.querySelector('[data-save]').addEventListener('click', submit);
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });
  nameInput.addEventListener('input', () => nameInput.classList.remove('invalid'));
}
