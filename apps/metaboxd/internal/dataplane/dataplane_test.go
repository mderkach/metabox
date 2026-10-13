package dataplane_test

import (
	"context"
	"errors"
	"os"
	"reflect"
	"testing"

	"metabox/internal/dataplane"
)

const (
	testUCI = "/sbin/uci"
	testNFT = "/usr/sbin/nft"
)

type reply struct {
	stdout string
	code   int
	err    error
}

// fakeRunner answers by binary name: the model and the applied flag are read
// by different commands.
type fakeRunner struct {
	replies map[string]reply
	calls   [][]string
}

func (f *fakeRunner) run(_ context.Context, name string, args ...string) (string, int, error) {
	f.calls = append(f.calls, append([]string{name}, args...))
	r := f.replies[name]

	return r.stdout, r.code, r.err
}

func fixture(t *testing.T, name string) string {
	t.Helper()

	data, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}

	return string(data)
}

func newReader(runner *fakeRunner, nft string) *dataplane.Reader {
	return dataplane.New(runner.run, dataplane.Options{UCI: testUCI, NFT: nft})
}

func TestModelFull(t *testing.T) {
	runner := &fakeRunner{replies: map[string]reply{testUCI: {stdout: fixture(t, "uci-full.txt")}}}

	got, err := newReader(runner, testNFT).Model(t.Context())
	if err != nil {
		t.Fatalf("model not read: %v", err)
	}

	want := dataplane.Model{
		Enabled:       true,
		RedirectPort:  6331,
		TproxyPort:    6332,
		DNSPort:       6333,
		DNSHijack:     false,
		SelfMark:      200,
		TproxyMark:    201,
		RouteTable:    300,
		AccessMode:    dataplane.AccessAll,
		SourceIP:      []string{"192.168.1.36/32", "192.168.1.60/31", "192.168.1.5"},
		SourceMAC:     []string{"aa:bb:cc:dd:ee:ff"},
		LANInterface:  []string{"br-lan", "br-guest"},
		WANProxyCIDR:  []string{"1.1.1.0/24"},
		WANDirectCIDR: []string{},
		IPv6:          true,
	}

	if !reflect.DeepEqual(got, want) {
		t.Errorf("model\ngot      %+v\nexpected %+v", got, want)
	}

	if len(runner.calls) != 1 || !reflect.DeepEqual(runner.calls[0], []string{testUCI, "-q", "show", "metabox"}) {
		t.Errorf("calls %v", runner.calls)
	}
}

func TestModelDefaults(t *testing.T) {
	partial := dataplane.Defaults()
	partial.TproxyPort = 7332
	partial.SourceIP = []string{"192.168.1.36/32"}

	tests := []struct {
		name  string
		reply reply
		want  dataplane.Model
	}{
		{"missing options get defaults", reply{stdout: fixture(t, "uci-partial.txt")}, partial},
		{"no dataplane section", reply{stdout: "metabox.main=metabox\nmetabox.main.enabled='1'\n"}, dataplane.Defaults()},
		{"a section with this name of another type", reply{stdout: "metabox.dataplane=metabox\nmetabox.dataplane.redirect_port='1'\n"}, dataplane.Defaults()},
		{"no metabox config", reply{code: 1}, dataplane.Defaults()},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := &fakeRunner{replies: map[string]reply{testUCI: tt.reply}}

			got, err := newReader(runner, testNFT).Model(t.Context())
			if err != nil {
				t.Fatalf("model not read: %v", err)
			}

			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("model\ngot      %+v\nexpected %+v", got, tt.want)
			}
		})
	}
}

