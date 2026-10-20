import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Dialog,
  DIALOG_SIZE,
  DialogCloseButton,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@shared/ui';

import { useConfigChanges, useRuleChanges, type ApplyBlock } from '../lib/ConfigApply.lib';
import { ConfigApplyBlocked } from './ConfigApplyBlocked';
import { ConfigApplyChanges } from './ConfigApplyChanges';
import { ConfigApplyDiffText } from './ConfigApplyDiffText';
import { ConfigApplyListChanges } from './ConfigApplyListChanges';
import { ConfigApplyRuleChanges } from './ConfigApplyRuleChanges';

/** Apply goes only through this summary. Edits are named in words; the file text under them is the bytes Apply sends. */
export function ConfigApplyDiff({
  canApply,
  blocked,
  onApply,
}: {
  canApply: boolean;
  blocked: ApplyBlock | null;
  onApply: () => void;
}) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const [open, setOpen] = useState(false);
  const summarized = useRuleChanges().length + useConfigChanges().length > 0;
  const close = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size='sm' />}>{t('bar.apply')}</DialogTrigger>

      <DialogContent showCloseButton={false} className={DIALOG_SIZE.Document}>
        <DialogCloseButton label={t('action.close', { ns: 'shared' })} />
        <DialogHeader>
          <DialogTitle>{t('diff.title')}</DialogTitle>
          <DialogDescription>{t('diff.description')}</DialogDescription>
        </DialogHeader>

        <ConfigApplyRuleChanges onNavigate={close} />
        <ConfigApplyChanges onNavigate={close} />
        <ConfigApplyListChanges />

        <ConfigApplyDiffText folded={summarized} />

        <DialogFooter className='sm:items-center'>
          {blocked !== null && <ConfigApplyBlocked blocked={blocked} className='sm:mr-auto' />}
          <DialogClose render={<Button variant='outline' size='sm' />}>
            {t('action.cancel', { ns: 'shared' })}
          </DialogClose>
          <DialogClose render={<Button size='sm' disabled={!canApply} />} onClick={onApply}>
            {t('bar.apply')}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
