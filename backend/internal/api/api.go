package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/kalfian/portstellar/internal/config"
	"github.com/kalfian/portstellar/internal/db"
	"github.com/kalfian/portstellar/internal/ping"
	"github.com/kalfian/portstellar/internal/ws"
)

type Handler struct {
	mux            *http.ServeMux
	portsFile      string
	store          *db.Store
	dispatcher     *ping.Dispatcher
	hub            *ws.Hub
	bootTime       time.Time
	configFileModN atomic.Int64
}

func NewHandler(portsFile string, store *db.Store, staticDir string, dispatcher *ping.Dispatcher, hub *ws.Hub) *Handler {
	h := &Handler{
		mux:        http.NewServeMux(),
		portsFile:  portsFile,
		store:      store,
		dispatcher: dispatcher,
		hub:        hub,
		bootTime:   time.Now(),
	}

	if loaded, err := config.Load(portsFile); err != nil {
		slog.Warn("initial config apply skipped", "err", err)
	} else if err := h.applyLoadedConfig(context.Background(), loaded); err != nil {
		slog.Warn("initial config apply skipped", "err", err)
	}

	h.mux.HandleFunc("GET /api/config", h.getConfig)
	h.mux.HandleFunc("GET /api/pings/latest", h.getPingsLatest)
	h.mux.HandleFunc("GET /api/pings/history", h.getPingsHistory)
	h.mux.HandleFunc("GET /api/health", h.health)
	h.mux.HandleFunc("POST /api/auth/login", h.login)

	h.mux.HandleFunc("GET /api/auth/me", h.withAuth(h.authMe))
	h.mux.HandleFunc("POST /api/auth/change-password", h.withAuth(h.changePassword))
	h.mux.HandleFunc("GET /api/admin/config", h.withAuth(h.adminGetConfig))
	h.mux.HandleFunc("PUT /api/admin/config", h.withAuth(h.adminPutConfig))

	h.mux.HandleFunc("GET /api/services/{id}/settings", h.getServiceSettings)
	h.mux.HandleFunc("PUT /api/services/{id}/settings", h.withAuth(h.putServiceSettings))
	h.mux.HandleFunc("GET /api/services/{id}/stats", h.getServiceStats)

	h.mux.HandleFunc("GET /api/ws", h.serveWS)

	// Static file serving with SPA fallback
	h.mux.Handle("/", newSPAHandler(staticDir))

	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	corsMiddleware(h.mux).ServeHTTP(w, r)
}

func (h *Handler) ReloadConfigFromFile(ctx context.Context) error {
	loaded, err := config.Load(h.portsFile)
	if err != nil {
		return err
	}
	return h.applyLoadedConfig(ctx, loaded)
}

func (h *Handler) applyLoadedConfig(ctx context.Context, cfg *config.Config) error {
	active := cfg.FlatServices()
	ids := make([]string, 0, len(active))
	for _, svc := range active {
		ids = append(ids, svc.ID)
	}
	if removed, err := h.store.ReconcileServices(ctx, ids); err != nil {
		return err
	} else if removed > 0 {
		slog.Info("reconciled sqlite services", "deletedRows", removed)
	}
	h.dispatcher.UpdateConfig(cfg)
	h.hub.Publish(ws.Message{Type: ws.TypeConfigUpdated})
	return nil
}

func (h *Handler) WatchConfigFile(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = 2 * time.Second
	}
	st, err := os.Stat(h.portsFile)
	if err != nil {
		slog.Warn("config watcher disabled", "err", err)
		return
	}
	lastMod := st.ModTime()
	if tracked := h.configFileModTime(); tracked.After(lastMod) {
		lastMod = tracked
	}
	h.setConfigFileModTime(lastMod)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if tracked := h.configFileModTime(); tracked.After(lastMod) {
				lastMod = tracked
			}
			current, err := os.Stat(h.portsFile)
			if err != nil {
				slog.Warn("config watcher stat failed", "err", err)
				continue
			}
			if !current.ModTime().After(lastMod) {
				continue
			}
			modTime := current.ModTime()
			if err := h.ReloadConfigFromFile(ctx); err != nil {
				lastMod = modTime
				h.setConfigFileModTime(lastMod)
				slog.Warn("config watcher reload failed", "err", err)
				continue
			}
			lastMod = modTime
			h.setConfigFileModTime(lastMod)
			slog.Info("config watcher applied services.json", "path", h.portsFile)
		}
	}
}

func (h *Handler) setConfigFileModTime(t time.Time) {
	h.configFileModN.Store(t.UnixNano())
}

func (h *Handler) configFileModTime() time.Time {
	if n := h.configFileModN.Load(); n > 0 {
		return time.Unix(0, n)
	}
	return time.Time{}
}

func (h *Handler) getConfig(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(h.portsFile)
	if err != nil {
		slog.Error("read ports file", "err", err)
		http.Error(w, "failed to read config", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func (h *Handler) getPingsLatest(w http.ResponseWriter, r *http.Request) {
	states, err := h.store.LatestStates(r.Context())
	if err != nil {
		slog.Error("get latest states", "err", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	if states == nil {
		states = []db.ServiceState{}
	}
	writeJSON(w, states)
}

func (h *Handler) getPingsHistory(w http.ResponseWriter, r *http.Request) {
	serviceID := r.URL.Query().Get("service")
	if serviceID == "" {
		http.Error(w, "missing ?service= parameter", http.StatusBadRequest)
		return
	}

	// Default: last 24 hours
	rangeStr := r.URL.Query().Get("range")
	sinceMs := time.Now().Add(-24 * time.Hour).UnixMilli()

	if rangeStr != "" {
		hours, err := strconv.Atoi(rangeStr)
		if err == nil && hours > 0 {
			sinceMs = time.Now().Add(-time.Duration(hours) * time.Hour).UnixMilli()
		}
	}

	points, err := h.store.History(r.Context(), serviceID, sinceMs)
	if err != nil {
		slog.Error("get history", "err", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	if points == nil {
		points = []db.HistoryPoint{}
	}
	writeJSON(w, points)
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]any{
		"status":   "ok",
		"uptime":   time.Since(h.bootTime).String(),
		"lastTick": h.dispatcher.LastTick(),
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("write json", "err", err)
	}
}

// corsMiddleware allows all origins (dev-friendly).
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
