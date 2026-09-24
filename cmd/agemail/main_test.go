package main

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const shareTestPlaintext = "TOP-SECRET-SHARE-PAYLOAD-must-never-leave-the-browser"

func TestShareTargetHandler_GetServesApp(t *testing.T) {
	h := shareTargetHandler([]byte("<html>app</html>"))
	req := httptest.NewRequest(http.MethodGet, "/share-target", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/html; charset=utf-8" {
		t.Fatalf("unexpected content type %q", ct)
	}
}

func TestShareTargetHandler_PostRejectedWithoutReadingBody(t *testing.T) {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	fw, err := w.CreateFormFile("attachments", "secret.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fw.Write([]byte(shareTestPlaintext)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}

	h := shareTargetHandler([]byte("<html>app</html>"))
	req := httptest.NewRequest(http.MethodPost, "/share-target", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
	if allow := rec.Header().Get("Allow"); allow != http.MethodGet {
		t.Fatalf("expected Allow: GET, got %q", allow)
	}
	if strings.Contains(rec.Body.String(), shareTestPlaintext) {
		t.Fatal("response echoes shared plaintext")
	}
}

