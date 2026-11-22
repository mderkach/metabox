import type { JSONPath } from 'jsonc-parser';

import { isRecord } from '@shared/lib/isRecord';

import { CONFIG_SECTION, findValue, readRuleSetTags, readSectionNodes, type ConfigSection } from './Config.model';

const NODE_PATH_LENGTH = 2;

function effectiveTag(tag: unknown, index: number): string {
  return typeof tag === 'string' && tag !== '' ? tag : String(index);
}

function readEffectiveTags(
  text: string,
  section: typeof CONFIG_SECTION.Providers | typeof CONFIG_SECTION.Endpoints,
  exceptIndex?: number
): string[] {
  return readSectionNodes(text, section).flatMap((node, index) =>
    index !== exceptIndex && isRecord(node) ? [effectiveTag(node.tag, index)] : []
  );
}

/** Providers, rule sets and endpoints can write to the same cache bucket keyed by tag. */
export function readSubscriptionTagReservations(text: string, section: ConfigSection, exceptIndex?: number): string[] {
  if (section === CONFIG_SECTION.Providers) {
    return [
      ...readEffectiveTags(text, CONFIG_SECTION.Providers, exceptIndex),
      ...readEffectiveTags(text, CONFIG_SECTION.Endpoints),
      ...readRuleSetTags(text),
    ];
  }

  return section === CONFIG_SECTION.Endpoints || section === CONFIG_SECTION.RuleSet
    ? readEffectiveTags(text, CONFIG_SECTION.Providers)
    : [];
}

/** An unchanged tag stays editable so the configuration can be repaired field by field. */
export function hasSubscriptionTagConflict(text: string, path: JSONPath, nextTag: unknown): boolean {
  const [section, index] = path;

  if (
    path.length !== NODE_PATH_LENGTH ||
    typeof index !== 'number' ||
    (section !== CONFIG_SECTION.Providers && section !== CONFIG_SECTION.Endpoints)
  ) {
    return false;
  }

  const before = effectiveTag(findValue(text, [...path, 'tag']), index);
  const after = effectiveTag(nextTag, index);

  return after !== before && readSubscriptionTagReservations(text, section, index).includes(after);
}
