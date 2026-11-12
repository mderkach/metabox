import type { JSONPath } from 'jsonc-parser';

import { insertValue, readNodeTags, readSectionNodes, sectionNodePath, setValue } from '@entities/Config';

export const MANUAL_CHOICE = {
  /** The group is not an outbound of the file (or the file is not loaded): there is nothing to wrap. */
  Unavailable: 'unavailable',
  Available: 'available',
  /** The draft already holds the selector; the runtime shows the old group until Apply. */
  Added: 'added',
  /** A selector of the file already starts with this group: it is the automatic half of a manual choice. */
  Wrapped: 'wrapped',
} as const;

export type ManualChoiceStatus = (typeof MANUAL_CHOICE)[keyof typeof MANUAL_CHOICE];

/** Draft edits that put a selector in front of an automatic group. */
export interface ManualChoicePlan {
  /** Where the selector goes: right after the group, so the diff reads as one change. */
  insertAt: JSONPath;
  selector: Record<string, unknown>;
  /** The group's `tag` field and its new value. */
  renameAt: JSONPath;
  renameTo: string;
}

const OUTBOUNDS = 'outbounds';
const SELECTOR_TYPE = 'selector';
const AUTO_SUFFIX = '-auto';
/** The first taken name gets `-2`: the free one counts as the first. */
const FIRST_COPY_NUMBER = 2;

/** Fields that say which nodes a group holds; a selector reads them the same way. */
const MEMBER_FIELDS = ['providers', 'use_all_providers', 'include', 'exclude'] as const;

function isNode(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findGroup(text: string, tag: string): { index: number; node: Record<string, unknown> } | null {
  const nodes = readSectionNodes(text, OUTBOUNDS);
  const index = nodes.findIndex((node) => isNode(node) && node.tag === tag);
  const node = nodes[index];

  return index !== -1 && isNode(node) ? { index, node } : null;
}

function freeTag(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;

  let number = FIRST_COPY_NUMBER;

  while (taken.has(`${base}-${number}`)) number += 1;

  return `${base}-${number}`;
}

export function toManualChoiceStatus(text: string | null, group: string): ManualChoiceStatus {
  const found = text === null ? null : findGroup(text, group);

  if (text === null || found === null) return MANUAL_CHOICE.Unavailable;

  if (found.node.type === SELECTOR_TYPE) return MANUAL_CHOICE.Added;

  return isWrapped(text, group) ? MANUAL_CHOICE.Wrapped : MANUAL_CHOICE.Available;
}

function isWrapped(text: string, group: string): boolean {
  return readSectionNodes(text, OUTBOUNDS).some((node) => {
    if (!isNode(node) || node.type !== SELECTOR_TYPE) return false;

    const outbounds: unknown = node.outbounds;

    return Array.isArray(outbounds) && outbounds[0] === group;
  });
}

/**
 * The group keeps working under a new tag, and a selector takes its old tag. Every rule,
 * group and setting that named the group now leads to the selector, whose first
 * option, and so default, is the renamed group: until the user picks a node, traffic
 * goes the same way.
 */
export function planManualChoice(text: string, group: string): ManualChoicePlan | null {
  const found = findGroup(text, group);

  if (found === null || found.node.type === SELECTOR_TYPE || isWrapped(text, group)) return null;

  const renameTo = freeTag(`${group}${AUTO_SUFFIX}`, new Set(readNodeTags(text)));
  const outbounds: unknown = found.node.outbounds;
  const members = Array.isArray(outbounds) ? outbounds.filter((member) => typeof member === 'string') : [];
  const selector: Record<string, unknown> = { type: SELECTOR_TYPE, tag: group, outbounds: [renameTo, ...members] };

  for (const field of MEMBER_FIELDS) {
    if (found.node[field] !== undefined) selector[field] = found.node[field];
  }

  return {
    insertAt: sectionNodePath(OUTBOUNDS, found.index + 1),
    selector,
    renameAt: [...sectionNodePath(OUTBOUNDS, found.index), 'tag'],
    renameTo,
  };
}

/**
 * Both edits on the text at once: the store applies them one by one, and a refused
 * rename after an accepted insert would leave two outbounds with one tag.
 */
export function applyManualChoice(text: string, plan: ManualChoicePlan): string | null {
  const inserted = insertValue(text, plan.insertAt, plan.selector);

  return inserted === null ? null : setValue(inserted, plan.renameAt, plan.renameTo);
}
