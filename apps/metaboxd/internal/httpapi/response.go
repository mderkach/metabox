package httpapi

import (
	"encoding/json"
	"log/slog"
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

func writeJSON(log *slog.Logger, w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(body); err != nil {
		// Статус уже ушёл клиенту, вернуть ошибку некуда.
		log.Error("ответ не дописан", "err", err)
	}
}
