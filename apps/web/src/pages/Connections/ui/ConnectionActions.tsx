import { useTranslation } from 'react-i18next';

import { Button, Separator } from '@shared/ui';

import { ConnectionCloseAll } from './ConnectionCloseAll';

/**
 * Действия над списком. Стоят в тулбаре таблицы, а не в шапке страницы: они
 * работают с её строками, и на расстоянии связь не читается.
 *
 * «Закрыть все» отделено разделителем: пауза ничего не меняет на устройстве, а
 * это рвёт живые соединения. Когда рвать нечего, кнопка гаснет, но остаётся на
 * месте: после подтверждения диалог возвращает фокус на неё, и исчезни она
 * вместе с последним соединением — фокус упал бы на `body`.
 */
export function ConnectionActions({
  paused,
  onTogglePause,
  closableCount,
  onCloseAll,
}: {
  paused: boolean;
  onTogglePause: () => void;
  /** Сколько живых соединений оборвёт «Закрыть все»; `0` гасит кнопку, `null` — вкладка без живых соединений, действия нет. */
  closableCount: number | null;
  onCloseAll: () => void;
}) {
  const { t } = useTranslation('pages/Connections');

  return (
    <>
      <Button variant='outline' size='sm' onClick={onTogglePause}>
        {paused ? t('resume') : t('pause')}
      </Button>

      {closableCount !== null && (
        <>
          <Separator orientation='vertical' className='mx-0.5 h-5' />
          <ConnectionCloseAll count={closableCount} disabled={closableCount === 0} onConfirm={onCloseAll} />
        </>
      )}
    </>
  );
}
