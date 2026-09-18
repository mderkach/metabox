import { RULE_SET_FORMAT, RULE_SET_TYPE, SET_EXTENSION } from './RuleSet.constants';

export type RuleSetType = (typeof RULE_SET_TYPE)[keyof typeof RULE_SET_TYPE];
export type RuleSetFormat = (typeof RULE_SET_FORMAT)[keyof typeof RULE_SET_FORMAT];

/** Зеркало поставщика: до основного адреса из России дотягиваются не всегда. */
export interface RuleSetMirror {
  id: string;
  name: string;
  /** Начало адреса до имени файла, со слэшем на конце. */
  base: string;
}

export interface RuleSetProvider {
  id: string;
  name: string;
  /** Что за списки отдаёт: домены или адреса. */
  kind: 'domain' | 'ip';
  /** Приставка имени файла: `geosite-` + категория + `.srs`. */
  prefix: string;
  mirrors: RuleSetMirror[];
  /** Часто спрашиваемые категории, в порядке от общего к частному. */
  categories: string[];
}

/** Откуда приехал адрес набора: узнанный поставщик или чужой адрес. */
export interface RuleSetSource {
  /** Идентификатор поставщика из каталога; `null` — адрес собран не по шаблону. */
  providerId: string | null;
  /** Имя категории у поставщика; `null` — из адреса его не вынуть. */
  category: string | null;
}

export interface RuleSetRow {
  /** Позиция в `route.rule_set`: собственного идентификатора у наборов нет. */
  id: string;
  index: number;
  /** Имя набора: по нему на него ссылаются правила. Пустое — тега в узле нет. */
  tag: string;
  type: RuleSetType;
  /** `binary` или `source`; пустое — поле не задано, ядро решает само. */
  format: string;
  /** Адрес у `remote`, путь у `local`, пустая строка у `inline`. */
  location: string;
  source: RuleSetSource;
  /** Как часто ядро перекачивает набор; `null` — интервал не задан. */
  updateInterval: string | null;
  /** Через какой узел качать; `null` — напрямую. */
  detour: string | null;
  /**
   * Сколько правил маршрутизации ссылается на этот тег. Ноль означает, что
   * набор качается и занимает память, ни на что не влияя.
   */
  usedBy: number;
  /**
   * Узел принят схемой. Ложь — в нём есть поле, которого схема не знает:
   * показан он не полностью и правится текстом.
   */
  recognized: boolean;
}

/**
 * Формат, который ядро выведет из адреса само: `.srs` — бинарный, `.json` —
 * исходный. Пустая строка означает, что вывести не из чего и формат придётся
 * задать явно, иначе набор не прочитается.
 *
 * Правило повторяет `ruleSetDefaultFormat` форка. Повтор осознанный: панель
 * обязана знать, когда поле можно не писать, — записанное значение, равное
 * выведенному, добавило бы в диф правку, которой пользователь не делал (AC-2).
 */
export function defaultFormatOf(url: string): RuleSetFormat | '' {
  const path = url.split(/[?#]/u, 1)[0];

  if (path.endsWith(SET_EXTENSION.Binary)) {
    return RULE_SET_FORMAT.Binary;
  }

  return path.endsWith(SET_EXTENSION.Source) ? RULE_SET_FORMAT.Source : '';
}
