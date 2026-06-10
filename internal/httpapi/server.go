// Package httpapi wires vibecheck's HTTP surface: the GitHub App OAuth
// flow, and stateless passthrough endpoints for reading PRs and
// submitting reviews. No data is persisted server-side.
package httpapi

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/0xdeafcafe/vibecheck/internal/classify"
	"github.com/0xdeafcafe/vibecheck/internal/ghapp"
	"github.com/0xdeafcafe/vibecheck/internal/session"
)

type Server struct {
	OAuth       *ghapp.OAuth
	Sessions    *session.Codec
	AppSlug     string // for the "install the app" link
	BaseURL     string // e.g. http://localhost:8080
	SecureCooky bool
	Log         *slog.Logger
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/login", s.handleLogin)
	mux.HandleFunc("GET /api/auth/callback", s.handleCallback)
	mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	mux.HandleFunc("GET /api/me", s.withSession(s.handleMe))
	mux.HandleFunc("GET /api/repos/{owner}/{repo}/pulls/{number}", s.withSession(s.handlePull))
	mux.HandleFunc("POST /api/repos/{owner}/{repo}/pulls/{number}/review", s.withSession(s.handleSubmitReview))
	return mux
}

// --- auth ---

const stateCookie = "vibecheck_oauth_state"

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		s.serverError(w, err)
		return
	}
	state := base64.RawURLEncoding.EncodeToString(buf)
	http.SetCookie(w, &http.Cookie{
		Name: stateCookie, Value: state, Path: "/api/auth",
		HttpOnly: true, Secure: s.SecureCooky, SameSite: http.SameSiteLaxMode, MaxAge: 600,
	})
	http.Redirect(w, r, s.OAuth.AuthorizeURL(s.BaseURL+"/api/auth/callback", state), http.StatusFound)
}

func (s *Server) handleCallback(w http.ResponseWriter, r *http.Request) {
	stateCk, err := r.Cookie(stateCookie)
	if err != nil || stateCk.Value == "" || r.URL.Query().Get("state") != stateCk.Value {
		http.Error(w, "oauth state mismatch", http.StatusBadRequest)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: "", Path: "/api/auth", MaxAge: -1})

	tokens, err := s.OAuth.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		s.serverError(w, err)
		return
	}
	viewer, err := (&ghapp.Client{Token: tokens.AccessToken}).Viewer(r.Context())
	if err != nil {
		s.serverError(w, err)
		return
	}
	sess := &session.Session{
		AccessToken:           tokens.AccessToken,
		AccessTokenExpiresAt:  tokens.AccessTokenExpiresAt,
		RefreshToken:          tokens.RefreshToken,
		RefreshTokenExpiresAt: tokens.RefreshTokenExpiresAt,
		Login:                 viewer.Login,
		AvatarURL:             viewer.AvatarURL,
	}
	if err := s.Sessions.Write(w, sess, s.SecureCooky); err != nil {
		s.serverError(w, err)
		return
	}
	http.Redirect(w, r, "/", http.StatusFound)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	session.Clear(w)
	w.WriteHeader(http.StatusNoContent)
}

// withSession authenticates the request, transparently refreshing the
// GitHub token when expired (spec: "Session token expires mid-review").
func (s *Server) withSession(next func(http.ResponseWriter, *http.Request, *session.Session)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sess, err := s.Sessions.Read(r)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, "not signed in")
			return
		}
		if !sess.AccessTokenExpiresAt.IsZero() && time.Now().After(sess.AccessTokenExpiresAt) {
			if sess.RefreshToken == "" || (!sess.RefreshTokenExpiresAt.IsZero() && time.Now().After(sess.RefreshTokenExpiresAt)) {
				session.Clear(w)
				writeJSONError(w, http.StatusUnauthorized, "session expired")
				return
			}
			tokens, err := s.OAuth.Refresh(r.Context(), sess.RefreshToken)
			if err != nil {
				session.Clear(w)
				writeJSONError(w, http.StatusUnauthorized, "session expired")
				return
			}
			sess.AccessToken = tokens.AccessToken
			sess.AccessTokenExpiresAt = tokens.AccessTokenExpiresAt
			sess.RefreshToken = tokens.RefreshToken
			sess.RefreshTokenExpiresAt = tokens.RefreshTokenExpiresAt
			if err := s.Sessions.Write(w, sess, s.SecureCooky); err != nil {
				s.serverError(w, err)
				return
			}
		}
		next(w, r, sess)
	}
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, sess *session.Session) {
	writeJSON(w, http.StatusOK, map[string]string{
		"login":     sess.Login,
		"avatarUrl": sess.AvatarURL,
	})
}

