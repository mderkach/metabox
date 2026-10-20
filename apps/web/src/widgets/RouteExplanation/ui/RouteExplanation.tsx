import { type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useFocusReturn } from '@shared/lib/useFocusReturn';
import { cn } from '@shared/lib/utils';
import { SURFACE } from '@shared/ui';

import { HEADING } from './RouteExplanation.styles';
import { RouteExplanationBody } from './RouteExplanationBody';
import { RouteExplanationHeader } from './RouteExplanationHeader';
import { RouteExplanationTitle } from './RouteExplanationTitle';

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
      <RouteExplanationHeader
        heading={
          <h2 ref={headingRef} tabIndex={-1} className={HEADING}>
            <RouteExplanationTitle host={host} source={source} />
          </h2>
        }
        actions={actions}
        onClose={onClose}
      />
      <RouteExplanationBody connectionId={connectionId} />
    </aside>
  );
}
