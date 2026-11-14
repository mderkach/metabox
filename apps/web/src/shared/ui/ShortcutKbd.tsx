import { toShortcutLabel } from '../lib/shortcuts';
import { cn } from '../lib/utils';
import { Kbd } from './shadcn/kbd';

/**
 * The shortcut of a control, hinted beside its label. Only where there is a
 * keyboard: a fine pointer is what a laptop with a touch screen has too, and a
 * phone does not. A screen reader takes it from `aria-keyshortcuts` of the control.
 */
export function ShortcutKbd({ shortcut, className }: { shortcut: string; className?: string }) {
  return (
    <Kbd aria-hidden='true' className={cn('not-any-pointer-fine:hidden', className)}>
      {toShortcutLabel(shortcut)}
    </Kbd>
  );
}
