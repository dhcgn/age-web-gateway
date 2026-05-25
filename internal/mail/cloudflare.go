package mail

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

const cfEndpoint = "https://api.cloudflare.com/client/v4/accounts/%s/email/sending/send"

const cfNoticeText = "This message was sent via agemail.\r\n" +
	"The contents are encrypted with age (https://age-encryption.org).\r\n" +
	"Decrypt the attached .age files with your private key:\r\n" +
	"  age -d -i key.txt message.age\r\n"

// CloudflareService delivers mail via the Cloudflare Email REST API.
type CloudflareService struct {
	AccountID  string
	APIToken   string
	FromAddr   string
	HTTPClient *http.Client // nil → http.DefaultClient
}

type cfAttachment struct {
	Content     string `json:"content"`
	Filename    string `json:"filename"`
	Type        string `json:"type"`
	Disposition string `json:"disposition"`
}

type cfRequest struct {
	To          string         `json:"to"`
	From        string         `json:"from"`
	Subject     string         `json:"subject"`
	Text        string         `json:"text"`
	Attachments []cfAttachment `json:"attachments"`
}

type cfResponse struct {
	Success bool `json:"success"`
	Errors  []struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"errors"`
}

// Send delivers p via the Cloudflare Email REST API.
func (s *CloudflareService) Send(p Payload) error {
	atts := make([]cfAttachment, 0, 1+len(p.Attachments)*2)

	// message.age
	atts = append(atts, cfAttachment{
		Content:     base64.StdEncoding.EncodeToString(p.Message),
		Filename:    "message.age",
		Type:        "application/octet-stream",
		Disposition: "attachment",
	})

	// per-attachment pairs
	for _, a := range p.Attachments {
		prefix := fmt.Sprintf("attachment-%03d", a.Index)
		atts = append(atts,
			cfAttachment{
				Content:     base64.StdEncoding.EncodeToString(a.Payload),
				Filename:    prefix + ".payload.age",
				Type:        "application/octet-stream",
				Disposition: "attachment",
			},
			cfAttachment{
				Content:     base64.StdEncoding.EncodeToString(a.Meta),
				Filename:    prefix + ".meta.age",
				Type:        "application/octet-stream",
				Disposition: "attachment",
			},
		)
	}

	body := cfRequest{
		To:          p.To,
		From:        p.From,
		Subject:     ComposeSubject(p.Subject),
		Text:        cfNoticeText,
		Attachments: atts,
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("cloudflare: marshal request: %w", err)
	}

	url := fmt.Sprintf(cfEndpoint, s.AccountID)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return fmt.Errorf("cloudflare: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.APIToken)
	req.Header.Set("Content-Type", "application/json")

	client := s.HTTPClient
	if client == nil {
		client = http.DefaultClient
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("cloudflare: http: %w", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if err != nil {
		return fmt.Errorf("cloudflare: read response: %w", err)
	}

	var cfResp cfResponse
	if err := json.Unmarshal(respBytes, &cfResp); err != nil {
		return fmt.Errorf("cloudflare: parse response (status %d): %w", resp.StatusCode, err)
	}

	if !cfResp.Success {
		if len(cfResp.Errors) > 0 {
			return fmt.Errorf("cloudflare: send failed: %s (code %d)", cfResp.Errors[0].Message, cfResp.Errors[0].Code)
		}
		return fmt.Errorf("cloudflare: send failed (status %d)", resp.StatusCode)
	}

	return nil
}
