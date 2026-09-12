import {
  applyEdits,
  findNodeAtLocation,
  getNodeValue,
  modify,
  parseTree,
  type FormattingOptions,
  type JSONPath,
  type ModificationOptions,
} from 'jsonc-parser';

import type { Config } from '@shared/api/generated';

/** Отступ конфига, если определить его по файлу не удалось. */
const DEFAULT_TAB_SIZE = 2;

/** Первая строка с отступом: по ней видно, чем отбит файл. */
const FIRST_INDENT = /\n([\t ]+)\S/;

/**
 * Отступ и перевод строки исходного файла.
 *
 * `jsonc-parser` форматирует только вставляемые узлы и собственного определения
 * отступа не имеет: без этого новая секция встала бы двумя пробелами в файл,
 * отбитый табами (ADR-0004).
 */
function detectFormatting(text: string): FormattingOptions {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const indent = FIRST_INDENT.exec(text)?.[1];

  if (indent === undefined) {
    return { tabSize: DEFAULT_TAB_SIZE, insertSpaces: true, eol };
  }

  return { tabSize: indent.length, insertSpaces: !indent.startsWith('\t'), eol };
}

function edit(text: string, path: JSONPath, value: unknown, options?: ModificationOptions): string {
  return applyEdits(text, modify(text, path, value, { formattingOptions: detectFormatting(text), ...options }));
}

/**
 * Записывает значение по пути, не трогая остальной текст.
 *
 * Узла по пути может не быть — тогда он создаётся. Возвращается новый текст:
 * именно он уходит телом `POST /api/apply`, поэтому пересобирать конфиг из
 * разобранной модели нельзя (ADR-0004, AC-2).
 */
export function setValue(text: string, path: JSONPath, value: unknown): string {
  return edit(text, path, value);
}

/** Удаляет узел по пути: элемент массива или член объекта. */
export function removeValue(text: string, path: JSONPath): string {
  return edit(text, path, undefined);
}

/**
 * Читает значение узла по пути. `undefined` — узла нет.
 *
 * Нужно перемещению: элемент сначала вынимается из массива, потом вставляется
 * на новое место, и между двумя правками его значение надо где-то держать.
 */
export function findValue(text: string, path: JSONPath): unknown {
  const root = parseTree(text);

  if (root === undefined) {
    return undefined;
  }

  const node = findNodeAtLocation(root, path);

  return node === undefined ? undefined : getNodeValue(node);
}

/**
 * Вставляет элемент в массив на позицию из пути, вместо того чтобы переписать
 * тот, что там лежит.
 */
export function insertValue(text: string, path: JSONPath, value: unknown): string {
  return edit(text, path, value, { isArrayInsertion: true });
}

/**
 * Где в документе лежат правила маршрутизации. Адресация узлов конфига —
 * знание слайса Config: в экранах и формах оно расходилось бы копиями, и
 * промах на единицу в одной из них открывал бы соседнее правило.
 */
export const RULES_PATH: JSONPath = ['route', 'rules'];

/** Путь узла правила по его номеру в интерфейсе, считая с единицы. */
export function ruleNodePath(index: number): JSONPath {
  return [...RULES_PATH, index - 1];
}

/**
 * Правила документа как есть. Узел, который схема не приняла, остаётся в
 * списке: одно незнакомое правило не должно прятать остальные (UX-3).
 */
export function readRules(text: string): unknown[] {
  const rules: unknown = findValue(text, RULES_PATH);

  return Array.isArray(rules) ? rules : [];
}

/**
 * Документ конфига в модели приложения. Имя своё, а не из форка: переименование
 * типа в схеме правится здесь, а не в каждом экране, который документ читает
 * (PRD, A.2).
 */
export type ConfigDocument = Config;

/** Секции документа, которые панель перечисляет вкладками. */
export const CONFIG_SECTION = {
  Route: 'route',
  RuleSet: 'ruleSet',
  Inbounds: 'inbounds',
  Outbounds: 'outbounds',
  Providers: 'providers',
  Dns: 'dns',
  Log: 'log',
  Experimental: 'experimental',
} as const;

export type ConfigSection = (typeof CONFIG_SECTION)[keyof typeof CONFIG_SECTION];

/**
 * Сколько элементов в секции; `null` — считать нечего, у логов и экспериментов
 * списка нет.
 *
 * Адресация узлов документа живёт в слайсе-владельце: иначе переименование
 * секции в форке правилось бы по всем экранам, которые её показывают (PRD, A.2).
 */
export function sectionSize(config: ConfigDocument | null, section: ConfigSection): number | null {
  if (config === null) {
    return null;
  }

  switch (section) {
    case CONFIG_SECTION.Route:
      return config.route?.rules?.length ?? 0;
    case CONFIG_SECTION.RuleSet:
      return config.route?.rule_set?.length ?? 0;
    case CONFIG_SECTION.Inbounds:
      return config.inbounds?.length ?? 0;
    case CONFIG_SECTION.Outbounds:
      return config.outbounds?.length ?? 0;
    case CONFIG_SECTION.Providers:
      return config.providers?.length ?? 0;
    case CONFIG_SECTION.Dns:
      return config.dns?.servers?.length ?? 0;
    case CONFIG_SECTION.Log:
    case CONFIG_SECTION.Experimental:
      return null;
  }
}

/** Запись истории конфига в виде, в котором её показывает экран. */
export interface ConfigVersion {
  id: number;
  size: number;
  sum: string;
  /**
   * Миллисекунды эпохи; `null` — отметки времени нет: роутер стартует с эпохи,
   * и до синхронизации NTP дата сохранения врёт. Порядок всё равно задаёт
   * номер версии.
   *
   * Числом, а не `Date`: модель лежит в кэше Query, а structural sharing не
   * удерживает ссылку на объект вне plain-структур — список версий пересоздался
   * бы на каждый ответ, даже когда история не менялась.
   */
  savedAt: number | null;
}

export interface CheckFailure {
  stdout: string;
  stderr: string;
  exitCode: number;
}
