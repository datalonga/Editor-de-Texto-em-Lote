# Contribuindo

Obrigado pelo interesse! Este projeto é intencionalmente simples de hackear: **não há
build, não há dependências e não há transpilação**. Editar um arquivo e recarregar a página
é o ciclo de desenvolvimento completo.

## Ambiente

```bash
git clone <repo>
cd editor-de-texto-em-lote

# qualquer servidor estático serve:
python3 -m http.server 5173
# ou
npx serve .
```

Abra <http://localhost:5173>. Os módulos ES e o Service Worker exigem `http://`, não `file://`.

## Testes

```bash
npm test        # node --test tests/
```

Os testes importam **apenas** `assets/js/core/*` — que é puro e não toca no DOM. Se você
precisar de `document` para testar algo, provavelmente a lógica está no lugar errado
(mova-a para `core/`).

Antes de abrir um PR:

1. `npm test` verde;
2. `for f in $(find assets/js -name '*.js'); do node --check "$f"; done`;
3. teste manual do fluxo que você mudou (desktop e mobile, tema claro e escuro).

## Estrutura e responsabilidades

| Pasta | Pode importar | Pode tocar no DOM? |
|---|---|---|
| `assets/js/core/` | só `core/` | **nunca** |
| `assets/js/ui/` | `core/`, `ui/` | sim |
| `assets/js/app/` | tudo | sim |
| `assets/js/worker/` | `core/` | não (escopo de Worker) |

Regras de ouro:

- **`core` é puro.** Recebe dados, devolve dados. Nada de `document`, `window` ou `localStorage`.
- **Estado do usuário vive no store.** O resultado do pipeline é sempre derivado — nunca
  guarde o preview no estado.
- **Persistência é opcional.** Toda leitura de `localStorage` deve ter `try/catch` (modo
  privado e quota cheia são reais).
- **Nada de `innerHTML` com dados do usuário.** Use `textContent` ou `escapeHtml()`.

## Adicionando um novo passo do pipeline

Exemplo: um passo "inverter ordem das palavras".

### 1. Fábrica e metadados — `assets/js/core/steps.js`

```js
// em STEP_FACTORIES
'reverse-words': () => ({ id: uid('step'), kind: 'reverse-words', enabled: true }),

// em STEP_META
'reverse-words': {
  label: 'Inverter palavras',
  description: 'Escreve as palavras na ordem inversa',
  color: 'var(--accent)',
  icon: 'sort',
},

// em STEP_GROUPS → { group: 'Transformar', kinds: [..., 'reverse-words'] }

// em summarizeStep
case 'reverse-words': return '';
```

### 2. Execução — `assets/js/core/engine.js`

```js
case 'reverse-words': {
  for (const entry of entries) {
    if (!entry.locked) entry.value = entry.value.split(/\s+/).reverse().join(' ');
  }
  break;
}
```

### 3. Editor — `assets/js/ui/stepEditors.js`

```js
function reverseWordsEditor(step, onChange) {
  const root = h('<div class="step-row"><label class="check">...</label></div>');
  bindControl(root, '#opt', (value) => onChange({ /* patch */ }));
  return root;
}

// registre em EDITORS
```

### 4. Testes — `tests/core.test.js`

```js
test('reverse-words inverte a ordem', () => {
  const out = transformNames(['um dois tres.txt'], [
    { id: 'x', kind: 'reverse-words', enabled: true },
  ]);
  assert.deepEqual(out, ['tres dois um.txt']);
});
```

## Adicionando uma receita

Edite `assets/js/core/presets.js`. Use `id`s legíveis e estáveis (`minha-receita-1`) para
que a receita continue referenciável em docs e testes. Todo preset novo precisa passar no
teste "todas as receitas embutidas executam sem erro".

## Adicionando uma linguagem de script

1. `assets/js/core/scripts.js`: implemente `generate<Lang>Script(pairs, options)` com
   escaping próprio — **nunca** reaproveite o escaping de outra linguagem;
2. adicione em `SCRIPT_GENERATORS` e `SCRIPT_META`;
3. cubra com testes: aspas simples/duplas, `%`, `$`, acentos, emoji e nomes com espaços;
4. confirme que os modos `dryRun`, `avoidOverwrite`, `backup` e `log` funcionam.

## Estilo de código

- 2 espaços, aspas simples, ponto e vírgula no fim;
- nomes descritivos em inglês no código, **comentários em português** explicando o *porquê*;
- funções puras sempre que possível; efeitos colaterais explícitos;
- sem `console.log` no código final (use `console.error` para erros reais);
- acessibilidade não é opcional: `aria-*`, foco visível e suporte a teclado.

## Commits e PRs

- commits no imperativo, curtos e focados (`fix: escaping de % no .bat`);
- um PR = uma ideia; descreva o comportamento antes/depois;
- inclua passos para reproduzir/testar;
- screenshots são bem-vindos em mudanças de UI.

## Reportando bugs

Inclua: navegador + versão, passos para reproduzir, lista de exemplo (mascarada),
comportamento esperado vs. obtido e, se possível, o script/JSON da receita envolvida.

## Licença

Ao contribuir você concorda em licenciar sua contribuição sob a MIT.
