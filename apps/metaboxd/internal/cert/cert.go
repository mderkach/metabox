// Package cert issues and renews the panel TLS certificates: a local root that the
// owner installs on their devices once, and a server certificate under it that follows
// the panel addresses.
package cert

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"maps"
	"math/big"
	"net"
	"net/netip"
	"slices"
	"strings"
	"sync"
	"time"
)

// File names inside the store.
const (
	CAKeyName      = "ca.key"
	CACertName     = "ca.crt"
	ServerKeyName  = "server.key"
	ServerCertName = "server.crt"
)

const (
	caValidity   = 10 * 365 * 24 * time.Hour
	leafValidity = 825 * 24 * time.Hour
	// renewMargin is how long before expiry the server certificate is reissued.
	renewMargin = 30 * 24 * time.Hour
	// retryInterval is the pause after a failed renewal: a renewal runs on a TLS
	// handshake, and a disk that refuses to write must not be hit on every one.
	retryInterval = time.Hour
	// backdate covers the clock skew between the router and a client.
	backdate   = time.Hour
	serialBits = 128
)

// clockFloor is the earliest date the daemon takes as a real clock reading. The
// router has no real-time clock: after power-on it starts at the epoch and jumps during
// NTP sync, and a certificate dated 1970 would be expired for every client.
var clockFloor = time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)

// privateNetworks are the networks a root is allowed to issue for besides the panel
// addresses: the owner's other local networks and loopback.
var privateNetworks = parseNetworks(
	"10.0.0.0/8",
	"100.64.0.0/10",
	"127.0.0.0/8",
	"169.254.0.0/16",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"::1/128",
	"fc00::/7",
	"fe80::/10",
)

// Store keeps the key and certificate files. Read returns an error for which
// errors.Is(err, fs.ErrNotExist) holds when the file was never written.
type Store interface {
	ReadTLS(ctx context.Context, name string) ([]byte, error)
	WriteTLS(ctx context.Context, name string, data []byte) error
}

// Options are the names the server certificate must cover and the clock.
type Options struct {
	// Hosts are IP addresses and DNS names the panel answers on. Loopback and
	// `localhost` are always added; an unspecified address is dropped.
	Hosts []string
	// Now replaces the clock in tests. nil means time.Now.
	Now func() time.Time
}

// Manager owns the root and the server certificate. Config returns a TLS config that
// serves the current server certificate and reissues it before expiry.
type Manager struct {
	store Store
	log   *slog.Logger
	now   func() time.Time
	ips   []net.IP
	dns   []string

	mu        sync.Mutex
	caKey     *ecdsa.PrivateKey
	ca        *x509.Certificate
	caPEM     []byte
	leaf      *tls.Certificate
	leafX509  *x509.Certificate
	retryFrom time.Time
	// rootCreated reports that New issued a new root: the owner has to install it
	// again, and the caller logs that.
	rootCreated bool
}

// New loads the root and the server certificate from the store, issuing what is
// missing, does not parse, does not match the key, does not cover Hosts, or has
// expired by a clock past clockFloor. A new root means every device has to trust the
// panel again; RootCreated reports it.
func New(ctx context.Context, store Store, log *slog.Logger, opts Options) (*Manager, error) {
	m := &Manager{store: store, log: log, now: opts.Now}
	if m.now == nil {
		m.now = time.Now
	}

	m.ips, m.dns = splitHosts(opts.Hosts)

	if err := m.loadRoot(ctx); err != nil {
		return nil, err
	}

	if err := m.loadLeaf(ctx); err != nil {
		return nil, err
	}

	return m, nil
}

// RootCreated reports whether New issued a new root instead of loading one.
func (m *Manager) RootCreated() bool {
	return m.rootCreated
}

// Config serves the current server certificate. Only HTTP/1.1 is offered: the
// streams and the Clash API proxy are written for it, and HTTP/2 is a separate change.
func (m *Manager) Config() *tls.Config {
	return &tls.Config{
		MinVersion:     tls.VersionTLS12,
		NextProtos:     []string{"http/1.1"},
		GetCertificate: m.certificate,
	}
}

// CA returns the root certificate in PEM: the file the owner installs on devices.
func (m *Manager) CA() []byte {
	m.mu.Lock()
	defer m.mu.Unlock()

	return slices.Clone(m.caPEM)
}

// Fingerprint returns the SHA-256 of the root certificate in the form
// `openssl x509 -fingerprint -sha256` prints, so the owner can compare it before
// trusting a file downloaded over plain http.
func (m *Manager) Fingerprint() string {
	m.mu.Lock()
	defer m.mu.Unlock()

	return fingerprint(m.ca)
}

// Expiry returns when the server certificate expires.
func (m *Manager) Expiry() time.Time {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.leafX509.NotAfter
}

