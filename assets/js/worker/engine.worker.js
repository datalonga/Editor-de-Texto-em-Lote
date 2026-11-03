/**
 * WEB WORKER — cálculo do pipeline fora da thread principal.
 *
 * Ativado automaticamente quando a lista passa de WORKER_THRESHOLD linhas.
 * Isso mantém o scroll da lista virtualizada e a digitação fluidos mesmo com
 * 100.000 itens.
 */

import { runPipeline } from '../core/engine.js';

self.addEventListener('message', (event) => {
  const { requestId, rows, pipeline, options } = event.data ?? {};
  if (!Array.isArray(rows)) return;

  const start = performance.now();
  try {
    const { results, stats } = runPipeline(rows, pipeline ?? [], options ?? {});
    self.postMessage({
      requestId,
      results,
      stats,
      durationMs: performance.now() - start,
    });
  } catch (error) {
    self.postMessage({
      requestId,
      error: error.message,
      results: [],
      stats: null,
      durationMs: performance.now() - start,
    });
  }
});
