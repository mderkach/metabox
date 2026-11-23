import { useQuery, useQueryClient } from '@tanstack/react-query';

import { ConfigDocumentStore, selectConfigCurrent, selectConfigStale, useConfigStale } from '@entities/Config';
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
    const state = ConfigDocumentStore.getState();
    const text = selectConfigCurrent(state);
    const currentStatus = client.getQueryState(options.queryKey);
    if (text !== reviewedBase || selectConfigStale(state) || currentStatus?.status !== 'success') return false;

    const coreVersion = currentStatus.data && extendedVersion(currentStatus.data);
    const plan = planCatalogService({ ...selection, text, coreVersion });
    if (!plan.ok || plan.text !== reviewedText) return false;

    if (plan.text !== text) state.replace(plan.text);
    return true;
  }

  return { stale, coreVersion: status.isSuccess ? status.data : undefined, stage };
}
