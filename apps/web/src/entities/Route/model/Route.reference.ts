import type { AppliedRuleReference } from './Route.model';

export interface RuleEditorContext {
  appliedEtag: string | null | undefined;
  hasDraft: boolean;
}

export interface RuleEditorSearch {
  rule?: number;
  ruleEtag?: string;
}

/** Index into the applied file, provided that it still has the verified revision. */
export function getAppliedRuleIndex(
  reference: AppliedRuleReference | null | undefined,
  appliedEtag: string | null | undefined
): number | null {
  if (reference == null || appliedEtag == null || appliedEtag.length === 0 || reference.etag !== appliedEtag) {
    return null;
  }

  return reference.index >= 0 && Number.isSafeInteger(reference.index + 1) ? reference.index : null;
}

/** The editor rechecks the revision in the URL before selecting its one-based rule number. */
export function getRuleEditorSearch(
  reference: AppliedRuleReference | null | undefined,
  { appliedEtag, hasDraft }: RuleEditorContext
): RuleEditorSearch {
  if (hasDraft || appliedEtag == null || appliedEtag.length === 0) {
    return {};
  }

  const index = getAppliedRuleIndex(reference, appliedEtag);

  return index === null ? {} : { rule: index + 1, ruleEtag: appliedEtag };
}
