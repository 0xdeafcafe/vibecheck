// Package ghapp talks to GitHub: the App's OAuth user-access-token flow
// and the handful of REST endpoints vibecheck needs. Deliberately minimal —
// no SDK dependency.
package ghapp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type OAuth struct {
	ClientID     string
	ClientSecret string
	HTTP         *http.Client
}

type Tokens struct {
	AccessToken           string
	AccessTokenExpiresAt  time.Time
	RefreshToken          string
	RefreshTokenExpiresAt time.Time
}

func (o *OAuth) AuthorizeURL(redirectURI, state string) string {
	q := url.Values{
		"client_id":    {o.ClientID},
		"redirect_uri": {redirectURI},
		"state":        {state},
	}
	return "https://github.com/login/oauth/authorize?" + q.Encode()
}

// Exchange swaps an OAuth code for user tokens.
func (o *OAuth) Exchange(ctx context.Context, code string) (*Tokens, error) {
	return o.tokenRequest(ctx, url.Values{
		"client_id":     {o.ClientID},
		"client_secret": {o.ClientSecret},
		"code":          {code},
	})
}

// Refresh exchanges a refresh token for a new token pair.
func (o *OAuth) Refresh(ctx context.Context, refreshToken string) (*Tokens, error) {
	return o.tokenRequest(ctx, url.Values{
		"client_id":     {o.ClientID},
		"client_secret": {o.ClientSecret},
		"grant_type":    {"refresh_token"},
		"refresh_token": {refreshToken},
	})
}

func (o *OAuth) tokenRequest(ctx context.Context, form url.Values) (*Tokens, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := o.client().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var body struct {
		AccessToken           string `json:"access_token"`
		ExpiresIn             int64  `json:"expires_in"`
		RefreshToken          string `json:"refresh_token"`
		RefreshTokenExpiresIn int64  `json:"refresh_token_expires_in"`
		Error                 string `json:"error"`
		ErrorDescription      string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	if body.Error != "" {
		return nil, fmt.Errorf("github oauth: %s: %s", body.Error, body.ErrorDescription)
	}
	now := time.Now()
	t := &Tokens{
		AccessToken:  body.AccessToken,
		RefreshToken: body.RefreshToken,
	}
	if body.ExpiresIn > 0 {
		t.AccessTokenExpiresAt = now.Add(time.Duration(body.ExpiresIn) * time.Second)
	}
	if body.RefreshTokenExpiresIn > 0 {
		t.RefreshTokenExpiresAt = now.Add(time.Duration(body.RefreshTokenExpiresIn) * time.Second)
	}
	return t, nil
}

func (o *OAuth) client() *http.Client {
	if o.HTTP != nil {
		return o.HTTP
	}
	return http.DefaultClient
}
