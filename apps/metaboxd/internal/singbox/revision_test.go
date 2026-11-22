package singbox

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"metabox/internal/procd"
)

type revisionSupervisor struct {
	state procd.State
}

func (s revisionSupervisor) Service(context.Context, string, string) (procd.State, error) {
	return s.state, nil
}

func TestLoadedRevisionRequiresManagedProcessAndExactProtectedSnapshot(t *testing.T) {
	const pid = 4131
	const start = 8928
	const config = "{\n// original rule names are part of the revision\n}\n"

	digest := fmt.Sprintf("%x", sha256.Sum256([]byte(config)))
	want := RevisionIdentity{PID: pid, Start: start, SHA256: digest}

	for _, tc := range []struct {
		name string
		edit func(t *testing.T, client *Client, proc, snapshot string)
	}{
		{name: "accepts the snapshot of the managed process"},
		{
			name: "keeps foreign processes unverified",
			edit: func(_ *testing.T, client *Client, _, _ string) {
				client.supervisor = revisionSupervisor{}
			},
		},
		{
			name: "keeps the old startup path and fallback unverified",
			edit: func(t *testing.T, client *Client, proc, _ string) {
				writeCoreCommand(t, proc, client.binary, "/etc/metabox/config.json", "-D", "/etc/metabox")
			},
		},
		{
			name: "rejects a process from a different executable",
			edit: func(t *testing.T, _ *Client, proc, snapshot string) {
				exe := filepath.Join(proc, "exe")
				if err := os.Remove(exe); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(snapshot, exe); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "rejects directory mode",
			edit: func(t *testing.T, client *Client, proc, snapshot string) {
				writeCoreCommand(t, proc, client.binary, snapshot, "-D", "/etc/metabox", "-C", "/tmp")
			},
		},
		{
			name: "rejects bytes changed through the snapshot path",
			edit: func(t *testing.T, _ *Client, _, snapshot string) {
				if err := os.Chmod(snapshot, 0600); err != nil {
					t.Fatal(err)
				}
				writeRevisionFixture(t, snapshot, "modified", 0600)
				if err := os.Chmod(snapshot, 0400); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "rejects a snapshot accessible outside the owner",
			edit: func(t *testing.T, _ *Client, _, snapshot string) {
				if err := os.Chmod(snapshot, 0444); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "rejects a symlink at the snapshot path",
			edit: func(t *testing.T, _ *Client, _, snapshot string) {
				if err := os.Remove(snapshot); err != nil {
					t.Fatal(err)
				}
				target := filepath.Join(filepath.Dir(snapshot), "other.json")
				writeRevisionFixture(t, target, config, 0400)
				if err := os.Symlink(target, snapshot); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "rejects a reused PID",
			edit: func(t *testing.T, _ *Client, proc, _ string) {
				writeCoreStat(t, proc, start+1)
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			procRoot := filepath.Join(dir, "proc")
			proc := filepath.Join(procRoot, fmt.Sprint(pid))
			snapshots := filepath.Join(dir, "snapshots")
			for _, path := range []string{proc, snapshots} {
				if err := os.MkdirAll(path, 0700); err != nil {
					t.Fatal(err)
				}
			}

			binary := filepath.Join(dir, "sing-box")
			writeRevisionFixture(t, binary, "managed core", 0700)
			if err := os.Symlink(binary, filepath.Join(proc, "exe")); err != nil {
				t.Fatal(err)
			}

			snapshot := filepath.Join(snapshots, fmt.Sprintf("%d-%d-%s.json", pid, start, digest))
			writeRevisionFixture(t, snapshot, config, 0400)
			writeCoreStat(t, proc, start)
			writeCoreCommand(t, proc, binary, snapshot, "-D", "/etc/metabox")

			client := &Client{
				binary:     binary,
				initScript: "/etc/init.d/metabox-singbox",
				supervisor: revisionSupervisor{state: procd.State{Known: true, Running: true, PID: pid}},
			}
			if tc.edit != nil {
				tc.edit(t, client, proc, snapshot)
			}

			got, err := client.loadedRevision(t.Context(), procRoot, snapshots)
			if tc.edit == nil {
				if err != nil || got != want {
					t.Fatalf("revision: got %+v, %v, want %+v", got, err, want)
				}

				return
			}
			if err == nil || got != (RevisionIdentity{}) {
				t.Errorf("revision should be absent, got %+v, %v", got, err)
			}
		})
	}
}

func TestLoadedRevisionWithoutSupervisor(t *testing.T) {
	client := &Client{}
	if got, err := client.LoadedRevision(t.Context()); !errors.Is(err, ErrNoSupervisor) || got != (RevisionIdentity{}) {
		t.Errorf("without a supervisor: got %+v, %v", got, err)
	}
}

func writeCoreStat(t *testing.T, proc string, start int) {
	t.Helper()
	stat := "4131 (routing) core) S" + strings.Repeat(" 0", 18) + fmt.Sprintf(" %d 0 0\n", start)
	writeRevisionFixture(t, filepath.Join(proc, "stat"), stat, 0600)
}

func writeCoreCommand(t *testing.T, proc, binary, snapshot string, rest ...string) {
	t.Helper()
	args := append([]string{binary, "run", "-c", snapshot}, rest...)
	writeRevisionFixture(t, filepath.Join(proc, "cmdline"), strings.Join(args, "\x00")+"\x00", 0600)
}

func writeRevisionFixture(t *testing.T, path, data string, mode os.FileMode) {
	t.Helper()
	if err := os.WriteFile(path, []byte(data), mode); err != nil {
		t.Fatal(err)
	}
}
