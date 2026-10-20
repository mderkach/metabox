package httpapi

import (
	"context"
	"net/http"
	"strings"

	"metabox/internal/contract"
)

// mcpPath is where the agent endpoint lives: outside /api/, so the panel session does not
// apply to it and its token does not open the panel API.
const mcpPath = "/mcp"

// MCP is the agent endpoint and its token. The interface is declared here, at the
// consumer.
type MCP interface {
	Enabled() bool
	// Handler returns the transport for the token's permissions; nil means the token is
	// wrong.
	Handler(token string) http.Handler
	Permissions(token string) []contract.MCPPermission
	Issue(ctx context.Context) (string, error)
	Disable(ctx context.Context) error
}

// handleMCP answers as an unknown path while MCP is off: a scan of the LAN does not learn
// that the endpoint exists.
func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	if s.mcp == nil || !s.mcp.Enabled() {
		s.spaHandler().ServeHTTP(w, r)

		return
	}

	next := s.mcp.Handler(bearerToken(r))
	if next == nil {
		s.log.Warn("запрос MCP без верного токена", "addr", clientAddr(r))
		w.Header().Set("WWW-Authenticate", "Bearer")
		fail(s.log, w, r, errMCPToken)

		return
	}

	next.ServeHTTP(w, r)
}

func bearerToken(r *http.Request) string {
	scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return ""
	}

	return strings.TrimSpace(token)
}

func (s *Server) handleMCPState(w http.ResponseWriter, _ *http.Request) {
	body := contract.MCP{Endpoint: mcpPath, Permissions: []contract.MCPPermission{}}

	if s.mcp.Enabled() {
		body.Enabled = true
		body.Permissions = []contract.MCPPermission{contract.MCPRead}
	}

	writeJSON(s.log, w, http.StatusOK, body)
}

// handleMCPToken issues a new token: it enables MCP and invalidates the previous token.
// Nothing is restarted: the token lives in the daemon service directory, not in UCI.
func (s *Server) handleMCPToken(w http.ResponseWriter, r *http.Request) {
	token, err := s.mcp.Issue(r.Context())
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	s.log.Info("выпущен токен MCP", "addr", clientAddr(r))
	writeJSON(s.log, w, http.StatusOK, contract.MCPToken{
		Token:       token,
		Endpoint:    mcpPath,
		Permissions: s.mcp.Permissions(token),
	})
}

func (s *Server) handleMCPDisable(w http.ResponseWriter, r *http.Request) {
	if err := s.mcp.Disable(r.Context()); err != nil {
		fail(s.log, w, r, err)

		return
	}

	s.log.Info("MCP выключен", "addr", clientAddr(r))
	w.WriteHeader(http.StatusNoContent)
}