func TestModelInvalid(t *testing.T) {
	runner := &fakeRunner{replies: map[string]reply{testUCI: {stdout: fixture(t, "uci-invalid.txt")}}}

	_, err := newReader(runner, testNFT).Model(t.Context())

	invalid, ok := errors.AsType[*dataplane.InvalidError](err)
	if !ok {
		t.Fatalf("expected a validation failure, got %v", err)
	}

	want := []dataplane.FieldError{
		{Field: "enabled", Value: "maybe", Reason: dataplane.ReasonInvalid},
		{Field: "redirect_port", Value: "70000", Reason: dataplane.ReasonOutOfRange},
		{Field: "self_mark", Value: "0x64", Reason: dataplane.ReasonInvalid},
		{Field: "route_table", Value: "-1", Reason: dataplane.ReasonInvalid},
		{Field: "acl_mode", Value: "some", Reason: dataplane.ReasonInvalid},
		{Field: "source_ip", Value: "192.168.1.5/24", Reason: dataplane.ReasonInvalid},
		{Field: "source_ip", Value: "fd00::1", Reason: dataplane.ReasonInvalid},
		{Field: "source_ip", Value: "host", Reason: dataplane.ReasonInvalid},
		{Field: "source_mac", Value: "00:00:00:00:fe:80:00:00:00:00:00:00:02:00:5e:10:00:00:00:01", Reason: dataplane.ReasonInvalid},
		{Field: "dns_port", Value: "5333", Reason: dataplane.ReasonDuplicate},
		{Field: "lan_interface", Value: "", Reason: dataplane.ReasonRequired},
	}

	if !reflect.DeepEqual(invalid.Fields, want) {
		t.Errorf("fields\ngot      %+v\nexpected %+v", invalid.Fields, want)
	}
}

func TestModelUCIFailure(t *testing.T) {
	runner := &fakeRunner{replies: map[string]reply{testUCI: {err: errors.New("exec: no such file")}}}

	if _, err := newReader(runner, testNFT).Model(t.Context()); err == nil {
		t.Error("uci launch failure did not reach the caller")
	}
}

func TestApplied(t *testing.T) {
	tests := []struct {
		name       string
		nft        string
		reply      reply
		want       bool
		wantReason dataplane.AppliedReason
	}{
		{"metabox chains in fw4", testNFT, reply{stdout: fixture(t, "nft-chains-metabox.json")}, true, ""},
		{"no metabox chains in fw4", testNFT, reply{stdout: fixture(t, "nft-chains-foreign.json")}, false, ""},
		{"nft отсутствует", testNFT, reply{err: errors.New("exec: no such file")}, false, dataplane.NFTUnavailable},
		{"nft returned a non-zero code", testNFT, reply{code: 1}, false, dataplane.NFTUnavailable},
		{"nft path not set", "", reply{}, false, dataplane.NFTUnavailable},
		{"output truncated", testNFT, reply{stdout: `{"nftables": [{"chain"` + "\n…вывод обрезан"}, false, dataplane.NFTUnparsed},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runner := &fakeRunner{replies: map[string]reply{tt.nft: tt.reply}}

			got, reason, err := newReader(runner, tt.nft).Applied(t.Context())
			if err != nil {
				t.Fatalf("nft failure became an error: %v", err)
			}

			if got != tt.want || reason != tt.wantReason {
				t.Errorf("got %v/%q, expected %v/%q", got, reason, tt.want, tt.wantReason)
			}
		})
	}
}

func TestAppliedCommand(t *testing.T) {
	runner := &fakeRunner{replies: map[string]reply{testNFT: {stdout: `{"nftables": []}`}}}

	if _, _, err := newReader(runner, testNFT).Applied(t.Context()); err != nil {
		t.Fatal(err)
	}

	if len(runner.calls) != 1 || !reflect.DeepEqual(runner.calls[0], []string{testNFT, "-j", "list", "chains"}) {
		t.Errorf("calls %v", runner.calls)
	}
}

func TestAppliedCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	runner := &fakeRunner{replies: map[string]reply{testNFT: {err: context.Canceled}}}

	if _, _, err := newReader(runner, testNFT).Applied(ctx); !errors.Is(err, context.Canceled) {
		t.Errorf("cancellation lost: %v", err)
	}
}

func TestChains(t *testing.T) {
	runner := &fakeRunner{replies: map[string]reply{testNFT: {stdout: fixture(t, "nft-chains-metabox.json")}}}

	got, reason, err := newReader(runner, testNFT).Chains(t.Context())
	if err != nil || reason != "" {
		t.Fatalf("failure: %v/%q", err, reason)
	}

	if !reflect.DeepEqual(got, []string{"metabox_redirect"}) {
		t.Errorf("chains %q, expected only metabox_redirect from fw4", got)
	}
}
