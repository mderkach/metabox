package cert

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
)

// Source is where the panel certificate comes from: a ready pair from files, or the
// daemon's own root when both paths are empty.
type Source struct {
	Cert string
	Key  string
	// Hosts are what the daemon's own certificate covers; see Options.Hosts.
	Hosts []string
}

// Panel returns the TLS config of the panel and, with the daemon's own root, the root
// certificate the panel hands out for installation; with a ready pair the root is nil.
// Without certificates there is nothing to serve HTTPS with, so a pair that cannot be read
// or a store that cannot hold the daemon's own is an error, and the owner turns HTTPS off
// to run without them. One path without the other is an error as well: the owner meant a
// ready pair, and the daemon's own root in its place asks every device to trust it again.
func Panel(ctx context.Context, store Store, log *slog.Logger, src Source) (*tls.Config, func() []byte, error) {
	if (src.Cert == "") != (src.Key == "") {
		return nil, nil, errors.New("panel certificate and key paths go together")
	}

	if src.Cert != "" {
		config, err := LoadPair(src.Cert, src.Key)
		if err != nil {
			return nil, nil, err
		}

		log.Info("panel certificate from file", "cert", src.Cert,
			"expires", config.Certificates[0].Leaf.NotAfter)

		return config, nil, nil
	}

	certs, err := New(ctx, store, log, Options{Hosts: src.Hosts})
	if err != nil {
		return nil, nil, fmt.Errorf("panel certificate: %w", err)
	}

	if certs.RootCreated() {
		log.Warn("new panel root certificate issued, install it on your devices",
			"path", "/metabox-ca.crt", "ca_sha256", certs.Fingerprint())
	} else {
		log.Info("panel certificate", "ca_sha256", certs.Fingerprint(), "expires", certs.Expiry())
	}

	return certs.Config(), certs.CA, nil
}
