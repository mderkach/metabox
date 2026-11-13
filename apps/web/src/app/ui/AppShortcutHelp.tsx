import { useTranslation } from 'react-i18next';

import { SHORTCUT, toShortcutLabel } from '@shared/lib/shortcuts';
import {
  DIALOG_SIZE,
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Kbd,
  KbdGroup,
} from '@shared/ui';

/** Keys as the list names them, in the order the list shows them; the text key is the row's description. */
const HELP_ROWS = [
  { keys: [SHORTCUT.Search], text: 'search' },
  { keys: [SHORTCUT.Add], text: 'add' },
  { keys: [SHORTCUT.Apply], text: 'apply' },
  { keys: ['↑', '↓'], text: 'rows' },
  { keys: ['↑', '↓'], text: 'nodes' },
  { keys: ['Enter'], text: 'open' },
  { keys: ['Esc'], text: 'close' },
  { keys: [SHORTCUT.Help], text: 'help' },
] as const;

/** The keyboard shortcuts of the panel, opened by `?` from any screen. */
export function AppShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('app');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className={DIALOG_SIZE.List}>
        <DialogCloseButton label={t('action.close', { ns: 'shared' })} />
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
          <DialogDescription>{t('shortcuts.description')}</DialogDescription>
        </DialogHeader>
        <dl className='grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm'>
          {HELP_ROWS.map(({ keys, text }) => (
            <div key={text} className='contents'>
              <dt>
                <KbdGroup>
                  {keys.map((key) => (
                    <Kbd key={key}>{toShortcutLabel(key)}</Kbd>
                  ))}
                </KbdGroup>
              </dt>
              <dd className='text-muted-foreground'>{t(`shortcuts.keys.${text}`)}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
