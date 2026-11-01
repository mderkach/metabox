import { CircleCheck, CircleX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { DIAG_STATUS, type DiagCheck } from '@entities/Diag';
import { cn } from '@shared/lib/utils';

/**
 * The outcome of a run in one line above the checks: without it a failure has to
 * be found by eye among seven rows. Announced once per run, like the overview check.
 */
export function DiagnosticsSummary({ checks }: { checks: DiagCheck[] }) {
  const { t } = useTranslation('pages/Diagnostics');
  const failed = checks.filter((check) => check.status === DIAG_STATUS.Fail).length;
  const passed = checks.filter((check) => check.status === DIAG_STATUS.Ok).length;
  const skipped = checks.length - failed - passed;
  const Icon = failed > 0 ? CircleX : CircleCheck;

  return (
    <p role='status' className='flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium'>
      <Icon aria-hidden='true' className={cn('size-4 shrink-0', failed > 0 ? 'text-signal-bad' : 'text-signal-ok')} />
      {failed > 0 && t('summary.failed', { count: failed, total: checks.length })}
      {failed === 0 && skipped === 0 && t('summary.passed', { total: checks.length })}
      {failed === 0 && skipped > 0 && t('summary.passedSkipped', { passed, skipped })}
    </p>
  );
}
