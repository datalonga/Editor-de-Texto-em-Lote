/**
 * Diálogo de exportação.
 *
 * Abas:
 *  1. Script de renomeação (bash/bat/ps1/py/mjs) com dry-run, backup e log.
 *  2. Lista final (.txt/.csv/.tsv/.json/.md) + mapa de-para.
 *  3. Aplicar de verdade no navegador (File System Access API, quando suportado).
 *
 * O "aplicar" usa `showDirectoryPicker` + `FileSystemDirectoryHandle.removeEntry`
 * e `getFileHandle` — em navegadores sem suporte, mostramos fallback para script.
 */

import { openModal } from './modal.js';
import { icon } from './icons.js';
import { SCRIPT_META, generateScript } from '../core/scripts.js';
import { LIST_FORMATS, exportResults, exportRenameMap } from '../core/exporters.js';
import { downloadFile, formatNumber, copyToClipboard, guessPlatform, escapeHtml } from '../core/utils.js';
import { toast } from './toast.js';

const EMPTY_STATS = { outputLines: 0, changed: 0 };

/**
 * @param {{ results: object[], stats: object, store: object }} context
 */
export function openExportDialog({ results, stats = EMPTY_STATS, store }) {
  const alive = results.filter((result) => !result.removed);
  const changedPairs = results
    .filter((result) => !result.removed && result.changed)
    .map((result) => ({ from: result.before, to: result.after }));

  const platform = guessPlatform();
  let language = platform === 'windows' ? 'powershell' : 'bash';

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" aria-selected="true" data-tab="script">${icon('terminal')} Script</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="list">${icon('file-text')} Lista final</button>
      <button class="tab" role="tab" aria-selected="false" data-tab="apply">${icon('folder-open')} Aplicar</button>
    </div>

    <div data-panel="script" class="tab-panel active" style="padding-top:10px">
      <div class="stack">
        <div class="field">
          <div class="field-label-row"><span class="field-label">Linguagem</span></div>
          <div class="row-flex wrap" data-langs></div>
        </div>

        <div class="step-grid-2">
          <div class="field">
            <div class="field-label-row"><label class="field-label" for="opt-dir">Pasta alvo (opcional)</label></div>
            <input id="opt-dir" class="input mono" placeholder="/caminho/para/pasta" />
          </div>
          <div class="field">
            <div class="field-label-row"><span class="field-label">Garantias</span></div>
            <div class="row-flex wrap" style="gap:10px">
              <label class="check"><input type="checkbox" data-opt="dryRun" checked /><span>Dry-run</span></label>
              <label class="check"><input type="checkbox" data-opt="avoidOverwrite" checked /><span>Não sobrescrever</span></label>
              <label class="check"><input type="checkbox" data-opt="backup" /><span>Backup .bak</span></label>
              <label class="check"><input type="checkbox" data-opt="log" checked /><span>Log</span></label>
            </div>
          </div>
        </div>

        <div class="field">
          <div class="field-label-row">
            <span class="field-label">Prévia do script</span>
            <span class="badge" data-script-count></span>
          </div>
          <pre data-script-preview class="mono" style="max-height:34vh;overflow:auto;margin:0;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);font-size:11px;line-height:1.6;white-space:pre"></pre>
        </div>
      </div>
    </div>

    <div data-panel="list" class="tab-panel" style="padding-top:10px">
      <div class="stack">
        <div class="field">
          <div class="field-label-row"><span class="field-label">Formato</span></div>
          <div class="row-flex wrap" data-formats></div>
        </div>
        <div class="field">
          <div class="field-label-row"><span class="field-label">Prévia</span></div>
          <pre data-list-preview class="mono" style="max-height:38vh;overflow:auto;margin:0;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-all"></pre>
        </div>
      </div>
    </div>

    <div data-panel="apply" class="tab-panel" style="padding-top:10px">
      <div class="stack" data-apply-content></div>
    </div>
  `;

  const tabs = body.querySelector('.tabs');
  const scriptPanel = body.querySelector('[data-panel="script"]');
  const listPanel = body.querySelector('[data-panel="list"]');
  const applyPanel = body.querySelector('[data-panel="apply"]');

  /* ---------------------------- Tabs ---------------------------- */
  body.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      body.querySelectorAll('[data-tab]').forEach((other) => other.setAttribute('aria-selected', String(other === tab)));
      for (const panel of [scriptPanel, listPanel, applyPanel]) {
        panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab);
      }
    });
  });

  /* --------------------------- Script --------------------------- */

  const langsHost = scriptPanel.querySelector('[data-langs]');
  const preview = scriptPanel.querySelector('[data-script-preview]');
  const scriptCount = scriptPanel.querySelector('[data-script-count]');
  const dirInput = scriptPanel.querySelector('#opt-dir');

  const opts = { dryRun: true, avoidOverwrite: true, backup: false, log: true };

  const currentScript = () =>
    generateScript(language, changedPairs, {
      ...opts,
      directory: dirInput.value.trim(),
    });

  function renderScript() {
    langsHost.innerHTML = Object.entries(SCRIPT_META)
      .map(
        ([key, meta]) =>
          `<button class="btn btn-sm ${key === language ? 'btn-secondary' : 'btn-ghost'}" data-lang="${key}" data-tip="${escapeHtml(meta.hint)}">${escapeHtml(meta.label)}</button>`,
      )
      .join('');

    for (const button of langsHost.querySelectorAll('[data-lang]')) {
      button.addEventListener('click', () => {
        language = button.dataset.lang;
        renderScript();
      });
    }

    scriptCount.textContent = `${changedPairs.length} renomeação(ões)`;
    preview.textContent = changedPairs.length
      ? currentScript()
      : 'Nada para renomear — o resultado é idêntico à entrada.';
  }

  dirInput.addEventListener('input', () => {
    preview.textContent = changedPairs.length ? currentScript() : preview.textContent;
  });

  for (const checkbox of scriptPanel.querySelectorAll('[data-opt]')) {
    checkbox.addEventListener('change', () => {
      opts[checkbox.dataset.opt] = checkbox.checked;
      renderScript();
    });
  }

  renderScript();

  /* ---------------------------- Lista ---------------------------- */

  let format = 'txt';
  const formatsHost = listPanel.querySelector('[data-formats]');
  const listPreview = listPanel.querySelector('[data-list-preview]');

  function renderList() {
    formatsHost.innerHTML = Object.entries(LIST_FORMATS)
      .map(
        ([key, meta]) =>
          `<button class="btn btn-sm ${key === format ? 'btn-secondary' : 'btn-ghost'}" data-format="${key}">${escapeHtml(meta.label)}</button>`,
      )
      .join('');

    for (const button of formatsHost.querySelectorAll('[data-format]')) {
      button.addEventListener('click', () => {
        format = button.dataset.format;
        renderList();
      });
    }

    const text = exportResults(results, format, stats);
    listPreview.textContent = text.slice(0, 4000) + (text.length > 4000 ? '\n…' : '');
  }

  renderList();

  /* ---------------------------- Aplicar --------------------------- */

  const applyHost = applyPanel.querySelector('[data-apply-content]');
  const hasFsApi = 'showDirectoryPicker' in window;

  function renderApply() {
    const invalid = results.filter(
      (result) => !result.removed && result.issues.some((issue) => issue.severity === 'error'),
    ).length;

    applyHost.innerHTML = `
      <div class="preview-box">
        <div class="label">Resumo</div>
        <div class="value" style="margin-top:4px">
          ${formatNumber(alive.length)} arquivo(s) na pasta • ${formatNumber(changedPairs.length)} serão renomeados
          ${invalid ? `<br><span style="color:var(--danger)">${formatNumber(invalid)} nome(s) inválido(s) — corrija antes de aplicar</span>` : ''}
        </div>
      </div>

      ${
        hasFsApi
          ? `
        <p class="field-hint">
          O navegador pedirá permissão para ler a pasta. Nada é enviado para servidores — a renomeação
          acontece localmente, arquivo por arquivo, com verificação de conflitos.
        </p>
        <label class="switch" for="apply-backup">
          <input id="apply-backup" type="checkbox" />
          <span class="switch-track" aria-hidden="true"></span>
          <span class="switch-text"><strong>Criar cópia .bak antes</strong><span>Recomendado para a primeira execução</span></span>
        </label>
        <label class="switch" for="apply-dry">
          <input id="apply-dry" type="checkbox" checked />
          <span class="switch-track" aria-hidden="true"></span>
          <span class="switch-text"><strong>Simular (dry-run)</strong><span>Mostra o que faria, sem alterar nada</span></span>
        </label>
        <div class="row-flex">
          <button class="btn btn-primary" data-act="apply" ${invalid || !changedPairs.length ? 'disabled' : ''}>
            ${icon('folder-open')} Escolher pasta e aplicar
          </button>
        </div>
        <div class="field-hint" data-apply-log style="font-family:var(--font-mono);max-height:160px;overflow:auto;white-space:pre-wrap"></div>
      `
          : `
        <div class="warn-bar" style="border-radius:8px;border:1px solid color-mix(in srgb, var(--warning) 30%, transparent);background:color-mix(in srgb, var(--warning) 10%, transparent);color:var(--warning)">
          ${icon('alert-triangle')}
          <span>Seu navegador não suporta a File System Access API. Use o script gerado (aba Script) ou o Chrome/Edge no desktop.</span>
        </div>
        <button class="btn btn-secondary" data-act="goto-script">${icon('terminal')} Ir para o script</button>
      `
      }
    `;

    applyHost.querySelector('[data-act="goto-script"]')?.addEventListener('click', () => {
      body.querySelector('[data-tab="script"]').click();
    });

    applyHost.querySelector('[data-act="apply"]')?.addEventListener('click', runApply);
  }

  async function runApply() {
    const button = applyHost.querySelector('[data-act="apply"]');
    const logHost = applyHost.querySelector('[data-apply-log]');
    const dryRun = applyHost.querySelector('#apply-dry').checked;
    const backup = applyHost.querySelector('#apply-backup').checked;

    const log = (message) => {
      logHost.textContent += `${message}\n`;
      logHost.scrollTop = logHost.scrollHeight;
    };

    button.disabled = true;
    logHost.textContent = '';

    try {
      const directory = await window.showDirectoryPicker({ mode: 'readwrite' });
      log(`📁 Pasta: ${directory.name}`);

      // Mapa dos arquivos existentes (case-insensitive para evitar conflito).
      const existing = new Map();
      for await (const [name] of directory.entries()) {
        if (name.endsWith('.bak')) continue;
        existing.set(name.toLowerCase(), name);
      }

      let renamed = 0;
      let skipped = 0;
      let failed = 0;
      const usedNames = new Set(existing.keys());

      for (const pair of changedPairs) {
        const fromKey = pair.from.toLowerCase();
        if (!existing.has(fromKey)) {
          log(`⏭  ${pair.from}: não encontrado na pasta`);
          skipped += 1;
          continue;
        }

        const targetKey = pair.to.toLowerCase();
        if (usedNames.has(targetKey) && targetKey !== fromKey) {
          log(`⏭  ${pair.to}: já existe (não sobrescrevo)`);
          skipped += 1;
          continue;
        }

        if (dryRun) {
          log(`🧪 ${pair.from} → ${pair.to}`);
          continue;
        }

        try {
          const fileHandle = await directory.getFileHandle(existing.get(fromKey));
          const file = await fileHandle.getFile();

          if (backup) {
            const backupHandle = await directory.getFileHandle(`${file.name}.bak`, { create: true });
            const writable = await backupHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
          }

          const targetHandle = await directory.getFileHandle(pair.to, { create: true });
          const writable = await targetHandle.createWritable();
          await writable.write(await file.arrayBuffer());
          await writable.close();

          await directory.removeEntry(file.name);
          usedNames.delete(fromKey);
          usedNames.add(targetKey);
          existing.set(targetKey, pair.to);
          existing.delete(fromKey);
          renamed += 1;
          log(`✅ ${pair.from} → ${pair.to}`);
        } catch (error) {
          failed += 1;
          log(`❌ ${pair.from}: ${error.message}`);
        }
      }

      log('');
      log(
        dryRun
          ? `Simulação concluída: ${changedPairs.length - skipped} seriam renomeados, ${skipped} ignorado(s).`
          : `Concluído: ${renamed} renomeado(s), ${skipped} ignorado(s), ${failed} falha(s).`,
      );

      toast(dryRun ? 'Simulação concluída' : `${renamed} arquivo(s) renomeado(s)`, {
        description: skipped ? `${skipped} ignorado(s)` : undefined,
        variant: failed ? 'warning' : 'success',
        duration: 6000,
      });
    } catch (error) {
      if (error.name !== 'AbortError') {
        log(`Erro: ${error.message}`);
        toast('Falha ao aplicar', { description: error.message, variant: 'error' });
      }
    } finally {
      button.disabled = false;
    }
  }

  renderApply();

  /* ---------------------------- Footer ---------------------------- */

  const footer = document.createElement('div');
  footer.className = 'row-flex';
  footer.style.width = '100%';
  footer.innerHTML = `
    <div class="left row-flex wrap">
      <button class="btn btn-sm btn-ghost" data-act="copy">${icon('copy')} Copiar</button>
      <button class="btn btn-sm btn-ghost" data-act="download">${icon('download')} Baixar</button>
    </div>
    <button class="btn btn-sm btn-primary" data-close>Concluir</button>
  `;

  const activeTab = () => body.querySelector('.tab[aria-selected="true"]').dataset.tab;

  const modal = openModal({
    title: 'Exportar resultado',
    description: `${formatNumber(changedPairs.length)} renomeação(ões) · ${formatNumber(alive.length)} item(ns) na saída`,
    size: 'wide',
    body,
    footer,
  });

  // Remove os painéis do fluxo das tabs para o layout do modal.
  const bodyHost = modal.element.querySelector('.modal-body');
  bodyHost.prepend(tabs);

  footer.querySelector('[data-close]').addEventListener('click', () => modal.close());

  footer.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const tab = activeTab();
    const text =
      tab === 'list'
        ? exportResults(results, format, stats)
        : tab === 'script'
          ? currentScript()
          : results
              .filter((result) => !result.removed)
              .map((result) => result.after)
              .join('\n');
    const ok = await copyToClipboard(text);
    toast(ok ? 'Copiado para o clipboard' : 'Falha ao copiar', { variant: ok ? 'success' : 'error' });
  });

  footer.querySelector('[data-act="download"]').addEventListener('click', () => {
    const tab = activeTab();

    if (tab === 'list') {
      const meta = LIST_FORMATS[format];
      downloadFile(meta.filename, exportResults(results, format, stats), meta.mime);
      toast('Lista baixada', { description: meta.filename, variant: 'success' });
      return;
    }

    if (tab === 'script') {
      const meta = SCRIPT_META[language];
      downloadFile(meta.filename, currentScript(), meta.mime);
      toast('Script baixado', {
        description: `${meta.filename} — leia o cabeçalho antes de executar`,
        variant: 'success',
      });
      return;
    }

    // Aba aplicar: oferece o mapa de-para em CSV (útil para planilhas).
    downloadFile('mapa_de_para.csv', exportRenameMap(results), 'text/csv;charset=utf-8');
    toast('Mapa de-para baixado', { variant: 'success' });
  });

  // Garante que o store está disponível para futuros ganchos (ex.: telemetria local).
  void store;
}
