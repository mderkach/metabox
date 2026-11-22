package clashapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode"
)

// ReadRuleNames returns one name per route.rules item, with empty strings for
// unnamed rules. It keeps the original offsets so comments stay tied to list
// positions even when they are absent from the JSON view.
func ReadRuleNames(data []byte) ([]string, error) {
	masked := mask(data)
	start, err := objectStart(masked)
	if err != nil {
		return nil, err
	}
	if !json.Valid(masked) {
		return nil, ErrNotJSON
	}

	route, err := ruleNamesMember(masked, start, "route")
	if err != nil || route == (span{}) || bytes.Equal(masked[route.start:route.end], []byte("null")) {
		return nil, err
	}
	rules, err := ruleNamesMember(masked, route.start, "rules")
	if err != nil || rules == (span{}) || bytes.Equal(masked[rules.start:rules.end], []byte("null")) {
		return nil, err
	}
	if masked[rules.start] != '[' {
		return nil, errors.New("route.rules is not an array")
	}

	dec := json.NewDecoder(bytes.NewReader(masked[rules.start:rules.end]))
	if _, err := dec.Token(); err != nil {
		return nil, fmt.Errorf("read route.rules array: %w", err)
	}

	var names []string
	var raw json.RawMessage
	gapStart := rules.start + 1
	for dec.More() {
		if err := dec.Decode(&raw); err != nil {
			return nil, fmt.Errorf("read route.rules item: %w", err)
		}

		end := rules.start + int(dec.InputOffset())
		names = append(names, ruleNameInGap(data[gapStart:end-len(raw)], len(names) == 0))
		gapStart = end
	}

	return names, nil
}

// The core accepts case aliases, while the panel uses exact JSON keys.
// A duplicate or alias can therefore refer to a different rule list.
func ruleNamesMember(data []byte, start int, key string) (span, error) {
	dec := json.NewDecoder(bytes.NewReader(data[start:]))
	token, err := dec.Token()
	if err != nil {
		return span{}, fmt.Errorf("read rule name object: %w", err)
	}
	if token != json.Delim('{') {
		return span{}, errNotObject
	}

	var found span
	var raw json.RawMessage
	for dec.More() {
		token, err := dec.Token()
		if err != nil {
			return span{}, fmt.Errorf("read rule name key: %w", err)
		}
		if err := dec.Decode(&raw); err != nil {
			return span{}, fmt.Errorf("read rule name value: %w", err)
		}
		name, ok := token.(string)
		if !ok || !strings.EqualFold(name, key) {
			continue
		}
		if name != key || found != (span{}) {
			return span{}, fmt.Errorf("ambiguous %q member in rule name path", key)
		}

		end := start + int(dec.InputOffset())
		found = span{start: end - len(raw), end: end}
	}

	return found, nil
}

// A comment belongs to the next item only after a line break following the
// opening bracket or comma. Block comments are skipped as a single token.
func ruleNameInGap(gap []byte, first bool) string {
	anchored, lineBroken := first, false
	for i := 0; i < len(gap); {
		switch {
		case gap[i] == ',':
			anchored, lineBroken = true, false
		case gap[i] == '\n' || gap[i] == '\r':
			lineBroken = true
		case hasPrefixAt(gap, i, "/*"):
			i = blockCommentEnd(gap, i)

			continue
		case hasPrefixAt(gap, i, "//"):
			end := len(gap)
			if lineBreak := bytes.IndexAny(gap[i:], "\r\n"); lineBreak >= 0 {
				end = i + lineBreak
			}
			if anchored && lineBroken && ruleNameGap(gap[end:]) {
				return strings.TrimFunc(string(gap[i+2:end]), func(r rune) bool {
					return r == '\ufeff' || (r != '\u0085' && unicode.IsSpace(r))
				})
			}
			i = end

			continue
		}
		i++
	}

	return ""
}

func ruleNameGap(gap []byte) bool {
	gap, _ = bytes.CutPrefix(gap, []byte("\r"))
	indents, ok := bytes.CutPrefix(gap, []byte("\n"))

	return ok && len(bytes.Trim(indents, "\t ")) == 0
}
