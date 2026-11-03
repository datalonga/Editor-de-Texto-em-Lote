# Editor de Texto em Lote — Ultra v5

> Transforme listas de nomes (ou de qualquer texto) com um **pipeline visual**, veja o resultado ao vivo e gere **scripts de renomeação seguros** para Linux, macOS e Windows.
>
> **100% no navegador. Sem backend. Sem build. Sem dependências.**

[![Feito com JS puro](https://img.shields.io/badge/stack-HTML%20%2B%20CSS%20%2B%20JS%20puro-a78bfa)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Sem dependências](https://img.shields.io/badge/depend%C3%AAncias-0-34d399)](#)
[![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-60a5fa)](#-deploy)
[![Testes](https://img.shields.io/badge/testes-41%20passando-34d399)](#-testes)

---

## 🇧🇷 Português

### Por que este projeto existe

A v4.0 era um único `index.html` de ~1.100 linhas com abas e uma transformação por vez.
A v5.0 mantém a promessa "leve e poderosa", mas troca a arquitetura:

| | v4.0 | v5.0 |
|---|---|---|
| Estrutura | 1 arquivo monolítico | 30+ módulos ES com responsabilidade única |
| Transformações | 1 aba por vez | **pipeline** encadeado, reordenável, salvavel como receita |
| Preview | até 50 linhas, sem virtualização | **lista virtualizada** (testada com 100 mil linhas) |
| Histórico | 30 snapshots de texto | 120 snapshots + timeline navegável |
| Scripts | `.sh` / `.bat` simples | `.sh`, `.bat`, `.ps1`, `.py`, `.mjs` com dry-run, backup, log e escaping por shell |
| Performance | tudo na thread principal | **Web Worker automático** acima de 2.500 linhas |
| Nomes | sem validação | validação Windows/macOS/Linux + resolução de conflitos |
| i18n/UI | tema claro/escuro | dark/light/**system** + cor de destaque + mobile-first + ARIA |
| Build | — | **nenhum**: abre o `index.html` e funciona |

### Como rodar

Não há `npm install`. De verdade.

```bash
# opção 1 — abrir direto
open index.html            # macOS
xdg-open index.html        # Linux
start index.html           # Windows

# opção 2 — servir localmente (recomendado: habilita o Service Worker)
python3 -m http.server 5173
# ou
npx serve .
```

> **Por que um servidor?** O Service Worker (PWA/offline) e os módulos ES exigem
> `http(s)://`. Abrir por `file://` funciona para o app, mas sem cache offline.

### Deploy

**GitHub Pages** (o alvo principal — nada de build):

1. suba o repositório no GitHub;
2. em **Settings → Pages**, escolha *Deploy from a branch*;
3. selecione `main` e a pasta `/ (root)`;
4. pronto: `https://seu-usuario.github.io/seu-repo/`.

Todos os caminhos são **relativos**, então funciona em subpastas sem configuração.
O mesmo vale para Cloudflare Pages, Netlify, Vercel (static), S3, etc.

### Recursos

#### Entrada
- textarea com uma linha por item;
- **drag & drop** de arquivos, **pastas inteiras** e texto;
- importação de `.txt`, `.csv`, `.tsv`, `.json`, `.md` (detecção automática);
- colar do clipboard em 1 clique;
- exemplos prontos (inclusive uma lista de 5.000 itens para testar performance);
- toggle **preservar extensão** (global + por linha).

#### Pipeline de transformações
13 tipos de passo, encadeáveis e reordenáveis por drag & drop:

| Passo | O que faz |
|---|---|
| **Localizar & Substituir** | regex com grupos (`$1`), lookarounds, flags, testador embutido e 8 presets |
| **Case & Limpeza** | MAIÚSCULAS, minúsculas, Title, Sentence, camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE, dot.case, slug, inverter, remover acentos, remover especiais, normalizar espaços, remover números |
| **Prefixo / Sufixo** | adiciona texto nas bordas |
| **Aparar caracteres** | remove N caracteres do início/fim |
| **Cortar por marcador** | tesoura baseada em texto (antes/depois, incluir marcador, última ocorrência) |
| **Numeração** | início, passo, zeros, separador, prefixo/sufixo, grupos com reinício, modo alfabético (a…z, aa…zz) |
| **Colunas / CSV** | divide por delimitador (literal, regex ou espaço) e reorganiza com `{1} {2} {last}` |
| **Condicional** | se *contém / não contém / começa / termina / igual / regex* → prefixo, sufixo, substituir, remover, caixa |
| **Template** | `{name} {ext} {n} {nnn} {date} {time} {year} {random:6} {upper:name} {snake:name}` |
| **Limitar comprimento** | trunca nomes longos (resolve limite de 255 bytes) |
| **Ordenar** | natural, alfabético, comprimento, extensão, ordem original |
| **Remover duplicados** | ignora caixa, mantém a primeira ou a última |
| **Remover vazias** | com trim opcional |

Cada passo tem: ativar/desativar, mover, duplicar, remover e um resumo no cartão recolhido.

#### Receitas (presets)
12 receitas embutidas — *Limpar nomes de download, Padronizar fotos, Slug para web,
camelCase, snake_case, Preparar PDFs para ABNT, Organizar músicas, Higienizar lista grande,
Remover numeração, Reordenar colunas, Prefixar com data, Nomes seguros multi-OS*.

Você pode salvar seu pipeline como receita (localStorage) e **exportar/importar JSON**.

#### Preview
- lista virtualizada (renderiza só o que está na tela);
- colunas `Original | Novo` com **highlight do trecho alterado**;
- filtros: todos / alterados / problemas / removidos;
- busca instantânea na lista;
- trava por linha (a linha nunca é transformada);
- seleção múltipla para remover;
- estatísticas: entrada, saída, alterados, removidos, duplicados, inválidos, comprimento médio/máximo.

#### Exportação
- **Scripts**: Bash, Windows `.bat`, PowerShell, Python e Node.js — com dry-run,
  proteção contra sobrescrita, backup `.bak`, log e escaping específico de cada shell
  (aspas simples POSIX, `%` do cmd, aspas do PowerShell);
- **Lista**: `.txt`, `.csv`, `.tsv`, `.json`, `.md` + mapa "de/para" em CSV;
- **Aplicar de verdade**: via File System Access API (`showDirectoryPicker`),
  com simulação (dry-run) e backup opcional. Em navegadores sem suporte, usa o script.

#### Qualidade de vida
- undo/redo com **timeline visual** (120 estados, rótulos descritivos);
- paleta de comandos (`Ctrl+K`) com 28+ ações, incluindo "adicionar passo";
- painéis redimensionáveis (arraste ou setas do teclado);
- modo foco (Zen), mobile-first com abas;
- tema dark/light/**system** + 6 cores de destaque;
- toasts acessíveis, `aria-live`, focus trap nos modais, skip link;
- PWA offline (Service Worker com cache do shell);
- auto-save no `localStorage` (a sessão é restaurada ao reabrir).

### Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl K` | Paleta de comandos |
| `Ctrl Z` / `Ctrl Shift Z` | Desfazer / Refazer |
| `Ctrl Enter` | Aplicar pipeline na lista (congela o resultado) |
| `Ctrl E` | Exportar / gerar script |
| `Ctrl Shift C` | Copiar resultado |
| `Ctrl Shift F` | Buscar na lista |
| `Ctrl Shift H` | Timeline do histórico |
| `Ctrl Shift S` | Salvar receita |
| `Ctrl Shift X` | Limpar tudo |
| `Ctrl Shift L` | Carregar exemplo |
| `Ctrl /` | Lista de atalhos |
| `Ctrl Alt 1/2/3` | Foco nos painéis Entrada / Pipeline / Resultado |
| `Esc` | Fechar modal / sair do modo foco |

### Arquitetura

```
index.html                 # shell + boot script anti-flash de tema
manifest.webmanifest       # PWA
sw.js                      # service worker (offline-first)
assets/
  css/styles.css           # design system (tokens CSS, dark/light, responsivo)
  js/
    core/                  # ← 100% puro, sem DOM, testável no Node
      engine.js            #   runner do pipeline (coração do app)
      text.js              #   transformadores de texto e templates
      naming.js            #   extensões, validação, conflitos
      scripts.js           #   geradores .sh/.bat/.ps1/.py/.mjs
      exporters.js         #   txt/csv/tsv/json/md + receitas
      parser.js            #   texto/CSV/JSON → linhas
      steps.js             #   fábricas + metadados dos passos
      presets.js           #   receitas embutidas
      store.js             #   estado + histórico + persistência
      utils.js             #   helpers puros e de DOM
    ui/                    # ← componentes de interface
      inputPanel.js  pipelinePanel.js  previewPanel.js
      stepEditors.js fields.js  modal.js  toast.js  icons.js
      exportDialog.js  recipeDialog.js  compareDialog.js
      commandPalette.js  dialogs.js  theme.js
    worker/engine.worker.js  # cálculo em Web Worker
    app/                   #   orquestração e bootstrap
      app.js  main.js
legacy/index.v4.0.html     # versão anterior preservada
tests/core.test.js         # 41 testes (node --test)
```

**Princípio central:** o *estado do usuário* (lista + pipeline + preferências) vive no
`store`. O *resultado* é sempre **derivado** pela engine pura — nunca armazenado. Isso
elimina inconsistências, torna o undo barato e permite rodar a engine inteira dentro
de um Worker.

```
store  ──►  engine.runPipeline(rows, pipeline, options)  ──►  previewPanel + statusbar
  ▲                    │
  └──── ações do usuário ◄┘
```

**Performance:** abaixo de 2.500 linhas o cálculo é síncrono em ~1–3 ms (feedback de
digitação imediato). Acima disso, o app delega ao Web Worker com debounce e descarte de
respostas obsoletas. A lista é virtualizada com um pool de nós reciclados.

### Testes

```bash
npm test          # node --test tests/  (sem instalar nada)
```

Cobrem: extensões e casos de borda, todos os modos de case, regex/grupos/palavra inteira,
numeração (zeros, alfa, grupos), templates e datas, colunas, dedupe, sort natural,
condicionais, linhas travadas, validação de nomes, escaping dos 3 principais geradores de
script, parsers CSV/JSON, todas as receitas embutidas e **performance com 20.000 linhas**
(< 3 s no CI, ~120 ms localmente).

### Acessibilidade

- navegação completa por teclado com foco visível;
- `aria-pressed`, `aria-selected`, `aria-expanded`, `role="dialog"` + focus trap;
- toasts e status em `aria-live`;
- labels associados a todos os controles;
- respeita `prefers-reduced-motion` (e tem toggle manual);
- contraste testado nos dois temas.

### Browser support

Chrome/Edge 90+, Firefox 90+, Safari 15+. Recursos opcionais (renomear no navegador via
File System Access API) funcionam no Chrome/Edge desktop; nos demais o app oferece o
script equivalente.

### Limitações conhecidas

- Não há backend por design: nada é sincronizado entre dispositivos.
- Pastas aninhadas: a importação preserva o caminho relativo como texto, mas a
  renomeação in-place opera em uma pasta por vez.
- `{date}` em templates usa a data local do navegador no momento do cálculo.

---

## 🇺🇸 English

### What it is

A batch text/filename editor that runs **entirely in the browser**. No backend, no build
step, no dependencies. Chain a visual pipeline of transformations, watch a virtualized
live preview, and export safe rename scripts for Linux, macOS and Windows.

### Quick start

```bash
open index.html                       # it just works
python3 -m http.server 5173           # recommended (enables the Service Worker)
```

Deploy: any static host. For GitHub Pages, enable *Settings → Pages → Deploy from a branch →
main / root*. All asset paths are relative.

### Highlights

- **Visual pipeline** with 13 step types, reorderable via drag & drop;
- **Live virtualized preview** with inline diff (tested with 100k rows);
- **Web Worker** offloading above 2,500 rows;
- **Script export**: Bash, `.bat`, PowerShell, Python, Node — with dry-run, overwrite
  protection, backups, logging and per-shell escaping;
- **Real rename** through the File System Access API where supported;
- **Recipes**: 12 built-in presets + save/export/import your own;
- 120-step undo with a navigable timeline, command palette (`Ctrl+K`), focus mode,
  keyboard shortcuts, dark/light/system themes, accent colors, PWA offline;
- **41 unit tests** for the transformation engine, validators, script generators and parsers.

### Architecture in one line

User state lives in a tiny observable store; the result is *always derived* by a pure,
DOM-free engine — which is why it can run in a Worker and be tested in Node.

### License

MIT.

---

## Contribuindo

Contribuições são muito bem-vindas! Veja [`CONTRIBUTING.md`](CONTRIBUTING.md).

O caminho mais fácil para adicionar um novo passo:

1. **`assets/js/core/steps.js`** — adicione a fábrica em `STEP_FACTORIES`, os metadados em
   `STEP_META`, o grupo em `STEP_GROUPS` e o resumo em `summarizeStep`;
2. **`assets/js/core/engine.js`** — implemente o `case` correspondente no `switch`;
3. **`assets/js/ui/stepEditors.js`** — crie o editor do passo;
4. **`tests/core.test.js`** — cubra o comportamento (incluindo casos de borda);
5. `npm test` deve continuar verde.

### Roadmap (v5.1+)

- modo "editor de texto genérico" com mais poder (parágrafos, JSON, Markdown);
- múltiplas listas / abas de documentos;
- diff unificado à la `git diff` com navegação entre hunks;
- suporte a estrutura de diretórios aninhados na renomeação;
- sistema de plugins (transformadores em JS de usuário, sandboxed em Worker);
- i18n (pt-BR / en / es) com dicionário externo;
- exportação para XLSX (SheetJS opcional, carregado sob demanda);
- wrapper desktop opcional (Tauri).

## Créditos

- Ícones derivados do [Lucide](https://lucide.dev) (ISC), inline como SVG.
- Inspiração de UX: shadcn/ui, VS Code, Raycast.

## Licença

[MIT](LICENSE) © 2024 — use, modifique e distribua à vontade.
