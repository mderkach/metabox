import type { ConfigDocument } from '@entities/Config';

const AI_SERVICES = ['gemini', 'openai', 'anthropic', 'cursor', 'stripe', 'hccaptcha', 'google'];
const PROXY_SERVICE_RULES = [
  'notion',
  'spotify',
  'adobe',
  'tilda',
  'apple',
  'soundcloud',
  'atlassian',
  'cloudfront',
  'github',
  'twitch',
];
const PROXY_SERVICES = [...PROXY_SERVICE_RULES, 'ngrok', 'cloudflare-ip'];
const DIRECT_SERVICES = ['youtube', 'riot', 'rostelecom'];

const DNS_PORT = 53;
const GAME_PORT = 25_565;

const SUBSCRIPTIONS = ['vpn-one', 'vpn-two', 'vpn-usa'];

export const ROUTES_V11_CONFIG: ConfigDocument = {
  inbounds: [
    { type: 'mixed', tag: 'mixed-in', listen: '127.0.0.1', listen_port: 2080 },
    { type: 'direct', tag: 'dns-in', listen: '127.0.0.1', listen_port: 5353 },
  ],
  dns: {
    final: 'dns-provider',
    servers: [
      { type: 'local', tag: 'dns-provider' },
      { type: 'https', tag: 'dns-proxy', server: '1.1.1.1', detour: 'proxy' },
      { type: 'https', tag: 'dns-ai', server: '1.1.1.1', detour: 'ai-services' },
      { type: 'https', tag: 'dns-germany', server: '1.1.1.1', detour: 'germany' },
    ],
    rules: [
      { rule_set: ['youtube'], server: 'dns-germany', source_ip_cidr: ['192.0.2.30/32', '192.0.2.31/32'] },
      { rule_set: AI_SERVICES, server: 'dns-ai' },
      { rule_set: PROXY_SERVICES, server: 'dns-proxy' },
    ],
  },
  providers: SUBSCRIPTIONS.map((tag) => ({
    type: 'remote',
    tag,
    url: `https://${tag}.example.invalid/subscriptions/main`,
    update_interval: '5m',
  })),
  outbounds: [
    { type: 'urltest', tag: 'proxy', providers: ['vpn-one', 'vpn-two'] },
    { type: 'selector', tag: 'ai-services', outbounds: ['usa', 'proxy'] },
    { type: 'urltest', tag: 'germany', providers: ['vpn-one'] },
    { type: 'urltest', tag: 'netherlands', providers: ['vpn-two'] },
    { type: 'direct', tag: 'direct' },
    { type: 'urltest', tag: 'usa', providers: ['vpn-usa'] },
  ],
  route: {
    final: 'direct',
    rule_set: [...AI_SERVICES, ...PROXY_SERVICES, ...DIRECT_SERVICES].map((tag) => ({
      type: 'inline',
      tag,
      rules: [{ domain_suffix: [`${tag}.example.invalid`] }],
    })),
    rules: [
      {
        type: 'logical',
        mode: 'and',
        rules: [{ inbound: ['mixed-in'] }, { source_ip_cidr: ['192.0.2.50/32'], invert: true }],
        action: 'reject',
      },
      { action: 'sniff' },
      { inbound: ['dns-in'], action: 'hijack-dns' },
      { port: [DNS_PORT], action: 'hijack-dns' },
      { source_ip_cidr: ['192.0.2.40/32'], source_port: [GAME_PORT], outbound: 'direct' },
      { clash_mode: 'Direct', outbound: 'direct' },
      { clash_mode: 'Global', outbound: 'proxy' },
      ...AI_SERVICES.slice(0, -1).map((ruleSet) => ({ rule_set: [ruleSet], outbound: 'ai-services' })),
      { source_ip_cidr: ['192.0.2.30/32', '192.0.2.31/32'], rule_set: ['youtube'], outbound: 'germany' },
      { rule_set: ['youtube'], outbound: 'direct' },
      { domain_suffix: ['gvt.com', 'gvt1.com', 'gvt2.com'], outbound: 'direct' },
      { rule_set: ['google'], outbound: 'ai-services' },
      { rule_set: ['riot'], outbound: 'direct' },
      { ip_cidr: ['198.51.100.0/24'], outbound: 'proxy' },
      { ip_cidr: ['203.0.113.0/24'], outbound: 'proxy' },
      { domain_suffix: ['runway.com'], outbound: 'ai-services' },
      { domain_suffix: ['allprojects.dev'], outbound: 'direct' },
      { domain_suffix: ['appstorrent.ru', 'usmall.ru'], outbound: 'direct' },
      { rule_set: ['rostelecom'], outbound: 'direct' },
      ...PROXY_SERVICE_RULES.map((ruleSet) => ({ rule_set: [ruleSet], outbound: 'proxy' })),
      { domain_suffix: ['bblmw.com', 'makerworld.com'], outbound: 'proxy' },
      { domain_suffix: ['blitz.gg', 'blitzapp.gg'], outbound: 'proxy' },
      { rule_set: ['ngrok'], outbound: 'proxy' },
      { domain_regex: ['.*tanstack.*'], outbound: 'proxy' },
      { rule_set: ['cloudflare-ip'], outbound: 'proxy' },
      { outbound: 'direct' },
    ],
  },
};
