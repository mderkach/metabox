import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowRight, Check } from 'lucide-react';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';
import { Badge, Button, Card, CardContent } from '@shared/ui';

import { SIMPLE_ROUTES_NS } from '../i18n/SimpleRoutes.namespace.generated';
import type { SimpleRuleNavigation, SimpleRoutesLinks } from '../model/SimpleRoutes.links';
import { SIMPLE_SERVICE_SUGGESTIONS_ID, type toSimpleRoutes } from '../model/SimpleRoutes.model';
import { SimpleRoutesAddTrigger } from './SimpleRoutesAddTrigger';
import { SimpleRoutesSection } from './SimpleRoutesSection';

type OutboundSummary = Pick<
  ReturnType<typeof toSimpleRoutes>,
  'outboundEntries' | 'providers' | 'stagedTags' | 'hasStagedSubscriptions' | 'suggestServices'
>;

export function SimpleRoutesOutbounds({
  outboundEntries,
  providers,
  stagedTags,
  hasStagedSubscriptions,
  suggestServices,
  outbound,
  addTriggerRef,
  proxiesTo,
  onOutboundChange,
}: OutboundSummary &
  Pick<SimpleRuleNavigation, 'onOutboundChange'> & {
    proxiesTo: SimpleRoutesLinks['proxies'];
    outbound?: string;
    addTriggerRef: Ref<HTMLButtonElement>;
  }) {
  const { t } = useTranslation(SIMPLE_ROUTES_NS);

  function labelForType(type: string): string {
    if (type === 'selector') return t('outbounds.manual');
    if (type === 'urltest') return t('outbounds.latency');
    if (type === 'direct') return t('outbounds.direct');

    return type.toUpperCase();
  }

  return (
    <SimpleRoutesSection section='outbounds' actions={<SimpleRoutesAddTrigger ref={addTriggerRef} />}>
      {outboundEntries.length === 0 ? (
        <Card size='sm'>
          <CardContent className='text-sm text-muted-foreground'>{t('outbounds.empty')}</CardContent>
        </Card>
      ) : (
        <ul className='grid gap-2 sm:flex sm:flex-wrap'>
          {outboundEntries.map(({ node: { tag, type }, key }) => {
            const hasTag = tag !== undefined && tag !== '';
            const selected = hasTag && outbound === tag;

            return (
              <li key={key} className='max-w-full min-w-0'>
                <Button
                  type='button'
                  variant='outline'
                  disabled={!hasTag}
                  aria-pressed={hasTag ? selected : undefined}
                  className='h-auto max-w-full min-w-0 flex-col items-start gap-0.5 px-3 py-2 text-left wrap-anywhere whitespace-normal disabled:opacity-100 aria-pressed:border-primary aria-pressed:bg-selected max-sm:w-full dark:aria-pressed:bg-selected'
                  onClick={() => {
                    onOutboundChange(selected ? undefined : tag);
                  }}
                >
                  <span className='flex min-w-0 flex-wrap items-center gap-x-2'>
                    <span className={cn('font-semibold', hasTag && 'font-mono')}>
                      {hasTag ? tag : t('outbounds.untagged')}
                    </span>
                    {hasTag &&
                      (stagedTags.has(tag) ? (
                        <Badge variant='secondary'>{t('outbounds.staged')}</Badge>
                      ) : (
                        <span className='text-xs font-normal text-muted-foreground'>{t('outbounds.applied')}</span>
                      ))}
                    {hasTag && <Check aria-hidden className={cn('size-3.5', !selected && 'invisible')} />}
                  </span>
                  <span className='text-xs font-normal text-muted-foreground'>{labelForType(type)}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {providers > 0 && (
        <p className='text-sm text-muted-foreground'>
          {t('outbounds.providers', { count: providers })}
          {hasStagedSubscriptions && <> · {t('outbounds.subscriptionPending')}</>}
        </p>
      )}
      {(outboundEntries.length > 0 || providers > 0) && (
        <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
          {suggestServices && (
            <a
              href={`#${SIMPLE_SERVICE_SUGGESTIONS_ID}`}
              className='inline-flex w-fit items-center gap-1 text-sm text-primary underline underline-offset-4'
            >
              {t('outbounds.serviceSuggestions')}
              <ArrowDown aria-hidden='true' className='size-4 shrink-0' />
            </a>
          )}
          <Link
            to={proxiesTo}
            className='inline-flex w-fit items-center gap-1 text-sm text-primary underline underline-offset-4'
          >
            {t('outbounds.inventory')}
            <ArrowRight aria-hidden='true' className='size-4 shrink-0' />
          </Link>
        </div>
      )}
    </SimpleRoutesSection>
  );
}
