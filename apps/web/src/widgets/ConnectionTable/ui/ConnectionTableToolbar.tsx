import { type ReactNode } from 'react';

import { type ConnectionView } from '../lib';
import { ConnectionColumnPicker } from './ConnectionColumnPicker';
import { ConnectionDensityToggle } from './ConnectionDensityToggle';
import { ConnectionRefreshSelect } from './ConnectionRefreshSelect';

export function ConnectionTableToolbar({
  view,
  search = null,
  actions = null,
  facets = null,
}: {
  /** List view: it survives a reload, so it lives outside the table. */
  view: ConnectionView;
  /** Search: left edge of the toolbar. */
  search?: ReactNode;
  /** List actions: they live in the table card, not in the page header. */
  actions?: ReactNode;
  /**
   * Facets: in the search row. At a narrow width they go on a separate row under
   * the toolbar and scroll horizontally instead of wrapping as a cloud.
   */
  facets?: ReactNode;
}) {
  return (
    <div className='flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3.5 py-2.5'>
      {search}
      {facets}
      <span className='grow' />
      {/* Below md rows are cards: they have neither columns nor density. */}
      <div className='flex items-center gap-2 max-md:hidden'>
        <ConnectionColumnPicker view={view} />
        <ConnectionDensityToggle density={view.density} onDensityChange={view.setDensity} />
      </div>
      <ConnectionRefreshSelect interval={view.interval} onIntervalChange={view.setInterval} />
      {actions}
    </div>
  );
}
