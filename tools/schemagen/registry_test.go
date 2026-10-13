package main

import (
	"reflect"
	"sort"
	"strings"
	"testing"
	"unsafe"

	"github.com/sagernet/sing-box/include"
)

// The generator iterates over the fork string constants and asks the registries what
// they can create. A type registered under a string with no
// constant would silently drop out of the schema. Here the registry keys are read
// directly and compared with the constant list.
//
// unsafe is needed only here: the optionsType field is unexported. The generator
// itself does not have it.
func TestRegistryKeysHaveConstants(t *testing.T) {
	names, err := constantStrings()
	if err != nil {
		t.Fatal(err)
	}
	known := make(map[string]bool, len(names))
	for _, name := range names {
		known[name] = true
	}

	registries := map[string]any{
		"inbound":  include.InboundRegistry(),
		"outbound": include.OutboundRegistry(),
		"endpoint": include.EndpointRegistry(),
		"provider": include.ProviderRegistry(),
		"dns":      include.DNSTransportRegistry(),
		"service":  include.ServiceRegistry(),
	}

	var missing []string
	for name, registry := range registries {
		for _, key := range registryKeys(t, registry) {
			if !known[key] {
				missing = append(missing, name+":"+key)
			}
		}
	}
	sort.Strings(missing)

	if len(missing) > 0 {
		t.Errorf("types are registered under strings that are not in the fork constants: %s\n"+
			"the generator will not see them: add a string source to constantStrings",
			strings.Join(missing, ", "))
	}
}

func registryKeys(t *testing.T, registry any) []string {
	t.Helper()

	value := reflect.ValueOf(registry).Elem()
	field := value.FieldByName("optionsType")
	if !field.IsValid() {
		t.Fatalf("no optionsType field in %s: the registry structure in the fork changed", value.Type())
	}

	options := reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem()
	keys := make([]string, 0, options.Len())
	for _, key := range options.MapKeys() {
		keys = append(keys, key.String())
	}
	return keys
}

// Registries must return types: an empty registry means include was built
// without the needed build tags and the schema would come out truncated.
func TestRegistriesAreNotEmpty(t *testing.T) {
	groups, err := collectRegistries()
	if err != nil {
		t.Fatal(err)
	}
	for _, group := range groups {
		if len(group.entries) == 0 {
			t.Errorf("registry %s is empty", group.name)
		}
	}
}
