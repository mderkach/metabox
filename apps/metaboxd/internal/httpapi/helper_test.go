package httpapi

import (
	"log/slog"
	"testing"
)

// testLogger sends the layer records to the test output: on a failure it is visible what the daemon
// managed to log.
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
