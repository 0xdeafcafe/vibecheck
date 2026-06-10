import { ClassifiedFile, PullRequest, ReviewSummary, Stratum } from '../api';
import { FileTree } from './FileTree';

const STRATUM_LABEL: Record<Stratum, string> = {
  intent: 'intent',
  core: 'core',
  tests: 'tests',
  generated: 'generated',
};

const STRATUM_CHIP: Record<Stratum, string> = {
  intent: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  core: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  tests: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  generated: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30',
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="text-sm text-zinc-200">{children}</dd>
    </div>
  );
}

interface Props {
  pr: PullRequest;
  files: ClassifiedFile[];
  summary?: ReviewSummary;
  loadingMore: boolean;
}

export function Overview({ pr, files, summary, loadingMore }: Props) {
  const strataCounts = files.reduce(
    (acc, f) => ((acc[f.stratum] = (acc[f.stratum] ?? 0) + 1), acc),
    {} as Record<Stratum, number>,
  );

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(260px,360px)]">
        {/* Left: state + activity stats */}
        <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-3 sm:grid-cols-3">
          <Stat label="State">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                pr.state === 'open'
                  ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                  : 'bg-purple-500/15 text-purple-300 ring-purple-500/30'
              }`}
            >
              {pr.state}
            </span>
          </Stat>
          <Stat label="Size">
            <span className="font-mono text-xs">
              <span className="text-emerald-400">+{pr.additions}</span>{' '}
              <span className="text-red-400">−{pr.deletions}</span>
              <span className="text-zinc-500"> · {pr.commits} commits</span>
            </span>
          </Stat>
          <Stat label="Files">
            <span className="flex flex-wrap gap-1">
              {(Object.keys(STRATUM_LABEL) as Stratum[]).map((s) =>
                strataCounts[s] ? (
                  <span
                    key={s}
                    className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ${STRATUM_CHIP[s]}`}
                  >
                    {strataCounts[s]} {STRATUM_LABEL[s]}
                  </span>
                ) : null,
              )}
              {loadingMore && <span className="text-xs text-zinc-500">loading…</span>}
            </span>
          </Stat>
          {summary && (
            <>
              <Stat label="Inline comments">
                <span className="font-mono text-xs">
                  <span className="text-zinc-200">{summary.reviewComments.human}</span>
                  <span className="text-zinc-500"> human · </span>
                  <span className="text-amber-300">{summary.reviewComments.ai}</span>
                  <span className="text-zinc-500"> AI</span>
                </span>
              </Stat>
              <Stat label="Thread comments">
                <span className="font-mono text-xs">
                  <span className="text-zinc-200">{summary.issueComments.human}</span>
                  <span className="text-zinc-500"> human · </span>
                  <span className="text-amber-300">{summary.issueComments.ai}</span>
                  <span className="text-zinc-500"> AI</span>
                </span>
              </Stat>
              <Stat label="Verdicts">
                {summary.verdicts.length === 0 ? (
                  <span className="text-xs text-zinc-500">none yet</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {summary.verdicts.map((v) => (
                      <span
                        key={v.login}
                        title={v.state}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ring-1 ${
                          v.state === 'APPROVED'
                            ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30'
                            : 'bg-red-500/15 text-red-300 ring-red-500/30'
                        }`}
                      >
                        {v.state === 'APPROVED' ? '✓' : '✗'} {v.login}
                        {v.bot && <span className="text-amber-300">·ai</span>}
                      </span>
                    ))}
                  </span>
                )}
              </Stat>
            </>
          )}
        </dl>

        {/* Right: areas touched */}
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
          <h3 className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Areas touched
          </h3>
          <FileTree files={files} />
        </div>
      </div>
    </section>
  );
}
