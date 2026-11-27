import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { replaceReviewedDraft, useConfigStale } from '@entities/Config';
import { getDaemonStatusOptions } from '@entities/Daemon';

import { planDnsAssignment, planDnsServer, readDnsSettings } from './ConfigDnsEdit.model';
import type { DnsServerForm } from './ConfigDnsEdit.schema';

export function useConfigDnsEditDraft(text: string) {
  const client = useQueryClient();
  const options = getDaemonStatusOptions();
  const status = useQuery(options);
  const core = status.isSuccess ? status.data.core : undefined;
  const version = core?.type === 'sing-box' && core.variant === 'extended' ? core.version : undefined;
  const model = useMemo(() => readDnsSettings(text, version), [text, version]);
  const stale = useConfigStale();

  function stage<R extends string>(plan: { ok: true; text: string } | { ok: false; reason: R }): R | 'stale' | null {
    const latest = client.getQueryState(options.queryKey);
    if (
      latest?.status !== 'success' ||
      latest.data?.core !== core ||
      !replaceReviewedDraft(text, plan.ok ? plan.text : text)
    )
      return 'stale';
    return plan.ok ? null : plan.reason;
  }

  function addServer(server: DnsServerForm, onStaged: (next: string) => void) {
    const plan = planDnsServer(text, version, server);
    const reason = stage(plan);
    if (plan.ok && reason === null) onStaged(plan.text);
    return reason;
  }

  function assign(outbound: string, resolver: string) {
    return stage(planDnsAssignment(text, version, outbound, resolver));
  }

  return { model, stale, version, stage, addServer, assign };
}
