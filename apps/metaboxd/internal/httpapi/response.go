package httpapi

import (
	"encoding/json"
	"net/http"
)

// APIError — единый формат отказа на границе HTTP. Внутренние подробности —
// пути на диске, аргументы команд, содержимое конфига — в него не попадают;
// Details несёт только то, что показывают пользователю.
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details any    `json:"details,omitempty"`
}

func (s *Server) writeJSON(w http.ResponseWriter, r *http.Request, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(body); err != nil {
		// Статус уже ушёл клиенту, вернуть ошибку некуда.
		s.log.ErrorContext(r.Context(), "ответ не дописан", "err", err, "path", r.URL.Path)
	}
}

func (s *Server) writeError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	s.writeJSON(w, r, status, APIError{Code: code, Message: message})
}
