package mail

import (
	"bytes"
	"fmt"
	"mime"
	"mime/multipart"
	"net/textproto"
	"time"
)

// Attachment holds the encrypted payload and metadata blobs for one file.
type Attachment struct {
	Payload []byte // attachment-NNN.payload.age
	Meta    []byte // attachment-NNN.meta.age
	Index   int    // 1-based
}

// AssembleMIME builds a multipart/mixed MIME message. The subject is
// composed via ComposeSubject and RFC 2047 Q-encoded so non-ASCII
// characters survive transport.
func AssembleMIME(from, to, subject string, message []byte, attachments []Attachment) ([]byte, error) {
	var buf bytes.Buffer

	encodedSubject := mime.QEncoding.Encode("utf-8", ComposeSubject(subject))

	// Write top-level headers.
	messageID := fmt.Sprintf("<%d.agemail@%s>", time.Now().UnixNano(), "agemail")
	buf.WriteString("From: " + from + "\r\n")
	buf.WriteString("To: " + to + "\r\n")
	buf.WriteString("Date: " + time.Now().UTC().Format(time.RFC1123Z) + "\r\n")
	buf.WriteString("Message-ID: " + messageID + "\r\n")
	buf.WriteString("Subject: " + encodedSubject + "\r\n")
	buf.WriteString("MIME-Version: 1.0\r\n")

	w := multipart.NewWriter(&buf)
	buf.WriteString("Content-Type: multipart/mixed; boundary=" + w.Boundary() + "\r\n")
	buf.WriteString("\r\n")

	// Part 1: plaintext notice.
	noticeHeader := make(textproto.MIMEHeader)
	noticeHeader.Set("Content-Type", "text/plain; charset=utf-8")
	noticePart, err := w.CreatePart(noticeHeader)
	if err != nil {
		return nil, fmt.Errorf("create notice part: %w", err)
	}
	noticePart.Write([]byte("This message was sent via agemail.\r\n" +
		"The contents are encrypted with age (https://age-encryption.org).\r\n" +
		"Decrypt the attached .age files with your private key:\r\n" +
		"  age -d -i key.txt message.age\r\n"))

	// Part 2: message.age
	msgHeader := make(textproto.MIMEHeader)
	msgHeader.Set("Content-Type", "application/octet-stream")
	msgHeader.Set("Content-Disposition", `attachment; filename="message.age"`)
	msgHeader.Set("Content-Transfer-Encoding", "base64")
	msgPart, err := w.CreatePart(msgHeader)
	if err != nil {
		return nil, fmt.Errorf("create message part: %w", err)
	}
	writeBase64(msgPart, message)

	// Parts 3+: attachments.
	for _, att := range attachments {
		prefix := fmt.Sprintf("attachment-%03d", att.Index)

		// payload.age
		pH := make(textproto.MIMEHeader)
		pH.Set("Content-Type", "application/octet-stream")
		pH.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.payload.age"`, prefix))
		pH.Set("Content-Transfer-Encoding", "base64")
		pp, err := w.CreatePart(pH)
		if err != nil {
			return nil, fmt.Errorf("create payload part: %w", err)
		}
		writeBase64(pp, att.Payload)

		// meta.age
		mH := make(textproto.MIMEHeader)
		mH.Set("Content-Type", "application/octet-stream")
		mH.Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.meta.age"`, prefix))
		mH.Set("Content-Transfer-Encoding", "base64")
		mp, err := w.CreatePart(mH)
		if err != nil {
			return nil, fmt.Errorf("create meta part: %w", err)
		}
		writeBase64(mp, att.Meta)
	}

	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("close multipart: %w", err)
	}

	return buf.Bytes(), nil
}
