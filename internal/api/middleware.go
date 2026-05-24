package api

import (
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
				http.Error(w, `{"error":"`+err.Error()+`"}`, code)
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

// CORSMiddleware handles CORS for API requests (same-origin only, but needed for preflight).
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-PoW")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
