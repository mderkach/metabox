package clashapi_test

import (
	"bytes"
	"os"
	"slices"
	"strings"
	"testing"

	"metabox/internal/clashapi"
)

func TestReadRuleNamesMatchesPanelCorpus(t *testing.T) {
	data, err := os.ReadFile("../../../web/src/entities/Config/__tests__/corpus/named-rules.jsonc")
	if err != nil {
		t.Fatal(err)
	}

	original := bytes.Clone(data)
	got, err := clashapi.ReadRuleNames(data)
	want := []string{"Sniff first", "", "", "TV through VPN", "Ads", ""}
	if err != nil || !slices.Equal(got, want) {
		t.Fatalf("names: got %q, %v, want %q", got, err, want)
	}
	if !bytes.Equal(data, original) {
		t.Error("reading rule names changed the source file")
	}
}

func TestReadRuleNamesKeepsListPositionsAndCommentOwnership(t *testing.T) {
	data := []byte(strings.Join([]string{
		`{"dns":{"rules":[`,
		`  // DNS name`,
		`  {}]}, "route": {"rules": [ // same line as opening bracket`,
		`  {"domain":"https://example.invalid/path//keep"}, // previous element`,
		`  // not a name after a blank line`,
		``,
		`  {},`,
		`  // discarded when followed by a block`,
		`  /* // masked in a block */`,
		`  {},`,
		`  // section heading`,
		"  // \u00a0Устройства\ufeff  ",
		`  {}`,
		`  // belongs to the preceding element, before the comma`,
		`  , // shares the separator line`,
		`  {},`,
		`  // Cannot use the previous heading if the last name is empty`,
		`  //   `,
		`  null,`,
		`  /* Notes here */ // Proxies`,
		`  {"rules":[{"outbound":"proxy"}]},`,
		`  // Below the final item`,
		`],},}`,
	}, "\r\n"))

	got, err := clashapi.ReadRuleNames(data)
	want := []string{"", "", "", "Устройства", "", "", "Proxies"}
	if err != nil || !slices.Equal(got, want) {
		t.Fatalf("names: got %q, %v, want %q", got, err, want)
	}
}

func TestReadRuleNamesRejectsAmbiguousOrMalformedLists(t *testing.T) {
	for _, data := range []string{
		`{"route":{"rules":[{}]},"route":{"rules":[{}]}}`,
		`{"route":{"rules":[{}],"rules":[{}]}}`,
		`{"route":{"rules":[{}],"RULES":[{}]}}`,
		`{"route":{"rules":[{}]},"Route":{"rules":[{}]}}`,
		`{"ROUTE":{"rules":[{}]}}`,
		`{"route":{"rules":[{}]},"unterminated":`,
		`{"route":[]}`,
		`{"route":{"rules":{}}}`,
		`[]`,
	} {
		if got, err := clashapi.ReadRuleNames([]byte(data)); err == nil || len(got) != 0 {
			t.Errorf("malformed or ambiguous document %q: got %q, %v", data, got, err)
		}
	}

	for _, data := range []string{`{}`, `{"route":null}`, `{"route":{}}`, `{"route":{"rules":null}}`, `{"route":{"rules":[]}}`} {
		if got, err := clashapi.ReadRuleNames([]byte(data)); err != nil || len(got) != 0 {
			t.Errorf("empty rule list %q: got %q, %v", data, got, err)
		}
	}
}
