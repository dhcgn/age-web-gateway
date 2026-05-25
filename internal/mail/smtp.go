package mail

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
)

// Service handles SMTP relay of assembled messages.
type Service struct {
	Host string
	Port int
	User string
	Pass string
	From string
}

// Send assembles a MIME message from p and relays it via SMTP.
// It implements the Sender interface.
func (s *Service) Send(p Payload) error {
	msg, err := AssembleMIME(s.From, p.To, p.Subject, p.Message, p.Attachments)
	if err != nil {
		return fmt.Errorf("mime assembly: %w", err)
	}
	return s.sendRaw(p.To, msg)
}

// sendRaw relays a pre-assembled MIME message to a single recipient over SMTP.
func (s *Service) sendRaw(to string, msg []byte) error {
	addr := net.JoinHostPort(s.Host, fmt.Sprintf("%d", s.Port))

	c, err := smtp.Dial(addr)
	if err != nil {
		return fmt.Errorf("smtp dial: %w", err)
	}
	defer c.Close()

	// STARTTLS if available.
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: s.Host}); err != nil {
			return fmt.Errorf("smtp starttls: %w", err)
		}
	}

	// Authenticate if credentials are provided.
	if s.User != "" && s.Pass != "" {
		auth := smtp.PlainAuth("", s.User, s.Pass, s.Host)
		if err := c.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}

	if err := c.Mail(s.From); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	if err := c.Rcpt(to); err != nil {
		return fmt.Errorf("smtp RCPT TO: %w", err)
	}

	wc, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	if _, err := wc.Write(msg); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := wc.Close(); err != nil {
		return fmt.Errorf("smtp data close: %w", err)
	}

	return c.Quit()
}
