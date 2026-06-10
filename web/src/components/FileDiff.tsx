import { Fragment, useEffect, useMemo, useState } from 'react';
import { ClassifiedFile, DraftComment, ExistingComment } from '../api';
import { parsePatch } from '../diff';
import { highlightLine, languageFor } from '../highlight';
import { cachedSummary, onModelProgress, summarize } from '../llm';
import { renderMarkdown } from '../markdown';

interface Props {
  file: ClassifiedFile;
  defaultCollapsed: boolean;
  viewed: boolean;
  onViewed: (value: boolean) => void;
  onComment: (c: DraftComment) => void;
  comments: ExistingComment[];
}

const STATUS_TINT: Record<string, string> = {
  added: 'text-emerald-400',
  removed: 'text-red-400',
  modified: 'text-zinc-500',
  renamed: 'text-sky-400',
};

export function FileDiff({ file, defaultCollapsed, viewed, onViewed, onComment, comments }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed || viewed);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const [body, setBody] = useState('');

  const rows = useMemo(
    () => (file.patch ? parsePatch(file.patch) : []),
    [file.patch],
  );
  const language = languageFor(file.filename);

  // Anchor existing comments to RIGHT-side line numbers; comments on
  // outdated hunks (line 0/undefined) collect at the bottom of the file.
  const byLine = useMemo(() => {
    const map = new Map<number, ExistingComment[]>();
    const orphans: ExistingComment[] = [];
    for (const c of comments) {
      if (c.line && c.side !== 'LEFT') {
        const list = map.get(c.line) ?? [];
        list.push(c);
        map.set(c.line, list);
      } else {
        orphans.push(c);
      }
    }
    return { map, orphans };
  }, [comments]);

  function submitComment() {
    if (commentingLine === null || !body.trim()) return;
    onComment({ path: file.filename, line: commentingLine, side: 'RIGHT', body: body.trim() });
    setBody('');
    setCommentingLine(null);
  }

  function toggleViewed(value: boolean) {
    onViewed(value);
    if (value) setCollapsed(true);
  }

  return (
    <details
      data-file={file.filename}
      className={`overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40 ${
        viewed ? 'opacity-50' : ''
      }`}
      open={!collapsed}
      onToggle={(e) => setCollapsed(!e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-xs hover:bg-zinc-800/40">
        <code className={`font-mono ${viewed ? 'text-zinc-500' : 'text-zinc-200'}`}>
          {file.filename}
        </code>
        <span className={STATUS_TINT[file.status] ?? 'text-zinc-500'}>{file.status}</span>
        {comments.length > 0 && (
          <span className="text-amber-400/80">
            💬 {comments.length}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px]">
          <span className="text-emerald-500">+{file.additions}</span>{' '}
          <span className="text-red-500">−{file.deletions}</span>
        </span>
        <label
          className="flex cursor-pointer select-none items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={viewed}
            onChange={(e) => toggleViewed(e.target.checked)}
            className="size-3 accent-violet-500"
          />
          viewed
        </label>
      </summary>
      {rows.length === 0 ? (
        <p className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-500">
          No textual diff available (binary or too large).
        </p>
      ) : (
        <table className="w-full border-collapse border-t border-zinc-800 font-mono text-xs leading-5">
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={i}>
                <tr data-row={i} className={`diff-${row.kind}`}>
                  <td className="lineno w-[1%] min-w-9 select-none px-1.5 text-right align-top text-zinc-600">
                    {row.oldLine ?? ''}
                  </td>
                  <td className="lineno w-[1%] min-w-9 select-none px-1.5 text-right align-top text-zinc-600">
                    {row.newLine ?? ''}
                  </td>
                  <td className="w-5 align-top">
                    {row.newLine !== undefined && row.kind !== 'hunk' && (
                      <button
                        className="add-comment invisible size-4 rounded-sm bg-violet-600 text-center text-[11px] leading-4 text-white hover:bg-violet-500"
                        title="Add review comment"
                        onClick={() => setCommentingLine(row.newLine!)}
                      >
                        +
                      </button>
                    )}
                  </td>
                  <td className="whitespace-pre-wrap break-all pr-2 text-zinc-300">
                    {row.kind === 'hunk' ? (
                      row.text
                    ) : (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: highlightLine(row.text, language),
                        }}
                      />
                    )}
                  </td>
                </tr>
                {row.newLine !== undefined &&
                  byLine.map.has(row.newLine) &&
                  row.kind !== 'hunk' && (
                    <tr>
                      <td colSpan={4} className="bg-zinc-900/70 px-3 py-1.5">
                        {byLine.map.get(row.newLine)!.map((c) => (
                          <ExistingCommentView key={c.id} comment={c} />
                        ))}
                      </td>
                    </tr>
                  )}
                {commentingLine !== null &&
                  row.newLine === commentingLine &&
                  row.kind !== 'hunk' && (
                    <tr>
                      <td colSpan={4} className="bg-zinc-900 px-3 py-2">
                        <textarea
                          autoFocus
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder="Leave a review comment…"
                          className="min-h-16 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 font-sans text-sm text-zinc-200 outline-none focus:border-violet-500"
                        />
                        <div className="mt-1.5 flex gap-2">
                          <button
                            onClick={submitComment}
                            className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-500"
                          >
                            Add to review
                          </button>
                          <button
                            className="text-xs text-zinc-400 underline hover:text-zinc-200"
                            onClick={() => setCommentingLine(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {byLine.orphans.length > 0 && (
        <div className="border-t border-zinc-800 px-3 py-1.5">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-zinc-600">
            Comments on outdated lines
          </p>
          {byLine.orphans.map((c) => (
            <ExistingCommentView key={c.id} comment={c} />
          ))}
        </div>
      )}
    </details>
  );
}

// AI bots write essays; collapse them to one line by default. Humans
// get their full comment. The ✨tl;dr button runs a tiny in-browser
// Gemma to compress the essay into one sentence (cached per comment).
function ExistingCommentView({ comment }: { comment: ExistingComment }) {
  const firstLine = comment.body.split('\n').find((l) => l.trim()) ?? '';
  const isLong = comment.body.trim() !== firstLine.trim();
  const [summary, setSummary] = useState<string | null>(() => cachedSummary(comment.id));
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!working) return;
    return onModelProgress(setProgress);
  }, [working]);

  async function tldr(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setWorking(true);
    try {
      setSummary(await summarize(comment.id, comment.body));
    } catch (err) {
      console.error('tl;dr failed', err);
      setSummary(null);
    } finally {
      setWorking(false);
      setProgress(null);
    }
  }

  if (comment.bot && isLong) {
    return (
      <details className="my-0.5 rounded-md border border-zinc-800 bg-zinc-950/60">
        <summary className="flex cursor-pointer items-baseline gap-2 px-2 py-1 font-sans text-xs hover:bg-zinc-800/40">
          <span className="shrink-0 rounded-sm bg-amber-500/15 px-1 font-medium text-amber-400">
            {comment.login} · ai
          </span>
          <span className={`truncate ${summary ? 'text-zinc-300' : 'text-zinc-500'}`}>
            {summary ? `✨ ${summary}` : firstLine}
          </span>
          {!summary && (
            <button
              onClick={tldr}
              disabled={working}
              className="ml-auto shrink-0 rounded-sm bg-zinc-800 px-1.5 text-[10px] text-zinc-400 hover:bg-violet-600/30 hover:text-violet-200 disabled:opacity-60"
              title="Summarize with on-device Gemma — first use downloads the model"
            >
              {working
                ? progress !== null && progress < 100
                  ? `model ${progress}%`
                  : 'thinking…'
                : '✨ tl;dr'}
            </button>
          )}
        </summary>
        <div
          className="markdown max-h-64 overflow-y-auto border-t border-zinc-800 px-2 py-1.5 font-sans text-xs leading-relaxed text-zinc-400"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }}
        />
      </details>
    );
  }
  return (
    <div className="my-0.5 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1 font-sans text-xs">
      <span
        className={`mr-2 float-left rounded-sm px-1 font-medium ${
          comment.bot ? 'bg-amber-500/15 text-amber-400' : 'bg-sky-500/15 text-sky-400'
        }`}
      >
        {comment.login}
        {comment.bot ? ' · ai' : ''}
      </span>
      <div
        className="markdown leading-relaxed text-zinc-300"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }}
      />
    </div>
  );
}
