import { useState } from 'react';
import { api, ApiError, DraftComment } from '../api';

interface Props {
  owner: string;
  repo: string;
  number: number;
  commitId: string;
  drafts: DraftComment[];
  onRemoveDraft: (index: number) => void;
}

type Verdict = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

const VERDICTS: { value: Verdict; label: string; active: string }[] = [
  { value: 'APPROVE', label: 'Approve', active: 'bg-emerald-600 text-white' },
  { value: 'REQUEST_CHANGES', label: 'Request changes', active: 'bg-red-600 text-white' },
  { value: 'COMMENT', label: 'Comment', active: 'bg-zinc-600 text-white' },
];

export function ReviewForm({ owner, repo, number, commitId, drafts, onRemoveDraft }: Props) {
  const [verdict, setVerdict] = useState<Verdict>('COMMENT');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      await api.submitReview(owner, repo, number, {
        event: verdict,
        body: summary,
        commitId,
        comments: drafts,
      });
      setDone(true);
    } catch (err) {
      // Submission failure must not lose the drafted review
      // (spec: "Review submission fails at GitHub").
      setError(err instanceof ApiError ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <footer className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
        ✓ Review submitted — it’s now on{' '}
        <a
          className="underline"
          href={`https://github.com/${owner}/${repo}/pull/${number}`}
        >
          GitHub
        </a>
        .
      </footer>
    );
  }

  return (
    <footer className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 pb-5">
      <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Your review {drafts.length > 0 && `· ${drafts.length} pending comment(s)`}
      </h2>
      {drafts.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {drafts.map((d, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs">
              <code className="shrink-0 font-mono text-violet-300">
                {d.path}:{d.line}
              </code>
              <span className="text-zinc-300">{d.body}</span>
              <button
                className="ml-auto shrink-0 text-zinc-500 underline hover:text-zinc-300"
                onClick={() => onRemoveDraft(i)}
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="Review summary…"
        className="min-h-20 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm text-zinc-200 outline-none focus:border-violet-500"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-zinc-700 text-xs">
          {VERDICTS.map((v) => (
            <button
              key={v.value}
              onClick={() => setVerdict(v.value)}
              className={`px-3 py-1.5 font-medium ${
                verdict === v.value ? v.active : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button
          disabled={submitting}
          onClick={submit}
          className="ml-auto rounded-md bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit review'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400">
          Submission failed: {error} — your comments and verdict are still here.
        </p>
      )}
    </footer>
  );
}
