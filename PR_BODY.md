## Resumo

Reescreve o Editor de Nomes/Texto em Lote (v4.0, um `index.html` monolítico de ~1.100 linhas)
como **v5.0 Ultra**, em **HTML + CSS + JavaScript puro (ES Modules)**, sem build e sem
dependências — pronto para GitHub Pages. A v4.0 fica preservada em `legacy/index.v4.0.html`.

## O que muda

| | v4.0 | v5.0 |
|---|---|---|
| Estrutura | 1 arquivo | 30+ módulos com responsabilidade única |
| Transformações | 1 aba por vez | pipeline encadeado, reordenável, salvável como receita |
| Preview | 50 linhas, sem virtualização | lista virtualizada própria |
| Histórico | 30 snapshots de texto | 120 snapshots + timeline navegável |
| Scripts | `.sh` / `.bat` | `.sh`, `.bat`, `.ps1`, `.py`, `.mjs` com dry-run, backup e log |
| Performance | thread principal | Web Worker acima de 2.500 linhas |

## Destaques

- **Pipeline visual** com 13 tipos de passo: find/replace (regex, grupos, testador embutido),
  case/limpeza (camelCase, snake_case, slug, acentos…), afixos, aparar, cortar por marcador,
  numeração (zeros, grupos, alfabético), colunas/CSV, condicional, template, limite de
  comprimento, ordenar, deduplicar e remover vazias.
- **Receitas**: 12 presets embutidos + salvar/exportar/importar JSON.
- **Preview** com diff inline, filtros (alterados/problemas/removidos), busca instantânea,
  trava por linha e estatísticas ricas.
- **Exportação**: 5 linguagens de script com escaping específico por shell, lista em
  `.txt/.csv/.tsv/.json/.md` e renomeação real via File System Access API (com dry-run).
- **Nomes**: validação Windows/macOS/Linux, nomes reservados, conflitos e preservação de
  extensão (incluindo `arquivo.tar.gz` e dotfiles).
- **UX**: paleta de comandos (Ctrl+K), painéis redimensionáveis, modo foco, tema
  dark/light/system, 6 cores de destaque, mobile-first, ARIA e PWA offline.
- **Arquitetura**: `core/` 100% puro (sem DOM) → engine testável e executável em Web Worker.

## Testes

- `npm test` → **41 testes** (`node --test`, sem instalar nada): engine, case, regex,
  numeração, templates, colunas, dedupe, sort, condicionais, validação, escaping dos
  geradores de script, parsers, todas as receitas e performance com 20 mil linhas.
- Suítes de runtime em jsdom: 13 editores de passo, 12 receitas, undo/redo, lock de linhas,
  unicode, nomes inválidos, diálogos, atalhos e persistência — 0 erros de console.

## Bugs corrigidos no caminho

labels órfãos nos campos (acessibilidade), perda de foco ao digitar dentro de um passo,
perda de caracteres no textarea durante o debounce, `toSafeFilename` deixando separadores
nas bordas, slug gerando nome vazio com unicode não-latino, regex `\p{...}` exigindo flag
`u`, scroll saltando no recálculo do preview e `sort` não propagando a nova ordem para a
lista de entrada.

## Como testar

```bash
python3 -m http.server 5173   # ou simplesmente abrir index.html
npm test
```

## Notas

- Sem backend por design: nenhum dado sai do navegador.
- Deploy: *Settings → Pages → Deploy from a branch → main / root* (caminhos relativos,
  funciona em subpastas).
- Pendência conhecida: falta validar em navegador real o fechamento de modais por `Esc`
  (o teste em jsdom não reproduz o handler de captura; X e clique no backdrop funcionam).

## Commits

15 commits agrupados por área — `core` (3), `ui` (5), `app` (1), assets/PWA (2),
testes (1), docs (1), configuração (1) e preservação da v4.0.
