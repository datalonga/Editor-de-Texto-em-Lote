/**
 * GERADORES DE SCRIPT DE RENOMEAÇÃO
 * =================================
 * Cada gerador é puro: (pares, opções) => string. Sem DOM.
 *
 * Objetivo de qualidade: um script gerado NUNCA deve renomear errado. Por isso
 * cada linguagem tem seu próprio escaping, verificação de existência do arquivo,
 * proteção contra sobrescrita e log. Testes cobrem nomes com aspas, $, %, espaços,
 * acentos e emojis.
 */

export const SCRIPT_META = {
  bash: { label: 'Bash (.sh)', filename: 'renomear.sh', hint: 'Linux, macOS e WSL', mime: 'text/x-shellscript' },
  bat: { label: 'Windows (.bat)', filename: 'renomear.bat', hint: 'cmd.exe clássico', mime: 'application/x-bat' },
  powershell: {
    label: 'PowerShell (.ps1)',
    filename: 'renomear.ps1',
    hint: 'Windows moderno',
    mime: 'text/plain',
  },
  python: { label: 'Python (.py)', filename: 'renomear.py', hint: 'Multiplataforma', mime: 'text/x-python' },
  node: { label: 'Node.js (.mjs)', filename: 'renomear.mjs', hint: 'Multiplataforma', mime: 'text/javascript' },
};

const DEFAULTS = {
  title: 'renomear',
  directory: '',
  backup: false,
  log: true,
  dryRun: false,
  continueOnError: true,
  avoidOverwrite: true,
};

/** Remove pares vazios ou idênticos — não faz sentido renomear para o mesmo nome. */
export function normalizePairs(pairs) {
  return (pairs ?? []).filter((pair) => pair && pair.from && pair.to && pair.from !== pair.to);
}

function withDefaults(options = {}) {
  return { ...DEFAULTS, ...options };
}

function commentHeader(symbol, opts, count, now) {
  return [
    `${symbol} Script de renomeação em lote — Editor de Texto em Lote Ultra v5.0`,
    `${symbol} Gerado em ${now.toISOString()}`,
    `${symbol} ${count} renomeação(ões)${opts.dryRun ? ' (DRY-RUN: nada será alterado)' : ''}`,
    `${symbol} Revise o conteúdo antes de executar.`,
  ].join('\n');
}

/* ------------------------------ escaping ------------------------------ */

/** Aspas simples POSIX: seguras para qualquer caractere, exceto a própria aspa. */
export function bashQuote(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}

