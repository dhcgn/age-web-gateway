package lookup

import (
	"fmt"
	"log/slog"
	"net"
	"strings"

	"github.com/miekg/dns"
)

// DNSLookup queries _age.<domain> TXT records for age key entries.
// resolverAddr is optional (e.g. "8.8.8.8:53"); empty means system default.
func DNSLookup(domain, resolverAddr string) ([]Record, TrustLevel, error) {
	qname := "_age." + dns.Fqdn(domain)

	m := new(dns.Msg)
	m.SetQuestion(qname, dns.TypeTXT)
	m.RecursionDesired = true
	// Request DNSSEC validation (DO bit).
	m.SetEdns0(4096, true)

	c := new(dns.Client)

	if resolverAddr == "" {
		// Try system resolver; fall back to 8.8.8.8 (e.g. on Windows).
		config, err := dns.ClientConfigFromFile(resolverConfigPath())
		if err != nil || len(config.Servers) == 0 {
			slog.Debug("dns: system resolver unavailable, using 8.8.8.8:53", "error", err)
			resolverAddr = "8.8.8.8:53"
		} else {
			resolverAddr = net.JoinHostPort(config.Servers[0], config.Port)
		}
	}

	// Ensure host:port format.
	if _, _, err := net.SplitHostPort(resolverAddr); err != nil {
		resolverAddr = net.JoinHostPort(resolverAddr, "53")
	}

	r, _, err := c.Exchange(m, resolverAddr)
	if err != nil {
		return nil, "", fmt.Errorf("dns: exchange: %w", err)
	}
	if r.Rcode != dns.RcodeSuccess {
		return nil, "", fmt.Errorf("dns: rcode %s", dns.RcodeToString[r.Rcode])
	}

	trust := TrustDNS
	if r.AuthenticatedData {
		trust = TrustDNSSEC
	}

	var records []Record
	for _, rr := range r.Answer {
		txt, ok := rr.(*dns.TXT)
		if !ok {
			continue
		}
		// TXT records may be split into 255-byte strings; join them.
		joined := strings.Join(txt.Txt, "")
		rec, err := ParseRecord(joined)
		if err != nil {
			continue
		}
		records = append(records, rec)
	}

	return records, trust, nil
}
