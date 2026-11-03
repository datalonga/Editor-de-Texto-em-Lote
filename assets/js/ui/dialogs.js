/**
 * Diálogos informativos: atalhos, estatísticas, timeline do histórico e sobre.
 */

import { openModal } from './modal.js';
import { icon } from './icons.js';
import { STEP_META } from '../core/steps.js';
import { escapeHtml, formatNumber } from '../core/utils.js';

/* ----------------------------- Atalhos ----------------------------- */

export const SHORTCUTS = [
  { combo: 'Ctrl + K', description: 'Abrir paleta de comandos', group: 'Geral' },
  { combo: 'Ctrl + /', description: 'Mostrar esta lista de atalhos', group: 'Geral' },
  { combo: 'Esc', description: 'Fechar modais / sair do modo foco', group: 'Geral' },
  { combo: 'Ctrl + Z', description: 'Desfazer', group: 'Histórico' },
  { combo: 'Ctrl + Shift + Z', description: 'Refazer', group: 'Histórico' },
  { combo: 'Ctrl + Y', description: 'Refazer (alternativo)', group: 'Histórico' },
  { combo: 'Ctrl + Enter', description: 'Aplicar pipeline na lista', group: 'Ações' },
  { combo: 'Ctrl + E', description: 'Exportar / gerar script', group: 'Ações' },
  { combo: 'Ctrl + Shift + C', description: 'Copiar resultado', group: 'Ações' },
  { combo: 'Ctrl + Shift + F', description: 'Buscar na lista', group: 'Ações' },
  { combo: 'Ctrl + Shift + X', description: 'Limpar tudo', group: 'Ações' },
  { combo: 'Ctrl + Shift + L', description: 'Carregar exemplo', group: 'Ações' },
  { combo: 'Ctrl + Alt + 1', description: 'Ir para Entrada', group: 'Navegação' },
  { combo: 'Ctrl + Alt + 2', description: 'Ir para Pipeline', group: 'Navegação' },
  { combo: 'Ctrl + Alt + 3', description: 'Ir para Resultado', group: 'Navegação' },
  { combo: 'Ctrl + Shift + M', description: 'Alternar modo foco (Zen)', group: 'Navegação' },
];

export function openShortcuts() {
  const groups = new Map();
  for (const item of SHORTCUTS) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }

  const body = document.createElement('div');
  body.innerHTML = [...groups.entries()]
    .map(
      ([group, items]) => `
      <div style="margin-bottom:12px">
        <p class="field-label" style="margin-bottom:6px">${escapeHtml(group)}</p>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:5px 14px;align-items:center">
          ${items
            .map(
              (item) => `
            <kbd style="justify-self:start;min-width:auto;padding:0 6px">${escapeHtml(item.combo.replace(/ \+ /g, '+'))}</kbd>
            <span class="dim small">${escapeHtml(item.description)}</span>`,
            )
            .join('')}
        </div>
      </div>`,
    )
    .join('');

  openModal({
    title: 'Atalhos de teclado',
    description: 'Funciona em qualquer lugar do app, exceto quando você está digitando em um campo.',
    size: 'default',
    body,
  });
}

/* --------------------------- Estatísticas --------------------------- */

export function openStats({ results, stats, pipeline }) {
  const alive = results.filter((result) => !result.removed);
  const issuesByCode = new Map();
  for (const result of results) {
    for (const issue of result.issues) {
      issuesByCode.set(issue.code, (issuesByCode.get(issue.code) ?? 0) + 1);
    }
  }

  const longest = alive.reduce((max, result) => (result.after.length > max.length ? result.after : max), '');
  const shortest = alive.reduce(
    (min, result) => (result.after.length < min.length ? result.after : min),
    alive[0]?.after ?? '',
  );

  const rows = [
    ['Itens na entrada', formatNumber(stats.inputLines)],
    ['Itens na saída', formatNumber(stats.outputLines)],
    ['Alterados', formatNumber(stats.changed)],
    ['Inalterados', formatNumber(stats.unchanged)],
    ['Removidos', formatNumber(stats.removed)],
    ['Duplicados na saída', formatNumber(stats.duplicates)],
    ['Nomes inválidos', formatNumber(stats.invalid)],
    ['Comprimento médio', `${stats.avgLength} caracteres`],
    ['Comprimento máximo', `${stats.maxLength} caracteres`],
    ['Passos no pipeline', `${pipeline.filter((step) => step.enabled !== false).length} de ${pipeline.length}`],
  ];

  const body = document.createElement('div');
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr auto;gap:6px 16px;font-size:12.5px">
      ${rows.map(([label, value]) => `<span class="faint">${escapeHtml(label)}</span><strong class="mono" style="font-weight:600">${value}</strong>`).join('')}
    </div>

    ${
      issuesByCode.size
        ? `<div style="margin-top:14px">
            <p class="field-label" style="margin-bottom:6px">Problemas encontrados</p>
            <div class="chips">${[...issuesByCode.entries()]
              .map(([code, count]) => `<span class="badge badge-warning">${escapeHtml(code)}: ${count}</span>`)
              .join('')}</div>
          </div>`
        : ''
    }

    ${
      pipeline.length
        ? `<div style="margin-top:14px">
            <p class="field-label" style="margin-bottom:6px">Pipeline</p>
            <div class="chips">${pipeline
              .map(
                (step, index) =>
                  `<span class="chip" style="${step.enabled === false ? 'opacity:.5;text-decoration:line-through' : ''}">${index + 1}. ${escapeHtml(STEP_META[step.kind]?.label ?? step.kind)}</span>`,
              )
              .join('')}</div>
          </div>`
        : ''
    }

    ${
      alive.length
        ? `<div style="margin-top:14px">
            <p class="field-label" style="margin-bottom:6px">Extremos</p>
            <p class="small dim" style="word-break:break-all">
              <strong>Mais longo:</strong> <span class="mono">${escapeHtml(longest)}</span><br />
              <strong>Mais curto:</strong> <span class="mono">${escapeHtml(shortest)}</span>
            </p>
          </div>`
        : ''
    }
  `;

  openModal({
    title: 'Estatísticas da lista',
    description: 'Um raio-x do seu processamento atual.',
    body,
  });
}

/* ---------------------------- Histórico ---------------------------- */

export function openTimeline({ history, historyIndex, onJump }) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="recipe-list">
      ${history
        .map(
          (snapshot, index) => `
        <button class="recipe-card" data-index="${index}" style="${index === historyIndex ? 'border-color:var(--accent);background:var(--bg-hover)' : ''}">
          <div class="info">
            <strong>${escapeHtml(snapshot.label)}</strong>
            <p>${new Date(snapshot.timestamp).toLocaleTimeString('pt-BR')} · ${snapshot.pipeline.length} passo(s) · ${snapshot.text ? snapshot.text.split('\n').length : 0} linha(s)</p>
          </div>
          <span class="badge ${index === historyIndex ? 'badge-accent' : ''}">${index === historyIndex ? 'atual' : `#${index + 1}`}</span>
        </button>`,
        )
        .reverse()
        .join('')}
    </div>
  `;

  const modal = openModal({
    title: 'Timeline do histórico',
    description: 'Clique em qualquer estado anterior para voltar a ele.',
    body,
    size: 'default',
  });

  body.querySelectorAll('[data-index]').forEach((button) => {
    button.addEventListener('click', () => {
      onJump(Number(button.dataset.index));
      modal.close();
    });
  });
}

