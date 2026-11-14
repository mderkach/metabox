import { TriangleAlert } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import { NODE_DROP, type ProviderNodeChange } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';

/**
 * The core has already replaced the node set by the time the panel sees it, so
 * the warning names what is left and where to look, not a way to undo it.
 *
 * The status region stays in the row while empty: text that appears after a
 * manual update is announced, a drop already there on opening is not.
 */
export function ProxyProviderNodeDrop({ change }: { change: ProviderNodeChange }) {
  const { t } = useTranslation('pages/Proxies');
  const empty = change.drop === NODE_DROP.Empty;

  return (
    <p
      role='status'
      className={cn(
        'flex items-start gap-1.5 text-xs text-pretty empty:hidden',
        empty ? 'text-signal-bad' : 'text-signal-warn'
      )}
    >
      {change.drop !== NODE_DROP.None && <TriangleAlert className='mt-px size-3.5 shrink-0' aria-hidden='true' />}
      {change.drop !== NODE_DROP.None && (
        <span>
          {empty || change.before === null ? (
            <Trans t={t} i18nKey='providers.dropEmpty' components={{ code: <code className='font-mono' /> }} />
          ) : (
            t('providers.dropCollapsed', { count: change.before, after: change.after })
          )}
        </span>
      )}
    </p>
  );
}
