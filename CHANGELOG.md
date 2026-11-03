# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento é [SemVer](https://semver.org/lang/pt-BR/).

## [5.0.0] — 2024-05-13

Reescrita completa do app ("Ultra Pro"). A v4.0 permanece em
[`legacy/index.v4.0.html`](legacy/index.v4.0.html).

### Adicionado

**Pipeline**
- Sistema de pipeline encadeado com 13 tipos de passo (`find-replace`, `case`, `affix`,
  `trim`, `crop`, `numbering`, `columns`, `conditional`, `template`, `limit-length`,
  `sort`, `dedupe`, `remove-empty`).
- Builder visual com drag & drop, ativar/desativar, duplicar e resumo por cartão.
- Receitas: 12 presets embutidos + salvar/carregar/exportar/importar JSON.
- Condicionais (`if contains / regex / starts-with … then apply`).
- Operações em colunas com templates `{1} {2} {last}`.
- Templates com `{name} {ext} {n} {nnn} {date} {time} {year} {random:N}` e modificadores
  (`{upper:name}`, `{snake:name}`, …).
- Numeração com grupos reiniciáveis e modo alfabético (a…z, aa…zz).

**Preview e desempenho**
- Lista virtualizada própria (pool de nós), testada com 100 mil linhas.
- Diff inline com highlight do trecho alterado.
- Filtros (todos/alterados/problemas/removidos) + busca instantânea.
- Web Worker automático acima de 2.500 linhas, com descarte de respostas obsoletas.
- Estatísticas ricas no rodapé e em modal dedicado.

**Entrada**
- Drag & drop de arquivos, pastas inteiras e texto.
- Importação inteligente de `.txt`, `.csv`, `.tsv`, `.json`, `.md`.
- Colar do clipboard em 1 clique; exemplos prontos (incluindo 5.000 itens).
- Modo "texto livre" além do modo "nomes de arquivo".

**Exportação**
- Geradores de script para Bash, Windows `.bat`, PowerShell, Python e Node.js.
- Opções de dry-run, não sobrescrever, backup `.bak` e log por execução.
- Escaping específico por shell (testado com aspas, `%`, acentos e emojis).
- Exportação da lista em `.txt`, `.csv`, `.tsv`, `.json`, `.md` e mapa "de/para".
- Renomeação real via File System Access API, com simulação e verificação de conflitos.

**Nomes e validação**
- Validação multiplataforma: caracteres inválidos, nomes reservados do Windows,
  ponto/espaço final e comprimento máximo.
- Detecção de duplicados na saída e resolução de conflitos (`nome (2).ext`).
- Extensão preservada de forma robusta (`arquivo.tar.gz`, dotfiles, ponto final).

**Interface**
- Design system próprio em CSS puro com tokens semânticos.
- Tema dark/light/**system** + 6 cores de destaque, sem flash no primeiro paint.
- Layout responsivo com painéis redimensionáveis (mouse e teclado).
- Paleta de comandos (`Ctrl+K`) com 28+ ações.
- Timeline visual do histórico (120 snapshots).
- Modo foco (Zen), toasts acessíveis, empty states e onboarding.
- PWA: manifest + Service Worker com estratégias de cache por tipo de recurso.
- Auto-save da sessão e restauração ao reabrir.

**Qualidade**
- Engine 100% pura e livre de DOM, coberta por 41 testes (`node --test`).
- Error boundary no bootstrap (tela de erro amigável em vez de tela branca).
- Acessibilidade: ARIA, focus trap, skip link, `prefers-reduced-motion`.
- Zero dependências de runtime; nenhum passo de build.

### Mudado
- Stack: de HTML/CSS/JS monolítico para ES Modules organizados em `core` / `ui` / `app`.
- Histórico: de 30 snapshots de texto para 120 snapshots com pipeline e timeline.
- Preview: de amostra estática de 50 linhas para lista virtualizada completa.
- Scripts: de `.sh`/`.bat` básicos para 5 linguagens com garantias de segurança.

### Removido
- Abas exclusivas da v4.0 (substituídas pelo pipeline, que é cumulativo).
- `confirm()` nativo nas ações destrutivas (agora diálogo acessível com undo).

### Corrigido
- Regex inválido não quebra mais o processamento (o passo é ignorado com aviso).
- Nomes com aspas simples/duplas geravam scripts quebrados no Bash/Windows.
- Extensões eram perdidas quando o "replace" afetava o ponto final.
- `toSafeFilename` deixava separadores nas bordas do nome.
