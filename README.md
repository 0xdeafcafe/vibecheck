# vibecheck

A GitHub PR review client for the AI-coding era. Huge diffs, generated
artifacts, intent docs (ADRs, `.feature` specs), and noisy bot comments make
GitHub's review UX a poor fit — vibecheck stratifies the diff so you read
intent first, logic against it, and generated files collapsed. Reviews are
pushed back to GitHub, which stays the canonical record.

See `docs/adr/` for architecture decisions and `specs/` for behavioural
contracts.

## Architecture

- **API**: Go, stateless passthrough to the GitHub API. No database. Holds
  the GitHub App private key and session encryption key only.
- **Web**: React + Vite SPA in `web/`.
- **Auth**: GitHub App. Users sign in via the app's OAuth flow; orgs install
  the app to grant scoped access (Pull requests: read/write, Contents: read,
  Metadata: read).

## Running locally

1. Create a GitHub App with the permissions above, a callback URL of
   `http://localhost:8080/api/auth/callback`, and "Request user
   authorization (OAuth) during installation" enabled.
2. Export configuration:

   ```sh
   export VIBECHECK_GITHUB_CLIENT_ID=...
   export VIBECHECK_GITHUB_CLIENT_SECRET=...
   export VIBECHECK_SESSION_KEY=$(openssl rand -hex 32)
   export VIBECHECK_APP_SLUG=your-app-slug
   ```

3. `make api` (serves on :8080) and `make dev-web` (Vite dev server on
   :5173, proxying `/api` to :8080).
