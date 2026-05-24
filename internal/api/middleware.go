package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/dhcgn/age-web-gateway/internal/pow"
)

// PoWMiddleware verifies the X-PoW header on every request.
func PoWMiddleware(difficulty int, validity int, cache *pow.ReplayCache) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := r.Header.Get("X-PoW")
			if token == "" {
				http.Error(w, `{"error":"missing X-PoW header"}`, http.StatusUnauthorized)
				return
			}

			err := pow.Verify(token, difficulty, pow.ValidityDuration(validity), cache)
			if err != nil {
				code := http.StatusUnauthorized
				if err == pow.ErrReplayed {
					code = http.StatusTooManyRequests
				}
					errJSON, _ := json.Marshal(map[string]string{"error": err.Error()})
					http.Error(w, string(errJSON), code)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// CSPMiddleware adds Content-Security-Policy headers.
func CSPMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

// CORSMiddleware handles CORS for API requests.
// If allowedOrigins is non-empty, only those origins are permitted.
// If empty, same-origin is inferred from the request Host header (suitable for local dev).
func CORSMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[strings.TrimRight(o, "/")] = struct{}{}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				origin := r.Header.Get("Origin")
				if origin != "" && isAllowedOrigin(r, origin, allowed) {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-PoW")
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				}
				if r.Method == http.MethodOptions {
					w.WriteHeader(http.StatusNoContent)
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// isAllowedOrigin checks whether the origin is in the allow-list or, if the
// list is empty, whether it matches the server's own Host header.
func isAllowedOrigin(r *http.Request, origin string, allowed map[string]struct{}) bool {
	if len(allowed) > 0 {
		_, ok := allowed[origin]
		return ok
	}
	// Fallback: same-origin check using Host header (local dev).
	host := r.Host
	if host == "" {
		return false
	}
	return origin == "http://"+host || origin == "https://"+host
}
