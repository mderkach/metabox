package httpapi

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"io/fs"
	"net"
	"net/http"
	"testing"
	"time"

	"metabox/internal/cert"
)

type memTLSStore struct{ files map[string][]byte }

func (s *memTLSStore) ReadTLS(_ context.Context, name string) ([]byte, error) {
	data, ok := s.files[name]
	if !ok {
		return nil, fs.ErrNotExist
	}

	return data, nil
}

func (s *memTLSStore) WriteTLS(_ context.Context, name string, data []byte) error {
	s.files[name] = data

	return nil
}

// splitServer serves one handler on a split listener and returns the plain address
// and a client that trusts the panel root.
func splitServer(t *testing.T, handler http.Handler) (string, *http.Client, *http.Server) {
	t.Helper()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	manager, err := cert.New(t.Context(), &memTLSStore{files: map[string][]byte{}}, testLogger(t), cert.Options{})
	if err != nil {
		t.Fatalf("certificates: %v", err)
	}

	srv := &http.Server{Handler: handler, ReadHeaderTimeout: time.Second}
	plain, secure := SplitTLS(listener, manager.Config())

	served := make(chan error, 2)
	for _, l := range []net.Listener{plain, secure} {
		go func() { served <- srv.Serve(l) }()
	}

	t.Cleanup(func() {
		_ = srv.Close()

		for range 2 {
			if err := <-served; !errors.Is(err, http.ErrServerClosed) {
				t.Errorf("Serve returned %v, want ErrServerClosed", err)
			}
		}
	})

	roots := x509.NewCertPool()
	roots.AppendCertsFromPEM(manager.CA())

	client := &http.Client{Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}}}

	return listener.Addr().String(), client, srv
}

func TestSplitTLSServesBothProtocolsOnOnePort(t *testing.T) {
	scheme := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS != nil {
			_, _ = io.WriteString(w, "tls")

			return
		}

		_, _ = io.WriteString(w, "plain")
	})

	addr, client, _ := splitServer(t, scheme)

	for _, tt := range []struct{ url, want string }{
		{"http://" + addr + "/", "plain"},
		{"https://" + addr + "/", "tls"},
	} {
		resp, err := client.Get(tt.url)
		if err != nil {
			t.Fatalf("%s: %v", tt.url, err)
		}

		body, err := io.ReadAll(resp.Body)
		_ = resp.Body.Close()

		if err != nil {
			t.Fatalf("%s: read: %v", tt.url, err)
		}

		if string(body) != tt.want {
			t.Errorf("%s: got %q, want %q", tt.url, body, tt.want)
		}
	}
}

func TestSplitTLSClosesBothSidesWithTheServer(t *testing.T) {
	addr, _, srv := splitServer(t, http.NotFoundHandler())

	if err := srv.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	if _, err := net.Dial("tcp", addr); err == nil {
		t.Error("the port still accepts connections after the server closed")
	}
}
