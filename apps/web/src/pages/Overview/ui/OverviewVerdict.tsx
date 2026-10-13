import { Link } from '@tanstack/react-router';
import { CircleCheck, CircleDashed, CircleX, TriangleAlert, type LucideIcon } from 'lucide-react';

import { cn } from '@shared/lib/utils';

import { VERDICT_TONE, type Verdict, type VerdictTone } from '../lib';

const VERDICT_VIEW: Readonly<Record<VerdictTone, { icon: LucideIcon; tone: string; title: string }>> = {
  [VERDICT_TONE.Ok]: { icon: CircleCheck, tone: 'text-signal-ok', title: 'text-foreground' },
  [VERDICT_TONE.Idle]: { icon: CircleDashed, tone: 'text-signal-idle', title: 'text-foreground' },
  [VERDICT_TONE.Warn]: { icon: TriangleAlert, tone: 'text-signal-warn', title: 'text-signal-warn' },
  [VERDICT_TONE.Bad]: { icon: CircleX, tone: 'text-signal-bad', title: 'text-signal-bad' },
};

/**
 * The verdict as a line across the full header width: in the header it is visible from any
 * scroll position. Tone is carried by the icon and, on a problem, the title; the icon shape
 * tells states apart without color. The live region is the title only:
 * the explanation changes with every snapshot, and a screen reader would read it out endlessly.
 */
export function OverviewVerdict({ verdict }: { verdict: Verdict }) {
  const view = VERDICT_VIEW[verdict.tone];

  return (
    <div className='flex basis-full items-start gap-2.5'>
      <view.icon aria-hidden='true' className={cn('mt-0.5 size-5 shrink-0', view.tone)} />
      <div className='flex min-w-0 flex-col gap-0.5'>
        <p role='status' className={cn('text-base font-semibold', view.title)}>
          {verdict.title}
        </p>
        <p className='text-sm text-pretty text-muted-foreground'>
          {verdict.hint}
          {verdict.action !== null && (
            <>
              {' '}
              <Link
                to={verdict.action.to}
                className='font-medium text-foreground underline underline-offset-3 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'
              >
                {verdict.action.label}
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
