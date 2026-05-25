package lookup

import (
	"fmt"
	"strings"
)

// TrustLevel indicates how the key was discovered and how trustworthy that is.
type TrustLevel string

const (
	TrustHTTPS  TrustLevel = "https"  // Web PKI / TLS authenticated
	TrustDNSSEC TrustLevel = "dnssec" // DNSSEC validated (AD bit)
	TrustDNS    TrustLevel = "dns"    // Plain DNS, unauthenticated
)

// Record is a single entry from a DNS TXT or HTTPS well-known file.
type Record struct {
	Match    string // bare domain or user@domain
	Delivery string // delivery mailbox (RCPT TO), empty = deliver to Match
	AgeKey   string // age public key (age1... or age1pq1...)
}

// Result is the response returned by a lookup.
type Result struct {
	Recipient       string     `json:"recipient"`
	Found           bool       `json:"found"`
	Trust           TrustLevel `json:"trust,omitempty"`
	Keys            []string   `json:"recipients,omitempty"` // JSON field = "recipients" per §4.4
	SelectedKey     string     `json:"selected_key,omitempty"`
	SelectionReason string     `json:"selection_reason,omitempty"` // "single", "pq-preferred", "pq-unavailable"
	Delivery        string     `json:"delivery,omitempty"`
	Warnings        []string   `json:"warnings,omitempty"`
}

// ParseFailure describes a record line that could not be parsed.
type ParseFailure struct {
	Line string // raw input line
	Err  error
}

// ParseRecord parses a single semicolon-separated line into a Record.
// Format: match;delivery;age-key
func ParseRecord(line string) (Record, error) {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return Record{}, fmt.Errorf("empty or comment line")
	}

	parts := strings.SplitN(line, ";", 3)
	if len(parts) != 3 {
		return Record{}, fmt.Errorf("expected 3 semicolon-separated fields, got %d", len(parts))
	}

	match := strings.TrimSpace(parts[0])
	delivery := strings.TrimSpace(parts[1])
	ageKey := strings.TrimSpace(parts[2])

	if match == "" {
		return Record{}, fmt.Errorf("match field is empty")
	}
	if ageKey == "" {
		return Record{}, fmt.Errorf("age-key field is empty")
	}
	if !strings.HasPrefix(ageKey, "age1") {
		return Record{}, fmt.Errorf("age-key does not start with age1: %q", ageKey)
	}

	return Record{
		Match:    match,
		Delivery: delivery,
		AgeKey:   ageKey,
	}, nil
}

// ParseRecords parses multiple lines (e.g. from a well-known file), discarding
// parse failures. Use ParseRecordsAndFailures when you need to surface them.
func ParseRecords(body string) []Record {
	records, _ := ParseRecordsAndFailures(body)
	return records
}

// ParseRecordsAndFailures parses multiple lines and returns both the valid
// records and a list of parse failures (with the raw offending line).
func ParseRecordsAndFailures(body string) ([]Record, []ParseFailure) {
	var records []Record
	var failures []ParseFailure
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		rec, err := ParseRecord(line)
		if err != nil {
			failures = append(failures, ParseFailure{Line: line, Err: err})
			continue
		}
		records = append(records, rec)
	}
	return records, failures
}

// DomainOf extracts the domain from a recipient string.
// "user@domain.de" → "domain.de", "domain.de" → "domain.de".
func DomainOf(recipient string) string {
	if at := strings.LastIndex(recipient, "@"); at >= 0 {
		return recipient[at+1:]
	}
	return recipient
}

// IsFullAddress returns true if the recipient looks like user@domain.
func IsFullAddress(recipient string) bool {
	return strings.Contains(recipient, "@")
}
