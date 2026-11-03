/**
 * Regras de nomes de arquivo e validação multiplataforma.
 * Módulo puro: recebe strings, devolve dados. Sem DOM.
 */

/** Nomes reservados do Windows (case-insensitive, considerando só o nome base). */
export const WINDOWS_RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/** Caracteres proibidos no Windows (e problemáticos em outros sistemas). */
const INVALID_CHARS = /[<>:"/\\|?*\u0000-\u001F]/;
const MAX_NAME_LENGTH = 255;

/**
 * Separa nome base e extensão.
 *  - "arquivo.tar.gz" -> { name: "arquivo.tar", extension: ".gz" }
 *    (igual ao comportamento de renomeadores e do próprio SO: só a última)
 *  - ".bashrc"        -> { name: ".bashrc", extension: "" }   (dotfile)
 *  - "arquivo."       -> { name: "arquivo.", extension: "" }  (ponto final inválido)
 */
export function splitExtension(filename) {
  const text = filename ?? '';
  const dot = text.lastIndexOf('.');
  if (dot <= 0 || dot === text.length - 1) return { name: text, extension: '' };
  return { name: text.slice(0, dot), extension: text.slice(dot) };
}

export function joinName(name, extension) {
  return extension ? `${name}${extension}` : name;
}

/**
 * Valida um nome de arquivo e devolve a lista de problemas encontrados.
 * @param {string} filename
 * @param {{ target?: 'base'|'full', maxLength?: number }} [options]
 * @returns {{ code: string, message: string, severity: 'error'|'warning' }[]}
 */
export function validateFilename(filename, options = {}) {
  const { target = 'base', maxLength = MAX_NAME_LENGTH } = options;
  const issues = [];
  const subject = target === 'base' ? splitExtension(filename).name : filename;
  const full = target === 'full' ? filename : `${subject}${splitExtension(filename).extension}`;

  if (subject.trim() === '') {
    return [{ code: 'empty', message: 'Nome vazio', severity: 'error' }];
  }

  if (INVALID_CHARS.test(subject) || INVALID_CHARS.test(full)) {
    issues.push({
      code: 'invalid-chars',
      message: 'Caracteres inválidos: < > : " / \\ | ? *',
      severity: 'error',
    });
  }

  const baseOnly = splitExtension(subject).name;
  if (WINDOWS_RESERVED.has(baseOnly.toUpperCase())) {
    issues.push({
      code: 'reserved',
      message: `"${baseOnly}" é nome reservado do Windows`,
      severity: 'error',
    });
  }

  if (full.endsWith('.')) {
    issues.push({ code: 'trailing-dot', message: 'Termina com ponto (inválido no Windows)', severity: 'warning' });
  } else if (full.endsWith(' ')) {
    issues.push({ code: 'trailing-space', message: 'Termina com espaço', severity: 'warning' });
  }

  if (full.length > maxLength) {
    issues.push({
      code: 'too-long',
      message: `Excede ${maxLength} caracteres (${full.length})`,
      severity: full.length > 255 ? 'error' : 'warning',
    });
  }

  return issues;
}

/** true se houver algum problema que impeça a renomeação. */
export function hasBlockingIssues(issues) {
  return issues.some((issue) => issue.severity === 'error');
}

/**
 * Converte qualquer texto em nome de arquivo seguro.
 * Usado pelo preset "slug web" e pelos exports.
 */
export function toSafeFilename(text, replacement = '-') {
  const escaped = replacement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const collapsed = String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, replacement)
    .replace(/\s+/g, replacement)
    .replace(new RegExp(`${escaped}{2,}`, 'g'), replacement);

  // Remove separadores/pontos/espaços nas bordas (inclusive os gerados acima).
  return collapsed
    .replace(new RegExp(`^[.\\s${escaped}]+`), '')
    .replace(new RegExp(`[.\\s${escaped}]+$`), '');
}

/** Resolve colisão de nomes: "foto.jpg" -> "foto (2).jpg". */
export function resolveCollision(candidate, used) {
  if (!used.has(candidate)) return candidate;
  const { name, extension } = splitExtension(candidate);
  let counter = 2;
  let next = `${name} (${counter})${extension}`;
  while (used.has(next)) {
    counter += 1;
    next = `${name} (${counter})${extension}`;
  }
  return next;
}

/** Quantos nomes finais repetem (case-insensitive). */
export function countConflicts(names) {
  const seen = new Set();
  let conflicts = 0;
  for (const name of names) {
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) conflicts += 1;
    else seen.add(key);
  }
  return conflicts;
}
