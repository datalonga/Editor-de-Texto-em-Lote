/**
 * PRESETS / RECEITAS EMBUTIDAS
 * ============================
 * Receitas são apenas pipelines serializáveis. Os presets usam ids fixos e
 * legíveis (em vez de aleatórios) para que sejam estáveis entre sessões e
 * possam ser referenciados em docs/testes.
 */

export const BUILDIN_RECIPES = [
  {
    id: 'clean-downloads',
    name: 'Limpar nomes de download',
    description: 'Remove " - Cópia", "(1)" e sufixos de download, normaliza espaços.',
    builtin: true,
    steps: [
      {
        id: 'clean-downloads-1',
        kind: 'find-replace',
        enabled: true,
        find: '\\s*(\\(\\d+\\)|[-_ ]*c[oó]pia|c[oó]pia de)',
        replace: '',
        useRegex: true,
        caseSensitive: false,
        wholeWord: false,
        target: 'name',
      },
      { id: 'clean-downloads-2', kind: 'case', enabled: true, mode: 'normalize-spaces' },
      { id: 'clean-downloads-3', kind: 'remove-empty', enabled: true, alsoTrim: true },
    ],
  },
  {
    id: 'photos-date-seq',
    name: 'Padronizar fotos (data + sequência)',
    description: '2024-05-13_001 — ideal para álbuns, acervos e arquivos de câmera.',
    builtin: true,
    steps: [
      { id: 'photos-1', kind: 'template', enabled: true, template: '{date}_' },
      {
        id: 'photos-2',
        kind: 'numbering',
        enabled: true,
        start: 1,
        step: 1,
        pad: 3,
        separator: '',
        position: 'prefix',
        alpha: false,
        groupSize: 0,
        skipEmpty: true,
      },
    ],
  },
  {
    id: 'slug-web',
    name: 'Slug para web',
    description: 'minusculas-sem-acentos-sem-espacos — pronto para URLs e imagens de site.',
    builtin: true,
    steps: [{ id: 'slug-1', kind: 'case', enabled: true, mode: 'slug' }],
  },
  {
    id: 'camel-case',
    name: 'camelCase para código',
    description: 'Transforma nomes bagunçados em camelCase válido.',
    builtin: true,
    steps: [
      { id: 'camel-1', kind: 'case', enabled: true, mode: 'normalize-spaces' },
      { id: 'camel-2', kind: 'case', enabled: true, mode: 'camel' },
    ],
  },
  {
    id: 'snake-case',
    name: 'snake_case',
    description: 'Nomes em snake_case, sem acentos e sem caracteres especiais.',
    builtin: true,
    steps: [
      { id: 'snake-1', kind: 'case', enabled: true, mode: 'remove-accents' },
      { id: 'snake-2', kind: 'case', enabled: true, mode: 'snake' },
    ],
  },
  {
    id: 'abnt-pdfs',
    name: 'Preparar PDFs para ABNT',
    description: 'AUTOR_Titulo_Ano — organiza artigos e teses em PDF.',
    builtin: true,
    steps: [
      { id: 'abnt-1', kind: 'case', enabled: true, mode: 'remove-special' },
      { id: 'abnt-2', kind: 'case', enabled: true, mode: 'normalize-spaces' },
      { id: 'abnt-3', kind: 'case', enabled: true, mode: 'snake' },
    ],
  },
  {
    id: 'music-organize',
    name: 'Organizar músicas',
    description: 'Artista - Título (01): troca separadores e numera em sequência.',
    builtin: true,
    steps: [
      {
        id: 'music-1',
        kind: 'find-replace',
        enabled: true,
        find: '^\\s*\\d+\\s*[-._)]\\s*',
        replace: '',
        useRegex: true,
        caseSensitive: false,
        wholeWord: false,
        target: 'name',
      },
      { id: 'music-2', kind: 'case', enabled: true, mode: 'title' },
      {
        id: 'music-3',
        kind: 'numbering',
        enabled: true,
        start: 1,
        step: 1,
        pad: 2,
        separator: ' - ',
        position: 'suffix',
        alpha: false,
        groupSize: 0,
        skipEmpty: true,
      },
    ],
  },
  {
    id: 'clean-big-list',
    name: 'Higienizar lista grande',
    description: 'Remove vazias, duplicados (ignorando caixa) e ordena naturalmente.',
    builtin: true,
    steps: [
      { id: 'big-1', kind: 'remove-empty', enabled: true, alsoTrim: true },
      { id: 'big-2', kind: 'dedupe', enabled: true, caseSensitive: false, keep: 'first' },
      { id: 'big-3', kind: 'sort', enabled: true, direction: 'asc', by: 'natural' },
    ],
  },
  {
    id: 'strip-leading-numbers',
    name: 'Remover numeração do início',
    description: 'Tira prefixos tipo "01 - ", "12. ", "(3) ".',
    builtin: true,
    steps: [
      {
        id: 'strip-1',
        kind: 'find-replace',
        enabled: true,
        find: '^\\s*[([{]?\\d+[)\\]]?\\s*[-._)]?\\s*',
        replace: '',
        useRegex: true,
        caseSensitive: false,
        wholeWord: false,
        target: 'name',
      },
      { id: 'strip-2', kind: 'remove-empty', enabled: true, alsoTrim: true },
    ],
  },
  {
    id: 'csv-reorder',
    name: 'Reordenar colunas (Sobrenome, Nome)',
    description: 'Converte "Sobrenome_Nome" em "Nome Sobrenome".',
    builtin: true,
    steps: [
      { id: 'csv-1', kind: 'columns', enabled: true, delimiter: '_', delimiterMode: 'char', output: '{2} {1}', dropEmpty: false },
    ],
  },
  {
    id: 'prefix-date',
    name: 'Prefixar com data',
    description: 'YYYY-MM-DD_ antes de cada nome.',
    builtin: true,
    steps: [{ id: 'date-1', kind: 'template', enabled: true, template: '{date}_' }],
  },
  {
    id: 'safe-filenames',
    name: 'Nomes seguros (multi-OS)',
    description: 'Remove acentos e caracteres inválidos, limita a 64 caracteres.',
    builtin: true,
    steps: [
      { id: 'safe-1', kind: 'case', enabled: true, mode: 'remove-accents' },
      { id: 'safe-2', kind: 'case', enabled: true, mode: 'remove-special' },
      { id: 'safe-3', kind: 'find-replace', enabled: true, find: '\\s+', replace: '_', useRegex: true, caseSensitive: false, wholeWord: false, target: 'name' },
      { id: 'safe-4', kind: 'limit-length', enabled: true, max: 64, from: 'end' },
    ],
  },
];

export function findRecipe(id) {
  return BUILDIN_RECIPES.find((recipe) => recipe.id === id) ?? null;
}
