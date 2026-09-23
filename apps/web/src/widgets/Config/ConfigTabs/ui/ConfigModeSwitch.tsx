import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsList, TabsTrigger } from '@shared/ui';

import { CONFIG_MODE_ROUTE, CONFIG_MODES } from '../model';

/**
 * Формами документ показан или текстом. Переключатель стоит в полосе вкладок,
 * а не в углу шапки: обе оси видны сразу, и видно, что режима два, — в отличие
 * от односторонней ссылки, которая читается как «уйти отсюда».
 *
 * Механизм тот же, что у секций, — вкладки-ссылки, — а вид сегментный: так
 * вторая ось не сливается с первой.
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
            // По умолчанию `Link` сравнивает адрес по префиксу и на /config/raw
            // помечал бы текущей страницей и «Формы» — два текущих режима разом.
            render={<Link to={mode.route} activeOptions={{ exact: true }} />}
          >
            {t(mode.label)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
