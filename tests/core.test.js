/**
 * Testes do núcleo (engine, texto, nomes, scripts, parsers).
 *
 * Zero dependências: usa o test runner nativo do Node (`node --test`), então
 * `npm test` não exige instalar nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { transformNames, runPipeline, compileFindRegex, applyFindReplace, applyColumns } from '../assets/js/core/engine.js';
import { CASE_TRANSFORMS, removeAccents, renderTemplate, toAlphaSequence, padNumber, words } from '../assets/js/core/text.js';
import { splitExtension, validateFilename, resolveCollision, toSafeFilename } from '../assets/js/core/naming.js';
import { generateBashScript, generateBatchScript, generatePythonScript, bashQuote, normalizePairs } from '../assets/js/core/scripts.js';
import { parseTextToRows, splitCsvLine, importSmart } from '../assets/js/core/parser.js';
import { createStep, normalizeStep, summarizeStep } from '../assets/js/core/steps.js';
import { exportResults, parseRecipe } from '../assets/js/core/exporters.js';
import { BUILDIN_RECIPES } from '../assets/js/core/presets.js';

/* ------------------------------ helpers ------------------------------ */

const step = (overrides) => ({ id: 'x', kind: 'case', enabled: true, ...overrides });
const fixedNow = new Date('2024-05-13T14:32:00Z');

/* ---------------------------- extensões ---------------------------- */

test('splitExtension trata casos de borda', () => {
  assert.deepEqual(splitExtension('foto.jpg'), { name: 'foto', extension: '.jpg' });
  assert.deepEqual(splitExtension('arquivo.tar.gz'), { name: 'arquivo.tar', extension: '.gz' });
  assert.deepEqual(splitExtension('.bashrc'), { name: '.bashrc', extension: '' });
  assert.deepEqual(splitExtension('arquivo.'), { name: 'arquivo.', extension: '' });
  assert.deepEqual(splitExtension('sem_extensao'), { name: 'sem_extensao', extension: '' });
});

test('preservar extensão mantém o sufixo intacto', () => {
  const out = transformNames(
    ['Relatório Final.PDF'],
    [step({ kind: 'case', mode: 'lower' })],
  );
  assert.deepEqual(out, ['relatório final.PDF']);
});

test('sem preservar extensão, o ponto entra na transformação', () => {
  const out = transformNames(['Foto.JPG'], [step({ kind: 'case', mode: 'upper' })], { preserveExtension: false });
  assert.deepEqual(out, ['FOTO.JPG']);
});

/* ----------------------------- case ----------------------------- */

test('camelCase, snake_case, kebab-case e slug', () => {
  assert.equal(CASE_TRANSFORMS.camel('meu arquivo final'), 'meuArquivoFinal');
  assert.equal(CASE_TRANSFORMS.pascal('meu_arquivo final'), 'MeuArquivoFinal');
  assert.equal(CASE_TRANSFORMS.snake('Meu Arquivo Final'), 'meu_arquivo_final');
  assert.equal(CASE_TRANSFORMS.kebab('Meu Arquivo Final'), 'meu-arquivo-final');
  assert.equal(CASE_TRANSFORMS.slug('Ação & Reação — 2024'), 'acao-reacao-2024');
});

test('camelCase respeita fronteiras já existentes', () => {
  assert.equal(CASE_TRANSFORMS.camel('meuArquivoFinal'), 'meuArquivoFinal');
  assert.deepEqual(words('meuArquivo_Final 2024'), ['meu', 'Arquivo', 'Final', '2024']);
});

test('removeAccents cobre ligaduras', () => {
  assert.equal(removeAccents('Ação ß Ødegaard Łódź'), 'Acao ss Odegaard Lodz');
});

test('title mantém preposições em minúsculo', () => {
  assert.equal(CASE_TRANSFORMS.title('a casa de papel e o mar'), 'A Casa de Papel e o Mar');
});

/* -------------------------- find & replace -------------------------- */

test('find/replace literal escapa metacaracteres', () => {
  assert.equal(applyFindReplace('valor (2).pdf', { find: '(2)', replace: '', useRegex: false }), 'valor .pdf');
});

test('regex usa grupos de captura', () => {
  assert.equal(
    applyFindReplace('SILVA Joao', { find: '(\\w+) (\\w+)', replace: '$2 $1', useRegex: true }),
    'Joao SILVA',
  );
  // Com acentos é preciso usar uma classe Unicode-aware (comportamento do JS).
  assert.equal(
    applyFindReplace('SILVA, João', { find: '([\\p{L}]+), ([\\p{L}]+)', replace: '$2 $1', useRegex: true }),
    'João SILVA',
  );
});

