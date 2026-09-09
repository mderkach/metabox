// Сгенерировано tools/schemagen из sing-box-extended v1.13.18-extended-2.6.5. Не редактировать:
// правится генератор, файл пересобирается `make schema`.
//
// Схемы держатся представимыми для z.toJSONSchema(): по ним строится
// авторендерер непокрытых узлов конфига (docs/adr/ADR-0001).

import * as z from "zod"

export const ACMEDNS01ChallengeOptionsSchema = z.union([
  z.looseObject({
    provider: z.literal("alidns").optional(),
    access_key_id: z.string().optional(),
    access_key_secret: z.string().optional(),
    region_id: z.string().optional(),
    security_token: z.string().optional(),
  }),
  z.looseObject({
    provider: z.literal("cloudflare").optional(),
    api_token: z.string().optional(),
    zone_token: z.string().optional(),
  }),
  z.looseObject({
    provider: z.literal("acmedns").optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    subdomain: z.string().optional(),
    server_url: z.string().optional(),
  }),
])

export const ACMEExternalAccountOptionsSchema = z.looseObject({
  key_id: z.string().optional(),
  mac_key: z.string().optional(),
})

export const AnyTLSUserSchema = z.looseObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const BandwidthLimiterUserSchema = z.looseObject({
  name: z.string().optional(),
  strategy: z.string().optional(),
  connection_type: z.string().optional(),
  mode: z.string().optional(),
  speed: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
})

export const BondOutboundSchema = z.looseObject({
  get outbound() {
    return OutboundSchema.optional()
  },
  download_ratio: z.int().nonnegative().optional(),
  upload_ratio: z.int().nonnegative().optional(),
  count: z.int().nonnegative().optional(),
})

export const BrutalOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  up_mbps: z.int().optional(),
  down_mbps: z.int().optional(),
})

export const CCMUserSchema = z.looseObject({
  name: z.string().optional(),
  token: z.string().optional(),
})

export const CacheFileOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  path: z.string().optional(),
  cache_id: z.string().optional(),
  store_fakeip: z.boolean().optional(),
  store_rdrc: z.boolean().optional(),
  store_warp_config: z.boolean().optional(),
  store_masque_config: z.boolean().optional(),
  rdrc_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const CallCookieSchema = z.looseObject({
  name: z.string().optional(),
  value: z.string().optional(),
})

export const CallCookieListSchema = z.array(CallCookieSchema)

export const CertificateOptionsSchema = z.looseObject({
  store: z.string().optional(),
  certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  certificate_path: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  certificate_directory_path: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
})

export const ClashAPIOptionsSchema = z.looseObject({
  external_controller: z.string().optional(),
  external_ui: z.string().optional(),
  external_ui_download_url: z.string().optional(),
  external_ui_download_detour: z.string().optional(),
  secret: z.string().optional(),
  default_mode: z.string().optional(),
  access_control_allow_origin: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  access_control_allow_private_network: z.boolean().optional(),
  cache_file: z.string().optional(),
  cache_id: z.string().optional(),
  store_mode: z.boolean().optional(),
  store_selected: z.boolean().optional(),
  store_fakeip: z.boolean().optional(),
})

export const ClientAuthTypeSchema = z.enum(["no", "request", "require-any", "verify-if-given", "require-and-verify"])

export const CloudflareProfileSchema = z.looseObject({
  id: z.string().optional(),
  auth_token: z.string().optional(),
  private_key: z.string().optional(),
  license_key: z.string().optional(),
  recreate: z.boolean().optional(),
  detour: z.string().optional(),
})

export const ConnectionLimiterUserSchema = z.looseObject({
  name: z.string().optional(),
  strategy: z.string().optional(),
  connection_type: z.string().optional(),
  count: z.int().nonnegative().optional(),
})

export const CurvePreferenceSchema = z.enum(["P256", "P384", "P521", "X25519", "X25519MLKEM768"])

