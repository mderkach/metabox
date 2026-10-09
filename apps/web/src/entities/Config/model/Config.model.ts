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

/**
 * Теги наборов документа — то, на что может сослаться правило. Узел без тега
 * пропускается: сослаться на него нечем.
 */
export function readRuleSetTags(text: string): string[] {
  return readRuleSets(text)
    .map((node): unknown => (typeof node === 'object' && node !== null ? Reflect.get(node, 'tag') : undefined))
    .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);
}

/** Где лежит кэш наборов: без него недоступный поставщик обрывает старт. */
export const CACHE_FILE_PATH: JSONPath = ['experimental', 'cache_file', 'enabled'];

/** Включён ли кэш наборов в документе. */
export function hasRuleSetCache(text: string): boolean {
  return findValue(text, CACHE_FILE_PATH) === true;
}

/**
 * Документ конфига в модели приложения. Имя своё, а не из форка: переименование
 * типа в схеме правится здесь, а не в каждом экране, который документ читает.
 */
export type ConfigDocument = Config;

/** Секции документа, которые панель перечисляет вкладками. */
export const CONFIG_SECTION = {
  Route: 'route',
  RuleSet: 'ruleSet',
  Inbounds: 'inbounds',
  Outbounds: 'outbounds',
  Providers: 'providers',
  Endpoints: 'endpoints',
  Dns: 'dns',
  DnsRules: 'dnsRules',
  Services: 'services',
  Ntp: 'ntp',
  Certificate: 'certificate',
  CertificateProviders: 'certificateProviders',
  HttpClients: 'httpClients',
  NetworkNamespaces: 'networkNamespaces',
  Log: 'log',
  Experimental: 'experimental',
} as const;

export type ConfigSection = (typeof CONFIG_SECTION)[keyof typeof CONFIG_SECTION];

/**
 * Секции без собственного экрана: где лежат их узлы и правятся ли они
 * списком. У `route` и `ruleSet` свои экраны, здесь их нет; `dns` разложен на
 * списки серверов и правил — его скалярные поля правятся текстовым режимом.
 */
export const GENERIC_SECTIONS = {
  [CONFIG_SECTION.Inbounds]: { kind: 'list', path: ['inbounds'] },
  [CONFIG_SECTION.Outbounds]: { kind: 'list', path: ['outbounds'] },
  [CONFIG_SECTION.Providers]: { kind: 'list', path: ['providers'] },
  [CONFIG_SECTION.Endpoints]: { kind: 'list', path: ['endpoints'] },
  [CONFIG_SECTION.Dns]: { kind: 'list', path: ['dns', 'servers'] },
  [CONFIG_SECTION.DnsRules]: { kind: 'list', path: ['dns', 'rules'] },
  [CONFIG_SECTION.Services]: { kind: 'list', path: ['services'] },
  [CONFIG_SECTION.Ntp]: { kind: 'object', path: ['ntp'] },
  [CONFIG_SECTION.Certificate]: { kind: 'object', path: ['certificate'] },
  [CONFIG_SECTION.CertificateProviders]: { kind: 'list', path: ['certificate_providers'] },
  [CONFIG_SECTION.HttpClients]: { kind: 'list', path: ['http_clients'] },
  [CONFIG_SECTION.NetworkNamespaces]: { kind: 'list', path: ['network_namespaces'] },
  [CONFIG_SECTION.Log]: { kind: 'object', path: ['log'] },
  [CONFIG_SECTION.Experimental]: { kind: 'object', path: ['experimental'] },
} as const satisfies Partial<Record<ConfigSection, { kind: 'list' | 'object'; path: JSONPath }>>;

export type GenericSection = keyof typeof GENERIC_SECTIONS;

export function isGenericSection(value: string): value is GenericSection {
  return value in GENERIC_SECTIONS;
}

/**
 * Узлы секции как есть, из текста: узел, который схема не приняла, из списка
 * не выпадает. Секция-объект отдаёт один узел; той, которой в файле нет, —
 * пустой список.
 */
export function readSectionNodes(text: string, section: GenericSection): unknown[] {
  const shape = GENERIC_SECTIONS[section];
  const value = findValue(text, shape.path);

  if (shape.kind === 'object') {
    return value === undefined ? [] : [value];
  }

  return Array.isArray(value) ? value : [];
}

/** Путь узла секции по его позиции; у секции-объекта позиция одна. */
export function sectionNodePath(section: GenericSection, index: number): JSONPath {
  const shape = GENERIC_SECTIONS[section];

  return shape.kind === 'object' ? shape.path : [...shape.path, index];
}

/**
 * Значение по пути в разобранном документе; `undefined` — узла нет.
 *
 * Документ идёт как есть, а не через схему: узел, который схема не приняла,
 * тоже читается.
 */
export function readPath(config: ConfigDocument, path: readonly string[]): unknown {
  let node: unknown = config;

  for (const key of path) {
    node = typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined;
  }

  return node;
}

/**
 * Сколько элементов в секции; `null` — считать нечего: у секции-объекта
 * списка нет.
 *
 * Адресация узлов документа живёт в слайсе-владельце: иначе переименование
 * секции в форке правилось бы по всем экранам, которые её показывают.
 */
export function sectionSize(config: ConfigDocument | null, section: ConfigSection): number | null {
  if (config === null) {
    return null;
  }

  if (section === CONFIG_SECTION.Route) {
    return config.route?.rules?.length ?? 0;
  }

  if (section === CONFIG_SECTION.RuleSet) {
    return config.route?.rule_set?.length ?? 0;
  }

  const shape = GENERIC_SECTIONS[section];

  if (shape.kind === 'object') {
    return null;
  }

  const nodes = readPath(config, shape.path);

  return Array.isArray(nodes) ? nodes.length : 0;
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
 * Куда уходит трафик, не попавший ни под одно правило: `route.final`, а без
 * него — первый аутбаунд, как решает sing-box. `null` — документа нет или
 * схема его не приняла, либо в нём нет ни того, ни другого.
 */
export function toFinalOutbound(config: ConfigDocument | null): string | null {
  const final = config?.route?.final;

  if (final !== undefined && final.length > 0) {
    return final;
  }

  return toOutboundTags(config).at(0) ?? null;
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

/**
 * Применение со списками отклонено до записи: служба sing-box резолвит
 * относительный путь файла списка от своего рабочего каталога, а он не совпал
 * с каталогом конфига.
 */
export interface WorkdirMismatch {
  workdir: string;
  configDir: string;
}
