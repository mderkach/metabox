package cert

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io/fs"
	"log/slog"
	"net"
	"slices"
	"strings"
	"testing"
	"time"
)

var testNow = time.Date(2026, time.October, 21, 12, 0, 0, 0, time.UTC)

type memStore struct {
	files    map[string][]byte
	writeErr error
	writes   int
}

func newMemStore() *memStore {
	return &memStore{files: map[string][]byte{}}
}

func (s *memStore) ReadTLS(_ context.Context, name string) ([]byte, error) {
	data, ok := s.files[name]
	if !ok {
		return nil, fs.ErrNotExist
	}

	return data, nil
}

func (s *memStore) WriteTLS(_ context.Context, name string, data []byte) error {
	if s.writeErr != nil {
		return s.writeErr
	}

	s.writes++
	s.files[name] = data

	return nil
}

func testLogger(t *testing.T) *slog.Logger {
	t.Helper()

	return slog.New(slog.NewTextHandler(testWriter{t}, nil))
}

type testWriter struct{ t *testing.T }

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Log(strings.TrimSpace(string(p)))

	return len(p), nil
}

func newManager(t *testing.T, store Store, hosts []string, now time.Time) *Manager {
	t.Helper()

	m, err := New(t.Context(), store, testLogger(t), Options{Hosts: hosts, Now: func() time.Time { return now }})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	return m
}

// verify checks the served chain the way a browser that trusts the root would.
func verify(t *testing.T, m *Manager, host string, now time.Time) error {
	t.Helper()

	served, err := m.Config().GetCertificate(&tls.ClientHelloInfo{})
	if err != nil {
		t.Fatalf("GetCertificate: %v", err)
	}

	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(m.CA()) {
		t.Fatal("CA() is not a PEM certificate")
	}

	leaf, err := x509.ParseCertificate(served.Certificate[0])
	if err != nil {
		t.Fatalf("served certificate: %v", err)
	}

	_, err = leaf.Verify(x509.VerifyOptions{Roots: roots, DNSName: host, CurrentTime: now})

	return err
}

func TestNewIssuesRootAndServerCertificate(t *testing.T) {
	store := newMemStore()
	m := newManager(t, store, []string{"192.168.1.1", "10.0.0.1"}, testNow)

	if !m.RootCreated() {
		t.Error("RootCreated is false on an empty store")
	}

	for _, name := range []string{CAKeyName, CACertName, ServerKeyName, ServerCertName} {
		if _, ok := store.files[name]; !ok {
			t.Errorf("file %s was not written", name)
		}
	}

	for _, host := range []string{"192.168.1.1", "10.0.0.1", "127.0.0.1", "::1", "localhost"} {
		if err := verify(t, m, host, testNow); err != nil {
			t.Errorf("chain for %s: %v", host, err)
		}
	}

	if err := verify(t, m, "192.168.1.2", testNow); err == nil {
		t.Error("chain verified for an address the panel does not listen on")
	}

	if got := m.Fingerprint(); len(strings.Split(got, ":")) != 32 {
		t.Errorf("fingerprint %q is not 32 colon-separated bytes", got)
	}
}

func TestRootConstrainsNamesToLocalNetworks(t *testing.T) {
	m := newManager(t, newMemStore(), []string{"192.168.1.1", "203.0.113.5", "router.lan"}, testNow)

	if !m.ca.PermittedDNSDomainsCritical {
		t.Error("name constraints are not critical")
	}

	if !slices.Equal(m.ca.PermittedDNSDomains, []string{"localhost", "router.lan"}) {
		t.Errorf("permitted DNS %v", m.ca.PermittedDNSDomains)
	}

	for _, probe := range []struct {
		ip   string
		want bool
	}{
		{"192.168.44.1", true},
		{"10.9.8.7", true},
		{"203.0.113.5", true},
		{"203.0.113.6", false},
		{"8.8.8.8", false},
	} {
		ip := net.ParseIP(probe.ip)
		got := slices.ContainsFunc(m.ca.PermittedIPRanges, func(n *net.IPNet) bool { return n.Contains(ip) })
		if got != probe.want {
			t.Errorf("%s permitted: got %v, want %v", probe.ip, got, probe.want)
		}
	}
}

func TestSecondStartReusesTheFiles(t *testing.T) {
	store := newMemStore()
	first := newManager(t, store, []string{"192.168.1.1"}, testNow)
	writes := store.writes

	second := newManager(t, store, []string{"192.168.1.1"}, testNow.Add(time.Hour))

	if second.RootCreated() {
		t.Error("the root was reissued on a second start")
	}

	if store.writes != writes {
		t.Errorf("second start wrote %d files", store.writes-writes)
	}

	if second.Fingerprint() != first.Fingerprint() {
		t.Error("the root changed between starts")
	}
}

