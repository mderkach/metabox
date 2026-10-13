import { z } from 'zod';

import {
  buildRuleSetURL,
  defaultFormatOf,
  parseDuration,
  RULE_SET_LIST_KIND,
  RULE_SET_TYPE,
  suggestTag,
  type RuleSetCatalog,
  type RuleSetList,
} from '@entities/RuleSet';

import { CUSTOM_PROVIDER, HTTP_SCHEME, RULE_SET_ADD_ERROR } from './RuleSetAdd.constants';

/**
 * What the add form edits.
 *
 * Source, mirror and category are a way to build the address, while the address
 * itself goes into the config: the panel can recognize the provider from it and
 * back (`describeURL`), so there is no need to store the choice next to the
 * address.
 */
export const RuleSetAddSchema = z.object({
  /** Provider from the catalog; `custom` means the address is typed by hand */
  providerId: z.string(),
  /** List kind at the provider: domains or addresses */
  kind: z.string(),
  /** Provider mirror: the main address is not always reachable */
  mirrorId: z.string(),
  /** Category name at the provider */
  category: z.string(),
  /** Address core downloads the set from */
  url: z.string(),
  /** Set name: rules refer to it by it */
  tag: z.string(),
  /** File format; empty means core derives it from the address extension */
  format: z.string(),
  /** How often to redownload; empty means core takes a day */
  updateInterval: z.string(),
  /** Which node to download through; empty means directly */
  detour: z.string(),
});

export type RuleSetAddModel = z.infer<typeof RuleSetAddSchema>;

/**
 * The form opens on the first catalog provider and its domain list, not on an
 * empty blank: "own address" is the fallback path, and offering it first means
 * starting with the hardest. An empty catalog leaves only it.
 */
export function ruleSetAddDefaults(catalog: RuleSetCatalog): RuleSetAddModel {
  const provider = catalog.providers.at(0);
  const list = provider?.lists.find((item) => item.kind === RULE_SET_LIST_KIND.Geosite) ?? provider?.lists.at(0);

  return {
    providerId: provider?.id ?? CUSTOM_PROVIDER,
    kind: list?.kind ?? RULE_SET_LIST_KIND.Geosite,
    mirrorId: list?.mirrors.at(0)?.id ?? '',
    category: '',
    url: '',
    tag: '',
    format: '',
    updateInterval: '',
    detour: '',
  };
}

/** Set address for the selected category; without a list or category, empty. */
export function composeRuleSetURL(list: RuleSetList | null, mirrorId: string, category: string): string {
  if (list === null || category.trim() === '') {
    return '';
  }

  return buildRuleSetURL(list, mirrorId, category.trim());
}

/** Tag the form suggests for a category. */
export function composeRuleSetTag(list: RuleSetList | null, category: string): string {
  return list === null ? '' : suggestTag(list, category.trim());
}

/** The node that will go into `route.rule_set`. */
export interface RuleSetAddPatch {
  type: string;
  tag: string;
  url: string;
  format?: string;
  update_interval?: string;
  download_detour?: string;
}

/**
 * Schema with checks that depend on the document: taken tags and outbound tags
 * come from outside. A tag is the reference by which a rule finds a set, and a
 * second set with the same name would make it ambiguous; the node the set is
 * downloaded through must exist, otherwise a typo reaches the device and aborts
 * the sing-box start.
 *
 * An empty outbound list forbids nothing: it means the config is not parsed,
 * not that it has no nodes.
 *
 * `format` is required only when the address does not let it be derived: a
 * field equal to the derived value is dropped by core on save anyway, and in
 * the diff it would look like a user edit.
 */
export function makeRuleSetAddSchema(takenTags: readonly string[], outbounds: readonly string[] = []) {
  const taken = new Set(takenTags);
  const known = new Set(outbounds);

  return RuleSetAddSchema.superRefine((data, ctx) => {
    const url = data.url.trim();

    if (url === '') {
      ctx.addIssue({ code: 'custom', path: ['url'], message: RULE_SET_ADD_ERROR.UrlRequired });
    } else if (!HTTP_SCHEME.test(url)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: RULE_SET_ADD_ERROR.UrlScheme });
    }

    const tag = data.tag.trim();

    if (tag === '') {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: RULE_SET_ADD_ERROR.TagRequired });
    } else if (taken.has(tag)) {
      ctx.addIssue({ code: 'custom', path: ['tag'], message: RULE_SET_ADD_ERROR.TagTaken });
    }

    if (url !== '' && defaultFormatOf(url) === '' && data.format === '') {
      ctx.addIssue({ code: 'custom', path: ['format'], message: RULE_SET_ADD_ERROR.FormatRequired });
    }

    const interval = data.updateInterval.trim();

    if (interval !== '' && parseDuration(interval) === null) {
      ctx.addIssue({ code: 'custom', path: ['updateInterval'], message: RULE_SET_ADD_ERROR.IntervalFormat });
    }

    const detour = data.detour.trim();

    if (detour !== '' && known.size > 0 && !known.has(detour)) {
      ctx.addIssue({ code: 'custom', path: ['detour'], message: RULE_SET_ADD_ERROR.DetourUnknown });
    }
  });
}

/** Builds a set node from the filled form. */
export function toRuleSetPatch(data: RuleSetAddModel): RuleSetAddPatch {
  const url = data.url.trim();
  const interval = data.updateInterval.trim();
  const detour = data.detour.trim();
  // The format is written only when it cannot be derived from the address:
  // otherwise it is the default value that core drops itself.
  const format = defaultFormatOf(url) === '' ? data.format : '';

  return {
    type: RULE_SET_TYPE.Remote,
    tag: data.tag.trim(),
    url,
    ...(format !== '' && { format }),
    ...(interval !== '' && { update_interval: interval }),
    ...(detour !== '' && { download_detour: detour }),
  };
}
