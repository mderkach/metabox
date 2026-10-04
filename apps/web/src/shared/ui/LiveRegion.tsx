import { useTranslation } from 'react-i18next';

import type { LiveMessage } from '../lib/useLiveRegion';

/**
 * Живая область: результат действия, который скринридер прочтёт сам, не
 * уводя фокус. Состояние держит `useLiveRegion` из `shared/lib` на экране. Тост её не заменяет — тост показ, а не объявление, и `sonner`
 * объявляет только себя.
 *
 * Область стоит в разметке заранее и пустой: скринридер следит за изменениями
 * уже существующей области, а появившуюся вместе с текстом пропускает. Текст
 * лежит в узле с ключом объявления — повтор того же текста меняет узел, и
 * объявление звучит снова.
 *
 * Имя у области своё: на экране рядом стоят другие статусы — состояние потока,
 * загрузка, — и по имени её находит и тест, и скринридер в списке областей.
 */
export function LiveRegion({ message }: { message: LiveMessage | null }) {
  const { t } = useTranslation('shared');

  return (
    <div role='status' aria-live='polite' aria-atomic='true' aria-label={t('liveRegion.label')} className='sr-only'>
      {message !== null && <span key={message.id}>{message.text}</span>}
    </div>
  );
}
