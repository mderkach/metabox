import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { RULE_SET_TYPE, type RuleSetRow, type useCachedRuleSets } from '@entities/RuleSet';
import type { CachedRuleSet } from '@entities/RuleSet';
import { Button, SkeletonRows } from '@shared/ui';

import { RuleSetSizeCell } from './RuleSetSizeCell';
import { RuleSetUpdatedCell } from './RuleSetUpdatedCell';

const CACHE_STATE_MESSAGE = {
  memory_only: 'details.memoryOnly',
  unreadable: 'details.unreadable',
  not_downloaded: 'details.notDownloaded',
} as const;

function cacheStateMessage(state: string | undefined) {
  if (state === 'memory_only' || state === 'unreadable' || state === 'not_downloaded') {
    return CACHE_STATE_MESSAGE[state];
  }

  return 'details.unavailable';
}

export function RuleSetDetails({
  set,
  cached,
  cache,
  draftOnly,
}: {
  set: RuleSetRow;
  cached: CachedRuleSet | undefined;
  cache?: ReturnType<typeof useCachedRuleSets>;
  draftOnly: boolean;
}) {
  const { t } = useTranslation('widgets/RuleSet/RuleSetTable');
  const description = set.description;
  const state = cached?.state;

  const usage = set.usage;
  const routeRules = usage.filter((item) => item.kind === 'route');
  const dnsRules = usage.filter((item) => item.kind === 'dns');

  return (
    <div className='flex min-w-0 flex-col gap-3 border-b border-border px-4 py-3 text-sm [overflow-wrap:anywhere]'>
      <div>
        {(description.kind === 'geosite' || description.kind === 'geoip') && (
          <>
            <p>
              {t(`details.${description.kind}`, { provider: description.providerName, category: description.category })}
            </p>
            {description.mirrorHost !== null && <p>{t('details.mirror', { host: description.mirrorHost })}</p>}
          </>
        )}
        {description.kind === 'remote' && (
          <p>
            {description.host === null ? t('details.remoteUnknown') : t('details.remote', { host: description.host })}
          </p>
        )}
        {description.kind === 'local' && <p>{t('details.local', { path: description.path })}</p>}
        {description.kind === 'inline' && <p>{t('details.inline')}</p>}
        {'fileName' in description && description.fileName !== null && (
          <p>{t('details.file', { name: description.fileName })}</p>
        )}
      </div>

      {set.type === RULE_SET_TYPE.Remote && (
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
          {draftOnly && <p>{t('details.draftOnly')}</p>}
          {!draftOnly && cache?.isPending === true && <SkeletonRows rows={1} className='p-0' />}
          {!draftOnly && cache?.isLoadingError === true && (
            <>
              <p>{t('details.fetchFailed')}</p>
              <Button type='button' variant='outline' size='sm' onClick={() => void cache.refetch()}>
                {t('details.retry')}
              </Button>
            </>
          )}
          {!draftOnly &&
            cache?.isSuccess === true &&
            (cached?.state === 'cached' ? (
              <>
                <RuleSetUpdatedCell set={set} cached={cached} />
                <RuleSetSizeCell set={set} cached={cached} showLabel />
                <p className='basis-full text-xs text-muted-foreground'>{t('details.checkedHelp')}</p>
                {cached.otherAddress && (
                  <p className='flex basis-full items-start gap-2'>
                    <TriangleAlert aria-hidden='true' className='mt-0.5 size-4 shrink-0 text-signal-warn' />
                    {t('details.otherAddress')}
                  </p>
                )}
              </>
            ) : (
              <p>{t(cacheStateMessage(state))}</p>
            ))}
        </div>
      )}

      <div>
        <p className='font-medium'>{t('details.usage')}</p>
        {usage.length === 0 && <p>{t('details.unused')}</p>}
        {routeRules.length > 0 && (
          <>
            <p>{t('details.routeRules')}</p>
            <ul className='list-disc pl-5'>
              {routeRules.map((item) => (
                <li key={item.number}>
                  <Link
                    to='/config'
                    search={{ rule: item.number }}
                    className='inline-flex items-center text-primary underline max-md:min-h-11'
                  >
                    {item.name ?? t('details.rule', { number: item.number })}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {dnsRules.length > 0 && (
          <>
            <p>{t('details.dnsRules')}</p>
            <ul className='list-disc pl-5'>
              {dnsRules.map((item) => (
                <li key={item.number}>
                  <Link
                    to='/config/$section'
                    params={{ section: 'dnsRules' }}
                    search={{ node: item.number }}
                    className='inline-flex items-center text-primary underline max-md:min-h-11'
                  >
                    {item.name ?? t('details.rule', { number: item.number })}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
