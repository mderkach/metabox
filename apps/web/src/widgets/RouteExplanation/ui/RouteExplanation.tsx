import { Link } from '@tanstack/react-router';
import type { ParseKeys, TFunction } from 'i18next';
import { X } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

import {
  ROUTE_MATCH,
  ROUTE_ORIGIN,
  type RouteExplanation as RouteExplanationModel,
  type RouteMatch,
  type RouteReasonCode,
} from '@entities/Route';
import { Alert, AlertDescription, AlertTitle, Button, buttonVariants } from '@shared/ui';

import { useRouteExplanationState } from '../lib/RouteExplanation.lib';
import { RouteOriginBadge } from './RouteOriginBadge';

/** Таблица обязана покрывать набор демона: новый код — ошибка компиляции здесь. */
const REASON_KEY: Readonly<Record<RouteReasonCode, ParseKeys<'widgets/RouteExplanation'>>> = {
  not_in_process_list: 'unknown.reason.not_in_process_list',
};

/**
 * Объяснение строится на наблюдаемых данных core: список правил и сработавшее
 * правило приходят от sing-box, а не выводятся панелью (ADR-0007). Причина,
 * по которой не подошли предыдущие правила, не вычисляется: у каждого
 * утверждения на экране видно происхождение, и догадка не подаётся как факт.
 */
export function RouteExplanation({ connectionId, onClose }: { connectionId: string; onClose: () => void }) {
  const { t } = useTranslation('widgets/RouteExplanation');
  const state = useRouteExplanationState(connectionId);

  return (
    <aside className='flex w-full max-w-md shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card'>
      <header className='flex items-center gap-2.5 border-b border-border px-4 py-3'>
        <h2 className='grow text-sm font-medium'>{t('title')}</h2>
        <Button variant='outline' size='icon-sm' aria-label={t('close')} onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className='flex min-h-0 grow flex-col gap-3 overflow-y-auto p-4'>
        {state.isPending && <p className='text-sm text-muted-foreground'>{t('pending')}</p>}

        {state.explanation !== null && (
          <>
            <Matched explanation={state.explanation} trusted={state.trusted} compared={state.compared} />

            {state.compared && !state.trusted && (
              <Alert variant='destructive'>
                <AlertTitle>{t('drift.title')}</AlertTitle>
                <AlertDescription>
                  {t('drift.description', {
                    running: state.explanation.rules.length,
                    document: state.inDocument,
                  })}
                </AlertDescription>
              </Alert>
            )}

            {!state.compared && <p className='text-xs text-pretty text-muted-foreground'>{t('drift.notCompared')}</p>}

            <Chain nodes={state.explanation.chain.nodes} origin={state.explanation.chain.origin} />

            {state.before.length > 0 && <Before rules={state.before} />}

            <p className='text-xs text-pretty text-muted-foreground'>{t('origin.note')}</p>
          </>
        )}
      </div>
    </aside>
  );
}

function Matched({
  explanation,
  trusted,
  compared,
}: {
  explanation: RouteExplanationModel;
  trusted: boolean;
  compared: boolean;
}) {
  const { t } = useTranslation('widgets/RouteExplanation');
  const { match } = explanation;

  if (match.kind === ROUTE_MATCH.Final) {
    return (
      <section className='flex flex-col gap-1.5'>
        <div className='flex items-center gap-2'>
          <h3 className='text-sm font-medium'>{t('final.title')}</h3>
          <RouteOriginBadge origin={match.origin} />
        </div>
        <p className='text-sm text-muted-foreground'>
          <Trans t={t} i18nKey='final.description' components={{ code: <code className='font-mono' /> }} />
        </p>
      </section>
    );
  }

  if (match.kind === ROUTE_MATCH.Unknown || match.index === null) {
    return <Unknown reason={unknownReason(t, match)} />;
  }

  // Номер узла показывается только при сошедшихся списках: в чужом документе
  // он указал бы на другое правило, а это ровно та догадка, которую ADR-0007
  // запрещает подавать как факт.
  if (compared && !trusted) {
    return <Unknown reason={t('unknown.drifted')} />;
  }

  return (
    <section className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <h3 className='text-sm font-medium'>{t('matched.title', { number: match.index + 1 })}</h3>
        <RouteOriginBadge origin={match.origin} />
      </div>

      <dl className='text-sm'>
        <Row
          label={t('matched.conditions')}
          value={match.conditions.length > 0 ? match.conditions : t('matched.unconditional')}
        />
        <Row label={t('matched.action')} value={match.action} />
      </dl>

      {trusted && (
        <Link
          to='/config'
          search={{ rule: match.index + 1 }}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {t('matched.open')}
        </Link>
      )}
    </section>
  );
}

/**
 * Причина — перевод по коду демона. Текст из ответа идёт в ход, только когда
 * код незнаком: он на языке демона, но объясняет больше, чем общая фраза.
 */
function unknownReason(t: TFunction<'widgets/RouteExplanation'>, match: RouteMatch): string {
  if (match.reasonCode !== null) {
    return t(REASON_KEY[match.reasonCode]);
  }

  return match.reason.length > 0 ? match.reason : t('unknown.missing');
}

function Unknown({ reason }: { reason: string }) {
  const { t } = useTranslation('widgets/RouteExplanation');
  return (
    <section className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <h3 className='text-sm font-medium'>{t('unknown.title')}</h3>
        <RouteOriginBadge origin={ROUTE_ORIGIN.Unknown} />
      </div>
      <p className='text-sm text-pretty text-muted-foreground'>{reason}</p>
    </section>
  );
}

function Chain({ nodes, origin }: { nodes: string[]; origin: RouteExplanationModel['chain']['origin'] }) {
  const { t } = useTranslation('widgets/RouteExplanation');
  if (nodes.length === 0) {
    return null;
  }

  return (
    <section className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <h3 className='text-sm font-medium'>{t('chain.title')}</h3>
        <RouteOriginBadge origin={origin} />
      </div>
      {/* Core отдаёт цепочку от конечного узла к группе — человек читает её
          в обратную сторону. */}
      <ol aria-label={t('chain.label')} className='flex flex-wrap items-center gap-1.5 font-mono text-xs'>
        {[...nodes].reverse().map((node) => (
          <li key={node} className='rounded-md bg-muted px-2 py-1'>
            {node}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Before({ rules }: { rules: RouteExplanationModel['rules'] }) {
  const { t } = useTranslation('widgets/RouteExplanation');
  return (
    <section className='flex flex-col gap-1.5'>
      <h3 className='text-sm font-medium'>{t('before.title')}</h3>
      <ul aria-label={t('before.label')} className='flex flex-col gap-1'>
        {rules.map((rule) => (
          <li key={rule.index} className='flex gap-2 font-mono text-xs text-muted-foreground'>
            <span className='shrink-0'>{rule.index + 1}</span>
            <span className='truncate'>
              {rule.conditions.length > 0 ? rule.conditions : t('matched.unconditional')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-1.5 first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='truncate font-mono text-xs'>{value}</dd>
    </div>
  );
}
