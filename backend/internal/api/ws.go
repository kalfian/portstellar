package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/kalfian/portstellar/internal/ws"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  512,
	WriteBufferSize: 4096,
	// Allow all origins in dev; in production put real origin check here.
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *Handler) serveWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade already wrote an error response.
		return
	}
	defer conn.Close()

	// Register this client with the hub; unregister on return.
	send := make(chan []byte, 64)
	unregister := h.hub.Register(send)
	defer unregister()

	// Send immediate connected acknowledgement.
	ack, _ := json.Marshal(ws.Message{Type: ws.TypeConnected})
	_ = conn.WriteMessage(websocket.TextMessage, ack)

	// Write pump: relay hub messages to the WebSocket connection.
	go func() {
		defer conn.Close()
		for msg := range send {
			_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// Read pump: keep the connection alive by consuming frames.
	// We don't expect any meaningful client-to-server messages; pong handling
	// extends the read deadline so the connection stays open.
	conn.SetReadLimit(512)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}
