//go:build windows

package lookup

func resolverConfigPath() string {
	// On Windows, dns.ClientConfigFromFile doesn't work well.
	// We return a dummy path — callers should provide DNS_RESOLVER explicitly,
	// or we fall back to a public resolver.
	return "NUL"
}