// certificate returns the server certificate for a handshake and reissues it when
// expiry is close. A failed renewal keeps the current certificate: a panel with a
// soon-to-expire certificate beats no panel.
func (m *Manager) certificate(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.now()
	if !m.renewDue(now) || now.Before(m.retryFrom) {
		return m.leaf, nil
	}

	if err := m.issueLeaf(hello.Context(), now); err != nil {
		m.retryFrom = now.Add(retryInterval)
		m.log.Warn("panel certificate not reissued", "err", err, "expires", m.leafX509.NotAfter)
	} else {
		m.log.Info("panel certificate reissued", "expires", m.leafX509.NotAfter)
	}

	return m.leaf, nil
}

func (m *Manager) renewDue(now time.Time) bool {
	return clockSane(now) && !now.Before(m.leafX509.NotAfter.Add(-renewMargin))
}

func (m *Manager) loadRoot(ctx context.Context) error {
	key, cert, err := m.readPair(ctx, CAKeyName, CACertName)
	if err != nil {
		return err
	}

	now := m.now()

	switch {
	case key == nil:
	case !cert.IsCA:
		m.log.Warn("root certificate file is not a CA, issuing a new one")
	case !m.rootCovers(cert):
		m.log.Warn("root certificate does not cover the panel addresses, issuing a new one",
			"hosts", m.hosts())
	case clockSane(now) && now.After(cert.NotAfter):
		m.log.Warn("root certificate expired, issuing a new one", "expired", cert.NotAfter)
	default:
		m.caKey, m.ca, m.caPEM = key, cert, encodeCert(cert.Raw)

		return nil
	}

	return m.issueRoot(ctx, now)
}

func (m *Manager) loadLeaf(ctx context.Context) error {
	key, cert, err := m.readPair(ctx, ServerKeyName, ServerCertName)
	if err != nil {
		return err
	}

	now := m.now()

	switch {
	case key == nil:
	case cert.CheckSignatureFrom(m.ca) != nil:
	case !sameNames(cert, m.ips, m.dns):
	case clockSane(now) && !now.Before(cert.NotAfter.Add(-renewMargin)):
	default:
		m.setLeaf(key, cert)

		return nil
	}

	return m.issueLeaf(ctx, now)
}

// readPair reads a key and its certificate. A missing or unusable pair comes back as
// nil without an error: it is reissued, and only a store that cannot be read at
// all stops the start.
func (m *Manager) readPair(ctx context.Context, keyName, certName string) (*ecdsa.PrivateKey, *x509.Certificate, error) {
	keyPEM, err := m.store.ReadTLS(ctx, keyName)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}

	certPEM, err := m.store.ReadTLS(ctx, certName)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil, nil
	}
	if err != nil {
		return nil, nil, err
	}

	key, cert, err := decodePair(keyPEM, certPEM)
	if err != nil {
		m.log.Warn("certificate files not read, issuing them again", "file", certName, "err", err)

		return nil, nil, nil
	}

	return key, cert, nil
}

func (m *Manager) issueRoot(ctx context.Context, now time.Time) error {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return fmt.Errorf("root certificate key: %w", err)
	}

	serial, err := serialNumber()
	if err != nil {
		return err
	}

	notBefore := notBefore(now)
	template := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: "metabox CA " + now.UTC().Format("2006-01-02")},
		NotBefore:             notBefore,
		NotAfter:              notBefore.Add(caValidity),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLenZero:        true,
		// The root key lives on the router. Name constraints bound what a stolen
		// key can forge to the panel addresses and the owner's local networks:
		// a certificate for a public site under this root is rejected by the browser.
		PermittedDNSDomainsCritical: true,
		PermittedDNSDomains:         m.dns,
		PermittedIPRanges:           m.permittedRanges(),
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return fmt.Errorf("issue root certificate: %w", err)
	}

	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return fmt.Errorf("parse root certificate: %w", err)
	}

	if err := m.writePair(ctx, CAKeyName, CACertName, key, der); err != nil {
		return err
	}

	m.caKey, m.ca, m.caPEM = key, cert, encodeCert(der)
	m.rootCreated = true

	return nil
}

func (m *Manager) issueLeaf(ctx context.Context, now time.Time) error {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return fmt.Errorf("panel certificate key: %w", err)
	}

	serial, err := serialNumber()
	if err != nil {
		return err
	}

	notBefore := notBefore(now)
	template := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "metabox"},
		NotBefore:    notBefore,
		NotAfter:     notBefore.Add(leafValidity),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:  m.ips,
		DNSNames:     m.dns,
	}

	der, err := x509.CreateCertificate(rand.Reader, template, m.ca, &key.PublicKey, m.caKey)
	if err != nil {
		return fmt.Errorf("issue panel certificate: %w", err)
	}

	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return fmt.Errorf("parse panel certificate: %w", err)
	}

	if err := m.writePair(ctx, ServerKeyName, ServerCertName, key, der); err != nil {
		return err
	}

	m.setLeaf(key, cert)

	return nil
}

func (m *Manager) setLeaf(key *ecdsa.PrivateKey, cert *x509.Certificate) {
	m.leaf = &tls.Certificate{
		Certificate: [][]byte{cert.Raw, m.ca.Raw},
		PrivateKey:  key,
		Leaf:        cert,
	}
	m.leafX509 = cert
}

