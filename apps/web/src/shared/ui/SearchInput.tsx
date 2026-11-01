import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';

import { SHORTCUT } from '../lib/shortcuts';
import { cn } from '../lib/utils';
import { Input } from './shadcn/input';
import { ShortcutKbd } from './ShortcutKbd';
import { SEARCH_FIELD } from './styles';

/**
 * Search field of a list toolbar. `/` puts focus into it from anywhere on the
 * screen; the key is hinted inside the empty field where there is a keyboard.
 */
export function SearchInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'className'> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Classes of the wrapper, which sets the field width. */
  className?: string;
}) {
  return (
    <div className={cn(SEARCH_FIELD, className)}>
      <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
      <Input
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
        }}
        aria-keyshortcuts={SHORTCUT.Search}
        className='peer pl-8 md:pr-8'
        {...props}
      />
      <ShortcutKbd
        shortcut={SHORTCUT.Search}
        className='absolute top-1/2 right-2 -translate-y-1/2 peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden'
      />
    </div>
  );
}
