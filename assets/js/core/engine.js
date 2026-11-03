/**
 * ENGINE DE TRANSFORMAÇÃO
 * =======================
 * Módulo puro (sem DOM, sem estado global) que executa um *pipeline* de passos
 * sobre uma lista de itens. É o coração do app e o que os testes cobrem.
 *
 * Contrato principal:
 *   runPipeline(rows, pipeline, options) -> { results, stats }
 *
 * Decisões de projeto:
 *  1. Funções puras: mesma entrada => mesma saída (data é injetável via options.now),
 *     o que torna tudo testável e permite rodar dentro de um Web Worker.
 *  2. Extensão preservada: quando ativo, os passos agem apenas no nome base e a
 *     extensão é reanexada no final — assim um "replace tudo" não destrói ".jpg".
 *  3. Linhas travadas (`locked`) nunca são transformadas.
 *  4. Passos estruturais (sort/dedupe/remove-empty) podem remover/reordenar linhas;
 *     o `id` original é preservado para o front-end manter seleção e locks.
 */

import { splitExtension, joinName, validateFilename, countConflicts } from './naming.js';
import {
  applyCase,
  padNumber,
  toAlphaSequence,
  renderTemplate,
  naturalCompare,
} from './text.js';
import { escapeRegExp } from './utils.js';

/** Placeholder de extensão para templates que não devem mexer nela. */

/* ------------------------------------------------------------------ *
 *  Compilação de regex (compartilhada com a UI para pré-visualizar)
 * ------------------------------------------------------------------ */

/**
 * Compila o regex de um passo find-replace.
 * @returns {RegExp|null} null quando inválido ou vazio — o passo é ignorado.
 */
