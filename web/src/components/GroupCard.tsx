import { useState } from 'react';
import { DraftComment, ExistingComment, Stratum } from '../api';
import { ReviewGroup } from '../groups';
import { FileDiff } from './FileDiff';

interface Props {
  group: ReviewGroup;
  viewed: Set<string>;
  onFileViewed: (filename: string, value: boolean) => void;
  onGroupViewed: (filenames: string[], value: boolean) => void;
  onComment: (c: DraftComment) => void;
  commentsByFile: Map<string, ExistingComment[]>;
}

const STRATUM_DOT: Record<Stratum, string> = {
  intent: 'bg-st-intent',
  core: 'bg-st-core',
  tests: 'bg-st-tests',
  docs: 'bg-st-docs',
  generated: 'bg-st-generated',
};

const STRATUM_LABEL: Record<Stratum, string> = {
  intent: 'intent',
  core: 'core',
  tests: 'tests',
  docs: 'docs',
  generated: 'generated',
};

// One collapsed folder of related files — or a cluster of mechanically
// identical edits — the unit you pick up, review, and mark done. The page
// is a burn-down list of these.
export function GroupCard({
  group,
  viewed,
  onFileViewed,
  onGroupViewed,
  onComment,
  commentsByFile,
}: Props) {
  // Collapse by default for clusters and any heavy group (lots of files or
  // churn) — a big PR should render super-flat and you expand what you want
  // as you go, instead of paying to render thousands of rows up front.
  const heavy = group.files.length > 5 || group.additions + group.deletions > 2000;
  const [open, setOpen] = useState(group.kind !== 'cluster' && !heavy);
  const viewedCount = group.files.filter((f) => viewed.has(f.filename)).length;
  const done = viewedCount === group.files.length;
  const commentCount = group.files.reduce(
    (n, f) => n + (commentsByFile.get(f.filename)?.length ?? 0),
    0,
  );
  const isCluster = group.kind === 'cluster';

  return (
    <details
      data-group={group.id}
      data-minimap={isCluster ? 'generated' : group.dominant}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={`overflow-hidden rounded-xl border bg-surface ${
        done ? 'border-line/60 opacity-60' : 'border-line'
      }`}
    >
      {/* sticky just below the triage bar so you always know which group you're in */}
      <summary className="sticky top-[42px] z-20 flex cursor-pointer items-center gap-3 bg-surface/90 px-4 py-2.5 backdrop-blur hover:bg-raised">
        {isCluster ? (
          <>
            <span className="size-2 shrink-0 rounded-full bg-st-mech" />
            <code className="truncate font-mono text-sm text-ink">{group.signature}</code>
            <span className="shrink-0 rounded-sm bg-st-mech/15 px-1.5 py-px text-[10px] font-medium text-st-mech">
              mechanical · {group.files.length} files
            </span>
          </>
        ) : (
          <>
            <span className={`size-2 shrink-0 rounded-full ${STRATUM_DOT[group.dominant]}`} />
            <code className={`truncate font-mono text-sm ${done ? 'text-faint' : 'text-ink'}`}>
              {group.label}
            </code>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
              {(Object.entries(group.strata) as [Stratum, number][]).map(([s, n]) => (
                <span key={s} className="flex items-center gap-0.5">
                  <span className={`size-1.5 rounded-full ${STRATUM_DOT[s]}`} />
                  {n} {STRATUM_LABEL[s]}
                </span>
              ))}
            </span>
          </>
        )}
        {commentCount > 0 && (
          <span className="shrink-0 text-[11px] text-spark">💬 {commentCount}</span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[11px]">
          <span className="text-add">+{group.additions}</span>{' '}
          <span className="text-del">−{group.deletions}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="h-1 w-16 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${(viewedCount / group.files.length) * 100}%` }}
            />
          </span>
          <span className="w-10 text-right font-mono text-[11px] text-muted">
            {viewedCount}/{group.files.length}
          </span>
        </span>
        <button
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
            done
              ? 'text-muted hover:bg-raised hover:text-ink'
              : 'bg-raised text-muted hover:bg-accent-soft hover:text-accent'
          }`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onGroupViewed(
              group.files.map((f) => f.filename),
              !done,
            );
          }}
        >
          {done ? 'unmark' : 'mark all viewed'}
        </button>
      </summary>
      <div className="flex flex-col gap-2 border-t border-line p-3">
        {group.files.map((f) => (
          <FileDiff
            key={f.filename}
            file={f}
            defaultCollapsed={
              f.stratum === 'generated' || f.status === 'removed' || !!f.mechanical
            }
            viewed={viewed.has(f.filename)}
            onViewed={(v) => onFileViewed(f.filename, v)}
            onComment={onComment}
            comments={commentsByFile.get(f.filename) ?? []}
          />
        ))}
      </div>
    </details>
  );
}
