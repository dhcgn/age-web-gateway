package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all runtime configuration.
// Loaded from: defaults → config file → environment variables (highest priority).
type Config struct {
	ListenAddr string `json:"listen_addr"`

	SMTPHost string `json:"smtp_host"`
	SMTPPort int    `json:"smtp_port"`
	SMTPUser string `json:"smtp_user"`
	SMTPPass string `json:"smtp_pass"`
	SMTPFrom string `json:"smtp_from"`

	PoWDifficulty      int `json:"pow_difficulty"`
	PoWValiditySeconds int `json:"pow_validity_seconds"`

	DNSResolver             string `json:"dns_resolver"`
	WellknownTimeoutSeconds int    `json:"wellknown_timeout_seconds"`

	LogLevel string `json:"log_level"` // "debug", "info", "warn", "error"

	// Mail backend: "smtp" (default) or "cloudflare".
	MailBackend string `json:"mail_backend"`

	// Cloudflare Email API — used when MailBackend == "cloudflare".
	CFAccountID string `json:"cf_account_id"`
	CFAPIToken  string `json:"cf_api_token"`
	CFFrom      string `json:"cf_from"`

	WellknownTimeout time.Duration `json:"-"`
}

// Load reads configuration with precedence: defaults → config file → env vars.
// configPath may be empty (no file loaded).
func Load(configPath string) (Config, error) {
	cfg := defaults()

	if configPath != "" {
		if err := cfg.loadFile(configPath); err != nil {
			return cfg, fmt.Errorf("config file %s: %w", configPath, err)
		}
	}

	cfg.applyEnv()
	cfg.WellknownTimeout = time.Duration(cfg.WellknownTimeoutSeconds) * time.Second

	return cfg, nil
}

func defaults() Config {
	return Config{
		ListenAddr:              ":8080",
		SMTPHost:                "localhost",
		SMTPPort:                587,
		SMTPFrom:                "noreply@localhost",
		MailBackend:             "smtp",
		PoWDifficulty:           4,
		PoWValiditySeconds:      60,
		WellknownTimeoutSeconds: 5,
		LogLevel:                "info",
	}
}

func (c *Config) loadFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, c)
}

func (c *Config) applyEnv() {
	if v := os.Getenv("LISTEN_ADDR"); v != "" {
		c.ListenAddr = v
	}
	if v := os.Getenv("SMTP_HOST"); v != "" {
		c.SMTPHost = v
	}
	if v, err := strconv.Atoi(os.Getenv("SMTP_PORT")); err == nil {
		c.SMTPPort = v
	}
	if v := os.Getenv("SMTP_USER"); v != "" {
		c.SMTPUser = v
	}
	if v := os.Getenv("SMTP_PASS"); v != "" {
		c.SMTPPass = v
	}
	if v := os.Getenv("SMTP_FROM"); v != "" {
		c.SMTPFrom = v
	}
	if v, err := strconv.Atoi(os.Getenv("POW_DIFFICULTY")); err == nil {
		c.PoWDifficulty = v
	}
	if v, err := strconv.Atoi(os.Getenv("POW_VALIDITY_SECONDS")); err == nil {
		c.PoWValiditySeconds = v
	}
	if v := os.Getenv("DNS_RESOLVER"); v != "" {
		c.DNSResolver = v
	}
	if v, err := strconv.Atoi(os.Getenv("WELLKNOWN_TIMEOUT_SECONDS")); err == nil {
		c.WellknownTimeoutSeconds = v
	}
	if v := os.Getenv("LOG_LEVEL"); v != "" {
		c.LogLevel = v
	}
	if v := os.Getenv("MAIL_BACKEND"); v != "" {
		c.MailBackend = v
	}
	if v := os.Getenv("CF_ACCOUNT_ID"); v != "" {
		c.CFAccountID = v
	}
	if v := os.Getenv("CF_API_TOKEN"); v != "" {
		c.CFAPIToken = v
	}
	if v := os.Getenv("CF_FROM"); v != "" {
		c.CFFrom = v
	}
}

func (c Config) PoWValidity() time.Duration {
	return time.Duration(c.PoWValiditySeconds) * time.Second
}
