import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type ProxyNode } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

import { toMemberLabel } from './ProxyGroupLabel';
import { ProxyMetadataName } from './ProxyMetadataName';
import { ProxyNodeDelayValue } from './ProxyNodeDelayValue';
import type { ProxyNodeDiagnosticInfo } from './ProxyNodeDiagnostic';

export function ProxyNodeContent({
  node,
  diagnosticStatus,
  label,
  normText,
}: {
  node: ProxyNode;
  diagnosticStatus?: ProxyNodeDiagnosticInfo['status'];
  label?: string | undefined;
  normText?: string | undefined;
}) {
  const { t } = useTranslation('widgets/ProxyGroups');

  // The spaces between the parts are invisible in a flex row; they keep the visible text word-separated for
  // the name-contains-label check (WCAG 2.5.3), which reads "usgroup609 ms" otherwise.
  return (
    <>
      <span className='flex min-w-0 items-center gap-1.5'>
        {node.selected && <Check className='size-3.5 shrink-0 text-primary' aria-hidden='true' />}
        <span className='min-w-0 grow text-xs'>
          <ProxyMetadataName tag={node.name} label={label} />
        </span>
      </span>{' '}
      <span className='flex items-center justify-between gap-2'>
        <span className='truncate text-xs text-muted-foreground'>{toMemberLabel(t, node.type)}</span>{' '}
        {diagnosticStatus === undefined ? (
          <ProxyNodeDelayValue node={node} />
        ) : (
          <span
            className={cn('text-xs', diagnosticStatus.failed === true ? 'text-signal-bad' : 'text-muted-foreground')}
          >
            {diagnosticStatus.label}
          </span>
        )}
      </span>
      {normText !== undefined && <span className='text-xs text-muted-foreground tabular-nums'>{normText}</span>}
    </>
  );
}
