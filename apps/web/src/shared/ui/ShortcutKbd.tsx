import { isApplePlatform } from '../lib/shortcuts';
import { cn } from '../lib/utils';
import { Kbd } from './shadcn/kbd';

/** `Control+S Meta+S` → `⌘S` on Apple keyboards, `Ctrl S` elsewhere. */
function toLabel(shortcuts: string): string {
  const apple = isApplePlatform();
  const shortcut =
    shortcuts.split(' ').find((one) => (apple ? !one.startsWith('Control+') : !one.startsWith('Meta+'))) ?? shortcuts;

  return apple ? shortcut.replace('Meta+', '⌘') : shortcut.replace('Control+', 'Ctrl ');
}

/**
 * The shortcut of a control, hinted beside its label. Only where there is a
 * keyboard; a screen reader takes it from `aria-keyshortcuts` of the control.
 */
export function ShortcutKbd({ shortcut, className }: { shortcut: string; className?: string }) {
  return (
    <Kbd aria-hidden='true' className={cn('max-md:hidden pointer-coarse:hidden', className)}>
      {toLabel(shortcut)}
    </Kbd>
  );
}
