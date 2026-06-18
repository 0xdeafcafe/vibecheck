import { useState } from 'react';
import { DraftComment, ExistingComment, Stratum } from '../api';
import { ReviewGroup } from '../groups';
import { groupRisk } from '../risk';
import { FileDiff } from './FileDiff';
import { SummaryButton } from './SummaryButton';

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

function jumpToFile(filename: string) {
  const el = document.querySelector<HTMLDetailsElement>(
    `details[data-file="${CSS.escape(filename)}"]`,
  );
  if (!el) return;
  el.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface Props {
  group: ReviewGroup;
  viewed: Set<string>;
  onFileViewed: (filename: string, value: boolean) => void;
  onGroupViewed: (filenames: string[], value: boolean) => void;
  onComment: (c: DraftComment) => void;
  commentsByFile: Map<string, ExistingComment[]>;
  largePR: boolean;
  aiAuthored: boolean;
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
  largePR,
  aiAuthored,
}: Props) {
  // Collapse by default for clusters, heavy groups, and everything on a large
  // PR — the page becomes a summarised accordion you drill into, and a
  // collapsed group doesn't mount its diffs at all.
  const heavy = group.files.length > 5 || group.additions + group.deletions > 2000;
  const collapsedByDefault = group.kind === 'cluster' || heavy || largePR;
  const [open, setOpen] = useState(!collapsedByDefault);
  const risk = groupRisk(group, aiAuthored);
  const viewedCount = group.files.filter((f) => viewed.has(f.filename)).length;
  const done = viewedCount === group.files.length;
  const commentCount = group.files.reduce(
    (n, f) => n + (commentsByFile.get(f.filename)?.length ?? 0),
    0,
  );
  const isCluster = group.kind === 'cluster';
  const whyGrouped = isCluster
    ? `One mechanical edit repeated across ${group.files.length} files`
    : [
        `${group.files.length} files in this folder`,
        (Object.entries(group.strata) as [Stratum, number][])
          .map(([s, n]) => `${n} ${s}`)
          .join(', '),
        risk.reasons.length ? `risk: ${risk.reasons.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <details
      data-group={group.id}
      data-minimap={isCluster ? 'generated' : group.dominant}
      data-owned={group.owned > 0 ? '' : undefined}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={`overflow-hidden rounded-xl border bg-surface ${
        done ? 'border-line/60 opacity-60' : 'border-line'
      }`}
    >
      {/* sticky just below the triage bar so you always know which group you're in */}
      <summary className="sticky top-[42px] z-20 flex flex-col gap-2 bg-surface/90 px-4 py-2.5 backdrop-blur">
        <div className="flex w-full cursor-pointer items-center gap-3">
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
            {risk.level !== 'low' && (
              <span
                className={`shrink-0 rounded-sm px-1 text-[10px] font-semibold uppercase tracking-wide ${
                  risk.level === 'high' ? 'bg-del-soft text-del' : 'bg-spark-soft text-spark'
                }`}
                title={`Risk: ${risk.reasons.join(', ')}`}
              >
                {risk.level === 'high' ? 'high risk' : 'med risk'}
              </span>
            )}
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
              {(Object.entries(group.strata) as [Stratum, number][]).map(([s, n]) => (
                <span key={s} className="flex items-center gap-0.5">
                  <span className={`size-1.5 rounded-full ${STRATUM_DOT[s]}`} />
                  {n} {STRATUM_LABEL[s]}
                </span>
              ))}
            </span>
            {group.owned > 0 && (
              <span
                className="shrink-0 rounded-sm bg-accent-soft px-1 text-[10px] font-semibold uppercase tracking-wide text-accent"
                title="You own files here (CODEOWNERS)"
              >
                yours{group.owned < group.files.length ? ` ·${group.owned}` : ''}
              </span>
            )}
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
        </div>
        {/* Slice header, pinned while you scroll the group: why these files
            are together + a done/upcoming manifest you can jump from. */}
        {open && (
          <div
            className="flex flex-col gap-1.5 border-t border-line pt-2 text-[11px]"
            onClick={(e) => e.preventDefault()}
          >
            <span className="text-faint">{whyGrouped}</span>
            <div className="flex">
              <SummaryButton
                cacheKey={`slice:${group.id}:${group.additions}-${group.deletions}`}
                kind="slice"
                getText={() =>
                  group.files.map((f) => `--- ${f.filename}\n${f.patch ?? ''}`).join('\n')
                }
                label="✨ tl;dr this slice"
              />
            </div>
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {group.files.map((f) => {
                const v = viewed.has(f.filename);
                return (
                  <button
                    key={f.filename}
                    title={f.filename}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      jumpToFile(f.filename);
                    }}
                    className={`flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono ${
                      v ? 'text-faint' : 'text-muted hover:bg-raised hover:text-ink'
                    }`}
                  >
                    <span className={v ? 'text-add' : 'text-faint'}>{v ? '✓' : '○'}</span>
                    {basename(f.filename)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </summary>
      {/* Only mount the files when the group is open — collapsed groups cost
          nothing, which is what makes a 200-file PR usable. */}
      {open && (
        <div className="flex flex-col gap-2 border-t border-line p-3">
          {group.files.map((f) => (
            <FileDiff
              key={f.filename}
              file={f}
              defaultCollapsed={
                f.stratum === 'generated' ||
                f.status === 'removed' ||
                !!f.mechanical ||
                (largePR && (f.stratum === 'tests' || f.stratum === 'docs'))
              }
              viewed={viewed.has(f.filename)}
              onViewed={(v) => onFileViewed(f.filename, v)}
              onComment={onComment}
              comments={commentsByFile.get(f.filename) ?? []}
            />
          ))}
        </div>
      )}
    </details>
  );
}
