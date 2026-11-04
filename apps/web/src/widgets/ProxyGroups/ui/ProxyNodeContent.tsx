import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { type ProxyNode } from '@entities/Proxy';

import { toMemberLabel } from './ProxyGroupLabel';
import { ProxyNodeDelayValue } from './ProxyNodeDelayValue';

export function ProxyNodeContent({ node }: { node: ProxyNode }) {
  const { t } = useTranslation('widgets/ProxyGroups');

  // The spaces between the parts are invisible in a flex row; they keep the visible text word-separated for
  // the name-contains-label check (WCAG 2.5.3), which reads "usgroup609 ms" otherwise.
  return (
    <>
      <span className='flex min-w-0 items-center gap-1.5'>
        {node.selected && <Check className='size-3.5 shrink-0 text-primary' aria-hidden='true' />}
        <span className='min-w-0 grow truncate font-mono text-xs'>{node.name}</span>
      </span>{' '}
      <span className='flex items-center justify-between gap-2'>
        <span className='truncate text-xs text-muted-foreground'>{toMemberLabel(t, node.type)}</span>{' '}
        <ProxyNodeDelayValue node={node} />
      </span>
    </>
  );
}
