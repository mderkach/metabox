package config

import (
	"bytes"
	"os"
	"syscall"
	"testing"
)

func TestSaveVersionListsCopiesAfterLinkFailure(t *testing.T) {
	root := openTestRoot(t, t.TempDir())
	data := []byte("{\n  \"rules\": []\n}\n")
	lists := map[string][]byte{"my.json": data}

	if err := saveVersionLists(root, 1, nil, lists, root.Link); err != nil {
		t.Fatalf("first snapshot: %v", err)
	}

	firstPath := versionListsName(1) + "/my.json"
	secondPath := versionListsName(2) + "/my.json"
	calls := 0
	link := func(from, to string) error {
		calls++
		if from != firstPath || to != versionListsStaging+"/my.json" {
			t.Errorf("link paths: got %q -> %q", from, to)
		}

		return &os.LinkError{Op: "link", Old: from, New: to, Err: syscall.EXDEV}
	}

	if err := saveVersionLists(root, 2, map[string]string{"my.json": Sum(data)}, lists, link); err != nil {
		t.Fatalf("snapshot after link failure: %v", err)
	}
	if calls != 1 {
		t.Fatalf("link attempts: got %d, expected 1", calls)
	}

	first, err := root.Stat(firstPath)
	if err != nil {
		t.Fatalf("first snapshot file: %v", err)
	}
	second, err := root.Stat(secondPath)
	if err != nil {
		t.Fatalf("second snapshot file: %v", err)
	}
	if os.SameFile(first, second) {
		t.Error("snapshot shares an inode after the link failed")
	}

	for _, path := range []string{firstPath, secondPath} {
		got, err := root.ReadFile(path)
		if err != nil || !bytes.Equal(got, data) {
			t.Errorf("snapshot %s: got %q, error %v, expected %q", path, got, err, data)
		}
	}
	if second.Mode().Perm() != securePerm {
		t.Errorf("copied file permissions: got %o, expected %o", second.Mode().Perm(), securePerm)
	}
	dir, err := root.Stat(versionListsName(2))
	if err != nil {
		t.Fatalf("snapshot directory: %v", err)
	}
	if dir.Mode().Perm() != secureDirPerm {
		t.Errorf("snapshot directory permissions: got %o, expected %o", dir.Mode().Perm(), secureDirPerm)
	}

	if err := root.RemoveAll(versionListsName(1)); err != nil {
		t.Fatalf("remove previous snapshot: %v", err)
	}
	got, err := root.ReadFile(secondPath)
	if err != nil || !bytes.Equal(got, data) {
		t.Errorf("remaining snapshot: got %q, error %v, expected %q", got, err, data)
	}
}
