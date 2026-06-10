// Main-thread wrapper around the Gemma summarizer worker: lazy spawn,
// per-comment job dispatch, localStorage cache (a summary never changes
// for a given comment id).

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

const cacheKey = (commentId: number) => `vibecheck:tldr:${commentId}`;

export function cachedSummary(commentId: number): string | null {
  return localStorage.getItem(cacheKey(commentId));
}

export async function summarize(commentId: number, text: string): Promise<string> {
  const cached = cachedSummary(commentId);
  if (cached) return cached;
  const id = nextId++;
  const result = await new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, text });
  });
  try {
    localStorage.setItem(cacheKey(commentId), result);
  } catch {
    // cache full — summary still returned
  }
  return result;
}
