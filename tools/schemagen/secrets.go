package main

import (
	"maps"
	"reflect"
	"slices"
	"strconv"
	"strings"
)

// The secret catalogue is the list of config keys whose values are credentials. The fork
// has no type for them: a password is a plain string, key material a Listable[string], so
// the only mark is the field name, and the rule is by name. The catalogue is printed into
// both artifacts, and the panel forms and the daemon's MCP mask hide the listed keys
// whole wherever they appear; a key is matched in lower case.
//
// A field is a credential when its JSON name ends with one of secretSuffixes or is one of
// secretNames, and is not one of publicKeys. The suffix catches every compound the fork
// forms (client_key, mca_key_password, private_key_passphrase, zone_token, mesh_psk) and
// leaves the neighbours that only point at a secret or describe it (key_path,
// mesh_psk_file, secret_path, key_id, key_type, password_authentication_disabled).
var (
	secretSuffixes = []string{"key", "password", "secret", "token", "psk", "passphrase", "uuid"}

	// auth is the hysteria credential as bytes; the same name in openvpn is a digest name,
	// and hiding it costs less than showing the credential. auth_str is the hysteria
	// credential as a string.
	secretNames = []string{"auth", "auth_str"}

	// public_key is the peer's public half (reality, wireguard): not a secret, and the user
	// needs to read it. host_key is not excluded: in the ssh service it is the server's
	// private host key.
	publicKeys = []string{"public_key"}

	// HTTP header names that carry credentials inside a headers map. The map has no fields
	// in the schema, so the walk cannot find them.
	secretHeaders = []string{"authorization", "proxy-authorization"}
)

// isSecretKey applies the name rule to a JSON key.
func isSecretKey(name string) bool {
	name = strings.ToLower(name)
	if slices.Contains(publicKeys, name) {
		return false
	}
	if slices.Contains(secretNames, name) {
		return true
	}
	for _, suffix := range secretSuffixes {
		if strings.HasSuffix(name, suffix) {
			return true
		}
	}
	return false
}

// secretCatalogue collects the credential keys of the fork option types reachable from the
// roots, and the header names, sorted and in lower case. It reads the Go structs, not the
// schema tree: a variant the tree does not model yet (the manager-api service chooses its
// options by api_type behind json:"-" fields) still has its api_key hidden.
func secretCatalogue(roots []reflect.Type) []string {
	keys := map[string]bool{}
	for _, header := range secretHeaders {
		keys[header] = true
	}

	seen := map[reflect.Type]bool{}
	for _, root := range roots {
		collectSecretFields(root, seen, keys)
	}

	return slices.Sorted(maps.Keys(keys))
}

// collectSecretFields records the JSON names of the struct fields that match the rule, at
// any depth; collections and pointers are looked through, a struct is visited once.
func collectSecretFields(t reflect.Type, seen map[reflect.Type]bool, keys map[string]bool) {
	for t.Kind() == reflect.Pointer || t.Kind() == reflect.Slice || t.Kind() == reflect.Array || t.Kind() == reflect.Map {
		t = t.Elem()
	}
	if t.Kind() != reflect.Struct || seen[t] {
		return
	}
	seen[t] = true

	for i := range t.NumField() {
		f := t.Field(i)
		if f.PkgPath != "" {
			continue
		}
		name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		if name != "-" && name != "" && isSecretKey(name) {
			keys[strings.ToLower(name)] = true
		}
		collectSecretFields(f.Type, seen, keys)
	}
}

func emitSecretKeys(b *strings.Builder, keys []string) {
	b.WriteString(`/**
 * Config keys whose values are credentials, by the name rule of tools/schemagen/secrets.go,
 * plus the header names that carry credentials; lower case. Forms and the daemon's MCP
 * mask hide their values whole at any depth.
 */
export const SECRET_FIELD_KEYS: readonly string[] = [
`)
	for _, key := range keys {
		b.WriteString("  " + strconv.Quote(key) + ",\n")
	}
	b.WriteString("]\n\n")
}

func emitGoSecretKeys(b *strings.Builder, keys []string) {
	b.WriteString(`// secretFieldKeys are the config keys whose values are credentials, by the name rule of
// tools/schemagen/secrets.go, plus the header names that carry credentials; lower case.
var secretFieldKeys = map[string]bool{
`)
	for _, key := range keys {
		b.WriteString("\t" + strconv.Quote(key) + ": true,\n")
	}
	b.WriteString("}\n")
}
