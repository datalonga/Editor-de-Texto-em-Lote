/**
 * Testes dos modais (Esc, backdrop, X, empilhamento, focus trap).
 *
 * Requer jsdom — dependência OPCIONAL, só para teste. O app em si continua
 * zero-deps: se o jsdom não estiver instalado, esta suíte é ignorada e
 * `npm test` (núcleo puro) segue funcionando normalmente.
 *
 *   npm run test:ui
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

let JSDOM = null;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  // sem jsdom: os testes abaixo são marcados como ignorados
}

const skip = JSDOM ? false : 'jsdom não instalado (npm i -D jsdom)';

/**
 * Cada teste sobe um `document` próprio. Como `modal.js` guarda a pilha e o
 * binding do keydown no escopo do módulo, importamos uma instância nova por
 * teste (cache-busting) — assim não vazamos listener/estado entre casos.
 */
let instance = 0;

/** Sobe um DOM mínimo e devolve os helpers usados nos testes. */
async function setup() {
  const dom = new JSDOM('<!doctype html><html><body><button id="origem">origem</button></body></html>', {
    url: 'https://exemplo.test/',
    pretendToBeVisual: true,
  });

  // O módulo de modal usa APIs globais do navegador.
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  globalThis.cancelAnimationFrame = clearTimeout;

  instance += 1;
  const mod = await import(`../assets/js/ui/modal.js?test=${instance}`);
  const backdrops = () => document.querySelectorAll('.modal-backdrop').length;
  const esc = () =>
    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );

  return { dom, ...mod, backdrops, esc };
}

test('Esc fecha o modal aberto', { skip }, async () => {
  const { openModal, esc, backdrops, hasOpenModal } = await setup();
  openModal({ title: 'Um', body: '<p>a</p>' });
  assert.equal(backdrops(), 1);
  esc();
  assert.equal(backdrops(), 0);
  assert.equal(hasOpenModal(), false);
});

test('Esc fecha apenas o modal do topo', { skip }, async () => {
  const { openModal, esc, backdrops } = await setup();
  openModal({ title: 'Baixo', body: '<p>b</p>' });
  openModal({ title: 'Topo', body: '<p>c</p>' });
  assert.equal(backdrops(), 2);
  esc();
  assert.equal(backdrops(), 1, 'o modal de baixo continua aberto');
  esc();
  assert.equal(backdrops(), 0);
});

test('Esc sem modal aberto não lança erro', { skip }, async () => {
  const { esc } = await setup();
  assert.doesNotThrow(() => esc());
});

test('clique no backdrop fecha, no conteúdo não', { skip }, async () => {
  const dom = await setup();
  const { openModal, backdrops } = dom;
  const modal = openModal({ title: 'Backdrop', body: '<p>d</p>' });
  modal.element
    .querySelector('.modal')
    .dispatchEvent(new dom.dom.window.MouseEvent('mousedown', { bubbles: true }));
  assert.equal(backdrops(), 1, 'mousedown dentro do conteúdo não fecha');
  modal.element.dispatchEvent(new dom.dom.window.MouseEvent('mousedown', { bubbles: true }));
  assert.equal(backdrops(), 0);
});

test('botão X fecha', { skip }, async () => {
  const { openModal, backdrops } = await setup();
  const modal = openModal({ title: 'X', body: '<p>e</p>' });
  modal.element.querySelector('[data-close]').click();
  assert.equal(backdrops(), 0);
});

test('close é idempotente: onClose roda uma vez', { skip }, async () => {
  const { openModal, esc } = await setup();
  let closes = 0;
  const modal = openModal({ title: 'Idem', body: '<p>f</p>', onClose: () => (closes += 1) });
  modal.close();
  modal.close();
  esc();
  assert.equal(closes, 1);
});

test('foco volta para o elemento de origem', { skip }, async () => {
  const { openModal } = await setup();
  const origem = document.getElementById('origem');
  origem.focus();
  openModal({ title: 'Foco', body: '<button>ok</button>' }).close();
  assert.equal(document.activeElement, origem);
});

test('closeTopModal e pilha vazia', { skip }, async () => {
  const { openModal, closeTopModal, backdrops } = await setup();
  openModal({ title: 'A', body: '<p>g</p>' });
  openModal({ title: 'B', body: '<p>h</p>' });
  assert.equal(closeTopModal(), true);
  assert.equal(backdrops(), 1);
  assert.equal(closeTopModal(), true);
  assert.equal(closeTopModal(), false, 'pilha vazia devolve false');
});

test('overflow do body é restaurado ao fechar', { skip }, async () => {
  const { openModal, closTopModal } = await setup();
  const modal = openModal({ title: 'Overflow', body: '<p>i</p>' });
  assert.equal(document.body.style.overflow, 'hidden');
  modal.close();
  assert.equal(document.body.style.overflow, '');
  void closTopModal;
});

test('focus trap mantém o Tab dentro do modal', { skip }, async () => {
  const dom = await setup();
  const modal = dom.openModal({
    title: 'Trap',
    body: '<input id="a" /><input id="b" />',
    footer: '<button id="z">fim</button>',
  });
  modal.element.querySelector('#z').focus();
  document.dispatchEvent(
    new dom.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
  );
  assert.ok(modal.element.contains(document.activeElement));
});
