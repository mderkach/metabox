import { History, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toCheckFailure, useConfigVersions } from '@entities/Config';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DIALOG_SIZE,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  QueryFailure,
  ScrollArea,
  SkeletonRows,
} from '@shared/ui';

import { useRestoreConfigVersion } from '../api/ConfigApply.api';
import { ConfigApplyCheck } from './ConfigApplyCheck';
import { ConfigApplyVersionRow } from './ConfigApplyVersionRow';

/**
 * Rollback goes through the regular Apply protocol, so after the start the same
 * confirmation window appears as for one's own edit: a broken version cannot be
 * restored bypassing the binary check.
 *
 * The dialog is driven by state and is not closed by a press: a binary failure
 * has to be shown here, while a successful start, on the contrary, frees the
 * screen, because the bar waits for confirmation and the window is limited to a
 * minute.
 */
export function ConfigApplyHistory() {
  const { t } = useTranslation('features/Config/ConfigApply');
  const [open, setOpen] = useState(false);
  const versions = useConfigVersions();
  const restore = useRestoreConfigVersion();
  const check = toCheckFailure(restore.error);

  const onRestore = (id: number) => {
    restore.mutate(id, {
      onSuccess: () => {
        setOpen(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant='outline' size='sm' />}>
        <History />
        <span className='max-sm:sr-only'>{t('history.open')}</span>
      </DialogTrigger>

      <DialogContent showCloseButton={false} className={DIALOG_SIZE.List}>
        <DialogCloseButton label={t('action.close', { ns: 'shared' })} />
        <DialogHeader>
          <DialogTitle>{t('history.title')}</DialogTitle>
          <DialogDescription>{t('history.description')}</DialogDescription>
        </DialogHeader>

        {check !== null && <ConfigApplyCheck check={check} />}

        {versions.isPending && <SkeletonRows rows={3} className='p-0' />}

        {versions.isLoadingError && <QueryFailure messageKey='source.versions' query={versions} />}

        {versions.isSuccess && versions.data.currentListsUnavailable && (
          <Alert>
            <TriangleAlert className='text-signal-warn' />
            <AlertTitle>{t('history.listsUnavailable.title')}</AlertTitle>
            <AlertDescription>{t('history.listsUnavailable.description')}</AlertDescription>
          </Alert>
        )}

        {versions.isSuccess && versions.data.versions.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyDescription>{t('history.empty')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {versions.isSuccess && versions.data.versions.length > 0 && (
          <ScrollArea className='max-h-[50vh]'>
            <ul className='flex flex-col'>
              {versions.data.versions.map((version) => (
                <ConfigApplyVersionRow
                  key={version.id}
                  version={version}
                  disabled={restore.isPending}
                  onRestore={onRestore}
                />
              ))}
            </ul>
          </ScrollArea>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant='outline' size='sm' />}>
            {t('action.close', { ns: 'shared' })}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
