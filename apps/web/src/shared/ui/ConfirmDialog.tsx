import { useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './shadcn/alert-dialog';

/**
 * Confirmation of an action: a question, its consequence, "cancel" and the
 * action. Without `trigger` the dialog is opened by its owner through `open`.
 * The dialog closes before `onConfirm` runs.
 */
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  destructive = false,
  finalFocus,
  onConfirm,
}: {
  /** The element that opens the dialog, with its label. */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  destructive?: boolean;
  /** Focus after closing when the trigger is gone, as with a menu item. */
  finalFocus?: ComponentProps<typeof AlertDialogContent>['finalFocus'];
  onConfirm: () => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const shown = open ?? ownOpen;

  function setShown(next: boolean) {
    setOwnOpen(next);
    onOpenChange?.(next);
  }

  return (
    <AlertDialog open={shown} onOpenChange={setShown}>
      {trigger !== undefined && <AlertDialogTrigger render={trigger} />}

      <AlertDialogContent finalFocus={finalFocus} className='data-[size=default]:max-w-[calc(100%-2rem)]'>
        <AlertDialogHeader className='place-items-start text-left'>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => {
              setShown(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
