import { z } from 'zod';

import {
  CONFIG_SECTION,
  dnsPathOverride,
  dnsResolverReferenceTags,
  eligibleDnsExit,
  effectiveDnsTag,
  eligibleResolvers,
  hasDomainDnsIngress,
  hasVerifiedDnsCore,
  insertValue,
  onlyKeys,
  parseConfig,
  sectionNodePath,
  setValue,
  strings,
  type ConfigDocument,
} from '@entities/Config';
import { isRecord } from '@shared/lib/isRecord';
import { hasDuplicateJsoncKeys } from '@shared/lib/jsonc';

import { simpleAddress } from './SimpleRoutes.conditions';

export const DnsServerSchema = z.object({
  tag: z.string().trim().min(1, 'tag'),
  address: z.ipv4('address'),
  detour: z.string(),
});

export type DnsServerForm = z.infer<typeof DnsServerSchema>;
export type DnsReason =
  | 'core'
  | 'draft'
  | 'firstServer'
  | 'bootstrap'
  | 'tag'
  | 'address'
  | 'detour'
  | 'scope'
  | 'conflict'
  | 'resolver';

export interface SimpleDnsPath {
  tag: string;
  kind: 'direct' | 'proxy' | 'outbound';
  domains: string[];
  eligible: string[];
  current: string | null;
  mixed: boolean;
  reason: DnsReason | null;
}

type DnsPlan = { ok: true; text: string } | { ok: false; reason: DnsReason };

const IP = z.union([z.ipv4(), z.ipv6()]);

function exactRule(node: unknown, field: 'outbound' | 'server') {
  if (
    !isRecord(node) ||
    !onlyKeys(node, 'type', 'action', 'domain', field) ||
    (node.type !== undefined && node.type !== 'default') ||
    (node.action !== undefined && node.action !== 'route')
  )
    return null;
  const target = node[field];
  const domains = strings(node.domain);
  if (
    typeof target !== 'string' ||
    !target ||
    !domains.length ||
    domains.some((name) => simpleAddress(name)?.domain?.[0] !== name)
  )
    return null;
  return { target, domains };
}

function matchDnsDomains(config: ConfigDocument, domains: string[]) {
  const missing = new Set(domains);
  const rows: { index: number; server: string }[] = [];
  const rules = config.dns?.rules ?? [];
  for (const [index, node] of rules.entries()) {
    // A later rule cannot change a name already handled by a terminal match.
    if (!missing.size) break;
    const rule = exactRule(node, 'server');
    if (!rule) return null;
    if (!rule.domains.some((domain) => missing.has(domain))) continue;
    if (!rule.domains.every((domain) => missing.has(domain))) return null;
    rows.push({ index, server: rule.target });
    for (const name of rule.domains) missing.delete(name);
  }
  return { missing: [...missing], rows };
}

function routeDomains(config: ConfigDocument) {
  const byExit = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const node of (config.route?.rules ?? []).slice(1)) {
    const rule = exactRule(node, 'outbound');
    if (!rule || rule.domains.some((domain) => seen.has(domain))) return null;
    for (const domain of rule.domains) seen.add(domain);
    const existing = byExit.get(rule.target) ?? [];
    byExit.set(rule.target, existing.concat(rule.domains));
  }
  return byExit;
}

function implicitBootstrapSafe(config: ConfigDocument): boolean {
  const resolver = config.route?.default_domain_resolver;
  const tag = typeof resolver === 'string' ? resolver : resolver?.server;
  if (
    tag !== undefined &&
    tag !== '' &&
    config.dns?.servers?.some((server, i) => effectiveDnsTag(server, i) === tag) === true
  )
    return true;
  // With two transports the core stops implicitly using its sole resolver for hostname dialers.
  return (
    onlyKeys(config, 'log', 'dns', 'route', 'inbounds', 'outbounds') &&
    onlyKeys(config.route ?? {}, 'rules', 'final') &&
    (config.outbounds ?? []).every(
      (node) => node.tag !== undefined && eligibleDnsExit(config, node.tag) !== undefined
    ) &&
    (config.inbounds ?? []).every(
      (node) =>
        onlyKeys(node, 'type', 'tag', 'listen', 'listen_port', 'network', 'users') &&
        ['direct', 'socks', 'mixed'].includes(node.type)
    ) &&
    (config.dns?.servers ?? []).every(
      (node) =>
        (node.type === 'local' && onlyKeys(node, 'type', 'tag')) ||
        (node.type === 'tcp' &&
          z.ipv4().safeParse(node.server).success &&
          onlyKeys(node, 'type', 'tag', 'server', 'server_port', 'detour'))
    )
  );
}

function dnsContext(text: string, coreVersion: string | undefined) {
  const { config, unknown } = parseConfig(text);
  const servers = config?.dns?.servers ?? [];
  const tags = servers.map(effectiveDnsTag);
  const unique = new Set(tags);
  const final = config?.dns?.final ?? '';
  let problem: DnsReason | null = null;
  if (!hasVerifiedDnsCore(coreVersion)) problem = 'core';
  else if (
    !config ||
    hasDuplicateJsoncKeys(text) ||
    unique.size !== tags.length ||
    (final !== '' && !unique.has(final)) ||
    unknown.some(({ path }) => path === 'dns' || path === 'route' || path === '')
  )
    problem = 'draft';
  const opaque = unknown.flatMap(({ path, fields }) => {
    const node = (path ? path.split('.') : []).reduce<unknown>(
      (value, key) => (value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined),
      config
    );
    return isRecord(node) ? fields.map((field) => JSON.stringify(node[field])) : [text];
  });
  const possibleReference = (tag: string) => opaque.some((value) => value.includes(JSON.stringify(tag)));
  const references = dnsResolverReferenceTags(config);
  if (tags.length > 0 && !final) references.add(tags[0]);
  let addReason: DnsReason | null = problem;
  if (addReason === null) {
    if (!servers.length) addReason = 'firstServer';
    else if (servers.length === 1 && config !== null && !implicitBootstrapSafe(config)) addReason = 'bootstrap';
  }
  return { config, possibleReference, problem, servers, tags, references, addReason };
}

