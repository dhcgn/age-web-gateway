//go:build integration

// Package lookup integration tests against the live DNS records published at
// _age.testing.age.hdev.io (see TESTING.md). Run with:
//
//	go test -tags=integration ./internal/lookup/...
//
// These tests require outbound DNS (8.8.8.8:53 or system resolver) and
// will fail if the testing zone is taken down or changed.
package lookup

import (
	"strings"
	"testing"
	"time"
)

// testAgeKey is the single classical age key shared by all entries in the
// testing zone. Defined in TESTING.md.
const testAgeKey = "age1a3xsw5j5d27k4zmp5wzr7kp49m7gvgt87f32gq3he7da0r4jne6qyk4mmy"

func newIntegrationService() *Service {
	return &Service{
		DNSResolver:      "", // use system resolver / 8.8.8.8 fallback
		WellknownTimeout: 3 * time.Second,
	}
}

// Querying the bare domain itself matches the bare-domain record by exact
// equality (NOT via catch-all fallback for user@domain queries).
func TestIntegration_DNS_BareDomain_ExactMatch(t *testing.T) {
	s := newIntegrationService()

	result, err := s.Lookup("testing.age.hdev.io")
	if err != nil {
		t.Fatalf("Lookup error: %v", err)
	}
	if !result.Found {
		t.Fatalf("expected Found=true, got %+v", result)
	}
	if result.SelectedKey != testAgeKey {
		t.Errorf("SelectedKey = %q, want %q", result.SelectedKey, testAgeKey)
	}
	if result.SelectionReason != "single" {
		t.Errorf("SelectionReason = %q, want %q", result.SelectionReason, "single")
	}
	if result.Delivery != "catchall@nonexisting" {
		t.Errorf("Delivery = %q, want %q", result.Delivery, "catchall@nonexisting")
	}
	if result.Trust != TrustDNS && result.Trust != TrustDNSSEC {
		t.Errorf("Trust = %q, want dns or dnssec", result.Trust)
	}
}

func TestIntegration_DNS_ExactMatches(t *testing.T) {
	s := newIntegrationService()

	cases := []struct {
		recipient    string
		wantDelivery string
	}{
		{"a@testing.age.hdev.io", "a@nonexisting"},
		{"b@testing.age.hdev.io", "b@nonexisting"},
		{"c@testing.age.hdev.io", "c@nonexisting"},
		{"a2@testing.age.hdev.io", "a2@nonexisting"}, // lives in the second TXT record
	}

	for _, tc := range cases {
		t.Run(tc.recipient, func(t *testing.T) {
			result, err := s.Lookup(tc.recipient)
			if err != nil {
				t.Fatalf("Lookup(%q) error: %v", tc.recipient, err)
			}
			if !result.Found {
				t.Fatalf("Lookup(%q): expected Found=true, got %+v", tc.recipient, result)
			}
			if result.SelectedKey != testAgeKey {
				t.Errorf("SelectedKey = %q, want %q", result.SelectedKey, testAgeKey)
			}
			if result.Delivery != tc.wantDelivery {
				t.Errorf("Delivery = %q, want %q", result.Delivery, tc.wantDelivery)
			}
		})
	}
}

// d@testing.age.hdev.io has an intentional delivery mismatch (Delivery
// points to c@nonexisting). This exercises the warning surfaced in the UI
// when the delivery address differs from the queried address.
func TestIntegration_DNS_DeliveryMismatch(t *testing.T) {
	s := newIntegrationService()

	result, err := s.Lookup("d@testing.age.hdev.io")
	if err != nil {
		t.Fatalf("Lookup error: %v", err)
	}
	if !result.Found {
		t.Fatalf("expected Found=true, got %+v", result)
	}
	if result.Delivery != "c@nonexisting" {
		t.Errorf("Delivery = %q, want %q (intentional mismatch)", result.Delivery, "c@nonexisting")
	}
	if result.Recipient == result.Delivery {
		t.Errorf("expected Recipient (%q) and Delivery (%q) to differ", result.Recipient, result.Delivery)
	}
}

// e@testing.age.hdev.io has an empty delivery field
// (record: "e@testing.age.hdev.io;;<key>"). Per resolveDelivery, an empty
// delivery on a full-address match falls back to the match itself.
func TestIntegration_DNS_EmptyDeliveryFallsBackToMatch(t *testing.T) {
	s := newIntegrationService()

	result, err := s.Lookup("e@testing.age.hdev.io")
	if err != nil {
		t.Fatalf("Lookup error: %v", err)
	}
	if !result.Found {
		t.Fatalf("expected Found=true, got %+v", result)
	}
	if result.Delivery != "e@testing.age.hdev.io" {
		t.Errorf("Delivery = %q, want %q (empty delivery falls back to match)",
			result.Delivery, "e@testing.age.hdev.io")
	}
}

// f@testing.age.hdev.io has a malformed record. Lookups must be explicit,
// so this returns Found=false (no silent catch-all routing). The malformed
// line MUST still surface in Result.Warnings so the user can see why the
// lookup failed.
func TestIntegration_DNS_MalformedRecordIsNotFoundWithWarning(t *testing.T) {
	s := newIntegrationService()

	result, err := s.Lookup("f@testing.age.hdev.io")
	if err != nil {
		t.Fatalf("Lookup error: %v", err)
	}
	if result.Found {
		t.Fatalf("expected Found=false (no catch-all fallback), got %+v", result)
	}
	if result.Delivery != "" {
		t.Errorf("Delivery = %q, want empty (no catch-all fallback)", result.Delivery)
	}
	if !containsWarningAbout(result.Warnings, "f@testing.age.hdev") {
		t.Errorf("expected a warning mentioning the malformed f@ line, got %v", result.Warnings)
	}
}

// Lookups for OTHER recipients in the same zone must NOT carry the f@
// malformed-record warning — that warning is only relevant when the user
// is querying the address the malformed record was intended for.
func TestIntegration_DNS_MalformedWarningIsScopedToIntendedRecipient(t *testing.T) {
	s := newIntegrationService()

	cases := []string{
		"testing.age.hdev.io",     // bare domain — unrelated to f@
		"a@testing.age.hdev.io",   // different user — unrelated to f@
		"b@testing.age.hdev.io",   // different user — unrelated to f@
		"a2@testing.age.hdev.io",  // different user, different TXT — unrelated
	}
	for _, recipient := range cases {
		t.Run(recipient, func(t *testing.T) {
			result, err := s.Lookup(recipient)
			if err != nil {
				t.Fatalf("Lookup error: %v", err)
			}
			if containsWarningAbout(result.Warnings, "f@testing.age.hdev") {
				t.Errorf("unexpected f@ malformed warning surfaced for %q: %v",
					recipient, result.Warnings)
			}
		})
	}
}

func containsWarningAbout(warnings []string, needle string) bool {
	for _, w := range warnings {
		if strings.Contains(w, needle) {
			return true
		}
	}
	return false
}

// A recipient not explicitly listed must return Found=false. The bare-domain
// "testing.age.hdev.io" record only matches a bare-domain query, never a
// user@domain query — operators must publish explicit entries.
func TestIntegration_DNS_UnknownUserIsNotFound(t *testing.T) {
	s := newIntegrationService()

	result, err := s.Lookup("nobody-here@testing.age.hdev.io")
	if err != nil {
		t.Fatalf("Lookup error: %v", err)
	}
	if result.Found {
		t.Fatalf("expected Found=false for unlisted user, got %+v", result)
	}
}
