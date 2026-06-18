// Main-thread wrapper around the Gemma summarizer worker: lazy spawn, job
// dispatch, localStorage cache. Summaries are keyed by an arbitrary string so
// we can cache one per comment, file, slice or intent, and `kind` picks the
// prompt the worker uses.

import { getModel, modelTag } from '../model';

export type SummaryKind = 'comment' | 'thread' | 'file' | 'slice' | 'intent';

type Listener = (progress: number) => void;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void }>();
const progressListeners = new Set<Listener>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        for (const l of progressListeners) l(msg.progress);
        return;
      }
      const job = pending.get(msg.id);
      if (!job) return;
      pending.delete(msg.id);
      if (msg.type === 'result') job.resolve(msg.summary);
      else job.reject(new Error(msg.error));
    };
  }
  return worker;
}

export function onModelProgress(l: Listener): () => void {
  progressListeners.add(l);
  return () => progressListeners.delete(l);
}

const cacheKey = (key: string) => `vibecheck:tldr:${modelTag(getModel())}:${key}`;

export function cachedSummary(key: string): string | null {
  return localStorage.getItem(cacheKey(key));
}

export async function summarize(
  key: string,
  text: string,
  kind: SummaryKind = 'comment',
): Promise<string> {
  const cached = cachedSummary(key);
  if (cached) return cached;
  const id = nextId++;
  const model = getModel();
  const result = await new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, text, kind, model });
  });
  try {
    localStorage.setItem(cacheKey(key), result);
  } catch {
    // cache full — summary still returned
  }
  return result;
}
