import { Hand } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MANUAL_CHOICE, useManualChoice, type ManualChoiceStatus } from '@features/Proxy/ProxyManualChoice';
import { Button } from '@shared/ui';

const NOTE_KEY = {
  [MANUAL_CHOICE.Unavailable]: null,
  [MANUAL_CHOICE.Available]: 'auto.hint',
  [MANUAL_CHOICE.Added]: 'auto.added',
  [MANUAL_CHOICE.Wrapped]: 'auto.wrapped',
} as const satisfies Record<ManualChoiceStatus, string | null>;

/** Why an automatic group cannot be switched, and the way to a manual choice over it. */
export function ProxyGroupManualChoice({ group }: { group: string }) {
  const { t } = useTranslation('widgets/ProxyGroups');
  const choice = useManualChoice(group);
  const [refused, setRefused] = useState(false);
  const note = refused && choice.status === MANUAL_CHOICE.Available ? 'auto.refused' : NOTE_KEY[choice.status];

  return (
    <div className='flex flex-col gap-2 rounded-md bg-muted px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4'>
      <div className='flex min-w-0 gap-2'>
        <Hand aria-hidden='true' className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
        <div className='flex min-w-0 flex-col gap-0.5'>
          <p className='text-pretty'>{t('auto.reason')}</p>
          {/* Only the line that changes after the action is announced: the reason is read with the card. */}
          <p role='status' className='text-xs text-pretty text-muted-foreground empty:hidden'>
            {note === null ? null : t(note)}
          </p>
        </div>
      </div>
      {choice.status === MANUAL_CHOICE.Available && (
        <Button
          variant='outline'
          size='sm'
          className='ml-6 shrink-0 self-start sm:ml-0 sm:self-center'
          aria-label={t('auto.actionLabel', { group })}
          onClick={() => {
            setRefused(!choice.add());
          }}
        >
          {t('auto.action')}
        </Button>
      )}
    </div>
  );
}
