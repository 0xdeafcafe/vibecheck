import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  api,
  ApiError,
  ClassifiedFile,
  DraftComment,
  PullRequest,
  Stratum,
} from '../api';
import { FileDiff } from '../components/FileDiff';
import { ReviewForm } from '../components/ReviewForm';

const STRATA: { key: Stratum; title: string; collapsed: boolean }[] = [
  { key: 'intent', title: 'Intent — ADRs & specs', collapsed: false },
  { key: 'core', title: 'Core logic', collapsed: false },
  { key: 'tests', title: 'Tests', collapsed: false },
  { key: 'generated', title: 'Generated', collapsed: true },
];

export function PullPage() {
  const { owner = '', repo = '', number = '' } = useParams();
  const prNumber = Number(number);

  const [pr, setPr] = useState<PullRequest | null>(null);
  const [files, setFiles] = useState<ClassifiedFile[]>([]);
  const [loadingMore, setLoadingMore] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [drafts, setDrafts] = useState<DraftComment[]>([]);

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
          if (page === 1) setPr(resp.pr);
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
      <div className="page-center">
        <h2>Couldn’t load {owner}/{repo}#{prNumber}</h2>
        <p className="error">{error.message}</p>
        {error.installUrl && (
          <a className="button" href={error.installUrl}>
            Install / request the vibecheck app
          </a>
        )}
        {error.status === 401 && (
          <a className="button" href="/api/auth/login">
            Sign in again
          </a>
        )}
        <Link to="/">Back</Link>
      </div>
    );
  }

  if (!pr) return <div className="page-center">Loading pull request…</div>;

  const intentFiles = byStratum.get('intent') ?? [];

  return (
    <div className="pull-page">
      <header className="pull-header">
        <Link to="/">vibecheck</Link>
        <h1>
          {pr.title}{' '}
          <a href={pr.html_url} className="pr-link">
            {owner}/{repo}#{prNumber}
          </a>
        </h1>
        <div className="pr-meta">
          {pr.user.login} wants to merge {pr.commits} commit(s) into{' '}
          <code>{pr.base.ref}</code> from <code>{pr.head.ref}</code> · +
          {pr.additions} −{pr.deletions}
          {loadingMore && <span className="loading-more"> · loading files…</span>}
        </div>
      </header>

      {/* Intent panel first: the lens to read the rest of the diff against. */}
      <section className="intent-panel">
        <h2>Intent</h2>
        {pr.body ? (
          <pre className="pr-body">{pr.body}</pre>
        ) : (
          <p className="muted">No PR description.</p>
        )}
        {intentFiles.length > 0 && (
          <p className="muted">
            {intentFiles.length} intent document(s) changed in this PR — shown
            first below.
          </p>
        )}
      </section>

      <main className="strata">
        {STRATA.map(({ key, title, collapsed }) => {
          const group = byStratum.get(key);
          if (!group || group.length === 0) return null;
          return (
            <section key={key} className={`stratum stratum-${key}`}>
              <h2>
                {title} <span className="count">{group.length}</span>
              </h2>
              {group.map((f) => (
                <FileDiff
                  key={f.filename}
                  file={f}
                  defaultCollapsed={collapsed}
                  onComment={addDraft}
                />
              ))}
            </section>
          );
        })}
      </main>

      <ReviewForm
        owner={owner}
        repo={repo}
        number={prNumber}
        commitId={pr.head.sha}
        drafts={drafts}
        onRemoveDraft={removeDraft}
      />
    </div>
  );
}
