/**
 * Utilitários puros e sem dependências.
 * Nada aqui toca em DOM (exceto as helpers explicitamente marcadas), o que
 * permite usar estes módulos em testes no Node e dentro do Worker.
 */

let idSeed = 0;

/** ID curto e único dentro da sessão (suficiente para chaves de UI). */
export function uid(prefix = 'id') {
  idSeed += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeed.toString(36)}`;
}

/** Escapa caracteres especiais de regex ao tratar entrada do usuário como literal. */
export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function formatNumber(n) {
  return new Intl.NumberFormat('pt-BR').format(n);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Debounce com `flush()`/`cancel()` — usado no editor de texto e no resize. */
export function debounce(fn, ms) {
  let handle = null;
  let lastArgs = null;

  const wrapped = (...args) => {
    lastArgs = args;
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = null;
      fn(...lastArgs);
    }, ms);
  };
  wrapped.flush = () => {
    if (handle) {
      clearTimeout(handle);
      handle = null;
      fn(...lastArgs);
    }
  };
  wrapped.cancel = () => {
    if (handle) clearTimeout(handle);
    handle = null;
  };
  return wrapped;
}

export function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
}

/* --------------------------- DOM helpers --------------------------- */

export function $ (selector, root = document) {
  return root.querySelector(selector);
}

export function $$ (selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Cria elemento com propriedades e filhos em uma chamada. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined && value !== false) {
      node.setAttribute(key, value === true ? '' : value);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback para navegadores/contextos sem Clipboard API (http, iframe).
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.append(area);
      area.focus();
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Download em pipeline (evita "downloads bloqueados" em sequência). */
export function downloadMany(files) {
  files.forEach((file, index) => {
    setTimeout(() => downloadFile(file.name, file.content, file.mime), index * 250);
  });
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Detecta a plataforma para sugerir o formato de script mais provável. */
export function guessPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  return 'linux';
}

/** Lê um arquivo como texto respeitando encoding UTF-8 com fallback Latin-1. */
export async function readFileAsText(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder('iso-8859-1').decode(buffer);
  }
}
