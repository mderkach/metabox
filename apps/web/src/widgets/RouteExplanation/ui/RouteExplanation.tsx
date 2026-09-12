import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';

import { ROUTE_MATCH, ROUTE_ORIGIN, type RouteExplanation as RouteExplanationModel } from '@entities/Route';
import { Alert, AlertDescription, AlertTitle, Button, buttonVariants } from '@shared/ui';

import { useRouteExplanationState } from '../lib/RouteExplanation.lib';
import { RouteOriginBadge } from './RouteOriginBadge';

/**
 * Объяснение строится на наблюдаемых данных core: список правил и сработавшее
 * правило приходят от sing-box, а не выводятся панелью (ADR-0007). Причина,
 * по которой не подошли предыдущие правила, не вычисляется: у каждого
 * утверждения на экране видно происхождение, и догадка не подаётся как факт.
 */
export function RouteExplanation({ connectionId, onClose }: { connectionId: string; onClose: () => void }) {
  const state = useRouteExplanationState(connectionId);

  return (
    <aside className='flex w-full max-w-md shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card'>
      <header className='flex items-center gap-2.5 border-b border-border px-4 py-3'>
        <h2 className='grow text-sm font-medium'>Маршрут соединения</h2>
        <Button variant='outline' size='icon-sm' aria-label='Закрыть объяснение' onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className='flex min-h-0 grow flex-col gap-3 overflow-y-auto p-4'>
        {state.isPending && <p className='text-sm text-muted-foreground'>Спрашиваю у sing-box…</p>}

        {state.explanation !== null && (
          <>
            <Matched explanation={state.explanation} trusted={state.trusted} compared={state.compared} />

            {state.compared && !state.trusted && (
              <Alert variant='destructive'>
                <AlertTitle>Процесс исполняет другой конфиг</AlertTitle>
                <AlertDescription>
                  У работающего sing-box правил {state.explanation.rules.length}, а в применённом файле{' '}
                  {state.inDocument}. Номер правила не показан: он указал бы в документ, которого процесс не читал.
                </AlertDescription>
              </Alert>
            )}

            {!state.compared && (
              <p className='text-xs text-pretty text-muted-foreground'>
                Применённый конфиг не прочитан, поэтому сверить список правил процесса не с чем — перехода к узлу нет.
              </p>
            )}

            <Chain nodes={state.explanation.chain.nodes} origin={state.explanation.chain.origin} />

            {state.before.length > 0 && <Before rules={state.before} />}

            <p className='text-xs text-pretty text-muted-foreground'>
              «От core» — данные работающего sing-box. Почему не сработали правила выше, панель не вычисляет: она не
              повторяет семантику правил, а арбитр маршрута — бинарь.
            </p>
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
  const { match } = explanation;

  if (match.kind === ROUTE_MATCH.Final) {
    return (
      <section className='flex flex-col gap-1.5'>
        <div className='flex items-center gap-2'>
          <h3 className='text-sm font-medium'>Ни одно правило не совпало</h3>
          <RouteOriginBadge origin={match.origin} />
        </div>
        <p className='text-sm text-muted-foreground'>
          Трафик ушёл в <code className='font-mono'>route.final</code> — исход по умолчанию, а не пропущенное правило.
        </p>
      </section>
    );
  }

  if (match.kind === ROUTE_MATCH.Unknown || match.index === null) {
    return <Unknown reason={match.reason.length > 0 ? match.reason : 'Правила соединения нет в списке процесса.'} />;
  }

  // Номер узла показывается только при сошедшихся списках: в чужом документе
  // он указал бы на другое правило, а это ровно та догадка, которую ADR-0007
  // запрещает подавать как факт.
  if (compared && !trusted) {
    return <Unknown reason='Список правил процесса разошёлся с применённым конфигом, узел определить нечем.' />;
  }

  return (
    <section className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <h3 className='text-sm font-medium'>Сработало правило {match.index + 1}</h3>
        <RouteOriginBadge origin={match.origin} />
      </div>

      <dl className='text-sm'>
        <Row label='Условия' value={match.conditions.length > 0 ? match.conditions : 'без условий'} />
        <Row label='Действие' value={match.action} />
      </dl>

      {trusted && (
        <Link
          to='/config'
          search={{ rule: match.index + 1 }}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Открыть правило в редакторе
        </Link>
      )}
    </section>
  );
}

function Unknown({ reason }: { reason: string }) {
  return (
    <section className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <h3 className='text-sm font-medium'>Правило не определено</h3>
        <RouteOriginBadge origin={ROUTE_ORIGIN.Unknown} />
      </div>
      <p className='text-sm text-pretty text-muted-foreground'>{reason}</p>
    </section>
  );
}

function Chain({ nodes, origin }: { nodes: string[]; origin: RouteExplanationModel['chain']['origin'] }) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <section className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-2'>
        <h3 className='text-sm font-medium'>Цепочка</h3>
        <RouteOriginBadge origin={origin} />
      </div>
      {/* Core отдаёт цепочку от конечного узла к группе — человек читает её
          в обратную сторону. */}
      <ol aria-label='Цепочка прокси' className='flex flex-wrap items-center gap-1.5 font-mono text-xs'>
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
  return (
    <section className='flex flex-col gap-1.5'>
      <h3 className='text-sm font-medium'>Правила выше не совпали</h3>
      <ul aria-label='Правила выше сработавшего' className='flex flex-col gap-1'>
        {rules.map((rule) => (
          <li key={rule.index} className='flex gap-2 font-mono text-xs text-muted-foreground'>
            <span className='shrink-0'>{rule.index + 1}</span>
            <span className='truncate'>{rule.conditions.length > 0 ? rule.conditions : 'без условий'}</span>
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
