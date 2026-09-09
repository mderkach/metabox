import type { Config } from "@shared/api/generated"

/** Порт DNS, который перехватывает правило. */
const DNS_PORT = 53
/** Порт игрового сервера, выведенного из туннеля отдельным правилом. */
const GAME_SERVER_PORT = 25565

/**
 * Временная замена ручки конфига: демон её пока не отдаёт — у него есть только
 * `/api/status` и цикл `/api/apply` (`httpapi.go`). Снимается вместе с
 * `VITE_METABOX_MOCK_CONFIG`, когда появится `GET /api/config`.
 *
 * Структура снята с рабочего роутера: 32 правила маршрутизации, три инбаунда,
 * пустые `urltest`, наполняемые из провайдеров, и `providers` — секция, которой
 * в upstream sing-box нет. Секретов здесь нет: подписки, пароли и UUID из
 * фикстуры убраны, а правила их и не содержат.
 */
export const CONFIG_FIXTURE: Config = {
  log: { level: "info", timestamp: true },
  dns: {
    servers: [
      { tag: "dns-direct", type: "https", server: "77.88.8.8" },
      { tag: "dns-proxy", type: "tls", server: "1.1.1.1", detour: "proxy" },
      { tag: "dns-hosts", type: "hosts" },
    ],
    rules: [{ server: "dns-direct", rule_set: ["ru-inside"] }],
    strategy: "ipv4_only",
    independent_cache: true,
  },
  inbounds: [
    { type: "direct", tag: "dns-in", listen: "127.0.0.1", listen_port: 5333 },
    {
      type: "redirect",
      tag: "redirect-in",
      listen: "0.0.0.0",
      listen_port: 5331,
    },
    { type: "tproxy", tag: "tproxy-in", listen: "0.0.0.0", listen_port: 5332 },
  ],
  outbounds: [
    { type: "urltest", tag: "proxy", outbounds: [] },
    { type: "urltest", tag: "alt", outbounds: [] },
    {
      type: "selector",
      tag: "alt-fallback",
      outbounds: ["alt", "proxy"],
    },
    { type: "direct", tag: "direct" },
  ],
  providers: [
    {
      type: "remote",
      tag: "sub-a",
      url: "https://example.invalid/sub/REDACTED",
      download_detour: "direct",
    },
    {
      type: "remote",
      tag: "sub-b",
      url: "https://example.invalid/sub/REDACTED",
      download_detour: "direct",
    },
    {
      type: "remote",
      tag: "sub-c",
      url: "https://example.invalid/sub/REDACTED",
      download_detour: "direct",
    },
  ],
  route: {
    rules: [
      { action: "sniff" },
      { inbound: ["dns-in"], action: "hijack-dns" },
      { port: [DNS_PORT], action: "hijack-dns" },
      {
        source_ip_cidr: ["192.168.1.100/32"],
        source_port: [GAME_SERVER_PORT],
        outbound: "direct",
      },
      { clash_mode: "Direct", outbound: "direct" },
      { clash_mode: "Global", outbound: "proxy" },
      { rule_set: ["google-ip"], outbound: "alt-fallback" },
      { rule_set: ["google-site"], outbound: "alt-fallback" },
      { rule_set: ["gemini"], outbound: "alt-fallback" },
      { rule_set: ["openai"], outbound: "alt-fallback" },
      { rule_set: ["anthropic"], outbound: "alt-fallback" },
      { rule_set: ["cursor"], outbound: "alt-fallback" },
      { rule_set: ["stripe"], outbound: "alt-fallback" },
      { rule_set: ["hccaptcha"], outbound: "alt-fallback" },
      {
        domain_suffix: ["media-a.example", "media-b.example", "media-c.example"],
        outbound: "alt-fallback",
      },
      { domain_suffix: ["personal.example"], outbound: "direct" },
      {
        domain_suffix: ["shop-a.example", "shop-b.example", "media-d.example"],
        outbound: "direct",
      },
      { rule_set: ["notion"], outbound: "proxy" },
      { rule_set: ["spotify"], outbound: "proxy" },
      { rule_set: ["adobe"], outbound: "proxy" },
      { rule_set: ["tilda"], outbound: "proxy" },
      { rule_set: ["apple"], outbound: "proxy" },
      { rule_set: ["soundcloud"], outbound: "proxy" },
      { rule_set: ["atlassian"], outbound: "proxy" },
      { rule_set: ["cloudfront"], outbound: "proxy" },
      { rule_set: ["github"], outbound: "proxy" },
      { rule_set: ["twitch"], outbound: "proxy" },
      {
        domain_suffix: ["video-a.example", "video-e.example", "video-f.example"],
        outbound: "proxy",
      },
      {
        domain_suffix: ["maker-a.example", "maker-b.example"],
        outbound: "proxy",
      },
      {
        domain_suffix: ["games-a.example", "games-b.example", "games-d.example"],
        outbound: "proxy",
      },
      {
        domain_regex: [".*docs-a.*", ".*blog-a.*", "\\.dev$"],
        outbound: "proxy",
      },
      { outbound: "direct" },
    ],
    rule_set: [
      {
        type: "remote",
        tag: "google-ip",
        format: "binary",
        url: "https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/sing-box/rule-set-ip/google.srs",
        download_detour: "direct",
      },
      {
        type: "remote",
        tag: "openai",
        format: "binary",
        url: "https://raw.githubusercontent.com/runetfreedom/russia-v2ray-rules-dat/release/sing-box/rule-set-geosite/geosite-openai.srs",
        download_detour: "direct",
      },
    ],
    default_domain_resolver: "dns-direct",
    default_mark: 100,
  },
  experimental: {
    clash_api: { external_controller: "0.0.0.0:9090" },
    cache_file: { enabled: true },
  },
}
