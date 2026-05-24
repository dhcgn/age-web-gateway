package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/dhcgn/age-web-gateway/internal/lookup"
	"github.com/dhcgn/age-web-gateway/internal/mail"
)

// SendHandler handles POST /api/send.
type SendHandler struct {
	LookupService *lookup.Service
	MailService   *mail.Service
}

// sendRequest is the JSON body of POST /api/send.
type sendRequest struct {
	Recipients  []string             `json:"recipients"`
	Message     string               `json:"message"` // base64-encoded message.age
	Attachments []sendAttachmentJSON `json:"attachments"`
}

type sendAttachmentJSON struct {
	Payload string `json:"payload"` // base64-encoded attachment-NNN.payload.age
	Meta    string `json:"meta"`    // base64-encoded attachment-NNN.meta.age
}

func (h *SendHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req sendRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON body"}`, http.StatusBadRequest)
		return
	}

	if len(req.Recipients) == 0 {
		http.Error(w, `{"error":"no recipients"}`, http.StatusBadRequest)
		return
	}

	// Decode base64 message.
	messageBytes, err := base64.StdEncoding.DecodeString(req.Message)
	if err != nil {
		http.Error(w, `{"error":"invalid base64 in message"}`, http.StatusBadRequest)
		return
	}

	// Decode attachments.
	var attachments []mail.Attachment
	for i, att := range req.Attachments {
		payload, err := base64.StdEncoding.DecodeString(att.Payload)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"invalid base64 in attachment %d payload"}`, i+1), http.StatusBadRequest)
			return
		}
		meta, err := base64.StdEncoding.DecodeString(att.Meta)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"invalid base64 in attachment %d meta"}`, i+1), http.StatusBadRequest)
			return
		}
		attachments = append(attachments, mail.Attachment{
			Payload: payload,
			Meta:    meta,
			Index:   i + 1,
		})
	}

	// Re-resolve each recipient for delivery address and send.
	var errors []string
	for _, recipient := range req.Recipients {
		result, err := h.LookupService.Lookup(recipient)
		if err != nil || !result.Found {
			errors = append(errors, fmt.Sprintf("recipient %s: not found", recipient))
			continue
		}

		delivery := result.Delivery
		if delivery == "" {
			errors = append(errors, fmt.Sprintf("recipient %s: no delivery address", recipient))
			continue
		}

		msg, err := mail.AssembleMIME(h.MailService.From, delivery, messageBytes, attachments)
		if err != nil {
			errors = append(errors, fmt.Sprintf("recipient %s: MIME assembly failed: %v", recipient, err))
			continue
		}

		if err := h.MailService.Send(delivery, msg); err != nil {
			slog.Error("SMTP send failed", "recipient", delivery, "error", err)
			errors = append(errors, fmt.Sprintf("recipient %s: send failed", recipient))
			continue
		}
	}

	if len(errors) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "some recipients failed",
			"errors": errors,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "sent"})
}
