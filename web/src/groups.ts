import { ClassifiedFile, Stratum } from './api';

// A review group is the unit of triage: a folder's worth of related files
// you review (or skip) together, or a "cluster" of mechanically-identical
// edits (one rename touching many files) that you scan once.
export interface ReviewGroup {
  id: string; // directory path ('' = repo root) or `cluster:<signature>`
  label: string;
  kind: 'dir' | 'cluster';
  signature?: string; // cluster groups: the shared "old → new" edit
  files: ClassifiedFile[];
  strata: Partial<Record<Stratum, number>>;
  dominant: Stratum;
  additions: number;
  deletions: number;
  owned: number; // files in this group the signed-in viewer owns (CODEOWNERS)
}

const STRATUM_ORDER: Stratum[] = ['intent', 'core', 'tests', 'docs', 'generated'];
const MIN_GROUP = 3; // dir groups smaller than this merge into their parent
const MIN_CLUSTER = 4; // a mechanical edit shared by >= this many files clusters

function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}
const parentDir = dirname;

// Group files by directory, after first pulling out mechanical clusters.
// Pure heuristic — same philosophy as stratification: advisory, never
// destructive.
export function buildGroups(files: ClassifiedFile[]): ReviewGroup[] {
  // 1. Pull out "mechanical" clusters — one rename / identifier swap that
  // touched many files (e.g. an import path change). These are noise you
  // scan once, not review file-by-file, so they get their own collapsed
  // group instead of being scattered through the directory tree.
  const sigCount = new Map<string, number>();
  for (const f of files) {
    if (f.mechanical && f.signature) {
      sigCount.set(f.signature, (sigCount.get(f.signature) ?? 0) + 1);
    }
  }
  const clusterSigs = new Set<string>();
  for (const [sig, n] of sigCount) if (n >= MIN_CLUSTER) clusterSigs.add(sig);

  const isClustered = (f: ClassifiedFile) =>
    !!(f.mechanical && f.signature && clusterSigs.has(f.signature));

  // 2. Directory-group everything that isn't clustered, then merge tiny
  // deep directories upward until every group is a meaningful unit.
  const byDir = new Map<string, ClassifiedFile[]>();
  for (const f of files) {
    if (isClustered(f)) continue;
    const d = dirname(f.filename);
    const list = byDir.get(d) ?? [];
    list.push(f);
    byDir.set(d, list);
  }

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

  const dirGroups: ReviewGroup[] = [...byDir.entries()].map(([id, fs]) =>
    makeGroup(id, id === '' ? '(repo root)' : id, 'dir', fs),
  );

  // 3. One cluster group per shared signature.
  const clusterGroups: ReviewGroup[] = [...clusterSigs].map((sig) =>
    makeGroup(
      `cluster:${sig}`,
      sig,
      'cluster',
      files.filter((f) => f.signature === sig && isClustered(f)),
      sig,
    ),
  );

  // 4. Reading order = the review plan. Mechanical clusters always sink to
  // the bottom; then YOUR areas first (CODEOWNERS ownership — the
  // reviewer-fit axis); then the stratum order (intent → core → tests →
  // docs → generated); then biggest churn first.
  return [...dirGroups, ...clusterGroups].sort((a, b) => {
    const ac = a.kind === 'cluster' ? 1 : 0;
    const bc = b.kind === 'cluster' ? 1 : 0;
    if (ac !== bc) return ac - bc;
    const ao = a.owned > 0 ? 0 : 1;
    const bo = b.owned > 0 ? 0 : 1;
    if (ao !== bo) return ao - bo;
    const r = STRATUM_ORDER.indexOf(a.dominant) - STRATUM_ORDER.indexOf(b.dominant);
    if (r !== 0) return r;
    return b.additions + b.deletions - (a.additions + a.deletions);
  });
}

function makeGroup(
  id: string,
  label: string,
  kind: 'dir' | 'cluster',
  files: ClassifiedFile[],
  signature?: string,
): ReviewGroup {
  const strata: Partial<Record<Stratum, number>> = {};
  let additions = 0;
  let deletions = 0;
  let owned = 0;
  for (const f of files) {
    strata[f.stratum] = (strata[f.stratum] ?? 0) + 1;
    additions += f.additions;
    deletions += f.deletions;
    if (f.ownedByViewer) owned++;
  }
  files.sort((a, b) => a.filename.localeCompare(b.filename));
  return {
    id,
    label,
    kind,
    signature,
    files,
    strata,
    dominant: dominantStratum(files),
    additions,
    deletions,
    owned,
  };
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
