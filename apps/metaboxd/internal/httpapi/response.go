package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

func writeJSON(log *slog.Logger, w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(body); err != nil {
		// Статус уже ушёл клиенту, вернуть ошибку некуда.
		log.Error("ответ не дописан", "err", err)
	}
}
