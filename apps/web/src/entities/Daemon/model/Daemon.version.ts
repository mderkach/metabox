import { SCHEMA_FORK_VERSION } from '@shared/api/generated';

/**
 * Версия форка, из которой собраны формы панели, без ведущей `v`: бинарь
 * печатает версию без неё, а тег форка — с ней.
 */
export const SCHEMA_VERSION = SCHEMA_FORK_VERSION.replace(/^v/, '');

/**
 * Знает ли бинарь на устройстве ровно те типы, что знают формы. Схема
 * собирается из одной версии форка: на версии постарше панель предложит поле,
 * которого бинарь не понимает, и `sing-box check` отклонит конфиг на Apply.
 *
 * Неизвестная версия расхождением не считается — предупреждать не о чем.
 */
export function matchesSchemaVersion(singboxVersion: string | undefined): boolean {
  if (singboxVersion === undefined || singboxVersion === '') {
    return true;
  }

  return singboxVersion.replace(/^v/, '') === SCHEMA_VERSION;
}
