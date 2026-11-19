package cert

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestPanelIssuesOwnRootWithoutPair(t *testing.T) {
	store := newMemStore()

	config, root, err := Panel(t.Context(), store, testLogger(t), Source{Hosts: []string{"192.168.1.1"}})
	if err != nil {
		t.Fatalf("Panel: %v", err)
	}

	if config == nil || root == nil {
		t.Fatalf("config set %v, root set %v: expected both from the own root", config != nil, root != nil)
	}

	if len(root()) == 0 || len(store.files[CACertName]) == 0 {
		t.Error("the own root was not issued and handed out")
	}
}

func TestPanelServesTheOwnerPair(t *testing.T) {
	issued := newMemStore()
	m := newManager(t, issued, []string{"192.168.1.1"}, testNow)

	dir := t.TempDir()
	certPath := filepath.Join(dir, "panel.crt")
	keyPath := filepath.Join(dir, "panel.key")

	for path, name := range map[string]string{certPath: ServerCertName, keyPath: ServerKeyName} {
		if err := os.WriteFile(path, issued.files[name], 0o600); err != nil {
			t.Fatal(err)
		}
	}

	store := newMemStore()

	config, root, err := Panel(t.Context(), store, testLogger(t), Source{Cert: certPath, Key: keyPath})
	if err != nil {
		t.Fatalf("Panel: %v", err)
	}

	if root != nil {
		t.Error("a ready pair handed out a root")
	}
	if len(config.Certificates) != 1 || !config.Certificates[0].Leaf.NotAfter.Equal(m.Expiry()) {
		t.Error("the served certificate is not the owner's")
	}
	if len(store.files) != 0 {
		t.Error("a ready pair issued certificates of its own")
	}
}

func TestPanelRefusesWithoutCertificates(t *testing.T) {
	t.Run("pair not read", func(t *testing.T) {
		dir := t.TempDir()

		_, _, err := Panel(t.Context(), newMemStore(), testLogger(t), Source{
			Cert: filepath.Join(dir, "missing.crt"),
			Key:  filepath.Join(dir, "missing.key"),
		})
		if err == nil {
			t.Error("a missing pair was accepted")
		}
	})

	t.Run("store refuses the own root", func(t *testing.T) {
		store := newMemStore()
		store.writeErr = errors.New("файловая система только для чтения")

		if _, _, err := Panel(t.Context(), store, testLogger(t), Source{Hosts: []string{"192.168.1.1"}}); err == nil {
			t.Error("the panel started without a stored root")
		}
	})
}
