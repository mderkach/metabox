import type { JSONPath } from 'jsonc-parser';

/** Правка одного листа документа; `value: undefined` удаляет ключ. */
export interface NodeEdit {
  path: JSONPath;
  value: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Значение, каким оно ляжет в документ: пустая строка, пустой список и пустой
 * объект значат «ключа нет», у объекта выпадают пустые ключи. Форма держит
 * очищенное поле пустым, а черновик полей не добавляет.
 */
function compact(value: unknown): unknown {
  if (value === '' || (Array.isArray(value) && value.length === 0)) {
    return undefined;
  }

  if (!isRecord(value)) {
    return value;
  }

  const entries = Object.entries(value).flatMap(([key, item]) => {
    const next = compact(item);

    return next === undefined ? [] : [[key, next] as const];
  });

  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function isEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => isEqual(item, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);

    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && isEqual(left[key], right[key]))
    );
  }

  return false;
}

/**
 * Правки, которые переводят узел `before` в `after`: только изменившиеся листья.
 *
 * Объекты сравниваются по ключам, остальное — лист целиком: скаляр, массив,
 * значение на месте объекта. Так правка одного поля формы даёт одну строку
 * дифа, а комментарии и порядок ключей внутри узла остаются как были, —
 * запись узла целиком переписала бы его весь (ADR-0004).
 *
 * `base` — путь узла в документе, к нему приклеиваются ключи листьев.
 */
export function diffNode(base: JSONPath, before: unknown, after: unknown): NodeEdit[] {
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    return [...keys].flatMap((key) => diffNode([...base, key], before[key], after[key]));
  }

  const next = compact(after);

  if (compact(before) === undefined && next === undefined) {
    return [];
  }

  return isEqual(before, next) ? [] : [{ path: base, value: next }];
}
