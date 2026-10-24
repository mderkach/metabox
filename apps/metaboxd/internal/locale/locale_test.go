package locale

import (
	"errors"
	"flag"
	"io/fs"
	"strings"
	"testing"
)

// withCatalogue replaces the Russian texts for one test, so the mechanism is
// checked on texts the daemon does not have.
func withCatalogue(t *testing.T, texts map[string]string) {
	t.Helper()

	saved := ru
	ru = texts

	t.Cleanup(func() { ru = saved })
}

func TestParse(t *testing.T) {
	tests := []struct {
		in      string
		want    Lang
		wantErr bool
	}{
		{"en", English, false},
		{"ru", Russian, false},
		{"", English, true},
		{"de", English, true},
		{"RU", English, true},
	}

	for _, tt := range tests {
		got, err := Parse(tt.in)
		if got != tt.want || (err != nil) != tt.wantErr {
			t.Errorf("Parse(%q): got %q, %v; want %q, error %v", tt.in, got, err, tt.want, tt.wantErr)
		}
	}
}

func TestTFallsBackToEnglish(t *testing.T) {
	withCatalogue(t, map[string]string{"config missing": "конфига нет"})

	tests := []struct {
		name string
		lang Lang
		text string
		want string
	}{
		{"russian text is translated", Russian, "config missing", "конфига нет"},
		{"english text is the source", English, "config missing", "config missing"},
		{"missing entry stays english", Russian, "no such text", "no such text"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := T(tt.lang, tt.text); got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSprintfReordersArguments(t *testing.T) {
	withCatalogue(t, map[string]string{"%s of %s": "%[2]s: %[1]s"})

	if got, want := Sprintf(Russian, "%s of %s", "port", "dns-in"), "dns-in: port"; got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestErrorKeepsLogEnglishAndTranslatesChain(t *testing.T) {
	withCatalogue(t, map[string]string{
		"config write: %w":     "запись конфига: %w",
		"temporary file in %s": "временный файл в %s",
		"nothing to confirm":   "нечего подтверждать",
		"step %d of %d: %w":    "шаг %d из %d: %w",
		"step %d: %w":          "%[2]w на шаге %[1]d",
	})

	inner := Errorf("temporary file in %s: %w", "/etc/sing-box", fs.ErrPermission)
	err := Errorf("config write: %w", inner)

	if got, want := err.Error(), "config write: temporary file in /etc/sing-box: permission denied"; got != want {
		t.Errorf("Error: got %q, want %q", got, want)
	}

	// The inner format has no entry: it stays English, the outer layer is translated.
	if got, want := Message(Russian, err), "запись конфига: temporary file in /etc/sing-box: permission denied"; got != want {
		t.Errorf("Message: got %q, want %q", got, want)
	}

	if !errors.Is(err, fs.ErrPermission) {
		t.Error("errors.Is does not see the wrapped error")
	}

	if got, ok := errors.AsType[*Error](err); !ok || got != err {
		t.Error("errors.AsType does not find the outer layer")
	}

	sentinel := New("nothing to confirm")
	wrapped := Errorf("step %d of %d: %w", 2, 5, sentinel)

	if !errors.Is(wrapped, sentinel) {
		t.Error("errors.Is does not see a sentinel made by New")
	}

	if got, want := Message(Russian, wrapped), "шаг 2 из 5: нечего подтверждать"; got != want {
		t.Errorf("Message of a wrapped sentinel: got %q, want %q", got, want)
	}

	reordered := Errorf("step %d: %w", 3, sentinel)

	if got, want := Message(Russian, reordered), "нечего подтверждать на шаге 3"; got != want {
		t.Errorf("Message with reordered arguments: got %q, want %q", got, want)
	}

	if got, want := Message(English, wrapped), wrapped.Error(); got != want {
		t.Errorf("English Message: got %q, want %q", got, want)
	}
}

func TestMessageLeavesForeignLayer(t *testing.T) {
	withCatalogue(t, map[string]string{"nothing to confirm": "нечего подтверждать"})

	err := errors.Join(New("nothing to confirm"))

	if got, want := Message(Russian, err), "nothing to confirm"; got != want {
		t.Errorf("got %q, want %q: a foreign layer already holds the English text", got, want)
	}
}

func TestPrintDefaults(t *testing.T) {
	withCatalogue(t, map[string]string{
		"Usage of %s:":               "Использование %s:",
		" (default %q)":              " (по умолчанию %q)",
		" (default %v)":              " (по умолчанию %v)",
		"sing-box config directory":  "каталог конфига sing-box",
		"how long to wait":           "сколько ждать",
		"serve the panel over HTTPS": "обслуживать панель по HTTPS",
	})

	newSet := func() *flag.FlagSet {
		fs := flag.NewFlagSet("metaboxd", flag.ContinueOnError)
		fs.String("config-dir", "/etc/sing-box", "sing-box config directory")
		fs.Duration("confirm-window", 60_000_000_000, "how long to wait")
		fs.Bool("https", false, "serve the panel over HTTPS")

		return fs
	}

	tests := []struct {
		lang Lang
		want string
	}{
		{English, "Usage of metaboxd:\n" +
			"  -config-dir string\n    \tsing-box config directory (default \"/etc/sing-box\")\n" +
			"  -confirm-window duration\n    \thow long to wait (default 1m0s)\n" +
			"  -https\n    \tserve the panel over HTTPS\n"},
		{Russian, "Использование metaboxd:\n" +
			"  -config-dir string\n    \tкаталог конфига sing-box (по умолчанию \"/etc/sing-box\")\n" +
			"  -confirm-window duration\n    \tсколько ждать (по умолчанию 1m0s)\n" +
			"  -https\n    \tобслуживать панель по HTTPS\n"},
	}

	for _, tt := range tests {
		t.Run(string(tt.lang), func(t *testing.T) {
			var b strings.Builder

			PrintDefaults(&b, newSet(), tt.lang)

			if got := b.String(); got != tt.want {
				t.Errorf("got\n%s\nwant\n%s", got, tt.want)
			}
		})
	}
}
