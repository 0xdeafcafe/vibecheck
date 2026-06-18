import { useEffect, useMemo, useState } from 'react';
import { ExistingComment } from '../api';
import { renderMarkdown } from '../markdown';
import { SummaryButton } from './SummaryButton';

// A right-side slide-over that renders the WHOLE PR discussion — every
// comment, human and bot, threaded by inReplyTo — regardless of whether it
// has a diff line. The inline view only shows line-anchored comments; this
// is where you read the conversation as a whole and answer "what's still
// unresolved?".

interface Thread {
  root: ExistingComment;
  replies: ExistingComment[];
  resolved: boolean;
  latest: string;
}

const RESOLVED_RE = /\b(fixed|addressed|resolved|done|closing)\b|✅|👍/i;

function buildThreads(comments: ExistingComment[]): Thread[] {
  const byId = new Map(comments.map((c) => [c.id, c] as const));
  const rootOf = (c: ExistingComment): ExistingComment => {
    let cur = c;
    const seen = new Set<number>();
    while (cur.inReplyTo && byId.has(cur.inReplyTo) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.inReplyTo)!;
    }
    return cur;
  };
  const byRoot = new Map<number, ExistingComment[]>();
  for (const c of comments) {
    const r = rootOf(c);
    const list = byRoot.get(r.id) ?? [];
    list.push(c);
    byRoot.set(r.id, list);
  }
  const threads: Thread[] = [];
  for (const [rootId, members] of byRoot) {
    const root = byId.get(rootId)!;
    const replies = members
      .filter((c) => c.id !== rootId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const all = [root, ...replies];
    threads.push({
      root,
      replies,
      resolved: all.some((c) => RESOLVED_RE.test(c.body)),
      latest: all.map((c) => c.createdAt).sort().at(-1) ?? root.createdAt,
    });
  }
  // unresolved first, then most-recent first
  return threads.sort((a, b) =>
    a.resolved === b.resolved ? b.latest.localeCompare(a.latest) : a.resolved ? 1 : -1,
  );
}

function timeAgo(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

type Filter = 'unresolved' | 'all' | 'humans' | 'bots';

interface Props {
  comments: ExistingComment[];
  open: boolean;
  onClose: () => void;
  onJump: (path: string, line?: number) => void;
}

export function Conversations({ comments, open, onClose, onJump }: Props) {
  const [filter, setFilter] = useState<Filter>('unresolved');
  const [q, setQ] = useState('');
  const threads = useMemo(() => buildThreads(comments), [comments]);
  const unresolved = threads.filter((t) => !t.resolved).length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const shown = threads.filter((t) => {
    const all = [t.root, ...t.replies];
    if (filter === 'unresolved' && t.resolved) return false;
    if (filter === 'humans' && all.every((c) => c.bot)) return false;
    if (filter === 'bots' && all.every((c) => !c.bot)) return false;
    if (q) {
      const hay = all.map((c) => `${c.body} ${c.login}`).join(' ').toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[480px] flex-col border-l border-line bg-canvas shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="font-display text-lg text-ink">Conversations</h2>
          <span className="text-xs text-muted">
            {threads.length} threads · {unresolved} unresolved
          </span>
          <button className="ml-auto text-muted hover:text-ink" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2">
          {(['unresolved', 'all', 'humans', 'bots'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                filter === f ? 'bg-accent text-accent-ink' : 'bg-raised text-muted hover:text-ink'
              }`}
            >
              {f}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="filter…"
            className="ml-auto w-28 rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink outline-none focus:border-accent"
          />
        </div>

        {comments.length > 0 && (
          <div className="border-b border-line px-4 py-2">
            <SummaryButton
              cacheKey={`discussion:${comments.length}`}
              kind="thread"
              getText={() => comments.map((c) => `${c.login}: ${c.body}`).join('\n\n')}
              label="✨ tl;dr the whole discussion"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              {comments.length === 0 ? 'No comments on this PR yet.' : 'No threads match.'}
            </p>
          ) : (
            shown.map((t) => <ThreadCard key={t.root.id} thread={t} onJump={onJump} />)
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadCard({ thread, onJump }: { thread: Thread; onJump: Props['onJump'] }) {
  const { root, replies, resolved } = thread;
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px]">
        <code className="truncate font-mono text-muted">
          {root.path || 'PR-level'}
          {root.line ? `:${root.line}` : ''}
        </code>
        {resolved && (
          <span className="shrink-0 rounded-sm bg-add-soft px-1 font-medium text-add">resolved</span>
        )}
        {root.path && (
          <button
            onClick={() => onJump(root.path, root.line)}
            className="ml-auto shrink-0 text-accent hover:underline"
          >
            jump ↪
          </button>
        )}
      </div>
      {replies.length > 0 && (
        <div className="mb-2">
          <SummaryButton
            cacheKey={`thread:${root.id}`}
            kind="thread"
            getText={() => [root, ...replies].map((c) => `${c.login}: ${c.body}`).join('\n\n')}
            label="✨ tl;dr this thread"
          />
        </div>
      )}
      <CommentBody c={root} />
      {replies.length > 0 && (
        <div className="mt-2 space-y-2 border-l-2 border-line pl-3">
          {replies.map((r) => (
            <CommentBody key={r.id} c={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentBody({ c }: { c: ExistingComment }) {
  const firstLine = c.body.split('\n').find((l) => l.trim()) ?? '';
  const isLong = c.body.trim() !== firstLine.trim();
  return (
    <div className="text-xs">
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold uppercase ${
            c.bot ? 'bg-spark-soft text-spark' : 'bg-accent-soft text-accent'
          }`}
        >
          {c.login[0]}
        </span>
        <span className="font-medium text-ink">{c.login}</span>
        {c.bot && <span className="text-spark">ai</span>}
        <span className="text-faint">{timeAgo(c.createdAt)}</span>
      </div>
      {c.bot && isLong ? (
        <details>
          <summary className="cursor-pointer list-none truncate text-muted hover:text-ink">
            {firstLine} <span className="text-faint">— expand</span>
          </summary>
          <div
            className="markdown mt-1 max-h-72 overflow-y-auto leading-relaxed text-muted"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }}
          />
        </details>
      ) : (
        <div
          className="markdown leading-relaxed text-ink"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(c.body) }}
        />
      )}
    </div>
  );
}
