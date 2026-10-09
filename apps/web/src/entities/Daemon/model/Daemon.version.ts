import { SCHEMA_FORK_VERSION } from '@shared/api/generated';

/**
 * Версия форка, из которой собраны формы панели, без ведущей `v`: бинарь
 * печатает версию без неё, а тег форка — с ней.
 */
export const SCHEMA_VERSION = SCHEMA_FORK_VERSION.replace(/^v/, '');

/** Как бинарь на устройстве соотносится со схемой форм. */
export const SCHEMA_DRIFT = {
  None: 'none',
  /** Бинарь новее: полей его версии в формах нет. */
  Newer: 'newer',
  /** Бинарь старше: поле из форм он может не знать и отклонить при проверке. */
  Older: 'older',
} as const;

export type SchemaDrift = (typeof SCHEMA_DRIFT)[keyof typeof SCHEMA_DRIFT];

/**
 * Сравнивает версию бинаря со схемой по числам по порядку: версия форка
 * `1.14.1-extended-2.7.2` несёт и версию upstream, и версию форка.
 *
 * Неизвестная версия расхождением не считается — предупреждать не о чем.
 */
export function schemaDrift(singboxVersion: string | undefined): SchemaDrift {
  if (singboxVersion === undefined || singboxVersion === '') {
    return SCHEMA_DRIFT.None;
  }

  const binary = versionNumbers(singboxVersion);
  const schema = versionNumbers(SCHEMA_VERSION);

  for (let i = 0; i < Math.max(binary.length, schema.length); i++) {
    const delta = (binary[i] ?? 0) - (schema[i] ?? 0);

    if (delta !== 0) {
      return delta > 0 ? SCHEMA_DRIFT.Newer : SCHEMA_DRIFT.Older;
    }
  }

  return SCHEMA_DRIFT.None;
}

function versionNumbers(version: string): number[] {
  return (version.match(/\d+/g) ?? []).map(Number);
}
