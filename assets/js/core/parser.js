/**
 * Parsers de entrada: texto, arquivos, CSV/TSV e JSON.
 * Puros (exceto por receber `File`, que é apenas lido como texto pelo chamador).
 */

import { splitExtension } from './naming.js';
import { uid } from './utils.js';

/**
 * Converte texto multilinha em linhas estruturadas.
 * @param {string} text
 * @param {{ removeEmpty?: boolean, sanitize?: boolean }} [options]
 */
export function parseTextToRows(text, options = {}) {
  const { removeEmpty = true, sanitize = true } = options;
  let source = String(text ?? '');
  if (sanitize) source = source.replace(/^\uFEFF/, '');
  source = source.replace(/\r\n?/g, '\n');

  const rows = [];
  for (const line of source.split('\n')) {
    if (removeEmpty && line.trim() === '') continue;
    rows.push({
      id: uid('row'),
      originalName: line,
      extension: splitExtension(line).extension,
      preserveExt: null,
      selected: false,
      locked: false,
    });
  }
  return rows;
}

/** Serializa de volta para o textarea. */
export function rowsToText(rows) {
  return rows.map((row) => row.originalName).join('\n');
}

/**
 * Extrai nomes de uma FileList.
 * `useRelativePath` mantém a pasta de origem (webkitRelativePath) — útil ao
 * arrastar uma pasta inteira.
 */
export function filesToRows(files, useRelativePath = false) {
  return Array.from(files).map((file) => {
    const relative = file.webkitRelativePath;
    const name = useRelativePath && relative ? relative : file.name;
    return {
      id: uid('row'),
      originalName: name,
      extension: splitExtension(name).extension,
      preserveExt: null,
      selected: false,
      locked: false,
    };
  });
}

/** Split de linha CSV respeitando aspas duplas (inclui "" escapado). */
export function splitCsvLine(line, delimiter = ',') {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** Extrai uma coluna de um texto CSV/TSV. */
export function parseDelimited(text, delimiter = ',', column = 0) {
  const out = [];
  for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line, delimiter);
    const value = cells[column];
    if (value !== undefined && value !== '') out.push(value);
  }
  return out;
}

/**
 * Importação inteligente: detecta JSON, CSV/TSV ou texto puro.
 * Tolerante a falhas — se o JSON estiver quebrado, cai no parser de linhas.
 */
export function importSmart(text, filename = '') {
  const trimmed = String(text).trim();
  const lower = filename.toLowerCase();

  const looksJson = lower.endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{');
  if (looksJson) {
    try {
      const data = JSON.parse(trimmed);
      if (Array.isArray(data)) {
        return data
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const candidate =
                item.name ?? item.to ?? item.novo ?? item.original ?? item.filename ?? item.file ?? item.value;
              return typeof candidate === 'string' ? candidate : JSON.stringify(item);
            }
            return String(item);
          })
          .filter(Boolean);
      }
      if (data && typeof data === 'object') {
        if (Array.isArray(data.items)) {
          return data.items
            .map((item) => (typeof item === 'string' ? item : item?.to ?? item?.name ?? ''))
            .filter(Boolean);
        }
        const values = Object.values(data);
        if (values.length && values.every((value) => typeof value === 'string')) return values;
      }
    } catch {
      // segue para o parser de linhas
    }
  }

  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    const delimiter = lower.endsWith('.tsv') ? '\t' : ',';
    const cells = parseDelimited(text, delimiter);
    if (cells.length) return cells;
  }

  return String(text)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
