import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  api,
  ApiError,
  ClassifiedFile,
  DraftComment,
  ExistingComment,
  PullRequest,
  ReviewSummary,
} from '../api';
import { GroupCard } from '../components/GroupCard';
import { Minimap } from '../components/Minimap';
import { ReviewForm } from '../components/ReviewForm';
import { SearchPalette } from '../components/SearchPalette';
import { buildGroups } from '../groups';
import { useViewed } from '../viewed';

type Filter = 'hideTests' | 'hideGenerated' | 'hideViewed';

export function PullPage() {
  const { owner = '', repo = '', number = '' } = useParams();
  const prNumber = Number(number);

  const [pr, setPr] = useState<PullRequest | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | undefined>();
  const [files, setFiles] = useState<ClassifiedFile[]>([]);
  const [loadingMore, setLoadingMore] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [drafts, setDrafts] = useState<DraftComment[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filters, setFilters] = useState<Set<Filter>>(new Set());

  const { viewed, setFileViewed, setManyViewed } = useViewed(owner, repo, prNumber);

  // The page is a visualization — native ⌘F can't see collapsed files,
  // so we replace it with a model-aware search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Progressive load: fetch pages until GitHub says there are no more
  // (spec: "Very large pull request").
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let page = 1;
        for (;;) {
          const resp = await api.pull(owner, repo, prNumber, page);
          if (cancelled) return;
          if (page === 1) {
            setPr(resp.pr);
            setSummary(resp.summary);
          }
          setFiles((prev) => [...prev, ...resp.files]);
          if (!resp.hasMore) break;
          page++;
        }
      } catch (err) {
        if (!cancelled && err instanceof ApiError) setError(err);
      } finally {
        if (!cancelled) setLoadingMore(false);
      }
    }
    setFiles([]);
    setError(null);
    setLoadingMore(true);
    load();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, prNumber]);

  const groups = useMemo(() => buildGroups(files), [files]);

  const commentsByFile = useMemo(() => {
    const map = new Map<string, ExistingComment[]>();
    for (const c of summary?.comments ?? []) {
      const list = map.get(c.path) ?? [];
      list.push(c);
      map.set(c.path, list);
    }
    return map;
  }, [summary]);

  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          files: g.files.filter((f) => {
            if (filters.has('hideTests') && f.stratum === 'tests') return false;
            if (filters.has('hideGenerated') && f.stratum === 'generated') return false;
            if (filters.has('hideViewed') && viewed.has(f.filename)) return false;
            return true;
          }),
        }))
        .filter((g) => g.files.length > 0),
    [groups, filters, viewed],
  );

  const viewedCount = files.filter((f) => viewed.has(f.filename)).length;
  const hiddenCount =
    files.length - visibleGroups.reduce((n, g) => n + g.files.length, 0);

  function toggleFilter(f: Filter) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  function addDraft(comment: DraftComment) {
    setDrafts((prev) => [...prev, comment]);
  }
  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 text-center">
        <h2 className="text-lg font-semibold text-zinc-100">
          Couldn’t load {owner}/{repo}#{prNumber}
        </h2>
        <p className="text-sm text-red-400">{error.message}</p>
        {error.installUrl && (
          <a
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            href={error.installUrl}
          >
            Install / request the vibecheck app
          </a>
        )}
        {error.status === 401 && (
          <a
            className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            href="/api/auth/login"
          >
            Sign in again
          </a>
        )}
        <Link to="/" className="text-sm text-zinc-400 underline hover:text-zinc-200">
          Back
        </Link>
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Loading pull request…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <header className="mb-3" data-minimap="overview">
        <div className="mb-1 flex items-baseline gap-3">
          <Link to="/" className="text-sm font-bold text-violet-400 hover:text-violet-300">
            vibecheck
          </Link>
          <a
            href={pr.html_url}
            className="font-mono text-xs text-zinc-500 hover:text-zinc-300"
          >
            {owner}/{repo}#{prNumber} ↗
          </a>
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">{pr.title}</h1>
        {/* One thin context strip — everything else on this page is for working, not reading stats. */}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span
            className={`rounded-full px-2 py-px font-medium ${
              pr.state === 'open'
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-zinc-700/40 text-zinc-400'
            }`}
          >
            {pr.state}
          </span>
          <span>{pr.user.login}</span>
          <span className="font-mono">
            {pr.head.ref} → {pr.base.ref}
          </span>
          <span className="font-mono">
            <span className="text-emerald-500">+{pr.additions}</span>{' '}
            <span className="text-red-500">−{pr.deletions}</span> · {files.length} files
            {loadingMore && '…'}
          </span>
          {summary && (
            <span>
              💬 {summary.reviewComments.human + summary.issueComments.human} human ·{' '}
              <span className="text-amber-400/90">
                {summary.reviewComments.ai + summary.issueComments.ai} ai
              </span>
            </span>
          )}
          {summary?.verdicts.map((v) => (
            <span
              key={v.login}
              className={v.state === 'APPROVED' ? 'text-emerald-400' : 'text-red-400'}
            >
              {v.state === 'APPROVED' ? '✓' : '✗'} {v.login}
              {v.bot ? ' ·ai' : ''}
            </span>
          ))}
        </p>
      </header>

      {/* Intent first: the lens to read the rest of the diff against. */}
      <details
        data-minimap="intent"
        className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04]"
        open
      >
        <summary className="cursor-pointer px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-violet-300 hover:bg-violet-500/10">
          Intent — PR description
        </summary>
        <div className="px-4 pb-3">
          {pr.body ? (
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
              {pr.body}
            </pre>
          ) : (
            <p className="text-sm text-zinc-500">No PR description.</p>
          )}
        </div>
      </details>

      {/* Triage bar: overall burn-down + what to hide. Sticky so the
          progress is always in view while working through groups. */}
      <div className="sticky top-0 z-30 -mx-4 mt-3 mb-4 flex flex-wrap items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-800">
            <span
              className="block h-full rounded-full bg-violet-500 transition-[width]"
              style={{
                width: files.length ? `${(viewedCount / files.length) * 100}%` : '0%',
              }}
            />
          </span>
          <span className="font-mono text-xs text-zinc-400">
            {viewedCount}/{files.length} viewed
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {(
            [
              ['hideTests', 'hide tests'],
              ['hideGenerated', 'hide generated'],
              ['hideViewed', 'hide viewed'],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filters.has(key)
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              }`}
            >
              {label}
            </button>
          ))}
          {hiddenCount > 0 && (
            <span className="ml-1 text-[11px] text-zinc-600">{hiddenCount} hidden</span>
          )}
        </span>
      </div>

      <main className="flex flex-col gap-2">
        {visibleGroups.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            viewed={viewed}
            onFileViewed={setFileViewed}
            onGroupViewed={setManyViewed}
            onComment={addDraft}
            commentsByFile={commentsByFile}
          />
        ))}
        {visibleGroups.length === 0 && !loadingMore && (
          <p className="py-10 text-center text-sm text-zinc-500">
            Everything is hidden by the current filters — nothing left to review. 🎉
          </p>
        )}
      </main>

      <div data-minimap="review">
        <ReviewForm
          owner={owner}
          repo={repo}
          number={prNumber}
          commitId={pr.head.sha}
          drafts={drafts}
          onRemoveDraft={removeDraft}
        />
      </div>

      <Minimap depsKey={`${files.length}:${loadingMore}:${visibleGroups.length}`} />
      <SearchPalette files={files} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
