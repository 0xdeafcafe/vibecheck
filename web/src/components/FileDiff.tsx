import { Fragment, useMemo, useState } from 'react';
import { ClassifiedFile, DraftComment, ExistingComment } from '../api';
import { parsePatch } from '../diff';
import { highlightLine, languageFor, useSyntax } from '../highlight';
import { renderMarkdown } from '../markdown';
import { SummaryButton } from './SummaryButton';

interface Props {
  file: ClassifiedFile;
  defaultCollapsed: boolean;
  viewed: boolean;
  onViewed: (value: boolean) => void;
  onComment: (c: DraftComment) => void;
  comments: ExistingComment[];
  summary?: string; // when set, renders intent-style summary + new/update badge
}

const STATUS_TINT: Record<string, string> = {
  added: 'text-add',
  removed: 'text-del',
  modified: 'text-muted',
  renamed: 'text-accent',
  copied: 'text-accent',
};

export function FileDiff({
  file,
  defaultCollapsed,
  viewed,
  onViewed,
  onComment,
  comments,
  summary,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed || viewed);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const [body, setBody] = useState('');
  // Re-render when Shiki finishes loading or the theme flips, so the diff
  // upgrades from plain text to themed syntax colours.
  useSyntax();

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
      className={`overflow-hidden rounded-lg border border-line bg-canvas ${
        viewed ? 'opacity-50' : ''
      }`}
      open={!collapsed}
      onToggle={(e) => setCollapsed(!e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-xs hover:bg-raised">
        <code className={`font-mono ${viewed ? 'text-faint' : 'text-ink'}`}>
          {file.filename}
        </code>
        {summary === undefined ? (
          <span className={STATUS_TINT[file.status] ?? 'text-muted'}>{file.status}</span>
        ) : (
          <span
            className={`shrink-0 rounded-sm px-1 text-[10px] font-semibold uppercase tracking-wide ${
              file.status === 'added'
                ? 'bg-add-soft text-add'
                : file.status === 'renamed'
                  ? 'bg-accent-soft text-accent'
                  : 'bg-raised text-muted'
            }`}
          >
            {file.status === 'added' ? 'new' : file.status === 'renamed' ? 'moved' : 'update'}
          </span>
        )}
        {file.status === 'renamed' && file.previousFilename && (
          <code className="truncate font-mono text-[11px] text-faint">
            ← {file.previousFilename}
          </code>
        )}
        {summary ? (
          <span className="min-w-0 flex-1 truncate font-sans text-muted">{summary}</span>
        ) : null}
        {file.ownedByViewer ? (
          <span
            className="shrink-0 rounded-sm bg-accent-soft px-1 text-[10px] font-semibold uppercase tracking-wide text-accent"
            title="You own this file (CODEOWNERS)"
          >
            yours
          </span>
        ) : file.unowned ? (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-faint" title="No CODEOWNERS owner">
            unowned
          </span>
        ) : file.owners && file.owners.length > 0 ? (
          <span
            className="shrink-0 truncate font-mono text-[11px] text-faint"
            title={`Owners: ${file.owners.join(', ')}`}
          >
            {file.owners[0]}
          </span>
        ) : null}
        {comments.length > 0 && <span className="text-spark">💬 {comments.length}</span>}
        <span className="ml-auto font-mono text-[11px]">
          <span className="text-add">+{file.additions}</span>{' '}
          <span className="text-del">−{file.deletions}</span>
        </span>
        <label
          className="flex cursor-pointer select-none items-center gap-1 text-[11px] text-muted hover:text-ink"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={viewed}
            onChange={(e) => toggleViewed(e.target.checked)}
            className="size-3 accent-[var(--color-accent)]"
          />
          viewed
        </label>
      </summary>
      {!collapsed && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
          <SummaryButton
            cacheKey={`file:${file.filename}:${(file.patch ?? '').length}`}
            kind="file"
            getText={() => `${file.filename}\n${file.patch ?? ''}`}
            label="✨ tl;dr this file"
          />
        </div>
      )}
      {/* Mount the diff only when open — a closed <details> still renders its
          children into the DOM, which is what made big PRs unusable. */}
      {!collapsed &&
        (rows.length === 0 ? (
          <p className="border-t border-line px-3 py-2 text-xs text-muted">
            No textual diff available (binary or too large).
          </p>
        ) : (
        <table className="w-full border-collapse border-t border-line font-mono text-xs leading-5">
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={i}>
                <tr data-row={i} className={`diff-${row.kind}`}>
                  <td className="lineno w-[1%] min-w-9 select-none px-1.5 text-right align-top text-faint">
                    {row.oldLine ?? ''}
                  </td>
                  <td className="lineno w-[1%] min-w-9 select-none px-1.5 text-right align-top text-faint">
                    {row.newLine ?? ''}
                  </td>
                  <td className="w-5 align-top">
                    {row.newLine !== undefined && row.kind !== 'hunk' && (
                      <button
                        className="add-comment invisible size-4 rounded-sm bg-accent text-center text-[11px] leading-4 text-accent-ink hover:bg-accent-hover"
                        title="Add review comment"
                        onClick={() => setCommentingLine(row.newLine!)}
                      >
                        +
                      </button>
                    )}
                  </td>
                  <td className="whitespace-pre-wrap break-all pr-2 text-ink">
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
                      <td colSpan={4} className="bg-raised px-3 py-1.5">
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
                      <td colSpan={4} className="bg-raised px-3 py-2">
                        <textarea
                          autoFocus
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder="Leave a review comment…"
                          className="min-h-16 w-full rounded-md border border-line bg-surface p-2 font-sans text-sm text-ink outline-none focus:border-accent"
                        />
                        <div className="mt-1.5 flex gap-2">
                          <button
                            onClick={submitComment}
                            className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
                          >
                            Add to review
                          </button>
                          <button
                            className="text-xs text-muted underline hover:text-ink"
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
        ))}
      {!collapsed && byLine.orphans.length > 0 && (
        <div className="border-t border-line px-3 py-1.5">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-faint">
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

// AI bots write essays. Lead with an on-device Gemma tl;dr (full-width,
// never truncated) and tuck the full text behind a disclosure. Humans get
// their comment as-is.
function ExistingCommentView({ comment }: { comment: ExistingComment }) {
  const firstLine = comment.body.split('\n').find((l) => l.trim()) ?? '';
  const isLong = comment.body.trim() !== firstLine.trim();

  if (comment.bot && isLong) {
    return (
      <div className="my-0.5 flex flex-col gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-sm bg-spark-soft px-1 font-medium text-spark">
            {comment.login} · ai
          </span>
          <SummaryButton
            cacheKey={`comment:${comment.id}`}
            kind="comment"
            getText={() => comment.body}
          />
        </div>
        <details>
          <summary className="cursor-pointer list-none text-[11px] text-faint hover:text-muted">
            full comment ▾
          </summary>
          <div
            className="markdown mt-1 max-h-64 overflow-y-auto border-t border-line pt-1.5 font-sans leading-relaxed text-muted"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }}
          />
        </details>
      </div>
    );
  }
  return (
    <div className="my-0.5 rounded-md border border-line bg-surface px-2 py-1 font-sans text-xs">
      <span
        className={`mr-2 float-left rounded-sm px-1 font-medium ${
          comment.bot ? 'bg-spark-soft text-spark' : 'bg-accent-soft text-accent'
        }`}
      >
        {comment.login}
        {comment.bot ? ' · ai' : ''}
      </span>
      <div
        className="markdown leading-relaxed text-ink"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }}
      />
    </div>
  );
}
