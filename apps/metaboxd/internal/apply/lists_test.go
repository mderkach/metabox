package apply_test

import (
	"errors"
	"maps"
	"slices"
	"testing"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/procd"
)

// A bad list file name is rejected before the transaction touched anything.
func TestStartRejectsBadListName(t *testing.T) {
	tests := []struct {
		name string
		list string
	}{
		{"escape from the subdirectory", "../evil.json"},
		{"nested path", "dir/evil.json"},
		{"no extension", "evil"},
		{"hidden file", ".evil.json"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			lists := apply.Lists{Put: map[string][]byte{tt.list: []byte("{}")}}

			if _, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", ""); !errors.Is(err, apply.ErrListName) {
				t.Fatalf("error %v, expected ErrListName", err)
			}

			if got := h.rec.snapshot(); len(got) != 0 {
				t.Errorf("reached the transaction: %v", got)
			}
		})
	}
}

// A file with the same content and deletion of a nonexistent one are empty actions: only
// real changes get into the transaction, otherwise the replay would read
// a match of an unchanged file as a started write.
func TestStartNarrowsListsToChanges(t *testing.T) {
	h := newHarness(t)
	same := []byte(`{"rules":[]}`)

	h.store.mu.Lock()
	h.store.lists = map[string][]byte{"same.json": same}
	h.store.mu.Unlock()

	lists := apply.Lists{
		Put:    map[string][]byte{"same.json": same, "new.json": []byte("{}")},
		Remove: []string{"absent.json"},
	}

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}

	if _, ok := tx.Lists["same.json"]; ok {
		t.Error("unchanged file got into the transaction")
	}
	if _, ok := tx.Lists["new.json"]; !ok {
		t.Error("the new file is not in the transaction")
	}
	if len(tx.RemovedLists) != 0 {
		t.Errorf("deletion of a nonexistent file got into the transaction: %v", tx.RemovedLists)
	}
}

// An edit of list files bypassing the daemon is caught by the client base, as with the config.
func TestStartChecksListsBase(t *testing.T) {
	h := newHarness(t)

	h.store.mu.Lock()
	h.store.lists = map[string][]byte{"my.json": []byte("{}")}
	h.store.mu.Unlock()

	stale := config.ListsEtag(map[string]string{})

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", stale); !errors.Is(err, apply.ErrListsModified) {
		t.Fatalf("error %v, expected ErrListsModified", err)
	}

	fresh := config.ListsEtag(map[string]string{"my.json": config.Sum([]byte("{}"))})

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", fresh); err != nil {
		t.Fatalf("apply with the correct base: %v", err)
	}
}

// A break after writing the list file but before the config: the write started, and without
// a rollback the device would stay with the new list and the old config.
func TestReplayRollsBackWhenListWritten(t *testing.T) {
	h := newHarness(t)

	h.store.mu.Lock()
	h.store.sum = "старый-конфиг"
	h.store.lists = map[string][]byte{"my.json": []byte("новое")}
	h.store.mu.Unlock()

	seedState(t, h, apply.Transaction{
		ID:     "прерванная",
		Phase:  apply.PhaseApplying,
		Window: window,
		Sum:    "другая-сумма",
		Lists:  map[string]string{"my.json": config.Sum([]byte("новое"))},
	})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("there was no rollback: %v", h.rec.snapshot())
	}
}

// A break before any write: neither the config nor the files matched the transaction targets,
// a rollback from the backup of a previous transaction would only do harm.
func TestReplaySkipsWhenListsUntouched(t *testing.T) {
	h := newHarness(t)

	h.store.mu.Lock()
	h.store.sum = "старый-конфиг"
	h.store.lists = map[string][]byte{
		"my.json":   []byte("старое"),
		"gone.json": []byte("ещё живой"),
	}
	h.store.mu.Unlock()

	seedState(t, h, apply.Transaction{
		ID:           "прерванная",
		Phase:        apply.PhaseApplying,
		Window:       window,
		Sum:          "другая-сумма",
		Lists:        map[string]string{"my.json": config.Sum([]byte("новое"))},
		RemovedLists: []string{"gone.json"},
	})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("rollback without a write: %v", h.rec.snapshot())
	}
}

// The same break, but the file is already deleted: the write started, the rollback must bring it back.
func TestReplayRollsBackWhenListRemoved(t *testing.T) {
	h := newHarness(t)

	h.store.mu.Lock()
	h.store.sum = "старый-конфиг"
	h.store.lists = map[string][]byte{}
	h.store.mu.Unlock()

	seedState(t, h, apply.Transaction{
		ID:           "прерванная",
		Phase:        apply.PhaseApplying,
		Window:       window,
		Sum:          "другая-сумма",
		RemovedLists: []string{"gone.json"},
	})

	if err := h.manager.Replay(t.Context()); err != nil {
		t.Fatalf("replay: %v", err)
	}

	if !slices.Contains(h.rec.snapshot(), "Restore") {
		t.Errorf("there was no rollback: %v", h.rec.snapshot())
	}
}

