package uci_test

import (
	"reflect"
	"testing"

	"metabox/internal/uci"
)

func TestParse(t *testing.T) {
	out := "dhcp.@host[0]=host\n" +
		"dhcp.@host[0].name='o'\\''brien'\n" +
		"dhcp.@host[0].mac='aa:bb' 'cc:dd'\n" +
		"firewall.lan=zone\n" +
		"dhcp.lan=dhcp\n" +
		"dhcp.lan.ignore='1'\n" +
		"dhcp.orphan.name='x'\n" +
		"мусор без равенства\n"

	want := []uci.Section{
		{Name: "@host[0]", Type: "host", Options: map[string][]string{
			"name": {"o'brien"},
			"mac":  {"aa:bb", "cc:dd"},
		}},
		{Name: "lan", Type: "dhcp", Options: map[string][]string{"ignore": {"1"}}},
	}

	got := uci.Parse(out, "dhcp")
	if !reflect.DeepEqual(got, want) {
		t.Errorf("секции\nполучили %+v\nожидали  %+v", got, want)
	}

	if got[0].Option("name") != "o'brien" || got[1].Option("absent") != "" {
		t.Errorf("первые значения опций: %q, %q", got[0].Option("name"), got[1].Option("absent"))
	}
}