test('regex inválido devolve null e o passo é ignorado', () => {
  assert.equal(compileFindRegex({ find: '([', useRegex: true }), null);
  assert.equal(applyFindReplace('abc', { find: '([', replace: 'x', useRegex: true }), 'abc');
});

test('palavra inteira não casa substrings', () => {
  // \b não considera "_" como separador: usamos um separador explícito para provar o comportamento.
  const out = transformNames(['foto final.jpg', 'fotografia.jpg'], [
    { id: 'a', kind: 'find-replace', enabled: true, find: 'foto', replace: 'X', useRegex: false, wholeWord: true, caseSensitive: true, target: 'name' },
  ]);
  assert.deepEqual(out, ['X final.jpg', 'fotografia.jpg']);
});

/* ---------------------------- numeração ---------------------------- */

test('numeração com prefixo, zeros e separador', () => {
  const out = transformNames(
    ['a.jpg', 'b.jpg', 'c.jpg'],
    [{ id: 'n', kind: 'numbering', enabled: true, start: 1, step: 1, pad: 3, separator: '_', position: 'prefix', alpha: false, groupSize: 0, skipEmpty: true }],
  );
  assert.deepEqual(out, ['001_a.jpg', '002_b.jpg', '003_c.jpg']);
});

test('numeração alfanabética e grupos', () => {
  const out = transformNames(
    ['a', 'b', 'c', 'd'],
    [{ id: 'n', kind: 'numbering', enabled: true, start: 1, step: 1, pad: 0, separator: '', position: 'suffix', alpha: true, groupSize: 2, skipEmpty: false }],
  );
  // groupSize=2 reinicia a cada 2 linhas: 1, 2, 1, 2 (alfabético: a, b, a, b)
  assert.deepEqual(out, ['aa', 'bb', 'ca', 'db']);
});

test('toAlphaSequence e padNumber', () => {
  assert.equal(toAlphaSequence(1), 'a');
  assert.equal(toAlphaSequence(26), 'z');
  assert.equal(toAlphaSequence(27), 'aa');
  assert.equal(toAlphaSequence(52), 'az');
  assert.equal(padNumber(7, 3), '007');
});

/* ------------------------- template e data ------------------------- */

test('renderTemplate injeta data determinística', () => {
  const out = renderTemplate('{date}_{nnn}_{name}.{ext}', {
    name: 'foto',
    ext: '.jpg',
    index: 4,
    date: fixedNow,
  });
  // fixedNow em UTC-3 (America/Sao_Paulo) = 13/05 11:32 local em UTC; usamos getters locais.
  assert.match(out, /^\d{4}-\d{2}-\d{2}_005_foto\.jpg$/);
});

test('renderTemplate preserva placeholders desconhecidos', () => {
  assert.equal(renderTemplate('{name}{desconhecido}', { name: 'a' }), 'a{desconhecido}');
});

/* ------------------------------ colunas ---------------------------- */

test('colunas reorganizam campos', () => {
  assert.equal(applyColumns('SILVA_João', { delimiter: '_', delimiterMode: 'char', output: '{2} {1}' }), 'João SILVA');
  assert.equal(applyColumns('a-b-c', { delimiter: '-', delimiterMode: 'char', output: '{3}.{1}' }), 'c.a');
  assert.equal(applyColumns('a b c', { delimiter: ' ', delimiterMode: 'space', output: '{last}' }), 'c');
});

/* --------------------------- passos de lista --------------------------- */

test('dedupe ignora caixa e mantém a primeira', () => {
  const out = transformNames(['A', 'a', 'B', 'b'], [
    { id: 'd', kind: 'dedupe', enabled: true, caseSensitive: false, keep: 'first' },
  ]);
  assert.deepEqual(out, ['A', 'B']);
});

test('remove-empty remove linhas vazias após transformação', () => {
  const out = transformNames(['a', 'b'], [
    { id: 'c', kind: 'crop', enabled: true, marker: 'a', keep: 'before', includeMarker: false, lastOccurrence: false },
    { id: 'r', kind: 'remove-empty', enabled: true, alsoTrim: false },
  ]);
  assert.deepEqual(out, ['b']);
});