// The written files go to disk and are available to the next apply as a base.
func TestApplyWritesLists(t *testing.T) {
	h := newHarness(t)
	lists := apply.Lists{Put: map[string][]byte{"my.json": []byte(`{"rules":[]}`)}}

	tx, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", "")
	if err != nil {
		t.Fatalf("apply: %v", err)
	}

	h.waitWindow(t)

	if _, err := h.manager.Confirm(t.Context(), tx.ID); err != nil {
		t.Fatalf("confirm: %v", err)
	}

	h.store.mu.Lock()
	written := h.store.lists["my.json"]
	h.store.mu.Unlock()

	if string(written) != `{"rules":[]}` {
		t.Errorf("%q went to disk", written)
	}
}

// The service resolves a relative list path from its working directory:
// a mismatch with the config directory refuses the apply before the write, instead of
// a rollback by the healthcheck. An unknown directory does not stop the apply.
func TestStartVerifiesWorkdir(t *testing.T) {
	tests := []struct {
		name       string
		workdir    string
		workdirErr error
		wantRefuse bool
	}{
		{"directories match", configDir, nil, false},
		{"match up to the path notation", configDir + "/", nil, false},
		{"default package working directory", "/usr/share/sing-box", nil, true},
		{"directory unknown", "", nil, false},
		{"procd did not answer", "", errors.New("ubus не отвечает"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			h.service.launch = procd.Launch{Workdir: tt.workdir}
			h.service.launchErr = tt.workdirErr
			lists := apply.Lists{Put: map[string][]byte{"my.json": []byte(`{"rules":[]}`)}}

			_, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", "")

			if !tt.wantRefuse {
				if err != nil {
					t.Fatalf("apply: %v", err)
				}

				h.waitWindow(t)

				return
			}

			workdirErr, ok := errors.AsType[*apply.WorkdirError](err)
			if !ok {
				t.Fatalf("error %v, expected WorkdirError", err)
			}
			if workdirErr.Workdir != tt.workdir || workdirErr.ConfigDir != configDir {
				t.Errorf("directories in the failure %q and %q, expected %q and %q",
					workdirErr.Workdir, workdirErr.ConfigDir, tt.workdir, configDir)
			}
			if got := h.rec.snapshot(); len(got) != 0 {
				t.Errorf("reached the transaction: %v", got)
			}
		})
	}
}

// Without list files the working directory does not matter: a config without local is applied
// as before, even when the service is started from the package directory.
func TestStartIgnoresWorkdirWithoutLists(t *testing.T) {
	h := newHarness(t)
	h.service.launch = procd.Launch{Workdir: "/usr/share/sing-box"}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}

	h.waitWindow(t)
}

// The panel package service starts sing-box with a single -c on the daemon config with -D on its
// directory: list files are applied without refusal, and the candidate is checked
// as a file from its own directory.
func TestStartAcceptsPackageService(t *testing.T) {
	h := newHarness(t)
	h.service.launch = procd.Launch{Configs: []string{configDir + "/" + configName}, Workdir: configDir}
	lists := apply.Lists{Put: map[string][]byte{"my.json": []byte(`{"rules":[]}`)}}

	if _, err := h.manager.Start(t.Context(), []byte(validConfig), lists, "", ""); err != nil {
		t.Fatalf("apply: %v", err)
	}

	h.waitWindow(t)

	h.service.mu.Lock()
	dir, file, workdir := h.service.checked[0], h.service.checked[1], h.service.checked[2]
	h.service.mu.Unlock()

	if file != dir+"/"+configName || workdir != dir {
		t.Errorf("check -c %q -D %q, expected -c %q -D %q", file, workdir, dir+"/"+configName, dir)
	}
}

