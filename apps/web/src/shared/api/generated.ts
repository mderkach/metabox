// Сгенерировано tools/schemagen из sing-box-extended v1.14.0-extended-2.7.1. Не редактировать:
// правится генератор, файл пересобирается `make schema`.
//
// Схемы держатся представимыми для z.toJSONSchema(): по ним строится
// авторендерер непокрытых узлов конфига (docs/adr/ADR-0001).

import * as z from "zod"

/**
 * Версия форка, из которой собраны эти схемы. Панель сверяет её с версией
 * бинаря на устройстве: формы знают ровно те типы, что были в этой версии.
 */
export const SCHEMA_FORK_VERSION = "v1.14.0-extended-2.7.1"

export const ACMEDNS01ChallengeOptionsSchema = z.union([
  z.strictObject({
    provider: z.literal("alidns").optional(),
    access_key_id: z.string().optional(),
    access_key_secret: z.string().optional(),
    region_id: z.string().optional(),
    security_token: z.string().optional(),
  }),
  z.strictObject({
    provider: z.literal("cloudflare").optional(),
    api_token: z.string().optional(),
    zone_token: z.string().optional(),
  }),
  z.strictObject({
    provider: z.literal("acmedns").optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    subdomain: z.string().optional(),
    server_url: z.string().optional(),
  }),
])

export const ACMEExternalAccountOptionsSchema = z.strictObject({
  key_id: z.string().optional(),
  mac_key: z.string().optional(),
})

export const ACMEKeyTypeSchema = z.string()

export const ACMEProviderDNS01ChallengeOptionsSchema = z.union([
  z.strictObject({
    provider: z.literal("alidns").optional(),
    ttl: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    propagation_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    propagation_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    resolvers: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    override_domain: z.string().optional(),
    access_key_id: z.string().optional(),
    access_key_secret: z.string().optional(),
    region_id: z.string().optional(),
    security_token: z.string().optional(),
  }),
  z.strictObject({
    provider: z.literal("cloudflare").optional(),
    ttl: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    propagation_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    propagation_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    resolvers: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    override_domain: z.string().optional(),
    api_token: z.string().optional(),
    zone_token: z.string().optional(),
  }),
  z.strictObject({
    provider: z.literal("acmedns").optional(),
    ttl: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    propagation_delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    propagation_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    resolvers: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    override_domain: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    subdomain: z.string().optional(),
    server_url: z.string().optional(),
  }),
])

export const APIDashboardOptionsSchema = z.union([
  z.boolean(),
  z.string(),
  z.strictObject({
    enabled: z.boolean().optional(),
    path: z.string().optional(),
    download_url: z.string().optional(),
    get http_client() {
      return HTTPClientOptionsSchema.optional()
    },
    update_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  }),
])

export const AnyTLSUserSchema = z.strictObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const BandwidthLimiterUserSchema = z.strictObject({
  name: z.string().optional(),
  strategy: z.string().optional(),
  connection_type: z.string().optional(),
  mode: z.string().optional(),
  speed: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
})

export const BondOutboundSchema = z.strictObject({
  get outbound() {
    return OutboundSchema.optional()
  },
  download_ratio: z.int().nonnegative().optional(),
  upload_ratio: z.int().nonnegative().optional(),
  count: z.int().nonnegative().optional(),
})

export const BrutalOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  up_mbps: z.int().optional(),
  down_mbps: z.int().optional(),
})

export const CCMUserSchema = z.strictObject({
  name: z.string().optional(),
  token: z.string().optional(),
})

export const CacheFileOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  path: z.string().optional(),
  cache_id: z.string().optional(),
  store_fakeip: z.boolean().optional(),
  store_rdrc: z.boolean().optional(),
  store_warp_config: z.boolean().optional(),
  store_masque_config: z.boolean().optional(),
  store_subscriptions: z.boolean().optional(),
  rdrc_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  store_dns: z.boolean().optional(),
})

export const CallCookieSchema = z.strictObject({
  name: z.string().optional(),
  value: z.string().optional(),
})

export const CallCookieListSchema = z.array(CallCookieSchema)

