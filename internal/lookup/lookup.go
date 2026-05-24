package lookup

import (
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// Service performs age key lookups via DNS and HTTPS.
type Service struct {
	DNSResolver      string
	WellknownTimeout time.Duration
}

// Lookup resolves a recipient (user@domain or bare domain) to age keys.
// It tries HTTPS first (preferred, especially for PQ keys), then DNS.
func (s *Service) Lookup(recipient string) (*Result, error) {
	recipient = strings.TrimSpace(recipient)
	if recipient == "" {
		return nil, fmt.Errorf("lookup: empty recipient")
	}

	domain := DomainOf(recipient)
	if domain == "" {
		return nil, fmt.Errorf("lookup: cannot determine domain from %q", recipient)
	}

	result := &Result{
		Recipient: recipient,
		Found:     false,
	}

	// Try HTTPS first.
	if records, err := HTTPSLookup(domain, s.WellknownTimeout); err == nil && len(records) > 0 {
		slog.Debug("HTTPS well-known returned records", "domain", domain, "count", len(records))
		if matched := matchRecords(records, recipient, domain); len(matched) > 0 {
			result.Found = true
			result.Trust = TrustHTTPS
			result.Keys = collectKeys(matched)
			result.Delivery = resolveDelivery(matched[0], recipient)
			return result, nil
		}
	} else if err != nil {
		slog.Debug("HTTPS well-known lookup failed", "domain", domain, "error", err)
	}

	// Fall back to DNS.
	records, trust, err := DNSLookup(domain, s.DNSResolver)
	if err != nil {
		slog.Debug("DNS lookup failed", "domain", domain, "resolver", s.DNSResolver, "error", err)
		return result, nil
	}
	slog.Debug("DNS lookup returned records", "domain", domain, "count", len(records), "trust", trust)
	if matched := matchRecords(records, recipient, domain); len(matched) > 0 {
		result.Found = true
		result.Trust = trust
		result.Keys = collectKeys(matched)
		result.Delivery = resolveDelivery(matched[0], recipient)
		return result, nil
	}

	return result, nil
}

// matchRecords finds records matching the recipient, falling back to domain catch-all.
func matchRecords(records []Record, recipient, domain string) []Record {
	// Exact match first.
	var exact []Record
	for _, r := range records {
		if strings.EqualFold(r.Match, recipient) {
			exact = append(exact, r)
		}
	}
	if len(exact) > 0 {
		return exact
	}

	// Fall back to bare domain (catch-all) — only if recipient is a full address.
	if IsFullAddress(recipient) {
		var catchAll []Record
		for _, r := range records {
			if strings.EqualFold(r.Match, domain) {
				catchAll = append(catchAll, r)
			}
		}
		return catchAll
	}

	return nil
}

// collectKeys extracts unique age keys from matched records.
func collectKeys(records []Record) []string {
	seen := make(map[string]struct{})
	var keys []string
	for _, r := range records {
		if _, dup := seen[r.AgeKey]; !dup {
			seen[r.AgeKey] = struct{}{}
			keys = append(keys, r.AgeKey)
		}
	}
	return keys
}

// resolveDelivery determines the RCPT TO address from a record.
func resolveDelivery(rec Record, recipient string) string {
	if rec.Delivery != "" {
		return rec.Delivery
	}
	// Empty delivery: use the match itself if it's a full address.
	if IsFullAddress(rec.Match) {
		return rec.Match
	}
	// Bare domain with no delivery — use the original recipient if it's an address.
	if IsFullAddress(recipient) {
		return recipient
	}
	return ""
}
