import { ClassifiedFile, Stratum } from './api';

// A review group is the unit of triage: a folder's worth of related
// files you review (or skip) together.
export interface ReviewGroup {
  id: string; // directory path, '' = repo root
  label: string;
  files: ClassifiedFile[];
  strata: Partial<Record<Stratum, number>>;
  dominant: Stratum;
  additions: number;
  deletions: number;
}

const STRATUM_ORDER: Stratum[] = ['intent', 'core', 'tests', 'generated'];

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function parentDir(dir: string): string {
  return dirname(dir);
}

// Group files by directory, then merge tiny deep directories upward
// until every group is a meaningful unit of review. Pure heuristic —
// same philosophy as stratification: advisory, never destructive.
export function buildGroups(files: ClassifiedFile[]): ReviewGroup[] {
  const MIN_GROUP = 3; // groups smaller than this get merged into their parent
  const byDir = new Map<string, ClassifiedFile[]>();
  for (const f of files) {
    const d = dirname(f.filename);
    const list = byDir.get(d) ?? [];
    list.push(f);
    byDir.set(d, list);
  }

  // Merge upward: deepest-first, fold small groups into their parent
  // (unless they're already at the root, or merging would bury a
  // different stratum — keep tests/generated separate from core).
  for (;;) {
    const dirs = [...byDir.keys()].sort(
      (a, b) => b.split('/').length - a.split('/').length,
    );
    let merged = false;
    for (const d of dirs) {
      const group = byDir.get(d)!;
      if (d === '' || group.length >= MIN_GROUP) continue;
      const parent = parentDir(d);
      // Don't merge across strata boundaries when the small group is
      // homogeneous and differs from its would-be siblings.
      const target = byDir.get(parent) ?? [];
      const groupStratum = dominantStratum(group);
      const targetStratum = target.length ? dominantStratum(target) : groupStratum;
      if (target.length > 0 && groupStratum !== targetStratum && group.length > 1) continue;
      byDir.set(parent, [...target, ...group]);
      byDir.delete(d);
      merged = true;
      break;
    }
    if (!merged) break;
  }

  const groups: ReviewGroup[] = [...byDir.entries()].map(([id, fs]) => {
    const strata: Partial<Record<Stratum, number>> = {};
    let additions = 0;
    let deletions = 0;
    for (const f of fs) {
      strata[f.stratum] = (strata[f.stratum] ?? 0) + 1;
      additions += f.additions;
      deletions += f.deletions;
    }
    fs.sort((a, b) => a.filename.localeCompare(b.filename));
    return {
      id,
      label: id === '' ? '(repo root)' : id,
      files: fs,
      strata,
      dominant: dominantStratum(fs),
      additions,
      deletions,
    };
  });

  // Reading order: intent first, then core, tests, generated; within a
  // stratum, biggest churn first — that's usually where review starts.
  groups.sort((a, b) => {
    const so = STRATUM_ORDER.indexOf(a.dominant) - STRATUM_ORDER.indexOf(b.dominant);
    if (so !== 0) return so;
    return b.additions + b.deletions - (a.additions + a.deletions);
  });
  return groups;
}

function dominantStratum(fs: ClassifiedFile[]): Stratum {
  const counts = new Map<Stratum, number>();
  for (const f of fs) counts.set(f.stratum, (counts.get(f.stratum) ?? 0) + 1);
  let best: Stratum = 'core';
  let bestN = -1;
  for (const s of STRATUM_ORDER) {
    const n = counts.get(s) ?? 0;
    if (n > bestN) {
      best = s;
      bestN = n;
    }
  }
  return best;
}
