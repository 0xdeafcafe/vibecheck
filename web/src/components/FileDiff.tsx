import { Fragment, useMemo, useState } from 'react';
import { ClassifiedFile, DraftComment } from '../api';
import { parsePatch } from '../diff';

interface Props {
  file: ClassifiedFile;
  defaultCollapsed: boolean;
  onComment: (c: DraftComment) => void;
}

const STATUS_TINT: Record<string, string> = {
  added: 'text-emerald-400',
  removed: 'text-red-400',
  modified: 'text-zinc-500',
  renamed: 'text-sky-400',
};

export function FileDiff({ file, defaultCollapsed, onComment }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [commentingLine, setCommentingLine] = useState<number | null>(null);
  const [body, setBody] = useState('');

  const rows = useMemo(
    () => (file.patch ? parsePatch(file.patch) : []),
    [file.patch],
  );

  function submitComment() {
    if (commentingLine === null || !body.trim()) return;
    onComment({ path: file.filename, line: commentingLine, side: 'RIGHT', body: body.trim() });
    setBody('');
    setCommentingLine(null);
  }

  return (
    <details
      className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/40"
      open={!collapsed}
      onToggle={(e) => setCollapsed(!e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-xs hover:bg-zinc-800/40">
        <code className="font-mono text-zinc-200">{file.filename}</code>
        <span className={STATUS_TINT[file.status] ?? 'text-zinc-500'}>{file.status}</span>
        <span className="ml-auto font-mono text-[11px]">
          <span className="text-emerald-500">+{file.additions}</span>{' '}
          <span className="text-red-500">−{file.deletions}</span>
        </span>
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
                <tr className={`diff-${row.kind}`}>
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
                    {row.text}
                  </td>
                </tr>
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
    </details>
  );
}
