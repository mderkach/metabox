import { useMemo } from 'react';

import { useConfig } from '@entities/Config';
import { ConnectionState } from '@entities/Connection';
import { useOutboundMetadata, type ProxyRuntime, type ServerLatencies } from '@entities/Proxy';
import { useRuleTitle } from '@entities/Rule';

import {
  toOverviewOutboundConfig,
  toOverviewOutboundConnections,
  toOverviewOutbounds,
} from '../model/Overview.outbounds';
import type { OverviewRuntime } from './Overview.lib';

export function useOverviewOutbounds(
  runtime: Pick<OverviewRuntime, 'system' | 'connectionsAwaiting' | 'connectionsGap'>,
  proxies: ProxyRuntime | undefined,
  latencies: ServerLatencies | undefined
) {
  const config = useConfig();
  const metadata = useOutboundMetadata();
  const { subject } = useRuleTitle();
  const active = ConnectionState.use.active();
  const { connectionsAwaiting, connectionsGap, system } = runtime;
  const text = config.data?.text;
  const parsed = config.data?.config ?? null;
  const outboundConfig = useMemo(
    () => (text === undefined ? null : toOverviewOutboundConfig(text, parsed)),
    [text, parsed]
  );
  const connections = useMemo(
    () => (connectionsAwaiting || connectionsGap !== null ? null : toOverviewOutboundConnections(active)),
    [active, connectionsAwaiting, connectionsGap]
  );
  const traffic = system?.outbounds;
  const rows = useMemo(
    () =>
      outboundConfig === null
        ? []
        : toOverviewOutbounds({
            config: outboundConfig,
            runtime: proxies,
            metadata: metadata.data,
            latencies,
            legacyNorm: metadata.isError,
            traffic,
            connections,
            subject,
          }),
    [outboundConfig, proxies, metadata.data, metadata.isError, latencies, traffic, connections, subject]
  );

  return { rows, config };
}
