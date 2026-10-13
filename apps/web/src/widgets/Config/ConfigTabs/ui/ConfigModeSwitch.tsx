import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsList, TabsTrigger } from '@shared/ui';

import { CONFIG_MODE_ROUTE, CONFIG_MODES } from '../model';

/**
 * Whether the document is shown as forms or as text. The switch sits in the tab strip,
 * not in a corner of the header: both axes are visible at once, and it is clear that there are two modes — unlike
 * a one-way link, which reads as "leave here".
 *
 * The mechanism is the same as for sections — link tabs — but the look is segmented: this way
 * the second axis does not merge with the first.
 */
export function ConfigModeSwitch() {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = pathname === CONFIG_MODE_ROUTE.Text ? CONFIG_MODE_ROUTE.Text : CONFIG_MODE_ROUTE.Forms;

  return (
    <Tabs value={current} className='shrink-0'>
      <TabsList aria-label={t('mode.label')}>
        {CONFIG_MODES.map((mode) => (
          <TabsTrigger
            key={mode.key}
            value={mode.route}
            nativeButton={false}
            // By default `Link` compares the address by prefix and on /config/raw
            // would mark "Forms" as the current page too — two current modes at once.
            render={<Link to={mode.route} activeOptions={{ exact: true }} />}
          >
            {t(mode.label)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
