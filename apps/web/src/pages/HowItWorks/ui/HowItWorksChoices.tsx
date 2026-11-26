import { useTranslation } from 'react-i18next';

import { Button } from '@shared/ui';

import { HOW_IT_WORKS_NS } from '../i18n/HowItWorks.namespace.generated';
import { WALK_KINDS, type WalkCandidates, type WalkKind } from '../model/HowItWorks.model';

export function HowItWorksChoices({
  candidates,
  selected,
  onSelect,
  onRefresh,
}: {
  candidates: WalkCandidates;
  selected: WalkKind | null;
  onSelect: (kind: WalkKind) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation(HOW_IT_WORKS_NS);

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-2'>
      <div role='group' aria-label={t('connections')} className='flex min-w-0 flex-wrap gap-2'>
        {WALK_KINDS.map((kind) => {
          const row = candidates[kind].at(0);

          return row === undefined ? null : (
            <Button
              key={kind}
              type='button'
              variant={kind === selected ? 'secondary' : 'outline'}
              aria-pressed={kind === selected}
              className='h-auto min-h-11 max-w-full min-w-0 flex-wrap whitespace-normal'
              onClick={() => {
                onSelect(kind);
              }}
            >
              <span className='text-xs text-muted-foreground'>{t(`choice.${kind}`)}</span>
              <span className='min-w-0 font-mono wrap-anywhere'>{row.host === '' ? t('unknown') : row.host}</span>
            </Button>
          );
        })}
      </div>
      <Button type='button' variant='ghost' onClick={onRefresh}>
        {t('other')}
      </Button>
    </div>
  );
}
