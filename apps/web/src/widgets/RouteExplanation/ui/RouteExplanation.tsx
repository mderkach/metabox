import { Link } from '@tanstack/react-router';
import type { ParseKeys, TFunction } from 'i18next';
import { X } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { deviceLabel, useDeviceIndex } from '@entities/Device';
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
  SECTION_HEADING,
  SURFACE,
  SHEET_BOTTOM,
  SURFACE_HEAD,
  Sheet,
  SheetContent,
  SheetTitle,
  SkeletonRows,
  buttonVariants,
} from '@shared/ui';

import { useRouteExplanationState } from '../lib/RouteExplanation.lib';
import { RouteOriginBadge } from './RouteOriginBadge';

/** The table must cover the daemon's set: a new code is a compile error here. */
const REASON_KEY: Readonly<Record<RouteReasonCode, ParseKeys<'widgets/RouteExplanation'>>> = {
  not_in_process_list: 'unknown.reason.not_in_process_list',
};

/**
 * The title gets focus when the panel opens. The ring needs a gap, like on a
 * button: inner padding moves it away from the text, and a negative margin
 * keeps the text in place.
 */
const HEADING = cn(
  '-mx-1.5 -my-0.5 flex min-w-0 grow flex-col rounded-md px-1.5 py-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
  SECTION_HEADING
);

/**
 * The explanation is built on observable core data: the rule list and the rule
 * that hit come from sing-box, not derived by the panel. The reason
 * the previous rules did not match is not computed: every
 * statement on the screen shows its origin, and a guess is not presented as fact.
 */
export function RouteExplanation({
  id,
  connectionId,
  host,
  source,
  actions = null,
  onClose,
}: {
  id?: string;
  connectionId: string;
  /** Destination node: the panel must name the connection it describes. */
  host: string;
  /** Source address; the panel names it by the device label. */
  source: string;
  /** Actions on the connection: header, before the close button. */
  actions?: ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/RouteExplanation');
  const headingRef = useFocusReturn<HTMLHeadingElement>();

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  return (
    // Escape closes the panel: a handler on the container is a common pattern for
    // panels and dialogs, an interactive role on aside is not needed for it.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <aside
      id={id}
      aria-label={t('titleFor', { host })}
      onKeyDown={onKeyDown}
      className={cn('flex w-full max-w-md shrink-0 flex-col overflow-hidden', SURFACE)}
    >
      <Header
        heading={
          <h2 ref={headingRef} tabIndex={-1} className={HEADING}>
            <Title host={host} source={source} />
          </h2>
        }
        actions={actions}
        onClose={onClose}
      />
      <Body connectionId={connectionId} />
    </aside>
  );
}

/**
 * The same explanation as a sheet on top of the list — for a screen where there is no room for a panel
 * beside the list. Escape, a click outside and the close button call `onClose`, as
 * for the panel.
 */
export function RouteExplanationSheet({
  id,
  connectionId,
  host,
  source,
  onClose,
}: {
  id?: string;
  /** `null` means no connection is selected, the sheet is closed. */
  connectionId: string | null;
  host: string;
  source: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/RouteExplanation');
  // The sheet slides away with an animation after the selection is reset and all that time
  // shows the last connection, not emptiness.
  const [shown, setShown] = useState({ connectionId, host, source });

  if (connectionId !== null && (connectionId !== shown.connectionId || host !== shown.host)) {
    setShown({ connectionId, host, source });
  }

  // The sheet height is set, not taken from content: the body arrives by request,
  // and a sheet that grew from a skeleton to the explanation would jerk mid-slide.
  return (
    <Sheet
      open={connectionId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent
        id={id}
        side='bottom'
        showCloseButton={false}
        className={cn(SHEET_BOTTOM, 'max-h-[85svh] min-h-[85svh] gap-0')}
      >
        <Header
          heading={
            // Base UI takes the sheet name from the title, while the visible text would glue
            // the label to the node without a space.
            <SheetTitle aria-label={t('titleFor', { host: shown.host })} className={HEADING}>
              <Title host={shown.host} source={shown.source} />
            </SheetTitle>
          }
          onClose={onClose}
        />
        {shown.connectionId !== null && <Body connectionId={shown.connectionId} />}
      </SheetContent>
    </Sheet>
  );
}

function Header({
  heading,
  actions = null,
  onClose,
}: {
  heading: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation('widgets/RouteExplanation');

  return (
    <header className={cn('flex items-center gap-2.5', SURFACE_HEAD)}>
      {heading}
      {actions}
      <Button variant='outline' size='icon-sm' aria-label={t('close')} onClick={onClose}>
        <X />
      </Button>
    </header>
  );
}

function Title({ host, source }: { host: string; source: string }) {
  const { t } = useTranslation('widgets/RouteExplanation');
  const devices = useDeviceIndex();

  return (
    <>
      {t('title')}
      <span className='truncate font-mono text-xs font-normal text-muted-foreground'>{host}</span>
      {source !== '' && (
        <span className='truncate text-xs font-normal text-muted-foreground' title={source}>
          {t('from', { device: deviceLabel(source, devices) })}
        </span>
      )}
    </>
  );
}

function Body({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation('widgets/RouteExplanation');
  const state = useRouteExplanationState(connectionId);

  return (
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

  // The node number is shown only when the lists match: in a foreign document
  // it would point to a different rule, and a guess must not be presented as fact.
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
          label={t('rule.conditions', { ns: 'shared' })}
          value={match.conditions.length > 0 ? match.conditions : t('rule.unconditional', { ns: 'shared' })}
        />
        <Row label={t('matched.action')} value={match.action} />
      </dl>

      {trusted && (
        <Link
          to='/config'
          search={{ rule: match.index + 1 }}
          // Styled as a button but stays a link: `Button` with `render` puts
          // `role="button"` on top of `<a href>` even with `nativeButton={false}`.
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          {t('matched.open')}
        </Link>
      )}
    </section>
  );
}

/**
 * The reason is a translation by the daemon code. Text from the response is used only when the
 * code is unfamiliar: it is in the daemon's language, but explains more than a generic phrase.
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
              {rule.conditions.length > 0 ? rule.conditions : t('rule.unconditional', { ns: 'shared' })}
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
