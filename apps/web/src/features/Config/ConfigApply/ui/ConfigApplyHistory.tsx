import { History } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toCheckFailure, useConfigVersions, type ConfigVersion } from '@entities/Config';
import { formatBytes, formatDateTime } from '@shared/lib/format';
import {
  Badge,
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
        {t('history.open')}
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

        {versions.isSuccess && versions.data.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyDescription>{t('history.empty')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {versions.isSuccess && versions.data.length > 0 && (
          <ScrollArea className='max-h-[50vh]'>
            <ul className='flex flex-col'>
              {versions.data.map((version) => (
                <VersionRow key={version.id} version={version} disabled={restore.isPending} onRestore={onRestore} />
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

/** Rollback to the current version would restart the service for the same config, so it has no button. */
function VersionRow({
  version,
  disabled,
  onRestore,
}: {
  version: ConfigVersion;
  disabled: boolean;
  onRestore: (id: number) => void;
}) {
  const { t } = useTranslation('features/Config/ConfigApply');
  return (
    <li className='flex items-center gap-3 border-t border-border py-2 first:border-t-0'>
      <span className='text-sm font-medium'>{t('history.version', { id: version.id })}</span>
      {version.savedAt === null ? (
        <span className='text-xs text-muted-foreground'>{t('history.unknownTime')}</span>
      ) : (
        <SavedAt at={version.savedAt} />
      )}
      <span className='font-mono text-xs text-muted-foreground'>{formatBytes(version.size)}</span>
      <span className='grow' />
      {version.current ? (
        <Badge variant='secondary'>{t('history.current')}</Badge>
      ) : (
        <Button
          variant='outline'
          size='sm'
          disabled={disabled}
          onClick={() => {
            onRestore(version.id);
          }}
        >
          {t('history.restore')}
        </Button>
      )}
    </li>
  );
}

function SavedAt({ at }: { at: number }) {
  const saved = new Date(at);

  return (
    <time dateTime={saved.toISOString()} className='text-xs text-muted-foreground'>
      {formatDateTime(saved)}
    </time>
  );
}
