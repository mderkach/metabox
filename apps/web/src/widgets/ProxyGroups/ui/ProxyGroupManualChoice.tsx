import { Hand } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
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
  const focusAddedNote = useRef(false);
  const noteRef = useRef<HTMLParagraphElement>(null);
  const note = refused && choice.status === MANUAL_CHOICE.Available ? 'auto.refused' : NOTE_KEY[choice.status];

  useLayoutEffect(
    function focusResultAfterAdding() {
      if (!focusAddedNote.current || choice.status !== MANUAL_CHOICE.Added) return;

      focusAddedNote.current = false;
      noteRef.current?.focus();
    },
    [choice.status]
  );

  return (
    <div className='flex flex-col gap-2 rounded-md bg-muted px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4'>
      <div className='flex min-w-0 gap-2'>
        <Hand aria-hidden='true' className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
        <div className='flex min-w-0 flex-col gap-0.5'>
          <p className='max-w-help-text text-pretty'>{t('auto.reason')}</p>
          {/* Only the line that changes after the action is announced: the reason is read with the card. It also
              takes focus from the button the action removes, otherwise the keyboard falls back to the page start. */}
          <p
            ref={noteRef}
            role='status'
            tabIndex={-1}
            className='-mx-1 max-w-help-text rounded-sm px-1 text-xs text-pretty text-muted-foreground outline-none empty:hidden focus-visible:ring-3 focus-visible:ring-ring/50'
          >
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
          onClick={function addManualChoice() {
            focusAddedNote.current = true;
            const added = choice.add();

            if (!added) focusAddedNote.current = false;
            setRefused(!added);
          }}
        >
          {t('auto.action')}
        </Button>
      )}
    </div>
  );
}
