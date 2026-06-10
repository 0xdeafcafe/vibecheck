import { useMemo } from 'react';
import { ClassifiedFile, Stratum } from '../api';

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  fileCount: number;
  strata: Set<Stratum>;
  additions: number;
  deletions: number;
}

const STRATUM_DOT: Record<Stratum, string> = {
  intent: 'bg-violet-400',
  core: 'bg-sky-400',
  tests: 'bg-emerald-400',
  generated: 'bg-zinc-500',
};

function buildTree(files: ClassifiedFile[]): TreeNode {
  const root: TreeNode = node('');
  for (const f of files) {
    const parts = f.filename.split('/');
    let cur = root;
    bump(cur, f);
    for (let i = 0; i < parts.length - 1; i++) {
      let child = cur.children.get(parts[i]);
      if (!child) {
        child = node(parts[i]);
        cur.children.set(parts[i], child);
      }
      cur = child;
      bump(cur, f);
    }
  }
  collapseChains(root);
  return root;
}

function node(name: string): TreeNode {
  return { name, children: new Map(), fileCount: 0, strata: new Set(), additions: 0, deletions: 0 };
}

function bump(n: TreeNode, f: ClassifiedFile) {
  n.fileCount++;
  n.strata.add(f.stratum);
  n.additions += f.additions;
  n.deletions += f.deletions;
}

// Merge single-child directory chains: a/b/c instead of three rows.
function collapseChains(n: TreeNode) {
  for (const [key, child] of n.children) {
    while (child.children.size === 1 && child.fileCount === firstChild(child).fileCount) {
      const only = firstChild(child);
      child.name = `${child.name}/${only.name}`;
      child.children = only.children;
    }
    collapseChains(child);
    n.children.set(key, child);
  }
}

function firstChild(n: TreeNode): TreeNode {
  return n.children.values().next().value!;
}

function TreeRows({ node, depth }: { node: TreeNode; depth: number }) {
  const dirs = Array.from(node.children.values()).sort((a, b) => b.fileCount - a.fileCount);
  const directFiles = node.fileCount - dirs.reduce((s, d) => s + d.fileCount, 0);
  return (
    <>
      {dirs.map((d) => (
        <li key={d.name}>
          <div
            className="flex items-baseline gap-2 py-0.5 text-xs"
            style={{ paddingLeft: depth * 14 }}
          >
            <span className="flex items-center gap-1 self-center">
              {Array.from(d.strata).map((s) => (
                <span key={s} className={`size-1.5 rounded-full ${STRATUM_DOT[s]}`} title={s} />
              ))}
            </span>
            <span className="font-mono text-zinc-300">{d.name}/</span>
            <span className="text-zinc-500">{d.fileCount}</span>
            <span className="ml-auto font-mono text-[10px]">
              <span className="text-emerald-500">+{d.additions}</span>{' '}
              <span className="text-red-500">−{d.deletions}</span>
            </span>
          </div>
          {depth < 3 && d.children.size > 0 && (
            <ul>
              <TreeRows node={d} depth={depth + 1} />
            </ul>
          )}
        </li>
      ))}
      {depth === 0 && directFiles > 0 && (
        <li className="py-0.5 text-xs text-zinc-500">{directFiles} file(s) at repo root</li>
      )}
    </>
  );
}

export function FileTree({ files }: { files: ClassifiedFile[] }) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <ul className="max-h-56 overflow-y-auto pr-1">
      <TreeRows node={tree} depth={0} />
    </ul>
  );
}
