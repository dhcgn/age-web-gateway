package mail

import "strings"

// Sender delivers a pre-built mail payload to a single recipient.
type Sender interface {
	Send(p Payload) error
}

// Payload contains all data needed to deliver one email.
// Message and Attachments carry age-encrypted binary blobs.
type Payload struct {
	From        string
	To          string
	Subject     string       // optional, user-provided plaintext; appended to DefaultSubject when present
	Message     []byte       // message.age raw bytes
	Attachments []Attachment // optional file attachments (payload + meta pairs)
}

// DefaultSubject is the constant prefix sent on every message.
const DefaultSubject = "Message from age mail"

// ComposeSubject returns the final Subject header value.
// Empty user input -> DefaultSubject. Otherwise "<DefaultSubject>: <user input>".
func ComposeSubject(userSubject string) string {
	userSubject = strings.TrimSpace(userSubject)
	if userSubject == "" {
		return DefaultSubject
	}
	return DefaultSubject + ": " + userSubject
}
