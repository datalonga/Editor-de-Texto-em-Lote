/**
 * Transformadores de texto puros.
 *
 * Todo transformador recebe (string) e devolve string. Determinismo total:
 * as funções com data/aleatório recebem as dependências por parâmetro, o que
 * permite testá-las sem mocks.
 */

/** Remove diacríticos de forma abrangente (inclui ligaduras que o NFD não cobre). */
export function removeAccents(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[Ææ]/g, (m) => (m === 'Æ' ? 'AE' : 'ae'))
    .replace(/[Øø]/g, (m) => (m === 'Ø' ? 'O' : 'o'))
    .replace(/[Łł]/g, (m) => (m === 'Ł' ? 'L' : 'l'))
    .replace(/[Đđ]/g, (m) => (m === 'Đ' ? 'D' : 'd'))
    .replace(/[Œœ]/g, (m) => (m === 'Œ' ? 'OE' : 'oe'));
}

/**
 * Tokeniza um texto em palavras, respeitando fronteiras de camelCase.
 * "meuArquivo_Final 2024" -> ["meu", "Arquivo", "Final", "2024"]
 */
export function words(text) {
  return String(text)
    .replace(/([a-zà-ÿ0-9])([A-ZÀ-Ý])/g, '$1 $2')
    .replace(/([A-ZÀ-Ý]+)([A-ZÀ-Ý][a-zà-ÿ])/g, '$1 $2')
    .split(/[\s_\-.+(){}[\]@!,;'"#]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
}

function capitalize(word) {
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'as', 'os', 'para', 'com', 'por', 'no', 'na']);

/**
 * Mapa de transformações de caixa/limpeza.
 * Chaves usadas diretamente nos passos do pipeline (serializáveis em JSON).
 */
export const CASE_TRANSFORMS = {
  lower: (t) => t.toLowerCase(),
  upper: (t) => t.toUpperCase(),

  /** Title Case com preposições pt-BR em minúsculo (exceto a primeira palavra). */
  title: (t) => {
    let first = true;
    return t
      .toLowerCase()
      .split(/(\s+)/)
      .map((chunk) => {
        if (!chunk.trim()) return chunk;
        const isFirst = first;
        first = false;
        if (!isFirst && SMALL_WORDS.has(chunk)) return chunk;
        return capitalize(chunk);
      })
      .join('');
  },

  /** Apenas a primeira letra de cada frase em maiúscula. */
  sentence: (t) =>
    t
      .toLowerCase()
      .replace(/(^\s*[a-zà-ÿ])|([.!?]\s*[a-zà-ÿ])/g, (match) => match.toUpperCase()),

  camel: (t) => {
    const parts = words(t).map((w) => w.toLowerCase());
    if (!parts.length) return t;
    return parts[0] + parts.slice(1).map(capitalize).join('');
  },

  pascal: (t) => words(t).map((w) => capitalize(w.toLowerCase())).join(''),

  snake: (t) => words(t).map((w) => w.toLowerCase()).join('_'),

  kebab: (t) => words(t).map((w) => w.toLowerCase()).join('-'),

  constant: (t) => words(t).map((w) => w.toUpperCase()).join('_'),

  dot: (t) => words(t).map((w) => w.toLowerCase()).join('.'),

  /**
   * Slug para URLs/arquivos web: só [a-z0-9-].
   * Fallback: se o texto não tiver nenhum caractere latino (ex.: "漢字"),
   * preservamos o original normalizado para não gerar um nome vazio.
   */
  slug: (t) => {
    const slugged = removeAccents(t)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slugged) return slugged;
    const fallback = t.trim().replace(/\s+/g, '-').replace(/^-+|-+$/g, '');
    return fallback || t;
  },

  reverse: (t) => [...t].reverse().join(''),

  'remove-accents': (t) => removeAccents(t),

  'remove-special': (t) => t.replace(/[^\p{L}\p{N}\s\-_.]/gu, ''),

  'normalize-spaces': (t) => t.replace(/[\s\u00A0]+/g, ' ').trim(),

  'strip-numbers': (t) => t.replace(/\d+/g, ''),

  'trim-edges': (t) => t.trim(),

  'collapse-dashes': (t) => t.replace(/[-_]{2,}/g, '-').replace(/^-+|-+$/g, ''),
};

/** Aplica uma transformação por nome, com fallback seguro (identidade). */
export function applyCase(text, mode) {
  const fn = CASE_TRANSFORMS[mode];
  return fn ? fn(text) : text;
}

/** Lista de modos disponíveis (para montar o <select> sem duplicar dados). */
export const CASE_MODES = Object.keys(CASE_TRANSFORMS);

