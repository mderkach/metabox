package mcp

import (
	"bytes"
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
)

// maskChars stands in place of a hidden secret, the same characters the panel shows.
const maskChars = "••••••"

type maskRule int

const (
	maskWhole maskRule = iota + 1
	maskAfterHost
)

// secretKeys are the config keys whose string values are hidden at any depth: the same
// names and rules the panel masks in forms. A key matches regardless of case, because the
// sing-box decoder matches field names that way. A vless or vmess uuid is the credential
// itself; every key named "key" in the fork schema holds key material (TLS, ECH, OpenVPN,
// VPN users); authorization is an HTTP header inside headers.
var secretKeys = map[string]maskRule{
	"secret":              maskWhole,
	"password":            maskWhole,
	"private_key":         maskWhole,
	"pre_shared_key":      maskWhole,
	"psk":                 maskWhole,
	"token":               maskWhole,
	"auth_str":            maskWhole,
	"access_key_secret":   maskWhole,
	"uuid":                maskWhole,
	"key":                 maskWhole,
	"auth_key":            maskWhole,
	"api_token":           maskWhole,
	"api_key":             maskWhole,
	"mac_key":             maskWhole,
	"authorization":       maskWhole,
	"proxy-authorization": maskWhole,
	"url":                 maskAfterHost,
	"download_url":        maskAfterHost,
}

// maskConfig hides secret values in the config text and drops comments: a comment may
// hold a commented-out node with its password, and its text has no key to recognise the
// secret by. The scan works on tokens, without parsing the config into a structure: the
// daemon does not interpret config content. Every string inside the value of a secret
// key is masked, nested arrays and objects included: sing-box accepts a private key as a
// list of PEM lines. An empty string stays, as in the panel.
func maskConfig(data []byte) []byte {
	out := make([]byte, 0, len(data))

	var (
		key         string
		expectValue bool
		depth       int
		secretDepth int
		secretRule  maskRule
	)

	for i := 0; i < len(data); {
		switch c := data[i]; {
		case c == '"':
			end := stringEnd(data, i)
			literal := data[i:end]
			i = end

			if next := skipBlank(data, end); next < len(data) && data[next] == ':' {
				key = decodeString(literal)
				expectValue = false
				out = append(out, literal...)

				continue
			}

			if rule, secret := secretKeys[strings.ToLower(key)]; secret && expectValue {
				literal = maskLiteral(literal, rule)
			} else if secretDepth != 0 {
				literal = maskLiteral(literal, secretRule)
			}

			expectValue = false
			out = append(out, literal...)
		case bytes.HasPrefix(data[i:], []byte("//")):
			i = commentEnd(data, i)
		case bytes.HasPrefix(data[i:], []byte("/*")):
			i = commentEnd(data, i)
			out = append(out, ' ')
		case c == ':':
			expectValue = true
			out = append(out, c)
			i++
		case c == '[' || c == '{':
			if rule, secret := secretKeys[strings.ToLower(key)]; secret && expectValue && secretDepth == 0 {
				secretDepth, secretRule = depth+1, rule
			}

			depth++
			expectValue = false
			out = append(out, c)
			i++
		case c == ']' || c == '}':
			if depth == secretDepth {
				secretDepth = 0
			}

			depth--
			expectValue = false
			out = append(out, c)
			i++
		case isBlank(c):
			out = append(out, c)
			i++
		default:
			expectValue = false
			out = append(out, c)
			i++
		}
	}

	return out
}

// maskLiteral returns the masked JSON string literal. A literal that cannot be decoded is
// hidden whole: its value is unknown, and so is whether it is a secret.
func maskLiteral(literal []byte, rule maskRule) []byte {
	var value string
	if err := json.Unmarshal(literal, &value); err != nil {
		return encodeString(maskChars)
	}

	if value == "" {
		return literal
	}

	if rule == maskWhole {
		return encodeString(maskChars)
	}

	masked, ok := maskURL(value)
	if !ok {
		return literal
	}

	return encodeString(masked)
}

// maskURL hides everything after the host: credentials, path, query and fragment. false
// means there is nothing to hide, the URL is just a host. A value that is not a URL with
// a host is hidden whole.
func maskURL(value string) (string, bool) {
	u, err := url.Parse(value)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return maskChars, true
	}

	path := u.EscapedPath()
	if path == "/" {
		path = ""
	}

	if u.User == nil && path == "" && u.RawQuery == "" && u.Fragment == "" && !u.ForceQuery {
		return "", false
	}

	return u.Scheme + "://" + u.Host + "/" + maskChars, true
}

// logURL finds a URL in a log line. sing-box prints a failed download as Go's url.Error,
// `Get "<url>": <cause>`, so a quote ends the URL as well as a blank.
var logURL = regexp.MustCompile("[A-Za-z][A-Za-z0-9+.-]*://[^\\s\"'<>`]+")

// maskLog hides every URL in a log line after its host, as maskURL does for the url
// keys of the config: subscription and rule-set addresses carry tokens in the path or
// the query. The rest of the line, other secrets included, is not recognised.
func maskLog(message string) string {
	return logURL.ReplaceAllStringFunc(message, func(raw string) string {
		value := strings.TrimRight(raw, ".,:;)")

		masked, ok := maskURL(value)
		if !ok {
			return raw
		}

		return masked + raw[len(value):]
	})
}

func encodeString(value string) []byte {
	var buf bytes.Buffer

	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(value)

	return bytes.TrimSuffix(buf.Bytes(), []byte("\n"))
}

func decodeString(literal []byte) string {
	var value string
	if err := json.Unmarshal(literal, &value); err != nil {
		return ""
	}

	return value
}

// stringEnd returns the index after the closing quote of the literal starting at start.
func stringEnd(data []byte, start int) int {
	for i := start + 1; i < len(data); i++ {
		switch data[i] {
		case '\\':
			i++
		case '"':
			return i + 1
		}
	}

	return len(data)
}

// commentEnd returns the index after a comment; a line comment keeps its line break.
func commentEnd(data []byte, start int) int {
	if data[start+1] == '/' {
		if end := bytes.IndexByte(data[start:], '\n'); end >= 0 {
			return start + end
		}

		return len(data)
	}

	if end := bytes.Index(data[start+2:], []byte("*/")); end >= 0 {
		return start + 2 + end + 2
	}

	return len(data)
}

// skipBlank returns the index of the first byte that is neither blank nor in a comment.
func skipBlank(data []byte, from int) int {
	for i := from; i < len(data); {
		switch {
		case isBlank(data[i]):
			i++
		case bytes.HasPrefix(data[i:], []byte("//")), bytes.HasPrefix(data[i:], []byte("/*")):
			i = commentEnd(data, i)
		default:
			return i
		}
	}

	return len(data)
}

func isBlank(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}