export const DERPMeshOptionsSchema = z.looseObject({
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  host: z.string().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const DERPSTUNListenOptionsSchema = z.union([
  z.int().nonnegative(),
  z.looseObject({
    enabled: z.boolean().optional(),
    listen: z.string().optional(),
    listen_port: z.int().nonnegative().optional(),
    bind_interface: z.string().optional(),
    get routing_mark() {
      return FwMarkSchema.optional()
    },
    reuse_addr: z.boolean().optional(),
    netns: z.string().optional(),
    disable_tcp_keep_alive: z.boolean().optional(),
    tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tcp_fast_open: z.boolean().optional(),
    tcp_multi_path: z.boolean().optional(),
    udp_fragment: z.boolean().optional(),
    get udp_timeout() {
      return UDPTimeoutCompatSchema.optional()
    },
    detour: z.string().optional(),
    proxy_protocol: z.boolean().optional(),
    proxy_protocol_accept_no_header: z.boolean().optional(),
    sniff: z.boolean().optional(),
    sniff_override_destination: z.boolean().optional(),
    sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
    udp_disable_domain_unmapping: z.boolean().optional(),
  }),
])

export const DERPVerifyClientURLOptionsSchema = z.union([
  z.string(),
  z.looseObject({
    url: z.string().optional(),
    detour: z.string().optional(),
    bind_interface: z.string().optional(),
    inet4_bind_address: z.string().optional(),
    inet6_bind_address: z.string().optional(),
    bind_address_no_port: z.boolean().optional(),
    protect_path: z.string().optional(),
    get routing_mark() {
      return FwMarkSchema.optional()
    },
    reuse_addr: z.boolean().optional(),
    netns: z.string().optional(),
    connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tcp_fast_open: z.boolean().optional(),
    tcp_multi_path: z.boolean().optional(),
    disable_tcp_keep_alive: z.boolean().optional(),
    tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    udp_fragment: z.boolean().optional(),
    get domain_resolver() {
      return DomainResolveOptionsSchema.optional()
    },
    get network_strategy() {
      return NetworkStrategySchema.optional()
    },
    get network_type() {
      return z.union([
        InterfaceTypeSchema,
        z.array(InterfaceTypeSchema),
      ]).optional()
    },
    get fallback_network_type() {
      return z.union([
        InterfaceTypeSchema,
        z.array(InterfaceTypeSchema),
      ]).optional()
    },
    fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
  }),
])

export const DNSOptionsSchema = z.looseObject({
  get servers() {
    return z.array(DnsSchema).optional()
  },
  get rules() {
    return z.array(DNSRuleSchema).optional()
  },
  final: z.string().optional(),
  reverse_mapping: z.boolean().optional(),
  get strategy() {
    return DomainStrategySchema.optional()
  },
  disable_cache: z.boolean().optional(),
  disable_expire: z.boolean().optional(),
  independent_cache: z.boolean().optional(),
  cache_capacity: z.int().nonnegative().optional(),
  client_subnet: z.string().optional(),
  get fakeip() {
    return LegacyDNSFakeIPOptionsSchema.optional()
  },
})

export const DNSQueryTypeSchema = z.union([
  z.int().nonnegative(),
  z.enum(["A", "AAAA", "AFSDB", "AMTRELAY", "ANY", "APL", "ATMA", "AVC", "AXFR", "CAA", "CDNSKEY", "CDS", "CERT", "CNAME", "CSYNC", "DHCID", "DLV", "DNAME", "DNSKEY", "DS", "EID", "EUI48", "EUI64", "GID", "GPOS", "HINFO", "HIP", "HTTPS", "IPSECKEY", "ISDN", "IXFR", "KEY", "KX", "L32", "L64", "LOC", "LP", "MAILA", "MAILB", "MB", "MD", "MF", "MG", "MINFO", "MR", "MX", "NAPTR", "NID", "NIMLOC", "NINFO", "NS", "NSAP-PTR", "NSEC", "NSEC3", "NSEC3PARAM", "NULL", "NXNAME", "NXT", "None", "OPENPGPKEY", "OPT", "PTR", "PX", "RESINFO", "RKEY", "RP", "RRSIG", "RT", "Reserved", "SIG", "SMIMEA", "SOA", "SPF", "SRV", "SSHFP", "SVCB", "TA", "TALINK", "TKEY", "TLSA", "TSIG", "TXT", "UID", "UINFO", "UNSPEC", "URI", "X25", "ZONEMD"]),
])

export const DNSRCodeSchema = z.union([
  z.int(),
  z.enum(["BADALG", "BADCOOKIE", "BADKEY", "BADMODE", "BADNAME", "BADSIG", "BADTIME", "BADTRUNC", "DSOTYPENI", "FORMERR", "NOERROR", "NOTAUTH", "NOTIMP", "NOTIMPL", "NOTZONE", "NXDOMAIN", "NXRRSET", "REFUSED", "SERVFAIL", "YXDOMAIN", "YXRRSET"]),
])

export const DNSRecordOptionsSchema = z.looseObject({
  RR: z.unknown().optional(),
})

export const DefaultDNSRuleBaseSchema = z.looseObject({
  type: z.literal("default").optional(),
  inbound: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  ip_version: z.int().optional(),
  get query_type() {
    return z.union([
      DNSQueryTypeSchema,
      z.array(DNSQueryTypeSchema),
    ]).optional()
  },
  network: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  auth_user: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  protocol: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  domain_suffix: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  domain_keyword: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  domain_regex: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  geosite: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  source_geoip: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  geoip: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  ip_cidr: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  ip_is_private: z.boolean().optional(),
  ip_accept_any: z.boolean().optional(),
  source_ip_cidr: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  source_ip_is_private: z.boolean().optional(),
  source_port: z.union([
    z.int().nonnegative(),
    z.array(z.int().nonnegative()),
  ]).optional(),
  source_port_range: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  port: z.union([
    z.int().nonnegative(),
    z.array(z.int().nonnegative()),
  ]).optional(),
  port_range: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  process_name: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  process_path: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  process_path_regex: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  package_name: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  user: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  user_id: z.union([
    z.int(),
    z.array(z.int()),
  ]).optional(),
  outbound: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  clash_mode: z.string().optional(),
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  network_is_expensive: z.boolean().optional(),
  network_is_constrained: z.boolean().optional(),
  wifi_ssid: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  wifi_bssid: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  interface_address: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  network_interface_address: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  default_interface_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  rule_set: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  rule_set_ip_cidr_match_source: z.boolean().optional(),
  rule_set_ip_cidr_accept_empty: z.boolean().optional(),
  invert: z.boolean().optional(),
  rule_set_ipcidr_match_source: z.boolean().optional(),
})

export const DNSRuleSchema = z.union([
  DefaultDNSRuleBaseSchema.extend({
    action: z.literal("route").optional(),
    server: z.string().optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
  DefaultDNSRuleBaseSchema.extend({
    action: z.literal("route-options").optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
  DefaultDNSRuleBaseSchema.extend({
    action: z.literal("reject").optional(),
    method: z.string().optional(),
    no_drop: z.boolean().optional(),
  }),
  DefaultDNSRuleBaseSchema.extend({
    action: z.literal("predefined").optional(),
    get rcode() {
      return DNSRCodeSchema.optional()
    },
    get answer() {
      return z.union([
        DNSRecordOptionsSchema,
        z.array(DNSRecordOptionsSchema),
      ]).optional()
    },
    get ns() {
      return z.union([
        DNSRecordOptionsSchema,
        z.array(DNSRecordOptionsSchema),
      ]).optional()
    },
    get extra() {
      return z.union([
        DNSRecordOptionsSchema,
        z.array(DNSRecordOptionsSchema),
      ]).optional()
    },
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(DNSRuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("route").optional(),
    server: z.string().optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(DNSRuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("route-options").optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(DNSRuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("reject").optional(),
    method: z.string().optional(),
    no_drop: z.boolean().optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(DNSRuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("predefined").optional(),
    get rcode() {
      return DNSRCodeSchema.optional()
    },
    get answer() {
      return z.union([
        DNSRecordOptionsSchema,
        z.array(DNSRecordOptionsSchema),
      ]).optional()
    },
    get ns() {
      return z.union([
        DNSRecordOptionsSchema,
        z.array(DNSRecordOptionsSchema),
      ]).optional()
    },
    get extra() {
      return z.union([
        DNSRecordOptionsSchema,
        z.array(DNSRecordOptionsSchema),
      ]).optional()
    },
  }),
])

export const DebugOptionsSchema = z.looseObject({
  listen: z.string().optional(),
  gc_percent: z.int().optional(),
  max_stack: z.int().optional(),
  max_threads: z.int().optional(),
  panic_on_fault: z.boolean().optional(),
  trace_back: z.string().optional(),
  memory_limit: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  oom_killer: z.boolean().optional(),
})

export const DefaultRuleBaseSchema = z.looseObject({
  type: z.literal("default").optional(),
  inbound: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  ip_version: z.int().optional(),
  network: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  auth_user: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  protocol: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  client: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  domain_suffix: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  domain_keyword: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  domain_regex: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  geosite: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  source_geoip: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  geoip: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  source_ip_cidr: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  source_ip_is_private: z.boolean().optional(),
  ip_cidr: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  ip_is_private: z.boolean().optional(),
  source_port: z.union([
    z.int().nonnegative(),
    z.array(z.int().nonnegative()),
  ]).optional(),
  source_port_range: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  port: z.union([
    z.int().nonnegative(),
    z.array(z.int().nonnegative()),
  ]).optional(),
  port_range: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  process_name: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  process_path: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  process_path_regex: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  package_name: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  user: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  user_id: z.union([
    z.int(),
    z.array(z.int()),
  ]).optional(),
  clash_mode: z.string().optional(),
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  network_is_expensive: z.boolean().optional(),
  network_is_constrained: z.boolean().optional(),
  wifi_ssid: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  wifi_bssid: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  interface_address: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  network_interface_address: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  default_interface_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  preferred_by: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  rule_set: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  rule_set_ip_cidr_match_source: z.boolean().optional(),
  invert: z.boolean().optional(),
  rule_set_ipcidr_match_source: z.boolean().optional(),
})

export const DnsDhcpSchema = z.looseObject({
  type: z.literal("dhcp"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  prefer_go: z.boolean().optional(),
  interface: z.string().optional(),
})

export const DnsFakeipSchema = z.looseObject({
  type: z.literal("fakeip"),
  tag: z.string().optional(),
  inet4_range: z.string().optional(),
  inet6_range: z.string().optional(),
})

export const DnsFallbackSchema = z.looseObject({
  type: z.literal("fallback"),
  tag: z.string().optional(),
  servers: z.array(z.string()).optional(),
  strategy: z.string().optional(),
  timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const DnsH3Schema = z.looseObject({
  type: z.literal("h3"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  path: z.string().optional(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
})

export const DnsHostsSchema = z.looseObject({
  type: z.literal("hosts"),
  tag: z.string().optional(),
  path: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  predefined: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
})

export const DnsHttpsSchema = z.looseObject({
  type: z.literal("https"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  path: z.string().optional(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
})

export const DnsLocalSchema = z.looseObject({
  type: z.literal("local"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  prefer_go: z.boolean().optional(),
})

export const DnsQuicSchema = z.looseObject({
  type: z.literal("quic"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const DnsResolvedSchema = z.looseObject({
  type: z.literal("resolved"),
  tag: z.string().optional(),
  service: z.string().optional(),
  accept_default_resolvers: z.boolean().optional(),
})

export const DnsSdnsSchema = z.looseObject({
  type: z.literal("sdns"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  stamp: z.string().optional(),
})

export const DnsTailscaleSchema = z.looseObject({
  type: z.literal("tailscale"),
  tag: z.string().optional(),
  endpoint: z.string().optional(),
  accept_default_resolvers: z.boolean().optional(),
})

export const DnsTcpSchema = z.looseObject({
  type: z.literal("tcp"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
})

export const DnsTlsSchema = z.looseObject({
  type: z.literal("tls"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const DnsUdpSchema = z.looseObject({
  type: z.literal("udp"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
})

export const DnsSchema = z.discriminatedUnion("type", [
  DnsDhcpSchema,
  DnsFakeipSchema,
  DnsFallbackSchema,
  DnsH3Schema,
  DnsHostsSchema,
  DnsHttpsSchema,
  DnsLocalSchema,
  DnsQuicSchema,
  DnsResolvedSchema,
  DnsSdnsSchema,
  DnsTailscaleSchema,
  DnsTcpSchema,
  DnsTlsSchema,
  DnsUdpSchema,
])

export const DomainResolveOptionsSchema = z.union([
  z.string(),
  z.looseObject({
    server: z.string().optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
])

export const DomainStrategySchema = z.enum(["", "as_is", "prefer_ipv4", "prefer_ipv6", "ipv4_only", "ipv6_only"])

export const EndpointTailscaleSchema = z.looseObject({
  type: z.literal("tailscale"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  state_directory: z.string().optional(),
  auth_key: z.string().optional(),
  control_url: z.string().optional(),
  ephemeral: z.boolean().optional(),
  hostname: z.string().optional(),
  accept_routes: z.boolean().optional(),
  exit_node: z.string().optional(),
  exit_node_allow_lan_access: z.boolean().optional(),
  advertise_routes: z.array(z.string()).optional(),
  advertise_exit_node: z.boolean().optional(),
  advertise_tags: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  relay_server_port: z.int().nonnegative().optional(),
  relay_server_static_endpoints: z.array(z.string()).optional(),
  system_interface: z.boolean().optional(),
  system_interface_name: z.string().optional(),
  system_interface_mtu: z.int().nonnegative().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
})

export const EndpointVpnClientSchema = z.looseObject({
  type: z.literal("vpn-client"),
  tag: z.string().optional(),
  address: z.string().optional(),
  key: z.string().optional(),
  get outbound() {
    return OutboundSchema.optional()
  },
  pool_size: z.int().nonnegative().optional(),
  reconnect_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  reject_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  default_gateway: z.string().optional(),
})

export const EndpointVpnServerSchema = z.looseObject({
  type: z.literal("vpn-server"),
  tag: z.string().optional(),
  address: z.string().optional(),
  get users() {
    return z.array(VPNUserSchema).optional()
  },
  get inbounds() {
    return z.array(InboundSchema).optional()
  },
  pool_size: z.int().nonnegative().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  default_gateway: z.string().optional(),
})

export const EndpointWarpSchema = z.looseObject({
  type: z.literal("warp"),
  tag: z.string().optional(),
  system: z.boolean().optional(),
  name: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  persistent_keepalive_interval: z.int().nonnegative().optional(),
  workers: z.int().optional(),
  preallocated_buffers_per_pool: z.int().nonnegative().optional(),
  disable_pauses: z.boolean().optional(),
  get amnezia() {
    return WARPAmneziaSchema.optional()
  },
  get profile() {
    return CloudflareProfileSchema.optional()
  },
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const EndpointWireguardSchema = z.looseObject({
  type: z.literal("wireguard"),
  tag: z.string().optional(),
  system: z.boolean().optional(),
  name: z.string().optional(),
  mtu: z.int().nonnegative().optional(),
  address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  private_key: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  get peers() {
    return z.array(WireGuardPeerSchema).optional()
  },
  udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  workers: z.int().optional(),
  preallocated_buffers_per_pool: z.int().nonnegative().optional(),
  disable_pauses: z.boolean().optional(),
  get amnezia() {
    return WireGuardAmneziaSchema.optional()
  },
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const EndpointSchema = z.discriminatedUnion("type", [
  EndpointTailscaleSchema,
  EndpointVpnClientSchema,
  EndpointVpnServerSchema,
  EndpointWarpSchema,
  EndpointWireguardSchema,
])

export const ExperimentalOptionsSchema = z.looseObject({
  get cache_file() {
    return CacheFileOptionsSchema.optional()
  },
  get clash_api() {
    return ClashAPIOptionsSchema.optional()
  },
  get v2ray_api() {
    return V2RayAPIOptionsSchema.optional()
  },
  get unified_delay() {
    return UnifiedDelayOptionsSchema.optional()
  },
  get debug() {
    return DebugOptionsSchema.optional()
  },
})

export const FwMarkSchema = z.union([
  z.int().nonnegative(),
  z.string(),
])

export const GeoIPOptionsSchema = z.looseObject({
  path: z.string().optional(),
  download_url: z.string().optional(),
  download_detour: z.string().optional(),
})

export const GeositeOptionsSchema = z.looseObject({
  path: z.string().optional(),
  download_url: z.string().optional(),
  download_detour: z.string().optional(),
})

export const HTTPProxyOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  bypass_domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  match_domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
})

export const HeadlessRuleSchema = z.union([
  z.looseObject({
    type: z.literal("default").optional(),
    get query_type() {
      return z.union([
        DNSQueryTypeSchema,
        z.array(DNSQueryTypeSchema),
      ]).optional()
    },
    network: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    domain: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    domain_suffix: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    domain_keyword: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    domain_regex: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    source_ip_cidr: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    ip_cidr: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    source_port: z.union([
      z.int().nonnegative(),
      z.array(z.int().nonnegative()),
    ]).optional(),
    source_port_range: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    port: z.union([
      z.int().nonnegative(),
      z.array(z.int().nonnegative()),
    ]).optional(),
    port_range: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    process_name: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    process_path: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    process_path_regex: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    package_name: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    get network_type() {
      return z.union([
        InterfaceTypeSchema,
        z.array(InterfaceTypeSchema),
      ]).optional()
    },
    network_is_expensive: z.boolean().optional(),
    network_is_constrained: z.boolean().optional(),
    wifi_ssid: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    wifi_bssid: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    network_interface_address: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
    default_interface_address: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    invert: z.boolean().optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(HeadlessRuleSchema).optional()
    },
    invert: z.boolean().optional(),
  }),
])

export const Hysteria2MasqueradeSchema = z.union([
  z.looseObject({
    type: z.literal("file").optional(),
    directory: z.string().optional(),
  }),
  z.looseObject({
    type: z.literal("proxy").optional(),
    url: z.string().optional(),
    rewrite_host: z.boolean().optional(),
  }),
  z.looseObject({
    type: z.literal("string").optional(),
    status_code: z.int().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
    content: z.string().optional(),
  }),
])

export const Hysteria2ObfsSchema = z.looseObject({
  type: z.string().optional(),
  password: z.string().optional(),
})

export const Hysteria2UserSchema = z.looseObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const HysteriaUserSchema = z.looseObject({
  name: z.string().optional(),
  auth: z.string().optional(),
  auth_str: z.string().optional(),
})

export const InboundACMEOptionsSchema = z.looseObject({
  domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  data_directory: z.string().optional(),
  default_server_name: z.string().optional(),
  email: z.string().optional(),
  provider: z.string().optional(),
  disable_http_challenge: z.boolean().optional(),
  disable_tls_alpn_challenge: z.boolean().optional(),
  alternative_http_port: z.int().nonnegative().optional(),
  alternative_tls_port: z.int().nonnegative().optional(),
  get external_account() {
    return ACMEExternalAccountOptionsSchema.optional()
  },
  get dns01_challenge() {
    return ACMEDNS01ChallengeOptionsSchema.optional()
  },
})

export const InboundAnytlsSchema = z.looseObject({
  type: z.literal("anytls"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  get users() {
    return z.array(AnyTLSUserSchema).optional()
  },
  padding_scheme: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
})

export const InboundBondSchema = z.looseObject({
  type: z.literal("bond"),
  tag: z.string().optional(),
  get inbounds() {
    return z.array(InboundSchema).optional()
  },
})

export const InboundCallSchema = z.looseObject({
  type: z.literal("call"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  platform: z.string().optional(),
  mode: z.string().optional(),
  read_buffer: z.int().optional(),
  max_buffered_amount: z.int().optional(),
  memory_limit: z.int().optional(),
  get cookies() {
    return CallCookieListSchema.optional()
  },
  join_link: z.string().optional(),
  email: z.string().optional(),
  password: z.string().optional(),
})

export const InboundDirectSchema = z.looseObject({
  type: z.literal("direct"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  override_address: z.string().optional(),
  override_port: z.int().nonnegative().optional(),
})

export const InboundECHOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  key_path: z.string().optional(),
  pq_signature_schemes_enabled: z.boolean().optional(),
  dynamic_record_sizing_disabled: z.boolean().optional(),
})

export const InboundFailoverSchema = z.looseObject({
  type: z.literal("failover"),
  tag: z.string().optional(),
  get inbounds() {
    return z.array(InboundSchema).optional()
  },
})

export const InboundHttpSchema = z.looseObject({
  type: z.literal("http"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  users: z.array(z.looseObject({
    Username: z.string().optional(),
    Password: z.string().optional(),
  })).optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  set_system_proxy: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
})

export const InboundHysteria2Schema = z.looseObject({
  type: z.literal("hysteria2"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  up_mbps: z.int().optional(),
  down_mbps: z.int().optional(),
  get obfs() {
    return Hysteria2ObfsSchema.optional()
  },
  get users() {
    return z.array(Hysteria2UserSchema).optional()
  },
  ignore_client_bandwidth: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  get masquerade() {
    return Hysteria2MasqueradeSchema.optional()
  },
  brutal_debug: z.boolean().optional(),
})

export const InboundHysteriaSchema = z.looseObject({
  type: z.literal("hysteria"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  up: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  up_mbps: z.int().optional(),
  down: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  down_mbps: z.int().optional(),
  obfs: z.string().optional(),
  get users() {
    return z.array(HysteriaUserSchema).optional()
  },
  recv_window_conn: z.int().nonnegative().optional(),
  recv_window_client: z.int().nonnegative().optional(),
  max_conn_client: z.int().optional(),
  disable_mtu_discovery: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
})

export const InboundMieruSchema = z.looseObject({
  type: z.literal("mieru"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  listen_ports: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get users() {
    return z.array(MieruUserSchema).optional()
  },
  transport: z.string().optional(),
  traffic_pattern: z.string().optional(),
  user_hint_is_mandatory: z.boolean().optional(),
})

export const InboundMixedSchema = z.looseObject({
  type: z.literal("mixed"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  users: z.array(z.looseObject({
    Username: z.string().optional(),
    Password: z.string().optional(),
  })).optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  set_system_proxy: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
})

export const InboundMtproxySchema = z.looseObject({
  type: z.literal("mtproxy"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get users() {
    return z.array(MTProxyUserSchema).optional()
  },
  concurrency: z.int().nonnegative().optional(),
  domain_fronting_port: z.int().nonnegative().optional(),
  domain_fronting_host: z.string().optional(),
  domain_fronting_proxy_protocol: z.boolean().optional(),
  prefer_ip: z.string().optional(),
  auto_update: z.boolean().optional(),
  allow_fallback_on_unknown_dc: z.boolean().optional(),
  tolerate_time_skewness: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  handshake_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  doppelganger_urls: z.array(z.string()).optional(),
  doppelganger_per_raid: z.int().nonnegative().optional(),
  doppelganger_each: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  doppelganger_drs: z.boolean().optional(),
  throttle_max_connections: z.int().nonnegative().optional(),
  throttle_check_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const InboundMultiplexOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  padding: z.boolean().optional(),
  get brutal() {
    return BrutalOptionsSchema.optional()
  },
})

export const InboundNaiveSchema = z.looseObject({
  type: z.literal("naive"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  users: z.array(z.looseObject({
    Username: z.string().optional(),
    Password: z.string().optional(),
  })).optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  quic_congestion_control: z.string().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
})

export const InboundRealityHandshakeOptionsSchema = z.looseObject({
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const InboundRealityOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  get handshake() {
    return InboundRealityHandshakeOptionsSchema.optional()
  },
  private_key: z.string().optional(),
  short_id: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  max_time_difference: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const InboundRedirectSchema = z.looseObject({
  type: z.literal("redirect"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
})

export const InboundShadowsocksSchema = z.looseObject({
  type: z.literal("shadowsocks"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  method: z.string().optional(),
  password: z.string().optional(),
  get users() {
    return z.array(ShadowsocksUserSchema).optional()
  },
  get destinations() {
    return z.array(ShadowsocksDestinationSchema).optional()
  },
  get multiplex() {
    return InboundMultiplexOptionsSchema.optional()
  },
  managed: z.boolean().optional(),
})

export const InboundShadowtlsSchema = z.looseObject({
  type: z.literal("shadowtls"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  version: z.int().optional(),
  password: z.string().optional(),
  get users() {
    return z.array(ShadowTLSUserSchema).optional()
  },
  get handshake() {
    return ShadowTLSHandshakeOptionsSchema.optional()
  },
  get handshake_for_server_name() {
    return z.record(z.string(), ShadowTLSHandshakeOptionsSchema).optional()
  },
  strict_mode: z.boolean().optional(),
  get wildcard_sni() {
    return WildcardSNISchema.optional()
  },
})

export const InboundSnellSchema = z.looseObject({
  type: z.literal("snell"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  psk: z.string().optional(),
  version: z.int().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get obfs() {
    return SnellObfsOptionsSchema.optional()
  },
})

export const InboundSocksSchema = z.looseObject({
  type: z.literal("socks"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  users: z.array(z.looseObject({
    Username: z.string().optional(),
    Password: z.string().optional(),
  })).optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
})

export const InboundSshSchema = z.looseObject({
  type: z.literal("ssh"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get users() {
    return z.array(SSHUserSchema).optional()
  },
  host_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  host_key_path: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  server_version: z.string().optional(),
  max_auth_tries: z.int().optional(),
  get fallback() {
    return SSHFallbackServerOptionsSchema.optional()
  },
})

export const InboundSudokuSchema = z.looseObject({
  type: z.literal("sudoku"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  key: z.string().optional(),
  aead_method: z.string().optional(),
  padding_min: z.int().optional(),
  padding_max: z.int().optional(),
  table_type: z.string().optional(),
  handshake_timeout: z.int().optional(),
  enable_pure_downlink: z.boolean().optional(),
  custom_table: z.string().optional(),
  custom_tables: z.array(z.string()).optional(),
  disable_http_mask: z.boolean().optional(),
  http_mask_mode: z.string().optional(),
  path_root: z.string().optional(),
  fallback: z.string().optional(),
})

export const InboundTproxySchema = z.looseObject({
  type: z.literal("tproxy"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
})

export const InboundTrojanSchema = z.looseObject({
  type: z.literal("trojan"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get users() {
    return z.array(TrojanUserSchema).optional()
  },
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  get fallback() {
    return ServerOptionsSchema.optional()
  },
  get fallback_for_alpn() {
    return z.record(z.string(), ServerOptionsSchema).optional()
  },
  get multiplex() {
    return InboundMultiplexOptionsSchema.optional()
  },
  get transport() {
    return V2RayTransportOptionsSchema.optional()
  },
})

export const InboundTrusttunnelSchema = z.looseObject({
  type: z.literal("trusttunnel"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  get users() {
    return z.array(TrustTunnelUserSchema).optional()
  },
  get network() {
    return NetworkListSchema.optional()
  },
  congestion_controller: z.string().optional(),
  cwnd: z.int().optional(),
})

export const InboundTuicSchema = z.looseObject({
  type: z.literal("tuic"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get users() {
    return z.array(TUICUserSchema).optional()
  },
  congestion_control: z.string().optional(),
  auth_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  zero_rtt_handshake: z.boolean().optional(),
  heartbeat: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
})

export const InboundTunSchema = z.looseObject({
  type: z.literal("tun"),
  tag: z.string().optional(),
  interface_name: z.string().optional(),
  mtu: z.int().nonnegative().optional(),
  address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  auto_route: z.boolean().optional(),
  iproute2_table_index: z.int().optional(),
  iproute2_rule_index: z.int().optional(),
  auto_redirect: z.boolean().optional(),
  get auto_redirect_input_mark() {
    return FwMarkSchema.optional()
  },
  get auto_redirect_output_mark() {
    return FwMarkSchema.optional()
  },
  get auto_redirect_reset_mark() {
    return FwMarkSchema.optional()
  },
  auto_redirect_nfqueue: z.int().nonnegative().optional(),
  auto_redirect_iproute2_fallback_rule_index: z.int().optional(),
  exclude_mptcp: z.boolean().optional(),
  loopback_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  strict_route: z.boolean().optional(),
  route_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  route_address_set: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  route_exclude_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  route_exclude_address_set: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  include_interface: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  exclude_interface: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  include_uid: z.union([
    z.int().nonnegative(),
    z.array(z.int().nonnegative()),
  ]).optional(),
  include_uid_range: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  exclude_uid: z.union([
    z.int().nonnegative(),
    z.array(z.int().nonnegative()),
  ]).optional(),
  exclude_uid_range: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  include_android_user: z.union([
    z.int(),
    z.array(z.int()),
  ]).optional(),
  include_package: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  exclude_package: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  stack: z.string().optional(),
  get platform() {
    return TunPlatformOptionsSchema.optional()
  },
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  gso: z.boolean().optional(),
  inet4_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  inet6_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  inet4_route_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  inet6_route_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  inet4_route_exclude_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  inet6_route_exclude_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  endpoint_independent_nat: z.boolean().optional(),
})

export const InboundVlessSchema = z.looseObject({
  type: z.literal("vless"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get users() {
    return z.array(VLESSUserSchema).optional()
  },
  decryption: z.string().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  get multiplex() {
    return InboundMultiplexOptionsSchema.optional()
  },
  get transport() {
    return V2RayTransportOptionsSchema.optional()
  },
})

export const InboundVmessSchema = z.looseObject({
  type: z.literal("vmess"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get users() {
    return z.array(VMessUserSchema).optional()
  },
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  get multiplex() {
    return InboundMultiplexOptionsSchema.optional()
  },
  get transport() {
    return V2RayTransportOptionsSchema.optional()
  },
})

export const InboundSchema = z.discriminatedUnion("type", [
  InboundAnytlsSchema,
  InboundBondSchema,
  InboundCallSchema,
  InboundDirectSchema,
  InboundFailoverSchema,
  InboundHttpSchema,
  InboundHysteriaSchema,
  InboundHysteria2Schema,
  InboundMieruSchema,
  InboundMixedSchema,
  InboundMtproxySchema,
  InboundNaiveSchema,
  InboundRedirectSchema,
  InboundShadowsocksSchema,
  InboundShadowtlsSchema,
  InboundSnellSchema,
  InboundSocksSchema,
  InboundSshSchema,
  InboundSudokuSchema,
  InboundTproxySchema,
  InboundTrojanSchema,
  InboundTrusttunnelSchema,
  InboundTuicSchema,
  InboundTunSchema,
  InboundVlessSchema,
  InboundVmessSchema,
])

export const InboundTLSOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  server_name: z.string().optional(),
  insecure: z.boolean().optional(),
  alpn: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  min_version: z.string().optional(),
  max_version: z.string().optional(),
  cipher_suites: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get curve_preferences() {
    return z.union([
      CurvePreferenceSchema,
      z.array(CurvePreferenceSchema),
    ]).optional()
  },
  certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  certificate_path: z.string().optional(),
  get client_authentication() {
    return ClientAuthTypeSchema.optional()
  },
  client_certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  client_certificate_path: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  client_certificate_public_key_sha256: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  key_path: z.string().optional(),
  kernel_tx: z.boolean().optional(),
  kernel_rx: z.boolean().optional(),
  get acme() {
    return InboundACMEOptionsSchema.optional()
  },
  get ech() {
    return InboundECHOptionsSchema.optional()
  },
  get reality() {
    return InboundRealityOptionsSchema.optional()
  },
})

export const InterfaceTypeSchema = z.enum(["cellular", "ethernet", "other", "wifi"])

export const LegacyDNSFakeIPOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  inet4_range: z.string().optional(),
  inet6_range: z.string().optional(),
})

export const LogOptionsSchema = z.looseObject({
  disabled: z.boolean().optional(),
  level: z.string().optional(),
  output: z.string().optional(),
  timestamp: z.boolean().optional(),
})

export const MASQUEOutboundTLSOptionsSchema = z.looseObject({
  server_name: z.string().optional(),
  insecure: z.boolean().optional(),
  cipher_suites: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get curve_preferences() {
    return z.union([
      CurvePreferenceSchema,
      z.array(CurvePreferenceSchema),
    ]).optional()
  },
  fragment: z.boolean().optional(),
  fragment_fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  record_fragment: z.boolean().optional(),
  kernel_tx: z.boolean().optional(),
  kernel_rx: z.boolean().optional(),
})

export const MTProxyUserSchema = z.looseObject({
  name: z.string().optional(),
  secret: z.string().optional(),
})

export const ManagerServiceDatabaseSchema = z.looseObject({
  driver: z.string().optional(),
  dsn: z.string().optional(),
})

export const MieruUserSchema = z.looseObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const NTPOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  write_to_system: z.boolean().optional(),
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const NetworkListSchema = z.union([
  z.enum(["tcp", "udp"]),
  z.array(z.enum(["tcp", "udp"])),
])

export const NetworkStrategySchema = z.enum(["default", "fallback", "hybrid"])

export const OCMUserSchema = z.looseObject({
  name: z.string().optional(),
  token: z.string().optional(),
})

export const OpenVPNTLSOptionsSchema = z.looseObject({
  certificate: z.string().optional(),
  certificate_path: z.string().optional(),
  key: z.string().optional(),
  key_path: z.string().optional(),
  ca: z.string().optional(),
  ca_path: z.string().optional(),
  cipher_suites: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  verify_x509_name: z.string().optional(),
  verify_x509_name_mode: z.string().optional(),
  kernel_tx: z.boolean().optional(),
  kernel_rx: z.boolean().optional(),
})

export const OptionsSchema = z.looseObject({
  $schema: z.string().optional(),
  get log() {
    return LogOptionsSchema.optional()
  },
  get dns() {
    return DNSOptionsSchema.optional()
  },
  get ntp() {
    return NTPOptionsSchema.optional()
  },
  get certificate() {
    return CertificateOptionsSchema.optional()
  },
  get endpoints() {
    return z.array(EndpointSchema).optional()
  },
  get inbounds() {
    return z.array(InboundSchema).optional()
  },
  get outbounds() {
    return z.array(OutboundSchema).optional()
  },
  get providers() {
    return z.array(ProviderSchema).optional()
  },
  get route() {
    return RouteOptionsSchema.optional()
  },
  get services() {
    return z.array(ServiceSchema).optional()
  },
  get experimental() {
    return ExperimentalOptionsSchema.optional()
  },
})

export const OutboundAnytlsSchema = z.looseObject({
  type: z.literal("anytls"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  password: z.string().optional(),
  idle_session_check_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  idle_session_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  min_idle_session: z.int().optional(),
  client_metadata: z.string().optional(),
})

export const OutboundBandwidthLimiterSchema = z.looseObject({
  type: z.literal("bandwidth-limiter"),
  tag: z.string().optional(),
  strategy: z.string().optional(),
  connection_type: z.string().optional(),
  mode: z.string().optional(),
  flow_keys: z.array(z.string()).optional(),
  speed: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  get users() {
    return z.array(BandwidthLimiterUserSchema).optional()
  },
  get route() {
    return RouteOptionsSchema.optional()
  },
})

export const OutboundBondSchema = z.looseObject({
  type: z.literal("bond"),
  tag: z.string().optional(),
  get outbounds() {
    return z.array(BondOutboundSchema).optional()
  },
})

export const OutboundCallSchema = z.looseObject({
  type: z.literal("call"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  platform: z.string().optional(),
  mode: z.string().optional(),
  read_buffer: z.int().optional(),
  max_buffered_amount: z.int().optional(),
  memory_limit: z.int().optional(),
  join_link: z.string().optional(),
  get cookies() {
    return CallCookieListSchema.optional()
  },
})

export const OutboundConnectionLimiterSchema = z.looseObject({
  type: z.literal("connection-limiter"),
  tag: z.string().optional(),
  strategy: z.string().optional(),
  connection_type: z.string().optional(),
  count: z.int().nonnegative().optional(),
  get users() {
    return z.array(ConnectionLimiterUserSchema).optional()
  },
  get route() {
    return RouteOptionsSchema.optional()
  },
})

export const OutboundDirectSchema = z.looseObject({
  type: z.literal("direct"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  override_address: z.string().optional(),
  override_port: z.int().nonnegative().optional(),
  proxy_protocol: z.int().nonnegative().optional(),
})

export const OutboundECHOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  config: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  config_path: z.string().optional(),
  query_server_name: z.string().optional(),
  pq_signature_schemes_enabled: z.boolean().optional(),
  dynamic_record_sizing_disabled: z.boolean().optional(),
})

export const OutboundFailoverSchema = z.looseObject({
  type: z.literal("failover"),
  tag: z.string().optional(),
  strategy: z.string().optional(),
  delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get outbounds() {
    return z.array(OutboundSchema).optional()
  },
})

export const OutboundFallbackSchema = z.looseObject({
  type: z.literal("fallback"),
  tag: z.string().optional(),
  outbounds: z.array(z.string()).optional(),
  blacklist_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const OutboundHttpSchema = z.looseObject({
  type: z.literal("http"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  path: z.string().optional(),
  headers: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
})

export const OutboundHysteria2Schema = z.looseObject({
  type: z.literal("hysteria2"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  server_ports: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  hop_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  up_mbps: z.int().optional(),
  down_mbps: z.int().optional(),
  get obfs() {
    return Hysteria2ObfsSchema.optional()
  },
  password: z.string().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  brutal_debug: z.boolean().optional(),
})

export const OutboundHysteriaSchema = z.looseObject({
  type: z.literal("hysteria"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  server_ports: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  hop_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  up: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  up_mbps: z.int().optional(),
  down: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  down_mbps: z.int().optional(),
  obfs: z.string().optional(),
  auth: z.string().optional(),
  auth_str: z.string().optional(),
  recv_window_conn: z.int().nonnegative().optional(),
  recv_window: z.int().nonnegative().optional(),
  disable_mtu_discovery: z.boolean().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const OutboundMasqueSchema = z.looseObject({
  type: z.literal("masque"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  system: z.boolean().optional(),
  name: z.string().optional(),
  allowed_ips: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  use_http2: z.boolean().optional(),
  use_ipv6: z.boolean().optional(),
  get profile() {
    return CloudflareProfileSchema.optional()
  },
  udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_keepalive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_initial_packet_size: z.int().nonnegative().optional(),
  reconnect_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  congestion_controller: z.string().optional(),
  cwnd: z.int().optional(),
  get tls() {
    return MASQUEOutboundTLSOptionsSchema.optional()
  },
})

export const OutboundMieruSchema = z.looseObject({
  type: z.literal("mieru"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  server_ports: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  transport: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  multiplexing: z.string().optional(),
  traffic_pattern: z.string().optional(),
})

export const OutboundMultiplexOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  protocol: z.string().optional(),
  max_connections: z.int().optional(),
  min_streams: z.int().optional(),
  max_streams: z.int().optional(),
  padding: z.boolean().optional(),
  get brutal() {
    return BrutalOptionsSchema.optional()
  },
})

export const OutboundNaiveSchema = z.looseObject({
  type: z.literal("naive"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  insecure_concurrency: z.int().optional(),
  extra_headers: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  stream_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  get udp_over_tcp() {
    return UDPOverTCPOptionsSchema.optional()
  },
  quic: z.boolean().optional(),
  quic_congestion_control: z.string().optional(),
  quic_session_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const OutboundOpenvpnSchema = z.looseObject({
  type: z.literal("openvpn"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  system: z.boolean().optional(),
  name: z.string().optional(),
  allowed_ips: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get servers() {
    return z.array(ServerOptionsSchema).optional()
  },
  proto: z.string().optional(),
  cipher: z.string().optional(),
  auth: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  tls_crypt: z.string().optional(),
  tls_crypt_path: z.string().optional(),
  tls_crypt_v2: z.boolean().optional(),
  tls_auth: z.string().optional(),
  tls_auth_path: z.string().optional(),
  key_direction: z.int().optional(),
  reconnect_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  ping_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  ping_restart: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get tls() {
    return OpenVPNTLSOptionsSchema.optional()
  },
})

export const OutboundParserSchema = z.looseObject({
  type: z.literal("parser"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  link: z.string().optional(),
})

export const OutboundRateLimiterSchema = z.looseObject({
  type: z.literal("rate-limiter"),
  tag: z.string().optional(),
  strategy: z.string().optional(),
  connection_type: z.string().optional(),
  count: z.int().nonnegative().optional(),
  interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get users() {
    return z.array(RateLimiterUserSchema).optional()
  },
  get route() {
    return RouteOptionsSchema.optional()
  },
})

export const OutboundRealityOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  public_key: z.string().optional(),
  short_id: z.string().optional(),
})

export const OutboundSelectorSchema = z.looseObject({
  type: z.literal("selector"),
  tag: z.string().optional(),
  outbounds: z.array(z.string()).optional(),
  providers: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  exclude: z.string().optional(),
  include: z.string().optional(),
  use_all_providers: z.boolean().optional(),
  default: z.string().optional(),
  interrupt_exist_connections: z.boolean().optional(),
})

export const OutboundShadowsocksSchema = z.looseObject({
  type: z.literal("shadowsocks"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  method: z.string().optional(),
  password: z.string().optional(),
  plugin: z.string().optional(),
  plugin_opts: z.string().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get udp_over_tcp() {
    return UDPOverTCPOptionsSchema.optional()
  },
  get multiplex() {
    return OutboundMultiplexOptionsSchema.optional()
  },
})

export const OutboundShadowtlsSchema = z.looseObject({
  type: z.literal("shadowtls"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  version: z.int().optional(),
  password: z.string().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const OutboundSnellSchema = z.looseObject({
  type: z.literal("snell"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  psk: z.string().optional(),
  version: z.int().optional(),
  reuse: z.boolean().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get obfs() {
    return SnellObfsOptionsSchema.optional()
  },
})

export const OutboundSocksSchema = z.looseObject({
  type: z.literal("socks"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  version: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get udp_over_tcp() {
    return UDPOverTCPOptionsSchema.optional()
  },
})

export const OutboundSshSchema = z.looseObject({
  type: z.literal("ssh"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  private_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  private_key_path: z.string().optional(),
  private_key_passphrase: z.string().optional(),
  host_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  host_key_algorithms: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  client_version: z.string().optional(),
})

export const OutboundSudokuSchema = z.looseObject({
  type: z.literal("sudoku"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  key: z.string().optional(),
  aead_method: z.string().optional(),
  padding_min: z.int().optional(),
  padding_max: z.int().optional(),
  table_type: z.string().optional(),
  enable_pure_downlink: z.boolean().optional(),
  custom_table: z.string().optional(),
  custom_tables: z.array(z.string()).optional(),
  get http_mask() {
    return SudokuHTTPMaskSchema.optional()
  },
})

export const OutboundTorSchema = z.looseObject({
  type: z.literal("tor"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  executable_path: z.string().optional(),
  extra_args: z.array(z.string()).optional(),
  data_directory: z.string().optional(),
  torrc: z.record(z.string(), z.string()).optional(),
})

export const OutboundTrafficLimiterSchema = z.looseObject({
  type: z.literal("traffic-limiter"),
  tag: z.string().optional(),
  strategy: z.string().optional(),
  mode: z.string().optional(),
  total: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  get users() {
    return z.array(TrafficLimiterUserSchema).optional()
  },
  get route() {
    return RouteOptionsSchema.optional()
  },
})

export const OutboundTrojanSchema = z.looseObject({
  type: z.literal("trojan"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  password: z.string().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  get multiplex() {
    return OutboundMultiplexOptionsSchema.optional()
  },
  get transport() {
    return V2RayTransportOptionsSchema.optional()
  },
})

export const OutboundTrusttunnelSchema = z.looseObject({
  type: z.literal("trusttunnel"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  username: z.string().optional(),
  password: z.string().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  health_check: z.boolean().optional(),
  quic: z.boolean().optional(),
  congestion_controller: z.string().optional(),
  cwnd: z.int().optional(),
  get multiplex() {
    return TrustTunnelMultiplexOptionsSchema.optional()
  },
})

export const OutboundTuicSchema = z.looseObject({
  type: z.literal("tuic"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  uuid: z.string().optional(),
  password: z.string().optional(),
  congestion_control: z.string().optional(),
  udp_relay_mode: z.string().optional(),
  udp_over_stream: z.boolean().optional(),
  zero_rtt_handshake: z.boolean().optional(),
  heartbeat: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const OutboundUrltestSchema = z.looseObject({
  type: z.literal("urltest"),
  tag: z.string().optional(),
  outbounds: z.array(z.string()).optional(),
  providers: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  exclude: z.string().optional(),
  include: z.string().optional(),
  use_all_providers: z.boolean().optional(),
  url: z.string().optional(),
  interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tolerance: z.int().nonnegative().optional(),
  idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  interrupt_exist_connections: z.boolean().optional(),
})

export const OutboundVlessSchema = z.looseObject({
  type: z.literal("vless"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  uuid: z.string().optional(),
  flow: z.string().optional(),
  encryption: z.string().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  get multiplex() {
    return OutboundMultiplexOptionsSchema.optional()
  },
  get transport() {
    return V2RayTransportOptionsSchema.optional()
  },
  packet_encoding: z.string().optional(),
})

export const OutboundVmessSchema = z.looseObject({
  type: z.literal("vmess"),
  tag: z.string().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  uuid: z.string().optional(),
  security: z.string().optional(),
  alter_id: z.int().optional(),
  global_padding: z.boolean().optional(),
  authenticated_length: z.boolean().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  packet_encoding: z.string().optional(),
  get multiplex() {
    return OutboundMultiplexOptionsSchema.optional()
  },
  get transport() {
    return V2RayTransportOptionsSchema.optional()
  },
})

export const OutboundSchema = z.discriminatedUnion("type", [
  OutboundAnytlsSchema,
  OutboundBandwidthLimiterSchema,
  OutboundBondSchema,
  OutboundCallSchema,
  OutboundConnectionLimiterSchema,
  OutboundDirectSchema,
  OutboundFailoverSchema,
  OutboundFallbackSchema,
  OutboundHttpSchema,
  OutboundHysteriaSchema,
  OutboundHysteria2Schema,
  OutboundMasqueSchema,
  OutboundMieruSchema,
  OutboundNaiveSchema,
  OutboundOpenvpnSchema,
  OutboundParserSchema,
  OutboundRateLimiterSchema,
  OutboundSelectorSchema,
  OutboundShadowsocksSchema,
  OutboundShadowtlsSchema,
  OutboundSnellSchema,
  OutboundSocksSchema,
  OutboundSshSchema,
  OutboundSudokuSchema,
  OutboundTorSchema,
  OutboundTrafficLimiterSchema,
  OutboundTrojanSchema,
  OutboundTrusttunnelSchema,
  OutboundTuicSchema,
  OutboundUrltestSchema,
  OutboundVlessSchema,
  OutboundVmessSchema,
])

export const OutboundTLSOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  disable_sni: z.boolean().optional(),
  server_name: z.string().optional(),
  insecure: z.boolean().optional(),
  alpn: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  min_version: z.string().optional(),
  max_version: z.string().optional(),
  cipher_suites: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get curve_preferences() {
    return z.union([
      CurvePreferenceSchema,
      z.array(CurvePreferenceSchema),
    ]).optional()
  },
  certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  certificate_path: z.string().optional(),
  certificate_public_key_sha256: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  client_certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  client_certificate_path: z.string().optional(),
  client_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  client_key_path: z.string().optional(),
  fragment: z.boolean().optional(),
  fragment_fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  record_fragment: z.boolean().optional(),
  kernel_tx: z.boolean().optional(),
  kernel_rx: z.boolean().optional(),
  get ech() {
    return OutboundECHOptionsSchema.optional()
  },
  get utls() {
    return OutboundUTLSOptionsSchema.optional()
  },
  get reality() {
    return OutboundRealityOptionsSchema.optional()
  },
})

export const OutboundUTLSOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  fingerprint: z.string().optional(),
})

export const ProviderHealthCheckOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  url: z.string().optional(),
  interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const ProviderInlineSchema = z.looseObject({
  type: z.literal("inline"),
  tag: z.string().optional(),
  get outbounds() {
    return z.array(OutboundSchema).optional()
  },
  remove_emojis: z.boolean().optional(),
  get health_check() {
    return ProviderHealthCheckOptionsSchema.optional()
  },
})

export const ProviderLocalSchema = z.looseObject({
  type: z.literal("local"),
  tag: z.string().optional(),
  path: z.string().optional(),
  remove_emojis: z.boolean().optional(),
  get health_check() {
    return ProviderHealthCheckOptionsSchema.optional()
  },
})

export const ProviderRemoteSchema = z.looseObject({
  type: z.literal("remote"),
  tag: z.string().optional(),
  url: z.string().optional(),
  user_agent: z.string().optional(),
  headers: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  download_detour: z.string().optional(),
  update_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  exclude: z.string().optional(),
  include: z.string().optional(),
  remove_emojis: z.boolean().optional(),
  get health_check() {
    return ProviderHealthCheckOptionsSchema.optional()
  },
})

export const ProviderSchema = z.discriminatedUnion("type", [
  ProviderInlineSchema,
  ProviderLocalSchema,
  ProviderRemoteSchema,
])

export const RateLimiterUserSchema = z.looseObject({
  name: z.string().optional(),
  strategy: z.string().optional(),
  connection_type: z.string().optional(),
  count: z.int().nonnegative().optional(),
  interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const RouteOptionsSchema = z.looseObject({
  get geoip() {
    return GeoIPOptionsSchema.optional()
  },
  get geosite() {
    return GeositeOptionsSchema.optional()
  },
  get rules() {
    return z.array(RuleSchema).optional()
  },
  get rule_set() {
    return z.array(RuleSetSchema).optional()
  },
  final: z.string().optional(),
  find_process: z.boolean().optional(),
  auto_detect_interface: z.boolean().optional(),
  override_android_vpn: z.boolean().optional(),
  default_interface: z.string().optional(),
  get default_mark() {
    return FwMarkSchema.optional()
  },
  get default_domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get default_network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get default_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get default_fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  default_fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const RuleSchema = z.union([
  DefaultRuleBaseSchema.extend({
    action: z.literal("route").optional(),
    outbound: z.string().optional(),
    override_address: z.string().optional(),
    override_port: z.int().nonnegative().optional(),
    override_gateway: z.string().optional(),
    get network_strategy() {
      return NetworkStrategySchema.optional()
    },
    fallback_delay: z.int().nonnegative().optional(),
    udp_disable_domain_unmapping: z.boolean().optional(),
    udp_connect: z.boolean().optional(),
    udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_fragment: z.boolean().optional(),
    tls_fragment_fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_record_fragment: z.boolean().optional(),
  }),
  DefaultRuleBaseSchema.extend({
    action: z.literal("route-options").optional(),
    override_address: z.string().optional(),
    override_port: z.int().nonnegative().optional(),
    override_gateway: z.string().optional(),
    get network_strategy() {
      return NetworkStrategySchema.optional()
    },
    fallback_delay: z.int().nonnegative().optional(),
    udp_disable_domain_unmapping: z.boolean().optional(),
    udp_connect: z.boolean().optional(),
    udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_fragment: z.boolean().optional(),
    tls_fragment_fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_record_fragment: z.boolean().optional(),
  }),
  DefaultRuleBaseSchema.extend({
    action: z.literal("direct").optional(),
    detour: z.string().optional(),
    bind_interface: z.string().optional(),
    inet4_bind_address: z.string().optional(),
    inet6_bind_address: z.string().optional(),
    bind_address_no_port: z.boolean().optional(),
    protect_path: z.string().optional(),
    get routing_mark() {
      return FwMarkSchema.optional()
    },
    reuse_addr: z.boolean().optional(),
    netns: z.string().optional(),
    connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tcp_fast_open: z.boolean().optional(),
    tcp_multi_path: z.boolean().optional(),
    disable_tcp_keep_alive: z.boolean().optional(),
    tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    udp_fragment: z.boolean().optional(),
    get domain_resolver() {
      return DomainResolveOptionsSchema.optional()
    },
    get network_strategy() {
      return NetworkStrategySchema.optional()
    },
    get network_type() {
      return z.union([
        InterfaceTypeSchema,
        z.array(InterfaceTypeSchema),
      ]).optional()
    },
    get fallback_network_type() {
      return z.union([
        InterfaceTypeSchema,
        z.array(InterfaceTypeSchema),
      ]).optional()
    },
    fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
  }),
  DefaultRuleBaseSchema.extend({
    action: z.literal("bypass").optional(),
    outbound: z.string().optional(),
    override_address: z.string().optional(),
    override_port: z.int().nonnegative().optional(),
    override_gateway: z.string().optional(),
    get network_strategy() {
      return NetworkStrategySchema.optional()
    },
    fallback_delay: z.int().nonnegative().optional(),
    udp_disable_domain_unmapping: z.boolean().optional(),
    udp_connect: z.boolean().optional(),
    udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_fragment: z.boolean().optional(),
    tls_fragment_fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_record_fragment: z.boolean().optional(),
  }),
  DefaultRuleBaseSchema.extend({
    action: z.literal("reject").optional(),
    method: z.string().optional(),
    no_drop: z.boolean().optional(),
  }),
  DefaultRuleBaseSchema.extend({
    action: z.literal("hijack-dns").optional(),
  }),
  DefaultRuleBaseSchema.extend({
    action: z.literal("sniff").optional(),
    sniffer: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  }),
  DefaultRuleBaseSchema.extend({
    action: z.literal("resolve").optional(),
    server: z.string().optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("route").optional(),
    outbound: z.string().optional(),
    override_address: z.string().optional(),
    override_port: z.int().nonnegative().optional(),
    override_gateway: z.string().optional(),
    get network_strategy() {
      return NetworkStrategySchema.optional()
    },
    fallback_delay: z.int().nonnegative().optional(),
    udp_disable_domain_unmapping: z.boolean().optional(),
    udp_connect: z.boolean().optional(),
    udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_fragment: z.boolean().optional(),
    tls_fragment_fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_record_fragment: z.boolean().optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("route-options").optional(),
    override_address: z.string().optional(),
    override_port: z.int().nonnegative().optional(),
    override_gateway: z.string().optional(),
    get network_strategy() {
      return NetworkStrategySchema.optional()
    },
    fallback_delay: z.int().nonnegative().optional(),
    udp_disable_domain_unmapping: z.boolean().optional(),
    udp_connect: z.boolean().optional(),
    udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_fragment: z.boolean().optional(),
    tls_fragment_fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_record_fragment: z.boolean().optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("direct").optional(),
    detour: z.string().optional(),
    bind_interface: z.string().optional(),
    inet4_bind_address: z.string().optional(),
    inet6_bind_address: z.string().optional(),
    bind_address_no_port: z.boolean().optional(),
    protect_path: z.string().optional(),
    get routing_mark() {
      return FwMarkSchema.optional()
    },
    reuse_addr: z.boolean().optional(),
    netns: z.string().optional(),
    connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tcp_fast_open: z.boolean().optional(),
    tcp_multi_path: z.boolean().optional(),
    disable_tcp_keep_alive: z.boolean().optional(),
    tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    udp_fragment: z.boolean().optional(),
    get domain_resolver() {
      return DomainResolveOptionsSchema.optional()
    },
    get network_strategy() {
      return NetworkStrategySchema.optional()
    },
    get network_type() {
      return z.union([
        InterfaceTypeSchema,
        z.array(InterfaceTypeSchema),
      ]).optional()
    },
    get fallback_network_type() {
      return z.union([
        InterfaceTypeSchema,
        z.array(InterfaceTypeSchema),
      ]).optional()
    },
    fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("bypass").optional(),
    outbound: z.string().optional(),
    override_address: z.string().optional(),
    override_port: z.int().nonnegative().optional(),
    override_gateway: z.string().optional(),
    get network_strategy() {
      return NetworkStrategySchema.optional()
    },
    fallback_delay: z.int().nonnegative().optional(),
    udp_disable_domain_unmapping: z.boolean().optional(),
    udp_connect: z.boolean().optional(),
    udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_fragment: z.boolean().optional(),
    tls_fragment_fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    tls_record_fragment: z.boolean().optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("reject").optional(),
    method: z.string().optional(),
    no_drop: z.boolean().optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("hijack-dns").optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("sniff").optional(),
    sniffer: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  }),
  z.looseObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("resolve").optional(),
    server: z.string().optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
])

export const RuleSetSchema = z.union([
  z.looseObject({
    type: z.literal("inline").optional(),
    tag: z.string().optional(),
    format: z.string().optional(),
    get rules() {
      return z.array(HeadlessRuleSchema).optional()
    },
  }),
  z.looseObject({
    type: z.literal("local").optional(),
    tag: z.string().optional(),
    format: z.string().optional(),
    path: z.string().optional(),
  }),
  z.looseObject({
    type: z.literal("remote").optional(),
    tag: z.string().optional(),
    format: z.string().optional(),
    url: z.string().optional(),
    download_detour: z.string().optional(),
    update_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  }),
])

export const SSHCAOptionsSchema = z.looseObject({
  private_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  private_key_path: z.string().optional(),
  private_key_passphrase: z.string().optional(),
})

export const SSHFallbackServerOptionsSchema = z.looseObject({
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get ca() {
    return SSHCAOptionsSchema.optional()
  },
  get issue_ca() {
    return SSHCAOptionsSchema.optional()
  },
  host_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  host_key_path: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  host_key_algorithms: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  client_version: z.string().optional(),
})

export const SSHUserSchema = z.looseObject({
  name: z.string().optional(),
  password: z.string().optional(),
  authorized_keys: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
})

export const ServerOptionsSchema = z.looseObject({
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
})

export const ServiceAdminPanelSchema = z.looseObject({
  type: z.literal("admin-panel"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
})

export const ServiceCcmSchema = z.looseObject({
  type: z.literal("ccm"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  credential_path: z.string().optional(),
  get users() {
    return z.array(CCMUserSchema).optional()
  },
  headers: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  detour: z.string().optional(),
  usages_path: z.string().optional(),
})

export const ServiceDerpSchema = z.looseObject({
  type: z.literal("derp"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  config_path: z.string().optional(),
  verify_client_endpoint: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get verify_client_url() {
    return z.union([
      DERPVerifyClientURLOptionsSchema,
      z.array(DERPVerifyClientURLOptionsSchema),
    ]).optional()
  },
  home: z.string().optional(),
  get mesh_with() {
    return z.union([
      DERPMeshOptionsSchema,
      z.array(DERPMeshOptionsSchema),
    ]).optional()
  },
  mesh_psk: z.string().optional(),
  mesh_psk_file: z.string().optional(),
  get stun() {
    return DERPSTUNListenOptionsSchema.optional()
  },
})

export const ServiceManagerApiSchema = z.looseObject({
  type: z.literal("manager-api"),
  tag: z.string().optional(),
  api_type: z.string().optional(),
  protocol_type: z.string().optional(),
})

export const ServiceManagerSchema = z.looseObject({
  type: z.literal("manager"),
  tag: z.string().optional(),
  inbounds: z.array(z.string()).optional(),
  get database() {
    return ManagerServiceDatabaseSchema.optional()
  },
})

export const ServiceNodeManagerApiSchema = z.looseObject({
  type: z.literal("node-manager-api"),
  tag: z.string().optional(),
  api_type: z.string().optional(),
})

export const ServiceNodeSchema = z.looseObject({
  type: z.literal("node"),
  tag: z.string().optional(),
  uuid: z.string().optional(),
  inbounds: z.array(z.string()).optional(),
  connection_limiters: z.array(z.string()).optional(),
  bandwidth_limiters: z.array(z.string()).optional(),
  traffic_limiters: z.array(z.string()).optional(),
  rate_limiters: z.array(z.string()).optional(),
  manager: z.string().optional(),
})

export const ServiceOcmSchema = z.looseObject({
  type: z.literal("ocm"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  credential_path: z.string().optional(),
  get users() {
    return z.array(OCMUserSchema).optional()
  },
  headers: z.record(z.string(), z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  detour: z.string().optional(),
  usages_path: z.string().optional(),
})

export const ServiceOomKillerSchema = z.looseObject({
  type: z.literal("oom-killer"),
  tag: z.string().optional(),
  memory_limit: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  safety_margin: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  min_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  max_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  checks_before_limit: z.int().optional(),
})

export const ServiceProfilerSchema = z.looseObject({
  type: z.literal("profiler"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
})

export const ServiceResolvedSchema = z.looseObject({
  type: z.literal("resolved"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
})

export const ServiceSsmApiSchema = z.looseObject({
  type: z.literal("ssm-api"),
  tag: z.string().optional(),
  listen: z.string().optional(),
  listen_port: z.int().nonnegative().optional(),
  bind_interface: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  udp_fragment: z.boolean().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  detour: z.string().optional(),
  proxy_protocol: z.boolean().optional(),
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  servers: z.record(z.string(), z.string()).optional(),
  cache_path: z.string().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
})

export const ServiceSchema = z.discriminatedUnion("type", [
  ServiceAdminPanelSchema,
  ServiceCcmSchema,
  ServiceDerpSchema,
  ServiceManagerSchema,
  ServiceManagerApiSchema,
  ServiceNodeSchema,
  ServiceNodeManagerApiSchema,
  ServiceOcmSchema,
  ServiceOomKillerSchema,
  ServiceProfilerSchema,
  ServiceResolvedSchema,
  ServiceSsmApiSchema,
])

export const ShadowTLSHandshakeOptionsSchema = z.looseObject({
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  detour: z.string().optional(),
  bind_interface: z.string().optional(),
  inet4_bind_address: z.string().optional(),
  inet6_bind_address: z.string().optional(),
  bind_address_no_port: z.boolean().optional(),
  protect_path: z.string().optional(),
  get routing_mark() {
    return FwMarkSchema.optional()
  },
  reuse_addr: z.boolean().optional(),
  netns: z.string().optional(),
  connect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_fast_open: z.boolean().optional(),
  tcp_multi_path: z.boolean().optional(),
  disable_tcp_keep_alive: z.boolean().optional(),
  tcp_keep_alive: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  tcp_keep_alive_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  udp_fragment: z.boolean().optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
  get network_strategy() {
    return NetworkStrategySchema.optional()
  },
  get network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  get fallback_network_type() {
    return z.union([
      InterfaceTypeSchema,
      z.array(InterfaceTypeSchema),
    ]).optional()
  },
  fallback_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const ShadowTLSUserSchema = z.looseObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const ShadowsocksDestinationSchema = z.looseObject({
  name: z.string().optional(),
  password: z.string().optional(),
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
})

export const ShadowsocksUserSchema = z.looseObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const SnellObfsOptionsSchema = z.looseObject({
  mode: z.string().optional(),
  host: z.string().optional(),
})

export const SudokuHTTPMaskSchema = z.looseObject({
  enabled: z.boolean().optional(),
  mode: z.string().optional(),
  host: z.string().optional(),
  path_root: z.string().optional(),
  multiplex: z.string().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const TUICUserSchema = z.looseObject({
  name: z.string().optional(),
  uuid: z.string().optional(),
  password: z.string().optional(),
})

export const TrafficLimiterUserSchema = z.looseObject({
  name: z.string().optional(),
  strategy: z.string().optional(),
  mode: z.string().optional(),
  total: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
})

export const TrojanUserSchema = z.looseObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const TrustTunnelMultiplexOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  max_connections: z.int().optional(),
  min_streams: z.int().optional(),
  max_streams: z.int().optional(),
})

export const TrustTunnelUserSchema = z.looseObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const TunPlatformOptionsSchema = z.looseObject({
  get http_proxy() {
    return HTTPProxyOptionsSchema.optional()
  },
})

export const UDPOverTCPOptionsSchema = z.union([
  z.boolean(),
  z.looseObject({
    enabled: z.boolean().optional(),
    version: z.int().nonnegative().optional(),
  }),
])

export const UDPTimeoutCompatSchema = z.union([
  z.int().nonnegative(),
  z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/),
])

export const UnifiedDelayOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
})

export const V2RayAPIOptionsSchema = z.looseObject({
  listen: z.string().optional(),
  get stats() {
    return V2RayStatsServiceOptionsSchema.optional()
  },
})

export const V2RayStatsServiceOptionsSchema = z.looseObject({
  enabled: z.boolean().optional(),
  inbounds: z.array(z.string()).optional(),
  outbounds: z.array(z.string()).optional(),
  users: z.array(z.string()).optional(),
})

export const V2RayTransportOptionsSchema = z.discriminatedUnion("type", [
  z.looseObject({
    type: z.literal("http"),
    host: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    path: z.string().optional(),
    method: z.string().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
    idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    ping_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  }),
  z.looseObject({
    type: z.literal("ws"),
    path: z.string().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
    max_early_data: z.int().nonnegative().optional(),
    early_data_header_name: z.string().optional(),
  }),
  z.looseObject({
    type: z.literal("quic"),
  }),
  z.looseObject({
    type: z.literal("grpc"),
    service_name: z.string().optional(),
    idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    ping_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    permit_without_stream: z.boolean().optional(),
  }),
  z.looseObject({
    type: z.literal("httpupgrade"),
    host: z.string().optional(),
    path: z.string().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
  }),
  z.looseObject({
    type: z.literal("xhttp"),
    mode: z.string().optional(),
    host: z.string().optional(),
    path: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
    x_padding_bytes: z.union([
      z.int(),
      z.string(),
      z.looseObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    no_grpc_header: z.boolean().optional(),
    no_sse_header: z.boolean().optional(),
    sc_max_each_post_bytes: z.union([
      z.int(),
      z.string(),
      z.looseObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    sc_min_posts_interval_ms: z.union([
      z.int(),
      z.string(),
      z.looseObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    sc_max_buffered_posts: z.int().optional(),
    sc_stream_up_server_secs: z.union([
      z.int(),
      z.string(),
      z.looseObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    server_max_header_bytes: z.int().optional(),
    trusted_x_forwarded_for: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    get xmux() {
      return V2RayXHTTPXmuxOptionsSchema.optional()
    },
    x_padding_obfs_mode: z.boolean().optional(),
    x_padding_key: z.string().optional(),
    x_padding_header: z.string().optional(),
    x_padding_placement: z.string().optional(),
    x_padding_method: z.string().optional(),
    uplink_http_method: z.string().optional(),
    session_placement: z.string().optional(),
    session_key: z.string().optional(),
    seq_placement: z.string().optional(),
    seq_key: z.string().optional(),
    uplink_data_placement: z.string().optional(),
    uplink_data_key: z.string().optional(),
    uplink_chunk_size: z.union([
      z.int(),
      z.string(),
      z.looseObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    session_id_table: z.string().optional(),
    session_id_length: z.union([
      z.int(),
      z.string(),
      z.looseObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    congestion_controller: z.string().optional(),
    cwnd: z.int().optional(),
    get download() {
      return V2RayXHTTPDownloadOptionsSchema.optional()
    },
  }),
  z.looseObject({
    type: z.literal("mkcp"),
    mtu: z.int().nonnegative().optional(),
    tti: z.int().nonnegative().optional(),
    uplink_capacity: z.int().nonnegative().optional(),
    downlink_capacity: z.int().nonnegative().optional(),
    congestion: z.boolean().optional(),
    read_buffer_size: z.int().nonnegative().optional(),
    write_buffer_size: z.int().nonnegative().optional(),
    header_type: z.string().optional(),
    seed: z.string().optional(),
  }),
])

export const V2RayXHTTPDownloadOptionsSchema = z.looseObject({
  host: z.string().optional(),
  path: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  x_padding_bytes: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  no_grpc_header: z.boolean().optional(),
  no_sse_header: z.boolean().optional(),
  sc_max_each_post_bytes: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  sc_min_posts_interval_ms: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  sc_max_buffered_posts: z.int().optional(),
  sc_stream_up_server_secs: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  server_max_header_bytes: z.int().optional(),
  trusted_x_forwarded_for: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get xmux() {
    return V2RayXHTTPXmuxOptionsSchema.optional()
  },
  x_padding_obfs_mode: z.boolean().optional(),
  x_padding_key: z.string().optional(),
  x_padding_header: z.string().optional(),
  x_padding_placement: z.string().optional(),
  x_padding_method: z.string().optional(),
  uplink_http_method: z.string().optional(),
  session_placement: z.string().optional(),
  session_key: z.string().optional(),
  seq_placement: z.string().optional(),
  seq_key: z.string().optional(),
  uplink_data_placement: z.string().optional(),
  uplink_data_key: z.string().optional(),
  uplink_chunk_size: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  session_id_table: z.string().optional(),
  session_id_length: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  congestion_controller: z.string().optional(),
  cwnd: z.int().optional(),
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  detour: z.string().optional(),
})

export const V2RayXHTTPXmuxOptionsSchema = z.looseObject({
  max_concurrency: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  max_connections: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  c_max_reuse_times: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  h_max_request_times: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  h_max_reusable_secs: z.union([
    z.int(),
    z.string(),
    z.looseObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  h_keep_alive_period: z.int().optional(),
})

export const VLESSUserSchema = z.looseObject({
  name: z.string().optional(),
  uuid: z.string().optional(),
  flow: z.string().optional(),
})

export const VMessUserSchema = z.looseObject({
  name: z.string().optional(),
  uuid: z.string().optional(),
  alterId: z.int().optional(),
})

export const VPNUserSchema = z.looseObject({
  address: z.string().optional(),
  key: z.string().optional(),
})

export const WARPAmneziaSchema = z.looseObject({
  jc: z.int().optional(),
  jmin: z.int().optional(),
  jmax: z.int().optional(),
  i1: z.string().optional(),
  i2: z.string().optional(),
  i3: z.string().optional(),
  i4: z.string().optional(),
  i5: z.string().optional(),
  content_padding_addition: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  rekey_after_time: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  rekey_timeout: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  reject_after_time: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  keepalive_timeout: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  max_handshake_attempts: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
})

export const WildcardSNISchema = z.enum(["", "off", "authed", "all"])

export const WireGuardAmneziaSchema = z.looseObject({
  jc: z.int().optional(),
  jmin: z.int().optional(),
  jmax: z.int().optional(),
  s1: z.int().optional(),
  s2: z.int().optional(),
  s3: z.int().optional(),
  s4: z.int().optional(),
  h1: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  h2: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  h3: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  h4: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  i1: z.string().optional(),
  i2: z.string().optional(),
  i3: z.string().optional(),
  i4: z.string().optional(),
  i5: z.string().optional(),
  header_protection_key: z.string().optional(),
  content_padding_addition: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  rekey_after_time: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  rekey_timeout: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  reject_after_time: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  keepalive_timeout: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  max_handshake_attempts: z.union([
    z.int().nonnegative(),
    z.string(),
    z.looseObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
})

export const WireGuardPeerSchema = z.looseObject({
  address: z.string().optional(),
  port: z.int().nonnegative().optional(),
  public_key: z.string().optional(),
  pre_shared_key: z.string().optional(),
  allowed_ips: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  persistent_keepalive_interval: z.int().nonnegative().optional(),
})

export const ConfigSchema = OptionsSchema

export type Config = z.infer<typeof ConfigSchema>
