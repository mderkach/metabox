// Package redaction masks secret values before they are shown to the operator.
package redaction

import (
	"net/url"
	"regexp"
	"strings"
)

// Placeholder is the marker the panel shows for a hidden value.
const Placeholder = "••••••"

// URL hides everything after the host: credentials, path, query and fragment. false
// means there is nothing to hide, the URL is just a host. A value that is not a URL with
// a host is hidden whole.
func URL(value string) (string, bool) {
	u, err := url.Parse(value)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return Placeholder, true
	}

	path := u.EscapedPath()
	if path == "/" {
		path = ""
	}

	if u.User == nil && path == "" && u.RawQuery == "" && u.Fragment == "" && !u.ForceQuery {
		return "", false
	}

	return u.Scheme + "://" + u.Host + "/" + Placeholder, true
}

// logURL finds a URL in a log line. sing-box prints a failed download as Go's url.Error,
// `Get "<url>": <cause>`, so a quote ends the URL as well as a blank.
var logURL = regexp.MustCompile("[A-Za-z][A-Za-z0-9+.-]*://[^\\s\"]+")

// URLs hides every URL in a log line after its host, as URL does for the url
// keys of the config: subscription and rule-set addresses carry tokens in the path or
// the query. The rest of the line, other secrets included, is not recognised.
func URLs(message string) string {
	return logURL.ReplaceAllStringFunc(message, func(raw string) string {
		value := strings.TrimRight(raw, ".,:;)'<>`")

		masked, ok := URL(value)
		if !ok {
			return raw
		}

		return masked + raw[len(value):]
	})
}
