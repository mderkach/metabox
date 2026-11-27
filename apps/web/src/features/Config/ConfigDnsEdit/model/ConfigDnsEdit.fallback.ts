import { CONFIG_SECTION, insertValue, moveValue, onlyKeys, removeValue, sectionNodePath } from '@entities/Config';

import { dnsContext } from './ConfigDnsEdit.model';

export interface DnsFallbackChain {
  index: number;
  tag: string;
  members: string[];
  choices: string[];
  strategy: string;
  reason: 'core' | 'draft' | 'strategy' | 'members' | null;
}

export type DnsFallbackEdit = { add: string } | { remove: string } | { move: string; to: number };

export type DnsFallbackPlan = { ok: true; text: string } | { ok: false; reason: 'draft' };

export function readDnsFallbacks(text: string, version: string | undefined) {
  const { servers, tags, problem } = dnsContext(text, version);
  const chains: DnsFallbackChain[] = [];
  for (const [index, server] of servers.entries()) {
    if (server.type !== 'fallback') continue;
    const members = server.servers ?? [];
    const strategy = server.strategy ?? '';
    // The core looks up each member while constructing this transport, before later entries exist.
    const earlier = tags.slice(0, index);
    let reason: DnsFallbackChain['reason'] = problem;
    if (!reason && strategy !== '' && strategy !== 'sequential') reason = 'strategy';
    if (!reason && !onlyKeys(server, 'type', 'tag', 'strategy', 'servers', 'timeout')) reason = 'draft';
    if (
      !reason &&
      (!members.length || new Set(members).size !== members.length || members.some((tag) => !earlier.includes(tag)))
    )
      reason = 'members';
    chains.push({
      index,
      tag: tags[index],
      members,
      choices: earlier.filter((tag) => !members.includes(tag)),
      strategy,
      reason,
    });
  }
  return { chains, problem };
}

export function planDnsFallback(
  text: string,
  version: string | undefined,
  index: number,
  edit: DnsFallbackEdit
): DnsFallbackPlan {
  const chain = readDnsFallbacks(text, version).chains.find((item) => item.index === index);
  if (!chain || chain.reason) return { ok: false, reason: 'draft' };
  const path = [...sectionNodePath(CONFIG_SECTION.Dns, index), 'servers'];
  let candidate: string | null = null;
  if ('add' in edit) {
    if (chain.choices.includes(edit.add)) candidate = insertValue(text, [...path, chain.members.length], edit.add);
  } else if ('remove' in edit) {
    const from = chain.members.indexOf(edit.remove);
    if (from > 0) candidate = removeValue(text, [...path, from]);
  } else {
    const from = chain.members.indexOf(edit.move);
    if (from > 0 && Number.isInteger(edit.to) && edit.to > 0 && edit.to < chain.members.length && edit.to !== from)
      candidate = moveValue(text, path, from, edit.to);
  }
  return candidate === null ? { ok: false, reason: 'draft' } : { ok: true, text: candidate };
}
