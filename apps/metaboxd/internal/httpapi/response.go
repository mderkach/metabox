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
		// The status has already gone to the client, there is nowhere to return the error.
		log.Error("response not fully written", "err", err)
	}
}
