import { createContext, useContext } from 'react';
import { ClassifiedFile } from './api';

// Resolve an import statement in a diff line to ANOTHER file changed in the
// same PR — heuristic, no type system. Handles relative imports and the
// common `~/` and `@/` source aliases, with a basename fallback. Bare/scoped
// npm packages are ignored. Good enough that it's right most of the time.
export interface ImportResolver {
  resolve(importingFile: string, lineText: string): ClassifiedFile | null;
}

const FROM_RE = /\bfrom\s*['"]([^'"]+)['"]/;
const CALL_RE = /\b(?:require|import)\(\s*['"]([^'"]+)['"]/;
const EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'];

function normalize(p: string): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    else if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}
function join(a: string, b: string): string {
  return normalize((a ? a + '/' : '') + b);
}

export function buildImportResolver(files: ClassifiedFile[]): ImportResolver {
  const byPath = new Map<string, ClassifiedFile>();
  const byBase = new Map<string, ClassifiedFile[]>();
  for (const f of files) {
    byPath.set(f.filename, f);
    const base = (f.filename.split('/').pop() ?? '').replace(/\.[^/.]+$/, '');
    const list = byBase.get(base) ?? [];
    list.push(f);
    byBase.set(base, list);
  }

  function look(path: string): ClassifiedFile | null {
    for (const ext of EXTS) {
      const hit = byPath.get(path + ext);
      if (hit) return hit;
    }
    return null;
  }
  function roots(importingFile: string): string[] {
    const parts = importingFile.split('/');
    const r: string[] = [];
    const si = parts.lastIndexOf('src');
    if (si >= 0) r.push(parts.slice(0, si + 1).join('/')); // …/src for ~/@ aliases
    if (parts.length > 1) r.push(parts[0]); // monorepo package root
    r.push(''); // repo root
    return r;
  }

  function resolve(importingFile: string, lineText: string): ClassifiedFile | null {
    const m = FROM_RE.exec(lineText) ?? CALL_RE.exec(lineText);
    const spec = m?.[1];
    if (!spec) return null;
    const isRel = spec.startsWith('.');
    const isAlias = spec.startsWith('~') || spec.startsWith('@/');
    if (!isRel && !isAlias) return null; // bare / scoped npm package

    let target: ClassifiedFile | null = null;
    if (isRel) {
      const dir = importingFile.split('/').slice(0, -1).join('/');
      target = look(join(dir, spec));
    } else {
      const stripped = spec.replace(/^~\//, '').replace(/^~/, '').replace(/^@\//, '');
      for (const r of roots(importingFile)) {
        target = look(join(r, stripped));
        if (target) break;
      }
      if (!target) {
        const base = (spec.split('/').pop() ?? '').replace(/\.[^/.]+$/, '');
        const cands = byBase.get(base);
        if (cands && cands.length === 1) target = cands[0];
      }
    }
    return target && target.filename !== importingFile ? target : null;
  }

  return { resolve };
}

export const ImportContext = createContext<ImportResolver | null>(null);
export function useImportResolver(): ImportResolver | null {
  return useContext(ImportContext);
}
