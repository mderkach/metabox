package main

import (
	"fmt"
	"reflect"
	"sort"
	"strings"

	mDNS "github.com/miekg/dns"
	C "github.com/sagernet/sing-box/constant"
)

// У 69 типов форка своя сериализация, и форма JSON у них не выводится из
// полей Go-структуры. Здесь собраны правила для них. Тип со своей
// сериализацией, которого тут нет, генератор считает ошибкой: молча обойти
// его поля значит выдать схему, не соответствующую конфигу.
//
// Правила записаны по коду форка (UnmarshalJSON определяет, что принимается
// на входе), а не по документации.

// duration: badoption.Duration принимает строку в формате time.ParseDuration.
// Регулярка вместо transform — иначе ломается z.toJSONSchema.
const durationPattern = `^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$`

func durationSchema() *schema {
	return scalar(fmt.Sprintf("z.string().regex(/%s/)", durationPattern))
}

// bytesSchema: byteformats.* принимает число или строку с единицей ("100MB").
func bytesSchema() *schema {
	return union(scalar("z.int().nonnegative()"), scalar("z.string()"))
}

// rangeSchema: badoption.Range[T] принимает число, строку "from-to" или
// объект {from, to}.
func rangeSchema(elem *schema) *schema {
	object := &schema{kind: kindObject, fields: []field{
		{name: "from", schema: elem},
		{name: "to", schema: elem},
	}}
	return union(elem, scalar("z.string()"), object)
}

func enumSchema(values ...string) *schema {
	quoted := make([]string, 0, len(values))
	for _, v := range values {
		quoted = append(quoted, fmt.Sprintf("%q", v))
	}
	return scalar("z.enum([" + strings.Join(quoted, ", ") + "])")
}

// sortedKeys нужен, чтобы enum'ы, собранные из мап форка, печатались
// стабильно: иначе схема меняется от запуска к запуску.
func sortedKeys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// scalarOverrides — правила по имени Go-типа для листьев дерева.
var scalarOverrides = map[string]func() *schema{
	// Длительности и объёмы.
	"badoption.Duration":             durationSchema,
	"byteformats.Bytes":              bytesSchema,
	"byteformats.MemoryBytes":        bytesSchema,
	"byteformats.NetworkBytes":       bytesSchema,
	"byteformats.NetworkBytesCompat": bytesSchema,

	// Адреса: у всех строковая форма.
	"badoption.Addr":       func() *schema { return scalar("z.string()") },
	"badoption.Prefix":     func() *schema { return scalar("z.string()") },
	"badoption.Prefixable": func() *schema { return scalar("z.string()") },
	"badoption.Regexp":     func() *schema { return scalar("z.string()") },
	"netip.Addr":           func() *schema { return scalar("z.string()") },
	"netip.AddrPort":       func() *schema { return scalar("z.string()") },
	"netip.Prefix":         func() *schema { return scalar("z.string()") },

	// Перечисления, значения которых объявлены switch'ем в форке.
	"option.DomainStrategy": func() *schema {
		return enumSchema("", "as_is", "prefer_ipv4", "prefer_ipv6", "ipv4_only", "ipv6_only")
	},
	"option.ClientAuthType": func() *schema {
		return enumSchema("no", "request", "require-any", "verify-if-given", "require-and-verify")
	},
	"option.CurvePreference": func() *schema {
		return enumSchema("P256", "P384", "P521", "X25519", "X25519MLKEM768")
	},
	"option.WildcardSNI": func() *schema {
		return enumSchema("", "off", "authed", "all")
	},

	// Перечисления, значения которых лежат в экспортированных мапах:
	// берём их из форка, чтобы не дублировать список в генераторе.
	"option.NetworkStrategy": func() *schema {
		return enumSchema(sortedKeys(C.StringToNetworkStrategy)...)
	},
	"option.InterfaceType": func() *schema {
		return enumSchema(sortedKeys(C.StringToInterfaceType)...)
	},
	"option.DNSQueryType": func() *schema {
		return union(scalar("z.int().nonnegative()"), enumSchema(sortedKeys(mDNS.StringToType)...))
	},
	"option.DNSRCode": func() *schema {
		return union(scalar("z.int()"), enumSchema(sortedKeys(mDNS.StringToRcode)...))
	},

	// Числа с альтернативной строковой формой.
	"option.FwMark": func() *schema {
		return union(scalar("z.int().nonnegative()"), scalar("z.string()"))
	},
	"option.UDPTimeoutCompat": func() *schema {
		return union(scalar("z.int().nonnegative()"), durationSchema())
	},

	// Список сетей: "tcp" | "udp" | массив из них.
	"option.NetworkList": func() *schema {
		return listable(enumSchema("tcp", "udp"))
	},

	// match_response DNS-правила: true/false либо тег сервера, чей ответ
	// сопоставляется. Полей в JSON у типа нет — только эти две формы.
	"option.DNSRuleMatchResponse": func() *schema {
		return union(scalar("z.boolean()"), scalar("z.string()"))
	},

	// Провайдер сертификата в TLS: тег заведённого в certificate_providers
	// либо тот же объект инлайном.
	"option.CertificateProviderOptions": func() *schema {
		return union(scalar("z.string()"), ref("CertificateProviderSchema"))
	},

	// Сырой JSON корневого конфига: содержимое не разбирается.
	"contextjson.RawMessage": func() *schema { return scalar("z.unknown()") },
}