// writePair writes the certificate first: a key without its certificate is reissued
// on the next start, while a certificate without its key is reissued too, so neither
// order leaves a usable half, and the certificate is the file the owner may copy.
func (m *Manager) writePair(ctx context.Context, keyName, certName string, key *ecdsa.PrivateKey, der []byte) error {
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return fmt.Errorf("encode key %s: %w", keyName, err)
	}

	if err := m.store.WriteTLS(ctx, certName, encodeCert(der)); err != nil {
		return err
	}

	return m.store.WriteTLS(ctx, keyName, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER}))
}

// rootCovers reports whether the root's name constraints admit every panel name.
func (m *Manager) rootCovers(root *x509.Certificate) bool {
	for _, ip := range m.ips {
		if !slices.ContainsFunc(root.PermittedIPRanges, func(n *net.IPNet) bool { return n.Contains(ip) }) {
			return false
		}
	}

	for _, name := range m.dns {
		if !slices.ContainsFunc(root.PermittedDNSDomains, func(domain string) bool {
			return name == domain || strings.HasSuffix(name, "."+domain)
		}) {
			return false
		}
	}

	return true
}

// permittedRanges are the private networks plus the panel addresses themselves: a
// panel on a public address gets exactly that address.
func (m *Manager) permittedRanges() []*net.IPNet {
	ranges := slices.Clone(privateNetworks)

	for _, ip := range m.ips {
		if slices.ContainsFunc(ranges, func(n *net.IPNet) bool { return n.Contains(ip) }) {
			continue
		}

		bits := 8 * len(ip)
		ranges = append(ranges, &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)})
	}

	return ranges
}

func (m *Manager) hosts() []string {
	hosts := make([]string, 0, len(m.ips)+len(m.dns))
	for _, ip := range m.ips {
		hosts = append(hosts, ip.String())
	}

	return append(hosts, m.dns...)
}

// splitHosts sorts the names into IP addresses and DNS names, drops unspecified
// addresses and duplicates, and adds loopback and `localhost`.
func splitHosts(hosts []string) ([]net.IP, []string) {
	ips := map[string]net.IP{}
	dns := map[string]struct{}{"localhost": {}}

	for _, host := range append([]string{"127.0.0.1", "::1"}, hosts...) {
		host = strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
		if host == "" {
			continue
		}

		if addr, err := netip.ParseAddr(host); err == nil {
			addr = addr.Unmap().WithZone("")
			if !addr.IsUnspecified() {
				ips[addr.String()] = net.IP(addr.AsSlice())
			}

			continue
		}

		dns[strings.ToLower(host)] = struct{}{}
	}

	ipList := make([]net.IP, 0, len(ips))
	for _, key := range slices.Sorted(maps.Keys(ips)) {
		ipList = append(ipList, ips[key])
	}

	return ipList, slices.Sorted(maps.Keys(dns))
}

func parseNetworks(cidrs ...string) []*net.IPNet {
	networks := make([]*net.IPNet, 0, len(cidrs))

	for _, cidr := range cidrs {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			panic("cert: network " + cidr + ": " + err.Error())
		}

		networks = append(networks, network)
	}

	return networks
}

func sameNames(cert *x509.Certificate, ips []net.IP, dns []string) bool {
	got := make([]string, 0, len(cert.IPAddresses))
	for _, ip := range cert.IPAddresses {
		got = append(got, ip.String())
	}

	want := make([]string, 0, len(ips))
	for _, ip := range ips {
		want = append(want, ip.String())
	}

	slices.Sort(got)

	return slices.Equal(got, want) && slices.Equal(slices.Sorted(slices.Values(cert.DNSNames)), dns)
}

func decodePair(keyPEM, certPEM []byte) (*ecdsa.PrivateKey, *x509.Certificate, error) {
	pair, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, nil, err
	}

	key, ok := pair.PrivateKey.(*ecdsa.PrivateKey)
	if !ok {
		return nil, nil, fmt.Errorf("key of type %T, expected ECDSA", pair.PrivateKey)
	}

	return key, pair.Leaf, nil
}

func encodeCert(der []byte) []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
}

func serialNumber() (*big.Int, error) {
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), serialBits))
	if err != nil {
		return nil, fmt.Errorf("certificate serial number: %w", err)
	}

	return serial, nil
}

// notBefore dates a certificate from the clock when it is past clockFloor, and from
// clockFloor otherwise: a router that has not synced its clock yet must still issue a
// certificate that clients with a correct clock accept.
func notBefore(now time.Time) time.Time {
	if !clockSane(now) {
		return clockFloor
	}

	return now.Add(-backdate)
}

func clockSane(now time.Time) bool {
	return !now.Before(clockFloor)
}

func fingerprint(cert *x509.Certificate) string {
	sum := sha256.Sum256(cert.Raw)
	hexed := strings.ToUpper(hex.EncodeToString(sum[:]))
	parts := make([]string, 0, len(sum))

	for i := 0; i < len(hexed); i += 2 {
		parts = append(parts, hexed[i:i+2])
	}

	return strings.Join(parts, ":")
}
