import { Ellipsis } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  ConfirmDialog,
  DESTRUCTIVE_OUTLINE,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/ui';

/**
 * Discard of the whole draft, after a confirmation: the document has no
 * step-by-step undo. `compact` puts it into a menu, which keeps the phone bar
 * in one row; focus then returns to the menu button.
 */
export function ConfigApplyDiscard({
  label,
  compact = false,
  onDiscard,
}: {
  label?: string;
  compact?: boolean;
  onDiscard: () => void;
}) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const [open, setOpen] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const text = label ?? t('bar.discard');

  return (
    <>
      {compact && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button ref={menuTrigger} variant='ghost' size='icon-sm' aria-label={t('bar.more')} />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-auto'>
            <DropdownMenuItem
              variant='destructive'
              onClick={() => {
                setOpen(true);
              }}
            >
              {text}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ConfirmDialog
        trigger={
          compact ? undefined : (
            <Button variant='outline' size='sm' className={DESTRUCTIVE_OUTLINE}>
              {text}
            </Button>
          )
        }
        open={open}
        onOpenChange={setOpen}
        title={t('discard.title')}
        description={t('discard.description')}
        cancelLabel={t('discard.cancel')}
        confirmLabel={t('discard.confirm')}
        destructive
        finalFocus={compact ? menuTrigger : undefined}
        onConfirm={onDiscard}
      />
    </>
  );
}
