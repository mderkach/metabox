import { useQuery, useQueryClient } from '@tanstack/react-query';

import { replaceReviewedDraft, useConfigStale } from '@entities/Config';
import { getDaemonStatusOptions } from '@entities/Daemon';

import { planCatalogService, type CatalogSelection } from './RuleCatalogAdd.plan';

function extendedVersion({ core }: { core: { type: string; variant?: string; version?: string } }) {
  return core.type === 'sing-box' && core.variant === 'extended' ? core.version : undefined;
}

export function useRuleCatalogDraft(reviewedBase: string) {
  const stale = useConfigStale();
  const client = useQueryClient();
  const options = getDaemonStatusOptions();
  const status = useQuery({ ...options, select: extendedVersion });

  function stage(selection: Omit<CatalogSelection, 'text' | 'coreVersion'>, reviewedText: string): boolean {
    const currentStatus = client.getQueryState(options.queryKey);
    if (currentStatus?.status !== 'success') return false;

    const coreVersion = currentStatus.data && extendedVersion(currentStatus.data);
    const plan = planCatalogService({ ...selection, text: reviewedBase, coreVersion });
    return plan.ok && plan.text === reviewedText && replaceReviewedDraft(reviewedBase, plan.text);
  }

  return { stale, coreVersion: status.isSuccess ? status.data : undefined, stage };
}
