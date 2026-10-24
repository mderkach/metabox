//go:build unix

package locale

import (
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
)

// TestShellTextsFollowLang runs the init-script catalogue and install.sh under sh in
// both languages.
func TestShellTextsFollowLang(t *testing.T) {
	sh, err := exec.LookPath("sh")
	if err != nil {
		t.Skip("no sh on this host")
	}

	catalogue, err := filepath.Abs(filepath.Join(moduleRoot, "package/lib/metabox/locale.sh"))
	if err != nil {
		t.Fatal(err)
	}

	install, err := filepath.Abs(filepath.Join(moduleRoot, "../../install.sh"))
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		lang        Lang
		wantInit    string
		wantInstall string
	}{
		{English, "metaboxd: /usr/bin/metaboxd is missing\n", "install.sh: unknown channel: beta\n"},
		{Russian, "metaboxd: /usr/bin/metaboxd отсутствует\n", "install.sh: неизвестный канал: beta\n"},
	}

	for _, tt := range tests {
		t.Run(string(tt.lang), func(t *testing.T) {
			cmd := exec.CommandContext(t.Context(), sh, "-c", `. "$1"; mb_msg metaboxd "%s is missing" /usr/bin/metaboxd`, "sh", catalogue)
			cmd.Env = []string{"MB_LANG=" + string(tt.lang), "PATH=/usr/bin:/bin"}

			out, err := cmd.CombinedOutput()
			if err != nil {
				t.Fatalf("init catalogue: %v: %s", err, out)
			}

			if string(out) != tt.wantInit {
				t.Errorf("init message %q, want %q", out, tt.wantInit)
			}

			// An unknown channel stops the script before any check of the router.
			cmd = exec.CommandContext(t.Context(), sh, install, "--lang", string(tt.lang), "--channel", "beta")
			cmd.Env = []string{"PATH=/usr/bin:/bin"}

			out, _ = cmd.CombinedOutput()
			if got := string(out); !strings.HasSuffix(got, tt.wantInstall) {
				t.Errorf("install.sh %q, want %q", got, tt.wantInstall)
			}
		})
	}
}

// Without --lang and without a terminal, as under ssh or a script, install.sh goes on in
// English instead of stopping on the language question.
func TestInstallWithoutTerminal(t *testing.T) {
	sh, err := exec.LookPath("sh")
	if err != nil {
		t.Skip("no sh on this host")
	}

	install, err := filepath.Abs(filepath.Join(moduleRoot, "../../install.sh"))
	if err != nil {
		t.Fatal(err)
	}

	cmd := exec.CommandContext(t.Context(), sh, install, "--channel", "beta")
	cmd.Env = []string{"PATH=/usr/bin:/bin"}
	// A new session has no controlling terminal, so /dev/tty cannot be opened.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}

	out, _ := cmd.CombinedOutput()
	if got, want := string(out), "install.sh: unknown channel: beta\n"; got != want {
		t.Errorf("install.sh %q, want %q", got, want)
	}
}
