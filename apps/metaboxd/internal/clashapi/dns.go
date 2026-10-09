package clashapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"time"
)

// DNSInbound — адрес, по которому демон достучится до dns-in кандидата.
type DNSInbound struct {
	Address string
	// Network — "tcp" или "udp", когда inbound принимает только один из них;
	// пусто — оба.
	Network string
}

// ReadDNSInbound ищет dns-in: первый inbound типа direct с listen_port, равным
// port — порту, на который init-скрипт отдаёт запросы dnsmasq. Тег не
// учитывается: у homeproxy он `dns-in`, у владельца может быть любым, а порт
// задаёт модель обвязки. Ложь без ошибки — такого inbound в конфиге нет.
func ReadDNSInbound(data []byte, port int) (DNSInbound, bool, error) {
	var cfg struct {
		Inbounds []struct {
			Type       string `json:"type"`
			Listen     string `json:"listen"`
			ListenPort int    `json:"listen_port"`
			Network    string `json:"network"`
		} `json:"inbounds"`
	}

	if err := json.Unmarshal(mask(data), &cfg); err != nil {
		return DNSInbound{}, false, fmt.Errorf("чтение inbounds: %w", err)
	}

	for _, in := range cfg.Inbounds {
		if in.Type != "direct" || in.ListenPort != port {
			continue
		}

		host := in.Listen
		switch host {
		case "", "0.0.0.0", "::":
			host = "127.0.0.1"
		}

		return DNSInbound{Address: net.JoinHostPort(host, strconv.Itoa(port)), Network: in.Network}, true, nil
	}

	return DNSInbound{}, false, nil
}

// DNSProbe проверяет, что dns-in поднятого sing-box разрешает имя: ответ
// Clash API этого не доказывает, сломанный раздел dns его не роняет.
type DNSProbe struct {
	name     string
	timeout  time.Duration
	interval time.Duration
	attempts int
}

// NewDNSProbe задаёт имя, которое обязано разрешаться, потолок одной попытки,
// паузу между попытками и их число. NXDOMAIN и ответ без адреса — тоже
// отказ: имя выбрано как заведомо существующее.
func NewDNSProbe(name string, timeout, interval time.Duration, attempts int) *DNSProbe {
	return &DNSProbe{name: name, timeout: timeout, interval: interval, attempts: max(1, attempts)}
}

// Probe шлёт A-запрос на inbound до первого ответа с адресом.
func (p *DNSProbe) Probe(ctx context.Context, in DNSInbound) error {
	resolver := &net.Resolver{
		PreferGo: true,
		// Адрес из resolv.conf подменяется: запрос обязан уйти в dns-in, а не
		// в системный резолвер. Сеть подменяется, только когда inbound
		// принимает одну, — разбор ответа Go выбирает по типу соединения.
		Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			if in.Network != "" {
				network = in.Network
			}

			var d net.Dialer

			return d.DialContext(ctx, network, in.Address)
		},
	}

	var last error
	for attempt := range p.attempts {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return fmt.Errorf("DNS-проба %s через %s: %w, последняя попытка: %w", p.name, in.Address, ctx.Err(), last)
			case <-time.After(p.interval):
			}
		}

		attemptCtx, cancel := context.WithTimeout(ctx, p.timeout)
		_, err := resolver.LookupNetIP(attemptCtx, "ip4", p.name)
		cancel()

		if err == nil {
			return nil
		}
		last = err
	}

	return fmt.Errorf("DNS-проба %s через %s, попыток %d: %w", p.name, in.Address, p.attempts, last)
}
