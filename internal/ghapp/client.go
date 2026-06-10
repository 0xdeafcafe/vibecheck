package ghapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const apiBase = "https://api.github.com"

// Client is a minimal GitHub REST client bound to a user access token.
type Client struct {
	Token string
	HTTP  *http.Client
}

// APIError carries GitHub's status code so handlers can pass it through.
type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("github api: %d: %s", e.StatusCode, e.Message)
}

type User struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	Type      string `json:"type"` // "User", "Bot", "Organization"
}

// IsBot reports whether the account is an app/bot (e.g. AI reviewers).
func (u User) IsBot() bool {
	return u.Type == "Bot" || strings.HasSuffix(u.Login, "[bot]")
}

type PullRequest struct {
	Number    int    `json:"number"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	State     string `json:"state"`
	HTMLURL   string `json:"html_url"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Commits   int    `json:"commits"`
	User      User   `json:"user"`
	Head      struct {
		SHA string `json:"sha"`
		Ref string `json:"ref"`
	} `json:"head"`
	Base struct {
		Ref string `json:"ref"`
	} `json:"base"`
}

type PullFile struct {
	Filename  string `json:"filename"`
	Status    string `json:"status"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch"`
}

// Review is a submitted PR review (verdict-level).
type Review struct {
	User  User   `json:"user"`
	State string `json:"state"` // APPROVED, CHANGES_REQUESTED, COMMENTED, ...
}

// CommentAuthor is the author of an existing review or issue comment;
// vibecheck only needs the author to tally human vs bot noise.
type CommentAuthor struct {
	User User `json:"user"`
}

// PullComment is an existing inline review comment, with enough context
// to anchor it to a diff line in the UI.
type PullComment struct {
	ID        int64  `json:"id"`
	InReplyTo int64  `json:"in_reply_to_id"`
	Path      string `json:"path"`
	Line      int    `json:"line"` // 0 when the comment is on an outdated diff
	Side      string `json:"side"`
	Body      string `json:"body"`
	User      User   `json:"user"`
	CreatedAt string `json:"created_at"`
}

type ReviewComment struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Side string `json:"side,omitempty"`
	Body string `json:"body"`
}

type ReviewRequest struct {
	CommitID string          `json:"commit_id,omitempty"`
	Body     string          `json:"body,omitempty"`
	Event    string          `json:"event"` // APPROVE, REQUEST_CHANGES, COMMENT
	Comments []ReviewComment `json:"comments,omitempty"`
}

func (c *Client) Viewer(ctx context.Context) (*User, error) {
	var u User
	if err := c.get(ctx, "/user", &u); err != nil {
		return nil, err
	}
	return &u, nil
}

func (c *Client) PullRequest(ctx context.Context, owner, repo string, number int) (*PullRequest, error) {
	var pr PullRequest
	path := fmt.Sprintf("/repos/%s/%s/pulls/%d", owner, repo, number)
	if err := c.get(ctx, path, &pr); err != nil {
		return nil, err
	}
	return &pr, nil
}

// PullFiles fetches one page of changed files (GitHub caps per_page at 100).
// Returns the files and whether more pages remain.
func (c *Client) PullFiles(ctx context.Context, owner, repo string, number, page int) ([]PullFile, bool, error) {
	var files []PullFile
	path := fmt.Sprintf("/repos/%s/%s/pulls/%d/files?per_page=100&page=%d", owner, repo, number, page)
	hasNext, err := c.getPaged(ctx, path, &files)
	if err != nil {
		return nil, false, err
	}
	return files, hasNext, nil
}

// Reviews fetches all submitted reviews on the PR.
func (c *Client) Reviews(ctx context.Context, owner, repo string, number int) ([]Review, error) {
	var all []Review
	for page := 1; ; page++ {
		var batch []Review
		path := fmt.Sprintf("/repos/%s/%s/pulls/%d/reviews?per_page=100&page=%d", owner, repo, number, page)
		hasNext, err := c.getPaged(ctx, path, &batch)
		if err != nil {
			return nil, err
		}
		all = append(all, batch...)
		if !hasNext {
			return all, nil
		}
	}
}

// PullComments fetches all existing inline review comments with bodies.
func (c *Client) PullComments(ctx context.Context, owner, repo string, number int) ([]PullComment, error) {
	var all []PullComment
	for page := 1; ; page++ {
		var batch []PullComment
		path := fmt.Sprintf("/repos/%s/%s/pulls/%d/comments?per_page=100&page=%d", owner, repo, number, page)
		hasNext, err := c.getPaged(ctx, path, &batch)
		if err != nil {
			return nil, err
		}
		all = append(all, batch...)
		if !hasNext {
			return all, nil
		}
	}
}

// IssueCommentAuthors fetches the authors of all PR-thread comments.
func (c *Client) IssueCommentAuthors(ctx context.Context, owner, repo string, number int) ([]CommentAuthor, error) {
	return c.commentAuthors(ctx, fmt.Sprintf("/repos/%s/%s/issues/%d/comments", owner, repo, number))
}

func (c *Client) commentAuthors(ctx context.Context, basePath string) ([]CommentAuthor, error) {
	var all []CommentAuthor
	for page := 1; ; page++ {
		var batch []CommentAuthor
		sep := "?"
		if strings.Contains(basePath, "?") {
			sep = "&"
		}
		path := fmt.Sprintf("%s%sper_page=100&page=%d", basePath, sep, page)
		hasNext, err := c.getPaged(ctx, path, &batch)
		if err != nil {
			return nil, err
		}
		all = append(all, batch...)
		if !hasNext {
			return all, nil
		}
	}
}

func (c *Client) SubmitReview(ctx context.Context, owner, repo string, number int, review *ReviewRequest) error {
	path := fmt.Sprintf("/repos/%s/%s/pulls/%d/reviews", owner, repo, number)
	return c.post(ctx, path, review, nil)
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	_, err := c.do(ctx, http.MethodGet, path, nil, out)
	return err
}

func (c *Client) getPaged(ctx context.Context, path string, out any) (bool, error) {
	resp, err := c.do(ctx, http.MethodGet, path, nil, out)
	if err != nil {
		return false, err
	}
	return bytes.Contains([]byte(resp.Header.Get("Link")), []byte(`rel="next"`)), nil
}

func (c *Client) post(ctx context.Context, path string, in, out any) error {
	body, err := json.Marshal(in)
	if err != nil {
		return err
	}
	_, err = c.do(ctx, http.MethodPost, path, bytes.NewReader(body), out)
	return err
}

func (c *Client) do(ctx context.Context, method, path string, body io.Reader, out any) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, apiBase+path, body)
	if err != nil {
		return nil, err
	}
	// An empty token means unauthenticated access (public data only,
	// low rate limit) — useful in development; sessions always carry one.
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	httpc := c.HTTP
	if httpc == nil {
		httpc = http.DefaultClient
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var ghErr struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&ghErr)
		return nil, &APIError{StatusCode: resp.StatusCode, Message: ghErr.Message}
	}
	if out != nil {
		if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
			return nil, err
		}
	}
	return resp, nil
}
