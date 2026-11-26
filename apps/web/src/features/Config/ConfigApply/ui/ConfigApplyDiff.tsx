import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SHARED_NS } from '@shared/i18n';
import { SHORTCUT } from '@shared/lib/shortcuts';
import {
  Button,
  Dialog,
  DIALOG_SIZE,
  DialogCloseButton,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ShortcutKbd,
} from '@shared/ui';

import { CONFIG_APPLY_NS } from '../i18n/ConfigApply.namespace.generated';
import { useConfigChanges, useRuleChanges, type ApplyBlock } from '../lib/ConfigApply.lib';
import type { ConfigApplyNavigation } from '../model/ConfigApply.link';
import { ConfigApplyBlocked } from './ConfigApplyBlocked';
import { ConfigApplyChanges } from './ConfigApplyChanges';
import { ConfigApplyDiffDescription } from './ConfigApplyDiffDescription';
import { ConfigApplyDiffText } from './ConfigApplyDiffText';
import { ConfigApplyListChanges } from './ConfigApplyListChanges';
import { ConfigApplyRuleChanges } from './ConfigApplyRuleChanges';

/** Apply goes only through this summary. Edits are named in words; the file text under them is the bytes Apply sends. */
export function ConfigApplyDiff({
  ChangeLink,
  canApply,
  blocked,
  onApply,
}: ConfigApplyNavigation & {
  canApply: boolean;
  blocked: ApplyBlock | null;
  onApply: () => void;
}) {
  const { t } = useTranslation(CONFIG_APPLY_NS);
  const [open, setOpen] = useState(false);
  const summarized = useRuleChanges().length + useConfigChanges().length > 0;
  const close = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size='sm' aria-keyshortcuts={SHORTCUT.Apply} />}>
        {t('bar.apply')}
        <ShortcutKbd
          shortcut={SHORTCUT.Apply}
          className='bg-transparent text-primary-foreground inset-ring-1 inset-ring-primary-foreground/35'
        />
      </DialogTrigger>

      <DialogContent showCloseButton={false} className={DIALOG_SIZE.Document}>
        <DialogCloseButton label={t('action.close', { ns: SHARED_NS })} />
        <DialogHeader>
          <DialogTitle>{t('diff.title')}</DialogTitle>
          <ConfigApplyDiffDescription />
        </DialogHeader>

        <ConfigApplyRuleChanges ChangeLink={ChangeLink} onNavigate={close} />
        <ConfigApplyChanges ChangeLink={ChangeLink} onNavigate={close} />
        <ConfigApplyListChanges />

        <ConfigApplyDiffText folded={summarized} />

        <DialogFooter className='sm:items-center'>
          {blocked !== null && <ConfigApplyBlocked blocked={blocked} className='sm:mr-auto' />}
          <DialogClose render={<Button variant='outline' size='sm' />}>
            {t('action.cancel', { ns: SHARED_NS })}
          </DialogClose>
          <DialogClose render={<Button size='sm' disabled={!canApply} />} onClick={onApply}>
            {t('bar.apply')}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
