package main

import (
	"fmt"
	"reflect"
	"sort"
	"strings"

	mDNS "github.com/miekg/dns"
	C "github.com/sagernet/sing-box/constant"
)

// 69 fork types have their own serialization, and their JSON shape cannot be derived from
// the fields of the Go struct. The rules for them are collected here. A type with its own
// serialization that is missing here is an error for the generator: silently walking
// its fields would produce a schema that does not match the config.
//
// The rules are written from the fork code (UnmarshalJSON defines what is accepted
// on input), not from the documentation.

// duration: badoption.Duration accepts a string in the time.ParseDuration format.
// A regex instead of transform, otherwise z.toJSONSchema breaks.
const durationPattern = `^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$`

func durationSchema() *schema {
	return scalar(fmt.Sprintf("z.string().regex(/%s/)", durationPattern))
}

// bytesSchema: byteformats.* accepts a number or a string with a unit ("100MB").
func bytesSchema() *schema {
	return union(scalar("z.int().nonnegative()"), scalar("z.string()"))
}

// rangeSchema: badoption.Range[T] accepts a number, a "from-to" string or
// an object {from, to}.
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

// sortedKeys is needed so that enums collected from fork maps are printed
// stably: otherwise the schema changes from run to run.
func sortedKeys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// scalarOverrides are rules by Go type name for the leaves of the tree.
var scalarOverrides = map[string]func() *schema{
	// Durations and sizes.
	"badoption.Duration":             durationSchema,
	"byteformats.Bytes":              bytesSchema,
	"byteformats.MemoryBytes":        bytesSchema,
	"byteformats.NetworkBytes":       bytesSchema,
	"byteformats.NetworkBytesCompat": bytesSchema,

	// Addresses: all have a string form.
	"badoption.Addr":       func() *schema { return scalar("z.string()") },
	"badoption.Prefix":     func() *schema { return scalar("z.string()") },
	"badoption.Prefixable": func() *schema { return scalar("z.string()") },
	"badoption.Regexp":     func() *schema { return scalar("z.string()") },
	"netip.Addr":           func() *schema { return scalar("z.string()") },
	"netip.AddrPort":       func() *schema { return scalar("z.string()") },
	"netip.Prefix":         func() *schema { return scalar("z.string()") },

	// Enums whose values are declared by a switch in the fork.
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

	// Enums whose values lie in exported maps:
	// taken from the fork so the list is not duplicated in the generator.
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

	// Numbers with an alternative string form.
	"option.FwMark": func() *schema {
		return union(scalar("z.int().nonnegative()"), scalar("z.string()"))
	},
	"option.UDPTimeoutCompat": func() *schema {
		return union(scalar("z.int().nonnegative()"), durationSchema())
	},

	// A list of networks: "tcp" | "udp" | an array of them.
	"option.NetworkList": func() *schema {
		return listable(enumSchema("tcp", "udp"))
	},

	// match_response of a DNS rule: true/false or the tag of the server whose response
	// is matched. The type has no fields in JSON, only these two forms.
	"option.DNSRuleMatchResponse": func() *schema {
		return union(scalar("z.boolean()"), scalar("z.string()"))
	},

	// The certificate provider in TLS: the tag of one declared in certificate_providers
	// or the same object inline.
	"option.CertificateProviderOptions": func() *schema {
		tag := scalar("z.string()")
		tag.reference = "certificate_provider"
		return union(tag, ref("CertificateProviderSchema"))
	},

	// The raw JSON of the root config: the content is not parsed.
	"contextjson.RawMessage": func() *schema { return scalar("z.unknown()") },
}

// flattenOnly are the types whose serialization only flattens embedded structs
// or overrides a default value. Their JSON shape matches the fields,
// so they are walked as ordinary structs.
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

// taggedSpecs are static unions: the discriminator and the variant fields.
// The discriminator values are taken from the fork constants.
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
	// The same tree for a separate certificate provider: in 1.14 ACME moved
	// from the inline TLS options to certificate_providers, and the inline form stayed
	// as deprecated.
	"option.ACMEProviderDNS01ChallengeOptions": {discr: "provider", variants: []tagOption{
		{C.DNSProviderAliDNS, "AliDNSOptions"},
		{C.DNSProviderCloudflare, "CloudflareOptions"},
		{C.DNSProviderACMEDNS, "ACMEDNSOptions"},
	}},
	// The protocol version selects which settings are mixed into the client
	// fields: HTTP/2 at 0 and 2, QUIC at 3, HTTP/1.1 has none of its own.
	// The fork treats the value 0 as 2 (`unmarshalHTTPClientVersionOptions`).
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

// shorthand are the types that accept short scalar forms besides an object.
var shorthand = map[string][]string{
	"option.DomainResolveOptions":       {"z.string()"},            // DNS server name
	"option.UDPOverTCPOptions":          {"z.boolean()"},           // just enable
	"option.DERPVerifyClientURLOptions": {"z.string()"},            // URL
	"option.DERPSTUNListenOptions":      {"z.int().nonnegative()"}, // port
	"option.OptimisticDNSOptions":       {"z.boolean()"},           // just enable
	"option.TailscaleSSHServerOptions":  {"z.boolean()"},           // just enable
	"option.HTTPClientOptions":          {"z.string()"},            // client tag from http_clients
	// The API service dashboard: enable, a path to ready files or a full object.
	"option.APIDashboardOptions": {"z.boolean()", "z.string()"},
}

// objectForm is the object form of a type: a union by discriminator if it is described
// in the table, otherwise an ordinary struct.
func (w *walker) objectForm(t reflect.Type, name, path string) *schema {
	if spec, ok := taggedSpecs[name]; ok {
		return w.taggedUnion(t, spec, path)
	}

	return w.plainStruct(t, path)
}

// override returns the schema for a type if there is a rule for it.
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
			item := scalar(alt)
			if alt == "z.string()" {
				item.reference = shorthandReference[name]
			}
			items = append(items, item)
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
		// Keeps the key order, but in JSON it is an ordinary object.
		// The value type is taken from the Values() []V signature: the fields of
		// linkedhashmap.Map are unexported, and the generic parameters
		// are not given by reflection.
		values, ok := reflect.PointerTo(t).MethodByName("Values")
		if !ok || values.Type.NumOut() != 1 {
			return nil, false
		}
		return record(w.build(values.Type.Out(0).Elem(), path+"{}")), true
	}

	return nil, false
}
