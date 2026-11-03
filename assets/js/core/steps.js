/**
 * Fábricas e metadados dos passos do pipeline.
 *
 * Centralizar aqui garante que:
 *  - todo passo criado tenha defaults sãos e um id único;
 *  - adicionar um novo tipo exija mudança em um só lugar (fábrica + metadados + UI).
 */

import { uid } from './utils.js';

/** Metadados usados no menu, no cartão do passo e na paleta de comandos. */
export const STEP_META = {
  'find-replace': {
    label: 'Localizar & Substituir',
    description: 'Regex, grupos de captura ($1) e presets',
    color: 'var(--info)',
    icon: 'search',
  },
  case: {
    label: 'Case & Limpeza',
    description: 'camelCase, slug, acentos, maiúsculas',
    color: 'var(--accent)',
    icon: 'type',
  },
  affix: {
    label: 'Prefixo / Sufixo',
    description: 'Adiciona texto nas bordas do nome',
    color: 'var(--success)',
    icon: 'minus',
  },
  trim: {
    label: 'Aparar caracteres',
    description: 'Remove N caracteres do início ou do fim',
    color: 'var(--warning)',
    icon: 'scissors',
  },
  crop: {
    label: 'Cortar por marcador',
    description: 'Tesoura baseada em um texto marcador',
    color: 'var(--danger)',
    icon: 'cut',
  },
  numbering: {
    label: 'Numeração sequencial',
    description: 'Contador com zeros, grupos e alfabético',
    color: 'var(--accent)',
    icon: 'hash',
  },
  columns: {
    label: 'Colunas / CSV',
    description: 'Divide por delimitador e reorganiza campos',
    color: 'var(--info)',
    icon: 'columns',
  },
  conditional: {
    label: 'Condicional (se…)',
    description: 'Aplica a ação só quando a condição casa',
    color: 'var(--warning)',
    icon: 'branch',
  },
  template: {
    label: 'Template',
    description: '{name} {nnn} {date} {random:6}',
    color: 'var(--accent)',
    icon: 'braces',
  },
  'limit-length': {
    label: 'Limitar comprimento',
    description: 'Trunca nomes muito longos',
    color: 'var(--warning)',
    icon: 'ruler',
  },
  sort: {
    label: 'Ordenar',
    description: 'Natural, comprimento, extensão',
    color: 'var(--success)',
    icon: 'sort',
  },
  dedupe: {
    label: 'Remover duplicados',
    description: 'Mantém a primeira ou a última ocorrência',
    color: 'var(--danger)',
    icon: 'copy',
  },
  'remove-empty': {
    label: 'Remover vazias',
    description: 'Limpa linhas em branco da lista',
    color: 'var(--text-dim)',
    icon: 'eraser',
  },
};

/** Grupos exibidos no menu "adicionar passo". */
export const STEP_GROUPS = [
  { group: 'Transformar', kinds: ['find-replace', 'case', 'affix', 'trim', 'crop', 'numbering', 'template'] },
  { group: 'Avançado', kinds: ['columns', 'conditional', 'limit-length'] },
  { group: 'Lista', kinds: ['sort', 'dedupe', 'remove-empty'] },
];

/**
 * Fábricas por tipo. Cada uma devolve um objeto 100% serializável em JSON,
 * com defaults que já produzem algo útil ao usuário final.
 */
export const STEP_FACTORIES = {
  'find-replace': () => ({
    id: uid('step'),
    kind: 'find-replace',
    enabled: true,
    find: '',
    replace: '',
    useRegex: false,
    caseSensitive: false,
    wholeWord: false,
    target: 'name',
  }),
  case: () => ({ id: uid('step'), kind: 'case', enabled: true, mode: 'lower' }),
  affix: () => ({ id: uid('step'), kind: 'affix', enabled: true, prefix: '', suffix: '' }),
  trim: () => ({ id: uid('step'), kind: 'trim', enabled: true, chars: 1, from: 'start', alsoWhitespace: true }),
  crop: () => ({
    id: uid('step'),
    kind: 'crop',
    enabled: true,
    marker: '',
    keep: 'after',
    includeMarker: false,
    lastOccurrence: false,
  }),
  numbering: () => ({
    id: uid('step'),
    kind: 'numbering',
    enabled: true,
    start: 1,
    step: 1,
    pad: 2,
    separator: '_',
    position: 'prefix',
    alpha: false,
    groupSize: 0,
    skipEmpty: true,
  }),
  columns: () => ({
    id: uid('step'),
    kind: 'columns',
    enabled: true,
    delimiter: '_',
    delimiterMode: 'char',
    output: '{2} {1}',
    dropEmpty: false,
  }),
  conditional: () => ({
    id: uid('step'),
    kind: 'conditional',
    enabled: true,
    test: 'contains',
    value: '',
    caseSensitive: false,
    action: 'prefix',
    payload: '',
  }),
  template: () => ({ id: uid('step'), kind: 'template', enabled: true, template: '{name}' }),
  'limit-length': () => ({ id: uid('step'), kind: 'limit-length', enabled: true, max: 64, from: 'end' }),
  sort: () => ({ id: uid('step'), kind: 'sort', enabled: true, direction: 'asc', by: 'natural' }),
  dedupe: () => ({ id: uid('step'), kind: 'dedupe', enabled: true, caseSensitive: false, keep: 'first' }),
  'remove-empty': () => ({ id: uid('step'), kind: 'remove-empty', enabled: true, alsoTrim: false }),
};

/** Cria um passo novo do tipo informado. */
export function createStep(kind) {
  const factory = STEP_FACTORIES[kind];
  if (!factory) throw new Error(`Tipo de passo desconhecido: ${kind}`);
  return factory();
}

/**
 * Normaliza um passo vindo de JSON externo (receitas importadas).
 * Garante id, enabled e kind válidos para não quebrar a engine.
 */
export function normalizeStep(raw) {
  if (!raw || typeof raw !== 'object' || !STEP_FACTORIES[raw.kind]) return null;
  const base = STEP_FACTORIES[raw.kind]();
  return {
    ...base,
    ...raw,
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    enabled: raw.enabled !== false,
  };
}

/** Clona um passo gerando novo id (usado no botão "duplicar"). */
export function cloneStep(step) {
  return { ...structuredClone(step), id: uid('step') };
}

/** Resumo curto exibido no cartão recolhido (progressive disclosure). */
export function summarizeStep(step) {
  switch (step.kind) {
    case 'find-replace':
      return step.find ? `${step.find} → ${step.replace || '∅'}` : '';
    case 'case':
      return step.mode;
    case 'affix':
      return [step.prefix, step.suffix].filter(Boolean).join('…');
    case 'trim':
      return `${step.chars} ${step.from === 'start' ? 'do início' : 'do fim'}`;
    case 'crop':
      return step.marker ? `"${step.marker}"` : '';
    case 'numbering':
      return `${step.start}… ${step.alpha ? 'a,b,c' : `pad ${step.pad}`}`;
    case 'columns':
      return `${step.delimiter} → ${step.output}`;
    case 'conditional':
      return `${step.test} "${step.value}"`;
    case 'template':
      return step.template;
    case 'limit-length':
      return `máx ${step.max}`;
    case 'sort':
      return `${step.by} ${step.direction === 'asc' ? '↑' : '↓'}`;
    case 'dedupe':
      return step.keep === 'first' ? 'manter 1ª' : 'manter última';
    case 'remove-empty':
      return step.alsoTrim ? 'com trim' : '';
    default:
      return '';
  }
}
