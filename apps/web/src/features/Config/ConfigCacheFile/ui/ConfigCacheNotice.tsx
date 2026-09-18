import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CACHE_FILE_PATH, ConfigDocumentState } from '@entities/Config';
import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from '@shared/ui';

/**
 * Кэш наборов выключен, а в конфиге есть удалённый набор.
 *
 * Без кэша ядро при каждом старте идёт за набором в сеть, и недоступный
 * поставщик обрывает запуск целиком — не «правило не сработает», а маршрутизации
 * нет вовсе. Предупреждение относится к конфигу, а не к отдельному набору,
 * поэтому стоит над списком в одном экземпляре.
 *
 * Секцию панель не дописывает молча: правка чужого конфига без спроса — это то,
 * что запрещает UX-3, и кнопка кладёт её в тот же черновик, который пользователь
 * увидит дифом перед применением.
 */
export function ConfigCacheNotice() {
  const { t } = useTranslation('features/Config/ConfigCacheFile');
  const edit = ConfigDocumentState.use.edit();

  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>{t('description')}</AlertDescription>
      <AlertAction>
        <Button
          size='sm'
          onClick={() => {
            edit(CACHE_FILE_PATH, true);
          }}
        >
          {t('enable')}
        </Button>
      </AlertAction>
    </Alert>
  );
}
