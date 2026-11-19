package events

import (
	"context"
	"errors"
	"testing"

	"metabox/internal/clashapi"
)

func TestClashSettings(t *testing.T) {
	resolve := ClashSettings(func(context.Context) (clashapi.Settings, error) {
		return clashapi.Settings{Address: "0.0.0.0:9090", Secret: "s"}, nil
	})

	settings, err := resolve(t.Context())
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if settings.BaseURL != "http://127.0.0.1:9090" || settings.Secret != "s" {
		t.Errorf("settings %+v, expected the controller on loopback with its secret", settings)
	}

	failures := map[string]clashapi.Resolver{
		"config not read": func(context.Context) (clashapi.Settings, error) {
			return clashapi.Settings{}, errors.New("конфиг не прочитан")
		},
		"no controller": func(context.Context) (clashapi.Settings, error) {
			return clashapi.Settings{}, nil
		},
	}

	for name, failing := range failures {
		if _, err := ClashSettings(failing)(t.Context()); err == nil {
			t.Errorf("%s: settings returned without a controller", name)
		}
	}
}
