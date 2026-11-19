package locale

import (
	"context"
	"flag"
	"fmt"
	"io"
	"slices"
	"strings"
)

// PrintDefaults is flag.PrintDefaults in the language l. The usage of each flag
// goes through the catalogue: it is a string literal at the flag definition, and
// the catalogue test takes it from there.
func PrintDefaults(w io.Writer, fs *flag.FlagSet, l Lang) {
	var b strings.Builder

	b.WriteString(Sprintf(l, "Usage of %s:", fs.Name()))
	b.WriteByte('\n')

	fs.VisitAll(func(f *flag.Flag) {
		kind, _ := flag.UnquoteUsage(f)

		b.WriteString("  -" + f.Name)

		if kind != "" {
			b.WriteString(" " + kind)
		}

		b.WriteString("\n    \t")
		b.WriteString(T(l, f.Usage))

		switch f.DefValue {
		case "", "false", "0", "0s":
		default:
			if kind == "string" {
				b.WriteString(Sprintf(l, " (default %q)", f.DefValue))
			} else {
				b.WriteString(Sprintf(l, " (default %v)", f.DefValue))
			}
		}

		b.WriteByte('\n')
	})

	_, _ = fmt.Fprint(w, b.String())
}

// HelpLang is the language of -h: the one from -lang, otherwise the UCI option
// metabox.main.lang that the init script would pass, so help typed by hand on the router
// speaks it too. uci is the path to the utility, empty means no UCI; run starts it. A flag
// error also prints the usage, and under procd that goes to syslog, which stays English:
// only an asked-for help is translated.
func HelpLang(
	fs *flag.FlagSet,
	args []string,
	lang Lang,
	uci string,
	run func(ctx context.Context, name string, args ...string) (string, int, error),
) Lang {
	if !slices.ContainsFunc(args, isHelpFlag) {
		return English
	}

	explicit := false

	fs.Visit(func(f *flag.Flag) {
		explicit = explicit || f.Name == "lang"
	})

	if explicit || uci == "" {
		return lang
	}

	out, code, err := run(context.Background(), uci, "-q", "get", "metabox.main.lang")
	if err != nil || code != 0 {
		return lang
	}

	saved, err := Parse(strings.TrimSpace(out))
	if err != nil {
		return lang
	}

	return saved
}

func isHelpFlag(arg string) bool {
	switch arg {
	case "-h", "-help", "--h", "--help":
		return true
	default:
		return false
	}
}
