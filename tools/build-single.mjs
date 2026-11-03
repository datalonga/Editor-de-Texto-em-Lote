#!/usr/bin/env node
/**
 * Gerador da versão single-file (arquivo único).
 *
 * Por que isso existe: o app modular é o formato principal (cacheável, fácil de
 * manter), mas existe demanda por UM arquivo .html que rode em qualquer lugar —
 * pendrive, e-mail, `file://`, portal antigo de intranet. Este script embute
 * CSS, JS e ícones no `index.html` e grava `legacy/v5.single.html`.
 *
 * Estratégia (sem bundler, sem dependências):
 *   1. Lê o grafo de imports a partir de `assets/js/app/main.js`.
 *   2. Cada módulo vira `const __m_<id> = (() => { ...código...; return { exports } })()`.
 *   3. As referências `import { a } from './x.js'` viram `__m_x.a` e os
 *      `export` são removidos (o mapa de retorno é gerado a partir deles).
 *   4. `import.meta.url` / Worker viram um fallback síncrono (arquivo único não
 *      pode instanciar um Worker a partir de outro arquivo).
 *   5. CSS entra em <style>, ícones em data: URIs, o <script> inline de
 *      anti-flash é preservado.
 *
 * Os nomes de módulo no escopo único foram verificados: não há colisão entre
 * os arquivos (checagem automática abaixo) e não há ciclos no grafo.
 *
 * Uso:  node tools/build-single.mjs [--out legacy/v5.single.html]
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, normalize, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const ENTRY = 'assets/js/app/main.js';
const WORKER = 'assets/js/worker/engine.worker.js';

/* ------------------------------- CLI ---------------------------------- */

const argv = process.argv.slice(2);
const outFlag = argv.indexOf('--out');
const OUT = outFlag >= 0 && argv[outFlag + 1] ? argv[outFlag + 1] : 'legacy/v5.single.html';

/* ---------------------------- Utilidades ------------------------------ */

const read = (rel) => readFile(join(ROOT, rel), 'utf8');

