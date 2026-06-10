package main

import (
	"encoding/hex"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/0xdeafcafe/vibecheck/internal/ghapp"
	"github.com/0xdeafcafe/vibecheck/internal/httpapi"
	"github.com/0xdeafcafe/vibecheck/internal/session"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))

	key, err := hex.DecodeString(mustEnv(log, "VIBECHECK_SESSION_KEY"))
	if err != nil || len(key) != 32 {
		log.Error("VIBECHECK_SESSION_KEY must be 64 hex chars (32 bytes)")
		os.Exit(1)
	}
	codec, err := session.NewCodec(key)
	if err != nil {
		log.Error("session codec", "err", err)
		os.Exit(1)
	}

	addr := envOr("VIBECHECK_ADDR", ":8080")
	baseURL := envOr("VIBECHECK_BASE_URL", "http://localhost:8080")

	srv := &httpapi.Server{
		OAuth: &ghapp.OAuth{
			ClientID:     mustEnv(log, "VIBECHECK_GITHUB_CLIENT_ID"),
			ClientSecret: mustEnv(log, "VIBECHECK_GITHUB_CLIENT_SECRET"),
		},
		Sessions:    codec,
		AppSlug:     os.Getenv("VIBECHECK_APP_SLUG"),
		BaseURL:     baseURL,
		SecureCooky: strings.HasPrefix(baseURL, "https://"),
		Log:         log,
	}

	mux := http.NewServeMux()
	mux.Handle("/api/", srv.Routes())
	if dist := envOr("VIBECHECK_WEB_DIST", "web/dist"); dirExists(dist) {
		mux.Handle("/", spaHandler(dist))
	}

	log.Info("listening", "addr", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Error("serve", "err", err)
		os.Exit(1)
	}
}

// spaHandler serves static files, falling back to index.html for
// client-side routes.
func spaHandler(dist string) http.Handler {
	fs := http.FileServer(http.Dir(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := dist + r.URL.Path
		if r.URL.Path != "/" {
			if _, err := os.Stat(path); err == nil {
				fs.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, dist+"/index.html")
	})
}

func dirExists(p string) bool {
	info, err := os.Stat(p)
	return err == nil && info.IsDir()
}

func mustEnv(log *slog.Logger, name string) string {
	v := os.Getenv(name)
	if v == "" {
		log.Error("missing required environment variable", "name", name)
		os.Exit(1)
	}
	return v
}

func envOr(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
