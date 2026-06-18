import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  api,
  ApiError,
  ClassifiedFile,
  DraftComment,
  ExistingComment,
  PullRequest,
  ReviewSummary,
} from '../api';
import { CommandPalette, type Command } from '../components/CommandPalette';
import { Conversations } from '../components/Conversations';
import { FileDiff } from '../components/FileDiff';
import { GradientBackground } from '../components/GradientBackground';
import { GroupCard } from '../components/GroupCard';
import { Minimap } from '../components/Minimap';
import { ModelPicker } from '../components/ModelPicker';
import { SummaryButton } from '../components/SummaryButton';
import { ReviewForm } from '../components/ReviewForm';
import { SearchPalette } from '../components/SearchPalette';
import { ThemeToggle } from '../components/ThemeToggle';
import { buildGroups } from '../groups';
import { warmSyntax } from '../highlight';
import { buildImportResolver, ImportContext } from '../imports';
import { summarizeIntent } from '../intent';
import { renderMarkdown } from '../markdown';
import { setPref } from '../theme';
import { useViewed } from '../viewed';

type Filter = 'mine' | 'hideTests' | 'hideGenerated' | 'hideDocs' | 'hideViewed';

export function PullPage() {
  const { owner = '', repo = '', number = '' } = useParams();
  const prNumber = Number(number);
  const navigate = useNavigate();

  const [pr, setPr] = useState<PullRequest | null>(null);
  const [summary, setSummary] = useState<ReviewSummary | undefined>();
  const [files, setFiles] = useState<ClassifiedFile[]>([]);
  const [loadingMore, setLoadingMore] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [drafts, setDrafts] = useState<DraftComment[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [convOpen, setConvOpen] = useState(false);
  const [aiAuthored, setAiAuthored] = useState(false);
  const [filters, setFilters] = useState<Set<Filter>>(new Set());

  const { viewed, setFileViewed, setManyViewed } = useViewed(owner, repo, prNumber);
  // the keydown handler reads the live viewed set without re-binding
  const viewedRef = useRef(viewed);
  viewedRef.current = viewed;

  // Start loading the syntax highlighter early — it's code-split, so kick
  // it off while the PR pages are still fetching.
  useEffect(() => {
    warmSyntax();
  }, []);

  // The page is a visualization — native ⌘F can't see collapsed files,
  // so we replace it with a model-aware search. j/k/v/o drive a
  // keyboard review flow over the visible files.
  useEffect(() => {
    function visibleFiles(): HTMLDetailsElement[] {
      return [...document.querySelectorAll<HTMLDetailsElement>('details[data-file]')];
    }
    function current(): HTMLDetailsElement | null {
      return document.querySelector<HTMLDetailsElement>('details[data-file].kbd-focus');
    }
    function focusFile(el: HTMLDetailsElement) {
      current()?.classList.remove('kbd-focus');
      el.classList.add('kbd-focus');
      // the file may live inside a collapsed group — open it to land there
      const group = el.closest<HTMLDetailsElement>('details[data-group]');
      if (group) group.open = true;
      el.scrollIntoView({ block: 'center' });
    }
    function step(dir: 1 | -1) {
      const files = visibleFiles();
      if (files.length === 0) return;
      const idx = files.findIndex((f) => f.classList.contains('kbd-focus'));
      const next = files[Math.min(Math.max(idx + dir, 0), files.length - 1)];
      if (next) focusFile(next);
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      switch (e.key) {
        case 'j':
          e.preventDefault();
          step(1);
          break;
        case 'k':
          e.preventDefault();
          step(-1);
          break;
        case 'o': {
          const el = current();
          if (el) {
            e.preventDefault();
            el.open = !el.open;
          }
          break;
        }
        case 'v': {
          const el = current();
          if (el?.dataset.file) {
            e.preventDefault();
            setFileViewed(el.dataset.file, !viewedRef.current.has(el.dataset.file));
            step(1);
          }
          break;
        }
        case 'c':
          e.preventDefault();
          setConvOpen(true);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setFileViewed]);

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
            setAiAuthored(!!resp.aiAuthored);
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

  // Intent files are surfaced in the top panel as summaries, so keep them
  // out of the main group flow.
  const intentFiles = useMemo(() => files.filter((f) => f.stratum === 'intent'), [files]);
  const groups = useMemo(
    () => buildGroups(files.filter((f) => f.stratum !== 'intent')),
    [files],
  );
  const importResolver = useMemo(() => buildImportResolver(files), [files]);

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
            if (filters.has('mine') && !f.ownedByViewer) return false;
            if (filters.has('hideTests') && f.stratum === 'tests') return false;
            if (filters.has('hideGenerated') && f.stratum === 'generated') return false;
            if (filters.has('hideDocs') && f.stratum === 'docs') return false;
            if (filters.has('hideViewed') && viewed.has(f.filename)) return false;
            return true;
          }),
        }))
        .filter((g) => g.files.length > 0),
    [groups, filters, viewed],
  );

  const commands = useMemo<Command[]>(() => {
    const allFiles = files.map((f) => f.filename);
    const setOpenAll = (open: boolean) =>
      document
        .querySelectorAll<HTMLDetailsElement>('details[data-group], details[data-file]')
        .forEach((d) => (d.open = open));
    const jump = (key: string) =>
      document
        .querySelector(`[data-minimap="${key}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const flt = (k: Filter, label: string): Command => ({
      id: k,
      group: 'Filter',
      label,
      hint: filters.has(k) ? 'on' : '',
      run: () => toggleFilter(k),
    });
    return [
      { id: 'theme-system', group: 'Theme', label: 'Theme: System', run: () => setPref('system') },
      { id: 'theme-light', group: 'Theme', label: 'Theme: Light', run: () => setPref('light') },
      { id: 'theme-dark', group: 'Theme', label: 'Theme: Dark', run: () => setPref('dark') },
      flt('hideTests', 'Toggle hide tests'),
      flt('hideDocs', 'Toggle hide docs'),
      flt('hideGenerated', 'Toggle hide generated'),
      flt('hideViewed', 'Toggle hide viewed'),
      ...(files.some((f) => f.ownedByViewer)
        ? [
            {
              id: 'mine',
              group: 'Filter',
              label: 'Only my owned areas',
              hint: filters.has('mine') ? 'on' : '',
              run: () => toggleFilter('mine'),
            },
            {
              id: 'j-mine',
              group: 'Jump',
              label: 'Jump to your areas',
              run: () =>
                document
                  .querySelector('details[data-group][data-owned]')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            },
          ]
        : []),
      { id: 'expand', group: 'View', label: 'Expand all', run: () => setOpenAll(true) },
      { id: 'collapse', group: 'View', label: 'Collapse all', run: () => setOpenAll(false) },
      {
        id: 'mark-all',
        group: 'Review',
        label: 'Mark all viewed',
        run: () => setManyViewed(allFiles, true),
      },
      {
        id: 'unmark-all',
        group: 'Review',
        label: 'Unmark all viewed',
        run: () => setManyViewed(allFiles, false),
      },
      {
        id: 'search',
        group: 'Go',
        label: 'Search files & lines…',
        hint: '⌘F',
        run: () => setSearchOpen(true),
      },
      {
        id: 'conversations',
        group: 'Go',
        label: 'View all conversations',
        hint: 'c',
        run: () => setConvOpen(true),
      },
      { id: 'j-intent', group: 'Jump', label: 'Jump to intent', run: () => jump('intent') },
      { id: 'j-core', group: 'Jump', label: 'Jump to core logic', run: () => jump('core') },
      { id: 'j-tests', group: 'Jump', label: 'Jump to tests', run: () => jump('tests') },
      { id: 'j-docs', group: 'Jump', label: 'Jump to docs', run: () => jump('docs') },
      { id: 'j-review', group: 'Jump', label: 'Jump to your review', run: () => jump('review') },
      {
        id: 'gh',
        group: 'Go',
        label: 'Open PR on GitHub',
        run: () => pr && window.open(pr.html_url, '_blank'),
      },
      { id: 'home', group: 'Go', label: 'Back to home', run: () => navigate('/') },
    ];
  }, [files, filters, pr, setManyViewed, navigate]);

  const viewedCount = files.filter((f) => viewed.has(f.filename)).length;
  const ownedCount = files.filter((f) => f.ownedByViewer).length;
  const unownedCount = files.filter((f) => f.unowned).length;
  const largePR =
    files.length > 40 || files.reduce((n, f) => n + f.additions + f.deletions, 0) > 4000;
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

  function jumpToComment(path: string, line?: number) {
    setConvOpen(false);
    requestAnimationFrame(() => {
      const file = document.querySelector<HTMLDetailsElement>(
        `details[data-file="${CSS.escape(path)}"]`,
      );
      if (!file) return;
      let a = file.parentElement;
      while (a) {
        if (a instanceof HTMLDetailsElement) a.open = true;
        a = a.parentElement;
      }
      file.open = true;
      const target = (line && file.querySelector<HTMLElement>(`tr[data-line="${line}"]`)) || file;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.remove('flash');
      void target.offsetWidth;
      target.classList.add('flash');
    });
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 text-center">
        <GradientBackground intensity="ambient" />
        <h2 className="font-display text-2xl text-ink">
          Couldn’t load {owner}/{repo}#{prNumber}
        </h2>
        <p className="text-sm text-del">{error.message}</p>
        {error.installUrl && (
          <a
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
            href={error.installUrl}
          >
            Install / request the vibecheck app
          </a>
        )}
        {error.status === 401 && (
          <a
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
            href="/api/auth/login"
          >
            Sign in again
          </a>
        )}
        <Link to="/" className="text-sm text-muted underline hover:text-ink">
          Back
        </Link>
      </div>
    );
  }

  if (!pr) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        <GradientBackground intensity="full" />
        Loading pull request…
      </div>
    );
  }

  return (
    <ImportContext.Provider value={importResolver}>
    <div className="mx-auto max-w-6xl px-4 py-5">
      <GradientBackground intensity="ambient" />
      <header className="mb-3" data-minimap="overview">
        <div className="mb-1 flex items-center gap-3">
          <Link to="/" className="font-display text-base font-medium text-accent hover:text-accent-hover">
            vibecheck
          </Link>
          <a
            href={pr.html_url}
            className="font-mono text-xs text-muted hover:text-ink"
          >
            {owner}/{repo}#{prNumber} ↗
          </a>
          <span className="ml-auto flex items-center gap-2">
            <ModelPicker />
            <ThemeToggle />
          </span>
        </div>
        <h1 className="font-display text-2xl text-ink">{pr.title}</h1>
        {/* One thin context strip — everything else on this page is for working, not reading stats. */}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span
            className={`rounded-full px-2 py-px font-medium ${
              pr.state === 'open' ? 'bg-add-soft text-add' : 'bg-raised text-muted'
            }`}
          >
            {pr.state}
          </span>
          <span>{pr.user.login}</span>
          <span className="font-mono">
            {pr.head.ref} → {pr.base.ref}
          </span>
          <span className="font-mono">
            <span className="text-add">+{pr.additions}</span>{' '}
            <span className="text-del">−{pr.deletions}</span> · {files.length} files
            {loadingMore && '…'}
          </span>
          {summary && (
            <button
              onClick={() => setConvOpen(true)}
              className="rounded-full bg-raised px-2 py-px font-medium text-muted hover:bg-accent-soft hover:text-accent"
              title="View all conversations (c)"
            >
              💬 {summary.reviewComments.human + summary.issueComments.human} human ·{' '}
              <span className="text-spark">
                {summary.reviewComments.ai + summary.issueComments.ai} ai
              </span>
            </button>
          )}
          {summary?.verdicts.map((v) => (
            <span
              key={v.login}
              className={v.state === 'APPROVED' ? 'text-add' : 'text-del'}
            >
              {v.state === 'APPROVED' ? '✓' : '✗'} {v.login}
              {v.bot ? ' ·ai' : ''}
            </span>
          ))}
        </p>
      </header>

      {/* Intent: the lens to read the rest against — but you rarely need to
          re-read it, so it's collapsed by default. Each spec shows a
          heuristic summary, size and new/update without expanding. */}
      <details data-minimap="intent" open className="rounded-xl border border-accent/20 bg-accent-soft">
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-accent hover:bg-accent/10">
          Intent
          <span className="font-sans normal-case text-muted">
            {pr.body ? 'PR description' : 'no description'}
            {intentFiles.length > 0 &&
              ` · ${intentFiles.length} spec${intentFiles.length > 1 ? 's' : ''}`}
          </span>
        </summary>
        <div className="flex flex-col gap-2 px-4 pb-3">
          <div className="flex">
            <SummaryButton
              cacheKey={`intent:${prNumber}:${intentFiles.length}`}
              kind="intent"
              getText={() =>
                `${pr.body}\n\n${intentFiles
                  .map((f) => `--- ${f.filename}\n${f.patch ?? ''}`)
                  .join('\n')}`
              }
              label="✨ tl;dr the intent"
            />
          </div>
          {pr.body ? (
            <div
              className="markdown font-sans text-sm leading-relaxed text-ink"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(pr.body) }}
            />
          ) : (
            <p className="text-sm text-muted">No PR description.</p>
          )}
          {intentFiles.length > 0 && (
            <details open className="rounded-lg border border-line/70 bg-surface/40">
              <summary className="cursor-pointer px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted hover:text-ink">
                {intentFiles.length} spec{intentFiles.length > 1 ? 's' : ''}
              </summary>
              <div className="flex flex-col gap-2 p-2">
                {intentFiles.map((f) => (
                  <FileDiff
                    key={f.filename}
                    file={f}
                    defaultCollapsed
                    viewed={viewed.has(f.filename)}
                    onViewed={(v) => setFileViewed(f.filename, v)}
                    onComment={addDraft}
                    comments={commentsByFile.get(f.filename) ?? []}
                    summary={summarizeIntent(f)}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      </details>

      {/* Review-plan cockpit: who you are on this PR (CODEOWNERS) plus the
          provenance cue. Your owned areas are sorted to the top of the list. */}
      {(ownedCount > 0 || aiAuthored || unownedCount > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-xs">
          {ownedCount > 0 && (
            <span className="font-medium text-accent">
              Your areas — you own {ownedCount} of {files.length} files
            </span>
          )}
          {aiAuthored && (
            <span
              className="rounded-sm bg-spark-soft px-1.5 py-px font-medium text-spark"
              title="This PR contains AI-authored commits"
            >
              AI-authored — verify, don’t skim
            </span>
          )}
          {unownedCount > 0 && <span className="text-muted">{unownedCount} unowned</span>}
          {ownedCount > 0 && (
            <span className="ml-auto text-faint">your areas are sorted first</span>
          )}
        </div>
      )}

      {/* Triage bar: overall burn-down + what to hide. Sticky so the
          progress is always in view while working through groups. */}
      <div className="sticky top-0 z-30 -mx-4 mt-3 mb-4 flex flex-wrap items-center gap-3 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-32 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-accent transition-[width]"
              style={{
                width: files.length ? `${(viewedCount / files.length) * 100}%` : '0%',
              }}
            />
          </span>
          <span className="font-mono text-xs text-muted">
            {viewedCount}/{files.length} viewed
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {(
            [
              ...(ownedCount > 0 ? [['mine', 'only my areas']] : []),
              ['hideTests', 'hide tests'],
              ['hideDocs', 'hide docs'],
              ['hideGenerated', 'hide generated'],
              ['hideViewed', 'hide viewed'],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filters.has(key)
                  ? 'bg-accent text-accent-ink'
                  : 'bg-raised text-muted hover:bg-line hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
          {hiddenCount > 0 && (
            <span className="ml-1 text-[11px] text-faint">{hiddenCount} hidden</span>
          )}
          <span
            className="ml-2 hidden font-mono text-[10px] text-faint md:inline"
            title="Keyboard review: j/k next/prev file · v mark viewed · o expand/collapse · ⌘F search · ⌘K commands"
          >
            j k v o ⌘F ⌘K
          </span>
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
            largePR={largePR}
            aiAuthored={aiAuthored}
          />
        ))}
        {visibleGroups.length === 0 && !loadingMore && (
          <p className="py-10 text-center text-sm text-muted">
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
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} />
      <Conversations
        comments={summary?.comments ?? []}
        open={convOpen}
        onClose={() => setConvOpen(false)}
        onJump={jumpToComment}
      />
    </div>
    </ImportContext.Provider>
  );
}
