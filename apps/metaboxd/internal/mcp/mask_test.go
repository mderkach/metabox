package mcp

import (
	"fmt"
	"maps"
	"slices"
	"strings"
	"testing"
)

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
		{"client key password", `{"tls": {"client_key_password": "p"}}`, `{"tls": {"client_key_password": "••••••"}}`},
		{"mesh psk", `{"mesh_psk": "k", "mesh_psk_file": "/etc/psk"}`, `{"mesh_psk": "••••••", "mesh_psk_file": "/etc/psk"}`},
		{"public key stays", `{"tls": {"reality": {"public_key": "pk"}}}`, `{"tls": {"reality": {"public_key": "pk"}}}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(maskConfig([]byte(tt.in))); got != tt.want {
				t.Errorf("maskConfig(%s) = %s, want %s", tt.in, got, tt.want)
			}
		})
	}
}

// Every catalogued key is hidden whether it holds a string or a list, at any depth.
func TestMaskConfigHidesEveryCataloguedKey(t *testing.T) {
	const value = "plain-credential"

	var strs, lists strings.Builder
	strs.WriteString(`{"tag": "t"`)
	lists.WriteString(`{"tag": "t"`)
	for _, key := range slices.Sorted(maps.Keys(secretFieldKeys)) {
		fmt.Fprintf(&strs, `, %q: %q`, key, value)
		fmt.Fprintf(&lists, `, %q: [%q]`, key, value)
	}
	strs.WriteString(`}`)
	lists.WriteString(`}`)

	got := string(maskConfig([]byte(`{"nodes": [` + strs.String() + `, ` + lists.String() + `]}`)))

	if strings.Contains(got, value) {
		t.Errorf("a catalogued key kept its value:\n%s", got)
	}
	if want := 2 * len(secretFieldKeys); strings.Count(got, maskChars) != want {
		t.Errorf("masked %d values, want %d", strings.Count(got, maskChars), want)
	}
	if !strings.Contains(got, `"tag": "t"`) {
		t.Error("a key outside the catalogue was masked")
	}
}

// The after-host list is the hand-written remainder: a key the generator classifies must not
// be in it, or the two rules would fight over the value.
func TestURLKeysOutsideCatalogue(t *testing.T) {
	for key := range urlKeys {
		if secretFieldKeys[key] {
			t.Errorf("%q is in both urlKeys and the generated catalogue", key)
		}
	}
}

func TestMaskLog(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"rule-set download error", `initialize rule-set[geosite-x]: Get "https://h.example/x.srs?token=t1": dial tcp: i/o timeout`, `initialize rule-set[geosite-x]: Get "https://h.example/••••••": dial tcp: i/o timeout`},
		{"subscription token in path", "provider[sub]: update failed: https://sub.example/api/v1/client/abc123, status 403", "provider[sub]: update failed: https://sub.example/••••••, status 403"},
		{"credentials", "dial http://u:p@10.0.0.1:8080 failed", "dial http://10.0.0.1:8080/•••••• failed"},
		{"trailing punctuation kept", "fetch https://h.example/s/t1.", "fetch https://h.example/••••••."},
		{"single quotes", "url 'https://h.example/k?a=1' rejected", "url 'https://h.example/••••••' rejected"},
		{"two urls", "https://a.example/1 -> https://b.example/2", "https://a.example/•••••• -> https://b.example/••••••"},
		{"socks credentials", "outbound/socks[s]: dial socks5://u:p@h.example:1080", "outbound/socks[s]: dial socks5://h.example:1080/••••••"},
		{"ipv6 host with port", "fetch http://[2001:db8::1]:8080/sub?token=x failed", "fetch http://[2001:db8::1]:8080/•••••• failed"},
		{"bare host stays", `Get "https://h.example/": EOF`, `Get "https://h.example/": EOF`},
		{"bare ipv6 host stays", "probe http://[::1] ok", "probe http://[::1] ok"},
		{"no url", "inbound/tproxy[tproxy-in]: connection from 192.168.1.40:51234", "inbound/tproxy[tproxy-in]: connection from 192.168.1.40:51234"},
		{"empty", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := maskLog(tt.in); got != tt.want {
				t.Errorf("maskLog(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
