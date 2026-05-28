package ws

import (
	"encoding/json"
	"sync"
)

// Message types sent to clients.
const (
	TypePingResult    = "ping_result"
	TypeConfigUpdated = "config_updated"
	TypeConnected     = "connected"
)

// Message is the JSON envelope pushed to WebSocket clients.
type Message struct {
	Type      string `json:"type"`
	ServiceID string `json:"serviceId,omitempty"`
	OK        *bool  `json:"ok,omitempty"`
	LatencyMs *int   `json:"latencyMs,omitempty"`
	ErrorMsg  string `json:"errorMsg,omitempty"`
	Ts        int64  `json:"ts,omitempty"`
}

// Hub manages all active WebSocket client channels. It runs in a single
// goroutine to avoid lock contention on the broadcast path.
type Hub struct {
	mu         sync.RWMutex
	clients    map[chan []byte]bool
	broadcast  chan []byte
	register   chan chan []byte
	unregister chan chan []byte
}

// NewHub constructs a Hub ready to be started with Run.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[chan []byte]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan chan []byte),
		unregister: make(chan chan []byte),
	}
}

// Run is the hub's main event loop. Call it in its own goroutine.
func (h *Hub) Run() {
	for {
		select {
		case ch := <-h.register:
			h.mu.Lock()
			h.clients[ch] = true
			h.mu.Unlock()

		case ch := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[ch]; ok {
				delete(h.clients, ch)
				close(ch)
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			h.mu.RLock()
			for ch := range h.clients {
				select {
				case ch <- msg:
				default:
					// slow client — skip, don't block the hub
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Register adds a client send channel to the hub. The returned function must be
// called (typically via defer) to unregister and close the channel.
func (h *Hub) Register(ch chan []byte) func() {
	h.register <- ch
	return func() { h.unregister <- ch }
}

// Publish marshals msg and enqueues it for broadcast to all connected clients.
func (h *Hub) Publish(msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case h.broadcast <- data:
	default:
		// broadcast channel full — drop
	}
}

// ClientCount returns the number of currently registered clients.
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
