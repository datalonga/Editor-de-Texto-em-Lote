/**
 * Painel de entrada.
 *
 * Responsabilidades:
 *  - textarea sincronizado com o store (fonte da verdade da edição);
 *  - drag & drop de arquivos/pastas/texto;
 *  - importação .txt/.csv/.json e colagem do clipboard;
 *  - toggle "preservar extensão" e ações de seleção.
 */

import { icon } from './icons.js';
import { toast } from './toast.js';
import { filesToRows, parseTextToRows, importSmart } from '../core/parser.js';
import { EXAMPLES } from '../core/examples.js';
import { formatNumber, readFileAsText } from '../core/utils.js';
import { uid } from '../core/utils.js';

export function createInputPanel({ store, onChange }) {
  const root = document.createElement('section');
  root.className = 'panel';
  root.id = 'panel-input';
  root.setAttribute('aria-label', 'Lista de entrada');

  root.innerHTML = `
    <div class="panel-header">
      ${icon('list', { size: 14 })}
      <h2 class="panel-title">Entrada</h2>
      <span class="badge" data-count>0</span>
      <div class="panel-spacer"></div>
      <button class="btn btn-icon" data-action="paste" data-tip="Colar do clipboard" aria-label="Colar do clipboard">${icon('clipboard')}</button>
      <button class="btn btn-icon" data-action="import" data-tip="Importar arquivo" aria-label="Importar arquivo">${icon('upload')}</button>
      <button class="btn btn-icon" data-action="folder" data-tip="Importar pasta" aria-label="Importar pasta">${icon('folder-open')}</button>
      <button class="btn btn-icon" data-action="clear" data-tip="Limpar lista" aria-label="Limpar lista">${icon('trash')}</button>
    </div>

    <div class="panel-body flush">
      <div class="input-area" data-dropzone>
        <textarea data-input spellcheck="false" aria-label="Lista de nomes ou texto"
          placeholder="Um item por linha&#10;foto-viagem-01.jpg&#10;Relatório Final (2).pdf&#10;Documento - Cópia.docx"></textarea>
        <div class="drop-overlay">
          ${icon('upload', { size: 26 })}
          <strong>Solte arquivos, pastas ou texto</strong>
          <span>Apenas os nomes são lidos — nenhum upload acontece</span>
        </div>
        <div data-empty-input class="empty" hidden></div>
      </div>
    </div>

    <div class="panel-footer">
      <label class="switch" data-preserve-wrap>
        <input type="checkbox" data-preserve id="preserve-ext" />
        <span class="switch-track" aria-hidden="true"></span>
        <span class="switch-text">
          <strong>Preservar extensão</strong>
          <span data-preserve-hint>.jpg, .pdf… ficam intactos</span>
        </span>
      </label>
      <div class="panel-spacer"></div>
      <button class="btn btn-sm btn-ghost hide-mobile" data-action="content-mode" data-tip="Alternar entre nomes de arquivo e texto livre">
        <span data-content-mode-label>Nomes</span>
      </button>
      <div class="selection-bar" data-selection>
        <span class="badge badge-accent" data-selection-count>0 selecionadas</span>
        <button class="btn btn-sm btn-danger" data-action="delete-selected">${icon('trash')} Remover</button>
      </div>
    </div>

    <input type="file" data-file-input multiple accept=".txt,.csv,.tsv,.json,.md,text/*" aria-label="Importar arquivo de lista" hidden />
    <input type="file" data-folder-input multiple webkitdirectory directory aria-label="Importar pasta" hidden />
  `;

  const textarea = root.querySelector('[data-input]');
  const dropzone = root.querySelector('[data-dropzone]');
  const emptyBox = root.querySelector("[data-empty-input]");
  const countBadge = root.querySelector('[data-count]');
  const preserve = root.querySelector('[data-preserve]');
  const preserveHint = root.querySelector('[data-preserve-hint]');
  const selectionBar = root.querySelector('[data-selection]');
  const selectionCount = root.querySelector('[data-selection-count]');
  const fileInput = root.querySelector('[data-file-input]');
  const folderInput = root.querySelector('[data-folder-input]');

  /* -------------------------- Render -------------------------- */

  let lastText = null;
  let typingTimer = null;

  function renderEmptyState() {
    const hasRows = store.getState().rows.length > 0;
    // Só mostramos o onboarding quando não há linhas E não há texto residual
    // (o usuário pode estar digitando apenas espaços, por exemplo).
    const showEmpty = !hasRows && textarea.value.trim() === '';
    textarea.hidden = showEmpty;
    emptyBox.hidden = !showEmpty;
    if (!showEmpty) return;

    if (emptyBox.hidden) return;

    emptyBox.innerHTML = `
      <div class="empty-icon">${icon('scan', { size: 20 })}</div>
      <h3>Cole sua lista ou arraste arquivos</h3>
      <p>Uma linha por item. Aceita .txt, .csv, .json, pastas inteiras e texto copiado.</p>
      <div class="empty-actions">
        <div class="row">
          <button class="btn btn-sm btn-secondary" data-empty-action="import">${icon('file')} Arquivo</button>
          <button class="btn btn-sm btn-secondary" data-empty-action="folder">${icon('folder')} Pasta</button>
        </div>
        <button class="btn btn-sm btn-outline" data-empty-action="paste">${icon('clipboard')} Colar do clipboard</button>
        <div class="divider"></div>
        <button class="btn btn-sm btn-ghost" data-empty-action="example">${icon('sparkles')} Carregar exemplo</button>
      </div>
    `;

    emptyBox.querySelectorAll('[data-empty-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.emptyAction;
        if (action === 'import') fileInput.click();
        else if (action === 'folder') folderInput.click();
        else if (action === 'paste') pasteFromClipboard();
        else if (action === 'example') loadExample();
      });
    });
  }

  function render(state) {
    const { rows, preferences } = state;

    countBadge.textContent = formatNumber(rows.length);
    countBadge.hidden = rows.length === 0;

    preserve.checked = preferences.preserveExtension;
    preserveHint.textContent =
      preferences.contentMode === 'filenames' ? '.jpg, .pdf… ficam intactos' : 'Modo texto livre (sem extensões)';
    // No modo texto livre as opções de arquivo perdem o sentido.
    const preserveWrap = root.querySelector('[data-preserve-wrap]');
    if (preserveWrap) preserveWrap.style.opacity = preferences.contentMode === 'filenames' ? '1' : '0.45';

    const modeLabel = root.querySelector('[data-content-mode-label]');
    if (modeLabel) modeLabel.textContent = preferences.contentMode === 'filenames' ? 'Nomes' : 'Texto';

    // Sincroniza o textarea apenas quando a mudança NÃO veio da digitação.
    // Sem o guard de `typingTimer`, um render no meio da digitação (debounce de
    // 90ms) restauraria o texto antigo e o usuário perderia caracteres.
    const isTyping = document.activeElement === textarea || typingTimer !== null;
    if (lastText !== state.sourceText && !isTyping) {
      textarea.value = state.sourceText;
      lastText = state.sourceText;
    }
    if (lastText === null) lastText = state.sourceText;

    const selected = rows.filter((row) => row.selected).length;
    selectionBar.classList.toggle('visible', selected > 0);
    selectionCount.textContent = `${selected} selecionada(s)`;

    renderEmptyState();
  }

  /* ------------------------- Sincronização ------------------------- */

  textarea.addEventListener('input', () => {
    lastText = textarea.value;
    renderEmptyState();
    // Debounce curto: mantém a digitação fluida sem perder o "ao vivo".
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingTimer = null;
      store.setSourceText(textarea.value);
      onChange?.('input');
    }, 90);
  });

  // Flush ao sair do campo (evita perder o último estado no undo).
  textarea.addEventListener('blur', () => {
    clearTimeout(typingTimer);
  });

  /* --------------------------- Arquivos --------------------------- */

  function addFiles(files, useRelative, label) {
    if (!files.length) return;
    const rows = filesToRows(files, useRelative);
    store.appendRows(rows, label);
    onChange?.('files');
    toast(`${formatNumber(files.length)} nome(s) adicionado(s)`, {
      description: useRelative ? 'Estrutura de pastas preservada como caminho relativo' : undefined,
      variant: 'success',
    });
  }

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    if (!files.length) return;

    // Arquivos de lista (.txt/.csv/.json) são lidos; o resto entra pelo nome.
    const listFiles = files.filter((file) => /\.(txt|csv|tsv|json|md)$/i.test(file.name));
    const otherFiles = files.filter((file) => !/\.(txt|csv|tsv|json|md)$/i.test(file.name));

    if (otherFiles.length) addFiles(otherFiles, false, 'Importar nomes de arquivos');

    for (const file of listFiles) {
      try {
        const content = await readFileAsText(file);
        const names = importSmart(content, file.name);
        if (!names.length) {
          toast('Nenhum item encontrado no arquivo', { description: file.name, variant: 'warning' });
          continue;
        }
        store.appendRows(parseTextToRows(names.join('\n')), `Importar ${file.name}`);
        toast(`${formatNumber(names.length)} item(ns) importado(s)`, { description: file.name, variant: 'success' });
      } catch {
        toast('Falha ao ler o arquivo', { description: file.name, variant: 'error' });
      }
    }
    onChange?.('files');
  });

  folderInput.addEventListener('change', () => {
    const files = Array.from(folderInput.files ?? []);
    folderInput.value = '';
    addFiles(files, true, 'Importar pasta');
  });

  /* ---------------------------- D & D ----------------------------- */

  let dragDepth = 0;
  dropzone.addEventListener('dragenter', (event) => {
    event.preventDefault();
    dragDepth += 1;
    dropzone.classList.add('dragging');
  });
  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  dropzone.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropzone.classList.remove('dragging');
  });
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove('dragging');

    const dt = event.dataTransfer;
    if (!dt) return;

    const items = Array.from(dt.items ?? []);
    const fromDirectory = items.some((item) => {
      const entry = item.webkitGetAsEntry?.();
      return Boolean(entry?.isDirectory);
    });

    const files = Array.from(dt.files ?? []);
    if (files.length) {
      addFiles(files, fromDirectory, fromDirectory ? 'Importar pasta' : 'Arrastar arquivos');
      return;
    }

    const text = dt.getData('text/plain');
    if (text) {
      store.appendRows(parseTextToRows(text), 'Colar texto arrastado');
      onChange?.('drop');
      toast('Texto adicionado à lista', { variant: 'success' });
    }
  });

  /* --------------------------- Ações ---------------------------- */

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast('A área de transferência está vazia', { variant: 'warning' });
        return;
      }
      store.appendRows(parseTextToRows(text), 'Colar do clipboard');
      onChange?.('paste');
      toast('Lista colada', { variant: 'success' });
    } catch {
      toast('Não foi possível ler o clipboard', {
        description: 'Use Ctrl+V diretamente no campo de texto',
        variant: 'error',
      });
      textarea.focus();
    }
  }

  function loadExample() {
    const example = EXAMPLES[Math.floor(Math.random() * (EXAMPLES.length - 1))];
    store.setSourceText(example.content, { label: `Exemplo: ${example.name}` });
    textarea.value = example.content;
    lastText = example.content;
    onChange?.('example');
    toast('Exemplo carregado', { description: example.name, variant: 'info' });
  }

  const actions = {
    paste: pasteFromClipboard,
    import: () => fileInput.click(),
    folder: () => folderInput.click(),
    clear: () => {
      store.clearAll();
      textarea.value = '';
      lastText = '';
      onChange?.('clear');
      toast('Lista limpa', { description: 'Ctrl+Z para desfazer', variant: 'info' });
    },
    'content-mode': () => {
      const next = store.getState().preferences.contentMode === 'filenames' ? 'text' : 'filenames';
      store.setPreference('contentMode', next);
      onChange?.('content-mode');
      toast(next === 'filenames' ? 'Modo nomes de arquivo' : 'Modo texto livre', {
        description:
          next === 'filenames'
            ? 'Extensões são preservadas e os nomes são validados'
            : 'Sem extensões nem validação — ideal para textos',
        variant: 'info',
      });
    },
    'delete-selected': () => {
      const removed = store.deleteSelectedRows();
      onChange?.('delete-selected');
      if (removed) toast(`${removed} linha(s) removida(s)`, { variant: 'info' });
    },
  };

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = actions[button.dataset.action];
    if (action) action();
  });

  preserve.addEventListener('change', () => {
    store.setPreference('preserveExtension', preserve.checked);
    onChange?.('preserve');
  });

  /* -------------------------- API pública ------------------------- */

  render(store.getState());
  const unsubscribe = store.subscribe(render);

  return {
    element: root,
    focus: () => textarea.focus(),
    getTextarea: () => textarea,
    /** Força ressincronização do textarea (após undo, exemplo, import). */
    sync: () => {
      // Reposiciona o cursor no fim: é o comportamento esperado após undo/aplicar.
      textarea.value = store.getState().sourceText;
      lastText = textarea.value;
      typingTimer = null;
      renderEmptyState();
      renderEmptyState();
    },
    destroy: unsubscribe,
  };
}
