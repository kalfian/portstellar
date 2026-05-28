package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/kalfian/portstellar/internal/config"
	"github.com/kalfian/portstellar/internal/ws"
)

func (h *Handler) adminGetConfig(w http.ResponseWriter, r *http.Request) {
	h.getConfig(w, r)
}

func (h *Handler) adminPutConfig(w http.ResponseWriter, r *http.Request) {
	var cfg config.Config
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if len(cfg.Hosts) == 0 {
		http.Error(w, "hosts cannot be empty", http.StatusBadRequest)
		return
	}
	if len(cfg.Categories) == 0 {
		http.Error(w, "categories cannot be empty", http.StatusBadRequest)
		return
	}
	for _, host := range cfg.Hosts {
		if host.ID == "" || host.Name == "" || host.IP == "" {
			http.Error(w, "host id/name/ip required", http.StatusBadRequest)
			return
		}
	}

	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		http.Error(w, "marshal error", http.StatusInternalServerError)
		return
	}
	if err := atomicWrite(h.portsFile, raw); err != nil {
		http.Error(w, "failed to write config", http.StatusInternalServerError)
		return
	}

	loaded, err := config.Load(h.portsFile)
	if err != nil {
		http.Error(w, "config saved but reload failed", http.StatusInternalServerError)
		return
	}
	h.dispatcher.UpdateConfig(loaded)
	h.hub.Publish(ws.Message{Type: ws.TypeConfigUpdated})
	writeJSON(w, map[string]any{"ok": true, "savedAt": time.Now().UnixMilli()})
}

func atomicWrite(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp := filepath.Join(dir, ".ports.json.tmp")
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("rename tmp file: %w", err)
	}
	return nil
}
