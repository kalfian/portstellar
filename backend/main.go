package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/kalfian/portstellar/internal/api"
	"github.com/kalfian/portstellar/internal/config"
	"github.com/kalfian/portstellar/internal/db"
	"github.com/kalfian/portstellar/internal/ping"
	"github.com/kalfian/portstellar/internal/ws"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	slog.Info("portstellar starting")

	portsFile := env("PORTS_FILE", "ports.json")
	dbFile := env("DB_FILE", "portstellar.db")
	staticDir := env("STATIC_DIR", "../dist")
	listenAddr := env("LISTEN_ADDR", ":8080")

	// Load config
	cfg, err := config.Load(portsFile)
	if err != nil {
		slog.Error("failed to load config", "err", err)
		os.Exit(1)
	}
	slog.Info("config loaded", "hosts", len(cfg.Hosts), "services", cfg.ServiceCount(), "interval", cfg.PingIntervalMs)

	// Open DB
	store, err := db.Open(dbFile)
	if err != nil {
		slog.Error("failed to open database", "err", err)
		os.Exit(1)
	}
	defer store.Close()
	slog.Info("database ready", "path", dbFile)

	// Context with signal cancellation
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// WebSocket hub — must be started before the dispatcher and handler.
	hub := ws.NewHub()
	go hub.Run()
	slog.Info("websocket hub started")

	// Start ping dispatcher
	dispatcher := ping.NewDispatcher(cfg, store, func(serviceID string, ok bool, latencyMs int, errMsg string, ts int64) {
		hub.Publish(ws.Message{
			Type:      ws.TypePingResult,
			ServiceID: serviceID,
			OK:        &ok,
			LatencyMs: &latencyMs,
			ErrorMsg:  errMsg,
			Ts:        ts,
		})
	})
	go dispatcher.Run(ctx)
	slog.Info("ping dispatcher started")

	// HTTP server
	handler := api.NewHandler(portsFile, store, staticDir, dispatcher, hub)
	srv := &http.Server{
		Addr:         listenAddr,
		Handler:      handler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		slog.Info("listening", "addr", listenAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			cancel()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down…")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "err", err)
	}
	slog.Info("bye")
}
