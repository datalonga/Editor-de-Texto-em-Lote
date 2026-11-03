/**
 * Diff lado a lado completo (modal de inspeção).
 * Limita a 2000 linhas para manter a abertura instantânea; acima disso sugere
 * o filtro "Alterados".
 */

import { openModal } from './modal.js';
import { icon } from './icons.js';
import { escapeHtml, formatNumber, copyToClipboard, downloadFile } from '../core/utils.js';
import { toast } from './toast.js';

const MAX_ROWS = 2000;

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

export function openCompare({ results }) {
  let mode = 'changed';

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="row-flex wrap" style="margin-bottom:10px" data-modes></div>
    <div data-table></div>
    <p class="field-hint" data-limit-note hidden></p>
  `;

  const modesHost = body.querySelector('[data-modes]');
  const tableHost = body.querySelector('[data-table]');
  const limitNote = body.querySelector('[data-limit-note]');

  const changedCount = results.filter((result) => result.changed).length;
  const issueCount = results.filter((result) => result.issues.length > 0).length;

  const MODES = [
    { value: 'changed', label: `Alterados (${formatNumber(changedCount)})` },
    { value: 'all', label: `Todos (${formatNumber(results.length)})` },
    { value: 'issues', label: `Problemas (${formatNumber(issueCount)})` },
  ];

  const getFiltered = () => {
    const base = results.filter((result) => {
      if (mode === 'changed') return result.changed || result.removed;
      if (mode === 'issues') return result.issues.length > 0;
      return true;
    });
    return base.slice(0, MAX_ROWS);
  };

  const renderTable = () => {
    modesHost.innerHTML = MODES.map(
      (item) =>
        `<button class="btn btn-sm ${mode === item.value ? 'btn-secondary' : 'btn-ghost'}" data-mode="${item.value}">${item.label}</button>`,
    ).join('');

    const filtered = getFiltered();

    if (!filtered.length) {
      tableHost.innerHTML = `<p class="faint" style="padding:28px;text-align:center">Nenhuma mudança para mostrar neste filtro.</p>`;
      limitNote.hidden = true;
      return;
    }

    tableHost.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div style="display:grid;grid-template-columns:36px 1fr 1fr;background:var(--bg-panel);border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-faint)">
          <div style="padding:5px 8px">#</div>
          <div style="padding:5px 8px;border-left:1px solid var(--border)">Original</div>
          <div style="padding:5px 8px;border-left:1px solid var(--border)">Novo</div>
        </div>
        <div style="max-height:52vh;overflow:auto;font-family:var(--font-mono);font-size:11.5px">
          ${filtered
            .map(
              (result, index) => `
            <div style="display:grid;grid-template-columns:36px 1fr 1fr;border-bottom:1px solid color-mix(in srgb, var(--border) 40%, transparent)">
              <div style="padding:4px 8px;font-size:10px;color:var(--text-faint)">${index + 1}</div>
              <div style="padding:4px 8px;border-left:1px solid color-mix(in srgb, var(--border) 60%, transparent);color:var(--text-dim);word-break:break-all">${escapeHtml(result.before) || '<em class="faint">(vazio)</em>'}</div>
              <div style="padding:4px 8px;border-left:1px solid color-mix(in srgb, var(--border) 60%, transparent);word-break:break-all">
                ${result.removed ? '<span class="badge badge-danger">removido</span>' : diffHtml(result.before, result.after)}
                ${result.issues.map((issue) => `<span class="badge ${issue.severity === 'error' ? 'badge-danger' : 'badge-warning'}">${escapeHtml(issue.code)}</span>`).join(' ')}
              </div>
            </div>`,
            )
            .join('')}
        </div>
      </div>
    `;

    const totalForMode =
      mode === 'changed'
        ? results.filter((result) => result.changed || result.removed).length
        : mode === 'issues'
          ? issueCount
          : results.length;
    limitNote.hidden = totalForMode <= MAX_ROWS;
    limitNote.textContent =
      totalForMode > MAX_ROWS
        ? `Exibindo as primeiras ${formatNumber(MAX_ROWS)} de ${formatNumber(totalForMode)} linhas.`
        : '';

    modesHost.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => {
        mode = button.dataset.mode;
        renderTable();
      });
    });
  };

  renderTable();

  const footer = document.createElement('div');
  footer.className = 'row-flex';
  footer.style.width = '100%';
  footer.innerHTML = `
    <div class="left row-flex">
      <button class="btn btn-sm btn-ghost" data-act="csv">${icon('download')} Baixar CSV</button>
      <button class="btn btn-sm btn-ghost" data-act="copy">${icon('copy')} Copiar diff</button>
    </div>
    <button class="btn btn-sm btn-primary" data-close>Fechar</button>
  `;

  const modal = openModal({
    title: 'Comparar antes e depois',
    description: 'Revise as mudanças linha a linha, com destaque do trecho alterado.',
    size: 'wide',
    body,
    footer,
  });

  footer.querySelector('[data-close]').addEventListener('click', () => modal.close());

  footer.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const text = getFiltered().map((result) => `${result.before}\t${result.after}`).join('\n');
    const ok = await copyToClipboard(text);
    toast(ok ? 'Diff copiado (TSV)' : 'Falha ao copiar', { variant: ok ? 'success' : 'error' });
  });

  footer.querySelector('[data-act="csv"]').addEventListener('click', () => {
    const rows = ['original,novo'];
    for (const result of getFiltered()) {
      rows.push(`"${result.before.replace(/"/g, '""')}","${result.after.replace(/"/g, '""')}"`);
    }
    downloadFile('diff.csv', rows.join('\n'), 'text/csv;charset=utf-8');
  });
}
