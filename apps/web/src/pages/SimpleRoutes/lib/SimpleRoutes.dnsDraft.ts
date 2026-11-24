import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { ConfigDocumentStore, selectConfigCurrent, selectConfigStale, useConfigStale } from '@entities/Config';
import { getDaemonStatusOptions } from '@entities/Daemon';

import {
  planDnsAssignment,
  planDnsServer,
  readSimpleDns,
  type DnsReason,
  type DnsServerForm,
} from '../model/SimpleRoutes.dns';

export function useSimpleDnsDraft(text: string) {
  const client = useQueryClient();
  const options = getDaemonStatusOptions();
  const status = useQuery(options);
  const core = status.isSuccess ? status.data.core : undefined;
  const version = core?.type === 'sing-box' && core.variant === 'extended' ? core.version : undefined;
  const model = useMemo(() => readSimpleDns(text, version), [text, version]);
  const stale = useConfigStale();

  function stage(plan: ReturnType<typeof planDnsServer>): DnsReason | 'stale' | null {
    const document = ConfigDocumentStore.getState();
    const latest = client.getQueryState(options.queryKey);
    if (
      selectConfigCurrent(document) !== text ||
      selectConfigStale(document) ||
      latest?.status !== 'success' ||
      latest.data?.core !== core
    )
      return 'stale';
    if (!plan.ok) return plan.reason;
    if (plan.text !== text) document.replace(plan.text);
    return null;
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

  return { model, stale, addServer, assign };
}
