package lookup

import (
	"fmt"
	"log/slog"
	"net"
	"strings"

	"github.com/miekg/dns"
)

// unescapeTXT decodes BIND-style escapes that miekg/dns puts into TXT
// presentation strings: \DDD (3-digit decimal byte), \\ for backslash,
// and \" for double-quote. Unknown sequences are passed through verbatim.
func unescapeTXT(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); {
		if s[i] == '\\' && i+1 < len(s) {
			next := s[i+1]
			if isDigit(next) && i+3 < len(s) && isDigit(s[i+2]) && isDigit(s[i+3]) {
				d := int(next-'0')*100 + int(s[i+2]-'0')*10 + int(s[i+3]-'0')
				if d <= 255 {
					b.WriteByte(byte(d))
					i += 4
					continue
				}
			}
			if next == '\\' || next == '"' {
				b.WriteByte(next)
				i += 2
				continue
			}
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }

// DNSLookup queries _age.<domain> TXT records for age key entries.
// resolverAddr is optional (e.g. "8.8.8.8:53"); empty means system default.
// It also returns any parse failures encountered, so callers can warn the
// user about malformed published records.
func DNSLookup(domain, resolverAddr string) ([]Record, TrustLevel, []ParseFailure, error) {
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
		return nil, "", nil, fmt.Errorf("dns: exchange: %w", err)
	}
	if r.Rcode != dns.RcodeSuccess {
		return nil, "", nil, fmt.Errorf("dns: rcode %s", dns.RcodeToString[r.Rcode])
	}

	trust := TrustDNS
	if r.AuthenticatedData {
		trust = TrustDNSSEC
	}

	var records []Record
	var failures []ParseFailure
	for _, rr := range r.Answer {
		txt, ok := rr.(*dns.TXT)
		if !ok {
			continue
		}
		// TXT records may be split into 255-byte strings; join them.
		// A single TXT may also bundle multiple age records separated by newlines
		// (some operators publish all entries in one TXT instead of multiple).
		// miekg/dns hands us the presentation form, where control bytes are
		// encoded as \DDD decimal escapes (e.g. real LF -> the 4-char string "\010").
		joined := unescapeTXT(strings.Join(txt.Txt, ""))
		recs, fails := ParseRecordsAndFailures(joined)
		records = append(records, recs...)
		failures = append(failures, fails...)
	}

	return records, trust, failures, nil
}
