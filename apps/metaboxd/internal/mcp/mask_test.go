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
		{"array under secret key", `{"private_key": ["-----BEGIN-----", "k"], "tag": "t"}`, `{"private_key": ["••••••", "••••••"], "tag": "t"}`},
		{"object under secret key", `{"password": {"a": ["x"], "b": "y"}, "c": "z"}`, `{"password": {"a": ["••••••"], "b": "••••••"}, "c": "z"}`},
		{"secret key in another case", `{"Password": "p1", "PSK": "k"}`, `{"Password": "••••••", "PSK": "••••••"}`},
		{"url list hidden after host", `{"url": ["https://h.example/sub?k=1"]}`, `{"url": ["https://h.example/••••••"]}`},
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
		{"vless uuid", `{"type": "vless", "uuid": "bf000d23-0752-40b4-affe-68f7707a9661"}`, `{"type": "vless", "uuid": "••••••"}`},
		{"vmess user uuid", `{"users": [{"name": "u", "uuid": "u-1"}]}`, `{"users": [{"name": "u", "uuid": "••••••"}]}`},
		{"tls key as a pem list", `{"tls": {"certificate": ["c"], "key": ["-----BEGIN-----", "k"]}}`, `{"tls": {"certificate": ["c"], "key": ["••••••", "••••••"]}}`},
		{"ech key", `{"tls": {"ech": {"key": "k"}}}`, `{"tls": {"ech": {"key": "••••••"}}}`},
		{"auth key", `{"auth_key": "tskey-1"}`, `{"auth_key": "••••••"}`},
		{"api token", `{"api_token": "cf-1"}`, `{"api_token": "••••••"}`},
		{"api key", `{"api_key": "ak-1"}`, `{"api_key": "••••••"}`},
		{"mac key", `{"mac_key": "mk-1"}`, `{"mac_key": "••••••"}`},
		{"authorization header", `{"headers": {"Authorization": "Bearer t", "Host": "h"}}`, `{"headers": {"Authorization": "••••••", "Host": "h"}}`},
		{"authorization header as a list", `{"headers": {"authorization": ["Bearer t"]}}`, `{"headers": {"authorization": ["••••••"]}}`},
		{"proxy authorization header", `{"headers": {"Proxy-Authorization": "Basic x"}}`, `{"headers": {"Proxy-Authorization": "••••••"}}`},
		{"new keys in another case", `{"UUID": "u", "Key": "k", "API_KEY": "a"}`, `{"UUID": "••••••", "Key": "••••••", "API_KEY": "••••••"}`},
		{"key path stays", `{"tls": {"key_path": "/etc/k.pem"}}`, `{"tls": {"key_path": "/etc/k.pem"}}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(maskConfig([]byte(tt.in))); got != tt.want {
				t.Errorf("maskConfig(%s) = %s, want %s", tt.in, got, tt.want)
			}
		})
	}
}