test('sort natural ordena 1, 2, 10', () => {
  const out = transformNames(['item10', 'item2', 'item1'], [
    { id: 's', kind: 'sort', enabled: true, direction: 'asc', by: 'natural' },
  ]);
  assert.deepEqual(out, ['item1', 'item2', 'item10']);
});

test('condicional aplica só quando casa', () => {
  const out = transformNames(['IMG_001.jpg', 'doc.pdf'], [
    { id: 'c', kind: 'conditional', enabled: true, test: 'starts-with', value: 'IMG_', caseSensitive: false, action: 'prefix', payload: 'foto_' },
  ]);
  assert.deepEqual(out, ['foto_IMG_001.jpg', 'doc.pdf']);
});

test('passos desativados não são aplicados', () => {
  const out = transformNames(['abc'], [{ id: 'x', kind: 'case', enabled: false, mode: 'upper' }]);
  assert.deepEqual(out, ['abc']);
});

test('linha travada nunca é transformada', () => {
  const rows = [
    { id: 'r1', originalName: 'livre.txt', locked: false, preserveExt: null },
    { id: 'r2', originalName: 'travada.txt', locked: true, preserveExt: null },
  ];
  const { results } = runPipeline(rows, [{ id: 'u', kind: 'case', enabled: true, mode: 'upper' }], {
    preserveExtension: true,
    contentMode: 'filenames',
  });
  assert.equal(results[0].after, 'LIVRE.txt');
  assert.equal(results[1].after, 'travada.txt');
});

/* ---------------------------- estatísticas ---------------------------- */

test('stats contabiliza alterados, removidos e duplicados', () => {
  const rows = ['a.txt', 'b.txt', 'b.txt', 'c.txt'].map((name, index) => ({
    id: `r${index}`,
    originalName: name,
    locked: false,
    preserveExt: null,
  }));
  const { stats } = runPipeline(rows, [{ id: 'u', kind: 'case', enabled: true, mode: 'upper' }], {
    preserveExtension: true,
    contentMode: 'filenames',
  });
  assert.equal(stats.inputLines, 4);
  assert.equal(stats.outputLines, 4);
  assert.equal(stats.changed, 4);
  assert.equal(stats.duplicates, 1);
});

/* ----------------------------- validação ----------------------------- */

test('validateFilename detecta caracteres inválidos e reservados', () => {
  assert.equal(validateFilename('a:b.txt').length, 1);
  assert.equal(validateFilename('CON.txt').some((issue) => issue.code === 'reserved'), true);
  assert.equal(validateFilename('normal.txt').length, 0);
  assert.equal(validateFilename('termina_em_ponto.').some((issue) => issue.code === 'trailing-dot'), true);
  assert.equal(validateFilename(`${'a'.repeat(300)}.txt`).some((issue) => issue.code === 'too-long'), true);
});

test('resolveCollision gera nomes livres', () => {
  const used = new Set(['foto.jpg', 'foto (2).jpg']);
  assert.equal(resolveCollision('foto.jpg', used), 'foto (3).jpg');
  assert.equal(resolveCollision('outra.jpg', used), 'outra.jpg');
});

test('toSafeFilename limpa nomes', () => {
  assert.equal(toSafeFilename('Ação/2024: relatório?'), 'Acao-2024-relatorio');
});

/* ------------------------------- scripts ------------------------------- */

