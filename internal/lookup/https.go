package lookup

import (
	"fmt"
	"io"
	"net/http"
	"time"
)

const maxWellKnownSize = 1 << 20 // 1 MiB

// HTTPSLookup fetches https://<domain>/.well-known/age and parses age records.
func HTTPSLookup(domain string, timeout time.Duration) ([]Record, error) {
	url := "https://" + domain + "/.well-known/age"

	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("https lookup: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("https lookup: status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxWellKnownSize))
	if err != nil {
		return nil, fmt.Errorf("https lookup: read body: %w", err)
	}

	records := ParseRecords(string(body))
	if len(records) == 0 {
		return nil, fmt.Errorf("https lookup: no valid records at %s", url)
	}

	return records, nil
}
