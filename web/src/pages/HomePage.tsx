import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Me, ApiError } from '../api';
import { ThemeToggle } from '../components/ThemeToggle';

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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>

      <div>
        <h1 className="font-display text-6xl text-ink">
          vibe<span className="text-accent">check</span>
        </h1>
        <p className="mt-3 text-sm text-muted">
          PR review for the <span className="font-display italic">AI-coding era</span>.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !me ? (
        <a
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
          href="/api/auth/login"
        >
          Sign in with GitHub
        </a>
      ) : (
        <>
          <p className="text-sm text-muted">
            Signed in as <strong className="text-ink">{me.login}</strong>
          </p>
          <form onSubmit={openPr} className="flex w-full gap-2">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="owner/repo#123 or PR URL"
              autoFocus
              className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
            >
              Review
            </button>
          </form>
          {error && <p className="text-xs text-del">{error}</p>}
          <button
            className="text-xs text-muted underline hover:text-ink"
            onClick={() => api.logout().then(() => setMe(null))}
          >
            Sign out
          </button>
        </>
      )}
    </div>
  );
}
