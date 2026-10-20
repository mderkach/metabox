package mcp

import "testing"

func TestMaskConfig(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"whole secret", `{"password": "p1"}`, `{"password": "••••••"}`},
		{"nested secret", `{"a": [{"private_key": "k"}]}`, `{"a": [{"private_key": "••••••"}]}`},
		{"empty secret stays", `{"secret": ""}`, `{"secret": ""}`},
		{"non-string secret stays", `{"token": 5}`, `{"token": 5}`},
		{"array under secret key stays", `{"psk": ["a"]}`, `{"psk": ["a"]}`},
		{"key of another name", `{"passwords": "x"}`, `{"passwords": "x"}`},
		{"secret word as a value", `{"tag": "password"}`, `{"tag": "password"}`},
		{"url path hidden", `{"url": "https://h.example:8443/sub?k=1"}`, `{"url": "https://h.example:8443/••••••"}`},
		{"url credentials hidden", `{"url": "https://u:p@h.example"}`, `{"url": "https://h.example/••••••"}`},
		{"bare host url stays", `{"download_url": "https://h.example/"}`, `{"download_url": "https://h.example/"}`},
		{"not a url hidden", `{"url": "token-only"}`, `{"url": "••••••"}`},
		{"line comment dropped", "{\"a\": 1 // \"password\": \"x\"\n}", "{\"a\": 1 \n}"},
		{"block comment dropped", `{/* secret */"a": 1}`, `{ "a": 1}`},
		{"comment between key and value", `{"secret" /* c */ : "s"}`, `{"secret"   : "••••••"}`},
		{"escaped quote in value", `{"password": "a\"b", "x": "y"}`, `{"password": "••••••", "x": "y"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(maskConfig([]byte(tt.in))); got != tt.want {
				t.Errorf("maskConfig(%s) = %s, want %s", tt.in, got, tt.want)
			}
		})
	}
}