export const CertificateOptionsSchema = z.strictObject({
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

export const CertificateProviderAcmeSchema = z.strictObject({
  type: z.literal("acme"),
  tag: z.string().optional(),
  domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  data_directory: z.string().optional(),
  default_server_name: z.string().optional(),
  email: z.string().optional(),
  provider: z.string().optional(),
  account_key: z.string().optional(),
  disable_http_challenge: z.boolean().optional(),
  disable_tls_alpn_challenge: z.boolean().optional(),
  alternative_http_port: z.int().nonnegative().optional(),
  alternative_tls_port: z.int().nonnegative().optional(),
  get external_account() {
    return ACMEExternalAccountOptionsSchema.optional()
  },
  get dns01_challenge() {
    return ACMEProviderDNS01ChallengeOptionsSchema.optional()
  },
  get key_type() {
    return ACMEKeyTypeSchema.optional()
  },
  profile: z.string().optional(),
  get http_client() {
    return HTTPClientOptionsSchema.optional()
  },
})

export const CertificateProviderCloudflareOriginCaSchema = z.strictObject({
  type: z.literal("cloudflare-origin-ca"),
  tag: z.string().optional(),
  domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  data_directory: z.string().optional(),
  api_token: z.string().optional(),
  origin_ca_key: z.string().optional(),
  get request_type() {
    return CloudflareOriginCARequestTypeSchema.optional()
  },
  get requested_validity() {
    return CloudflareOriginCARequestValiditySchema.optional()
  },
  get http_client() {
    return HTTPClientOptionsSchema.optional()
  },
})

export const CertificateProviderTailscaleSchema = z.strictObject({
  type: z.literal("tailscale"),
  tag: z.string().optional(),
  endpoint: z.string().optional(),
})

export const CertificateProviderSchema = z.discriminatedUnion("type", [
  CertificateProviderAcmeSchema,
  CertificateProviderCloudflareOriginCaSchema,
  CertificateProviderTailscaleSchema,
])

export const CertificateProviderOptionsSchema = z.union([
  z.string(),
  CertificateProviderSchema,
])

export const ClashAPIOptionsSchema = z.strictObject({
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
  /** Deprecated: migrated to global cache file */
  cache_file: z.string().optional(),
  /** Deprecated: migrated to global cache file */
  cache_id: z.string().optional(),
  /** Deprecated: migrated to global cache file */
  store_mode: z.boolean().optional(),
  /** Deprecated: migrated to global cache file */
  store_selected: z.boolean().optional(),
  /** Deprecated: migrated to global cache file */
  store_fakeip: z.boolean().optional(),
})

export const ClientAuthTypeSchema = z.enum(["no", "request", "require-any", "verify-if-given", "require-and-verify"])

export const CloudflareOriginCARequestTypeSchema = z.string()

export const CloudflareOriginCARequestValiditySchema = z.int().nonnegative()

export const CloudflareProfileSchema = z.strictObject({
  id: z.string().optional(),
  auth_token: z.string().optional(),
  private_key: z.string().optional(),
  license_key: z.string().optional(),
  recreate: z.boolean().optional(),
  detour: z.string().optional(),
})

export const ConnectionLimiterUserSchema = z.strictObject({
  name: z.string().optional(),
  strategy: z.string().optional(),
  connection_type: z.string().optional(),
  count: z.int().nonnegative().optional(),
})

export const CurvePreferenceSchema = z.enum(["P256", "P384", "P521", "X25519", "X25519MLKEM768"])

export const DERPMeshOptionsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const DERPSTUNListenOptionsSchema = z.union([
  z.int().nonnegative(),
  z.strictObject({
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
    /** Deprecated: removed */
    proxy_protocol: z.boolean().optional(),
    /** Deprecated: removed */
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
  z.union([
    z.strictObject({
      version: z.literal("0").optional(),
      idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      stream_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      connection_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      max_concurrent_streams: z.int().optional(),
    }),
    z.strictObject({
      version: z.literal("1").optional(),
    }),
    z.strictObject({
      version: z.literal("2").optional(),
      idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      stream_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      connection_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      max_concurrent_streams: z.int().optional(),
    }),
    z.strictObject({
      version: z.literal("3").optional(),
      idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      stream_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      connection_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      max_concurrent_streams: z.int().optional(),
      initial_packet_size: z.int().optional(),
      disable_path_mtu_discovery: z.boolean().optional(),
    }),
  ]),
])

export const DNSOptionsSchema = z.strictObject({
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
  timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  disable_cache: z.boolean().optional(),
  disable_expire: z.boolean().optional(),
  independent_cache: z.boolean().optional(),
  cache_capacity: z.int().nonnegative().optional(),
  get optimistic() {
    return OptimisticDNSOptionsSchema.optional()
  },
  client_subnet: z.string().optional(),
})

export const DNSQueryTypeSchema = z.union([
  z.int().nonnegative(),
  z.enum(["A", "AAAA", "AFSDB", "AMTRELAY", "ANY", "APL", "ATMA", "AVC", "AXFR", "CAA", "CDNSKEY", "CDS", "CERT", "CNAME", "CSYNC", "DHCID", "DLV", "DNAME", "DNSKEY", "DS", "EID", "EUI48", "EUI64", "GID", "GPOS", "HINFO", "HIP", "HTTPS", "IPSECKEY", "ISDN", "IXFR", "KEY", "KX", "L32", "L64", "LOC", "LP", "MAILA", "MAILB", "MB", "MD", "MF", "MG", "MINFO", "MR", "MX", "NAPTR", "NID", "NIMLOC", "NINFO", "NS", "NSAP-PTR", "NSEC", "NSEC3", "NSEC3PARAM", "NULL", "NXNAME", "NXT", "None", "OPENPGPKEY", "OPT", "PTR", "PX", "RESINFO", "RKEY", "RP", "RRSIG", "RT", "Reserved", "SIG", "SMIMEA", "SOA", "SPF", "SRV", "SSHFP", "SVCB", "TA", "TALINK", "TKEY", "TLSA", "TSIG", "TXT", "UID", "UINFO", "UNSPEC", "URI", "X25", "ZONEMD"]),
])

export const DNSRCodeSchema = z.union([
  z.int(),
  z.enum(["BADALG", "BADCOOKIE", "BADKEY", "BADMODE", "BADNAME", "BADSIG", "BADTIME", "BADTRUNC", "DSOTYPENI", "FORMERR", "NOERROR", "NOTAUTH", "NOTIMP", "NOTIMPL", "NOTZONE", "NXDOMAIN", "NXRRSET", "REFUSED", "SERVFAIL", "YXDOMAIN", "YXRRSET"]),
])

export const DNSRecordOptionsSchema = z.strictObject({
  RR: z.unknown().optional(),
})

export const DNSRuleMatchResponseSchema = z.union([
  z.boolean(),
  z.string(),
])

export const DefaultDNSRuleBaseSchema = z.strictObject({
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
  query_client_subnet: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  query_dnssec: z.boolean().optional(),
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
  package_name_regex: z.union([
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
  source_mac_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  source_hostname: z.union([
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
  get match_response() {
    return DNSRuleMatchResponseSchema.optional()
  },
  ip_cidr: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  ip_is_private: z.boolean().optional(),
  ip_accept_any: z.boolean().optional(),
  get response_rcode() {
    return DNSRCodeSchema.optional()
  },
  get response_answer() {
    return z.union([
      DNSRecordOptionsSchema,
      z.array(DNSRecordOptionsSchema),
    ]).optional()
  },
  get response_ns() {
    return z.union([
      DNSRecordOptionsSchema,
      z.array(DNSRecordOptionsSchema),
    ]).optional()
  },
  get response_extra() {
    return z.union([
      DNSRecordOptionsSchema,
      z.array(DNSRecordOptionsSchema),
    ]).optional()
  },
  invert: z.boolean().optional(),
  /** Deprecated: removed in sing-box 1.12.0 */
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
  /** Deprecated: removed in sing-box 1.11.0 */
  rule_set_ip_cidr_accept_empty: z.boolean().optional(),
  /** Deprecated: renamed to rule_set_ip_cidr_match_source */
  rule_set_ipcidr_match_source: z.boolean().optional(),
})

export const DNSRuleSchema = z.union([
  DefaultDNSRuleBaseSchema.extend({
    action: z.literal("route").optional(),
    server: z.string().optional(),
    speculative: z.boolean().optional(),
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    disable_optimistic_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
    remove_client_subnet: z.boolean().optional(),
  }),
  DefaultDNSRuleBaseSchema.extend({
    action: z.literal("route-options").optional(),
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    disable_optimistic_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
    remove_client_subnet: z.boolean().optional(),
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
  z.strictObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(DNSRuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("route").optional(),
    server: z.string().optional(),
    speculative: z.boolean().optional(),
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    disable_optimistic_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
    remove_client_subnet: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(DNSRuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("route-options").optional(),
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    disable_optimistic_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
    remove_client_subnet: z.boolean().optional(),
  }),
  z.strictObject({
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
  z.strictObject({
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

export const DebugOptionsSchema = z.strictObject({
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

export const DefaultRuleBaseSchema = z.strictObject({
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
  package_name_regex: z.union([
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
  source_mac_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  source_hostname: z.union([
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
  /** Deprecated: renamed to rule_set_ip_cidr_match_source */
  rule_set_ipcidr_match_source: z.boolean().optional(),
})

export const DialerOptionsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const DnsDhcpSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  prefer_go: z.boolean().optional(),
  neighbor_domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  interface: z.string().optional(),
})

export const DnsFakeipSchema = z.strictObject({
  type: z.literal("fakeip"),
  tag: z.string().optional(),
  inet4_range: z.string().optional(),
  inet6_range: z.string().optional(),
})

export const DnsFallbackSchema = z.strictObject({
  type: z.literal("fallback"),
  tag: z.string().optional(),
  servers: z.array(z.string()).optional(),
  strategy: z.string().optional(),
  timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const DnsH3Schema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const DnsHostsSchema = z.strictObject({
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

export const DnsHttpsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const DnsLocalSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  prefer_go: z.boolean().optional(),
  neighbor_domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
})

export const DnsMdnsSchema = z.strictObject({
  type: z.literal("mdns"),
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  prefer_go: z.boolean().optional(),
  neighbor_domain: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  interface: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
})

export const DnsOpenconnectSchema = z.strictObject({
  type: z.literal("openconnect"),
  tag: z.string().optional(),
  endpoint: z.string().optional(),
  accept_default_resolvers: z.boolean().optional(),
  accept_search_domain: z.boolean().optional(),
})

export const DnsOpenvpnSchema = z.strictObject({
  type: z.literal("openvpn"),
  tag: z.string().optional(),
  endpoint: z.string().optional(),
  accept_default_resolvers: z.boolean().optional(),
  accept_search_domain: z.boolean().optional(),
})

export const DnsQuicSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const DnsResolvedSchema = z.strictObject({
  type: z.literal("resolved"),
  tag: z.string().optional(),
  service: z.string().optional(),
  accept_default_resolvers: z.boolean().optional(),
})

export const DnsSdnsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  stamp: z.string().optional(),
})

export const DnsTailscaleSchema = z.strictObject({
  type: z.literal("tailscale"),
  tag: z.string().optional(),
  endpoint: z.string().optional(),
  accept_default_resolvers: z.boolean().optional(),
  accept_search_domain: z.boolean().optional(),
})

export const DnsTcpSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
})

export const DnsTlsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const DnsUdpSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  DnsMdnsSchema,
  DnsOpenconnectSchema,
  DnsOpenvpnSchema,
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
  z.strictObject({
    server: z.string().optional(),
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    disable_optimistic_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
])

export const DomainStrategySchema = z.enum(["", "as_is", "prefer_ipv4", "prefer_ipv6", "ipv4_only", "ipv6_only"])

export const EndpointOpenconnectSchema = z.strictObject({
  type: z.literal("openconnect"),
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  system: z.boolean().optional(),
  name: z.string().optional(),
  udp_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get udp_mapping() {
    return UDPNATBehaviorSchema.optional()
  },
  get udp_filtering() {
    return UDPNATBehaviorSchema.optional()
  },
  udp_nat_max: z.int().nonnegative().optional(),
  server: z.string().optional(),
  flavor: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  auth_group: z.string().optional(),
  cookie: z.string().optional(),
  get token() {
    return OpenConnectTokenOptionsSchema.optional()
  },
  reported_os: z.string().optional(),
  user_agent: z.string().optional(),
  version: z.string().optional(),
  local_hostname: z.string().optional(),
  get mobile() {
    return OpenConnectMobileOptionsSchema.optional()
  },
  get csd() {
    return OpenConnectCSDOptionsSchema.optional()
  },
  get hip() {
    return OpenConnectHIPOptionsSchema.optional()
  },
  get tncc() {
    return OpenConnectTNCCOptionsSchema.optional()
  },
  get fortinet_host_check() {
    return OpenConnectFortinetHostCheckOptionsSchema.optional()
  },
  no_udp: z.boolean().optional(),
  dtls_local_port: z.int().nonnegative().optional(),
  compression_disabled: z.boolean().optional(),
  compression_mode: z.string().optional(),
  ipv6_disabled: z.boolean().optional(),
  http_keepalive_disabled: z.boolean().optional(),
  xml_post_disabled: z.boolean().optional(),
  external_auth_disabled: z.boolean().optional(),
  password_authentication_disabled: z.boolean().optional(),
  tcp_keep_alive_enabled: z.boolean().optional(),
  pfs: z.boolean().optional(),
  mtu: z.int().nonnegative().optional(),
  base_mtu: z.int().nonnegative().optional(),
  dpd_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  reconnect_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  trojan_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  queue_length: z.int().nonnegative().optional(),
  allow_insecure_crypto: z.boolean().optional(),
  get tls() {
    return OpenConnectTLSOptionsSchema.optional()
  },
  get form_entries() {
    return z.array(OpenConnectFormEntryOptionsSchema).optional()
  },
})

export const EndpointOpenvpnClientSchema = z.strictObject({
  type: z.literal("openvpn-client"),
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  system: z.boolean().optional(),
  name: z.string().optional(),
  mtu: z.int().nonnegative().optional(),
  get udp_mapping() {
    return UDPNATBehaviorSchema.optional()
  },
  get udp_filtering() {
    return UDPNATBehaviorSchema.optional()
  },
  udp_nat_max: z.int().nonnegative().optional(),
  mode: z.string().optional(),
  network: z.string().optional(),
  get servers() {
    return z.array(OpenVPNRemoteOptionsSchema).optional()
  },
  remote_random: z.boolean().optional(),
  address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  peer_address: z.string().optional(),
  peer_address_ipv6: z.string().optional(),
  topology: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  auth_retry: z.string().optional(),
  static_challenge: z.string().optional(),
  static_challenge_echo: z.boolean().optional(),
  static_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  static_key_path: z.string().optional(),
  key_direction: z.string().optional(),
  get tls() {
    return OpenVPNOutboundTLSOptionsSchema.optional()
  },
  cipher: z.string().optional(),
  data_ciphers: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  data_ciphers_fallback: z.string().optional(),
  auth: z.string().optional(),
  mss_fix: z.int().nonnegative().optional(),
  mss_fix_disabled: z.boolean().optional(),
  mss_fix_mode: z.string().optional(),
  fragment: z.int().nonnegative().optional(),
  replay_window: z.int().nonnegative().optional(),
  replay_window_time: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  compression: z.string().optional(),
  compression_lzo: z.string().optional(),
  allow_compression: z.string().optional(),
  route_no_pull: z.boolean().optional(),
  get pull_filters() {
    return z.array(OpenVPNPullFilterOptionsSchema).optional()
  },
  routes: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  route_gateway: z.string().optional(),
  route_metric: z.int().optional(),
  redirect_gateway: z.boolean().optional(),
  redirect_gateway_flags: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  redirect_private: z.boolean().optional(),
  block_ipv6: z.boolean().optional(),
  ping_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  ping_restart: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  ping_restart_disabled: z.boolean().optional(),
  renegotiate_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  renegotiate_disabled: z.boolean().optional(),
  renegotiate_bytes: z.int().nonnegative().optional(),
  renegotiate_packets: z.int().nonnegative().optional(),
  tls_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  handshake_window: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  explicit_exit_notify: z.int().nonnegative().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
})

export const EndpointOpenvpnServerSchema = z.strictObject({
  type: z.literal("openvpn-server"),
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  system: z.boolean().optional(),
  name: z.string().optional(),
  mtu: z.int().nonnegative().optional(),
  get udp_mapping() {
    return UDPNATBehaviorSchema.optional()
  },
  get udp_filtering() {
    return UDPNATBehaviorSchema.optional()
  },
  udp_nat_max: z.int().nonnegative().optional(),
  mode: z.string().optional(),
  network: z.string().optional(),
  remote: z.string().optional(),
  remote_port: z.int().nonnegative().optional(),
  max_clients: z.int().optional(),
  address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  peer_address: z.string().optional(),
  peer_address_ipv6: z.string().optional(),
  topology: z.string().optional(),
  duplicate_cn: z.boolean().optional(),
  users: z.array(z.strictObject({
    Username: z.string().optional(),
    Password: z.string().optional(),
  })).optional(),
  static_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  static_key_path: z.string().optional(),
  key_direction: z.string().optional(),
  get tls() {
    return OpenVPNInboundTLSOptionsSchema.optional()
  },
  cipher: z.string().optional(),
  data_ciphers: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  data_ciphers_fallback: z.string().optional(),
  auth: z.string().optional(),
  mss_fix: z.int().nonnegative().optional(),
  mss_fix_disabled: z.boolean().optional(),
  mss_fix_mode: z.string().optional(),
  replay_window: z.int().nonnegative().optional(),
  replay_window_time: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get push() {
    return OpenVPNPushOptionsSchema.optional()
  },
  ping_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  ping_restart: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  renegotiate_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  renegotiate_disabled: z.boolean().optional(),
  renegotiate_bytes: z.int().nonnegative().optional(),
  renegotiate_packets: z.int().nonnegative().optional(),
  handshake_window: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const EndpointTailscaleSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  listen_port: z.int().nonnegative().optional(),
  relay_server_port: z.int().nonnegative().optional(),
  relay_server_static_endpoints: z.array(z.string()).optional(),
  system_interface: z.boolean().optional(),
  system_interface_name: z.string().optional(),
  system_interface_mtu: z.int().nonnegative().optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  get ssh_server() {
    return TailscaleSSHServerOptionsSchema.optional()
  },
  taildrop_directory: z.string().optional(),
})

export const EndpointVpnClientSchema = z.strictObject({
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

export const EndpointVpnServerSchema = z.strictObject({
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

export const EndpointWarpSchema = z.strictObject({
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
  address: z.string().optional(),
  port: z.int().nonnegative().optional(),
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const EndpointWireguardSchema = z.strictObject({
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
  get udp_mapping() {
    return UDPNATBehaviorSchema.optional()
  },
  get udp_filtering() {
    return UDPNATBehaviorSchema.optional()
  },
  udp_nat_max: z.int().nonnegative().optional(),
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const EndpointSchema = z.discriminatedUnion("type", [
  EndpointOpenconnectSchema,
  EndpointOpenvpnClientSchema,
  EndpointOpenvpnServerSchema,
  EndpointTailscaleSchema,
  EndpointVpnClientSchema,
  EndpointVpnServerSchema,
  EndpointWarpSchema,
  EndpointWireguardSchema,
])

export const ExperimentalOptionsSchema = z.strictObject({
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

export const GeoIPOptionsSchema = z.strictObject({
  path: z.string().optional(),
  download_url: z.string().optional(),
  download_detour: z.string().optional(),
})

export const GeositeOptionsSchema = z.strictObject({
  path: z.string().optional(),
  download_url: z.string().optional(),
  download_detour: z.string().optional(),
})

export const HTTPClientOptionsSchema = z.union([
  z.string(),
  z.union([
    z.strictObject({
      version: z.literal(0).optional(),
      tag: z.string().optional(),
      engine: z.string().optional(),
      disable_version_fallback: z.boolean().optional(),
      headers: z.record(z.string(), z.union([
        z.string(),
        z.array(z.string()),
      ])).optional(),
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
      /** Deprecated: migrated to domain resolver */
      get domain_strategy() {
        return DomainStrategySchema.optional()
      },
      idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      stream_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      connection_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      max_concurrent_streams: z.int().optional(),
    }),
    z.strictObject({
      version: z.literal(1).optional(),
      tag: z.string().optional(),
      engine: z.string().optional(),
      disable_version_fallback: z.boolean().optional(),
      headers: z.record(z.string(), z.union([
        z.string(),
        z.array(z.string()),
      ])).optional(),
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
      /** Deprecated: migrated to domain resolver */
      get domain_strategy() {
        return DomainStrategySchema.optional()
      },
    }),
    z.strictObject({
      version: z.literal(2).optional(),
      tag: z.string().optional(),
      engine: z.string().optional(),
      disable_version_fallback: z.boolean().optional(),
      headers: z.record(z.string(), z.union([
        z.string(),
        z.array(z.string()),
      ])).optional(),
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
      /** Deprecated: migrated to domain resolver */
      get domain_strategy() {
        return DomainStrategySchema.optional()
      },
      idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      stream_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      connection_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      max_concurrent_streams: z.int().optional(),
    }),
    z.strictObject({
      version: z.literal(3).optional(),
      tag: z.string().optional(),
      engine: z.string().optional(),
      disable_version_fallback: z.boolean().optional(),
      headers: z.record(z.string(), z.union([
        z.string(),
        z.array(z.string()),
      ])).optional(),
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
      /** Deprecated: migrated to domain resolver */
      get domain_strategy() {
        return DomainStrategySchema.optional()
      },
      idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
      stream_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      connection_receive_window: z.union([
        z.int().nonnegative(),
        z.string(),
      ]).optional(),
      max_concurrent_streams: z.int().optional(),
      initial_packet_size: z.int().optional(),
      disable_path_mtu_discovery: z.boolean().optional(),
    }),
  ]),
])

export const HTTPClientSchema = z.union([
  z.strictObject({
    version: z.literal(0).optional(),
    tag: z.string().optional(),
    engine: z.string().optional(),
    disable_version_fallback: z.boolean().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
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
    /** Deprecated: migrated to domain resolver */
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
    idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    stream_receive_window: z.union([
      z.int().nonnegative(),
      z.string(),
    ]).optional(),
    connection_receive_window: z.union([
      z.int().nonnegative(),
      z.string(),
    ]).optional(),
    max_concurrent_streams: z.int().optional(),
  }),
  z.strictObject({
    version: z.literal(1).optional(),
    tag: z.string().optional(),
    engine: z.string().optional(),
    disable_version_fallback: z.boolean().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
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
    /** Deprecated: migrated to domain resolver */
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
  }),
  z.strictObject({
    version: z.literal(2).optional(),
    tag: z.string().optional(),
    engine: z.string().optional(),
    disable_version_fallback: z.boolean().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
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
    /** Deprecated: migrated to domain resolver */
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
    idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    stream_receive_window: z.union([
      z.int().nonnegative(),
      z.string(),
    ]).optional(),
    connection_receive_window: z.union([
      z.int().nonnegative(),
      z.string(),
    ]).optional(),
    max_concurrent_streams: z.int().optional(),
  }),
  z.strictObject({
    version: z.literal(3).optional(),
    tag: z.string().optional(),
    engine: z.string().optional(),
    disable_version_fallback: z.boolean().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
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
    /** Deprecated: migrated to domain resolver */
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
    idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    stream_receive_window: z.union([
      z.int().nonnegative(),
      z.string(),
    ]).optional(),
    connection_receive_window: z.union([
      z.int().nonnegative(),
      z.string(),
    ]).optional(),
    max_concurrent_streams: z.int().optional(),
    initial_packet_size: z.int().optional(),
    disable_path_mtu_discovery: z.boolean().optional(),
  }),
])

export const HTTPProxyOptionsSchema = z.strictObject({
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
  z.strictObject({
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
    package_name_regex: z.union([
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
  z.strictObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(HeadlessRuleSchema).optional()
    },
    invert: z.boolean().optional(),
  }),
])

export const Hysteria2InboundRealmSchema = z.strictObject({
  server_url: z.string().optional(),
  token: z.string().optional(),
  realm_id: z.string().optional(),
  stun_servers: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  ip_version: z.int().optional(),
  get port_mapping() {
    return Hysteria2RealmPortMappingSchema.optional()
  },
  get http_client() {
    return HTTPClientOptionsSchema.optional()
  },
  get stun_domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
})

export const Hysteria2MasqueradeSchema = z.union([
  z.strictObject({
    type: z.literal("file").optional(),
    directory: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("proxy").optional(),
    url: z.string().optional(),
    rewrite_host: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("string").optional(),
    status_code: z.int().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
    content: z.string().optional(),
  }),
])

export const Hysteria2ObfsSchema = z.union([
  z.strictObject({
    type: z.literal("salamander").optional(),
    password: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("gecko").optional(),
    password: z.string().optional(),
    min_packet_size: z.int().optional(),
    max_packet_size: z.int().optional(),
  }),
])

export const Hysteria2RealmPortMappingSchema = z.strictObject({
  enabled: z.boolean().optional(),
  timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  lifetime: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const Hysteria2RealmSchema = z.strictObject({
  server_url: z.string().optional(),
  token: z.string().optional(),
  realm_id: z.string().optional(),
  stun_servers: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  ip_version: z.int().optional(),
  get port_mapping() {
    return Hysteria2RealmPortMappingSchema.optional()
  },
  get http_client() {
    return HTTPClientOptionsSchema.optional()
  },
})

export const Hysteria2UserSchema = z.strictObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const HysteriaRealmUserSchema = z.strictObject({
  name: z.string().optional(),
  token: z.string().optional(),
  max_realms: z.int().optional(),
})

export const HysteriaUserSchema = z.strictObject({
  name: z.string().optional(),
  auth: z.string().optional(),
  auth_str: z.string().optional(),
})

export const InboundACMEOptionsSchema = z.strictObject({
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
  profile: z.string().optional(),
})

export const InboundAnytlsSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundBondSchema = z.strictObject({
  type: z.literal("bond"),
  tag: z.string().optional(),
  get inbounds() {
    return z.array(InboundSchema).optional()
  },
})

export const InboundCallSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  /** Email and Password are used to re-authenticate with the dion.vc platform when the refresh cookie is missing or rejected. */
  email: z.string().optional(),
  password: z.string().optional(),
})

export const InboundCloudflaredSchema = z.strictObject({
  type: z.literal("cloudflared"),
  tag: z.string().optional(),
  token: z.string().optional(),
  ha_connections: z.int().optional(),
  protocol: z.string().optional(),
  post_quantum: z.boolean().optional(),
  edge_ip_version: z.int().optional(),
  datagram_version: z.string().optional(),
  grace_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  region: z.string().optional(),
  get control_dialer() {
    return DialerOptionsSchema.optional()
  },
  get tunnel_dialer() {
    return DialerOptionsSchema.optional()
  },
})

export const InboundDirectSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundECHOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  key_path: z.string().optional(),
  /** Deprecated: not supported by stdlib */
  pq_signature_schemes_enabled: z.boolean().optional(),
  /** Deprecated: added by fault */
  dynamic_record_sizing_disabled: z.boolean().optional(),
})

export const InboundFailoverSchema = z.strictObject({
  type: z.literal("failover"),
  tag: z.string().optional(),
  get inbounds() {
    return z.array(InboundSchema).optional()
  },
})

export const InboundHttpSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  users: z.array(z.strictObject({
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

export const InboundHysteria2Schema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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
  idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  stream_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  connection_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  max_concurrent_streams: z.int().optional(),
  initial_packet_size: z.int().optional(),
  disable_path_mtu_discovery: z.boolean().optional(),
  get masquerade() {
    return Hysteria2MasqueradeSchema.optional()
  },
  bbr_profile: z.string().optional(),
  brutal_debug: z.boolean().optional(),
  get realm() {
    return Hysteria2InboundRealmSchema.optional()
  },
})

export const InboundHysteriaSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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
  /** Deprecated: use QUIC fields instead */
  recv_window_conn: z.int().nonnegative().optional(),
  /** Deprecated: use QUIC fields instead */
  recv_window_client: z.int().nonnegative().optional(),
  /** Deprecated: use QUIC fields instead */
  max_conn_client: z.int().optional(),
  /** Deprecated: use QUIC fields instead */
  disable_mtu_discovery: z.boolean().optional(),
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
  idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  stream_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  connection_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  max_concurrent_streams: z.int().optional(),
  initial_packet_size: z.int().optional(),
  disable_path_mtu_discovery: z.boolean().optional(),
})

export const InboundMieruSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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
  mtu: z.int().nonnegative().optional(),
})

export const InboundMixedSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  users: z.array(z.strictObject({
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

export const InboundMtproxySchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundMultiplexOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  padding: z.boolean().optional(),
  get brutal() {
    return BrutalOptionsSchema.optional()
  },
})

export const InboundNaiveSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  users: z.array(z.strictObject({
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

export const InboundRealityHandshakeOptionsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const InboundRealityOptionsSchema = z.strictObject({
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

export const InboundRedirectSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
})

export const InboundShadowsocksSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundShadowtlsSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundSnellSchema = z.strictObject({
  type: z.literal("snell"),
  tag: z.string().optional(),
  version: z.int().optional(),
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  psk: z.string().optional(),
  get users() {
    return z.array(SnellUserSchema).optional()
  },
})

export const InboundSocksSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  users: z.array(z.strictObject({
    Username: z.string().optional(),
    Password: z.string().optional(),
  })).optional(),
  get domain_resolver() {
    return DomainResolveOptionsSchema.optional()
  },
})

export const InboundSshSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundSudokuSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundTproxySchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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
  get udp_mapping() {
    return UDPNATBehaviorSchema.optional()
  },
  get udp_filtering() {
    return UDPNATBehaviorSchema.optional()
  },
  udp_nat_max: z.int().nonnegative().optional(),
})

export const InboundTrojanSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundTrusttunnelSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundTuicSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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
  idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  stream_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  connection_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  max_concurrent_streams: z.int().optional(),
  initial_packet_size: z.int().optional(),
  disable_path_mtu_discovery: z.boolean().optional(),
})

export const InboundTunSchema = z.strictObject({
  type: z.literal("tun"),
  tag: z.string().optional(),
  interface_name: z.string().optional(),
  netns: z.string().optional(),
  mtu: z.int().nonnegative().optional(),
  address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  dns_mode: z.string().optional(),
  dns_address: z.union([
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
  include_mac_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  exclude_mac_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get udp_timeout() {
    return UDPTimeoutCompatSchema.optional()
  },
  get udp_mapping() {
    return UDPNATBehaviorSchema.optional()
  },
  get udp_filtering() {
    return UDPNATBehaviorSchema.optional()
  },
  udp_nat_max: z.int().nonnegative().optional(),
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
  /** Deprecated: removed */
  gso: z.boolean().optional(),
  /** Deprecated: merged to Address */
  inet4_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  /** Deprecated: merged to Address */
  inet6_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  /** Deprecated: merged to RouteAddress */
  inet4_route_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  /** Deprecated: merged to RouteAddress */
  inet6_route_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  /** Deprecated: merged to RouteExcludeAddress */
  inet4_route_exclude_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  /** Deprecated: merged to RouteExcludeAddress */
  inet6_route_exclude_address: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  /** Deprecated: removed */
  endpoint_independent_nat: z.boolean().optional(),
})

export const InboundVlessSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const InboundVmessSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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
  InboundCloudflaredSchema,
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

export const InboundTLSOptionsSchema = z.strictObject({
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
  handshake_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get certificate_provider() {
    return CertificateProviderOptionsSchema.optional()
  },
  /** Deprecated: use certificate_provider */
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

export const LogOptionsSchema = z.strictObject({
  disabled: z.boolean().optional(),
  level: z.string().optional(),
  output: z.string().optional(),
  timestamp: z.boolean().optional(),
})

export const MASQUEOutboundTLSOptionsSchema = z.strictObject({
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

export const MTProxyUserSchema = z.strictObject({
  name: z.string().optional(),
  secret: z.string().optional(),
})

export const ManagerServiceDatabaseSchema = z.strictObject({
  driver: z.string().optional(),
  dsn: z.string().optional(),
})

export const MieruUserSchema = z.strictObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const NTPOptionsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const NetworkListSchema = z.union([
  z.enum(["tcp", "udp"]),
  z.array(z.enum(["tcp", "udp"])),
])

export const NetworkNamespaceSchema = z.union([
  z.strictObject({
    type: z.literal("default").optional(),
    tag: z.string().optional(),
    path: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("unshare").optional(),
    tag: z.string().optional(),
    pid_file: z.string().optional(),
  }),
])

export const NetworkStrategySchema = z.enum(["default", "fallback", "hybrid"])

export const OCMUserSchema = z.strictObject({
  name: z.string().optional(),
  token: z.string().optional(),
})

export const OpenConnectCSDOptionsSchema = z.strictObject({
  wrapper_path: z.string().optional(),
})

export const OpenConnectFormEntryOptionsSchema = z.strictObject({
  form_id: z.string().optional(),
  submission_key: z.string().optional(),
  name: z.string().optional(),
  value: z.string().optional(),
  promote: z.boolean().optional(),
})

export const OpenConnectFortinetHostCheckOptionsSchema = z.strictObject({
  hostcheck: z.string().optional(),
  check_virtual_desktop: z.string().optional(),
})

export const OpenConnectHIPOptionsSchema = z.strictObject({
  wrapper_path: z.string().optional(),
})

export const OpenConnectMobileOptionsSchema = z.strictObject({
  platform_version: z.string().optional(),
  device_type: z.string().optional(),
  device_unique_id: z.string().optional(),
})

export const OpenConnectTLSOptionsSchema = z.strictObject({
  insecure: z.boolean().optional(),
  server_name: z.string().optional(),
  peer_fingerprint: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  system_trust_disabled: z.boolean().optional(),
  certificate_authority: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  certificate_authority_path: z.string().optional(),
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
  client_key_password: z.string().optional(),
  mca_certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  mca_certificate_path: z.string().optional(),
  mca_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  mca_key_path: z.string().optional(),
  mca_key_password: z.string().optional(),
})

export const OpenConnectTNCCCertificateOptionsSchema = z.strictObject({
  certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  certificate_path: z.string().optional(),
})

export const OpenConnectTNCCOptionsSchema = z.strictObject({
  wrapper_path: z.string().optional(),
  device_id: z.string().optional(),
  user_agent: z.string().optional(),
  machine_identification_enabled: z.boolean().optional(),
  get certificates() {
    return z.array(OpenConnectTNCCCertificateOptionsSchema).optional()
  },
})

export const OpenConnectTokenOptionsSchema = z.strictObject({
  mode: z.string().optional(),
  secret: z.string().optional(),
  secret_path: z.string().optional(),
  pin: z.string().optional(),
  password: z.string().optional(),
  device_id: z.string().optional(),
  counter: z.int().nonnegative().optional(),
})

export const OpenVPNControlWrapOptionsSchema = z.strictObject({
  type: z.string().optional(),
  key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  key_path: z.string().optional(),
  direction: z.string().optional(),
})

export const OpenVPNInboundControlWrapOptionsSchema = z.strictObject({
  type: z.string().optional(),
  key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  key_path: z.string().optional(),
  direction: z.string().optional(),
  force_cookie: z.boolean().optional(),
})

export const OpenVPNInboundTLSOptionsSchema = z.strictObject({
  certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  certificate_path: z.string().optional(),
  key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  key_path: z.string().optional(),
  client_certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  client_certificate_path: z.string().optional(),
  verify_client_certificate: z.string().optional(),
  client_name: z.string().optional(),
  client_name_type: z.string().optional(),
  peer_fingerprint: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  crl_path: z.string().optional(),
  remote_certificate_ku: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  remote_certificate_eku: z.string().optional(),
  remote_certificate_tls: z.string().optional(),
  certificate_profile: z.string().optional(),
  ns_certificate_type: z.string().optional(),
  version_min: z.string().optional(),
  version_max: z.string().optional(),
  cipher: z.string().optional(),
  groups: z.string().optional(),
  get control_wrap() {
    return OpenVPNInboundControlWrapOptionsSchema.optional()
  },
})

export const OpenVPNOutboundTLSOptionsSchema = z.strictObject({
  server_name: z.string().optional(),
  server_name_type: z.string().optional(),
  certificate: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  certificate_path: z.string().optional(),
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
  peer_fingerprint: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  crl_path: z.string().optional(),
  remote_certificate_ku: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  remote_certificate_eku: z.string().optional(),
  remote_certificate_tls: z.string().optional(),
  certificate_profile: z.string().optional(),
  ns_certificate_type: z.string().optional(),
  version_min: z.string().optional(),
  version_max: z.string().optional(),
  cipher: z.string().optional(),
  groups: z.string().optional(),
  get control_wrap() {
    return OpenVPNControlWrapOptionsSchema.optional()
  },
})

export const OpenVPNPullFilterOptionsSchema = z.strictObject({
  action: z.string().optional(),
  text: z.string().optional(),
})

export const OpenVPNPushDNSServerOptionsSchema = z.strictObject({
  priority: z.int().optional(),
  addresses: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  resolve_domains: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  dnssec: z.string().optional(),
  transport: z.string().optional(),
  sni: z.string().optional(),
})

export const OpenVPNPushOptionsSchema = z.strictObject({
  routes: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  dns: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  get dns_servers() {
    return z.array(OpenVPNPushDNSServerOptionsSchema).optional()
  },
  search_domains: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  dhcp_options: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  redirect_gateway: z.boolean().optional(),
  redirect_gateway_flags: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  block_outside_dns: z.boolean().optional(),
  ping_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  ping_restart: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const OpenVPNRemoteOptionsSchema = z.strictObject({
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  network: z.string().optional(),
})

export const OptimisticDNSOptionsSchema = z.union([
  z.boolean(),
  z.strictObject({
    enabled: z.boolean().optional(),
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  }),
])

export const OptionsSchema = z.strictObject({
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
  get certificate_providers() {
    return z.array(CertificateProviderSchema).optional()
  },
  get http_clients() {
    return z.array(HTTPClientSchema).optional()
  },
  get network_namespaces() {
    return z.array(NetworkNamespaceSchema).optional()
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

export const OutboundAnytlsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundBandwidthLimiterSchema = z.strictObject({
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

export const OutboundBondSchema = z.strictObject({
  type: z.literal("bond"),
  tag: z.string().optional(),
  get outbounds() {
    return z.array(BondOutboundSchema).optional()
  },
})

export const OutboundBridgeSchema = z.strictObject({
  type: z.literal("bridge"),
  tag: z.string().optional(),
  interface: z.string().optional(),
  bridge_name: z.string().optional(),
  iproute2_table_index: z.int().optional(),
  iproute2_rule_index: z.int().optional(),
})

export const OutboundCallSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundConnectionLimiterSchema = z.strictObject({
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

export const OutboundDirectSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  override_address: z.string().optional(),
  override_port: z.int().nonnegative().optional(),
  proxy_protocol: z.int().nonnegative().optional(),
})

export const OutboundECHOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  config: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  config_path: z.string().optional(),
  query_server_name: z.string().optional(),
  /** Deprecated: not supported by stdlib */
  pq_signature_schemes_enabled: z.boolean().optional(),
  /** Deprecated: added by fault */
  dynamic_record_sizing_disabled: z.boolean().optional(),
})

export const OutboundFailoverSchema = z.strictObject({
  type: z.literal("failover"),
  tag: z.string().optional(),
  strategy: z.string().optional(),
  delay: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get outbounds() {
    return z.array(OutboundSchema).optional()
  },
})

export const OutboundFallbackSchema = z.strictObject({
  type: z.literal("fallback"),
  tag: z.string().optional(),
  outbounds: z.array(z.string()).optional(),
  blacklist_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const OutboundHttpSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundHysteria2Schema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  hop_interval_max: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
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
  idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  stream_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  connection_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  max_concurrent_streams: z.int().optional(),
  initial_packet_size: z.int().optional(),
  disable_path_mtu_discovery: z.boolean().optional(),
  bbr_profile: z.string().optional(),
  brutal_debug: z.boolean().optional(),
  disable_chrome_parrot: z.boolean().optional(),
  get realm() {
    return Hysteria2RealmSchema.optional()
  },
})

export const OutboundHysteriaSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  /** Deprecated: use QUIC fields instead */
  recv_window_conn: z.int().nonnegative().optional(),
  /** Deprecated: use QUIC fields instead */
  recv_window: z.int().nonnegative().optional(),
  /** Deprecated: use QUIC fields instead */
  disable_mtu_discovery: z.boolean().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
  idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  stream_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  connection_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  max_concurrent_streams: z.int().optional(),
  initial_packet_size: z.int().optional(),
  disable_path_mtu_discovery: z.boolean().optional(),
})

export const OutboundMasqueSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  address: z.string().optional(),
  port: z.int().nonnegative().optional(),
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

export const OutboundMieruSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  mtu: z.int().nonnegative().optional(),
  handshake_mode: z.string().optional(),
})

export const OutboundMultiplexOptionsSchema = z.strictObject({
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

export const OutboundNaiveSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundParserSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  link: z.string().optional(),
})

export const OutboundRateLimiterSchema = z.strictObject({
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

export const OutboundRealityOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  public_key: z.string().optional(),
  short_id: z.string().optional(),
})

export const OutboundSelectorSchema = z.strictObject({
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

export const OutboundShadowsocksSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundShadowtlsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundSnellSchema = z.strictObject({
  type: z.literal("snell"),
  tag: z.string().optional(),
  version: z.int().optional(),
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  psk: z.string().optional(),
  userkey: z.string().optional(),
  reuse: z.boolean().optional(),
  get network() {
    return NetworkListSchema.optional()
  },
})

export const OutboundSocksSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundSshSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  cipher: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  mac: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  kex_algorithm: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
})

export const OutboundSudokuSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundTorSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  executable_path: z.string().optional(),
  extra_args: z.array(z.string()).optional(),
  data_directory: z.string().optional(),
  torrc: z.record(z.string(), z.string()).optional(),
})

export const OutboundTrafficLimiterSchema = z.strictObject({
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

export const OutboundTrojanSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundTrusttunnelSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundTuicSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  stream_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  connection_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  max_concurrent_streams: z.int().optional(),
  initial_packet_size: z.int().optional(),
  disable_path_mtu_discovery: z.boolean().optional(),
})

export const OutboundUrltestSchema = z.strictObject({
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

export const OutboundVlessSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const OutboundVmessSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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
  OutboundBridgeSchema,
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

export const OutboundTLSOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  engine: z.string().optional(),
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
  spoof: z.string().optional(),
  spoof_method: z.string().optional(),
  kernel_tx: z.boolean().optional(),
  kernel_rx: z.boolean().optional(),
  handshake_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
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

export const OutboundUTLSOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  fingerprint: z.string().optional(),
})

export const ProviderHealthCheckOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  url: z.string().optional(),
  interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const ProviderInlineSchema = z.strictObject({
  type: z.literal("inline"),
  tag: z.string().optional(),
  get outbounds() {
    return z.array(OutboundSchema).optional()
  },
  remove_emojis: z.boolean().optional(),
  get health_check() {
    return ProviderHealthCheckOptionsSchema.optional()
  },
  get override_dialer_options() {
    return DialerOptionsSchema.optional()
  },
})

export const ProviderLocalSchema = z.strictObject({
  type: z.literal("local"),
  tag: z.string().optional(),
  path: z.string().optional(),
  remove_emojis: z.boolean().optional(),
  get health_check() {
    return ProviderHealthCheckOptionsSchema.optional()
  },
  get override_dialer_options() {
    return DialerOptionsSchema.optional()
  },
})

export const ProviderRemoteSchema = z.strictObject({
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
  get override_dialer_options() {
    return DialerOptionsSchema.optional()
  },
})

export const ProviderSchema = z.discriminatedUnion("type", [
  ProviderInlineSchema,
  ProviderLocalSchema,
  ProviderRemoteSchema,
])

export const RateLimiterUserSchema = z.strictObject({
  name: z.string().optional(),
  strategy: z.string().optional(),
  connection_type: z.string().optional(),
  count: z.int().nonnegative().optional(),
  interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
})

export const RouteOptionsSchema = z.strictObject({
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
  find_neighbor: z.boolean().optional(),
  dhcp_lease_files: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
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
  default_http_client: z.string().optional(),
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
    tls_spoof: z.string().optional(),
    tls_spoof_method: z.string().optional(),
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
    tls_spoof: z.string().optional(),
    tls_spoof_method: z.string().optional(),
  }),
  DefaultRuleBaseSchema.extend({
    action: z.literal("direct").optional(),
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
    /** Deprecated: migrated to domain resolver */
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
    tls_spoof: z.string().optional(),
    tls_spoof_method: z.string().optional(),
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
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    disable_optimistic_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
  z.strictObject({
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
    tls_spoof: z.string().optional(),
    tls_spoof_method: z.string().optional(),
  }),
  z.strictObject({
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
    tls_spoof: z.string().optional(),
    tls_spoof_method: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("direct").optional(),
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
    /** Deprecated: migrated to domain resolver */
    get domain_strategy() {
      return DomainStrategySchema.optional()
    },
  }),
  z.strictObject({
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
    tls_spoof: z.string().optional(),
    tls_spoof_method: z.string().optional(),
  }),
  z.strictObject({
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
  z.strictObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("hijack-dns").optional(),
  }),
  z.strictObject({
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
  z.strictObject({
    type: z.literal("logical").optional(),
    mode: z.string().optional(),
    get rules() {
      return z.array(RuleSchema).optional()
    },
    invert: z.boolean().optional(),
    action: z.literal("resolve").optional(),
    server: z.string().optional(),
    timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    get strategy() {
      return DomainStrategySchema.optional()
    },
    disable_cache: z.boolean().optional(),
    disable_optimistic_cache: z.boolean().optional(),
    rewrite_ttl: z.int().nonnegative().optional(),
    client_subnet: z.string().optional(),
  }),
])

export const RuleSetSchema = z.union([
  z.strictObject({
    type: z.literal("inline").optional(),
    tag: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    format: z.string().optional(),
    get rules() {
      return z.array(HeadlessRuleSchema).optional()
    },
  }),
  z.strictObject({
    type: z.literal("local").optional(),
    tag: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    format: z.string().optional(),
    path: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("remote").optional(),
    tag: z.union([
      z.string(),
      z.array(z.string()),
    ]).optional(),
    format: z.string().optional(),
    url: z.string().optional(),
    initial_path: z.string().optional(),
    get http_client() {
      return HTTPClientOptionsSchema.optional()
    },
    update_interval: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    /** Deprecated: use http_client instead */
    download_detour: z.string().optional(),
  }),
])

export const SSHCAOptionsSchema = z.strictObject({
  private_key: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  private_key_path: z.string().optional(),
  private_key_passphrase: z.string().optional(),
})

export const SSHFallbackServerOptionsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
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

export const SSHUserSchema = z.strictObject({
  name: z.string().optional(),
  password: z.string().optional(),
  authorized_keys: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
})

export const ServerOptionsSchema = z.strictObject({
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
})

export const ServiceAdminPanelSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const ServiceApiSchema = z.strictObject({
  type: z.literal("api"),
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  secret: z.string().optional(),
  access_control_allow_origin: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),
  access_control_allow_private_network: z.boolean().optional(),
  get dashboard() {
    return APIDashboardOptionsSchema.optional()
  },
  get tls() {
    return InboundTLSOptionsSchema.optional()
  },
})

export const ServiceCcmSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const ServiceDerpSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const ServiceHysteriaRealmSchema = z.strictObject({
  type: z.literal("hysteria-realm"),
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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
  idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  keep_alive_period: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  stream_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  connection_receive_window: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
  max_concurrent_streams: z.int().optional(),
  get users() {
    return z.array(HysteriaRealmUserSchema).optional()
  },
})

export const ServiceManagerApiSchema = z.strictObject({
  type: z.literal("manager-api"),
  tag: z.string().optional(),
  api_type: z.string().optional(),
  protocol_type: z.string().optional(),
})

export const ServiceManagerSchema = z.strictObject({
  type: z.literal("manager"),
  tag: z.string().optional(),
  inbounds: z.array(z.string()).optional(),
  get database() {
    return ManagerServiceDatabaseSchema.optional()
  },
})

export const ServiceNodeManagerApiSchema = z.strictObject({
  type: z.literal("node-manager-api"),
  tag: z.string().optional(),
  api_type: z.string().optional(),
})

export const ServiceNodeSchema = z.strictObject({
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

export const ServiceOcmSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const ServiceOomKillerSchema = z.strictObject({
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
})

export const ServiceProfilerSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
})

export const ServiceResolvedSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
})

export const ServiceSsmApiSchema = z.strictObject({
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
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

export const ServiceUsbipClientSchema = z.strictObject({
  type: z.literal("usbip-client"),
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
  get devices() {
    return z.array(USBIPDeviceMatchSchema).optional()
  },
})

export const ServiceUsbipServerSchema = z.strictObject({
  type: z.literal("usbip-server"),
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
  /** Deprecated: removed */
  proxy_protocol: z.boolean().optional(),
  /** Deprecated: removed */
  proxy_protocol_accept_no_header: z.boolean().optional(),
  sniff: z.boolean().optional(),
  sniff_override_destination: z.boolean().optional(),
  sniff_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  udp_disable_domain_unmapping: z.boolean().optional(),
  provider: z.string().optional(),
})

export const ServiceSchema = z.discriminatedUnion("type", [
  ServiceAdminPanelSchema,
  ServiceApiSchema,
  ServiceCcmSchema,
  ServiceDerpSchema,
  ServiceHysteriaRealmSchema,
  ServiceManagerSchema,
  ServiceManagerApiSchema,
  ServiceNodeSchema,
  ServiceNodeManagerApiSchema,
  ServiceOcmSchema,
  ServiceOomKillerSchema,
  ServiceProfilerSchema,
  ServiceResolvedSchema,
  ServiceSsmApiSchema,
  ServiceUsbipClientSchema,
  ServiceUsbipServerSchema,
])

export const ShadowTLSHandshakeOptionsSchema = z.strictObject({
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
  /** Deprecated: migrated to domain resolver */
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
})

export const ShadowTLSUserSchema = z.strictObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const ShadowsocksDestinationSchema = z.strictObject({
  name: z.string().optional(),
  password: z.string().optional(),
  server: z.string().optional(),
  server_port: z.int().nonnegative().optional(),
})

export const ShadowsocksUserSchema = z.strictObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const SnellUserSchema = z.strictObject({
  name: z.string().optional(),
  userkey: z.string().optional(),
})

export const SudokuHTTPMaskSchema = z.strictObject({
  enabled: z.boolean().optional(),
  mode: z.string().optional(),
  host: z.string().optional(),
  path_root: z.string().optional(),
  multiplex: z.string().optional(),
  get tls() {
    return OutboundTLSOptionsSchema.optional()
  },
})

export const TUICUserSchema = z.strictObject({
  name: z.string().optional(),
  uuid: z.string().optional(),
  password: z.string().optional(),
})

export const TailscaleSSHServerOptionsSchema = z.union([
  z.boolean(),
  z.strictObject({
    enabled: z.boolean().optional(),
    disable_pty: z.boolean().optional(),
    disable_sftp: z.boolean().optional(),
    disable_forwarding: z.boolean().optional(),
  }),
])

export const TrafficLimiterUserSchema = z.strictObject({
  name: z.string().optional(),
  strategy: z.string().optional(),
  mode: z.string().optional(),
  total: z.union([
    z.int().nonnegative(),
    z.string(),
  ]).optional(),
})

export const TrojanUserSchema = z.strictObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const TrustTunnelMultiplexOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  max_connections: z.int().optional(),
  min_streams: z.int().optional(),
  max_streams: z.int().optional(),
})

export const TrustTunnelUserSchema = z.strictObject({
  name: z.string().optional(),
  password: z.string().optional(),
})

export const TunPlatformOptionsSchema = z.strictObject({
  get http_proxy() {
    return HTTPProxyOptionsSchema.optional()
  },
})

export const UDPNATBehaviorSchema = z.int().nonnegative()

export const UDPOverTCPOptionsSchema = z.union([
  z.boolean(),
  z.strictObject({
    enabled: z.boolean().optional(),
    version: z.int().nonnegative().optional(),
  }),
])

export const UDPTimeoutCompatSchema = z.union([
  z.int().nonnegative(),
  z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/),
])

export const USBIPDeviceMatchSchema = z.strictObject({
  bus_id: z.string().optional(),
  vendor_id: z.int().nonnegative().optional(),
  product_id: z.int().nonnegative().optional(),
  serial: z.string().optional(),
})

export const UnifiedDelayOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
})

export const V2RayAPIOptionsSchema = z.strictObject({
  listen: z.string().optional(),
  get stats() {
    return V2RayStatsServiceOptionsSchema.optional()
  },
})

export const V2RayStatsServiceOptionsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  inbounds: z.array(z.string()).optional(),
  outbounds: z.array(z.string()).optional(),
  users: z.array(z.string()).optional(),
})

export const V2RayTransportOptionsSchema = z.discriminatedUnion("type", [
  z.strictObject({
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
  z.strictObject({
    type: z.literal("ws"),
    path: z.string().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
    max_early_data: z.int().nonnegative().optional(),
    early_data_header_name: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("quic"),
  }),
  z.strictObject({
    type: z.literal("grpc"),
    service_name: z.string().optional(),
    idle_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    ping_timeout: z.string().regex(/^-?(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|s|m|h|d|w))+$/).optional(),
    permit_without_stream: z.boolean().optional(),
  }),
  z.strictObject({
    type: z.literal("httpupgrade"),
    host: z.string().optional(),
    path: z.string().optional(),
    headers: z.record(z.string(), z.union([
      z.string(),
      z.array(z.string()),
    ])).optional(),
  }),
  z.strictObject({
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
      z.strictObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    no_grpc_header: z.boolean().optional(),
    no_sse_header: z.boolean().optional(),
    sc_max_each_post_bytes: z.union([
      z.int(),
      z.string(),
      z.strictObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    sc_min_posts_interval_ms: z.union([
      z.int(),
      z.string(),
      z.strictObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    sc_max_buffered_posts: z.int().optional(),
    sc_stream_up_server_secs: z.union([
      z.int(),
      z.string(),
      z.strictObject({
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
      z.strictObject({
        from: z.int(),
        to: z.int(),
      }),
    ]).optional(),
    session_id_table: z.string().optional(),
    session_id_length: z.union([
      z.int(),
      z.string(),
      z.strictObject({
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
  z.strictObject({
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

export const V2RayXHTTPDownloadOptionsSchema = z.strictObject({
  host: z.string().optional(),
  path: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  get domain_strategy() {
    return DomainStrategySchema.optional()
  },
  x_padding_bytes: z.union([
    z.int(),
    z.string(),
    z.strictObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  no_grpc_header: z.boolean().optional(),
  no_sse_header: z.boolean().optional(),
  sc_max_each_post_bytes: z.union([
    z.int(),
    z.string(),
    z.strictObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  sc_min_posts_interval_ms: z.union([
    z.int(),
    z.string(),
    z.strictObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  sc_max_buffered_posts: z.int().optional(),
  sc_stream_up_server_secs: z.union([
    z.int(),
    z.string(),
    z.strictObject({
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
    z.strictObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  session_id_table: z.string().optional(),
  session_id_length: z.union([
    z.int(),
    z.string(),
    z.strictObject({
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

export const V2RayXHTTPXmuxOptionsSchema = z.strictObject({
  max_concurrency: z.union([
    z.int(),
    z.string(),
    z.strictObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  max_connections: z.union([
    z.int(),
    z.string(),
    z.strictObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  c_max_reuse_times: z.union([
    z.int(),
    z.string(),
    z.strictObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  h_max_request_times: z.union([
    z.int(),
    z.string(),
    z.strictObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  h_max_reusable_secs: z.union([
    z.int(),
    z.string(),
    z.strictObject({
      from: z.int(),
      to: z.int(),
    }),
  ]).optional(),
  h_keep_alive_period: z.int().optional(),
})

export const VLESSUserSchema = z.strictObject({
  name: z.string().optional(),
  uuid: z.string().optional(),
  flow: z.string().optional(),
})

export const VMessUserSchema = z.strictObject({
  name: z.string().optional(),
  uuid: z.string().optional(),
  alterId: z.int().optional(),
})

export const VPNUserSchema = z.strictObject({
  address: z.string().optional(),
  key: z.string().optional(),
})

export const WARPAmneziaSchema = z.strictObject({
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
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  rekey_after_time: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  rekey_timeout: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  reject_after_time: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  keepalive_timeout: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  max_handshake_attempts: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
})

export const WildcardSNISchema = z.enum(["", "off", "authed", "all"])

export const WireGuardAmneziaSchema = z.strictObject({
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
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  h2: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  h3: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  h4: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
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
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  rekey_after_time: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  rekey_timeout: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  reject_after_time: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  keepalive_timeout: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
  max_handshake_attempts: z.union([
    z.int().nonnegative(),
    z.string(),
    z.strictObject({
      from: z.int().nonnegative(),
      to: z.int().nonnegative(),
    }),
  ]).optional(),
})

export const WireGuardPeerSchema = z.strictObject({
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
