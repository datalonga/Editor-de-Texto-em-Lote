## Resumo

Fecha as pendências que ficaram abertas na v5.0.0 (PR #1). Nenhuma mudança de
arquitetura: 3 correções cirúrgicas, 1 artefato novo (arquivo único) e a suíte de
testes que faltava para os modais.

## O que muda

### 1. Versão arquivo único (`legacy/v5.single.html`)

`npm run build` gera **um** `.html` de ~424 KB com CSS, os 27 módulos JS, os
ícones e o manifest embutidos — roda de `file://`, pendrive, e-mail ou intranet
sem servidor.

O gerador (`tools/build-single.mjs`) não é um bundler genérico, e sim um
resolvedor de grafo sob medida:

- percorre os imports a partir de `assets/js/app/main.js` em ordem topológica;
- transforma cada módulo em um escopo isolado (`(() => { … return {…} })()`),
  com `export` removido e imports virando referências ao namespace;
- **aborta com mensagem clara se houver ciclo** de imports (hoje: 0);
- verifica no fim que não sobrou nenhuma referência a `assets/` e falha se sobrar;
- troca o Worker por fallback síncrono e desativa o Service Worker (arquivo único
  não pode registrar `sw.js` nem instanciar Worker de outro arquivo);
- **é determinístico**: sem timestamp no banner, rodar duas vezes não gera diff.

### 2. `Ctrl+Shift+Z` mapeado duas vezes

A lista de atalhos anunciava `Ctrl+Shift+Z` como *refazer* **e** como *modo foco*.
Só o redo funcionava. O modo foco passou para **`Ctrl+Shift+M`**, com hint na
paleta de comandos.

### 3. Ícone inexistente no passo "Cortar por marcador"

`STEP_META.crop.icon` era `'cut'`, que não existe em `icons.js`, e caía
silenciosamente no fallback `info`. Agora usa `'scissors'`, e o fallback passou a
emitir `console.warn` — nome errado é bug de código, não deve passar despercebido.

### 4. `Esc` nos modais — investigado e coberto por teste

O handler estava **correto** desde a v5.0.0. A falha relatada era artefato do
ambiente de teste: o jsdom não entrega eventos disparados em `window` para
listeners de `document` com `capture: true`. A suíte nova (`npm run test:ui`,
10 casos) prova o comportamento: Esc fecha só o modal do topo, clique no backdrop
fecha, clique no conteúdo não, `onClose` roda uma vez, foco volta à origem e o
Tab fica preso no modal.

> jsdom é dependência **opcional de teste**. Sem ela, `npm run test:ui` marca 10
> testes como *skipped* e `npm test` continua sem instalar nada.

## Testes

| Suíte | Resultado |
|---|---|
| `npm test` (núcleo) | **41 pass / 0 fail** |
| `npm run test:ui` (jsdom) | **10 pass / 0 fail** |
| smoke do app modular (jsdom) | **9 pass / 0 fail** |
| execução do single-file (jsdom) | **15 pass / 0 fail** |
| `npm run build` | 0 referências externas a `assets/` ✔ |

O smoke do single-file monta o app dentro do jsdom a partir do arquivo gerado,
digita três nomes e confirma que o preview reage. O smoke modular confirma que
os patches não quebraram nada: os 13 ícones de `STEP_META` existem, `Ctrl+Shift+M`
alterna o modo foco e o Esc fecha um modal por vez no app real.

## Bug encontrado no caminho (e que valia a pena)

A primeira versão do build gerou um arquivo corrompido **silenciosamente**: o
bundle contém `'\\$&'` (escaping de regex do core) e `String.replace` interpreta
`$&` como padrão de substituição, injetando `<script type="module" src="...">`
dentro de duas funções de escape. Sintoma: JS inválido só dentro do HTML gerado.
Corrigido usando funções replacer em toda inserção de conteúdo gerado — e o
`node --check` do bundle extraído virou parte da validação.

## Como testar

```bash
npm test                          # núcleo
npm i -D jsdom && npm run test:ui # modais
npm run build                     # regenera legacy/v5.single.html
open legacy/v5.single.html        # arquivo único, direto do disco
```

## Arquivos

- `tools/build-single.mjs` (novo) — gerador sem dependências
- `legacy/v5.single.html` (novo, gerado) — app em arquivo único
- `tests/modal.test.mjs` (novo) — 10 testes de modal
- `assets/js/core/steps.js`, `assets/js/ui/icons.js` — ícone `scissors` + aviso
- `assets/js/ui/dialogs.js`, `assets/js/app/app.js` — atalho do modo foco
- `package.json` — versão 5.0.1 e scripts `build` / `test:ui`
- `README.md`, `CHANGELOG.md` — documentação das mudanças
