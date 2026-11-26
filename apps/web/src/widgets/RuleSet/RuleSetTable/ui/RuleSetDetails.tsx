import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { RULE_SET_TYPE, type RuleSetRow, type useCachedRuleSets } from '@entities/RuleSet';
import type { CachedRuleSet } from '@entities/RuleSet';
import { Button, SkeletonRows } from '@shared/ui';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';
import type { RuleSetLinks } from '../model/RuleSetTable.links';
import { RuleSetReferenceLinks } from './RuleSetReferenceLinks';
import { RuleSetSizeCell } from './RuleSetSizeCell';
import { RuleSetSourceDetails } from './RuleSetSourceDetails';
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
  links,
  cached,
  cache,
  draftOnly,
}: {
  links: RuleSetLinks;
  set: RuleSetRow;
  cached: CachedRuleSet | undefined;
  cache?: ReturnType<typeof useCachedRuleSets>;
  draftOnly: boolean;
}) {
  const { t } = useTranslation(RULE_SET_TABLE_NS);
  const state = cached?.state;

  return (
    <div className='flex min-w-0 flex-col gap-3 border-b border-border px-4 py-3 text-sm [overflow-wrap:anywhere]'>
      <RuleSetSourceDetails description={set.description} />

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

      <RuleSetReferenceLinks referenceLink={links.reference} usage={set.usage} />
    </div>
  );
}