/* ------------------------------ Sobre ------------------------------ */

export function openAbout() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="stack" style="font-size:12.5px;line-height:1.65">
      <p>
        <strong>Editor de Texto em Lote Ultra v5.0</strong> — processamento de listas de nomes
        em tempo real, 100% no seu navegador.
      </p>
      <p class="dim">
        Nenhuma linha da sua lista sai do seu computador: não há backend, não há analytics e o app
        funciona offline depois do primeiro carregamento.
      </p>
      <div class="divider"></div>
      <p class="field-label">Stack</p>
      <p class="dim small">
        HTML + CSS + JavaScript puro (ES Modules), sem build e sem dependências.
        Publicado como site estático — funciona em GitHub Pages, Cloudflare Pages ou até
        abrindo o <code>index.html</code> localmente.
      </p>
      <div class="divider"></div>
      <div class="row-flex wrap" style="gap:8px">
        <span class="badge badge-accent">Vanilla JS</span>
        <span class="badge">ES Modules</span>
        <span class="badge">Web Worker</span>
        <span class="badge">PWA offline</span>
        <span class="badge">Zero dependências</span>
      </div>
      <div class="divider"></div>
      <p class="faint small">
        Atalhos: <kbd>Ctrl</kbd> + <kbd>K</kbd> para a paleta de comandos ·
        <kbd>Ctrl</kbd> + <kbd>/</kbd> para a lista completa.
      </p>
    </div>
  `;

  openModal({ title: 'Sobre o app', body, size: 'default' });
}

/* --------------------------- Onboarding ---------------------------- */

export function openWelcome({ onExample, onDocs }) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="stack" style="font-size:12.5px;line-height:1.6">
      <p class="dim">Três passos para transformar sua lista:</p>
      <div class="recipe-list">
        <div class="recipe-card" style="cursor:default">
          <span class="step-index" style="background:var(--accent-soft);color:var(--accent)">1</span>
          <div class="info">
            <strong>Cole ou arraste sua lista</strong>
            <p>Um nome por linha. Também aceita .txt, .csv, .json e pastas inteiras.</p>
          </div>
        </div>
        <div class="recipe-card" style="cursor:default">
          <span class="step-index" style="background:var(--accent-soft);color:var(--accent)">2</span>
          <div class="info">
            <strong>Adicione passos ao pipeline</strong>
            <p>Localizar/substituir, case, numeração, colunas… a ordem importa e o resultado aparece ao vivo.</p>
          </div>
        </div>
        <div class="recipe-card" style="cursor:default">
          <span class="step-index" style="background:var(--accent-soft);color:var(--accent)">3</span>
          <div class="info">
            <strong>Exporte ou aplique</strong>
            <p>Gere um script de renomeação (com dry-run e backup) ou renomeie direto pelo navegador.</p>
          </div>
        </div>
      </div>
      <div class="row-flex wrap" style="margin-top:4px">
        <button class="btn btn-sm btn-primary" data-act="example">${icon('sparkles')} Carregar exemplo</button>
        <button class="btn btn-sm btn-ghost" data-act="shortcuts">${icon('keyboard')} Ver atalhos</button>
      </div>
    </div>
  `;

  const modal = openModal({
    title: 'Bem-vindo ao Editor de Texto em Lote',
    description: 'Rápido, local e sem instalação.',
    body,
    size: 'default',
  });

  body.querySelector('[data-act="example"]').addEventListener('click', () => {
    modal.close();
    onExample?.();
  });
  body.querySelector('[data-act="shortcuts"]').addEventListener('click', () => {
    modal.close();
    onDocs?.();
  });
}
