// Package dataplane читает модель сетевой обвязки — перехват трафика LAN на
// sing-box — из UCI `metabox` и проверяет, стоят ли её цепочки в nft.
//
// Правила ставит и снимает init-скрипт службы sing-box по той же модели, поэтому
// имена секции и опций — контракт с ним. Демон модель только читает.
package dataplane

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/netip"
	"slices"
	"strconv"
	"strings"

	"metabox/internal/uci"
)

const (
	// config и section — где init-скрипт ищет модель: `metabox.dataplane`.
	// Имя `main` занято секцией типа `metabox`, а одно имя на две секции разных
	// типов uci не держит.
	config      = "metabox"
	section     = "dataplane"
	sectionType = "dataplane"

	// fw4Family и fw4Table — таблица fw4, в которую инклюд обвязки кладёт свои
	// цепочки; chainPrefix — общий префикс их имён.
	fw4Family   = "inet"
	fw4Table    = "fw4"
	chainPrefix = "metabox_"
)

// AccessMode — какие источники с интерфейсов LAN идут через sing-box.
type AccessMode string

const (
	// AccessAll — все источники; списки источников хранятся, но не действуют.
	AccessAll AccessMode = "all"
	// AccessListed — только перечисленные в source_ip и source_mac.
	AccessListed AccessMode = "listed"
)

// Model — секция `metabox.dataplane`. Отсутствующая опция получает значение
// по умолчанию из Defaults; список, заданный пустыми значениями, — пустой.
type Model struct {
	// Enabled — ставить ли перехват. Ложь: служба поднимает только sing-box,
	// без nft, ip rule и upstream dnsmasq.
	Enabled bool `json:"enabled"`
	// RedirectPort — порт inbound redirect: сюда уходит TCP из LAN.
	RedirectPort int `json:"redirect_port"`
	// TproxyPort — порт inbound tproxy: сюда уходит UDP из LAN.
	TproxyPort int `json:"tproxy_port"`
	// DNSPort — порт dns-in sing-box, на который dnsmasq отдаёт запросы.
	DNSPort int `json:"dns_port"`
	// DNSHijack — перехватывать udp/53 из LAN на dnsmasq роутера.
	DNSHijack bool `json:"dns_hijack"`
	// SelfMark — метка обхода: пакет с ней идёт мимо перехвата. Совпадает с
	// route.default_mark конфига sing-box, иначе его трафик зациклится.
	SelfMark uint32 `json:"self_mark"`
	// TproxyMark — метка потоков tproxy, по ней ip rule уводит их в RouteTable.
	TproxyMark uint32 `json:"tproxy_mark"`
	// RouteTable — таблица маршрутов с local-маршрутом для tproxy.
	RouteTable uint32     `json:"route_table"`
	AccessMode AccessMode `json:"acl_mode"`
	// SourceIP — источники режима listed: IPv4-адрес или подсеть.
	SourceIP []string `json:"source_ip"`
	// SourceMAC — источники режима listed по MAC: не зависят от смены аренды.
	SourceMAC []string `json:"source_mac"`
	// LANInterface — интерфейсы, с которых перехватывается трафик.
	LANInterface []string `json:"lan_interface"`
	// WANProxyCIDR — назначения, которые всегда идут через sing-box.
	WANProxyCIDR []string `json:"wan_proxy_cidr"`
	// WANDirectCIDR — назначения, которые всегда идут мимо sing-box.
	WANDirectCIDR []string `json:"wan_direct_cidr"`
	// IPv6 — рендерить ли цепочки IPv6; пока ложь, их нет.
	IPv6 bool `json:"ipv6"`
}

// Defaults — модель без единой опции: порты, метки и таблица homeproxy, режим
// listed без источников, то есть перехват стоит, но через sing-box не идёт
// никто.
func Defaults() Model {
	return Model{
		Enabled:       true,
		RedirectPort:  5331,
		TproxyPort:    5332,
		DNSPort:       5333,
		DNSHijack:     true,
		SelfMark:      100,
		TproxyMark:    101,
		RouteTable:    100,
		AccessMode:    AccessListed,
		SourceIP:      []string{},
		SourceMAC:     []string{},
		LANInterface:  []string{"br-lan"},
		WANProxyCIDR:  []string{},
		WANDirectCIDR: []string{},
	}
}

// AppliedReason — почему признак применения не наблюдён, а подставлен ложью.
type AppliedReason string

