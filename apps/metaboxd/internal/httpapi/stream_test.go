package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"metabox/internal/contract"
	"metabox/internal/httpapi"
	"metabox/internal/locale"
)

// The stream body is the handler body; a failed poll is published as such, not dropped.
func TestServiceStream(t *testing.T) {
	alive := func(context.Context) bool { return true }

	tests := []struct {
		name    string
		service *fakeService
		want    contract.Service
	}{
		{
			name:    "running",
			service: &fakeService{running: true, uptime: 90 * time.Second},
			want:    contract.Service{Status: "running", Uptime: 90, Managed: true, Binary: "/usr/bin/sing-box"},
		},
		{
			name:    "state not read",
			service: &fakeService{runningErr: errors.New("ubus молчит")},
			want: contract.Service{
				Status: "stopped", Binary: "/usr/bin/sing-box",
				LastError: "service state not read", LastErrorCode: contract.ServiceStateUnread,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := httpapi.ServiceStream(tt.service, "/usr/bin/sing-box", alive, locale.English)(t.Context())
			if err != nil {
				t.Fatalf("stream body: %v", err)
			}

			var got contract.Service
			if err := json.Unmarshal(data, &got); err != nil {
				t.Fatalf("parsing body: %v", err)
			}
			if got.Status != tt.want.Status || got.Uptime != tt.want.Uptime || got.Managed != tt.want.Managed ||
				got.LastError != tt.want.LastError || got.LastErrorCode != tt.want.LastErrorCode || got.Binary != tt.want.Binary {
				t.Errorf("body %+v, want %+v", got, tt.want)
			}
		})
	}
}
