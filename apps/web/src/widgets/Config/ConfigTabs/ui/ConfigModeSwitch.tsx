import { Link, useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { cn } from '@shared/lib/utils';

import {
  CONFIG_MODE_ACTIVE,
  CONFIG_MODE_GROUP,
  CONFIG_MODE_IDLE,
  CONFIG_MODE_ITEM,
  CONFIG_MODE_ROUTE,
  CONFIG_MODES,
} from '../model';

/**
 * Формами документ показан или текстом. Переключатель стоит в полосе вкладок,
 * а не в углу шапки: обе оси видны сразу, и видно, что режима два, — в отличие
 * от односторонней ссылки, которая читается как «уйти отсюда».
 */
export function ConfigModeSwitch() {
  const { t } = useTranslation('widgets/Config/ConfigTabs');
  // Режим берётся из текущего адреса, а не из завершённого: `Link` помечает
  // активную ссылку `aria-current` сам и считает активность по текущему адресу.
  // Посчитанная по завершённому вторая пометка на время перехода дала бы два
  // текущих режима разом.
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = pathname === CONFIG_MODE_ROUTE.Text ? CONFIG_MODE_ROUTE.Text : CONFIG_MODE_ROUTE.Forms;

  return (
    <nav aria-label={t('mode.label')} className={CONFIG_MODE_GROUP}>
      {CONFIG_MODES.map((mode) => (
        <Link
          key={mode.key}
          to={mode.route}
          activeOptions={{ exact: true }}
          aria-current={mode.route === current ? 'page' : undefined}
          className={cn(CONFIG_MODE_ITEM, mode.route === current ? CONFIG_MODE_ACTIVE : CONFIG_MODE_IDLE)}
        >
          {t(mode.label)}
        </Link>
      ))}
    </nav>
  );
}
