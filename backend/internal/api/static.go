package api

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// spaHandler serves static files and falls back to index.html for SPA routing.
type spaHandler struct {
	dir string
}

func newSPAHandler(dir string) http.Handler {
	return &spaHandler{dir: dir}
}

func (h *spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// Clean the path
	p := filepath.Clean(r.URL.Path)
	if p == "/" {
		p = "/index.html"
	}

	// Don't serve API paths here
	if strings.HasPrefix(p, "/api/") {
		http.NotFound(w, r)
		return
	}

	fullPath := filepath.Join(h.dir, p)

	// Check if file exists
	info, err := os.Stat(fullPath)
	if err != nil || info.IsDir() {
		// SPA fallback: serve index.html
		http.ServeFile(w, r, filepath.Join(h.dir, "index.html"))
		return
	}

	http.ServeFile(w, r, fullPath)
}
