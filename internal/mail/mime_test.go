package mail

import (
	"strings"
	"testing"
)

func TestAssembleMIME_Basic(t *testing.T) {
	msg, err := AssembleMIME("sender@test.de", "rcpt@test.de", []byte("encrypted-body"), nil)
	if err != nil {
		t.Fatalf("AssembleMIME: %v", err)
	}

	s := string(msg)
	if !strings.Contains(s, "From: sender@test.de") {
		t.Error("missing From header")
	}
	if !strings.Contains(s, "To: rcpt@test.de") {
		t.Error("missing To header")
	}
	if !strings.Contains(s, "Subject: You have received an encrypted message") {
		t.Error("missing Subject header")
	}
	if !strings.Contains(s, `filename="message.age"`) {
		t.Error("missing message.age attachment")
	}
	if !strings.Contains(s, "text/plain") {
		t.Error("missing plaintext notice part")
	}
}

func TestAssembleMIME_WithAttachments(t *testing.T) {
	attachments := []Attachment{
		{Payload: []byte("payload1"), Meta: []byte("meta1"), Index: 1},
		{Payload: []byte("payload2"), Meta: []byte("meta2"), Index: 2},
	}

	msg, err := AssembleMIME("s@t.de", "r@t.de", []byte("body"), attachments)
	if err != nil {
		t.Fatalf("AssembleMIME: %v", err)
	}

	s := string(msg)
	if !strings.Contains(s, `filename="attachment-001.payload.age"`) {
		t.Error("missing attachment-001.payload.age")
	}
	if !strings.Contains(s, `filename="attachment-001.meta.age"`) {
		t.Error("missing attachment-001.meta.age")
	}
	if !strings.Contains(s, `filename="attachment-002.payload.age"`) {
		t.Error("missing attachment-002.payload.age")
	}
	if !strings.Contains(s, `filename="attachment-002.meta.age"`) {
		t.Error("missing attachment-002.meta.age")
	}
}
