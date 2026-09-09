package httpapi

import (
	"log/slog"
	"testing"
)

// testLogger уводит записи слоя в вывод теста: при падении видно, что демон
// успел залогировать.
func testLogger(t *testing.T) *slog.Logger {
	t.Helper()

	return slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

type testWriter struct {
	t *testing.T
}

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Helper()
	w.t.Log(string(p))

	return len(p), nil
}
