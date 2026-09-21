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
 * Секцию панель не дописывает молча: чужой конфиг без спроса не правится, и
 * кнопка кладёт её в тот же черновик, который пользователь увидит дифом перед
 * применением.
 */
export function ConfigCacheNotice() {
  const { t } = useTranslation('features/Config/ConfigCacheFile');
  const edit = ConfigDocumentState.use.edit();

  return (
    <Alert variant='destructive' className='max-sm:pr-2.5'>
      <TriangleAlert />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>{t('description')}</AlertDescription>
      {/* Примитив ставит действие абсолютом в правый верхний угол; на узком
          экране оно наезжает на заголовок, поэтому там уходит в поток. */}
      <AlertAction className='static col-start-2 mt-2 justify-self-start sm:absolute sm:mt-0'>
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
