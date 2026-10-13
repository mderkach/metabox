import { z } from 'zod';

import {
  CUSTOM_PROVIDER,
  makeRuleSetAddSchema,
  RuleSetAddSchema,
  type RuleSetAddModel,
} from '@features/RuleSet/RuleSetAdd/@x/RuleSetEdit';

/**
 * What the edit form of an existing set edits: the add form fields, but the
 * address may be empty: the address field is shared with node forms and when
 * cleared holds `null`, not an empty string.
 */
export const RuleSetEditSchema = RuleSetAddSchema.extend({
  /** Address core downloads the set from; `null` means the field is cleared */
  url: z.string().nullable(),
});

export type RuleSetEditModel = z.infer<typeof RuleSetEditSchema>;

/**
 * The checks are the same as when adding: an empty address is cast to a string
 * and fails with the same code. The set's own tag does not count as taken.
 */
export function makeRuleSetEditSchema(takenTags: readonly string[], outbounds: readonly string[], ownTag: string) {
  return RuleSetEditSchema.transform((data) => ({ ...data, url: data.url ?? '' })).pipe(
    makeRuleSetAddSchema(
      takenTags.filter((tag) => tag !== ownTag),
      outbounds
    )
  );
}

function readText(node: Readonly<Record<string, unknown>>, key: string): string {
  const value = node[key];

  return typeof value === 'string' ? value : '';
}

/**
 * The form opens on the node as is. The provider and category are not chosen by
 * the edit form: the address is edited as a whole.
 */
export function ruleSetEditDefaults(node: Readonly<Record<string, unknown>>): RuleSetEditModel {
  return {
    providerId: CUSTOM_PROVIDER,
    kind: '',
    mirrorId: '',
    category: '',
    url: readText(node, 'url'),
    tag: readText(node, 'tag'),
    format: readText(node, 'format'),
    updateInterval: readText(node, 'update_interval'),
    detour: readText(node, 'download_detour'),
  };
}

/**
 * Node after the edit: form fields over the source node. An empty value deletes
 * the key (`diffNode`), other node keys, `initial_path`, `http_client`, are not
 * touched.
 */
export function toRuleSetEditNode(
  node: Readonly<Record<string, unknown>>,
  data: RuleSetAddModel
): Record<string, unknown> {
  return {
    ...node,
    tag: data.tag.trim(),
    url: data.url.trim(),
    format: data.format,
    update_interval: data.updateInterval.trim(),
    download_detour: data.detour.trim(),
  };
}
