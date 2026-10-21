package httpapi

import "net/http"

// caPath is where the panel root certificate is served: outside /api/, so it opens
// before login, and outside the https redirect, so a browser that does not trust the
// root yet downloads it without a warning.
const caPath = "/metabox-ca.crt"

// handleCA serves the root certificate with the type that makes a phone offer to
// install it.
func (s *Server) handleCA(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/x-x509-ca-cert")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(s.ca())
}
