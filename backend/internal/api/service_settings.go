package api

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/kalfian/portstellar/internal/db"
)

func (h *Handler) getServiceSettings(w http.ResponseWriter, r *http.Request) {
	serviceID := r.PathValue("id")
	if serviceID == "" {
		http.Error(w, "missing service id", http.StatusBadRequest)
		return
	}
	setting, err := h.store.GetServiceSetting(r.Context(), serviceID)
	if err != nil {
		slog.Error("get service setting", "service", serviceID, "err", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, setting)
}

func (h *Handler) putServiceSettings(w http.ResponseWriter, r *http.Request) {
	serviceID := r.PathValue("id")
	if serviceID == "" {
		http.Error(w, "missing service id", http.StatusBadRequest)
		return
	}

	var body struct {
		HeartbeatMs int `json:"heartbeatMs"`
		MaxRetries  int `json:"maxRetries"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if body.HeartbeatMs < 5000 {
		http.Error(w, "heartbeatMs must be >= 5000", http.StatusBadRequest)
		return
	}
	if body.MaxRetries < 0 || body.MaxRetries > 10 {
		http.Error(w, "maxRetries must be between 0 and 10", http.StatusBadRequest)
		return
	}

	setting := db.ServiceSetting{
		ServiceID:   serviceID,
		HeartbeatMs: body.HeartbeatMs,
		MaxRetries:  body.MaxRetries,
	}
	if err := h.store.UpsertServiceSetting(r.Context(), setting); err != nil {
		slog.Error("upsert service setting", "service", serviceID, "err", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, setting)
}

func (h *Handler) getServiceStats(w http.ResponseWriter, r *http.Request) {
	serviceID := r.PathValue("id")
	if serviceID == "" {
		http.Error(w, "missing service id", http.StatusBadRequest)
		return
	}
	stats, err := h.store.GetServiceStats(r.Context(), serviceID)
	if err != nil {
		slog.Error("get service stats", "service", serviceID, "err", err)
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, stats)
}
