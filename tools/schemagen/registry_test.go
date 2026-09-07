package main

import (
	"reflect"
	"sort"
	"strings"
	"testing"
	"unsafe"

	"github.com/sagernet/sing-box/include"
)

// Генератор перебирает строковые константы форка и спрашивает у реестров, что
// они умеют создавать. Тип, зарегистрированный под строкой, для которой
// константы нет, выпал бы из схемы молча. Здесь ключи реестров читаются
// напрямую и сверяются со списком констант.
//
// unsafe нужен только здесь: поле optionsType неэкспортируемое. В самом
// генераторе его нет.
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
		t.Errorf("типы зарегистрированы под строками, которых нет в константах форка: %s\n"+
			"генератор их не увидит — добавь источник строк в constantStrings",
			strings.Join(missing, ", "))
	}
}

func registryKeys(t *testing.T, registry any) []string {
	t.Helper()

	value := reflect.ValueOf(registry).Elem()
	field := value.FieldByName("optionsType")
	if !field.IsValid() {
		t.Fatalf("в %s нет поля optionsType: устройство реестров в форке изменилось", value.Type())
	}

	options := reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem()
	keys := make([]string, 0, options.Len())
	for _, key := range options.MapKeys() {
		keys = append(keys, key.String())
	}
	return keys
}

// Реестры должны отдавать типы: пустой реестр означает, что include собран
// без нужных build-тегов и схема выйдет обрезанной.
func TestRegistriesAreNotEmpty(t *testing.T) {
	groups, err := collectRegistries()
	if err != nil {
		t.Fatal(err)
	}
	for _, group := range groups {
		if len(group.entries) == 0 {
			t.Errorf("реестр %s пуст", group.name)
		}
	}
}