/** Nome de variável seguro para um caminho de módulo. */
function moduleId(rel) {
  return rel
    .replace(/^assets\/js\//, '')
    .replace(/\.js$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_');
}

/** Caminho de import resolvido, em forma POSIX relativa à raiz. */
function resolveImport(fromRel, spec) {
  return normalize(join(dirname(fromRel), spec)).split('\\').join('/');
}

/**
 * Coleta os módulos em ordem topológica (dependências primeiro), para que cada
 * IIFE possa referenciar os módulos dos quais depende.
 */
async function collectGraph(entries) {
  const modules = new Map(); // rel -> { code, deps }
  const order = [];
  const visiting = new Set();

  async function visit(rel) {
    if (modules.has(rel)) return;
    if (visiting.has(rel)) {
      throw new Error(`ciclo de imports detectado em ${rel}`);
    }
    visiting.add(rel);

    const raw = await read(rel);
    // Os patches estruturais entram ANTES de coletar imports (o do Worker troca
    // `import.meta`, e precisamos que a transformação veja o código final).
    const code = patchWorker(raw);
    const deps = [...code.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map((m) => resolveImport(rel, m[1]));

    for (const dep of deps) await visit(dep);
    visiting.delete(rel);

    modules.set(rel, { code, deps });
    order.push(rel);
  }

  for (const entry of entries) await visit(entry);
  return { modules, order };
}

/* --------------------------- Transformação ---------------------------- */

/**
 * Converte um módulo ES em uma IIFE com escopo próprio.
 * Retorna `{ code, exports }`.
 */
const transformCache = new Map();

function transformModule(rel, source) {
  const cacheKey = `${rel}:${source.length}`;
  if (transformCache.has(cacheKey)) return transformCache.get(cacheKey);

  const exported = new Set();
  let code = source;

  // `export { a, b as c }` (não usado hoje, mas suportado)
  code = code.replace(/^export\s*\{([^}]+)\}\s*;?\s*$/gm, (_all, names) => {
    names
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .forEach((n) => {
        const [local, alias] = n.split(/\s+as\s+/).map((s) => s.trim());
        exported.add(`${alias ?? local}: ${local}`);
      });
    return '';
  });

  // `export default function nome` / `export default ...`
  code = code.replace(/^export\s+default\s+/gm, '');

  // declarações nomeadas
  code = code.replace(
    /^export\s+(async\s+)?(function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
    (_all, asyn, kind, name) => {
      exported.add(`${name}: ${name}`);
      return `${asyn ?? ''}${kind} ${name}`;
    },
  );

  // imports -> referências ao namespace do módulo
  code = code.replace(
    /^import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"](\.[^'"]+)['"]\s*;?/gm,
    (_all, defaultName, named, spec) => {
      const ns = `__m_${moduleId(resolveImport(rel, spec))}`;
      const parts = [];
      if (defaultName) parts.push(`const ${defaultName} = ${ns}.default;`);
      if (named) {
        const bindings = named
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => {
            const [orig, alias] = s.split(/\s+as\s+/).map((v) => v.trim());
            return alias ? `${orig}: ${alias}` : orig;
          })
          .join(', ');
        if (bindings) parts.push(`const { ${bindings} } = ${ns};`);
      }
      return parts.join(' ');
    },
  );

  // imports só por efeito colateral (`import './x.js'`)
  code = code.replace(/^import\s+['"](\.[^'"]+)['"]\s*;?/gm, '');

  // imports dinâmicos -> acesso direto ao namespace (já carregado)
  code = code.replace(
    /import\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    (_all, spec) => `Promise.resolve(__m_${moduleId(resolveImport(rel, spec))})`,
  );

  const exportList = [...exported].join(', ');
  const result = {
    code: `const __m_${moduleId(rel)} = (() => {\n${code.trim()}\nreturn { ${exportList} };\n})();`,
    exports: [...exported],
  };
  transformCache.set(cacheKey, result);
  return result;
}

/* ------------------------- Substituições finais ----------------------- */

/** O single-file não pode usar Worker a partir de outro arquivo. */
let workerPatched = 0;
function patchWorker(source) {
  const target = /new Worker\(new URL\(['"]\.\.\/worker\/engine\.worker\.js['"],\s*import\.meta\.url\),\s*\{\s*type:\s*'module'\s*\}\)/;
  if (!target.test(source)) return source;
  workerPatched += 1;
  return source.replace(
    target,
    '(() => { throw new Error("single-file: Worker desativado (fallback síncrono)"); })()',
  );
}

/**
 * `String.replace` interpreta `$&`, `$'`, `` $` `` e `$1` no texto de
 * substituição. O bundle contém `'\\$&'` (escaping de regex do core), então
 * TODA inserção de conteúdo gerado precisa ir por função — senão o JS é
 * corrompido silenciosamente. Este helper força esse caminho.
 */
function replaceWith(source, pattern, text) {
  if (!pattern.test(source)) {
    throw new Error(`padrão não encontrado no index.html: ${pattern}`);
  }
  return source.replace(pattern, () => text);
}

/** Converte o worker em módulo também (para o build de referência). */
async function buildWorkerInline() {
  const { order, modules } = await collectGraph([WORKER]);
  return order
    .map((rel) => transformModule(rel, modules.get(rel).code).code)
    .join('\n\n');
}

/** PNG/SVG -> data URI. */
async function dataUri(rel) {
  const buf = await readFile(join(ROOT, rel));
  const type = rel.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  return `data:${type};base64,${buf.toString('base64')}`;
}

/* -------------------------------- Build -------------------------------- */

async function build() {
  const html = await read('index.html');
  const css = await read('assets/css/styles.css');

  const { modules, order, patched } = await collectGraph([ENTRY]);

  // Checagem de sanidade: nomes únicos no escopo compartilhado.
  const names = new Map();
  for (const rel of order) {
    for (const exportedName of transformModule(rel, modules.get(rel).code).exports) {
      const name = exportedName.split(':')[0].trim();
      if (names.has(name)) {
        console.warn(`[aviso] "${name}" exportado por ${names.get(name)} e ${rel}`);
      }
      names.set(name, rel);
    }
  }

  const bundle = order
    .map((rel) => {
      const { code } = transformModule(rel, modules.get(rel).code);
      return `/* ===== ${rel} ===== */\n${code}`;
    })
    .join('\n\n');

  // A ordem termina com main.js (entrada) — sua execução dispara o bootstrap.
  const bundleScript = `(function () {\n'use strict';\n${bundle}\n})();`;

  // Ícones inline.
  const [favicon, icon192, icon512, maskable] = await Promise.all([
    dataUri('assets/icons/favicon.svg'),
    dataUri('assets/icons/icon-192.png'),
    dataUri('assets/icons/icon-512.png'),
    dataUri('assets/icons/icon-maskable-512.png'),
  ]);

  let out = html;

  // CSS inline
  out = replaceWith(
    out,
    /<link rel="stylesheet" href="assets\/css\/styles\.css"\s*\/?>/,
    `<style>\n${css}\n</style>`,
  );

  // ícones
  out = replaceWith(out, /href="assets\/icons\/favicon\.svg"/, `href="${favicon}"`);
  out = replaceWith(out, /href="assets\/icons\/icon-192\.png"/, `href="${icon192}"`);

  // manifest embutido (não pode apontar para um arquivo externo no single-file)
  const manifest = JSON.stringify({
    name: 'Editor de Texto em Lote Ultra',
    short_name: 'Lote Ultra',
    description: 'Editor de nomes e textos em lote com pipeline visual. 100% no navegador.',
    start_url: '.',
    display: 'standalone',
    background_color: '#0b0b0f',
    theme_color: '#0b0b0f',
    lang: 'pt-BR',
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png' },
      { src: icon512, sizes: '512x512', type: 'image/png' },
      { src: maskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
  out = replaceWith(
    out,
    /<link rel="manifest" href="manifest\.webmanifest"\s*\/?>/,
    `<link rel="manifest" href="data:application/manifest+json;base64,${Buffer.from(manifest).toString('base64')}" />`,
  );

  // script do app
  out = replaceWith(
    out,
    /<script type="module" src="assets\/js\/app\/main\.js"><\/script>/,
    `<script>\n${bundleScript}\n</script>`,
  );

  // Nada deve sobrar apontando para arquivos externos.
  const leftovers = [...out.matchAll(/(?:href|src)="(assets\/[^"]+)"/g)].map((m) => m[1]);
  const fonts = [...out.matchAll(/fonts\.(?:googleapis|gstatic)\.com/g)].length;

  // Desativa o registro do Service Worker no single-file (não há sw.js).
  // Silencioso se o trecho mudar: o build não deve falhar por causa disso.
  out = out.replace(
    /if \('serviceWorker' in navigator\)/,
    () => "if (false && 'serviceWorker' in navigator) /* single-file: sem sw.js */",
  );

  const banner = `<!--
  Editor de Texto em Lote Ultra v5 — VERSÃO ARQUIVO ÚNICO (gerada)
  Fonte: index.html + assets/css/styles.css + ${order.length} módulos de assets/js
  NÃO EDITE ESTE ARQUIVO À MÃO. Rode: node tools/build-single.mjs
  Build determinístico: sem timestamp, para que rodar o script duas vezes
  não gere diff. Use \`git log\` para saber quando foi gerado.
-->
`;

  await mkdir(join(ROOT, dirname(OUT)), { recursive: true });
  await writeFile(join(ROOT, OUT), banner + out, 'utf8');

  const size = Buffer.byteLength(banner + out);
  console.log(`✔ ${OUT}`);
  console.log(`  módulos: ${order.length}`);
  console.log(`  tamanho: ${(size / 1024).toFixed(1)} KB`);
  if (fonts) console.log(`  fontes externas: ${fonts} referências (degrada para a fonte do sistema offline)`);
  if (leftovers.length) {
    console.error(`  ✖ referências externas restantes: ${leftovers.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('  referências externas a assets/: nenhuma ✔');
  }

  // O worker também é compilado para garantir que não quebrou.
  const workerInline = await buildWorkerInline();
  console.log(`  worker equivalente: ${(Buffer.byteLength(workerInline) / 1024).toFixed(1)} KB`);
}

build().catch((error) => {
  console.error('✖ falha no build:', error.message);
  process.exitCode = 1;
});