// --- pull requests ---

type classifiedFile struct {
	Filename  string           `json:"filename"`
	Status    string           `json:"status"`
	Additions int              `json:"additions"`
	Deletions int              `json:"deletions"`
	Patch     string           `json:"patch,omitempty"`
	Stratum   classify.Stratum `json:"stratum"`
}

type tally struct {
	Human int `json:"human"`
	AI    int `json:"ai"`
}

type reviewerVerdict struct {
	Login string `json:"login"`
	Bot   bool   `json:"bot"`
	State string `json:"state"`
}

// existingComment is an inline review comment already on the PR,
// anchored so the UI can render it under the matching diff line.
type existingComment struct {
	ID        int64  `json:"id"`
	InReplyTo int64  `json:"inReplyTo,omitempty"`
	Path      string `json:"path"`
	Line      int    `json:"line,omitempty"`
	Side      string `json:"side,omitempty"`
	Body      string `json:"body"`
	Login     string `json:"login"`
	Bot       bool   `json:"bot"`
	CreatedAt string `json:"createdAt"`
}

// reviewSummary powers the PR overview header: how much existing review
// activity there is, and how much of it is bot noise.
type reviewSummary struct {
	ReviewComments tally             `json:"reviewComments"`
	IssueComments  tally             `json:"issueComments"`
	Verdicts       []reviewerVerdict `json:"verdicts"`
	Comments       []existingComment `json:"comments"`
}

type pullResponse struct {
	PR      *ghapp.PullRequest `json:"pr"`
	Files   []classifiedFile   `json:"files"`
	Page    int                `json:"page"`
	HasMore bool               `json:"hasMore"`
	Summary *reviewSummary     `json:"summary,omitempty"`
}

