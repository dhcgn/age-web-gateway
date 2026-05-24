package lookup

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"time"
)

const maxWellKnownSize = 1 << 20 // 1 MiB

// HTTPSLookup fetches https://<domain>/.well-known/age and parses age records.
func HTTPSLookup(domain string, timeout time.Duration) ([]Record, error) {
	if err := validateDomain(domain); err != nil {
		return nil, fmt.Errorf("https lookup: %w", err)
	}

	url := "https://" + domain + "/.well-known/age"

	// Use a custom transport that rejects connections to private/internal IPs
	// after DNS resolution (prevents DNS rebinding attacks).
	dialer := &net.Dialer{Timeout: timeout}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, fmt.Errorf("invalid address %q: %w", addr, err)
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, fmt.Errorf("dns resolve %q: %w", host, err)
			}
			for _, ip := range ips {
				if isPrivateIP(ip.IP) {
					return nil, fmt.Errorf("resolved to private/internal IP %s", ip.IP)
				}
			}
			// Connect to the first valid resolved IP.
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	}

	client := &http.Client{Timeout: timeout, Transport: transport}
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

// validateDomain rejects raw IP addresses and domains without valid TLDs.
func validateDomain(domain string) error {
	if ip := net.ParseIP(domain); ip != nil {
		return fmt.Errorf("raw IP addresses are not allowed: %s", domain)
	}
	// Reject IPv6 bracket notation.
	if len(domain) > 0 && domain[0] == '[' {
		return fmt.Errorf("raw IP addresses are not allowed: %s", domain)
	}
	return nil
}

// isPrivateIP returns true for loopback, private, link-local, and other non-public IPs.
func isPrivateIP(ip net.IP) bool {
	return ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified()
}
