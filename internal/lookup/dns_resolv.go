//go:build !windows

package lookup

func resolverConfigPath() string {
	return "/etc/resolv.conf"
}
