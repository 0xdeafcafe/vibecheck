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
  { value: 'APPROVE', label: 'Approve', active: 'bg-add text-white' },
  { value: 'REQUEST_CHANGES', label: 'Request changes', active: 'bg-del text-white' },
  { value: 'COMMENT', label: 'Comment', active: 'bg-st-core text-white' },
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
      <footer className="mt-8 rounded-xl border border-add/30 bg-add-soft p-4 text-sm text-add">
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
    <footer className="mt-8 rounded-xl border border-line bg-surface p-4 pb-5">
      <h2 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted">
        Your review {drafts.length > 0 && `· ${drafts.length} pending comment(s)`}
      </h2>
      {drafts.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {drafts.map((d, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs">
              <code className="shrink-0 font-mono text-accent">
                {d.path}:{d.line}
              </code>
              <span className="text-ink">{d.body}</span>
              <button
                className="ml-auto shrink-0 text-muted underline hover:text-ink"
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
        className="min-h-20 w-full rounded-md border border-line bg-canvas p-2 text-sm text-ink outline-none focus:border-accent"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-line text-xs">
          {VERDICTS.map((v) => (
            <button
              key={v.value}
              onClick={() => setVerdict(v.value)}
              className={`px-3 py-1.5 font-medium ${
                verdict === v.value ? v.active : 'text-muted hover:bg-raised'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <button
          disabled={submitting}
          onClick={submit}
          className="ml-auto rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit review'}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-del">
          Submission failed: {error} — your comments and verdict are still here.
        </p>
      )}
    </footer>
  );
}
