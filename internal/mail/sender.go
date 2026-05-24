package mail

// Sender delivers a pre-built mail payload to a single recipient.
type Sender interface {
	Send(p Payload) error
}

// Payload contains all data needed to deliver one email.
// Message and Attachments carry age-encrypted binary blobs.
type Payload struct {
	From        string
	To          string
	Message     []byte       // message.age raw bytes
	Attachments []Attachment // optional file attachments (payload + meta pairs)
}
