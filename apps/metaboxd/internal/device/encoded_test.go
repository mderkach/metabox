package device_test

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"metabox/internal/device"
)

// A partial read still publishes the readings it has: the absent process goes to the debug
// log, not into an error that would drop the whole topic from the stream.
func TestEncodedPublishesPartialReadings(t *testing.T) {
	fs := newTree(t)

	var logs bytes.Buffer

	read := fs.reader(clashPort).Encoded(slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})))

	data, err := read(t.Context())
	if err != nil {
		t.Fatalf("encoded readings: %v", err)
	}

	var stat device.Stat
	if err := json.Unmarshal(data, &stat); err != nil {
		t.Fatalf("parsing readings: %v", err)
	}

	if stat.Memory.Total == 0 {
		t.Errorf("readings lost on a partial failure: %s", data)
	}
	if !strings.Contains(logs.String(), "device readings read partially") {
		t.Errorf("the partial failure is not in the debug log:\n%s", logs.String())
	}
}