// flattenOnly — типы, чья сериализация только уплощает встроенные структуры
// или доопределяет значение по умолчанию. Форма JSON у них совпадает с полями,
// поэтому обходятся как обычные структуры.
var flattenOnly = map[string]bool{
	"option.Options":                      true,
	"option.DNSOptions":                   true,
	"option.DefaultRule":                  true,
	"option.LogicalRule":                  true,
	"option.DefaultDNSRule":               true,
	"option.LogicalDNSRule":               true,
	"option.DirectOutboundOptions":        true,
	"option.ResolvedServiceOptions":       true,
	"option.RouteOptionsActionOptions":    true,
	"option.DNSRouteOptionsActionOptions": true,
	"option.DirectActionOptions":          true,
	"option.RejectActionOptions":          true,
	"option.DNSRecordOptions":             true,
	"option.CertificateOptions":           true,
	"option.ManagerAPIOptions":            true,
	"option.NodeManagerAPIOptions":        true,
	"option.V2RayXHTTPOptions":            true,
}

// taggedSpecs — статические union'ы: дискриминатор и поля вариантов.
// Значения дискриминаторов берутся из констант форка.
var taggedSpecs = map[string]taggedSpec{
	"option.Rule": {discr: "type", variants: []tagOption{
		{C.RuleTypeDefault, "DefaultOptions"},
		{C.RuleTypeLogical, "LogicalOptions"},
	}},
	"option.DNSRule": {discr: "type", variants: []tagOption{
		{C.RuleTypeDefault, "DefaultOptions"},
		{C.RuleTypeLogical, "LogicalOptions"},
	}},
	"option.HeadlessRule": {discr: "type", variants: []tagOption{
		{C.RuleTypeDefault, "DefaultOptions"},
		{C.RuleTypeLogical, "LogicalOptions"},
	}},
	"option.RuleSet": {discr: "type", variants: []tagOption{
		{C.RuleSetTypeInline, "InlineOptions"},
		{C.RuleSetTypeLocal, "LocalOptions"},
		{C.RuleSetTypeRemote, "RemoteOptions"},
	}},
	"option.RuleAction": {discr: "action", variants: []tagOption{
		{C.RuleActionTypeRoute, "RouteOptions"},
		{C.RuleActionTypeRouteOptions, "RouteOptionsOptions"},
		{C.RuleActionTypeDirect, "DirectOptions"},
		{C.RuleActionTypeBypass, "BypassOptions"},
		{C.RuleActionTypeReject, "RejectOptions"},
		{C.RuleActionTypeHijackDNS, ""},
		{C.RuleActionTypeSniff, "SniffOptions"},
		{C.RuleActionTypeResolve, "ResolveOptions"},
	}},
	"option.DNSRuleAction": {discr: "action", variants: []tagOption{
		{C.RuleActionTypeRoute, "RouteOptions"},
		{C.RuleActionTypeRouteOptions, "RouteOptionsOptions"},
		{C.RuleActionTypeReject, "RejectOptions"},
		{C.RuleActionTypePredefined, "PredefinedOptions"},
	}},
	"option.V2RayTransportOptions": {discr: "type", variants: []tagOption{
		{C.V2RayTransportTypeHTTP, "HTTPOptions"},
		{C.V2RayTransportTypeWebsocket, "WebsocketOptions"},
		{C.V2RayTransportTypeQUIC, "QUICOptions"},
		{C.V2RayTransportTypeGRPC, "GRPCOptions"},
		{C.V2RayTransportTypeHTTPUpgrade, "HTTPUpgradeOptions"},
		{C.V2RayTransportTypeXHTTP, "XHTTPOptions"},
		{C.V2RayTransportTypeKCP, "KCPOptions"},
	}},
	"option.ACMEDNS01ChallengeOptions": {discr: "provider", variants: []tagOption{
		{C.DNSProviderAliDNS, "AliDNSOptions"},
		{C.DNSProviderCloudflare, "CloudflareOptions"},
		{C.DNSProviderACMEDNS, "ACMEDNSOptions"},
	}},
	// То же дерево у отдельного провайдера сертификатов: в 1.14 ACME переехал
	// из inline-опций TLS в certificate_providers, а inline-форма осталась
	// как устаревшая.
	"option.ACMEProviderDNS01ChallengeOptions": {discr: "provider", variants: []tagOption{
		{C.DNSProviderAliDNS, "AliDNSOptions"},
		{C.DNSProviderCloudflare, "CloudflareOptions"},
		{C.DNSProviderACMEDNS, "ACMEDNSOptions"},
	}},
	// Версия протокола выбирает, какие настройки подмешиваются к полям
	// клиента: HTTP/2 при 0 и 2, QUIC при 3, у HTTP/1.1 своих нет.
	// Значение 0 форк трактует как 2 (`unmarshalHTTPClientVersionOptions`).
	"option.HTTPClient": {discr: "version", numeric: true, variants: []tagOption{
		{"0", "HTTP2Options"},
		{"1", ""},
		{"2", "HTTP2Options"},
		{"3", "HTTP3Options"},
	}},
	"option.HTTPClientOptions": {discr: "version", numeric: true, variants: []tagOption{
		{"0", "HTTP2Options"},
		{"1", ""},
		{"2", "HTTP2Options"},
		{"3", "HTTP3Options"},
	}},
	"option.Hysteria2Obfs": {discr: "type", variants: []tagOption{
		{C.Hysteria2ObfsTypeSalamander, ""},
		{C.Hysteria2ObfsTypeGecko, "GeckoOptions"},
	}},
	"option.NetworkNamespace": {discr: "type", variants: []tagOption{
		{C.NetNsTypeDefault, "DefaultOptions"},
		{C.NetNsTypeUnshare, "UnshareOptions"},
	}},
	"option.Hysteria2Masquerade": {discr: "type", variants: []tagOption{
		{C.Hysterai2MasqueradeTypeFile, "FileOptions"},
		{C.Hysterai2MasqueradeTypeProxy, "ProxyOptions"},
		{C.Hysterai2MasqueradeTypeString, "StringOptions"},
	}},
}

