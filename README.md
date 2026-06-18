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
   export VIBECHECK_SESSION_KEY=$(make session-key)
   export VIBECHECK_APP_SLUG=your-app-slug
   ```

3. `make dev` — runs the Go API on :8080 and the Vite dev server on :5173
   (proxying `/api`) together. Open http://localhost:5173.

For a production-style run, `make run` builds the SPA and the API binary
and serves both from :8080. `make help` lists all targets.

## Deployment

One Go binary serves both the JSON API (`/api`) and the built SPA
(`web/dist`) on a single port, so deployment is one container. TLS is
terminated in front of it (fly.io's edge, or Caddy on a VPS).

### Configuration

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `VIBECHECK_GITHUB_CLIENT_ID` | yes | — | GitHub App OAuth client id |
| `VIBECHECK_GITHUB_CLIENT_SECRET` | yes | — | GitHub App OAuth client secret |
| `VIBECHECK_SESSION_KEY` | yes | — | 64 hex chars (32 bytes) — `make session-key` |
| `VIBECHECK_BASE_URL` | prod | `http://localhost:8080` | set `https://vibecheck.forbes.red`; an `https://` value also flips the session cookie to `Secure` |
| `VIBECHECK_APP_SLUG` | no | — | GitHub App slug (install link) |
| `VIBECHECK_ADDR` | no | `:8080` | listen address |
| `VIBECHECK_WEB_DIST` | no | `web/dist` | path to the built SPA (set in the image) |

Secrets are supplied by the deploy platform (`fly secrets` / a gitignored
`deploy/.env`) and are **never committed**. `.env` and `deploy/.env` are
gitignored.

Generate the session key once and reuse it (rotating it invalidates all
sessions):

```sh
make session-key   # 64 hex chars
```

### GitHub App

In the GitHub App settings, add the production callback URL alongside the
local one:

- Callback URL: `https://vibecheck.forbes.red/api/auth/callback`

and set `VIBECHECK_BASE_URL=https://vibecheck.forbes.red` so the OAuth
redirect matches.

### Option A — fly.io

Config lives in `deploy/fly.toml`. From the repo root:

```sh
fly launch --no-deploy --copy-config --config deploy/fly.toml   # first time only
fly certs add vibecheck.forbes.red                              # then point DNS as fly prints
fly secrets set \
  VIBECHECK_GITHUB_CLIENT_ID=… \
  VIBECHECK_GITHUB_CLIENT_SECRET=… \
  VIBECHECK_SESSION_KEY=$(make session-key) \
  VIBECHECK_APP_SLUG=…
fly deploy --config deploy/fly.toml
```

`VIBECHECK_BASE_URL` is non-secret and already set in `[env]`. fly's
`force_https` handles TLS redirects; `fly certs add` provisions the cert
once DNS resolves to the app.

### Option B — VPS with Caddy

`deploy/docker-compose.yml` builds the image and runs it behind
`deploy/Caddyfile`, which fetches and renews TLS automatically. Point
`vibecheck.forbes.red` DNS (A/AAAA) at the host and open ports 80 + 443,
then:

```sh
cd deploy
cat > .env <<'EOF'                # gitignored — your real secrets
VIBECHECK_GITHUB_CLIENT_ID=…
VIBECHECK_GITHUB_CLIENT_SECRET=…
VIBECHECK_SESSION_KEY=…           # output of `make session-key`
VIBECHECK_APP_SLUG=…              # optional
EOF
docker compose up -d --build
```

`VIBECHECK_BASE_URL` is set in the compose file. Build the image once with
`docker build -t vibecheck:deploy .` from the repo root if you want to test
it standalone.
