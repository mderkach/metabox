package locale

import (
	"flag"
	"fmt"
	"io"
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
