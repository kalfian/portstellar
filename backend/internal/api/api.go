package api

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/kalfian/portstellar/internal/db"
	"github.com/kalfian/portstellar/internal/ping"
	"github.com/kalfian/portstellar/internal/ws"
)

type Handler struct {
	mux        *http.ServeMux
	portsFile  string
	store      *db.Store
	dispatcher *ping.Dispatcher
	hub        *ws.Hub
	bootTime   time.Time
}

func NewHandler(portsFile string, store *db.Store, staticDir string, dispatcher *ping.Dispatcher, hub *ws.Hub) http.Handler {
	h := &Handler{
		mux:        http.NewServeMux(),
		portsFile:  portsFile,
		store:      store,
		dispatcher: dispatcher,
		hub:        hub,
		bootTime:   time.Now(),
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

	return corsMiddleware(h.mux)
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
