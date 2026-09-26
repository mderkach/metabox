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
 * отбитый табами.
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
 * разобранной модели нельзя.
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
 * списке: одно незнакомое правило не должно прятать остальные.
 */
export function readRules(text: string): unknown[] {
  const rules: unknown = findValue(text, RULES_PATH);

  return Array.isArray(rules) ? rules : [];
}

/** Где в документе лежат наборы правил. */
export const RULE_SETS_PATH: JSONPath = ['route', 'rule_set'];

/** Путь узла набора по его позиции в списке, считая с нуля. */
export function ruleSetNodePath(index: number): JSONPath {
  return [...RULE_SETS_PATH, index];
}

/** Наборы документа как есть; узел, не принятый схемой, из списка не выпадает. */
export function readRuleSets(text: string): unknown[] {
  const sets: unknown = findValue(text, RULE_SETS_PATH);

  return Array.isArray(sets) ? sets : [];
}

/** Где лежит кэш наборов: без него недоступный поставщик обрывает старт. */
export const CACHE_FILE_PATH: JSONPath = ['experimental', 'cache_file', 'enabled'];

/** Включён ли кэш наборов в документе. */
export function hasRuleSetCache(text: string): boolean {
  return findValue(text, CACHE_FILE_PATH) === true;
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

interface TaggedOutbound {
  tag: string;
  node: object;
}

/**
 * Аутбаунды документа, у которых есть тег. Узлы читаются как есть, а не через
 * схему: документ может не пройти разбор целиком, а список узлов нужен и тогда.
 */
function toTaggedOutbounds(config: ConfigDocument | null): TaggedOutbound[] {
  const outbounds: unknown = config?.outbounds;

  if (!Array.isArray(outbounds)) {
    return [];
  }

  const tagged: TaggedOutbound[] = [];

  for (const item of outbounds) {
    const node: unknown = item;

    if (typeof node !== 'object' || node === null) {
      continue;
    }

    const tag: unknown = Reflect.get(node, 'tag');

    if (typeof tag === 'string' && tag.length > 0) {
      tagged.push({ tag, node });
    }
  }

  return tagged;
}

/** Теги аутбаундов документа; узел без тега пропускается. */
export function toOutboundTags(config: ConfigDocument | null): string[] {
  return toTaggedOutbounds(config).map((outbound) => outbound.tag);
}

/**
 * Тип аутбаунда по его тегу. Тип — единственное точное указание на то, куда
 * узел ведёт трафик: тег пишет пользователь, и по имени судить о нём нельзя
 *. Что тип означает для интерфейса, решает потребитель карты.
 *
 * Узел без тега или без типа в карту не попадает: сослаться на него нечем.
 */
export function toOutboundTypes(config: ConfigDocument | null): ReadonlyMap<string, string> {
  const types = new Map<string, string>();

  for (const outbound of toTaggedOutbounds(config)) {
    const type: unknown = Reflect.get(outbound.node, 'type');

    if (typeof type === 'string' && type.length > 0) {
      types.set(outbound.tag, type);
    }
  }

  return types;
}

/** Запись истории конфига в виде, в котором её показывает экран. */
export interface ConfigVersion {
  id: number;
  size: number;
  sum: string;
  /**
   * Версия совпадает с файлом на устройстве байт в байт. Таких может быть
   * несколько: демон отбрасывает повтор только относительно свежей записи.
   */
  current: boolean;
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
