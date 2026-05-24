package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"runtime/debug"
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

// buildVersion can be overridden at build time:
//
//	go build -ldflags "-X main.buildVersion=v0.0.5"
var buildVersion = "dev"

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

	version := resolvedVersion()
	powFactorMailSend := cfg.PoWDifficultyFactorMailSend
	if powFactorMailSend < 1 {
		powFactorMailSend = 1
	}
	powDifficultySend := cfg.PoWDifficulty * powFactorMailSend
	slog.Debug("configuration loaded",
		"config_file", *configPath,
		"version", version,
		"listen_addr", cfg.ListenAddr,
		"pow_difficulty", cfg.PoWDifficulty,
		"pow_difficulty_factor_mail_send", powFactorMailSend,
		"pow_difficulty_send", powDifficultySend,
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
	powLookupMiddleware := api.PoWMiddleware(cfg.PoWDifficulty, cfg.PoWValiditySeconds, cache)
	powSendMiddleware := api.PoWMiddleware(powDifficultySend, cfg.PoWValiditySeconds, cache)

	mux := http.NewServeMux()

	// Health endpoints — NOT behind PoW.
	mux.HandleFunc("/healthz", api.HealthHandler)
	mux.HandleFunc("/health", api.HealthHandler)

	// API endpoints — behind PoW middleware.
	mux.Handle("/api/lookup", powLookupMiddleware(lookupHandler))
	mux.Handle("/api/send", powSendMiddleware(sendHandler))

	// Static frontend — served from embedded FS.
	// Inject PoW difficulty into index.html at startup.
	distFS, err := fs.Sub(web.DistFS, "dist")
	if err != nil {
		slog.Error("failed to open embedded web/dist", "error", err)
		os.Exit(1)
	}
	indexHTML := injectRuntimeValues(distFS, cfg.PoWDifficulty, powDifficultySend, version)
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
	handler := api.CSPMiddleware(api.CORSMiddleware(cfg.CORSAllowedOrigins)(mux))

	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	slog.Info("agemail starting",
		"version", version,
		"addr", cfg.ListenAddr,
		"pow_difficulty", cfg.PoWDifficulty,
		"pow_difficulty_factor_mail_send", powFactorMailSend,
		"pow_difficulty_send", powDifficultySend,
		"pow_validity_s", cfg.PoWValiditySeconds,
	)
	if err := server.ListenAndServe(); err != nil {
		slog.Error("server failed", "error", err)
		os.Exit(1)
	}
}

// injectRuntimeValues reads index.html from the embedded FS and injects
// runtime placeholders for PoW difficulty and app version.
func injectRuntimeValues(distFS fs.FS, difficultyLookup int, difficultySend int, version string) []byte {
	data, err := fs.ReadFile(distFS, "index.html")
	if err != nil {
		slog.Warn("could not read index.html for runtime injection", "error", err)
		return []byte(fmt.Sprintf(`<!DOCTYPE html><html><body>agemail — index.html not found (%v)</body></html>`, err))
	}
	html := string(data)
	html = strings.ReplaceAll(html, "__POW_DIFFICULTY__", strconv.Itoa(difficultyLookup))
	html = strings.ReplaceAll(html, "__POW_DIFFICULTY_SEND__", strconv.Itoa(difficultySend))
	html = strings.ReplaceAll(html, "__APP_VERSION__", version)
	slog.Debug("index.html runtime values injected", "difficulty_lookup", difficultyLookup, "difficulty_send", difficultySend, "version", version)
	return []byte(html)
}

func resolvedVersion() string {
	if buildVersion != "" && buildVersion != "dev" {
		return buildVersion
	}
	if bi, ok := debug.ReadBuildInfo(); ok {
		if bi.Main.Version != "" && bi.Main.Version != "(devel)" {
			return bi.Main.Version
		}
	}
	if buildVersion != "" {
		return buildVersion
	}
	return "dev"
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