// Restoring a version brings the lists directory to the snapshot: snapshot files
// are written, extra ones are deleted, and names the apply would not accept are not carried by
// the envelope, otherwise a foreign file in the subdirectory would fail the restore.
func TestSnapshotLists(t *testing.T) {
	data := []byte(`{"rules":[]}`)

	tests := []struct {
		name       string
		snapshot   map[string][]byte
		current    map[string]string
		wantPut    []string
		wantRemove []string
	}{
		{
			name:     "snapshot over an empty directory",
			snapshot: map[string][]byte{"a.json": data},
			wantPut:  []string{"a.json"},
		},
		{
			name:       "an empty snapshot removes the current ones",
			snapshot:   map[string][]byte{},
			current:    map[string]string{"a.json": "x", "b.json": "y"},
			wantRemove: []string{"a.json", "b.json"},
		},
		{
			name:       "common ones are written, extra ones are removed",
			snapshot:   map[string][]byte{"a.json": data},
			current:    map[string]string{"a.json": "x", "b.json": "y"},
			wantPut:    []string{"a.json"},
			wantRemove: []string{"b.json"},
		},
		{
			name:     "an invalid name in the snapshot is skipped",
			snapshot: map[string][]byte{"a.json": data, "README": data},
			wantPut:  []string{"a.json"},
		},
		{
			name:     "an invalid name in the directory is not deleted",
			snapshot: map[string][]byte{},
			current:  map[string]string{"notes.txt": "x"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := apply.SnapshotLists(tt.snapshot, tt.current)

			put := slices.Sorted(maps.Keys(got.Put))
			if !slices.Equal(put, tt.wantPut) {
				t.Errorf("written %v, expected %v", put, tt.wantPut)
			}

			if !slices.Equal(got.Remove, tt.wantRemove) {
				t.Errorf("deleted %v, expected %v", got.Remove, tt.wantRemove)
			}

			for name, content := range got.Put {
				if string(content) != string(tt.snapshot[name]) {
					t.Errorf("file %s: written %q, expected %q", name, content, tt.snapshot[name])
				}
			}
		})
	}
}

// The candidate is checked in the mode and from the path base with which procd will start
// the service; a service on a foreign config refuses before the write.
func TestStartChecksLikeTheService(t *testing.T) {
	ours := configDir + "/" + configName

	// packageWorkdir is replaced with an existing directory: the check takes
	// the working directory as the path base only if it exists on disk.
	const packageWorkdir = "<рабочий каталог пакета>"

	tests := []struct {
		name        string
		launch      procd.Launch
		wantFile    bool
		wantWorkdir string
		wantRefuse  bool
	}{
		{name: "command unknown: as with a single file", wantFile: true},
		{
			name:        "package init script: file and package working directory",
			launch:      procd.Launch{Configs: []string{ours}, Workdir: packageWorkdir},
			wantFile:    true,
			wantWorkdir: packageWorkdir,
		},
		{
			name:     "no working directory on disk: the path base is the candidate",
			launch:   procd.Launch{Configs: []string{ours}, Workdir: "/nonexistent/sing-box"},
			wantFile: true,
		},
		{
			name:       "command without -c and -C on a foreign working directory",
			launch:     procd.Launch{Configs: []string{"/usr/share/sing-box/config.json"}, Workdir: "/usr/share/sing-box"},
			wantRefuse: true,
		},
		{name: "relative file with an unknown working directory", launch: procd.Launch{Configs: []string{"config.json"}}, wantRefuse: true},
		{
			name:     "file with the config working directory",
			launch:   procd.Launch{Configs: []string{ours}, Workdir: configDir},
			wantFile: true,
		},
		{name: "directory mode", launch: procd.Launch{ConfigDirs: []string{configDir}, Workdir: configDir}},
		{name: "foreign config file", launch: procd.Launch{Configs: []string{"/var/run/other-proxy/sing-box.json"}}, wantRefuse: true},
		{name: "several files", launch: procd.Launch{Configs: []string{ours, configDir + "/extra.json"}}, wantRefuse: true},
		{name: "file and directory together", launch: procd.Launch{Configs: []string{ours}, ConfigDirs: []string{configDir}}, wantRefuse: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h := newHarness(t)
			h.service.launch = tt.launch

			if tt.launch.Workdir == packageWorkdir {
				h.service.launch.Workdir = t.TempDir()
				tt.wantWorkdir = h.service.launch.Workdir
			}

			_, err := h.manager.Start(t.Context(), []byte(validConfig), apply.Lists{}, "", "")

			if tt.wantRefuse {
				launchErr, ok := errors.AsType[*apply.LaunchError](err)
				if !ok {
					t.Fatalf("error %v, expected LaunchError", err)
				}
				if launchErr.Config != ours {
					t.Errorf("daemon config in the failure %q, expected %q", launchErr.Config, ours)
				}
				if got := h.rec.snapshot(); len(got) != 0 {
					t.Errorf("reached the transaction: %v", got)
				}

				return
			}

			if err != nil {
				t.Fatalf("apply: %v", err)
			}
			h.waitWindow(t)

			h.service.mu.Lock()
			dir, file, workdir := h.service.checked[0], h.service.checked[1], h.service.checked[2]
			h.service.mu.Unlock()

			if wantFile := dir + "/" + configName; tt.wantFile != (file == wantFile) || (!tt.wantFile && file != "") {
				t.Errorf("check file %q with directory %q, expected a file: %v", file, dir, tt.wantFile)
			}

			wantWorkdir := tt.wantWorkdir
			if wantWorkdir == "" {
				wantWorkdir = dir
			}
			if workdir != wantWorkdir {
				t.Errorf("check path base %q, expected %q", workdir, wantWorkdir)
			}
		})
	}
}
