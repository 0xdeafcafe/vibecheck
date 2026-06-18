// A tiny promise-based IndexedDB wrapper for the API response cache. One
// DB (`vibecheck`), one store (`api`), keyed by request path. Pairs with
// the server's ETag so a conditional GET that 304s replays the cached body
// with zero transfer. No dependencies; degrades to a no-op when
// indexedDB is unavailable (private mode / SSR) — never throws.

const DB_NAME = 'vibecheck';
const STORE = 'api';

export interface CacheEntry {
  etag: string;
  body: unknown;
  ts: number;
}

// Memoised open. Resolves to null (not reject) when IndexedDB is missing
// or the open fails, so every call site can treat the cache as best-effort.
let dbPromise: Promise<IDBDatabase | null> | undefined;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function cacheGet(key: string): Promise<CacheEntry | undefined> {
  const db = await openDB();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as CacheEntry | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function cacheSet(key: string, etag: string, body: unknown): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ etag, body, ts: Date.now() } satisfies CacheEntry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
