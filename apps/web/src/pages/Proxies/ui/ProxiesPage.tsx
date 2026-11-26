import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { RuntimeStore, useDaemonInstance, useRuntimeStream } from '@entities/Daemon';
import {
  toOutboundTargets,
  useOutboundMetadata,
  useProviderNodeChanges,
  useProxies,
  useProxyLatency,
  useProxyProviders,
  type ProxyGroup,
} from '@entities/Proxy';
import { ApiError } from '@shared/api';
import { SHARED_NS } from '@shared/i18n';
import { useLiveRegion } from '@shared/lib/useLiveRegion';
import { CARD_FLUSH, Card, LiveRegion, QueryFailure, SURFACE, SkeletonRows } from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';
import { ProxyGroups, type ProxyNodeDiagnostics } from '@widgets/ProxyGroups';

import { PROXIES_NS } from '../i18n/Proxies.namespace.generated';
import { useMinuteClock } from '../lib/Proxies.lib';
import { useProxiesRecovery, type ProxyRecoveryItem } from '../model/Proxies.recoveryState';
import { ProxiesRecoveryDetails } from './ProxiesRecoveryDetails';
import { ProxiesSection } from './ProxiesSection';
import { ProxiesUnusedMetadata } from './ProxiesUnusedMetadata';
import { ProxyProviderRow } from './ProxyProviderRow';
import { ProxyTestAll } from './ProxyTestAll';

const NOT_FOUND = 404;
const EMPTY_GROUPS: ProxyGroup[] = [];

export function ProxiesPage() {
  const { t } = useTranslation(PROXIES_NS);
  const proxies = useProxies();
  const providers = useProxyProviders();
  const metadataQuery = useOutboundMetadata();
  const metadata = metadataQuery.isSuccess ? metadataQuery.data : undefined;
  useRuntimeStream();
  const daemon = useDaemonInstance();
  const pid = RuntimeStore((state) => state.system?.singbox?.pid);
  const latencies = useProxyLatency({ daemon, pid, startedAt: null }, metadata !== undefined);
  const unused = metadata === undefined ? [] : [...metadata].filter(([, entry]) => entry.unused === true);

  const groups = proxies.data?.groups ?? EMPTY_GROUPS;
  const nodes = proxies.data?.standalone ?? [];
  const subscriptions = providers.data ?? [];
  const toNodeChange = useProviderNodeChanges(providers.data);
  const now = useMinuteClock();

  const recovery = useProxiesRecovery(nodes);
  const [checkedGroups, setCheckedGroups] = useState<ReadonlyMap<string, string>>(() => new Map());
  const groupByNode = useMemo(() => {
    const locations = new Map<string, string>();

    for (const group of groups) {
      for (const node of group.nodes) {
        if (!locations.has(node.name) || checkedGroups.get(node.name) === group.name) {
          locations.set(node.name, group.name);
        }
      }
    }

    return locations;
  }, [checkedGroups, groups]);
  const recoveryByTag = new Map(recovery.map((item) => [item.tag, item]));
  const diagnosticForNode: ProxyNodeDiagnostics = (tag, group) => {
    const item = recoveryByTag.get(tag);
    if (item === undefined || groupByNode.get(tag) !== group) return undefined;

    const statusLabel: Partial<Record<ProxyRecoveryItem['state'], string>> = {
      'no-response': t('recovery.noResponse'),
      'probe-error': t('recovery.probeError'),
      ready: t('recovery.verify'),
      restored: t('recovery.verify'),
      checking: t('recovery.checking'),
    };
    const label = statusLabel[item.state];

    return {
      label: t('recovery.open', { tag }),
      content: <ProxiesRecoveryDetails item={item} />,
      ...(label === undefined ? {} : { status: { label, failed: item.state === 'no-response' } }),
    };
  };

  const onGroupTestStart = (group: string, names: readonly string[]) => {
    setCheckedGroups((current) => {
      const next = new Map(current);
      for (const name of names) next.set(name, group);
      return next;
    });
  };
  // The result of an action is visible to the eye — a node mark, a latency number — and
  // for a screen reader one region per screen announces it.
  const { message, announce } = useLiveRegion();

  const onSelected = useCallback(
    (group: string, node: string) => {
      announce(t('announce.selected', { group, node }));
    },
    [announce, t]
  );

  const onTested = useCallback(
    (group: string) => {
      announce(t('announce.tested', { group }));
    },
    [announce, t]
  );

  const onTestedAll = useCallback(() => {
    announce(t('announce.testedAll'));
  }, [announce, t]);

  const onMetadataSaved = useCallback(
    (tag: string, label?: string) => {
      const text =
        label === undefined
          ? t('toast.outboundMetadata.saved', { ns: SHARED_NS })
          : t('toast.outboundMetadata.named', { ns: SHARED_NS, tag, label });

      toast.success(text);
      announce(text);
    },
    [announce, t]
  );

  const onTestedOutbounds = useCallback(() => {
    announce(t('announce.testedOutbounds'));
  }, [announce, t]);

  return (
    <>
      <PageHeader
        title={t('section.proxies', { ns: SHARED_NS })}
        actions={
          <ProxyTestAll
            groups={groups}
            nodes={nodes}
            onTested={onTestedAll}
            onTestStart={() => {
              setCheckedGroups(new Map());
            }}
          />
        }
      />

      <LiveRegion message={message} />

      <div className='flex min-h-0 grow flex-col gap-5 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        {proxies.isPending && <SkeletonRows className={SURFACE} />}

        {proxies.isLoadingError && <QueryFailure messageKey='source.proxies' query={proxies} />}
        {metadataQuery.isLoadingError &&
          !(metadataQuery.error instanceof ApiError && metadataQuery.error.status === NOT_FOUND) && (
            <QueryFailure messageKey='source.outboundMetadata' query={metadataQuery} />
          )}

        {proxies.isSuccess && (
          <ProxiesSection title={t('groups.title')}>
            <ProxyGroups
              groups={groups}
              nodes={nodes}
              onSelected={onSelected}
              onTested={onTested}
              onTestedOutbounds={onTestedOutbounds}
              onGroupTestStart={onGroupTestStart}
              diagnosticForNode={diagnosticForNode}
              metadata={metadata}
              latencies={latencies.data?.servers}
              onMetadataSaved={onMetadataSaved}
              standaloneDiagnostics={nodes.filter(
                (node) => !groupByNode.has(node.name) && recoveryByTag.has(node.name)
              )}
            />
          </ProxiesSection>
        )}

        {/* Subscriptions are a source of nodes, not one more group of them: a separate section
            with its own title, not a card in the shared stack. The card has no
            header of its own: the section already has the title, and repeating it is pointless. */}
        {providers.isPending && <SkeletonRows className={SURFACE} />}

        {providers.isLoadingError && <QueryFailure messageKey='source.providers' query={providers} />}

        {subscriptions.length > 0 && (
          <ProxiesSection title={t('providers.title')}>
            <Card className={CARD_FLUSH}>
              <ul className='divide-y divide-border'>
                {subscriptions.map((provider) => (
                  <ProxyProviderRow key={provider.name} provider={provider} change={toNodeChange(provider)} now={now} />
                ))}
              </ul>
            </Card>
          </ProxiesSection>
        )}
        {metadata !== undefined && unused.length > 0 && (
          <ProxiesUnusedMetadata
            entries={unused}
            metadata={metadata}
            runtimeTags={toOutboundTargets(proxies.data)}
            announce={announce}
          />
        )}
      </div>
    </>
  );
}
