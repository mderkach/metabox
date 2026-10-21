package cert

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadPairServesTheOwnerCertificate(t *testing.T) {
	store := newMemStore()
	m := newManager(t, store, []string{"192.168.1.1"}, testNow)

	dir := t.TempDir()
	certPath := filepath.Join(dir, "panel.crt")
	keyPath := filepath.Join(dir, "panel.key")

	for path, name := range map[string]string{certPath: ServerCertName, keyPath: ServerKeyName} {
		if err := os.WriteFile(path, store.files[name], 0o600); err != nil {
			t.Fatal(err)
		}
	}

	config, err := LoadPair(certPath, keyPath)
	if err != nil {
		t.Fatalf("LoadPair: %v", err)
	}

	if len(config.Certificates) != 1 || !config.Certificates[0].Leaf.NotAfter.Equal(m.Expiry()) {
		t.Error("the loaded certificate is not the one written to the files")
	}
}

func TestLoadPairRejectsAMismatchedKey(t *testing.T) {
	first := newMemStore()
	newManager(t, first, []string{"192.168.1.1"}, testNow)

	second := newMemStore()
	newManager(t, second, []string{"192.168.1.1"}, testNow)

	dir := t.TempDir()
	certPath := filepath.Join(dir, "panel.crt")
	keyPath := filepath.Join(dir, "panel.key")

	if err := os.WriteFile(certPath, first.files[ServerCertName], 0o600); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(keyPath, second.files[ServerKeyName], 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := LoadPair(certPath, keyPath); err == nil {
		t.Fatal("a key from another certificate was accepted")
	}

	if _, err := LoadPair(filepath.Join(dir, "missing.crt"), keyPath); err == nil {
		t.Fatal("a missing certificate file was accepted")
	}
}
