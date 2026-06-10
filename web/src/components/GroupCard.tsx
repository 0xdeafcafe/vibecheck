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
  intent: 'bg-violet-400',
  core: 'bg-sky-400',
  tests: 'bg-emerald-400',
  generated: 'bg-zinc-500',
};

const STRATUM_LABEL: Record<Stratum, string> = {
  intent: 'intent',
  core: 'core',
  tests: 'tests',
  generated: 'generated',
};

// One collapsed folder of related files: the unit you pick up, review,
// and mark done. The page is a burn-down list of these.
export function GroupCard({
  group,
  viewed,
  onFileViewed,
  onGroupViewed,
  onComment,
  commentsByFile,
}: Props) {
  const viewedCount = group.files.filter((f) => viewed.has(f.filename)).length;
  const done = viewedCount === group.files.length;
  const commentCount = group.files.reduce(
    (n, f) => n + (commentsByFile.get(f.filename)?.length ?? 0),
    0,
  );

  return (
    <details
      data-group={group.id}
      data-minimap={group.dominant}
      className={`overflow-hidden rounded-xl border bg-zinc-900/30 ${
        done ? 'border-zinc-800/60 opacity-60' : 'border-zinc-800'
      }`}
    >
      {/* sticky just below the triage bar so you always know which group you're in */}
      <summary className="sticky top-[42px] z-20 flex cursor-pointer items-center gap-3 bg-zinc-925 px-4 py-2.5 backdrop-blur hover:bg-zinc-800/60">
        <span className={`size-2 shrink-0 rounded-full ${STRATUM_DOT[group.dominant]}`} />
        <code className={`truncate font-mono text-sm ${done ? 'text-zinc-500' : 'text-zinc-100'}`}>
          {group.label}
        </code>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-zinc-500">
          {(Object.entries(group.strata) as [Stratum, number][]).map(([s, n]) => (
            <span key={s} className="flex items-center gap-0.5">
              <span className={`size-1.5 rounded-full ${STRATUM_DOT[s]}`} />
              {n} {STRATUM_LABEL[s]}
            </span>
          ))}
        </span>
        {commentCount > 0 && (
          <span className="shrink-0 text-[11px] text-amber-400/80">💬 {commentCount}</span>
        )}
        <span className="ml-auto shrink-0 font-mono text-[11px]">
          <span className="text-emerald-500">+{group.additions}</span>{' '}
          <span className="text-red-500">−{group.deletions}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="h-1 w-16 overflow-hidden rounded-full bg-zinc-800">
            <span
              className="block h-full rounded-full bg-violet-500 transition-[width]"
              style={{ width: `${(viewedCount / group.files.length) * 100}%` }}
            />
          </span>
          <span className="w-10 text-right font-mono text-[11px] text-zinc-500">
            {viewedCount}/{group.files.length}
          </span>
        </span>
        <button
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
            done
              ? 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              : 'bg-zinc-800 text-zinc-300 hover:bg-violet-600/30 hover:text-violet-200'
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
      <div className="flex flex-col gap-2 border-t border-zinc-800/60 p-3">
        {group.files.map((f) => (
          <FileDiff
            key={f.filename}
            file={f}
            defaultCollapsed={f.stratum === 'generated'}
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
