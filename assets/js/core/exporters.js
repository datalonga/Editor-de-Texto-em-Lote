/**
 * Exportação da lista e da receita (JSON).
 * Tudo puro: recebe dados, devolve string.
 */

import { uid } from './utils.js';

export const LIST_FORMATS = {
  txt: { label: 'Texto simples (.txt)', filename: 'nomes_editados.txt', mime: 'text/plain;charset=utf-8' },
  csv: { label: 'CSV (.csv)', filename: 'nomes_editados.csv', mime: 'text/csv;charset=utf-8' },
  tsv: { label: 'TSV (.tsv)', filename: 'nomes_editados.tsv', mime: 'text/tab-separated-values;charset=utf-8' },
  json: { label: 'JSON (.json)', filename: 'nomes_editados.json', mime: 'application/json;charset=utf-8' },
  md: { label: 'Markdown (.md)', filename: 'nomes_editados.md', mime: 'text/markdown;charset=utf-8' },
};

function csvCell(value, delimiter) {
  const text = String(value ?? '');
  if (text.includes(delimiter) || text.includes('"') || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Serializa os resultados no formato pedido.
 * @param {object[]} results  saída de runPipeline
 * @param {'txt'|'csv'|'tsv'|'json'|'md'} format
 * @param {object} [stats]
 */
export function exportResults(results, format, stats) {
  const alive = results.filter((result) => !result.removed);

  switch (format) {
    case 'csv': {
      const rows = ['indice,original,novo,alterado,problemas'];
      alive.forEach((result, index) => {
        rows.push(
          [
            index + 1,
            csvCell(result.before, ','),
            csvCell(result.after, ','),
            result.changed ? 'sim' : 'nao',
            csvCell(result.issues.map((issue) => issue.message).join(' | '), ','),
          ].join(','),
        );
      });
      return rows.join('\n');
    }

    case 'tsv': {
      const rows = ['indice\toriginal\tnovo\talterado'];
      alive.forEach((result, index) => {
        rows.push(
          [index + 1, result.before, result.after, result.changed ? 'sim' : 'nao']
            .map((cell) => csvCell(cell, '\t'))
            .join('\t'),
        );
      });
      return rows.join('\n');
    }

    case 'json':
      return JSON.stringify(
        {
          generator: 'Editor de Texto em Lote Ultra v5.0',
          generatedAt: new Date().toISOString(),
          stats,
          items: alive.map((result, index) => ({
            index: index + 1,
            from: result.before,
            to: result.after,
            changed: result.changed,
            issues: result.issues,
          })),
        },
        null,
        2,
      );

    case 'md': {
      const lines = ['# Lista processada', '', `Gerado em ${new Date().toLocaleString('pt-BR')}`, ''];
      if (stats) {
        lines.push(`**${stats.outputLines}** itens · **${stats.changed}** alterados · **${stats.duplicates}** duplicados`, '');
      }
      lines.push('| # | Original | Novo |', '|---|----------|------|');
      alive.forEach((result, index) => {
        lines.push(
          `| ${index + 1} | \`${result.before.replace(/\|/g, '\\|')}\` | \`${result.after.replace(/\|/g, '\\|')}\` |`,
        );
      });
      return lines.join('\n');
    }

    case 'txt':
    default:
      return alive.map((result) => result.after).join('\n');
  }
}

/** Mapa "de,para" — útil para colar em planilhas. */
export function exportRenameMap(results) {
  const rows = ['de,para'];
  for (const result of results) {
    if (result.removed || !result.changed) continue;
    rows.push(`${csvCell(result.before, ',')},${csvCell(result.after, ',')}`);
  }
  return rows.join('\n');
}

/** Serializa uma receita (pipeline) para exportação em JSON. */
export function serializeRecipe(recipe) {
  return JSON.stringify(
    {
      $schema: 'editor-de-texto-em-lote/recipe@1',
      name: recipe.name,
      description: recipe.description ?? '',
      exportedAt: new Date().toISOString(),
      steps: recipe.steps,
    },
    null,
    2,
  );
}

/**
 * Valida e normaliza uma receita importada.
 * @returns {{ ok: true, recipe: object } | { ok: false, error: string }}
 */
export function parseRecipe(json) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object') return { ok: false, error: 'JSON inválido.' };
    const steps = Array.isArray(data.steps) ? data.steps : Array.isArray(data.pipeline) ? data.pipeline : null;
    if (!steps) return { ok: false, error: 'Nenhuma lista "steps" encontrada.' };
    return {
      ok: true,
      recipe: {
        id: uid('recipe'),
        name: typeof data.name === 'string' && data.name ? data.name : 'Receita importada',
        description: typeof data.description === 'string' ? data.description : '',
        steps,
      },
    };
  } catch (error) {
    return { ok: false, error: `Não foi possível ler o JSON: ${error.message}` };
  }
}
