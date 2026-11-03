/**
 * Editores de passo do pipeline.
 *
 * Cada função recebe (step, onChange) e devolve um HTMLElement do corpo do passo.
 * Estratégia: patch parcial via `onChange(patch)` — nunca substituímos o passo
 * inteiro, o que evita perder campos ao alternar controles.
 */

import {
  field,
  textInput,
  numberInput,
  selectInput,
  segmented,
  checkboxInput,
  caseOptions,
  bindControl,
  bindSegmented,
} from './fields.js';
import { compileFindRegex, testRegex } from '../core/engine.js';
import { applyCase } from '../core/text.js';
import { escapeHtml } from '../core/utils.js';
import { h } from './modal.js';

/* --------------------------- Helpers locais --------------------------- */

const SAMPLE = 'Exemplo de Arquivo_Final 2024.jpg';

function grid2(inner) {
  return `<div class="step-grid-2">${inner}</div>`;
}

function grid4(inner) {
  return `<div class="step-grid-4">${inner}</div>`;
}

function previewBox(label, value) {
  return `<div class="preview-box"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function chips(items, dataAttr = 'chip') {
  return `<div class="chips">${items
    .map((item) => `<button type="button" class="chip" data-${dataAttr}="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`)
    .join('')}</div>`;
}

/** Atualiza o conteúdo de um preview sem recriar o DOM inteiro. */
function updatePreview(root, selector, text) {
  const node = root.querySelector(selector);
  if (node) node.textContent = text;
}

/* ------------------------------ Editores ------------------------------ */

const QUICK_PRESETS = [
  { label: 'Números', pattern: '\\d+' },
  { label: 'Especiais', pattern: '[^a-zA-Z0-9\\s._-]' },
  { label: 'Parênteses', pattern: '\\([^)]*\\)' },
  { label: 'Espaços duplos', pattern: ' {2,}' },
  { label: 'Cópia', pattern: '\\s*[-_ ]*c[oó]pia' },
  { label: 'Bordas', pattern: '^\\s+|\\s+$' },
  { label: 'Numeração', pattern: '^\\s*[([]?\\d+[)\\]]?\\s*[-._)]?\\s*' },
  { label: 'Sufixo (1)', pattern: '\\s*\\(\\d+\\)' },
];

function findReplaceEditor(step, onChange) {
  const regexInfo = () => {
    const error = step.useRegex && step.find && !compileFindRegex(step);
    return error;
  };

  const root = h(`
    <div class="stack">
      ${grid2(`
        ${field({ label: 'Localizar', control: textInput({ value: step.find, placeholder: step.useRegex ? '\\d{2,}' : 'texto a substituir', mono: true }), id: 'find' })}
        ${field({ label: 'Substituir por', control: textInput({ value: step.replace, placeholder: step.useRegex ? '$1 - $2' : 'novo texto', mono: true }), id: 'replace' })}
      `)}
      <div class="step-row">
        ${checkboxInput({ checked: step.useRegex, label: 'Regex', id: 'useRegex' })}
        ${checkboxInput({ checked: step.caseSensitive, label: 'Diferenciar caixa', id: 'caseSensitive' })}
        ${checkboxInput({ checked: step.wholeWord, label: 'Palavra inteira', id: 'wholeWord' })}
      </div>
      ${field({
        label: 'Aplicar em',
        control: segmented({
          name: 'target',
          value: step.target,
          options: [
            { value: 'name', label: 'Nome' },
            { value: 'extension', label: 'Extensão' },
            { value: 'all', label: 'Nome + ext' },
          ],
        }),
      })}
      <div class="preview-box" data-regex-preview hidden>
        <div class="label">Testador de regex</div>
        <div class="value" data-regex-result></div>
      </div>
      <div>
        <p class="field-label" style="margin-bottom:5px">Presets rápidos</p>
        ${chips(QUICK_PRESETS.map((preset) => ({ label: preset.label, value: preset.pattern })))}
      </div>
    </div>
  `);

  bindControl(root, '#find', (value) => onChange({ find: value }));
  bindControl(root, '#replace', (value) => onChange({ replace: value }));
  bindControl(root, '#useRegex', (value) => onChange({ useRegex: value }));
  bindControl(root, '#caseSensitive', (value) => onChange({ caseSensitive: value }));
  bindControl(root, '#wholeWord', (value) => onChange({ wholeWord: value }));
  bindSegmented(root, (name, value) => {
    if (name === 'target') onChange({ target: value });
  });

  for (const chip of root.querySelectorAll('[data-chip]')) {
    chip.addEventListener('click', () => {
      const pattern = chip.dataset.chip;
      step.find = pattern;
      step.useRegex = true;
      const findInput = root.querySelector('#find');
      findInput.value = pattern;
      root.querySelector('#useRegex').checked = true;
      onChange({ find: pattern, useRegex: true });
      refreshRegex();
    });
  }

  // Testador: mostra quantas ocorrências na amostra e os grupos capturados.
  const refreshRegex = () => {
    const box = root.querySelector('[data-regex-preview]');
    const result = root.querySelector('[data-regex-result]');
    const hasError = regexInfo() === true;

    if (!step.useRegex || !step.find) {
      box.hidden = true;
      return;
    }
    box.hidden = false;

    if (hasError) {
      result.innerHTML = '<span style="color:var(--danger)">Expressão inválida — este passo será ignorado.</span>';
      return;
    }

    const flags = step.caseSensitive ? 'g' : 'gi';
    const outcome = testRegex(step.find, flags, SAMPLE);
    if (!outcome.ok) {
      result.innerHTML = `<span style="color:var(--danger)">${escapeHtml(outcome.error)}</span>`;
      return;
    }
    if (!outcome.matches.length) {
      result.textContent = 'Nenhuma ocorrência na amostra.';
      return;
    }
    const first = outcome.matches[0];
    result.innerHTML = `${outcome.matches.length} ocorrência(s) · 1ª: <mark>${escapeHtml(first.value)}</mark>${
      first.groups.length
        ? ` · grupos: ${first.groups.map((g, i) => `<span class="badge">$${i + 1}=${escapeHtml(g ?? '')}</span>`).join(' ')}`
        : ''
    }`;
  };

  // Primeira passada: mantém o testador coerente ao carregar uma receita.
  refreshRegex();

  return root;
}

function caseEditor(step, onChange) {
  const root = h(`
    <div class="stack">
      ${field({
        label: 'Transformação',
        control: selectInput({ value: step.mode, options: caseOptions(), id: 'mode' }),
      })}
      ${previewBox('Prévia', applyCase(SAMPLE, step.mode))}
    </div>
  `);

  bindControl(root, '#mode', (value) => {
    onChange({ mode: value });
    updatePreview(root, '.preview-box .value', applyCase(SAMPLE, value));
  });

  return root;
}

function affixEditor(step, onChange) {
  const root = h(`
    <div class="stack">
      ${grid2(`
        ${field({ label: 'Prefixo', control: textInput({ value: step.prefix, placeholder: '2024_', mono: true }), id: 'prefix' })}
        ${field({ label: 'Sufixo', control: textInput({ value: step.suffix, placeholder: '_final', mono: true }), id: 'suffix' })}
      `)}
    </div>
  `);
  bindControl(root, '#prefix', (value) => onChange({ prefix: value }));
  bindControl(root, '#suffix', (value) => onChange({ suffix: value }));
  return root;
}

function trimEditor(step, onChange) {
  const root = h(`
    <div class="stack">
      ${grid2(`
        ${field({ label: 'Quantidade', control: numberInput({ value: step.chars, min: 0, max: 200, label: 'Caracteres' }), id: 'chars' })}
        ${field({
          label: 'De onde',
          control: segmented({
            name: 'from',
            value: step.from,
            options: [
              { value: 'start', label: 'Início' },
              { value: 'end', label: 'Fim' },
            ],
          }),
        })}
      `)}
      ${checkboxInput({ checked: step.alsoWhitespace, label: 'Aparar espaços nas bordas antes', id: 'ws' })}
    </div>
  `);
  bindControl(root, '#chars', (value) => onChange({ chars: value }));
  bindControl(root, '#ws', (value) => onChange({ alsoWhitespace: value }));
  bindSegmented(root, (name, value) => name === 'from' && onChange({ from: value }));
  return root;
}

function cropEditor(step, onChange) {
  const root = h(`
    <div class="stack">
      ${field({
        label: 'Marcador (tesoura)',
        control: textInput({ value: step.marker, placeholder: ' - ', mono: true }),
        id: 'marker',
        hint: 'O texto é cortado a partir do marcador.',
      })}
      <div class="step-row">
        ${segmented({
          name: 'keep',
          value: step.keep,
          options: [
            { value: 'after', label: 'Manter após' },
            { value: 'before', label: 'Manter antes' },
          ],
        })}
        ${checkboxInput({ checked: step.includeMarker, label: 'Incluir marcador', id: 'include' })}
        ${checkboxInput({ checked: step.lastOccurrence, label: 'Última ocorrência', id: 'last' })}
      </div>
    </div>
  `);
  bindControl(root, '#marker', (value) => onChange({ marker: value }));
  bindControl(root, '#include', (value) => onChange({ includeMarker: value }));
  bindControl(root, '#last', (value) => onChange({ lastOccurrence: value }));
  bindSegmented(root, (name, value) => name === 'keep' && onChange({ keep: value }));
  return root;
}

function numberingEditor(step, onChange) {
  const root = h(`
    <div class="stack">
      ${grid4(`
        ${field({ label: 'Início', control: numberInput({ value: step.start, min: 0, max: 99999, label: 'Início' }), id: 'start' })}
        ${field({ label: 'Passo', control: numberInput({ value: step.step, min: 1, max: 1000, label: 'Passo' }), id: 'step' })}
        ${field({ label: 'Zeros', control: numberInput({ value: step.pad, min: 0, max: 10, label: 'Zeros' }), id: 'pad' })}
        ${field({ label: 'Grupo', control: numberInput({ value: step.groupSize, min: 0, max: 999, label: 'Reiniciar a cada' }), id: 'group' })}
      `)}
      ${grid2(`
        ${field({ label: 'Separador', control: textInput({ value: step.separator, placeholder: '_', mono: true }), id: 'sep' })}
        ${field({
          label: 'Posição',
          control: segmented({
            name: 'position',
            value: step.position,
            options: [
              { value: 'prefix', label: 'Prefixo' },
              { value: 'suffix', label: 'Sufixo' },
            ],
          }),
        })}
      `)}
      <div class="step-row">
        ${checkboxInput({ checked: step.alpha, label: 'Alfabético (a, b, …, aa)', id: 'alpha' })}
        ${checkboxInput({ checked: step.skipEmpty, label: 'Ignorar vazias', id: 'skip' })}
      </div>
    </div>
  `);
  bindControl(root, '#start', (value) => onChange({ start: value }));
  bindControl(root, '#step', (value) => onChange({ step: value }));
  bindControl(root, '#pad', (value) => onChange({ pad: value }));
  bindControl(root, '#group', (value) => onChange({ groupSize: value }));
  bindControl(root, '#sep', (value) => onChange({ separator: value }));
  bindControl(root, '#alpha', (value) => onChange({ alpha: value }));
  bindControl(root, '#skip', (value) => onChange({ skipEmpty: value }));
  bindSegmented(root, (name, value) => name === 'position' && onChange({ position: value }));
  return root;
}

function columnsEditor(step, onChange) {
  const root = h(`
    <div class="stack">
      ${grid2(`
        ${field({ label: 'Delimitador', control: textInput({ value: step.delimiter, placeholder: '_', mono: true }), id: 'delim' })}
        ${field({
          label: 'Interpretar como',
          control: selectInput({
            value: step.delimiterMode,
            options: [
              { value: 'char', label: 'Texto literal' },
              { value: 'regex', label: 'Expressão regular' },
              { value: 'space', label: 'Qualquer espaço' },
            ],
          }),
          id: 'mode',
        })}
      `)}
      ${field({
        label: 'Template de saída',
        control: textInput({ value: step.output, placeholder: '{2} {1}', mono: true }),
        id: 'output',
        hint: 'Use {1}, {2}, {3}… para as colunas e {last} para a última.',
      })}
      ${checkboxInput({ checked: step.dropEmpty, label: 'Ignorar linhas sem o delimitador', id: 'drop' })}
    </div>
  `);
  bindControl(root, '#delim', (value) => onChange({ delimiter: value }));
  bindControl(root, '#mode', (value) => onChange({ delimiterMode: value }));
  bindControl(root, '#output', (value) => onChange({ output: value }));
  bindControl(root, '#drop', (value) => onChange({ dropEmpty: value }));
  return root;
}

function conditionalEditor(step, onChange) {
  const needsPayload = !['delete', 'uppercase', 'lowercase'].includes(step.action);
  const root = h(`
    <div class="stack">
      ${grid2(`
        ${field({
          label: 'Condição',
          control: selectInput({
            value: step.test,
            options: [
              { value: 'contains', label: 'contém' },
              { value: 'not-contains', label: 'não contém' },
              { value: 'starts-with', label: 'começa com' },
              { value: 'ends-with', label: 'termina com' },
              { value: 'equals', label: 'é igual a' },
              { value: 'regex', label: 'casa com regex' },
            ],
          }),
          id: 'test',
        })}
        ${field({ label: 'Valor', control: textInput({ value: step.value, placeholder: 'IMG_', mono: true }), id: 'value' })}
      `)}
      ${grid2(`
        ${field({
          label: 'Então',
          control: selectInput({
            value: step.action,
            options: [
              { value: 'prefix', label: 'Adicionar prefixo' },
              { value: 'suffix', label: 'Adicionar sufixo' },
              { value: 'replace', label: 'Substituir' },
              { value: 'delete', label: 'Remover linha' },
              { value: 'uppercase', label: 'MAIÚSCULAS' },
              { value: 'lowercase', label: 'minúsculas' },
            ],
          }),
          id: 'action',
        })}
        <div data-payload>
          ${field({ label: 'Com o texto', control: textInput({ value: step.payload, placeholder: '2024_', mono: true }), id: 'payload' })}
        </div>
      `)}
      ${checkboxInput({ checked: step.caseSensitive, label: 'Diferenciar maiúsculas/minúsculas', id: 'cs' })}
    </div>
  `);

  bindControl(root, '#test', (value) => onChange({ test: value }));
  bindControl(root, '#value', (value) => onChange({ value }));
  bindControl(root, '#cs', (value) => onChange({ caseSensitive: value }));
  bindControl(root, '#payload', (value) => onChange({ payload: value }));
  bindControl(root, '#action', (value) => {
    onChange({ action: value });
    const wrap = root.querySelector('[data-payload]');
    if (wrap) wrap.style.opacity = ['delete', 'uppercase', 'lowercase'].includes(value) ? '0.45' : '1';
  });

  const wrap = root.querySelector('[data-payload]');
  if (wrap && !needsPayload) wrap.style.opacity = '0.45';

  return root;
}

function templateEditor(step, onChange) {
  const tokens = ['{name}', '{ext}', '{n}', '{nnn}', '{index}', '{date}', '{time}', '{year}', '{upper:name}', '{snake:name}', '{random:6}'];

  const renderPreview = (template) => {
    const now = new Date();
    return template
      .replace(/\{name\}/g, 'meu arquivo')
      .replace(/\{ext\}/g, 'jpg')
      .replace(/\{extdot\}/g, '.jpg')
      .replace(/\{nnnn\}/g, '0001')
      .replace(/\{nnn\}/g, '001')
      .replace(/\{nn\}/g, '01')
      .replace(/\{n\}/g, '1')
      .replace(/\{index\}/g, '0')
      .replace(/\{date\}/g, now.toISOString().slice(0, 10))
      .replace(/\{time\}/g, '1432')
      .replace(/\{year\}/g, String(now.getFullYear()))
      .replace(/\{month\}/g, '05')
      .replace(/\{day\}/g, '13')
      .replace(/\{timestamp\}/g, String(now.getTime()))
      .replace(/\{original\}/g, 'meu arquivo.jpg')
      .replace(/\{upper:name\}/g, 'MEU ARQUIVO')
      .replace(/\{snake:name\}/g, 'meu_arquivo')
      .replace(/\{kebab:name\}/g, 'meu-arquivo')
      .replace(/\{slug:name\}/g, 'meu-arquivo')
      .replace(/\{random:\d+\}/g, 'x7k2p9');
  };

  const root = h(`
    <div class="stack">
      ${field({
        label: 'Template',
        control: textInput({ value: step.template, placeholder: '{date}_{nnn}_{name}', mono: true }),
        id: 'template',
        hint: 'Clique nos tokens para inserir no final.',
      })}
      ${chips(tokens.map((token) => ({ label: token, value: token })), 'token')}
      ${previewBox('Prévia', renderPreview(step.template))}
    </div>
  `);

  const input = root.querySelector('#template');
  bindControl(root, '#template', (value) => {
    onChange({ template: value });
    updatePreview(root, '.preview-box .value', renderPreview(value));
  });

  for (const chip of root.querySelectorAll('[data-token]')) {
    chip.addEventListener('click', () => {
      const token = chip.dataset.token;
      input.value += token;
      onChange({ template: input.value });
      updatePreview(root, '.preview-box .value', renderPreview(input.value));
      input.focus();
    });
  }

  return root;
}

function limitLengthEditor(step, onChange) {
  const root = h(`
    <div class="stack">
      ${grid2(`
        ${field({ label: 'Máximo de caracteres', control: numberInput({ value: step.max, min: 1, max: 255, label: 'Máximo' }), id: 'max' })}
        ${field({
          label: 'Manter',
          control: segmented({
            name: 'from',
            value: step.from,
            options: [
              { value: 'end', label: 'Início' },
              { value: 'start', label: 'Fim' },
            ],
          }),
        })}
      `)}
    </div>
  `);
  bindControl(root, '#max', (value) => onChange({ max: value }));
  bindSegmented(root, (name, value) => name === 'from' && onChange({ from: value }));
  return root;
}

function sortEditor(step, onChange) {
  const root = h(`
    <div class="stack">
      ${grid2(`
        ${field({
          label: 'Critério',
          control: selectInput({
            value: step.by,
            options: [
              { value: 'natural', label: 'Natural (1, 2, 10)' },
              { value: 'name', label: 'Alfabético puro' },
              { value: 'length', label: 'Comprimento' },
              { value: 'extension', label: 'Extensão' },
              { value: 'original', label: 'Ordem original' },
            ],
          }),
          id: 'by',
        })}
        ${field({
          label: 'Direção',
          control: segmented({
            name: 'direction',
            value: step.direction,
            options: [
              { value: 'asc', label: 'A → Z' },
              { value: 'desc', label: 'Z → A' },
            ],
          }),
        })}
      `)}
    </div>
  `);
  bindControl(root, '#by', (value) => onChange({ by: value }));
  bindSegmented(root, (name, value) => name === 'direction' && onChange({ direction: value }));
  return root;
}

function dedupeEditor(step, onChange) {
  const root = h(`
    <div class="step-row">
      ${checkboxInput({ checked: step.caseSensitive, label: 'Diferenciar caixa', id: 'cs' })}
      ${segmented({
        name: 'keep',
        value: step.keep,
        options: [
          { value: 'first', label: 'Manter 1ª' },
          { value: 'last', label: 'Manter última' },
        ],
      })}
    </div>
  `);
  bindControl(root, '#cs', (value) => onChange({ caseSensitive: value }));
  bindSegmented(root, (name, value) => name === 'keep' && onChange({ keep: value }));
  return root;
}

function removeEmptyEditor(step, onChange) {
  const root = h(`
    <div class="step-row">
      ${checkboxInput({ checked: step.alsoTrim, label: 'Aparar espaços antes de remover', id: 'trim' })}
    </div>
  `);
  bindControl(root, '#trim', (value) => onChange({ alsoTrim: value }));
  return root;
}

const EDITORS = {
  'find-replace': findReplaceEditor,
  case: caseEditor,
  affix: affixEditor,
  trim: trimEditor,
  crop: cropEditor,
  numbering: numberingEditor,
  columns: columnsEditor,
  conditional: conditionalEditor,
  template: templateEditor,
  'limit-length': limitLengthEditor,
  sort: sortEditor,
  dedupe: dedupeEditor,
  'remove-empty': removeEmptyEditor,
};

/**
 * Cria o editor do passo.
 * @param {object} step
 * @param {(patch: object)=>void} onChange
 * @returns {HTMLElement}
 */
export function createStepEditor(step, onChange) {
  const editor = EDITORS[step.kind];
  if (!editor) {
    return h('<p class="faint small">Editor não disponível para este tipo de passo.</p>');
  }
  return editor(step, onChange);
}