export const CASE_LABELS = {
  lower: 'minúsculas',
  upper: 'MAIÚSCULAS',
  title: 'Title Case',
  sentence: 'Primeira letra da frase',
  camel: 'camelCase',
  pascal: 'PascalCase',
  snake: 'snake_case',
  kebab: 'kebab-case',
  constant: 'CONSTANT_CASE',
  dot: 'dot.case',
  slug: 'slug-para-web',
  reverse: 'Inverter caracteres',
  'remove-accents': 'Remover acentos',
  'remove-special': 'Remover caracteres especiais',
  'normalize-spaces': 'Normalizar espaços',
  'strip-numbers': 'Remover números',
  'trim-edges': 'Aparar bordas',
  'collapse-dashes': 'Colapsar - e _ repetidos',
};

/** Preenche com zeros à esquerda. */
export function padNumber(value, pad) {
  return String(Math.abs(Math.trunc(value))).padStart(Math.max(0, pad), '0');
}

/**
 * Sequência alfabética estilo planilha: 1 -> a, 26 -> z, 27 -> aa.
 */
export function toAlphaSequence(index, upper = false) {
  let n = Math.max(1, Math.trunc(index));
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return upper ? out.toUpperCase() : out;
}

export function isoDate(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1, 2)}-${padNumber(date.getDate(), 2)}`;
}

/**
 * String alfanumérica aleatória (crypto quando disponível — melhor distribuição).
 */
export function randomString(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  const lengthSafe = Math.max(1, Math.min(64, Math.trunc(length) || 8));
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(lengthSafe);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < lengthSafe; i += 1) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }
  for (let i = 0; i < lengthSafe; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Renderiza templates com placeholders.
 *
 * Tokens: {name} {ext} {extdot} {original} {n} {nn} {nnn} {nnnn} {index}
 *         {date} {time} {year} {month} {day} {timestamp} {random:N}
 * Modificadores: {upper:name} {lower:name} {title:name} {camel:name}
 *                {snake:name} {kebab:name} {slug:name} {reverse:name}
 *
 * Placeholders desconhecidos são preservados (falha previsível e silenciosa).
 */
export function renderTemplate(template, vars = {}) {
  const date = vars.date ?? new Date();
  const index = vars.index ?? 0;
  const n = vars.n ?? index + 1;
  const ext = vars.ext ?? '';

  const modifiers = {
    upper: CASE_TRANSFORMS.upper,
    lower: CASE_TRANSFORMS.lower,
    title: CASE_TRANSFORMS.title,
    camel: CASE_TRANSFORMS.camel,
    pascal: CASE_TRANSFORMS.pascal,
    snake: CASE_TRANSFORMS.snake,
    kebab: CASE_TRANSFORMS.kebab,
    slug: CASE_TRANSFORMS.slug,
    reverse: CASE_TRANSFORMS.reverse,
  };

  const resolve = (token) => {
    switch (token.toLowerCase()) {
      case 'name':
        return vars.name ?? '';
      case 'ext':
        return ext.replace(/^\./, '');
      case 'extdot':
        return ext;
      case 'original':
        return vars.original ?? vars.name ?? '';
      case 'n':
        return String(n);
      case 'nn':
        return padNumber(n, 2);
      case 'nnn':
        return padNumber(n, 3);
      case 'nnnn':
        return padNumber(n, 4);
      case 'index':
        return String(index);
      case 'date':
        return isoDate(date);
      case 'time':
        return `${padNumber(date.getHours(), 2)}${padNumber(date.getMinutes(), 2)}`;
      case 'year':
        return String(date.getFullYear());
      case 'month':
        return padNumber(date.getMonth() + 1, 2);
      case 'day':
        return padNumber(date.getDate(), 2);
      case 'timestamp':
        return String(date.getTime());
      default: {
        if (token.toLowerCase().startsWith('random')) {
          const [, maybeLength] = token.split(':');
          return (vars.randomSeed ?? randomString)(Number(maybeLength) || 6);
        }
        return undefined;
      }
    }
  };

  return String(template).replace(/\{([^{}]+)\}/g, (match, rawToken) => {
    const token = rawToken.trim();
    const colon = token.indexOf(':');
    // Cuidado: {random:6} usa ':' como argumento, não como modificador.
    const isRandom = token.toLowerCase().startsWith('random');
    const mod = !isRandom && colon > 0 ? token.slice(0, colon) : null;
    const target = !isRandom && colon > 0 ? token.slice(colon + 1) : token;

    const value = resolve(target);
    if (value === undefined) return match;
    if (mod && modifiers[mod]) return modifiers[mod](value);
    return value;
  });
}

/**
 * Calcula prefixo/sufixo comum entre duas strings — base do highlight de diff.
 * O(n) e sem dependências.
 */
export function diffSegments(a, b) {
  let prefix = 0;
  const max = Math.min(a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix += 1;

  let suffix = 0;
  while (suffix < max - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;

  return { prefix, suffix };
}

/** Comparação natural (1, 2, 10) em pt-BR. */
export function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

/** Contagem de palavras aproximada (para modo texto livre). */
export function countWords(text) {
  const trimmed = String(text).trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
