import { useTranslation } from 'react-i18next';

import { readSectionNodes, useConfig } from '@entities/Config';
import type { OutboundMetadata, OutboundMetadataMap } from '@entities/Proxy';
import { CARD_FLUSH, Card } from '@shared/ui';

import { PROXIES_NS } from '../i18n/Proxies.namespace.generated';
import { ProxiesSection } from './ProxiesSection';
import { ProxiesUnusedMetadataRow } from './ProxiesUnusedMetadataRow';

export function ProxiesUnusedMetadata({
  entries,
  metadata,
  runtimeTags,
  announce,
}: {
  entries: ReadonlyArray<readonly [string, OutboundMetadata]>;
  metadata: OutboundMetadataMap;
  runtimeTags: readonly string[];
  announce: (message: string) => void;
}) {
  const { t } = useTranslation(PROXIES_NS);
  const applied = useConfig();
  const configured =
    applied.data === undefined
      ? []
      : (['outbounds', 'endpoints'] as const).flatMap((section) =>
          readSectionNodes(applied.data.text, section).flatMap((node) =>
            typeof node === 'object' && node !== null && 'tag' in node && typeof node.tag === 'string' ? [node.tag] : []
          )
        );
  const targets = [...new Set([...configured, ...runtimeTags])];

  return (
    <ProxiesSection title={t('metadata.unused')} note={t('metadata.unusedHint')}>
      <Card className={CARD_FLUSH}>
        <ul className='divide-y divide-border'>
          {entries.map(([tag, entry]) => (
            <ProxiesUnusedMetadataRow
              key={tag}
              tag={tag}
              entry={entry}
              targets={targets}
              metadata={metadata}
              announce={announce}
            />
          ))}
        </ul>
      </Card>
    </ProxiesSection>
  );
}
