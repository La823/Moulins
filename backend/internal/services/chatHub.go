package services

import (
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ChatHub tracks live WebSocket connections per user so incoming messages
// can be pushed instantly to whoever is online, without polling. A user can
// have multiple connections (e.g. web + mobile open at once).
type ChatHub struct {
	mu    sync.RWMutex
	conns map[uuid.UUID]map[*websocket.Conn]bool
}

func NewChatHub() *ChatHub {
	return &ChatHub{conns: make(map[uuid.UUID]map[*websocket.Conn]bool)}
}

func (h *ChatHub) Register(userID uuid.UUID, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.conns[userID] == nil {
		h.conns[userID] = make(map[*websocket.Conn]bool)
	}
	h.conns[userID][conn] = true
}

func (h *ChatHub) Unregister(userID uuid.UUID, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conns, ok := h.conns[userID]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(h.conns, userID)
		}
	}
}

func (h *ChatHub) IsOnline(userID uuid.UUID) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.conns[userID]) > 0
}

// SendToUser writes a JSON payload to every live connection for a user.
// Dead connections are dropped silently — the client will reconnect and
// re-fetch history via REST.
func (h *ChatHub) SendToUser(userID uuid.UUID, payload interface{}) {
	h.mu.RLock()
	conns := make([]*websocket.Conn, 0, len(h.conns[userID]))
	for c := range h.conns[userID] {
		conns = append(conns, c)
	}
	h.mu.RUnlock()

	for _, c := range conns {
		_ = c.WriteJSON(payload)
	}
}
