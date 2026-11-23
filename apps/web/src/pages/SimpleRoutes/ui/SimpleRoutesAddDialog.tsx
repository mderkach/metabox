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
      className='max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto sm:max-w-md'
    >
      <DialogHeader>
        <DialogTitle>{t('addServer.title')}</DialogTitle>
        <DialogDescription className='sr-only'>{t('addServer.description')}</DialogDescription>
      </DialogHeader>
      <ConfigNodeAddLink
        section={CONFIG_SECTION.Outbounds}
        takenTags={takenTags}
        onAdded={onAdded}
        cancel={<DialogClose render={<Button variant='ghost' />}>{t('addServer.cancel')}</DialogClose>}
        subscriptionFallback={
          <Link
            to='/config/$section'
            params={{ section: CONFIG_SECTION.Providers }}
            className='inline-flex min-h-8 items-center self-start text-sm text-primary underline underline-offset-4 pointer-coarse:min-h-11'
          >
            {t('addServer.subscription')}
          </Link>
        }
      />
    </DialogContent>
  );
}