const (
	// NFTUnavailable — nft не запустился, вернул ненулевой код или путь к нему
	// не задан.
	NFTUnavailable AppliedReason = "nft_unavailable"
	// NFTUnparsed — вывод nft не разобран: обрезан или не JSON.
	NFTUnparsed AppliedReason = "nft_unparsed"
)

// Runner запускает внешнюю команду и отдаёт её вывод с кодом возврата.
// Объявлен функцией по той же причине, что procd.Runner: тип результата
// владельца запуска сюда не импортировать.
type Runner func(ctx context.Context, name string, args ...string) (stdout string, exitCode int, err error)

// Options — пути, которые демон получает флагами. Оба абсолютные: под procd
// PATH не тот, что в шелле.
type Options struct {
	UCI string
	// NFT — пустой путь отключает проверку: признак применения тогда всегда
	// ложь с причиной NFTUnavailable.
	NFT string
}

// Reader читает модель и признак её применения. Ничего не кэширует: модель
// правит владелец по SSH, правила ставит и снимает служба.
type Reader struct {
	run Runner
	uci string
	nft string
}

// New собирает читателя.
func New(run Runner, opts Options) *Reader {
	return &Reader{run: run, uci: opts.UCI, nft: opts.NFT}
}

// Model читает секцию `metabox.dataplane`. Нет конфига `metabox` или секции
// этого типа — модель по умолчанию: так же её читает init-скрипт. Невалидные
// значения — *InvalidError со всеми полями сразу.
func (r *Reader) Model(ctx context.Context) (Model, error) {
	out, code, err := r.run(ctx, r.uci, "-q", "show", config)
	if err != nil {
		return Model{}, fmt.Errorf("uci show %s: %w", config, err)
	}

	if code != 0 {
		return Defaults(), nil
	}

	for _, s := range uci.Parse(out, config) {
		if s.Name == section && s.Type == sectionType {
			return decode(s)
		}
	}

	return Defaults(), nil
}

// ExpectedChains — цепочки, которые init-скрипт службы кладёт в таблицу fw4
// при включённой модели. Имена — контракт с его рендером правил.
func ExpectedChains() []string {
	return []string{
		"metabox_redirect_lanac",
		"metabox_redirect",
		"metabox_output_redir",
		"metabox_mangle_lanac",
		"metabox_mangle_prerouting",
		"metabox_mangle_output",
	}
}

// Applied сообщает, стоят ли цепочки обвязки в таблице fw4. Отказ nft отказом
// не считается: панель обязана показать модель и без него. Ошибка — только
// отмена контекста.
func (r *Reader) Applied(ctx context.Context) (bool, AppliedReason, error) {
	chains, reason, err := r.Chains(ctx)

	return len(chains) > 0, reason, err
}

// Chains отдаёт имена цепочек обвязки, которые стоят в таблице fw4. Причина
// непуста, когда nft не прочитан, — список тогда пуст и ни о чём не говорит.
// Ошибка — только отмена контекста.
//
// Читается `list chains`, а не `list ruleset`: правила не нужны, а вывод
// ruleset с fw4 больше потолка вывода команды и пришёл бы обрезанным.
func (r *Reader) Chains(ctx context.Context) ([]string, AppliedReason, error) {
	if r.nft == "" {
		return nil, NFTUnavailable, nil
	}

	out, code, err := r.run(ctx, r.nft, "-j", "list", "chains")
	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, "", ctxErr
	}

	if err != nil || code != 0 {
		return nil, NFTUnavailable, nil
	}

	var ruleset struct {
		Nftables []struct {
			Chain *struct {
				Family string `json:"family"`
				Table  string `json:"table"`
				Name   string `json:"name"`
			} `json:"chain"`
		} `json:"nftables"`
	}

	if err := json.Unmarshal([]byte(out), &ruleset); err != nil {
		return nil, NFTUnparsed, nil
	}

	var chains []string

	for _, item := range ruleset.Nftables {
		c := item.Chain
		if c != nil && c.Family == fw4Family && c.Table == fw4Table && strings.HasPrefix(c.Name, chainPrefix) {
			chains = append(chains, c.Name)
		}
	}

	return chains, "", nil
}

