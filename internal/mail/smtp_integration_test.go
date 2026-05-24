//go:build integration

package mail

import (
	"os"
	"testing"
)

func TestSMTPIntegration(t *testing.T) {
	// Skip if no integration config is available.
	host := os.Getenv("INTEGRATION_SMTP_HOST")
	if host == "" {
		t.Skip("INTEGRATION_SMTP_HOST not set; skipping SMTP integration test")
	}

	svc := &Service{
		Host: host,
		Port: 587,
		User: os.Getenv("INTEGRATION_SMTP_USER"),
		Pass: os.Getenv("INTEGRATION_SMTP_PASS"),
		From: os.Getenv("INTEGRATION_SMTP_FROM"),
	}

	to := os.Getenv("INTEGRATION_SMTP_TO")
	if to == "" {
		t.Skip("INTEGRATION_SMTP_TO not set")
	}

	msg, err := AssembleMIME(svc.From, to, []byte("test-encrypted-body"), nil)
	if err != nil {
		t.Fatalf("AssembleMIME: %v", err)
	}

	if err := svc.Send(to, msg); err != nil {
		t.Fatalf("Send: %v", err)
	}
}
