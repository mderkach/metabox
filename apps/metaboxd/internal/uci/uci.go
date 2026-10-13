// Package uci parses the output of `uci show <config>`. Running the utility itself is left
// to the consumer: each sets the path to it and the return code handling.
package uci

import "strings"

// Section is a UCI config section in file order.
type Section struct {
	// Name is the section name; for an anonymous one `@<type>[N]`, as uci prints it.
	Name string
	Type string
	// Options are the option values. uci prints a list as several quoted values in
	// one line, an option as one; both kinds arrive as a slice.
	Options map[string][]string
}

// Option returns the first option value; empty when there is no option.
func (s Section) Option(name string) string {
	if values := s.Options[name]; len(values) > 0 {
		return values[0]
	}

	return ""
}

// Parse parses the output of `uci show <config>`. Lines of another config and lines
// without `=` are skipped.
func Parse(out, config string) []Section {
	var sections []Section

	index := map[string]int{}
	prefix := config + "."

	for line := range strings.Lines(out) {
		key, value, ok := strings.Cut(strings.TrimRight(line, "\r\n"), "=")
		if !ok {
			continue
		}

		path, ok := strings.CutPrefix(key, prefix)
		if !ok {
			continue
		}

		name, option, isOption := strings.Cut(path, ".")
		if !isOption {
			index[name] = len(sections)
			sections = append(sections, Section{Name: name, Type: value, Options: map[string][]string{}})

			continue
		}

		if i, ok := index[name]; ok {
			sections[i].Options[option] = unquote(value)
		}
	}

	return sections
}

// unquote parses a value in uci notation: words in single quotes separated by
// a space. A quote inside a value uci prints the same way as the shell: closes the
// quotes, puts an escaped quote and opens them again.
func unquote(s string) []string {
	var (
		out     []string
		word    strings.Builder
		inQuote bool
		started bool
	)

	for i := 0; i < len(s); i++ {
		c := s[i]

		switch {
		case inQuote && c == '\'':
			inQuote = false
		case inQuote:
			word.WriteByte(c)
		case c == '\'':
			inQuote, started = true, true
		case c == '\\' && i+1 < len(s):
			i++
			word.WriteByte(s[i])
			started = true
		case c == ' ' || c == '\t':
			if started {
				out = append(out, word.String())
				word.Reset()
				started = false
			}
		default:
			word.WriteByte(c)
			started = true
		}
	}

	if started {
		out = append(out, word.String())
	}

	return out
}
