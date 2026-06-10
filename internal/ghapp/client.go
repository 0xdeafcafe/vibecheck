package ghapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	req.Header.Set("Authorization", "Bearer "+c.Token)
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
