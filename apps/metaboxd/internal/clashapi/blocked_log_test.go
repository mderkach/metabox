package clashapi_test

import (
	"bytes"
	"testing"

	"metabox/internal/clashapi"
)

func TestReadBlockedLog(t *testing.T) {
	for _, tt := range []struct {
		name, document string
		want           clashapi.BlockedLog
	}{
		{
			name: "route reject and block outbound with comments",
			document: `{
				"log": { "level": "DEBUG", "output": "box.log" },
				"route": { "rules": [{"type": "logical", "action": "reject"}] },
				"outbounds": [{"type": "block"}], // deprecated outbound
			}`,
			want: clashapi.BlockedLog{Level: "DEBUG", Output: "box.log", Reject: true, Block: true},
		},
		{
			name: "DNS reject does not close a connection",
			document: `{
				"log": { "level": "warn", "output": "stderr" },
				"dns": { "rules": [{"action": "reject"}] },
				"outbounds": [{"type": "direct"}]
			}`,
			want: clashapi.BlockedLog{Level: "warn"},
		},
		{
			name: "inline provider can declare a block outbound",
			document: `{
				"outbounds": [{"type": "direct"}],
				"providers": [
					{"type": "remote", "url": "https://provider.example/subscription"},
					{"type": "inline", "outbounds": [{"type": "block", "tag": "blocked"}]}
				]
			}`,
			want: clashapi.BlockedLog{Block: true},
		},
		{
			name:     "disabled logging has no file source",
			document: `{"log":{"disabled":true,"output":"old.log"},"outbounds":[{"type":"block"}]}`,
			want:     clashapi.BlockedLog{Disabled: true, Block: true},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			data := []byte(tt.document)
			got, err := clashapi.ReadBlockedLog(data)
			if err != nil || got != tt.want {
				t.Errorf("projection = %+v, %v, want %+v", got, err, tt.want)
			}
			if !bytes.Equal(data, []byte(tt.document)) {
				t.Error("the config bytes changed")
			}
		})
	}
}
