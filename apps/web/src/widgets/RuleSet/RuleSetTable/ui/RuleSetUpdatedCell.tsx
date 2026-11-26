import { useTranslation } from 'react-i18next';

import { formatDateTime } from '@shared/lib/format';
import { MS_IN_DAY, MS_IN_HOUR, MS_IN_MINUTE, MS_IN_SECOND } from '@shared/lib/time';
import { Tooltip, TooltipContent, TooltipTrigger } from '@shared/ui';

import { RULE_SET_TABLE_NS } from '../i18n/RuleSetTable.namespace.generated';
import type { RuleSetCellProps } from './RuleSetColumns';
import { RuleSetUnknownValue } from './RuleSetUnknownValue';

const RELATIVE_UNITS = [
  ['day', MS_IN_DAY],
  ['hour', MS_IN_HOUR],
  ['minute', MS_IN_MINUTE],
  ['second', MS_IN_SECOND],
] as const;

function formatCheckAge(at: number, language: string): string {
  const elapsed = Date.now() - at;
  const [unit, duration] = RELATIVE_UNITS.find(([, step]) => Math.abs(elapsed) >= step) ?? RELATIVE_UNITS[3];

  return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(Math.trunc(-elapsed / duration), unit);
}

export function RuleSetUpdatedCell({ set, cached }: RuleSetCellProps) {
  const { t, i18n } = useTranslation(RULE_SET_TABLE_NS);
  const modifiedAt = cached?.checkedAt === undefined ? (set.file?.modifiedAt ?? null) : cached.checkedAt * MS_IN_SECOND;

  if (modifiedAt === null) {
    return <RuleSetUnknownValue />;
  }

  const at = new Date(modifiedAt);
  const absolute = formatDateTime(at);
  const checked = cached?.checkedAt !== undefined;

  return (
    <span className='text-xs text-muted-foreground tabular-nums'>
      <span className={cached === undefined ? 'md:hidden' : undefined}>
        {t(cached === undefined ? 'column.updated' : 'details.checked')}{' '}
      </span>
      {checked ? (
        <Tooltip>
          <TooltipTrigger type='button' className='rounded-sm underline decoration-dotted underline-offset-2'>
            <time dateTime={at.toISOString()} title={absolute}>
              {formatCheckAge(modifiedAt, i18n.language)}
            </time>
          </TooltipTrigger>
          <TooltipContent>{absolute}</TooltipContent>
        </Tooltip>
      ) : (
        <time dateTime={at.toISOString()}>{absolute}</time>
      )}
    </span>
  );
}
