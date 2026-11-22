import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { ConfigDocumentStore, getConfigOptions } from '@entities/Config';
import { useFailedConfigProbes, type ProxyNode } from '@entities/Proxy';
import { Alert, AlertDescription, AlertTitle } from '@shared/ui';

import { realityRecoveryHints } from '../model/Proxies.recovery';

export function ProxiesRecoveryHints({ nodes }: { nodes: readonly ProxyNode[] }) {
  const { t } = useTranslation('pages/Proxies');
  const applied = useQuery(getConfigOptions()).data;
  const draft = useStore(ConfigDocumentStore, (document) => document.draft);
  const failed = useFailedConfigProbes(applied?.etag ?? null);
  const hints = useMemo(
    () => realityRecoveryHints(applied?.text, draft, failed, nodes),
    [applied?.text, draft, failed, nodes]
  );

  return (
    <div aria-live='polite' className={hints.length === 0 ? 'sr-only' : undefined}>
      {hints.length > 0 && (
        <Alert role='presentation'>
          <Info aria-hidden='true' />
          <AlertTitle>{t('recovery.title')}</AlertTitle>
          <AlertDescription className='min-w-0'>
            <p>{t('recovery.hint')}</p>
            <ul className='flex flex-col gap-1'>
              {hints.map(({ tag, editIndex }) => (
                <li key={tag}>
                  <Link
                    to='/config/$section'
                    params={{ section: 'outbounds' }}
                    search={editIndex === undefined ? {} : { node: editIndex + 1 }}
                    className='wrap-anywhere text-primary underline underline-offset-2'
                  >
                    {t(editIndex === undefined ? 'recovery.openSection' : 'recovery.edit', { tag })}
                  </Link>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
