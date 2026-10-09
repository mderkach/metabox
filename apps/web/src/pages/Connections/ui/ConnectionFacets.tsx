import { useNarrowScreen } from '@shared/lib/media';

import type { ConnectionsScreen } from '../lib';
import { ConnectionFacetsPopover } from './ConnectionFacetsPopover';
import { ConnectionKindFacet } from './ConnectionKindFacet';
import { ConnectionSourceFacet } from './ConnectionSourceFacet';

/**
 * Срезы по вопросу экрана: «чьё оно» и «куда ушло». На настольной ширине —
 * вторая строка тулбара, на телефоне — под кнопкой в самом тулбаре.
 */
export function ConnectionFacets({ screen }: { screen: ConnectionsScreen }) {
  const narrow = useNarrowScreen();
  const active = (screen.source === null ? 0 : 1) + (screen.kind === null ? 0 : 1);

  const chips = (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <ConnectionSourceFacet
        groups={screen.sources}
        total={screen.total}
        source={screen.source}
        sourceLabel={screen.sourceLabel}
        onSourceChange={screen.setSource}
      />
      <ConnectionKindFacet groups={screen.kinds} kind={screen.kind} onKindChange={screen.setKind} />
    </div>
  );

  return narrow ? <ConnectionFacetsPopover active={active}>{chips}</ConnectionFacetsPopover> : chips;
}
