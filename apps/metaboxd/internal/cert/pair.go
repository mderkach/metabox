package cert

import (
	"crypto/tls"
	"fmt"
)

// LoadPair serves a certificate the owner already has, such as one issued for
// LuCI by acme.sh or their own authority, instead of the daemon root. The files are
// read once: a renewed pair is picked up by a daemon restart.
func LoadPair(certPath, keyPath string) (*tls.Config, error) {
	pair, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("сертификат %s: %w", certPath, err)
	}

	return &tls.Config{
		MinVersion:   tls.VersionTLS12,
		NextProtos:   []string{"http/1.1"},
		Certificates: []tls.Certificate{pair},
	}, nil
}
