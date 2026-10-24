package main

import (
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/sagernet/sing-box/option"
)

func TestSecretKeyRule(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"password", true},
		{"client_key", true},
		{"client_key_password", true},
		{"mca_key", true},
		{"mca_key_password", true},
		{"private_key_passphrase", true},
		{"auth_token", true},
		{"security_token", true},
		{"zone_token", true},
		{"account_key", true},
		{"license_key", true},
		{"origin_ca_key", true},
		{"mesh_psk", true},
		{"static_key", true},
		{"session_key", true},
		{"seq_key", true},
		{"header_protection_key", true},
		{"x_padding_key", true},
		{"submission_key", true},
		{"uplink_data_key", true},
		{"userkey", true},
		{"host_key", true},
		{"uuid", true},
		{"auth", true},
		{"auth_str", true},
		{"Password", true},
		{"public_key", false},
		{"key_path", false},
		{"key_id", false},
		{"key_type", false},
		{"secret_path", false},
		{"mesh_psk_file", false},
		{"domain_keyword", false},
		{"password_authentication_disabled", false},
		{"authorized_keys", false},
		{"certificate", false},
		{"tag", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isSecretKey(tt.name); got != tt.want {
				t.Errorf("isSecretKey(%q) = %v, want %v", tt.name, got, tt.want)
			}
		})
	}
}

// The catalogue is read off the fork structs; this walk reads the schema tree the panel
// gets, so a field the tree has and the catalogue skips shows up as a missing key. The
// tree is the smaller set: it does not model every variant of every node yet.
func TestSecretCatalogueCoversSchemaFields(t *testing.T) {
	out, err := generateBoth()
	if err != nil {
		t.Fatal(err)
	}

	groups, err := collectRegistries()
	if err != nil {
		t.Fatal(err)
	}

	dir, err := forkDir()
	if err != nil {
		t.Fatal(err)
	}

	w := newWalker(readDocs(dir, docPackages))
	w.registryUnions(groups)
	root := w.build(reflect.TypeOf(option.Options{}), "root")

	found := map[string]bool{}
	var collect func(s *schema)
	collect = func(s *schema) {
		switch s.kind {
		case kindObject:
			for _, f := range s.fields {
				if isSecretKey(f.name) {
					found[strings.ToLower(f.name)] = true
				}
				collect(f.schema)
			}
		case kindArray, kindRecord:
			collect(s.elem)
		case kindUnion, kindTagged:
			for _, v := range s.variants {
				collect(v.schema)
			}
		case kindScalar, kindRef:
		}
	}
	collect(root)
	for _, named := range w.set.byName {
		collect(named.schema)
	}
	if len(found) < 20 {
		t.Fatalf("the schema tree has %d credential fields, the fork has more", len(found))
	}

	for _, key := range slices.Sorted(maps.Keys(found)) {
		if !slices.Contains(out.secrets, key) {
			t.Errorf("catalogue lacks %q", key)
		}
	}

	// The fields issue #102 found unmasked, api_key, which the tree loses behind the
	// api_type choice of the manager-api service, and the header names.
	for _, want := range []string{
		"client_key", "client_key_password", "mca_key", "mca_key_password", "private_key_passphrase",
		"auth_token", "security_token", "zone_token", "account_key", "license_key", "origin_ca_key",
		"mesh_psk", "static_key", "session_key", "seq_key", "header_protection_key", "x_padding_key",
		"submission_key", "uplink_data_key", "api_key", "authorization", "proxy-authorization",
	} {
		if !slices.Contains(out.secrets, want) {
			t.Errorf("catalogue lacks %q", want)
		}
	}

	if !slices.IsSorted(out.secrets) {
		t.Error("catalogue is not sorted")
	}
}

func TestSecretCatalogueIsPrinted(t *testing.T) {
	out, err := generateBoth()
	if err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{`export const SECRET_FIELD_KEYS: readonly string[] = [`, "\n  \"mca_key_password\",\n"} {
		if !strings.Contains(out.schema, want) {
			t.Errorf("schema lacks %q", want)
		}
	}

	for _, want := range []string{"var secretFieldKeys = map[string]bool{", "\n\t\"mca_key_password\":"} {
		if !strings.Contains(out.fields, want) {
			t.Errorf("field reference lacks %q", want)
		}
	}
}
