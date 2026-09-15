import i18next from 'i18next';
import type { z } from 'zod';

export interface UnknownField {
  /** Путь узла, как его адресует правка: `route.rules.0`. Пусто — корень. */
  path: string;
  fields: string[];
}

function joinPath(prefix: string, path: PropertyKey[]): string {
  return [prefix, ...path.map(String)].filter((part) => part !== '').join('.');
}

/**
 * Узлы, которым не хватило только полей, которых схема не знает. `null` —
 * среди замечаний есть настоящая ошибка: неверный тип, пропущенное поле.
 *
 * Схемы строгие, поэтому лишнее поле — это замечание, а не тишина. Но схема
 * собрана из релизной сборки форка и заведомо знает меньше бинаря: узел с
 * незнакомым полем панель помечает и правит текстом, а не объявляет ошибкой.
 *
 * Union разворачивается: правило описано вариантами, и лишний ключ приходит не
 * отказом по ключу, а `invalid_union` с замечаниями каждой ветки. Узел
 * считается всего лишь незнакомым, если хоть одной ветке помешали только
 * лишние поля, — значит по остальным полям он схеме подходит.
 */
export function toUnknownFields(issues: readonly z.core.$ZodIssue[], prefix = ''): UnknownField[] | null {
  const fields: UnknownField[] = [];

  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      fields.push({ path: joinPath(prefix, issue.path), fields: issue.keys });

      continue;
    }

    if (issue.code !== 'invalid_union') {
      return null;
    }

    const branch = issue.errors
      .map((errors) => toUnknownFields(errors, joinPath(prefix, issue.path)))
      .find((collected) => collected !== null);

    if (branch === undefined) {
      return null;
    }

    fields.push(...branch);
  }

  return fields;
}

/** Замечания схемы человеческим текстом: путь узла и что с ним не так. */
export function describeIssues(issues: readonly z.core.$ZodIssue[]): string[] {
  const unknown = toUnknownFields(issues);

  if (unknown !== null) {
    return unknown.map((item) => {
      const fields = item.fields.join(', ');

      return item.path === ''
        ? i18next.t('schema.unknownFields', { ns: 'shared', fields })
        : i18next.t('schema.unknownFieldsAt', { ns: 'shared', path: item.path, fields });
    });
  }

  return issues.map((issue) =>
    i18next.t('schema.issue', { ns: 'shared', path: issue.path.join('.'), message: issue.message })
  );
}
