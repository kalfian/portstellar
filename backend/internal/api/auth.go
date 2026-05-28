package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type loginReq struct {
	Password string `json:"password"`
}

type changePasswordReq struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type tokenPayload struct {
	Exp int64 `json:"exp"`
	Ver int   `json:"ver"`
	N   string `json:"n"`
}

func authSecret() string {
	if v := os.Getenv("AUTH_SECRET"); v != "" {
		return v
	}
	return "portstellar-dev-secret-change-me"
}

func createToken(version int, ttl time.Duration) (string, int64, error) {
	exp := time.Now().Add(ttl).Unix()
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return "", 0, err
	}
	payload := tokenPayload{Exp: exp, Ver: version, N: base64.RawURLEncoding.EncodeToString(nonce)}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", 0, err
	}
	p := base64.RawURLEncoding.EncodeToString(payloadJSON)
	mac := hmac.New(sha256.New, []byte(authSecret()))
	mac.Write([]byte(p))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return p + "." + sig, exp, nil
}

func parseAndValidateToken(token string) (tokenPayload, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return tokenPayload{}, errors.New("invalid token format")
	}
	p, sig := parts[0], parts[1]
	mac := hmac.New(sha256.New, []byte(authSecret()))
	mac.Write([]byte(p))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return tokenPayload{}, errors.New("bad signature")
	}
	payloadRaw, err := base64.RawURLEncoding.DecodeString(p)
	if err != nil {
		return tokenPayload{}, err
	}
	var payload tokenPayload
	if err := json.Unmarshal(payloadRaw, &payload); err != nil {
		return tokenPayload{}, err
	}
	if payload.Exp < time.Now().Unix() {
		return tokenPayload{}, errors.New("expired token")
	}
	return payload, nil
}

func bearerToken(r *http.Request) (string, error) {
	h := r.Header.Get("Authorization")
	if h == "" {
		return "", errors.New("missing authorization header")
	}
	prefix := "Bearer "
	if !strings.HasPrefix(h, prefix) {
		return "", errors.New("invalid authorization header")
	}
	return strings.TrimSpace(strings.TrimPrefix(h, prefix)), nil
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	auth, err := h.store.GetAdminAuth(r.Context())
	if err != nil {
		http.Error(w, "auth unavailable", http.StatusInternalServerError)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(auth.PasswordHash), []byte(req.Password)); err != nil {
		http.Error(w, "invalid password", http.StatusUnauthorized)
		return
	}
	token, exp, err := createToken(auth.PasswordVersion, 24*time.Hour)
	if err != nil {
		http.Error(w, "token error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"token": token, "expiresAt": exp})
}

func (h *Handler) authMe(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{"ok": true})
}

func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request) {
	var req changePasswordReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(req.NewPassword) < 6 {
		http.Error(w, "new password too short", http.StatusBadRequest)
		return
	}
	auth, err := h.store.GetAdminAuth(r.Context())
	if err != nil {
		http.Error(w, "auth unavailable", http.StatusInternalServerError)
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(auth.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		http.Error(w, "current password invalid", http.StatusUnauthorized)
		return
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "hash error", http.StatusInternalServerError)
		return
	}
	if err := h.store.SetAdminPassword(r.Context(), string(hashed), auth.PasswordVersion+1); err != nil {
		http.Error(w, "failed updating password", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"ok": true, "message": "password updated"})
}

func (h *Handler) authorize(r *http.Request) error {
	tok, err := bearerToken(r)
	if err != nil {
		return err
	}
	payload, err := parseAndValidateToken(tok)
	if err != nil {
		return err
	}
	auth, err := h.store.GetAdminAuth(r.Context())
	if err != nil {
		return err
	}
	if payload.Ver != auth.PasswordVersion {
		return fmt.Errorf("token version mismatch")
	}
	return nil
}
