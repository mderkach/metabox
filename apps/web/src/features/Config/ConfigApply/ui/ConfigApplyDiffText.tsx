import { ChevronRight } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfigDiff } from '@entities/Config';
import { DIFF_KIND, toDiffHunks, type DiffLine } from '@shared/lib/diff';
import { cn } from '@shared/lib/utils';
import { Button, ScrollArea } from '@shared/ui';

/** Lines around an edit: fewer, and it is unclear which section it was made in. */
const DIFF_CONTEXT = 3;

const LINE_STYLE: Readonly<Record<DiffLine['kind'], string>> = {
  [DIFF_KIND.Same]: 'text-muted-foreground',
  [DIFF_KIND.Added]: 'bg-signal-ok/10 text-signal-ok',
  [DIFF_KIND.Removed]: 'bg-destructive/10 text-destructive',
};

/** The sign is put as text: color must not be the only indicator of an edit. */
const LINE_MARK: Readonly<Record<DiffLine['kind'], string>> = {
  [DIFF_KIND.Same]: ' ',
  [DIFF_KIND.Added]: '+',
  [DIFF_KIND.Removed]: '−',
};

/**
 * The file text that goes into Apply, line by line. Folded while the summary
 * above names the edits: an edit that only the text shows (a comment, key
 * order) opens it from the start.
 */
export function ConfigApplyDiffText({ folded }: { folded: boolean }) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const lines = useConfigDiff();
  // The dialog is redrawn on every outside keystroke, and the pass walks the
  // whole file: on a config of fifteen hundred lines that is noticeable work.
  const hunks = useMemo(() => toDiffHunks(lines, DIFF_CONTEXT), [lines]);
  const changed = useMemo(() => lines.filter((line) => line.kind !== DIFF_KIND.Same).length, [lines]);
  const expanded = !folded || open;

  if (changed === 0) {
    return <p className='text-xs text-muted-foreground'>{t('diff.same')}</p>;
  }

  return (
    <section className='flex min-h-0 min-w-0 flex-col gap-2'>
      {folded ? (
        <Button
          variant='ghost'
          size='sm'
          aria-expanded={expanded}
          aria-controls={contentId}
          className='-mx-2.5 self-start'
          onClick={() => {
            setOpen(!open);
          }}
        >
          <ChevronRight
            aria-hidden='true'
            className={cn('transition-transform motion-reduce:transition-none', expanded && 'rotate-90')}
          />
          {t('diff.changed', { count: changed })}
        </Button>
      ) : (
        <p className='text-xs text-muted-foreground'>{t('diff.changed', { count: changed })}</p>
      )}
      <div id={contentId} hidden={!expanded} className='flex min-h-0 min-w-0 flex-col'>
        {expanded && (
          <ScrollArea className='max-h-[50vh] rounded-lg border border-border'>
            <table className='w-full border-collapse font-mono text-xs'>
              <caption className='sr-only'>{t('diff.caption')}</caption>
              <thead className='sr-only'>
                <tr>
                  <th scope='col'>{t('diff.column.before')}</th>
                  <th scope='col'>{t('diff.column.after')}</th>
                  <th scope='col'>{t('diff.column.content')}</th>
                </tr>
              </thead>
              {hunks.map((hunk) => (
                <tbody key={`${String(hunk.skipped)}:${String(hunk.lines[0]?.before)}:${String(hunk.lines[0]?.after)}`}>
                  {hunk.skipped > 0 && (
                    <tr>
                      <td colSpan={3} className='bg-muted px-2 py-1 text-muted-foreground'>
                        {t('diff.skipped', { count: hunk.skipped })}
                      </td>
                    </tr>
                  )}
                  {hunk.lines.map((line) => (
                    <tr
                      key={`${line.kind}:${String(line.before)}:${String(line.after)}`}
                      className={LINE_STYLE[line.kind]}
                    >
                      <td className='w-10 px-2 text-right text-muted-foreground select-none'>{line.before ?? ''}</td>
                      <td className='w-10 px-2 text-right text-muted-foreground select-none'>{line.after ?? ''}</td>
                      <td className='px-2 whitespace-pre-wrap'>
                        <span className='select-none'>{LINE_MARK[line.kind]} </span>
                        {line.text}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </ScrollArea>
        )}
      </div>
    </section>
  );
}
