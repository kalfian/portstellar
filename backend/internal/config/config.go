package config

import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	Name           string     `json:"name"`
	PingIntervalMs int        `json:"pingIntervalMs"`
	Hosts          []Host     `json:"hosts"`
	Categories     []Category `json:"categories"`
}

type Host struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	IP       string    `json:"ip"`
	Note     string    `json:"note,omitempty"`
	Services []Service `json:"services,omitempty"`
}

type Service struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Port        int      `json:"port"`
	Protocol    string   `json:"protocol,omitempty"`
	Category    string   `json:"category,omitempty"`
	URL         string   `json:"url,omitempty"`
	Description string   `json:"description,omitempty"`
	Tags        []string `json:"tags,omitempty"`

	// Probe override: type can be "http", "tcp", "icmp"
	Probe *ProbeConfig `json:"probe,omitempty"`
}

type ProbeConfig struct {
	Type string `json:"type"` // "http" | "tcp" | "icmp"
}

type Category struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Color string `json:"color"`
}

// FlatService is a service with its host ID baked in, used by the dispatcher.
type FlatService struct {
	ID       string // "hostID-serviceID"
	HostID   string
	HostIP   string
	Name     string
	Port     int
	Protocol string
	URL      string
	Probe    *ProbeConfig
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	// Defaults
	if cfg.Name == "" {
		cfg.Name = "Home Server"
	}
	if cfg.PingIntervalMs <= 0 {
		cfg.PingIntervalMs = 30000
	}
	return &cfg, nil
}

// ServiceCount returns total services across all hosts.
func (c *Config) ServiceCount() int {
	n := 0
	for _, h := range c.Hosts {
		n += len(h.Services)
	}
	return n
}

// FlatServices returns all services flattened with host info.
func (c *Config) FlatServices() []FlatService {
	var out []FlatService
	for _, h := range c.Hosts {
		for _, s := range h.Services {
			out = append(out, FlatService{
				ID:       h.ID + "-" + s.ID,
				HostID:   h.ID,
				HostIP:   h.IP,
				Name:     s.Name,
				Port:     s.Port,
				Protocol: s.Protocol,
				URL:      s.URL,
				Probe:    s.Probe,
			})
		}
	}
	return out
}
