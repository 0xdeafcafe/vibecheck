# Local secrets (gitignored) — VIBECHECK_GITHUB_CLIENT_ID etc.
-include .env
export

.PHONY: dev api web build run test vet check session-key clean

# --- development ---------------------------------------------------------

## dev: run the Go API (:8080) and Vite dev server (:5173) together
dev: check-env web/node_modules
	@trap 'kill 0' INT TERM; \
	go run ./cmd/api & \
	(cd web && pnpm run dev) & \
	wait

## api: run only the Go API on :8080
api: check-env
	go run ./cmd/api

## web: run only the Vite dev server on :5173 (proxies /api to :8080)
web: web/node_modules
	cd web && pnpm run dev

web/node_modules: web/package.json web/pnpm-lock.yaml
	cd web && pnpm install
	@touch web/node_modules

# --- production ----------------------------------------------------------

## build: build the SPA and the API binary (binary serves web/dist itself)
build: web/node_modules
	cd web && pnpm run build
	go build -o bin/vibecheck ./cmd/api

## run: run the production build (API + built SPA on :8080)
run: build check-env
	./bin/vibecheck

# --- quality -------------------------------------------------------------

## test: run Go tests and the frontend typecheck/build
test:
	go test ./...
	cd web && pnpm exec tsc -b --force

vet:
	go vet ./...

check: test vet

# --- helpers -------------------------------------------------------------

## session-key: generate a value for VIBECHECK_SESSION_KEY
session-key:
	@openssl rand -hex 32

check-env:
ifndef VIBECHECK_GITHUB_CLIENT_ID
	$(error VIBECHECK_GITHUB_CLIENT_ID is not set — see README.md "Running locally")
endif
ifndef VIBECHECK_GITHUB_CLIENT_SECRET
	$(error VIBECHECK_GITHUB_CLIENT_SECRET is not set — see README.md "Running locally")
endif
ifndef VIBECHECK_SESSION_KEY
	$(error VIBECHECK_SESSION_KEY is not set — run `make session-key` to generate one)
endif

clean:
	rm -rf bin web/dist web/tsconfig.tsbuildinfo

## help: list targets
help:
	@grep -E '^## ' Makefile | sed 's/^## /  /'
