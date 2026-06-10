export type Stratum = 'intent' | 'core' | 'tests' | 'generated';

export interface Me {
  login: string;
  avatarUrl: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  additions: number;
  deletions: number;
  commits: number;
  user: { login: string; avatar_url: string };
  head: { sha: string; ref: string };
  base: { ref: string };
}

export interface ClassifiedFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  stratum: Stratum;
}

export interface Tally {
  human: number;
  ai: number;
}

export interface ReviewerVerdict {
  login: string;
  bot: boolean;
  state: 'APPROVED' | 'CHANGES_REQUESTED';
}

export interface ReviewSummary {
  reviewComments: Tally;
  issueComments: Tally;
  verdicts: ReviewerVerdict[];
}

export interface PullResponse {
  pr: PullRequest;
  files: ClassifiedFile[];
  page: number;
  hasMore: boolean;
  summary?: ReviewSummary;
}

export interface DraftComment {
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
}

export class ApiError extends Error {
  status: number;
  installUrl?: string;
  constructor(status: number, message: string, installUrl?: string) {
    super(message);
    this.status = status;
    this.installUrl = installUrl;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, init);
  if (!resp.ok) {
    let message = resp.statusText;
    let installUrl: string | undefined;
    try {
      const body = await resp.json();
      message = body.hint ?? body.error ?? message;
      installUrl = body.installUrl;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new ApiError(resp.status, message, installUrl);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

export const api = {
  me: () => request<Me>('/api/me'),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  pull: (owner: string, repo: string, number: number, page = 1) =>
    request<PullResponse>(`/api/repos/${owner}/${repo}/pulls/${number}?page=${page}`),
  submitReview: (
    owner: string,
    repo: string,
    number: number,
    review: { event: string; body: string; commitId: string; comments: DraftComment[] },
  ) =>
    request<void>(`/api/repos/${owner}/${repo}/pulls/${number}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(review),
    }),
};