/** Escapa % (expansão de variáveis) e aspas duplas do cmd.exe. */
export function batchEscape(text) {
  return String(text).replace(/%/g, '%%').replace(/"/g, '""');
}

/** Aspas simples do PowerShell (duplica a aspa interna). */
export function psQuote(text) {
  return `'${String(text).replace(/'/g, "''")}'`;
}

function pyQuote(text) {
  return `'${String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function jsQuote(text) {
  return JSON.stringify(String(text));
}

/* ------------------------------ Geradores ------------------------------ */

export function generateBashScript(rawPairs, options = {}) {
  const opts = withDefaults(options);
  const pairs = normalizePairs(rawPairs);
  const now = options.now ?? new Date();
  const lines = ['#!/usr/bin/env bash', commentHeader('#', opts, pairs.length, now), 'set -uo pipefail', ''];

  if (opts.directory) lines.push(`cd ${bashQuote(opts.directory)} || exit 1`, '');
  if (opts.log) {
    lines.push(
      'LOG="rename_$(date +%Y%m%d_%H%M%S).log"',
      'log() { printf "%s\\n" "$*" | tee -a "$LOG"; }',
      '',
    );
  } else {
    lines.push('log() { printf "%s\\n" "$*"; }', '');
  }
  if (opts.backup) {
    lines.push('backup() { [ -e "$1" ] && cp -p -- "$1" "$1.bak"; }', '');
  }

  lines.push('renamed=0', 'failed=0', '');

  for (const pair of pairs) {
    const from = bashQuote(pair.from);
    const to = bashQuote(pair.to);
    lines.push(`# ${pair.from} -> ${pair.to}`);
    lines.push(`if [ ! -e ${from} ] && [ ! -e ${from} ]; then`);
    lines.push(`  log "SKIP  ${pair.from}: arquivo não encontrado"; failed=$((failed+1))`);
    lines.push('else');

    const overwriteCheck = opts.avoidOverwrite
      ? [`  if [ -e ${to} ]; then`, `    log "SKIP  ${pair.to}: destino já existe"; failed=$((failed+1))`, '  else']
      : [];
    lines.push(...overwriteCheck);

    const indent = opts.avoidOverwrite ? '    ' : '  ';
    if (opts.dryRun) {
      lines.push(`${indent}log "DRY   ${pair.from} -> ${pair.to}"`);
    } else {
      if (opts.backup) lines.push(`${indent}backup ${from} || true`);
      lines.push(`${indent}if mv -- ${from} ${to}; then`);
      lines.push(`${indent}  log "OK    ${pair.from} -> ${pair.to}"; renamed=$((renamed+1))`);
      lines.push(`${indent}else`);
      lines.push(`${indent}  log "FAIL  ${pair.from} -> ${pair.to}"; failed=$((failed+1))`);
      if (!opts.continueOnError) lines.push(`${indent}  exit 1`);
      lines.push(`${indent}fi`);
    }
    if (opts.avoidOverwrite) lines.push('  fi');
    lines.push('fi', '');
  }

  lines.push('log ""', 'log "Concluído: $renamed renomeado(s), $failed falha(s)."');
  if (opts.log && !opts.dryRun) lines.push('log "Log salvo em $LOG"');
  return lines.join('\n');
}

export function generateBatchScript(rawPairs, options = {}) {
  const opts = withDefaults(options);
  const pairs = normalizePairs(rawPairs);
  const now = options.now ?? new Date();
  // \r\n é obrigatório para .bat funcionar de forma confiável.
  const lines = [
    '@echo off',
    'setlocal enabledelayedexpansion',
    'chcp 65001 >nul',
    commentHeader('rem', opts, pairs.length, now),
    '',
    'set "RENAMED=0"',
    'set "FAILED=0"',
    '',
  ];

  if (opts.directory) lines.push(`cd /d "${batchEscape(opts.directory)}" || exit /b 1`, '');
  if (opts.log) {
    lines.push('set "LOG=rename_%RANDOM%.log"', 'echo. > "%LOG%"', '');
  }

  for (const pair of pairs) {
    const from = batchEscape(pair.from);
    const to = batchEscape(pair.to);
    lines.push(`echo [INFO] ${from} -^> ${to}`);
    lines.push(`if not exist "${from}" (`);
    lines.push('  echo [SKIP] arquivo nao encontrado');
    lines.push('  set /a FAILED+=1');
    lines.push('  goto :next');
    lines.push(')');
    if (opts.avoidOverwrite) {
      lines.push(`if exist "${to}" (`);
      lines.push('  echo [SKIP] destino ja existe');
      lines.push('  set /a FAILED+=1');
      lines.push('  goto :next');
      lines.push(')');
    }
    if (opts.dryRun) {
      lines.push(`echo [DRY] ren "${from}" "${to}"`);
    } else {
      if (opts.backup) lines.push(`copy /y "${from}" "${from}.bak" >nul 2>&1`);
      lines.push(`ren "${from}" "${to}"`);
      lines.push('if errorlevel 1 (');
      lines.push(`  echo [FAIL] "${from}"`);
      lines.push('  set /a FAILED+=1');
      if (!opts.continueOnError) lines.push('  exit /b 1');
      lines.push(') else (');
      lines.push('  echo [OK]');
      lines.push('  set /a RENAMED+=1');
      lines.push(')');
    }
    lines.push(':next', '');
  }

  lines.push('echo.', 'echo Concluido: %RENAMED% renomeado(s), %FAILED% falha(s).');
  lines.push('if not "%RENAMED%%FAILED%"=="00" pause');
  return lines.join('\r\n');
}

