package api

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"

	"github.com/kalfian/portstellar/internal/db"
)

type meshPositionsBody struct {
	Hosts    map[string]db.Position `json:"hosts"`
	Services map[string]db.Position `json:"services"`
}

func (h *Handler) getMeshPositions(w http.ResponseWriter, r *http.Request) {
	meshID := strings.TrimSpace(r.PathValue("mesh"))
	if meshID == "" {
		http.Error(w, "missing mesh id", http.StatusBadRequest)
		return
	}
	positions, err := h.store.GetMeshPositions(r.Context(), meshID)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, positions)
}

func (h *Handler) putMeshPositions(w http.ResponseWriter, r *http.Request) {
	meshID := strings.TrimSpace(r.PathValue("mesh"))
	if meshID == "" {
		http.Error(w, "missing mesh id", http.StatusBadRequest)
		return
	}

	var body meshPositionsBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}
	if body.Hosts == nil {
		body.Hosts = map[string]db.Position{}
	}
	if body.Services == nil {
		body.Services = map[string]db.Position{}
	}
	if err := validatePosMap(body.Hosts); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validatePosMap(body.Services); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.store.ReplaceMeshPositions(r.Context(), meshID, body.Hosts, body.Services); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	positions, err := h.store.GetMeshPositions(r.Context(), meshID)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, positions)
}

func validatePosMap(m map[string]db.Position) error {
	for id, p := range m {
		if strings.TrimSpace(id) == "" {
			return errBadRequest("position id cannot be empty")
		}
		if math.IsNaN(p.X) || math.IsInf(p.X, 0) || math.IsNaN(p.Y) || math.IsInf(p.Y, 0) {
			return errBadRequest("position x/y must be finite numbers")
		}
	}
	return nil
}

type badRequest string

func (e badRequest) Error() string { return string(e) }

func errBadRequest(msg string) error { return badRequest(msg) }
