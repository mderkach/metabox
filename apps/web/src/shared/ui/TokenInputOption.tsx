import { Autocomplete as AutocompletePrimitive } from '@base-ui/react/autocomplete';

import { cn } from '../lib/utils';
import type { TokenSuggestion } from './TokenInput.lib';

/** One suggestion of `TokenInputSuggestions`: a name in the text voice, a value from the config in monospace. */
export function TokenInputOption({ suggestion }: { suggestion: TokenSuggestion }) {
  return (
    <AutocompletePrimitive.Item
      value={suggestion}
      className='flex min-h-8 w-full min-w-0 cursor-default items-center justify-between gap-3 rounded-md px-2 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground pointer-coarse:min-h-11'
    >
      <span className={cn('min-w-0 truncate', suggestion.label === undefined && 'font-mono')}>
        {suggestion.label ?? suggestion.value}
      </span>
      {suggestion.hint !== undefined && (
        <>
          {' '}
          <span className={cn('shrink-0 text-xs text-muted-foreground', suggestion.label !== undefined && 'font-mono')}>
            {suggestion.hint}
          </span>
        </>
      )}
    </AutocompletePrimitive.Item>
  );
}