// shorthand — типы, которые кроме объекта принимают короткие скалярные формы.
var shorthand = map[string][]string{
	"option.DomainResolveOptions":       {"z.string()"},            // имя DNS-сервера
	"option.UDPOverTCPOptions":          {"z.boolean()"},           // просто включить
	"option.DERPVerifyClientURLOptions": {"z.string()"},            // URL
	"option.DERPSTUNListenOptions":      {"z.int().nonnegative()"}, // порт
	"option.OptimisticDNSOptions":       {"z.boolean()"},           // просто включить
	"option.TailscaleSSHServerOptions":  {"z.boolean()"},           // просто включить
	"option.HTTPClientOptions":          {"z.string()"},            // тег клиента из http_clients
	// Дашборд API-сервиса: включить, путь к готовым файлам или полный объект.
	"option.APIDashboardOptions": {"z.boolean()", "z.string()"},
}

// objectForm — объектная форма типа: union по дискриминатору, если он описан
// в таблице, иначе обычная структура.
func (w *walker) objectForm(t reflect.Type, name, path string) *schema {
	if spec, ok := taggedSpecs[name]; ok {
		return w.taggedUnion(t, spec, path)
	}

	return w.plainStruct(t, path)
}

// override возвращает схему для типа, если для него есть правило.
func (w *walker) override(t reflect.Type, path string) (*schema, bool) {
	name := goTypeName(t)

	if s, ok := w.byGoType[name]; ok {
		return s, true
	}
	if s, ok := scalarOverrides[name]; ok {
		return s(), true
	}
	if flattenOnly[name] {
		return w.plainStruct(t, path), true
	}
	if alts, ok := shorthand[name]; ok {
		items := make([]*schema, 0, len(alts)+1)
		for _, alt := range alts {
			items = append(items, scalar(alt))
		}

		return union(append(items, w.objectForm(t, name, path))...), true
	}
	if spec, ok := taggedSpecs[name]; ok {
		return w.taggedUnion(t, spec, path), true
	}

	switch genericBase(t) {
	case "badoption.Listable":
		return listable(w.build(t.Elem(), path+"[]")), true
	case "badoption.Range":
		field, ok := t.FieldByName("From")
		if !ok {
			return nil, false
		}
		return rangeSchema(w.build(field.Type, path)), true
	case "badjson.TypedMap":
		// Сохраняет порядок ключей, но в JSON это обычный объект.
		// Тип значения снимается с сигнатуры Values() []V: поля
		// linkedhashmap.Map неэкспортируемые, а параметры дженерика
		// рефлексия не отдаёт.
		values, ok := reflect.PointerTo(t).MethodByName("Values")
		if !ok || values.Type.NumOut() != 1 {
			return nil, false
		}
		return record(w.build(values.Type.Out(0).Elem(), path+"{}")), true
	}

	return nil, false
}
