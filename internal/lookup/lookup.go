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
	if records, failures, err := HTTPSLookup(domain, s.WellknownTimeout); err == nil && len(records) > 0 {
		slog.Debug("HTTPS well-known returned records", "domain", domain, "count", len(records))
		if matched := matchRecords(records, recipient, domain); len(matched) > 0 {
			result.Found = true
			result.Trust = TrustHTTPS
			result.Keys = collectKeys(matched)
			result.SelectedKey, result.SelectionReason = selectKey(result.Keys)
			result.Delivery = resolveDelivery(matched[0], recipient)
			result.Warnings = warningsForFailures(failures, recipient)
			return result, nil
		}
		result.Warnings = warningsForFailures(failures, recipient)
	} else if err != nil {
		slog.Debug("HTTPS well-known lookup failed", "domain", domain, "error", err)
	}

	// Fall back to DNS.
	records, trust, failures, err := DNSLookup(domain, s.DNSResolver)
	if err != nil {
		slog.Debug("DNS lookup failed", "domain", domain, "resolver", s.DNSResolver, "error", err)
		return result, nil
	}
	slog.Debug("DNS lookup returned records", "domain", domain, "count", len(records), "trust", trust)
	if matched := matchRecords(records, recipient, domain); len(matched) > 0 {
		result.Found = true
		result.Trust = trust
		result.Keys = collectKeys(matched)
		result.SelectedKey, result.SelectionReason = selectKey(result.Keys)
		result.Delivery = resolveDelivery(matched[0], recipient)
		// Merge any prior HTTPS warnings with DNS failures so the user sees both.
		result.Warnings = append(result.Warnings, warningsForFailures(failures, recipient)...)
		return result, nil
	}

	result.Warnings = append(result.Warnings, warningsForFailures(failures, recipient)...)
	return result, nil
}

// warningsForFailures returns warnings only for malformed records that look
// like they were *intended* for the given recipient. We don't want to
// pollute every lookup on a domain with warnings about unrelated typos in
// other entries — that would be noise.
//
// Relevance heuristic:
//   - The malformed line's "intended match" (text before the first ';')
//     equals the recipient case-insensitively, OR
//   - Both the intended-match and the recipient contain '@' and share the
//     same local-part (catches domain typos like "user@example" vs
//     "user@example.com").
func warningsForFailures(failures []ParseFailure, recipient string) []string {
	if len(failures) == 0 {
		return nil
	}
	var out []string
	for _, f := range failures {
		if !malformedRelevantTo(f.Line, recipient) {
			continue
		}
		out = append(out, "ignored malformed record: "+briefLine(f.Line))
	}
	return out
}

func malformedRelevantTo(malformedLine, recipient string) bool {
	intended := malformedLine
	if idx := strings.IndexByte(malformedLine, ';'); idx >= 0 {
		intended = strings.TrimSpace(malformedLine[:idx])
	}
	if intended == "" {
		return false
	}
	if strings.EqualFold(intended, recipient) {
		return true
	}
	mAt := strings.LastIndex(intended, "@")
	rAt := strings.LastIndex(recipient, "@")
	if mAt < 0 || rAt < 0 {
		return false
	}
	return strings.EqualFold(intended[:mAt], recipient[:rAt])
}

func briefLine(line string) string {
	const max = 80
	line = strings.ReplaceAll(line, "\r", " ")
	line = strings.ReplaceAll(line, "\n", " ")
	if len(line) > max {
		return line[:max] + "…"
	}
	return line
}

// matchRecords finds records whose Match field equals the recipient
// case-insensitively. No catch-all / domain-wildcard fallback: lookups must
// be explicit so the operator's intent is unambiguous and users never end
// up routed somewhere they didn't ask for.
func matchRecords(records []Record, recipient, _ string) []Record {
	var exact []Record
	for _, r := range records {
		if strings.EqualFold(r.Match, recipient) {
			exact = append(exact, r)
		}
	}
	return exact
}

// selectKey picks one key from the matched set with reason.
// Rule: prefer PQ (age1pq1) over classical (age1) when multiple keys are present.
// Stable: first PQ key wins; if no PQ key, the first key wins.
func selectKey(keys []string) (string, string) {
	if len(keys) == 0 {
		return "", ""
	}
	if len(keys) == 1 {
		return keys[0], "single"
	}
	for _, k := range keys {
		if strings.HasPrefix(k, "age1pq1") {
			return k, "pq-preferred"
		}
	}
	return keys[0], "pq-unavailable"
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
