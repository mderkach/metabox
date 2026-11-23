import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Badge, Card, CardContent } from '@shared/ui';

import type { toSimpleRoutes } from '../model/SimpleRoutes.model';
import { SimpleRoutesAddTrigger } from './SimpleRoutesAddTrigger';
import { SimpleRoutesSection } from './SimpleRoutesSection';

type OutboundSummary = Pick<ReturnType<typeof toSimpleRoutes>, 'outbounds' | 'providers' | 'stagedTags'>;

export function SimpleRoutesOutbounds({
  outbounds,
  providers,
  stagedTags,
  addTriggerRef,
}: OutboundSummary & { addTriggerRef: Ref<HTMLButtonElement> }) {
  const { t } = useTranslation('pages/SimpleRoutes');

  function labelForType(type: string): string {
    if (type === 'selector') return t('outbounds.manual');
    if (type === 'urltest') return t('outbounds.latency');
    if (type === 'direct') return t('outbounds.direct');

    return type.toUpperCase();
  }

  return (
    <SimpleRoutesSection title={t('sections.outbounds')} actions={<SimpleRoutesAddTrigger ref={addTriggerRef} />}>
      {outbounds.length === 0 ? (
        <Card size='sm'>
          <CardContent className='text-sm text-muted-foreground'>{t('outbounds.empty')}</CardContent>
        </Card>
      ) : (
        <ul className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {outbounds.map(({ tag, type }, index) => (
            <li key={index} className='min-w-0'>
              <Card size='sm' className='h-full'>
                <CardContent className='flex flex-col gap-1 wrap-anywhere'>
                  <div className='flex flex-wrap items-baseline gap-2'>
                    <span
                      className={cn('min-w-0 text-sm font-semibold', tag !== undefined && tag !== '' && 'font-mono')}
                    >
                      {tag !== undefined && tag !== '' ? tag : t('outbounds.untagged')}
                    </span>
                    {tag !== undefined && stagedTags.has(tag) && (
                      <Badge variant='secondary'>{t('outbounds.staged')}</Badge>
                    )}
                  </div>
                  <span className='text-sm text-muted-foreground'>{labelForType(type)}</span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {providers > 0 && (
        <p className='text-sm text-muted-foreground'>{t('outbounds.providers', { count: providers })}</p>
      )}
      {(outbounds.length > 0 || providers > 0) && (
        <Link
          to='/proxies'
          className='inline-flex w-fit items-center gap-1 text-sm text-primary underline underline-offset-4'
        >
          {t('outbounds.inventory')}
          <ArrowRight aria-hidden='true' className='size-4 shrink-0' />
        </Link>
      )}
    </SimpleRoutesSection>
  );
}
