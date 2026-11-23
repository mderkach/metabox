import { Link } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import { CONFIG_SECTION } from '@entities/Config';
import { ConfigNodeAddLink } from '@features/Config/ConfigNodeAdd';
import { Button, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@shared/ui';

export function SimpleRoutesAddDialog({
  takenTags,
  onAdded,
  finalFocus,
}: {
  takenTags: readonly string[];
  onAdded: () => void;
  finalFocus: ComponentProps<typeof DialogContent>['finalFocus'];
}) {
  const { t } = useTranslation('pages/SimpleRoutes');

  return (
    <DialogContent
      finalFocus={finalFocus}
      showCloseButton={false}
      className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md'
    >
      <DialogHeader>
        <DialogTitle>{t('addServer.title')}</DialogTitle>
        <DialogDescription className='text-pretty'>{t('addServer.description')}</DialogDescription>
      </DialogHeader>
      <ConfigNodeAddLink
        section={CONFIG_SECTION.Outbounds}
        takenTags={takenTags}
        onAdded={onAdded}
        cancel={<DialogClose render={<Button variant='outline' />}>{t('addServer.cancel')}</DialogClose>}
      />
      <Link
        to='/config/$section'
        params={{ section: CONFIG_SECTION.Providers }}
        className='inline-flex min-h-11 items-center justify-self-start text-sm text-primary underline underline-offset-4 sm:min-h-8'
      >
        {t('addServer.subscription')}
      </Link>
    </DialogContent>
  );
}
