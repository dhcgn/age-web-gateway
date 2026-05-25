package mail

import (
	"strings"
	"testing"
)

func TestAssembleMIME_Basic(t *testing.T) {
	msg, err := AssembleMIME("sender@test.de", "rcpt@test.de", "", []byte("encrypted-body"), nil)
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
	if !strings.Contains(s, "Subject: "+DefaultSubject+"\r\n") {
		t.Errorf("missing default Subject header, got:\n%s", s)
	}
	if !strings.Contains(s, `filename="message.age"`) {
		t.Error("missing message.age attachment")
	}
	if !strings.Contains(s, "text/plain") {
		t.Error("missing plaintext notice part")
	}
}

func TestAssembleMIME_CustomSubjectASCII(t *testing.T) {
	msg, err := AssembleMIME("s@t.de", "r@t.de", "Hello there", []byte("body"), nil)
	if err != nil {
		t.Fatalf("AssembleMIME: %v", err)
	}
	if !strings.Contains(string(msg), "Subject: "+DefaultSubject+": Hello there\r\n") {
		t.Errorf("expected composed ASCII subject in output, got:\n%s", string(msg))
	}
}

func TestComposeSubject(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"", DefaultSubject},
		{"  ", DefaultSubject},
		{"hello", DefaultSubject + ": hello"},
		{"  trimmed  ", DefaultSubject + ": trimmed"},
	}
	for _, tt := range tests {
		if got := ComposeSubject(tt.in); got != tt.want {
			t.Errorf("ComposeSubject(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestAssembleMIME_CustomSubjectUnicodeEncoded(t *testing.T) {
	msg, err := AssembleMIME("s@t.de", "r@t.de", "Grüße aus Köln", []byte("body"), nil)
	if err != nil {
		t.Fatalf("AssembleMIME: %v", err)
	}
	s := string(msg)
	// Q-encoded subject should be present (RFC 2047) and the literal non-ASCII bytes should not.
	if !strings.Contains(s, "=?utf-8?q?") {
		t.Errorf("expected Q-encoded subject, got:\n%s", s)
	}
	if strings.Contains(s, "Grüße aus Köln") {
		t.Error("raw non-ASCII subject leaked into the header")
	}
}

func TestAssembleMIME_WithAttachments(t *testing.T) {
	attachments := []Attachment{
		{Payload: []byte("payload1"), Meta: []byte("meta1"), Index: 1},
		{Payload: []byte("payload2"), Meta: []byte("meta2"), Index: 2},
	}

	msg, err := AssembleMIME("s@t.de", "r@t.de", "", []byte("body"), attachments)
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