test('bash escapa aspas simples corretamente', () => {
  assert.equal(bashQuote("it's"), `'it'\\''s'`);
  const script = generateBashScript([{ from: "it's.txt", to: 'novo.txt' }], { now: fixedNow });
  assert.match(script, /mv -- 'it'\\''s\.txt' 'novo\.txt'/);
  assert.match(script, /#!/);
});

test('script bash inclui dry-run quando pedido', () => {
  const script = generateBashScript([{ from: 'a.txt', to: 'b.txt' }], { dryRun: true });
  assert.match(script, /DRY/);
  assert.doesNotMatch(script, /^\s*mv --/m);
});

test('batch escapa % e usa CRLF', () => {
  const script = generateBatchScript([{ from: '100%.txt', to: 'novo.txt' }]);
  assert.ok(script.includes('\r\n'));
  assert.ok(script.includes('100%%.txt'));
});

test('python gera lista de pares válida', () => {
  const script = generatePythonScript([{ from: "a'b.txt", to: 'c.txt' }]);
  assert.match(script, /PAIRS = \[/);
  assert.ok(script.includes("'a\\'b.txt'"));
});

test('pares idênticos/vazios são descartados', () => {
  assert.deepEqual(normalizePairs([{ from: 'a', to: 'a' }, { from: '', to: 'b' }, { from: 'x', to: 'y' }]), [
    { from: 'x', to: 'y' },
  ]);
});

/* ------------------------------- parser ------------------------------- */

test('parseTextToRows remove vazios e normaliza quebras', () => {
  const rows = parseTextToRows('a\r\nb\n\nc');
  assert.deepEqual(rows.map((row) => row.originalName), ['a', 'b', 'c']);
});

test('splitCsvLine respeita aspas', () => {
  assert.deepEqual(splitCsvLine('a,"b,c",d'), ['a', 'b,c', 'd']);
  assert.deepEqual(splitCsvLine('"diz ""oi""",x'), ['diz "oi"', 'x']);
});

test('importSmart detecta JSON e CSV', () => {
  assert.deepEqual(importSmart('["a","b"]'), ['a', 'b']);
  assert.deepEqual(importSmart('nome,idade\nAna,30\nBia,20', 'lista.csv'), ['nome', 'Ana', 'Bia']);
});

/* ------------------------------- passos ------------------------------- */

test('createStep gera ids únicos e normalizeStep descarta tipos inválidos', () => {
  const a = createStep('case');
  const b = createStep('case');
  assert.notEqual(a.id, b.id);
  assert.equal(normalizeStep({ kind: 'inexistente' }), null);
  assert.equal(normalizeStep({ kind: 'case', mode: 'upper' }).mode, 'upper');
});

test('summarizeStep produz resumo legível', () => {
  assert.equal(summarizeStep({ kind: 'case', mode: 'slug' }), 'slug');
  assert.match(summarizeStep({ kind: 'find-replace', find: 'a', replace: 'b' }), /a → b/);
});

/* ------------------------------ receitas ------------------------------ */

test('todas as receitas embutidas executam sem erro', () => {
  for (const recipe of BUILDIN_RECIPES) {
    const out = transformNames(['Relatório Final (2).PDF', 'IMG_001.jpg', 'a_b_c.txt'], recipe.steps, { now: fixedNow });
    assert.ok(Array.isArray(out), recipe.id);
    assert.ok(out.length > 0, recipe.id);
  }
});

test('parseRecipe valida JSON e rejeita lixo', () => {
  assert.equal(parseRecipe('not json').ok, false);
  assert.equal(parseRecipe('{"steps": []}').ok, true);
  const parsed = parseRecipe('{"name":"Teste","steps":[{"kind":"case","mode":"upper"}]}');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.recipe.name, 'Teste');
});

/* ------------------------------ exports ------------------------------ */

test('exportResults gera csv escapado e txt simples', () => {
  const results = [
    { id: '1', before: 'a,b.txt', after: 'a,b.txt', changed: false, removed: false, issues: [] },
    { id: '2', before: 'x.txt', after: 'y.txt', changed: true, removed: false, issues: [] },
  ];
  assert.equal(exportResults(results, 'txt'), 'a,b.txt\ny.txt');
  const csv = exportResults(results, 'csv');
  assert.match(csv, /"a,b\.txt"/);
  assert.match(csv, /indice,original,novo,alterado,problemas/);
});

/* --------------------------- performance --------------------------- */

test('processa 20.000 linhas em tempo aceitável', () => {
  const names = Array.from({ length: 20_000 }, (_, index) => `Arquivo ${index} (cópia).JPG`);
  const pipeline = [
    { id: 'f', kind: 'find-replace', enabled: true, find: '\\s*\\(c[oó]pia\\)', replace: '', useRegex: true, caseSensitive: false, wholeWord: false, target: 'name' },
    { id: 'c', kind: 'case', enabled: true, mode: 'kebab' },
    { id: 'n', kind: 'numbering', enabled: true, start: 1, step: 1, pad: 4, separator: '-', position: 'prefix', alpha: false, groupSize: 0, skipEmpty: true },
  ];

  const start = Date.now();
  const out = transformNames(names, pipeline, { now: fixedNow });
  const duration = Date.now() - start;

  assert.equal(out.length, 20_000);
  assert.match(out[0], /^0001-arquivo-0\.JPG$/);
  assert.ok(duration < 3000, `demorou ${duration}ms`);
});
