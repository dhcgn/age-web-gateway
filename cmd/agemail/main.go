package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/dhcgn/age-web-gateway/internal/api"
	"github.com/dhcgn/age-web-gateway/internal/config"
	"github.com/dhcgn/age-web-gateway/internal/lookup"
	"github.com/dhcgn/age-web-gateway/internal/mail"
	"github.com/dhcgn/age-web-gateway/internal/pow"
	"github.com/dhcgn/age-web-gateway/web"
)

func main() {
	configPath := flag.String("config", "", "path to JSON config file (optional, env vars override)")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "fatal: %v\n", err)
		os.Exit(1)
	}

	// Set up structured logger.
	logLevel := parseLogLevel(cfg.LogLevel)
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)

	slog.Debug("configuration loaded",
		"config_file", *configPath,
		"listen_addr", cfg.ListenAddr,
		"pow_difficulty", cfg.PoWDifficulty,
		"pow_validity_s", cfg.PoWValiditySeconds,
		"smtp_host", cfg.SMTPHost,
		"smtp_port", cfg.SMTPPort,
		"log_level", cfg.LogLevel,
	)

	// PoW replay cache: TTL = 2× validity.
	replayTTL := 2 * cfg.PoWValidity()
	cache := pow.NewReplayCache(replayTTL)
	defer cache.Close()

	// Services.
	lookupSvc := &lookup.Service{
		DNSResolver:      cfg.DNSResolver,
		WellknownTimeout: cfg.WellknownTimeout,
	}

	var mailSvc mail.Sender
	var mailFrom string
	switch cfg.MailBackend {
	case "cloudflare":
		mailSvc = &mail.CloudflareService{
			AccountID: cfg.CFAccountID,
			APIToken:  cfg.CFAPIToken,
			FromAddr:  cfg.CFFrom,
		}
		mailFrom = cfg.CFFrom
		slog.Info("mail backend: cloudflare", "account_id", cfg.CFAccountID, "from", cfg.CFFrom)
	default:
		mailSvc = &mail.Service{
			Host: cfg.SMTPHost,
			Port: cfg.SMTPPort,
			User: cfg.SMTPUser,
			Pass: cfg.SMTPPass,
			From: cfg.SMTPFrom,
		}
		mailFrom = cfg.SMTPFrom
		slog.Info("mail backend: smtp", "host", cfg.SMTPHost, "port", cfg.SMTPPort, "from", cfg.SMTPFrom)
	}

	// API handlers.
	lookupHandler := &api.LookupHandler{LookupService: lookupSvc}
	sendHandler := &api.SendHandler{LookupService: lookupSvc, MailService: mailSvc, From: mailFrom}
	powMiddleware := api.PoWMiddleware(cfg.PoWDifficulty, cfg.PoWValiditySeconds, cache)

	mux := http.NewServeMux()

	// Health endpoints — NOT behind PoW.
	mux.HandleFunc("/healthz", api.HealthHandler)
	mux.HandleFunc("/health", api.HealthHandler)

	// API endpoints — behind PoW middleware.
	mux.Handle("/api/lookup", powMiddleware(lookupHandler))
	mux.Handle("/api/send", powMiddleware(sendHandler))

	// Static frontend — served from embedded FS.
	// Inject PoW difficulty into index.html at startup.
	distFS, err := fs.Sub(web.DistFS, "dist")
	if err != nil {
		slog.Error("failed to open embedded web/dist", "error", err)
		os.Exit(1)
	}
	indexHTML := injectPowDifficulty(distFS, cfg.PoWDifficulty)
	staticHandler := http.FileServer(http.FS(distFS))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Serve injected index.html for root and any non-file paths.
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(indexHTML)
			return
		}
		staticHandler.ServeHTTP(w, r)
	})

	// Wrap everything with security headers.
	handler := api.CSPMiddleware(api.CORSMiddleware(mux))

	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	slog.Info("agemail starting",
		"addr", cfg.ListenAddr,
		"pow_difficulty", cfg.PoWDifficulty,
		"pow_validity_s", cfg.PoWValiditySeconds,
	)
	if err := server.ListenAndServe(); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}

// injectPowDifficulty reads index.html from the embedded FS and replaces
// the pow-difficulty meta tag content with the configured value.
func injectPowDifficulty(distFS fs.FS, difficulty int) []byte {
	data, err := fs.ReadFile(distFS, "index.html")
	if err != nil {
		slog.Warn("could not read index.html for PoW injection", "error", err)
		return []byte(fmt.Sprintf(`<!DOCTYPE html><html><body>agemail — index.html not found (%v)</body></html>`, err))
	}
	html := string(data)
	html = strings.Replace(html,
		`content="4"`,
		`content="`+strconv.Itoa(difficulty)+`"`,
		1)
	slog.Debug("index.html PoW difficulty injected", "difficulty", difficulty)
	return []byte(html)
}

func parseLogLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
