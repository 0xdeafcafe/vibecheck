export type Stratum = 'intent' | 'core' | 'tests' | 'docs' | 'generated';

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
  previousFilename?: string; // set when status === 'renamed'
  additions: number;
  deletions: number;
  patch?: string;
  stratum: Stratum;
  // Server-side diff-shape heuristics: a file whose entire patch is one
  // repeated token swap (e.g. an import rename) is "mechanical", and
  // `signature` is the shared "old → new" edit used to cluster it with
  // its siblings.
  mechanical?: boolean;
  signature?: string;
  // Ownership from CODEOWNERS (the reviewer-fit signal): who owns the
  // file, whether the signed-in viewer owns it, and whether it has no
  // owner at all (an accountability gap).
  owners?: string[];
  ownedByViewer?: boolean;
  unowned?: boolean;
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

export interface ExistingComment {
  id: number;
  inReplyTo?: number;
  path: string;
  line?: number;
  side?: string;
  body: string;
  login: string;
  bot: boolean;
  createdAt: string;
}

export interface ReviewSummary {
  reviewComments: Tally;
  issueComments: Tally;
  verdicts: ReviewerVerdict[];
  comments: ExistingComment[];
}

export interface PullResponse {
  pr: PullRequest;
  files: ClassifiedFile[];
  page: number;
  hasMore: boolean;
  summary?: ReviewSummary;
  // Provenance: the PR carries AI-authored commits (verify, don't skim).
  aiAuthored?: boolean;
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
