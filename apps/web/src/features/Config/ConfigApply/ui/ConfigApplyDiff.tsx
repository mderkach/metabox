import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useConfigDiff, useListChanges } from '@entities/Config';
import { DIFF_KIND, toDiffHunks, type DiffLine } from '@shared/lib/diff';
import {
  Button,
  Dialog,
  DIALOG_SIZE,
  DialogCloseButton,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ScrollArea,
} from '@shared/ui';

import type { ApplyBlock } from '../lib/ConfigApply.lib';
import { ConfigApplyBlocked } from './ConfigApplyBlocked';
import { ConfigApplyRuleChanges } from './ConfigApplyRuleChanges';

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

/** Apply goes only through this summary. The diff is the file text: these bytes go into Apply. */
export function ConfigApplyDiff({
  canApply,
  blocked,
  onApply,
}: {
  canApply: boolean;
  blocked: ApplyBlock | null;
  onApply: () => void;
}) {
  const { t } = useTranslation('features/Config/ConfigApply');
  const lines = useConfigDiff();
  // The dialog is redrawn on every outside keystroke, and the pass walks the
  // whole file: on a config of fifteen hundred lines that is noticeable work.
  const hunks = useMemo(() => toDiffHunks(lines, DIFF_CONTEXT), [lines]);
  const changed = useMemo(() => lines.filter((line) => line.kind !== DIFF_KIND.Same).length, [lines]);

  return (
    <Dialog>
      <DialogTrigger render={<Button size='sm' />}>{t('bar.apply')}</DialogTrigger>

      <DialogContent showCloseButton={false} className={DIALOG_SIZE.Document}>
        <DialogCloseButton label={t('action.close', { ns: 'shared' })} />
        <DialogHeader>
          <DialogTitle>{t('diff.title')}</DialogTitle>
          <DialogDescription>{t('diff.description')}</DialogDescription>
        </DialogHeader>

        <ConfigApplyRuleChanges />
        <ConfigApplyListChanges />

        <p className='text-xs text-muted-foreground'>
          {changed === 0 ? t('diff.same') : t('diff.changed', { count: changed })}
        </p>

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

        <DialogFooter className='sm:items-center'>
          {blocked !== null && <ConfigApplyBlocked blocked={blocked} className='sm:mr-auto' />}
          <DialogClose render={<Button variant='outline' size='sm' />}>
            {t('action.cancel', { ns: 'shared' })}
          </DialogClose>
          <DialogClose render={<Button size='sm' disabled={!canApply} />} onClick={onApply}>
            {t('bar.apply')}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * List files that will go with this apply. Their content does not get into the
 * line-by-line diff, since the file is visible on the sets screen, but the
 * dialog must name the composition of changes: not only the config text is
 * applied.
 */
function ConfigApplyListChanges() {
  const { t } = useTranslation('features/Config/ConfigApply');
  const lists = useListChanges();
  const put = Object.keys(lists.put);

  if (put.length + lists.remove.length === 0) {
    return null;
  }

  return (
    <section className='flex flex-col gap-1 text-sm'>
      <h3 className='font-medium'>{t('lists.title', { count: put.length + lists.remove.length })}</h3>
      <ul className='flex flex-col gap-0.5 font-mono text-xs'>
        {put.map((name) => (
          <li key={name}>rule-sets/{name}</li>
        ))}
        {lists.remove.map((name) => (
          <li key={name} className='text-destructive'>
            rule-sets/{name} — {t('lists.removed')}
          </li>
        ))}
      </ul>
    </section>
  );
}
