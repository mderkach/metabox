import { cn } from '../lib/utils';
import type { TokenSuggestion } from './TokenInput.lib';

/** One suggestion of `TokenInputSuggestions`: a name in the text voice, a value from the config in monospace. */
export function TokenInputOption({
  id,
  suggestion,
  highlighted,
  onPick,
  onHover,
}: {
  id: string;
  suggestion: TokenSuggestion;
  highlighted: boolean;
  onPick: (suggestion: TokenSuggestion) => void;
  /** The pointer moves the one highlight the keyboard moves, so two rows are never marked at once. */
  onHover: () => void;
}) {
  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus -- the keyboard stays in the combobox input, which highlights options through `aria-activedescendant`
    <div
      id={id}
      role='option'
      aria-selected={highlighted}
      data-highlighted={highlighted || undefined}
      className='flex min-h-8 w-full min-w-0 cursor-default items-center justify-between gap-3 rounded-md px-2 py-1 text-sm select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground pointer-coarse:min-h-11'
      // Keeps focus in the input: a blur would close the typed text into a chip before the pick.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onMouseMove={() => {
        if (!highlighted) {
          onHover();
        }
      }}
      onClick={() => {
        onPick(suggestion);
      }}
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
    </div>
  );
}
