// mksession is a development helper: it prints a vibecheck_session cookie
// value for a given login, encrypted with VIBECHECK_SESSION_KEY. With an
// empty access token the API serves public GitHub data unauthenticated.
//
//	VIBECHECK_SESSION_KEY=... go run ./cmd/mksession -login you
package main

import (
	"encoding/hex"
	"flag"
	"fmt"
	"net/http/httptest"
	"os"

	"github.com/0xdeafcafe/vibecheck/internal/session"
)

func main() {
	login := flag.String("login", "dev", "login name to embed in the session")
	flag.Parse()

	key, err := hex.DecodeString(os.Getenv("VIBECHECK_SESSION_KEY"))
	if err != nil || len(key) != 32 {
		fmt.Fprintln(os.Stderr, "VIBECHECK_SESSION_KEY must be 64 hex chars")
		os.Exit(1)
	}
	codec, err := session.NewCodec(key)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	rec := httptest.NewRecorder()
	if err := codec.Write(rec, &session.Session{Login: *login}, false); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	for _, c := range rec.Result().Cookies() {
		fmt.Printf("%s=%s\n", c.Name, c.Value)
	}
}
