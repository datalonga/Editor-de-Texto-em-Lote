/**
 * Construtores declarativos de controles de formulário.
 * Cada função devolve uma string HTML — a mesma marcação do design system,
 * usada tanto pelos editores de passo quanto pelos modais.
 */

import { escapeHtml } from '../core/utils.js';
import { CASE_LABELS, CASE_MODES } from '../core/text.js';

let fieldSeq = 0;
const nextId = (prefix) => `${prefix}-${(fieldSeq += 1)}`;

/**
 * Envolve um controle com label e hint opcionais.
 *
 * O `for` do label SEMPRE aponta para o id real do controle:
 *  - se `id` for informado, ele é aplicado ao controle (substituindo o gerado);
 *  - caso contrário, reaproveitamos o id que o próprio controle já possui.
 * Isso elimina labels "órfãos" (que quebram leitores de tela e o clique).
 *
 * Invariante: apenas um editor de passo fica montado por vez, então ids
 * semânticos ('find', 'replace', ...) não colidem no documento.
 */
export function field({ label, control, hint, error, id, action }) {
  let resolvedControl = control;
  let targetId = id;

  if (id) {
    // Troca o id do controle pelo solicitado (o primeiro id= do markup).
    resolvedControl = control.replace(/\sid="[^"]*"/, ` id="${id}"`);
  } else {
    targetId = /\sid="([^"]+)"/.exec(control)?.[1] ?? nextId('field');
  }

  return `
    <div class="field">
      <div class="field-label-row">
        <label class="field-label" ${targetId ? `for="${targetId}"` : ''}>${escapeHtml(label ?? '')}</label>
        ${action ?? ''}
      </div>
      ${resolvedControl}
      ${hint ? `<p class="field-hint">${escapeHtml(hint)}</p>` : ''}
      ${error ? `<p class="field-error">${escapeHtml(error)}</p>` : ''}
    </div>
  `;
}

export function textInput({ value = '', placeholder = '', mono = false, id, type = 'text', invalid = false, attrs = '' }) {
  return `<input id="${id ?? nextId('input')}" class="input ${mono ? 'mono' : ''} ${invalid ? 'invalid' : ''}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${attrs} />`;
}

export function numberInput({ value = 0, min = 0, max = 99999, step = 1, id, label }) {
  return `<input id="${id ?? nextId('num')}" class="input num" type="number" value="${Number(value) || 0}" min="${min}" max="${max}" step="${step}" aria-label="${escapeHtml(label ?? '')}" />`;
}

/**
 * @param {{ options: {value:string,label:string}[], value: string, id?: string }} config
 */
export function selectInput({ options, value, id }) {
  const html = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option.value)}" ${option.value === value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`,
    )
    .join('');
  return `<select id="${id ?? nextId('select')}" class="select">${html}</select>`;
}

export function textareaInput({ value = '', placeholder = '', rows = 3, mono = false, id }) {
  return `<textarea id="${id ?? nextId('area')}" class="textarea ${mono ? 'mono' : ''}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
}

export function switchInput({ checked = false, label = '', description = '', id }) {
  const targetId = id ?? nextId('switch');
  return `
    <label class="switch" for="${targetId}">
      <input id="${targetId}" type="checkbox" ${checked ? 'checked' : ''} />
      <span class="switch-track" aria-hidden="true"></span>
      <span class="switch-text">
        <strong>${escapeHtml(label)}</strong>
        ${description ? `<span>${escapeHtml(description)}</span>` : ''}
      </span>
    </label>
  `;
}

export function checkboxInput({ checked = false, label = '', id }) {
  const targetId = id ?? nextId('check');
  return `
    <label class="check" for="${targetId}">
      <input id="${targetId}" type="checkbox" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

/**
 * Controle segmentado (radio estilizado) — acessível via aria-pressed.
 * @param {{ options: {value:string,label:string}[], value: string, name: string }} config
 */
export function segmented({ options, value, name }) {
  const buttons = options
    .map(
      (option) => `
      <button type="button" data-segment="${escapeHtml(name)}" data-value="${escapeHtml(option.value)}"
        aria-pressed="${option.value === value}">${escapeHtml(option.label)}</button>`,
    )
    .join('');
  return `<div class="segmented" role="group" aria-label="${escapeHtml(name)}">${buttons}</div>`;
}

/** Opções de case agrupadas (caixa vs. limpeza). */
export function caseOptions() {
  const groups = [
    { label: 'Caixa', modes: ['lower', 'upper', 'title', 'sentence', 'camel', 'pascal', 'snake', 'kebab', 'constant', 'dot'] },
    { label: 'Limpeza', modes: ['slug', 'remove-accents', 'remove-special', 'normalize-spaces', 'strip-numbers', 'trim-edges', 'collapse-dashes', 'reverse'] },
  ];
  return groups.flatMap((group) =>
    group.modes
      .filter((mode) => CASE_MODES.includes(mode))
      .map((mode) => ({ value: mode, label: `${group.label} · ${CASE_LABELS[mode] ?? mode}` })),
  );
}

/* ------------------------- Binding helpers ------------------------- */

/**
 * Lê o valor de um controle.
 * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} element
 */
export function readValue(element) {
  if (element.type === 'checkbox') return element.checked;
  if (element.type === 'number') {
    const parsed = Number(element.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return element.value;
}

/**
 * Liga um controle a um setter, disparando também em `input` (feedback ao vivo).
 * @param {HTMLElement} root
 * @param {string} selector
 * @param {(value:any)=>void} setter
 */
export function bindControl(root, selector, setter) {
  const element = root.querySelector(selector);
  if (!element) return;
  const handler = () => setter(readValue(element));
  element.addEventListener('input', handler);
  element.addEventListener('change', handler);
}

/**
 * Liga todos os segmentados de um container: o callback recebe (name, value).
 */
export function bindSegmented(root, onChange) {
  for (const button of root.querySelectorAll('[data-segment]')) {
    button.addEventListener('click', () => {
      const name = button.dataset.segment;
      const value = button.dataset.value;
      // Atualiza o visual do grupo inteiro.
      const group = button.closest('.segmented');
      group?.querySelectorAll('button').forEach((sibling) => {
        sibling.setAttribute('aria-pressed', String(sibling === button));
      });
      onChange(name, value);
    });
  }
}
