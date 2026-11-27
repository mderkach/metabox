import { z } from 'zod';

import { effectiveDnsTag, hasVerifiedDnsCore, strings } from '@entities/Config';
import { isLiteralRuleIp, parseRuleAddress } from '@entities/Rule';
import { isRecord } from '@shared/lib/isRecord';
import { hasDuplicateJsoncKeys, parseJsonc } from '@shared/lib/jsonc';

import { editDnsProperty, editHostAddresses } from './ConfigDnsEdit.property';

export const DNS_STRATEGIES = ['as_is', 'prefer_ipv4', 'prefer_ipv6', 'ipv4_only', 'ipv6_only'] as const;
type Strategy = (typeof DNS_STRATEGIES)[number];
type Reason =
  | 'core'
  | 'draft'
  | 'duplicate'
  | 'domain'
  | 'addresses'
  | 'ambiguous'
  | 'malformedHosts'
  | 'unknownStrategy';
type Plan = { ok: true; text: string } | { ok: false; reason: Reason };
export interface DnsOptionsProps {
  text: string;
  version: string | undefined;
  stale: boolean;
  stage: (plan: Plan) => Reason | 'stale' | null;
}

function addressesOf(input: string) {
  return input.trim().split(/[\s,]+/);
}

function domainKey(domain: string) {
  return domain.toLowerCase().replace(/\.$/, '');
}

export const HostEntrySchema = z.object({
  domain: z
    .string()
    .trim()
    .refine((value) => parseRuleAddress(value)?.domain !== undefined, 'domain'),
  addresses: z.string().refine((value) => addressesOf(value).every(isLiteralRuleIp), 'addresses'),
});
export type HostEntryForm = z.infer<typeof HostEntrySchema>;

export function readDnsOptions(text: string, version: string | undefined) {
  const { value, failure } = parseJsonc(text);
  const dns = isRecord(value) ? value.dns : undefined;
  const source = isRecord(dns) ? dns : {};
  const servers: unknown[] = Array.isArray(source.servers) ? source.servers : [];
  const raw = source.strategy;
  let strategy = 'as_is';
  if (raw !== undefined && raw !== '') strategy = typeof raw === 'string' ? raw : JSON.stringify(raw);
  let reason: 'core' | 'draft' | null = null;
  if (!hasVerifiedDnsCore(version)) reason = 'core';
  else if (failure || !isRecord(value) || (dns !== undefined && !isRecord(dns)) || hasDuplicateJsoncKeys(text))
    reason = 'draft';

  const tags = servers.map((node, index) =>
    effectiveDnsTag({ tag: isRecord(node) && typeof node.tag === 'string' ? node.tag : undefined }, index)
  );
  const hosts = servers.flatMap((node, index) => {
    if (!isRecord(node) || node.type !== 'hosts') return [];
    const tag = tags[index];
    const entries = Object.entries(isRecord(node.predefined) ? node.predefined : {}).map(([domain, record]) => ({
      domain,
      addresses: strings(record),
      list: Array.isArray(record),
      malformed: typeof record !== 'string' && !(Array.isArray(record) && record.every((v) => typeof v === 'string')),
    }));
    // The core canonicalizes all keys before assigning them to one lookup map.
    const keys = new Set(entries.map(({ domain }) => domainKey(domain)));
    const ambiguous = keys.size !== entries.length || tags.indexOf(tag) !== tags.lastIndexOf(tag);
    const malformed =
      (node.predefined !== undefined && !isRecord(node.predefined)) || entries.some((entry) => entry.malformed);
    let problem: 'ambiguous' | 'malformedHosts' | null = null;
    if (ambiguous) problem = 'ambiguous';
    else if (malformed) problem = 'malformedHosts';
    return [{ index, tag, entries, reason: problem }];
  });
  return {
    reason,
    strategy,
    knownStrategy: typeof raw === 'string' || raw === undefined ? DNS_STRATEGIES.some((v) => v === strategy) : false,
    hosts,
  };
}

export type HostsTransport = ReturnType<typeof readDnsOptions>['hosts'][number];

export function planDnsStrategy(text: string, version: string | undefined, strategy: Strategy): Plan {
  const model = readDnsOptions(text, version);
  if (model.reason !== null) return { ok: false, reason: model.reason };
  if (!model.knownStrategy) return { ok: false, reason: 'unknownStrategy' };
  if (!DNS_STRATEGIES.includes(strategy)) return { ok: false, reason: 'draft' };
  if (model.strategy === strategy) return { ok: true, text };
  const candidate = editDnsProperty(text, ['dns', 'strategy'], 'strategy', strategy);
  return candidate === null ? { ok: false, reason: 'draft' } : { ok: true, text: candidate };
}

export function planHostEntry(
  text: string,
  version: string | undefined,
  index: number,
  original: string | null,
  form: HostEntryForm | null
): Plan {
  const model = readDnsOptions(text, version);
  if (model.reason !== null) return { ok: false, reason: model.reason };
  const hosts = model.hosts.find((item) => item.index === index);
  if (!hosts) return { ok: false, reason: 'draft' };
  if (hosts.reason) return { ok: false, reason: hosts.reason };
  const before = hosts.entries.find((entry) => entry.domain === original);
  if (original !== null && !before) return { ok: false, reason: 'draft' };
  const path = ['dns', 'servers', index, 'predefined'];
  if (!form) {
    const candidate = original === null ? null : editDnsProperty(text, [...path, original], null);
    return candidate !== null ? { ok: true, text: candidate } : { ok: false, reason: 'draft' };
  }
  const parsed = HostEntrySchema.safeParse(form);
  if (!parsed.success)
    return { ok: false, reason: parsed.error.issues[0].path[0] === 'domain' ? 'domain' : 'addresses' };
  const { domain, addresses } = parsed.data;
  if (hosts.entries.some((entry) => entry.domain !== original && domainKey(entry.domain) === domainKey(domain)))
    return { ok: false, reason: 'duplicate' };
  const values = addressesOf(addresses);
  const sameAddresses = before?.addresses.length === values.length && before.addresses.every((v, i) => v === values[i]);
  const record = values.length === 1 && before?.list !== true ? values[0] : values;
  const memberPath = [...path, original ?? domain];
  let candidate = text;
  if (before?.list === true && !sameAddresses) {
    const updated = editHostAddresses(text, memberPath, before.addresses, values);
    if (updated === null) return { ok: false, reason: 'draft' };
    candidate = updated;
  }
  const newValue = sameAddresses || before?.list === true ? undefined : record;
  const result = editDnsProperty(candidate, memberPath, domain, newValue);
  return result === null ? { ok: false, reason: 'draft' } : { ok: true, text: result };
}