func TestNewAddressReissuesOnlyTheServerCertificate(t *testing.T) {
	store := newMemStore()
	first := newManager(t, store, []string{"192.168.1.1"}, testNow)

	second := newManager(t, store, []string{"192.168.1.1", "192.168.5.1"}, testNow)

	if second.Fingerprint() != first.Fingerprint() {
		t.Error("the root changed when a guest network was added")
	}

	if err := verify(t, second, "192.168.5.1", testNow); err != nil {
		t.Errorf("chain for the new address: %v", err)
	}
}

func TestAddressOutsideTheRootConstraintsReissuesTheRoot(t *testing.T) {
	store := newMemStore()
	first := newManager(t, store, []string{"192.168.1.1"}, testNow)

	second := newManager(t, store, []string{"192.168.1.1", "203.0.113.5"}, testNow)

	if !second.RootCreated() {
		t.Fatal("the root was kept although it cannot issue for a public address")
	}

	if second.Fingerprint() == first.Fingerprint() {
		t.Error("the root did not change")
	}

	if err := verify(t, second, "203.0.113.5", testNow); err != nil {
		t.Errorf("chain for the public address: %v", err)
	}
}

func TestServerCertificateIsRenewedBeforeExpiry(t *testing.T) {
	store := newMemStore()
	clock := testNow
	m, err := New(t.Context(), store, testLogger(t), Options{
		Hosts: []string{"192.168.1.1"},
		Now:   func() time.Time { return clock },
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	before := m.Expiry()

	clock = before.Add(-renewMargin + time.Minute)

	if _, err := m.Config().GetCertificate(&tls.ClientHelloInfo{}); err != nil {
		t.Fatalf("GetCertificate: %v", err)
	}

	if !m.Expiry().After(before) {
		t.Errorf("expiry %v did not move past %v", m.Expiry(), before)
	}

	if err := verify(t, m, "192.168.1.1", clock); err != nil {
		t.Errorf("renewed chain: %v", err)
	}
}

func TestFailedRenewalKeepsTheCurrentCertificate(t *testing.T) {
	store := newMemStore()
	clock := testNow
	m, err := New(t.Context(), store, testLogger(t), Options{
		Hosts: []string{"192.168.1.1"},
		Now:   func() time.Time { return clock },
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	before := m.Expiry()
	clock = before.Add(-time.Hour)
	store.writeErr = errors.New("disk full")
	writes := store.writes

	served, err := m.Config().GetCertificate(&tls.ClientHelloInfo{})
	if err != nil {
		t.Fatalf("GetCertificate: %v", err)
	}

	if served.Leaf.NotAfter != before {
		t.Errorf("a failed renewal replaced the certificate")
	}

	store.writeErr = nil

	if _, err := m.Config().GetCertificate(&tls.ClientHelloInfo{}); err != nil {
		t.Fatalf("GetCertificate: %v", err)
	}

	if store.writes != writes {
		t.Error("renewal was retried before the pause ran out")
	}
}

func TestUnsyncedClockDatesCertificatesFromTheFloor(t *testing.T) {
	epoch := time.Unix(0, 0)
	m := newManager(t, newMemStore(), []string{"192.168.1.1"}, epoch)

	if !m.ca.NotBefore.Equal(clockFloor) {
		t.Errorf("root NotBefore %v, want %v", m.ca.NotBefore, clockFloor)
	}

	if err := verify(t, m, "192.168.1.1", testNow); err != nil {
		t.Errorf("a client with a correct clock rejects the chain: %v", err)
	}

	if m.renewDue(epoch) {
		t.Error("renewal is due by an unsynced clock")
	}
}

func TestUnreadableFilesAreReissued(t *testing.T) {
	store := newMemStore()
	first := newManager(t, store, []string{"192.168.1.1"}, testNow)
	store.files[ServerCertName] = []byte("garbage")

	second := newManager(t, store, []string{"192.168.1.1"}, testNow)

	if second.Fingerprint() != first.Fingerprint() {
		t.Error("the root was reissued for a broken server certificate")
	}

	if err := verify(t, second, "192.168.1.1", testNow); err != nil {
		t.Errorf("chain after reissue: %v", err)
	}
}

func TestStoreWriteFailureStopsTheStart(t *testing.T) {
	store := newMemStore()
	store.writeErr = errors.New("read-only file system")

	if _, err := New(t.Context(), store, testLogger(t), Options{Hosts: []string{"192.168.1.1"}}); err == nil {
		t.Fatal("New succeeded without writing the certificates")
	}
}

func TestSplitHosts(t *testing.T) {
	ips, dns := splitHosts([]string{"0.0.0.0", "[fd00::1]", "192.168.1.1", "Router.LAN", "192.168.1.1", "::"})

	var got []string
	for _, ip := range ips {
		got = append(got, ip.String())
	}

	if want := []string{"127.0.0.1", "192.168.1.1", "::1", "fd00::1"}; !slices.Equal(got, want) {
		t.Errorf("ips %v, want %v", got, want)
	}

	if want := []string{"localhost", "router.lan"}; !slices.Equal(dns, want) {
		t.Errorf("dns %v, want %v", dns, want)
	}
}
