package clashapi_test

import (
	"context"
	"errors"
	"testing"

	"metabox/internal/clashapi"
)

func TestConfigResolverReadsOnEveryCall(t *testing.T) {
	cfg := `{"experimental":{"clash_api":{"external_controller":"127.0.0.1:9090","secret":"s"}}}`
	reads := 0

	resolve := clashapi.ConfigResolver(func(context.Context) ([]byte, error) {
		reads++

		return []byte(cfg), nil
	})

	if port, err := resolve.Port(t.Context()); err != nil || port != 9090 {
		t.Errorf("port %d, %v; expected 9090", port, err)
	}

	cfg = `{"experimental":{"clash_api":{"external_controller":"127.0.0.1:9091"}}}`

	settings, err := resolve(t.Context())
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if settings.Address != "127.0.0.1:9091" || settings.Secret != "" {
		t.Errorf("settings %+v, expected the changed config", settings)
	}
	if reads != 2 {
		t.Errorf("config read %d times, expected on every call", reads)
	}
}

func TestResolverPortFailures(t *testing.T) {
	tests := []struct {
		name string
		read func(context.Context) ([]byte, error)
	}{
		{"config not read", func(context.Context) ([]byte, error) { return nil, errors.New("нет файла") }},
		{"address without a port", func(context.Context) ([]byte, error) {
			return []byte(`{"experimental":{"clash_api":{"external_controller":"127.0.0.1"}}}`), nil
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := clashapi.ConfigResolver(tt.read).Port(t.Context()); err == nil {
				t.Error("a port was returned without a readable controller address")
			}
		})
	}
}
