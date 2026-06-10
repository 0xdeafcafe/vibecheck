import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  api,
  ApiError,
  ClassifiedFile,
  DraftComment,
  PullRequest,
  ReviewSummary,
  Stratum,
} from '../api';
import { FileDiff } from '../components/FileDiff';
import { Minimap } from '../components/Minimap';
import { Overview } from '../components/Overview';
import { ReviewForm } from '../components/ReviewForm';
import { SearchPalette } from '../components/SearchPalette';

const STRATA: { key: Stratum; title: string; blurb: string; collapsed: boolean }[] = [
  { key: 'intent', title: 'Intent', blurb: 'ADRs & specs — read these first', collapsed: false },
  { key: 'core', title: 'Core logic', blurb: 'the changes that matter', collapsed: false },
  { key: 'tests', title: 'Tests', blurb: 'behaviour coverage', collapsed: false },
  { key: 'generated', title: 'Generated', blurb: 'lockfiles & build output, collapsed', collapsed: true },
];

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

  const byStratum = useMemo(() => {
    const groups = new Map<Stratum, ClassifiedFile[]>();
    for (const f of files) {
      const list = groups.get(f.stratum) ?? [];
      list.push(f);
      groups.set(f.stratum, list);
    }
    return groups;
  }, [files]);

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
      <header className="mb-4">
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
        <p className="mt-0.5 text-xs text-zinc-500">
          {pr.user.login} · <span className="font-mono">{pr.head.ref}</span> →{' '}
          <span className="font-mono">{pr.base.ref}</span>
        </p>
      </header>

      <div data-minimap="overview">
        <Overview pr={pr} files={files} summary={summary} loadingMore={loadingMore} />
      </div>

      {/* Intent first: the lens to read the rest of the diff against. */}
      <section
        data-minimap="intent"
        className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4"
      >
        <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-violet-300">
          Intent — PR description
        </h2>
        {pr.body ? (
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
            {pr.body}
          </pre>
        ) : (
          <p className="text-sm text-zinc-500">No PR description.</p>
        )}
      </section>

      <main className="mt-6 flex flex-col gap-6">
        {STRATA.map(({ key, title, blurb, collapsed }) => {
          const group = byStratum.get(key);
          if (!group || group.length === 0) return null;
          return (
            <section key={key} data-minimap={key}>
              <div className="mb-2 flex items-baseline gap-2 border-b border-zinc-800 pb-1.5">
                <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
                <span className="text-xs text-zinc-500">
                  {group.length} file{group.length === 1 ? '' : 's'} · {blurb}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.map((f) => (
                  <FileDiff
                    key={f.filename}
                    file={f}
                    defaultCollapsed={collapsed}
                    onComment={addDraft}
                  />
                ))}
              </div>
            </section>
          );
        })}
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

      <Minimap depsKey={`${files.length}:${loadingMore}`} />
      <SearchPalette files={files} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