function dnsPaths(config: ConfigDocument, problem: DnsReason | null) {
  const scopes = routeDomains(config);
  const verified = hasDomainDnsIngress(config) && dnsPathOverride(config) === undefined;
  const paths: SimpleDnsPath[] = [];
  for (const node of config.outbounds ?? []) {
    const tag = node.tag;
    if (tag === undefined || tag === '' || !eligibleDnsExit(config, tag)) continue;
    const domains = scopes?.get(tag) ?? [];
    const eligible = eligibleResolvers(config, tag);
    const matches = matchDnsDomains(config, domains);
    let reason = problem;
    if (reason === null) {
      if (!verified || !scopes || !domains.length) reason = 'scope';
      else if (!eligible.length) reason = 'resolver';
      else if (!matches || matches.rows.some(({ server }) => !eligible.includes(server))) reason = 'conflict';
    }
    const servers = new Set(matches?.rows.map((row) => row.server));
    const current =
      reason === null && matches?.missing.length === 0 && servers.size === 1 ? matches.rows[0].server : null;
    let kind: SimpleDnsPath['kind'] = 'outbound';
    if (node.type === 'direct') kind = 'direct';
    else if (node.type === 'selector') kind = 'proxy';
    paths.push({
      tag,
      kind,
      domains,
      eligible,
      current,
      mixed: reason === null && (matches?.rows.length ?? 0) > 0 && current === null,
      reason,
    });
  }
  const order = { direct: 0, proxy: 1, outbound: 2 };
  return paths.sort((a, b) => order[a.kind] - order[b.kind]);
}

export function readSimpleDns(text: string, coreVersion: string | undefined) {
  const { config, possibleReference, problem, servers, tags, references, addReason } = dnsContext(text, coreVersion);
  const inventory = servers.map((server, index) => {
    const tag = tags[index];
    const literal = 'server' in server ? IP.safeParse(server.server) : null;
    const port = 'server_port' in server ? server.server_port : null;
    let address = '';
    if (literal?.success === true) {
      address = literal.data;
      if (port !== null && port !== undefined) address = `${address.includes(':') ? `[${address}]` : address}:${port}`;
    }
    let referenced: boolean | null = references.has(tag);
    if (tags.indexOf(tag) !== tags.lastIndexOf(tag) || (!referenced && possibleReference(tag))) referenced = null;
    const detour = 'detour' in server && typeof server.detour === 'string' ? server.detour : null;
    return { tag, type: server.type, address, detour, referenced };
  });
  const paths = config ? dnsPaths(config, problem) : [];
  return { inventory, paths, addReason, detours: paths.map((path) => path.tag) };
}

export function planDnsServer(text: string, coreVersion: string | undefined, form: DnsServerForm): DnsPlan {
  const { config, possibleReference, servers, tags, references, addReason } = dnsContext(text, coreVersion);
  if (addReason || !config) return { ok: false, reason: addReason ?? 'draft' };
  const result = DnsServerSchema.safeParse(form);
  if (!result.success) return { ok: false, reason: result.error.issues[0].path[0] === 'address' ? 'address' : 'tag' };
  const { tag, address, detour } = result.data;
  if (tags.includes(tag) || references.has(tag)) return { ok: false, reason: 'tag' };
  // A previously unresolved reference inside an unrecognized field could become live on insertion.
  if (possibleReference(tag)) return { ok: false, reason: 'tag' };
  if (detour && !eligibleDnsExit(config, detour)) return { ok: false, reason: 'detour' };
  const candidate = insertValue(text, sectionNodePath(CONFIG_SECTION.Dns, servers.length), {
    type: 'tcp',
    tag,
    server: address,
    ...(detour ? { detour } : {}),
  });
  return candidate !== null && parseConfig(candidate).config
    ? { ok: true, text: candidate }
    : { ok: false, reason: 'draft' };
}

export function planDnsAssignment(
  text: string,
  coreVersion: string | undefined,
  outbound: string,
  resolver: string
): DnsPlan {
  const { config, problem } = dnsContext(text, coreVersion);
  if (problem || !config) return { ok: false, reason: problem ?? 'draft' };
  const path = dnsPaths(config, problem).find((item) => item.tag === outbound);
  if (!path || path.reason) return { ok: false, reason: path?.reason ?? 'scope' };
  if (!path.eligible.includes(resolver)) return { ok: false, reason: 'resolver' };
  const matches = matchDnsDomains(config, path.domains);
  if (!matches) return { ok: false, reason: 'conflict' };
  let candidate = text;
  for (const { index, server } of matches.rows) {
    if (server !== resolver)
      candidate = setValue(candidate, [...sectionNodePath(CONFIG_SECTION.DnsRules, index), 'server'], resolver);
  }
  if (matches.missing.length) {
    const next = insertValue(candidate, sectionNodePath(CONFIG_SECTION.DnsRules, config.dns?.rules?.length ?? 0), {
      domain: matches.missing,
      action: 'route',
      server: resolver,
    });
    if (next === null) return { ok: false, reason: 'draft' };
    candidate = next;
  }
  return parseConfig(candidate).config ? { ok: true, text: candidate } : { ok: false, reason: 'draft' };
}
