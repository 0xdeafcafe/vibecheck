import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Me, ApiError } from '../api';

// Accepts "owner/repo#123" or a full github.com PR URL.
function parsePrRef(input: string): { owner: string; repo: string; number: number } | null {
  const url = input.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (url) return { owner: url[1], repo: url[2], number: Number(url[3]) };
  const short = input.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/);
  if (short) return { owner: short[1], repo: short[2], number: Number(short[3]) };
  return null;
}

export function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((err: unknown) => {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
      })
      .finally(() => setLoading(false));
  }, []);

  function openPr(e: FormEvent) {
    e.preventDefault();
    const parsed = parsePrRef(ref.trim());
    if (!parsed) {
      setError('Enter a PR as owner/repo#123 or paste a GitHub PR URL.');
      return;
    }
    navigate(`/r/${parsed.owner}/${parsed.repo}/pull/${parsed.number}`);
  }

  if (loading) return <div className="page-center">Loading…</div>;

  if (!me) {
    return (
      <div className="page-center">
        <h1>vibecheck</h1>
        <p>PR review for the AI-coding era.</p>
        <a className="button" href="/api/auth/login">
          Sign in with GitHub
        </a>
      </div>
    );
  }

  return (
    <div className="page-center">
      <h1>vibecheck</h1>
      <p>
        Signed in as <strong>{me.login}</strong>
      </p>
      <form onSubmit={openPr} className="pr-form">
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="owner/repo#123 or PR URL"
          autoFocus
        />
        <button type="submit">Review</button>
      </form>
      {error && <p className="error">{error}</p>}
      <button
        className="link-button"
        onClick={() => api.logout().then(() => setMe(null))}
      >
        Sign out
      </button>
    </div>
  );
}
