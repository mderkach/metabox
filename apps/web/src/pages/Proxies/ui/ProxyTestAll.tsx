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
export function ProxyTestAll({ groups }: { groups: ProxyGroup[] }) {
  const { t } = useTranslation('pages/Proxies');
  const delay = useTestProxyDelay();

  return (
    <Button
      variant='outline'
      size='sm'
      disabled={groups.length === 0 || delay.isPending}
      onClick={() => {
        for (const group of groups) {
          delay.mutate(group.name);
        }
      }}
    >
      {delay.isPending ? t('delay.testing', { ns: 'shared' }) : t('testAll.action')}
    </Button>
  );
}
