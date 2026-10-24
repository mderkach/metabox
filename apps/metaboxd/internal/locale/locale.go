// Package locale is the catalogue of texts the daemon shows the operator. English
// is the source language and the key: a text is written in English where it is
// shown, and the catalogue holds its translations. A text without a translation
// is shown in English. Logs do not go through the catalogue.
package locale

import "fmt"

// Lang is the language the daemon speaks to the operator, set by UCI
// metabox.main.lang through the -lang flag.
type Lang string

// The languages of the catalogue. English is also the fallback for a missing translation.
const (
	English Lang = "en"
	Russian Lang = "ru"
)

// Parse accepts the UCI value of metabox.main.lang.
func Parse(s string) (Lang, error) {
	switch l := Lang(s); l {
	case English, Russian:
		return l, nil
	default:
		return English, fmt.Errorf("language %q is neither en nor ru", s)
	}
}

// UnmarshalText lets Lang be a flag.TextVar.
func (l *Lang) UnmarshalText(text []byte) error {
	parsed, err := Parse(string(text))
	if err != nil {
		return err
	}

	*l = parsed

	return nil
}

// MarshalText prints the flag default in -h.
func (l Lang) MarshalText() ([]byte, error) {
	return []byte(l), nil
}

// T returns text in the language l. text is a string literal: the catalogue test
// finds the texts by the calls in the sources and checks each has a translation.
func T(l Lang, text string) string {
	if l == Russian {
		if translated, ok := ru[text]; ok {
			return translated
		}
	}

	return text
}

// Sprintf is fmt.Sprintf over the translated format. A translation may reorder
// the arguments with explicit indexes, %[2]s.
func Sprintf(l Lang, format string, args ...any) string {
	return fmt.Sprintf(T(l, format), args...)
}
