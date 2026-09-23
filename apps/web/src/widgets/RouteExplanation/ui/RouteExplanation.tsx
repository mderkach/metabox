import { Link } from '@tanstack/react-router';
import type { ParseKeys, TFunction } from 'i18next';
import { X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import {
  ROUTE_MATCH,
  ROUTE_ORIGIN,
  type RouteExplanation as RouteExplanationModel,
  type RouteMatch,
  type RouteReasonCode,
} from '@entities/Route';
import { useFocusReturn } from '@shared/lib/useFocusReturn';
import { cn } from '@shared/lib/utils';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  QueryFailure,
  SURFACE,
  SURFACE_HEAD,
  SkeletonRows,
  buttonVariants,
} from '@shared/ui';

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
export function RouteExplanation({
  id,
  connectionId,
  host,
  onClose,
}: {
  id?: string;
  connectionId: string;
  /** Узел назначения: панель обязана называть соединение, о котором рассказывает. */
  host: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/RouteExplanation');
  const state = useRouteExplanationState(connectionId);
  const headingRef = useFocusReturn<HTMLHeadingElement>();

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  return (
    // Escape закрывает панель: обработчик на контейнере — обычный паттерн для
    // панелей и диалогов, интерактивная роль aside для этого не нужна.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- см. выше
    <aside
      id={id}
      aria-label={t('titleFor', { host })}
      onKeyDown={onKeyDown}
      className={cn('flex w-full max-w-md shrink-0 flex-col overflow-hidden max-lg:max-h-[70vh]', SURFACE)}
    >
      <header className={cn('flex items-center gap-2.5', SURFACE_HEAD)}>
        <h2 ref={headingRef} tabIndex={-1} className='flex min-w-0 grow flex-col text-sm font-medium'>
          {t('title')}
          <span className='truncate font-mono text-xs font-normal text-muted-foreground'>{host}</span>
        </h2>
        <Button variant='outline' size='icon-sm' aria-label={t('close')} onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className='flex min-h-0 grow flex-col gap-3 overflow-y-auto p-4'>
        {state.isPending && <SkeletonRows rows={4} className='p-0' />}

        {state.query.isLoadingError && <QueryFailure messageKey='source.route' query={state.query} />}

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
          // Покрашена кнопкой, но остаётся ссылкой: `Button` с `render` ставит
          // `role="button"` поверх `<a href>` даже при `nativeButton={false}`.
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
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
