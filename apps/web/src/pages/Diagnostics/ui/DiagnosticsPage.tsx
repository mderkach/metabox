import { Stethoscope } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDiagReport, type DiagRun } from '@entities/Diag';
import { useProxies } from '@entities/Proxy';
import { cn } from '@shared/lib/utils';
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  QueryFailure,
  SURFACE,
  SkeletonRows,
  TABLE_HEADER,
} from '@shared/ui';
import { PageHeader } from '@widgets/PageHeader';

import { toDiagTargets } from '../lib';
import { DIAGNOSTICS_COLUMN } from './DiagnosticsColumns';
import { DiagnosticsRow } from './DiagnosticsRow';
import { DiagnosticsTargetSelect } from './DiagnosticsTargetSelect';

/** The header row is also a table row: row numbering starts with it. */
const HEADER_ROWS = 1;

/**
 * Dataplane diagnostics: ports, DNS, nft chains and internet access. The run happens
 * only on the button and without polling: it sends packets from the router and leaves lines
 * in the sing-box log.
 */
export function DiagnosticsPage() {
  const { t } = useTranslation('pages/Diagnostics');
  const proxies = useProxies();
  const targets = useMemo(() => toDiagTargets(proxies.data), [proxies.data]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [run, setRun] = useState<DiagRun | null>(null);
  const report = useDiagReport(run);
  // Until the user picks a node, the first group is checked: usually
  // it is the selector that the traffic goes through.
  const target = chosen ?? targets.at(0) ?? '';
  const checks = report.data ?? [];

  return (
    <>
      <PageHeader title={t('section.diagnostics', { ns: 'shared' })} />

      <div className='flex min-h-0 grow flex-col gap-5 overflow-y-auto px-4 py-5 *:shrink-0 sm:px-6'>
        <section className={cn('flex min-w-0 flex-col overflow-hidden', SURFACE)}>
          <div className='flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3.5 py-2.5'>
            <DiagnosticsTargetSelect targets={targets} target={target} onTargetChange={setChosen} />
            <Button
              size='sm'
              disabled={report.isFetching}
              onClick={() => {
                setRun({ proxy: target, run: Date.now() });
              }}
            >
              <Stethoscope data-icon='inline-start' />
              {report.isFetching ? t('run.pending') : t('run.action')}
            </Button>
            <p className='max-w-prose text-xs text-pretty text-muted-foreground'>{t('run.hint')}</p>
          </div>

          {run === null && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('idle.title')}</EmptyTitle>
                <EmptyDescription className='max-w-prose text-pretty'>{t('idle.description')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {run !== null && report.isPending && <SkeletonRows className='p-4' />}

          {report.isLoadingError && (
            <div className='p-4'>
              <QueryFailure messageKey='source.diag' query={report} />
            </div>
          )}

          {checks.length > 0 && (
            <div role='table' aria-label={t('title')} aria-rowcount={checks.length + HEADER_ROWS}>
              <div role='rowgroup'>
                <div
                  role='row'
                  aria-rowindex={1}
                  className={cn(DIAGNOSTICS_COLUMN.Row, 'bg-table-head py-2 max-md:sr-only', TABLE_HEADER)}
                >
                  <span role='columnheader' className={DIAGNOSTICS_COLUMN.Name}>
                    {t('column.check')}
                  </span>
                  <span role='columnheader' className={DIAGNOSTICS_COLUMN.Status}>
                    {t('column.status')}
                  </span>
                  <span role='columnheader' className={DIAGNOSTICS_COLUMN.Result}>
                    {t('column.result')}
                  </span>
                </div>
              </div>

              <div role='rowgroup'>
                {checks.map((check, position) => (
                  <DiagnosticsRow key={check.name} check={check} rowIndex={position + 1 + HEADER_ROWS} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