export function generatePowerShellScript(rawPairs, options = {}) {
  const opts = withDefaults(options);
  const pairs = normalizePairs(rawPairs);
  const now = options.now ?? new Date();
  const lines = [
    '#Requires -Version 5.1',
    commentHeader('#', opts, pairs.length, now),
    `$ErrorActionPreference = ${opts.continueOnError ? "'Continue'" : "'Stop'"}`,
    '',
  ];

  if (opts.directory) lines.push(`Set-Location -LiteralPath ${psQuote(opts.directory)}`, '');
  if (opts.log) lines.push(`$LogFile = "rename_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"`);
  lines.push('$Renamed = 0', '$Failed = 0', '');
  lines.push('function Write-Log([string]$Message) {');
  lines.push('  Write-Host $Message');
  if (opts.log) lines.push('  Add-Content -LiteralPath $LogFile -Value $Message');
  lines.push('}', '');

  lines.push('$pairs = @(');
  for (const pair of pairs) {
    lines.push(`  [pscustomobject]@{ From = ${psQuote(pair.from)}; To = ${psQuote(pair.to)} }`);
  }
  lines.push(')', '');
  lines.push('foreach ($p in $pairs) {');
  lines.push('  if (-not (Test-Path -LiteralPath $p.From)) {');
  lines.push('    Write-Log "[SKIP] $($p.From) nao encontrado"; $Failed++; continue');
  lines.push('  }');
  if (opts.avoidOverwrite) {
    lines.push('  if (Test-Path -LiteralPath $p.To) {');
    lines.push('    Write-Log "[SKIP] $($p.To) ja existe"; $Failed++; continue');
    lines.push('  }');
  }
  if (opts.dryRun) {
    lines.push('  Write-Log "[DRY]  $($p.From) -> $($p.To)"');
  } else {
    if (opts.backup) lines.push('  Copy-Item -LiteralPath $p.From -Destination "$($p.From).bak" -Force');
    lines.push('  try {');
    lines.push('    Rename-Item -LiteralPath $p.From -NewName $p.To -ErrorAction Stop');
    lines.push('    Write-Log "[OK]   $($p.From) -> $($p.To)"; $Renamed++');
    lines.push('  } catch {');
    lines.push('    Write-Log "[FAIL] $($p.From): $($_.Exception.Message)"; $Failed++');
    if (!opts.continueOnError) lines.push('    throw');
    lines.push('  }');
  }
  lines.push('}', '');
  lines.push('Write-Log "Concluido: $Renamed renomeado(s), $Failed falha(s)."');
  return lines.join('\n');
}

export function generatePythonScript(rawPairs, options = {}) {
  const opts = withDefaults(options);
  const pairs = normalizePairs(rawPairs);
  const now = options.now ?? new Date();
  const lines = [
    '#!/usr/bin/env python3',
    '# -*- coding: utf-8 -*-',
    commentHeader('#', opts, pairs.length, now),
    'from pathlib import Path',
    'import shutil',
    'import sys',
    '',
    `DRY_RUN = ${opts.dryRun ? 'True' : 'False'}`,
    `AVOID_OVERWRITE = ${opts.avoidOverwrite ? 'True' : 'False'}`,
    `BACKUP = ${opts.backup ? 'True' : 'False'}`,
    `CONTINUE_ON_ERROR = ${opts.continueOnError ? 'True' : 'False'}`,
    '',
    opts.directory ? `BASE = Path(${pyQuote(opts.directory)})` : 'BASE = Path.cwd()',
    '',
    'renamed = 0',
    'failed = 0',
    '',
    'def log(message: str) -> None:',
    '    print(message)',
  ];

  if (opts.log) {
    lines.push('    with open("rename.log", "a", encoding="utf-8") as fh:', '        fh.write(message + "\\n")');
  }
  lines.push('');

  lines.push('PAIRS = [');
  for (const pair of pairs) lines.push(`    (${pyQuote(pair.from)}, ${pyQuote(pair.to)}),`);
  lines.push(']', '');

  lines.push(
    'for src_name, dst_name in PAIRS:',
    '    src = BASE / src_name',
    '    dst = BASE / dst_name',
    '    if not src.exists():',
    '        log(f"[SKIP] {src_name} nao encontrado"); failed += 1; continue',
    '    if AVOID_OVERWRITE and dst.exists():',
    '        log(f"[SKIP] {dst_name} ja existe"); failed += 1; continue',
    '    if DRY_RUN:',
    '        log(f"[DRY]  {src_name} -> {dst_name}"); continue',
    '    try:',
    '        if BACKUP:',
    '            shutil.copy2(src, str(src) + ".bak")',
    '        src.rename(dst)',
    '        log(f"[OK]   {src_name} -> {dst_name}"); renamed += 1',
    '    except OSError as exc:',
    '        log(f"[FAIL] {src_name}: {exc}"); failed += 1',
    '        if not CONTINUE_ON_ERROR:',
    '            sys.exit(1)',
    '',
    'log(f"Concluido: {renamed} renomeado(s), {failed} falha(s).")',
  );

  return lines.join('\n');
}