func decode(s uci.Section) (Model, error) {
	m := Defaults()
	d := decoder{section: s}

	d.flag("enabled", &m.Enabled)
	d.port("redirect_port", &m.RedirectPort)
	d.port("tproxy_port", &m.TproxyPort)
	d.port("dns_port", &m.DNSPort)
	d.flag("dns_hijack", &m.DNSHijack)
	d.number("self_mark", &m.SelfMark)
	d.number("tproxy_mark", &m.TproxyMark)
	d.number("route_table", &m.RouteTable)
	d.aclMode(&m.AccessMode)
	d.list("source_ip", &m.SourceIP, validIPv4)
	d.list("source_mac", &m.SourceMAC, validMAC)
	d.list("lan_interface", &m.LANInterface, nil)
	d.list("wan_proxy_cidr", &m.WANProxyCIDR, validIPv4)
	d.list("wan_direct_cidr", &m.WANDirectCIDR, validIPv4)
	d.flag("ipv6", &m.IPv6)

	d.distinctPorts(m)

	if m.Enabled && len(m.LANInterface) == 0 {
		d.fail("lan_interface", "", ReasonRequired)
	}

	if len(d.errs) > 0 {
		return Model{}, &InvalidError{Fields: d.errs}
	}

	return m, nil
}

type decoder struct {
	section uci.Section
	errs    []FieldError
}

func (d *decoder) fail(field, value string, reason FieldReason) {
	d.errs = append(d.errs, FieldError{Field: field, Value: value, Reason: reason})
}

func (d *decoder) option(name string) (string, bool) {
	values, ok := d.section.Options[name]
	if !ok || len(values) == 0 {
		return "", false
	}

	return values[0], true
}

// flag принимает те же значения, что config_get_bool init-скриптов OpenWrt.
func (d *decoder) flag(name string, dst *bool) {
	raw, ok := d.option(name)
	if !ok {
		return
	}

	switch raw {
	case "1", "on", "true", "yes", "enabled":
		*dst = true
	case "0", "off", "false", "no", "disabled":
		*dst = false
	default:
		d.fail(name, raw, ReasonInvalid)
	}
}

func (d *decoder) port(name string, dst *int) {
	raw, ok := d.option(name)
	if !ok {
		return
	}

	n, err := strconv.Atoi(raw)
	switch {
	case err != nil:
		d.fail(name, raw, ReasonInvalid)
	case n < 1 || n > 65535:
		d.fail(name, raw, ReasonOutOfRange)
	default:
		*dst = n
	}
}

// number — метка или номер таблицы: десятичное число в 32 бита, как их
// принимают nft и ip rule.
func (d *decoder) number(name string, dst *uint32) {
	raw, ok := d.option(name)
	if !ok {
		return
	}

	n, err := strconv.ParseUint(raw, 10, 32)
	if err != nil {
		d.fail(name, raw, ReasonInvalid)

		return
	}

	*dst = uint32(n)
}

func (d *decoder) aclMode(dst *AccessMode) {
	raw, ok := d.option("acl_mode")
	if !ok {
		return
	}

	switch mode := AccessMode(raw); mode {
	case AccessAll, AccessListed:
		*dst = mode
	default:
		d.fail("acl_mode", raw, ReasonInvalid)
	}
}

// list пропускает пустые значения: `list x ”` в UCI означает пустой список.
func (d *decoder) list(name string, dst *[]string, valid func(string) bool) {
	values, ok := d.section.Options[name]
	if !ok {
		return
	}

	out := []string{}

	for _, v := range values {
		if v == "" {
			continue
		}

		if valid != nil && !valid(v) {
			d.fail(name, v, ReasonInvalid)

			continue
		}

		out = append(out, v)
	}

	*dst = out
}

func (d *decoder) distinctPorts(m Model) {
	seen := []int{}

	for _, p := range []struct {
		name string
		port int
	}{
		{"redirect_port", m.RedirectPort},
		{"tproxy_port", m.TproxyPort},
		{"dns_port", m.DNSPort},
	} {
		if slices.Contains(seen, p.port) {
			d.fail(p.name, strconv.Itoa(p.port), ReasonDuplicate)
		}

		seen = append(seen, p.port)
	}
}

// validIPv4 принимает IPv4-адрес или подсеть без бит хоста: подсеть вида
// 192.168.1.5/24 в набор nft не ляжет.
func validIPv4(s string) bool {
	if addr, err := netip.ParseAddr(s); err == nil {
		return addr.Is4()
	}

	prefix, err := netip.ParsePrefix(s)

	return err == nil && prefix.Addr().Is4() && prefix == prefix.Masked()
}

// validMAC принимает только MAC Ethernet: net.ParseMAC пропускает и 8-, и
// 20-байтные адреса, а `ether saddr` сравнивает шесть байт.
func validMAC(s string) bool {
	hw, err := net.ParseMAC(s)

	return err == nil && len(hw) == 6
}
