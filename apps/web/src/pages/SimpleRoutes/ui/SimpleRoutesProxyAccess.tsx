import { useId, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import type { ConfigDocument } from '@entities/Config';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import { readProxyAccess } from '../model/SimpleRoutes.proxyAccess';

export function SimpleRoutesProxyAccess({ config }: { config: ConfigDocument | null }) {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);
  const id = useId();
  const access = useMemo(() => (config === null ? null : readProxyAccess(config)), [config]);

  return (
    <section
      aria-labelledby={id}
      className='grid min-w-0 content-start gap-1 border-t pt-3 text-sm @2xl:border-s @2xl:border-t-0 @2xl:ps-4 @2xl:pt-0'
    >
      <h3 id={id} className='font-semibold'>
        {t('proxyAccess.title')}
      </h3>
      <p className='max-w-prose text-pretty text-muted-foreground'>{t('proxyAccess.description')}</p>
      <details data-slot='route-help' className='min-w-0'>
        <summary className='w-fit cursor-pointer rounded-lg py-2 font-medium focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11'>
          {t('proxyAccess.disclosure')}
        </summary>
        <div className='grid max-w-prose gap-2 pb-2 text-pretty text-muted-foreground'>
          {access === null && <p>{t('proxyAccess.unknown')}</p>}
          {access?.listeners.length === 0 && <p>{t('proxyAccess.empty')}</p>}
          {access !== null && access.listeners.length > 0 && (
            <>
              <p>{t('proxyAccess.saved')}</p>
              <ul className='grid gap-2'>
                {access.listeners.map((listener) => (
                  <li key={listener.index} className='grid gap-1 border-s ps-3'>
                    <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
                      <span className='font-medium text-foreground'>
                        {t(`proxyAccess.protocol.${listener.protocol}`)}
                      </span>
                      {listener.binding === null ? (
                        <span>{t('proxyAccess.noAddress')}</span>
                      ) : (
                        <code className='wrap-anywhere text-foreground'>{listener.binding}</code>
                      )}
                    </div>
                    {listener.wildcard && <p>{t('proxyAccess.wildcard')}</p>}
                    {listener.loopback && <p>{t('proxyAccess.loopback')}</p>}
                    {listener.bindInterface !== undefined && listener.bindInterface !== '' && (
                      <p>
                        <Trans
                          ns={SIMPLE_ROUTES_NS}
                          i18nKey='proxyAccess.interface'
                          values={{ name: listener.bindInterface }}
                          components={{ code: <code className='wrap-anywhere text-foreground' /> }}
                        />
                      </p>
                    )}
                    {listener.hasAccounts && <p>{t('proxyAccess.accounts')}</p>}
                  </li>
                ))}
              </ul>
              <p>{t('proxyAccess.reachability')}</p>
            </>
          )}
          {access !== null && access.otherTypes.length > 0 && (
            <p>
              <Trans
                ns={SIMPLE_ROUTES_NS}
                i18nKey='proxyAccess.other'
                values={{ types: access.otherTypes.join(', ') }}
                components={{ code: <code className='wrap-anywhere text-foreground' /> }}
              />
            </p>
          )}
        </div>
      </details>
    </section>
  );
}
