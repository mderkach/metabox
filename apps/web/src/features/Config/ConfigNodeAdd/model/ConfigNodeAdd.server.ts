import {
  CONFIG_SECTION,
  ConfigDocumentStore,
  diffNode,
  findValue,
  insertValue,
  readNodeTags,
  readSectionNodes,
  sectionNodePath,
  selectConfigCurrent,
  selectConfigStale,
} from '@entities/Config';
import { isRecord } from '@shared/lib/isRecord';

import {
  NODE_LINK_ERROR,
  parseShareLink,
  shareLinkNode,
  shareLinkTag,
  type ShareLink,
  type ShareLinkResult,
} from './ConfigNodeAdd.link';
import type { ConnectionLinkModel } from './ConfigNodeAdd.schema';

export const SERVER_GROUP = { None: 'none', New: 'new' } as const;
export const SERVER_ERROR = {
  MultipleLinks: 'serverMultipleLinks',
  TagRequired: 'serverTagRequired',
  TagTaken: 'serverTagTaken',
  GroupRequired: 'serverGroupRequired',
  GroupTaken: 'serverGroupTaken',
  GroupUnavailable: 'serverGroupUnavailable',
  Duplicate: 'serverDuplicate',
  PossibleDuplicate: 'serverPossibleDuplicate',
  Stale: 'serverStale',
  Write: 'serverWrite',
} as const;

export function serverImportAddress(link: ShareLink): string {
  const host = link.server.includes(':') ? `[${link.server}]` : link.server;

  return `${host}:${String(link.fields.server_port)}`;
}

export function parseServerImport(
  input: string
): ShareLinkResult | { link: null; error: typeof SERVER_ERROR.MultipleLinks } {
  if (/\s+[\d+.a-z-]+:\/\//i.test(input.trim())) {
    return { link: null, error: SERVER_ERROR.MultipleLinks };
  }

  const parsed = parseShareLink(input);
  if (parsed.link === null) return parsed;

  const { server } = parsed.link;
  if (/[\s/@?#\\]/.test(server) || !URL.canParse(`http://${serverImportAddress(parsed.link)}`)) {
    return { link: null, error: NODE_LINK_ERROR.Server };
  }

  return parsed;
}

export function serverGroups(text: string) {
  const nodes = readSectionNodes(text, CONFIG_SECTION.Outbounds);
  const tags = readNodeTags(text);

  return nodes.flatMap((node, index) => {
    if (!isRecord(node) || (node.type !== 'selector' && node.type !== 'urltest')) return [];
    const { tag, outbounds = [] } = node;
    if (typeof tag !== 'string' || tag === '' || tags.indexOf(tag) !== tags.lastIndexOf(tag)) return [];
    if (!Array.isArray(outbounds) || !outbounds.every((member) => typeof member === 'string')) return [];

    return { value: `tag:${tag}`, label: tag, path: sectionNodePath(CONFIG_SECTION.Outbounds, index), outbounds };
  });
}

export function serverImportTags(text: string, applied: string): string[] {
  return [...readNodeTags(text), ...(applied === text ? [] : readNodeTags(applied))];
}

export function serverImportMatch(link: ShareLink, text: string, applied: string) {
  const proposed = { type: link.type, ...link.fields };
  const sources = applied === text ? [text] : [text, applied];
  let possible = false;

  for (const source of sources) {
    for (const node of readSectionNodes(source, CONFIG_SECTION.Outbounds)) {
      if (!isRecord(node) || node.type !== link.type || node.server !== link.server) continue;

      const { tag: _tag, ...settings } = node;
      // Comparing the whole values preserves explicit defaults and ignores JSON key order.
      if (diffNode([], [settings], [proposed]).length === 0) return SERVER_ERROR.Duplicate;

      const changes = diffNode([], settings, proposed);
      if (changes.every(({ value }) => value === undefined)) possible = true;
    }
  }

  return possible ? SERVER_ERROR.PossibleDuplicate : null;
}

type ServerFailure = {
  field: 'serverTag' | 'serverGroupName' | 'serverGroup' | 'serverSeparate' | 'root';
  message: (typeof SERVER_ERROR)[keyof typeof SERVER_ERROR];
};

export function stageServerImport(
  link: ShareLink,
  data: ConnectionLinkModel
): { tag: string; failure?: never } | { tag?: never; failure: ServerFailure } {
  const state = ConfigDocumentStore.getState();
  const text = selectConfigCurrent(state);
  if (text === null || state.applied === null || selectConfigStale(state)) {
    return { failure: { field: 'root', message: SERVER_ERROR.Stale } };
  }

  const config = findValue(text, []);
  if (!isRecord(config) || (config.outbounds !== undefined && !Array.isArray(config.outbounds))) {
    return { failure: { field: 'root', message: SERVER_ERROR.Write } };
  }

  const match = serverImportMatch(link, text, state.applied);
  if (match === SERVER_ERROR.Duplicate) {
    return { failure: { field: 'root', message: match } };
  }
  if (match === SERVER_ERROR.PossibleDuplicate && !data.serverSeparate) {
    return { failure: { field: 'serverSeparate', message: match } };
  }

  const tags = serverImportTags(text, state.applied);
  const tag = (data.serverTag ?? shareLinkTag(link, tags)).trim();
  if (tag === '') return { failure: { field: 'serverTag', message: SERVER_ERROR.TagRequired } };
  if (tags.includes(tag)) return { failure: { field: 'serverTag', message: SERVER_ERROR.TagTaken } };

  const index = config.outbounds?.length ?? 0;
  let next = insertValue(text, sectionNodePath(CONFIG_SECTION.Outbounds, index), shareLinkNode(link, tag));
  if (next === null) return { failure: { field: 'root', message: SERVER_ERROR.Write } };

  if (data.serverGroup === SERVER_GROUP.New) {
    const groupTag = data.serverGroupName.trim();
    if (groupTag === '') return { failure: { field: 'serverGroupName', message: SERVER_ERROR.GroupRequired } };
    if (groupTag === tag || tags.includes(groupTag)) {
      return { failure: { field: 'serverGroupName', message: SERVER_ERROR.GroupTaken } };
    }
    next = insertValue(next, sectionNodePath(CONFIG_SECTION.Outbounds, index + 1), {
      type: 'selector',
      tag: groupTag,
      outbounds: [tag],
    });
  } else if (data.serverGroup !== SERVER_GROUP.None) {
    const group = serverGroups(text).find(({ value }) => value === data.serverGroup);
    if (group === undefined) return { failure: { field: 'serverGroup', message: SERVER_ERROR.GroupUnavailable } };
    if (!group.outbounds.includes(tag)) {
      next = insertValue(next, [...group.path, 'outbounds', group.outbounds.length], tag);
    }
  }

  if (next === null) return { failure: { field: 'root', message: SERVER_ERROR.Write } };
  state.replace(next);

  return { tag };
}
