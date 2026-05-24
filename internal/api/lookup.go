package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/dhcgn/age-web-gateway/internal/lookup"
)

// LookupHandler handles GET /api/lookup?recipient=...
type LookupHandler struct {
	LookupService *lookup.Service
}

func (h *LookupHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	recipient := strings.TrimSpace(r.URL.Query().Get("recipient"))
	if recipient == "" {
		http.Error(w, `{"error":"missing recipient parameter"}`, http.StatusBadRequest)
		return
	}

	// Basic format validation.
	domain := lookup.DomainOf(recipient)
	if domain == "" || !strings.Contains(domain, ".") {
		http.Error(w, `{"error":"invalid recipient format"}`, http.StatusBadRequest)
		return
	}

	result, err := h.LookupService.Lookup(recipient)
	if err != nil {
		http.Error(w, `{"error":"lookup failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
