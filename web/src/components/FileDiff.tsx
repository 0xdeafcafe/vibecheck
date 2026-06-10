import { useMemo, useState } from 'react';
import { ClassifiedFile, DraftComment } from '../api';
import { parsePatch } from '../diff';

interface Props {
  file: ClassifiedFile;
  defaultCollapsed: boolean;
  onComment: (c: DraftComment) => void;
}

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
    <details className="file-diff" open={!collapsed} onToggle={(e) => setCollapsed(!e.currentTarget.open)}>
      <summary>
        <code>{file.filename}</code>
        <span className="file-stats">
          {file.status} · +{file.additions} −{file.deletions}
        </span>
      </summary>
      {rows.length === 0 ? (
        <p className="muted">No textual diff available (binary or too large).</p>
      ) : (
        <table className="diff-table">
          <tbody>
            {rows.map((row, i) => (
              <>
                <tr key={i} className={`diff-${row.kind}`}>
                  <td className="lineno">{row.oldLine ?? ''}</td>
                  <td className="lineno">{row.newLine ?? ''}</td>
                  <td className="gutter">
                    {row.newLine !== undefined && row.kind !== 'hunk' && (
                      <button
                        className="add-comment"
                        title="Add review comment"
                        onClick={() => setCommentingLine(row.newLine!)}
                      >
                        +
                      </button>
                    )}
                  </td>
                  <td className="code">
                    <pre>{row.text}</pre>
                  </td>
                </tr>
                {commentingLine !== null &&
                  row.newLine === commentingLine &&
                  row.kind !== 'hunk' && (
                    <tr key={`${i}-comment`} className="comment-row">
                      <td colSpan={4}>
                        <textarea
                          autoFocus
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                          placeholder="Leave a review comment…"
                        />
                        <div className="comment-actions">
                          <button onClick={submitComment}>Add to review</button>
                          <button
                            className="link-button"
                            onClick={() => setCommentingLine(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}
