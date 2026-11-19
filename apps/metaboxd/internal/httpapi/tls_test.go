package httpapi_test

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"metabox/internal/auth"
	"metabox/internal/httpapi"
)

const rootPEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n"

func ownRoot() []byte { return []byte(rootPEM) }

// newTLSServer serves the panel over TLS; a nil ca is the owner's certificate pair, which
// comes with no root to hand out.
func newTLSServer(t *testing.T, ca func() []byte) *browser {
	t.Helper()

	guard, err := auth.New(t.Context(), &memoryAuthStore{}, auth.Options{Iterations: 1000})
	if err != nil {
		t.Fatalf("guard: %v", err)
	}

	srv := httptest.NewUnstartedServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
		Version: "test",
		Auth:    guard,
		HTTPS:   true,
		CA:      ca,
	}))
	srv.StartTLS()
	t.Cleanup(srv.Close)

	return newBrowser(t, srv)
}

func TestSessionCookieIsSecureOverTLS(t *testing.T) {
	b := newTLSServer(t, ownRoot)

	r := b.setPassword("", panelPassword)
	if r.status != http.StatusNoContent {
		t.Fatalf("set password: %d %s", r.status, r.body)
	}

	if cookie := r.header.Get("Set-Cookie"); !bytes.Contains([]byte(cookie), []byte("Secure")) {
		t.Errorf("cookie %q lacks Secure", cookie)
	}

	if r := b.do(http.MethodPost, "/api/auth/logout", nil); !bytes.Contains([]byte(r.header.Get("Set-Cookie")), []byte("Secure")) {
		t.Errorf("logout cookie %q lacks Secure", r.header.Get("Set-Cookie"))
	}
}

func TestRootCertificateOpensWithoutASession(t *testing.T) {
	b := newTLSServer(t, ownRoot)

	if r := b.setPassword("", panelPassword); r.status != http.StatusNoContent {
		t.Fatalf("set password: %d %s", r.status, r.body)
	}

	b.do(http.MethodPost, "/api/auth/logout", nil)

	resp, err := b.client.Get(b.srv.URL + "/metabox-ca.crt")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}

	if got := resp.Header.Get("Content-Type"); got != "application/x-x509-ca-cert" {
		t.Errorf("Content-Type %q", got)
	}

	if string(body) != rootPEM {
		t.Errorf("body %q, want the root PEM", body)
	}
}

func TestRootCertificateIsNotServedWithTheOwnerPair(t *testing.T) {
	b := newTLSServer(t, nil)

	r := b.do(http.MethodGet, "/metabox-ca.crt", nil)

	if r.contentType == "application/x-x509-ca-cert" || strings.Contains(r.body, "BEGIN CERTIFICATE") {
		t.Errorf("a root was served with the owner pair: %d %s %q", r.status, r.contentType, r.body)
	}
}
