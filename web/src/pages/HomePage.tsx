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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-100">
          vibe<span className="text-violet-400">check</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">PR review for the AI-coding era.</p>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : !me ? (
        <a
          className="rounded-md bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
          href="/api/auth/login"
        >
          Sign in with GitHub
        </a>
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            Signed in as <strong className="text-zinc-200">{me.login}</strong>
          </p>
          <form onSubmit={openPr} className="flex w-full gap-2">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="owner/repo#123 or PR URL"
              autoFocus
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-violet-500"
            />
            <button
              type="submit"
              className="rounded-md bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Review
            </button>
          </form>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            className="text-xs text-zinc-500 underline hover:text-zinc-300"
            onClick={() => api.logout().then(() => setMe(null))}
          >
            Sign out
          </button>
        </>
      )}
    </div>
  );
}
