# syntax=docker/dockerfile:1

# --- web: build the SPA into web/dist ------------------------------------
FROM node:22-alpine AS web
WORKDIR /src/web
# corepack pins pnpm to match the committed lockfile (lockfileVersion 9.0)
RUN corepack enable && corepack prepare pnpm@10.29.3 --activate
# install deps first so the layer caches when only sources change
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm run build

# --- api: build a static Go binary ---------------------------------------
FROM golang:1.26.1-alpine AS api
WORKDIR /src
# module first for layer caching (no separate go.sum: stdlib-only deps)
COPY go.mod ./
RUN go mod download
COPY cmd/ ./cmd/
COPY internal/ ./internal/
# CGO off → fully static, runs in distroless/static
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags='-s -w' -o /out/vibecheck ./cmd/api

# --- final: binary + web/dist on a minimal non-root image ----------------
FROM gcr.io/distroless/static:nonroot
# WORKDIR + relative COPY make VIBECHECK_WEB_DIST=web/dist resolve
WORKDIR /app
COPY --from=api /out/vibecheck ./vibecheck
COPY --from=web /src/web/dist ./web/dist
EXPOSE 8080
ENV VIBECHECK_ADDR=:8080
ENV VIBECHECK_WEB_DIST=web/dist
# distroless nonroot = uid 65532
USER nonroot:nonroot
ENTRYPOINT ["/app/vibecheck"]