func (s *Server) handlePull(w http.ResponseWriter, r *http.Request, sess *session.Session) {
	owner, repo, number, ok := pullParams(w, r)
	if !ok {
		return
	}
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	gh := &ghapp.Client{Token: sess.AccessToken}

	pr, err := gh.PullRequest(r.Context(), owner, repo, number)
	if err != nil {
		s.githubError(w, err)
		return
	}
	files, hasMore, err := gh.PullFiles(r.Context(), owner, repo, number, page)
	if err != nil {
		s.githubError(w, err)
		return
	}
	out := pullResponse{PR: pr, Page: page, HasMore: hasMore, Files: make([]classifiedFile, 0, len(files))}
	// The summary only changes per PR, not per file page — fetch it once.
	if page == 1 {
		summary, err := s.buildSummary(r, gh, owner, repo, number)
		if err != nil {
			s.githubError(w, err)
			return
		}
		out.Summary = summary
	}
	for _, f := range files {
		out.Files = append(out.Files, classifiedFile{
			Filename:  f.Filename,
			Status:    f.Status,
			Additions: f.Additions,
			Deletions: f.Deletions,
			Patch:     f.Patch,
			Stratum:   classify.File(f.Filename, false),
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) buildSummary(r *http.Request, gh *ghapp.Client, owner, repo string, number int) (*reviewSummary, error) {
	sum := &reviewSummary{Verdicts: []reviewerVerdict{}, Comments: []existingComment{}}

	reviewComments, err := gh.PullComments(r.Context(), owner, repo, number)
	if err != nil {
		return nil, err
	}
	for _, c := range reviewComments {
		sum.ReviewComments.bump(c.User)
		sum.Comments = append(sum.Comments, existingComment{
			ID:        c.ID,
			InReplyTo: c.InReplyTo,
			Path:      c.Path,
			Line:      c.Line,
			Side:      c.Side,
			Body:      c.Body,
			Login:     c.User.Login,
			Bot:       c.User.IsBot(),
			CreatedAt: c.CreatedAt,
		})
	}

	issueComments, err := gh.IssueCommentAuthors(r.Context(), owner, repo, number)
	if err != nil {
		return nil, err
	}
	for _, c := range issueComments {
		sum.IssueComments.bump(c.User)
	}

	reviews, err := gh.Reviews(r.Context(), owner, repo, number)
	if err != nil {
		return nil, err
	}
	// Latest verdict per reviewer wins; plain COMMENTED reviews don't
	// override an earlier approval/rejection.
	latest := map[string]*reviewerVerdict{}
	order := []string{}
	for _, rv := range reviews {
		switch rv.State {
		case "APPROVED", "CHANGES_REQUESTED", "DISMISSED":
			if v, ok := latest[rv.User.Login]; ok {
				v.State = rv.State
			} else {
				latest[rv.User.Login] = &reviewerVerdict{Login: rv.User.Login, Bot: rv.User.IsBot(), State: rv.State}
				order = append(order, rv.User.Login)
			}
		}
	}
	for _, login := range order {
		if v := latest[login]; v.State != "DISMISSED" {
			sum.Verdicts = append(sum.Verdicts, *v)
		}
	}
	return sum, nil
}

func (t *tally) bump(u ghapp.User) {
	if u.IsBot() {
		t.AI++
	} else {
		t.Human++
	}
}

type submitReviewRequest struct {
	Event    string                `json:"event"` // APPROVE, REQUEST_CHANGES, COMMENT
	Body     string                `json:"body"`
	CommitID string                `json:"commitId"`
	Comments []ghapp.ReviewComment `json:"comments"`
}

func (s *Server) handleSubmitReview(w http.ResponseWriter, r *http.Request, sess *session.Session) {
	owner, repo, number, ok := pullParams(w, r)
	if !ok {
		return
	}
	var req submitReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	switch req.Event {
	case "APPROVE", "REQUEST_CHANGES", "COMMENT":
	default:
		writeJSONError(w, http.StatusBadRequest, "event must be APPROVE, REQUEST_CHANGES or COMMENT")
		return
	}
	gh := &ghapp.Client{Token: sess.AccessToken}
	err := gh.SubmitReview(r.Context(), owner, repo, number, &ghapp.ReviewRequest{
		CommitID: req.CommitID,
		Body:     req.Body,
		Event:    req.Event,
		Comments: req.Comments,
	})
	if err != nil {
		s.githubError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- helpers ---

func pullParams(w http.ResponseWriter, r *http.Request) (owner, repo string, number int, ok bool) {
	owner, repo = r.PathValue("owner"), r.PathValue("repo")
	number, err := strconv.Atoi(r.PathValue("number"))
	if err != nil || number < 1 {
		writeJSONError(w, http.StatusBadRequest, "invalid pull request number")
		return "", "", 0, false
	}
	return owner, repo, number, true
}

// githubError passes GitHub's status through. A 404 may mean the app
// isn't installed on the org (spec: "Org has not installed the GitHub
// App") — include the install link so the UI can offer it.
func (s *Server) githubError(w http.ResponseWriter, err error) {
	var apiErr *ghapp.APIError
	if errors.As(err, &apiErr) {
		body := map[string]string{"error": apiErr.Message}
		if apiErr.StatusCode == http.StatusNotFound && s.AppSlug != "" {
			body["hint"] = "If this repository exists, the vibecheck GitHub App may not be installed on its org."
			body["installUrl"] = fmt.Sprintf("https://github.com/apps/%s/installations/new", s.AppSlug)
		}
		writeJSON(w, apiErr.StatusCode, body)
		return
	}
	s.serverError(w, err)
}

func (s *Server) serverError(w http.ResponseWriter, err error) {
	if s.Log != nil {
		s.Log.Error("internal error", "err", err)
	}
	writeJSONError(w, http.StatusInternalServerError, "internal error")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeJSONError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
