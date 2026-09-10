import { memo } from 'react';

import type { RuleMatcher } from '@entities/Rule';

/** Сколько значений условия показывается до сворачивания в «и ещё N». */
const VISIBLE_VALUES = 2;

function RuleMatcherChipProto({ matcher }: { matcher: RuleMatcher }) {
  const shown = matcher.values.slice(0, VISIBLE_VALUES);
  const hidden = matcher.values.length - shown.length;

  return (
    <span className='inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-muted pr-2 pl-1.5 text-xs'>
      <span className='text-muted-foreground'>{matcher.key}</span>
      {shown.map((value) => (
        <span key={value} className='font-mono font-medium'>
          {value}
        </span>
      ))}
      {hidden > 0 && <span className='text-muted-foreground'>и ещё {hidden}</span>}
    </span>
  );
}

export const RuleMatcherChip = memo(RuleMatcherChipProto);