export function generateNodeScript(rawPairs, options = {}) {
  const opts = withDefaults(options);
  const pairs = normalizePairs(rawPairs);
  const now = options.now ?? new Date();
  const lines = [
    '#!/usr/bin/env node',
    commentHeader('//', opts, pairs.length, now),
    "import { rename, access, copyFile, appendFile } from 'node:fs/promises';",
    "import { constants } from 'node:fs';",
    "import path from 'node:path';",
    '',
    `const DRY_RUN = ${opts.dryRun};`,
    `const AVOID_OVERWRITE = ${opts.avoidOverwrite};`,
    `const BACKUP = ${opts.backup};`,
    `const CONTINUE_ON_ERROR = ${opts.continueOnError};`,
    opts.directory ? `const BASE = ${jsQuote(opts.directory)};` : 'const BASE = process.cwd();',
    '',
    'const pairs = [',
  ];
  for (const pair of pairs) lines.push(`  { from: ${jsQuote(pair.from)}, to: ${jsQuote(pair.to)} },`);
  lines.push('];', '');
  lines.push(
    'const exists = (p) => access(p, constants.F_OK).then(() => true, () => false);',
    '',
    'async function log(message) {',
    '  console.log(message);',
  );
  if (opts.log) lines.push("  await appendFile('rename.log', message + '\\n', 'utf8').catch(() => {});");
  lines.push(
    '}',
    '',
    'let renamed = 0;',
    'let failed = 0;',
    '',
    'for (const { from, to } of pairs) {',
    '  const src = path.join(BASE, from);',
    '  const dst = path.join(BASE, to);',
    '  if (!(await exists(src))) { await log(`[SKIP] ${from} nao encontrado`); failed += 1; continue; }',
    '  if (AVOID_OVERWRITE && (await exists(dst))) { await log(`[SKIP] ${to} ja existe`); failed += 1; continue; }',
    '  if (DRY_RUN) { await log(`[DRY]  ${from} -> ${to}`); continue; }',
    '  try {',
    '    if (BACKUP) await copyFile(src, src + ".bak");',
    '    await rename(src, dst);',
    '    await log(`[OK]   ${from} -> ${to}`); renamed += 1;',
    '  } catch (error) {',
    '    await log(`[FAIL] ${from}: ${error.message}`); failed += 1;',
    '    if (!CONTINUE_ON_ERROR) process.exit(1);',
    '  }',
    '}',
    '',
    'await log(`Concluido: ${renamed} renomeado(s), ${failed} falha(s).`);',
  );
  return lines.join('\n');
}

export const SCRIPT_GENERATORS = {
  bash: generateBashScript,
  bat: generateBatchScript,
  powershell: generatePowerShellScript,
  python: generatePythonScript,
  node: generateNodeScript,
};

/** Dispatcher: gera o script da linguagem pedida. */
export function generateScript(language, pairs, options = {}) {
  const generator = SCRIPT_GENERATORS[language];
  if (!generator) throw new Error(`Linguagem de script desconhecida: ${language}`);
  return generator(pairs, options);
}
