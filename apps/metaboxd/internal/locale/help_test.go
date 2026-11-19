package locale

import (
	"context"
	"errors"
	"flag"
	"testing"
)

func TestHelpLang(t *testing.T) {
	saved := func(out string, code int, err error) func(context.Context, string, ...string) (string, int, error) {
		return func(context.Context, string, ...string) (string, int, error) { return out, code, err }
	}

	tests := []struct {
		name string
		args []string
		uci  string
		run  func(context.Context, string, ...string) (string, int, error)
		want Lang
	}{
		{"no help asked: syslog stays English", []string{"-lang", "ru", "-bogus"}, "/sbin/uci", saved("ru\n", 0, nil), English},
		{"explicit -lang wins over UCI", []string{"-lang", "en", "-h"}, "/sbin/uci", saved("ru\n", 0, nil), English},
		{"language from UCI", []string{"--help"}, "/sbin/uci", saved("ru\n", 0, nil), Russian},
		{"no UCI", []string{"-h"}, "", nil, English},
		{"option missing in UCI", []string{"-h"}, "/sbin/uci", saved("", 1, nil), English},
		{"uci not started", []string{"-h"}, "/sbin/uci", saved("", 0, errors.New("нет файла")), English},
		{"unknown language in UCI", []string{"-h"}, "/sbin/uci", saved("de\n", 0, nil), English},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fs := flag.NewFlagSet("metaboxd", flag.ContinueOnError)
			lang := English
			fs.TextVar(&lang, "lang", English, "")
			fs.Bool("h", false, "")
			fs.Bool("help", false, "")
			fs.Bool("bogus", false, "")
			_ = fs.Parse(tt.args)

			if got := HelpLang(fs, tt.args, lang, tt.uci, tt.run); got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}
