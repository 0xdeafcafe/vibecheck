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
      <footer className="review-form">
        <p>
          ✓ Review submitted — it’s now on{' '}
          <a href={`https://github.com/${owner}/${repo}/pull/${number}`}>GitHub</a>.
        </p>
      </footer>
    );
  }

  return (
    <footer className="review-form">
      <h2>Your review</h2>
      {drafts.length > 0 && (
        <ul className="draft-list">
          {drafts.map((d, i) => (
            <li key={i}>
              <code>
                {d.path}:{d.line}
              </code>{' '}
              {d.body}
              <button className="link-button" onClick={() => onRemoveDraft(i)}>
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
      />
      <div className="verdict-row">
        <label>
          <input
            type="radio"
            checked={verdict === 'APPROVE'}
            onChange={() => setVerdict('APPROVE')}
          />
          Approve
        </label>
        <label>
          <input
            type="radio"
            checked={verdict === 'REQUEST_CHANGES'}
            onChange={() => setVerdict('REQUEST_CHANGES')}
          />
          Request changes
        </label>
        <label>
          <input
            type="radio"
            checked={verdict === 'COMMENT'}
            onChange={() => setVerdict('COMMENT')}
          />
          Comment
        </label>
        <button disabled={submitting} onClick={submit}>
          {submitting ? 'Submitting…' : 'Submit review'}
        </button>
      </div>
      {error && <p className="error">Submission failed: {error} — your comments and verdict are still here.</p>}
    </footer>
  );
}
