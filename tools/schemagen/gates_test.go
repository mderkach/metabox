package main

import "testing"

// Таблица тегов читается из исходников форка, а не из реестра: заглушка без
// тега регистрирует тот же тип. Здесь сверены случаи, на которых разбор легко
// ошибиться.
func TestBuildGates(t *testing.T) {
	dir, err := forkDir()
	if err != nil {
		t.Fatal(err)
	}

	gates, err := buildGates(dir)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name     string
		registry string
		key      string
		want     string
	}{
		{"прямая регистрация в заглушке", "outbound", "hysteria2", "with_quic"},
		{"тип только в файле с тегом, через пакет протокола", "endpoint", "warp", "with_wireguard"},
		{"условие с платформенной частью", "service", "usbip-server", "with_usbip"},
		{"DNS-транспорт", "dns", "dhcp", "with_dhcp"},
		{"соседняя функция пакета регистрирует тип без тега", "inbound", "naive", ""},
		{"тип без тега вовсе", "outbound", "vless", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := gates[tt.registry][tt.key]; got != tt.want {
				t.Errorf("%s/%s: тег %q, ожидали %q", tt.registry, tt.key, got, tt.want)
			}
		})
	}
}
