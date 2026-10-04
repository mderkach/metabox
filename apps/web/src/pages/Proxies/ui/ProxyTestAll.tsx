import { useTranslation } from 'react-i18next';

import type { ProxyGroup } from '@entities/Proxy';
import { useTestProxyDelay } from '@features/Proxy/ProxyDelay';
import { Button } from '@shared/ui';

/**
 * Замер по всем группам сразу.
 *
 * Стоит в шапке экрана, а не в карточке: карточная кнопка работает со своей
 * группой, и действие над всеми ими в одну из них не помещается.
 */
export function ProxyTestAll({
  groups,
  onTested,
}: {
  groups: ProxyGroup[];
  /** Замер прошёл во всех группах: отказ хотя бы одной показывает тост ошибки. */
  onTested: () => void;
}) {
  const { t } = useTranslation('pages/Proxies');
  const delay = useTestProxyDelay();

  return (
    <Button
      variant='outline'
      size='sm'
      disabled={groups.length === 0 || delay.isPending}
      onClick={() => {
        // Колбэк `mutate` срабатывает только у последнего вызова, поэтому
        // объявление ждёт все замеры сразу, а не последний начатый.
        void Promise.allSettled(groups.map(async (group) => delay.mutateAsync(group.name))).then(
          function announceTested(results) {
            if (results.every((result) => result.status === 'fulfilled')) {
              onTested();
            }
          }
        );
      }}
    >
      {delay.isPending ? t('delay.testing', { ns: 'shared' }) : t('testAll.action')}
    </Button>
  );
}
