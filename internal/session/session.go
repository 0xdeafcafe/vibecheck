// Package session stores the GitHub user token in an AES-GCM encrypted
// cookie. The server keeps no session state, per
// docs/adr/20260610-system-architecture.md.
package session

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

const cookieName = "vibecheck_session"

type Session struct {
	AccessToken           string    `json:"at"`
	AccessTokenExpiresAt  time.Time `json:"ae"`
	RefreshToken          string    `json:"rt"`
	RefreshTokenExpiresAt time.Time `json:"re"`
	Login                 string    `json:"lg"`
	AvatarURL             string    `json:"av"`
}

type Codec struct {
	aead cipher.AEAD
}

// NewCodec takes a 32-byte key.
func NewCodec(key []byte) (*Codec, error) {
	if len(key) != 32 {
		return nil, errors.New("session key must be 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Codec{aead: aead}, nil
}

func (c *Codec) Write(w http.ResponseWriter, s *Session, secure bool) error {
	plain, err := json.Marshal(s)
	if err != nil {
		return err
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return err
	}
	sealed := c.aead.Seal(nonce, nonce, plain, nil)
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    base64.RawURLEncoding.EncodeToString(sealed),
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int((30 * 24 * time.Hour).Seconds()),
	})
	return nil
}

func (c *Codec) Read(r *http.Request) (*Session, error) {
	ck, err := r.Cookie(cookieName)
	if err != nil {
		return nil, err
	}
	sealed, err := base64.RawURLEncoding.DecodeString(ck.Value)
	if err != nil {
		return nil, err
	}
	ns := c.aead.NonceSize()
	if len(sealed) < ns {
		return nil, errors.New("cookie too short")
	}
	plain, err := c.aead.Open(nil, sealed[:ns], sealed[ns:], nil)
	if err != nil {
		return nil, err
	}
	var s Session
	if err := json.Unmarshal(plain, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func Clear(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, SameSite: http.SameSiteLaxMode,
	})
}