export function compileFindRegex(step) {
  if (!step || !step.find) return null;
  let flags = step.caseSensitive ? 'g' : 'gi';
  let pattern = step.useRegex ? step.find : escapeRegExp(step.find);

  // \p{L} só funciona com a flag `u`. Ativamos automaticamente apenas quando o
  // padrão usa propriedades Unicode — assim não quebramos regex "clássicas"
  // (a flag `u` torna alguns padrões inválidos).
  if (/\\[pP]\{/.test(pattern)) flags += 'u';

  if (step.wholeWord) pattern = `\\b(?:${pattern})\\b`;
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Testa um regex contra uma amostra, devolvendo resultado estruturado.
 * Usado pelo "testador de regex" embutido.
 */
export function testRegex(pattern, flags, sample) {
  try {
    const regex = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
    const matches = [];
    let match;
    let guard = 0;
    while ((match = regex.exec(sample)) !== null && guard < 500) {
      matches.push({ value: match[0], index: match.index, groups: match.slice(1) });
      if (match[0] === '') regex.lastIndex += 1; // evita loop infinito em padrões vazios
      guard += 1;
    }
    return { ok: true, matches };
  } catch (error) {
    return { ok: false, error: error.message, matches: [] };
  }
}

/* ------------------------------------------------------------------ *
 *  Passos individuais
 * ------------------------------------------------------------------ */

/** Aplica um passo de localizar/substituir em um texto já separado. */
export function applyFindReplace(text, step) {
  const regex = compileFindRegex(step);
  if (!regex) return text;
  return String(text).replace(regex, step.replace ?? '');
}

function applyConditional(text, step) {
  const haystack = step.caseSensitive ? text : text.toLowerCase();
  const needle = step.caseSensitive ? step.value : String(step.value).toLowerCase();
  let matched = false;

  switch (step.test) {
    case 'contains':
      matched = needle !== '' && haystack.includes(needle);
      break;
    case 'not-contains':
      matched = needle !== '' && !haystack.includes(needle);
      break;
    case 'starts-with':
      matched = needle !== '' && haystack.startsWith(needle);
      break;
    case 'ends-with':
      matched = needle !== '' && haystack.endsWith(needle);
      break;
    case 'equals':
      matched = haystack === needle;
      break;
    case 'regex':
      try {
        matched = new RegExp(step.value, step.caseSensitive ? '' : 'i').test(text);
      } catch {
        matched = false;
      }
      break;
    default:
      matched = false;
  }

  if (!matched) return text;

  switch (step.action) {
    case 'prefix':
      return `${step.payload ?? ''}${text}`;
    case 'suffix':
      return `${text}${step.payload ?? ''}`;
    case 'replace':
      return text.replace(
        new RegExp(escapeRegExp(step.value), step.caseSensitive ? 'g' : 'gi'),
        step.payload ?? '',
      );
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'delete':
      return '';
    default:
      return text;
  }
}

function splitColumns(text, step) {
  if (step.delimiterMode === 'space') return text.split(/\s+/).filter(Boolean);
  if (step.delimiterMode === 'regex') {
    try {
      return text.split(new RegExp(step.delimiter));
    } catch {
      return [text];
    }
  }
  return text.split(step.delimiter);
}

/** Reorganiza colunas com template {1}, {2}… e {last}. */
export function applyColumns(text, step) {
  const parts = splitColumns(text, step);
  return String(step.output).replace(/\{(\d+|last)\}/gi, (match, token) => {
    if (String(token).toLowerCase() === 'last') return parts[parts.length - 1] ?? '';
    const index = Number(token) - 1;
    return parts[index] ?? '';
  });
}

/* ------------------------------------------------------------------ *
 *  Runner principal
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} EngineOptions
 * @property {boolean} preserveExtension  preservar a extensão dos arquivos
 * @property {'filenames'|'text'} contentMode  valida nomes apenas em 'filenames'
 * @property {Date} [now]  data de referência (determinismo)
 */

/**
 * Executa o pipeline.
 *
 * @param {{ id: string, originalName: string, locked?: boolean, preserveExt?: boolean|null }[]} rows
 * @param {object[]} pipeline  passos serializáveis
 * @param {EngineOptions} options
 * @returns {{ results: object[], stats: object }}
 */
export function runPipeline(rows, pipeline, options) {
  const now = options.now ?? new Date();
  const steps = Array.isArray(pipeline) ? pipeline : [];

  // 1. Estado inicial: cada linha vira uma entrada mutável.
  let entries = rows.map((row, order) => {
    const preserve =
      options.contentMode === 'filenames' && (row.preserveExt ?? options.preserveExtension) !== false;
    const { name, extension } = preserve
      ? splitExtension(row.originalName)
      : { name: row.originalName, extension: '' };
    return {
      id: row.id,
      original: row.originalName,
      ext: extension,
      value: name,
      locked: !!row.locked,
      removed: false,
      order,
    };
  });

  // 2. Executa os passos na ordem declarada.
  for (const step of steps) {
    if (!step || step.enabled === false) continue;

    switch (step.kind) {
      case 'find-replace': {
        const regex = compileFindRegex(step);
        if (!regex) break;
        for (const entry of entries) {
          if (entry.locked) continue;
          if (step.target === 'extension') {
            entry.ext = entry.ext.replace(regex, step.replace ?? '');
          } else if (step.target === 'all') {
            const replaced = joinName(entry.value, entry.ext).replace(regex, step.replace ?? '');
            if (entry.ext) {
              const parts = splitExtension(replaced);
              entry.value = parts.name;
              entry.ext = parts.extension || entry.ext;
            } else {
              entry.value = replaced;
            }
          } else {
            entry.value = entry.value.replace(regex, step.replace ?? '');
          }
        }
        break;
      }

      case 'case': {
        for (const entry of entries) {
          if (!entry.locked) entry.value = applyCase(entry.value, step.mode);
        }
        break;
      }

      case 'affix': {
        for (const entry of entries) {
          if (!entry.locked) entry.value = `${step.prefix ?? ''}${entry.value}${step.suffix ?? ''}`;
        }
        break;
      }

      case 'trim': {
        const count = Math.max(0, Math.trunc(step.chars) || 0);
        for (const entry of entries) {
          if (entry.locked) continue;
          let value = entry.value;
          if (step.alsoWhitespace) value = value.replace(/^\s+|\s+$/g, '');
          if (count > 0) {
            value =
              step.from === 'start'
                ? value.slice(Math.min(count, value.length))
                : value.slice(0, Math.max(0, value.length - count));
          }
          entry.value = value;
        }
        break;
      }

      case 'crop': {
        const marker = String(step.marker ?? '');
        if (!marker) break;
        for (const entry of entries) {
          if (entry.locked) continue;
          const text = entry.value;
          const index = step.lastOccurrence ? text.lastIndexOf(marker) : text.indexOf(marker);
          if (index === -1) continue;
          if (step.keep === 'after') {
            entry.value = step.includeMarker ? text.slice(index) : text.slice(index + marker.length);
          } else {
            entry.value = step.includeMarker ? text.slice(0, index + marker.length) : text.slice(0, index);
          }
        }
        break;
      }

      case 'numbering': {
        let counter = 0;
        for (const entry of entries) {
          if (entry.locked || entry.removed) continue;
          if (step.skipEmpty && entry.value.trim() === '') continue;

          const increment = Math.trunc(step.step) || 1;
          const grouped = Math.trunc(step.groupSize) > 0 ? counter % Math.trunc(step.groupSize) : counter;
          const numeric = (Math.trunc(step.start) || 0) + grouped * increment;
          const serialized = step.alpha
            ? toAlphaSequence(numeric)
            : padNumber(numeric, Math.trunc(step.pad) || 0);
          const separator = step.separator ?? '';

          entry.value =
            step.position === 'suffix'
              ? `${entry.value}${separator}${serialized}`
              : `${serialized}${separator}${entry.value}`;
          counter += 1;
        }
        break;
      }

      case 'columns': {
        for (const entry of entries) {
          if (!entry.locked) entry.value = applyColumns(entry.value, step);
        }
        break;
      }

      case 'conditional': {
        for (const entry of entries) {
          if (!entry.locked) entry.value = applyConditional(entry.value, step);
        }
        break;
      }

      case 'template': {
        entries.forEach((entry, index) => {
          if (entry.locked) return;
          entry.value = renderTemplate(step.template ?? '{name}', {
            name: entry.value,
            ext: entry.ext,
            original: entry.original,
            index,
            n: index + 1,
            date: now,
          });
        });
        break;
      }

      case 'limit-length': {
        const max = Math.max(1, Math.trunc(step.max) || 64);
        for (const entry of entries) {
          if (entry.locked || entry.value.length <= max) continue;
          entry.value = step.from === 'start' ? entry.value.slice(-max) : entry.value.slice(0, max);
        }
        break;
      }

      case 'remove-empty': {
        for (const entry of entries) {
          if (entry.locked) continue;
          if (step.alsoTrim) entry.value = entry.value.trim();
          if (entry.value === '') entry.removed = true;
        }
        break;
      }

      case 'dedupe': {
        const seen = new Map();
        for (const entry of entries) {
          if (entry.removed) continue;
          const key = step.caseSensitive ? entry.value : entry.value.toLowerCase();
          const previous = seen.get(key);
          if (!previous) {
            seen.set(key, entry);
          } else if (step.keep === 'last') {
            previous.removed = true;
            seen.set(key, entry);
          } else {
            entry.removed = true;
          }
        }
        break;
      }

      case 'sort': {
        const alive = entries.filter((entry) => !entry.removed);
        const removed = entries.filter((entry) => entry.removed);
        const full = (entry) => joinName(entry.value, entry.ext);
        alive.sort((a, b) => {
          // Travadas sempre no topo, preservando a intenção do usuário.
          if (a.locked !== b.locked) return a.locked ? -1 : 1;
          let cmp = 0;
          switch (step.by) {
            case 'length':
              cmp = full(a).length - full(b).length;
              break;
            case 'extension':
              cmp = naturalCompare(a.ext, b.ext) || naturalCompare(full(a), full(b));
              break;
            case 'name':
              cmp = full(a) < full(b) ? -1 : full(a) > full(b) ? 1 : 0;
              break;
            case 'original':
              cmp = naturalCompare(a.original, b.original);
              break;
            default:
              cmp = naturalCompare(full(a), full(b));
          }
          return step.direction === 'desc' ? -cmp : cmp;
        });
        entries = [...alive, ...removed];
        break;
      }

      default:
        // Tipo desconhecido (receita de versão futura): ignora silenciosamente.
        break;
    }
  }

  // 3. Montagem dos resultados + estatísticas em uma única passada.
  const results = [];
  const finalNames = [];
  let changed = 0;
  let invalid = 0;

  for (const entry of entries) {
    const finalName = entry.ext ? joinName(entry.value, entry.ext) : entry.value;
    const issues =
      options.contentMode === 'filenames' && !entry.removed
        ? validateFilename(finalName, { target: entry.ext ? 'base' : 'full' })
        : [];

    if (issues.some((issue) => issue.severity === 'error')) invalid += 1;
    if (!entry.removed) finalNames.push(finalName);
    if (finalName !== entry.original) changed += 1;

    results.push({
      id: entry.id,
      before: entry.original,
      after: finalName,
      changed: finalName !== entry.original,
      removed: entry.removed,
      locked: entry.locked,
      issues,
    });
  }

  // Marca duplicidades como warning (não bloqueia, mas o usuário precisa saber).
  const counts = new Map();
  for (const name of finalNames) {
    const key = name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const result of results) {
    if (result.removed) continue;
    if ((counts.get(result.after.toLowerCase()) ?? 0) > 1) {
      result.issues.push({ code: 'duplicate', message: 'Nome duplicado na lista final', severity: 'warning' });
    }
  }

  const outputLines = finalNames.length;
  const totalLength = finalNames.reduce((sum, name) => sum + name.length, 0);

  const stats = {
    inputLines: rows.length,
    outputLines,
    changed,
    unchanged: rows.length - changed,
    removed: rows.length - outputLines,
    duplicates: Math.max(0, finalNames.length - new Set(finalNames.map((n) => n.toLowerCase())).size),
    invalid,
    avgLength: outputLines ? Math.round((totalLength / outputLines) * 10) / 10 : 0,
    maxLength: finalNames.reduce((max, name) => Math.max(max, name.length), 0),
    conflicts: countConflicts(finalNames),
  };

  return { results, stats };
}

/** Conveniência para testes: nomes de entrada -> nomes de saída (sem removidos). */
export function transformNames(names, pipeline, options = {}) {
  const rows = names.map((name, index) => ({
    id: `row_${index}`,
    originalName: name,
    preserveExt: null,
    locked: false,
  }));
  const { results } = runPipeline(rows, pipeline, {
    preserveExtension: true,
    contentMode: 'filenames',
    ...options,
  });
  return results.filter((result) => !result.removed).map((result) => result.after);
}
