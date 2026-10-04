import type { NodeRegistry } from '@entities/Config';
import { FIELD_KIND } from '@shared/lib/schemaShape';

/** Коды отказа проверок оверрайда поверх схемы: текст по ним подставляет `ui`. */
export const NODE_OVERRIDE_ERROR = {
  Required: 'required',
  RealityPublicKey: 'realityPublicKey',
  RealityShortId: 'realityShortId',
} as const;

export type NodeOverrideError = (typeof NODE_OVERRIDE_ERROR)[keyof typeof NODE_OVERRIDE_ERROR];

/** Отказ проверки оверрайда: путь поля через точку и код. */
export interface NodeOverrideIssue {
  name: string;
  code: NodeOverrideError;
}

/** Вид поля, которым оверрайд подменяет вид из схемы. */
export interface NodeOverrideWidget {
  kind: typeof FIELD_KIND.Enum;
  /** Значения селекта; `''` — пустой пункт, «ключа нет». */
  options: string[];
}

/**
 * Рукописная настройка формы типа поверх автоформы (ADR-0035): поля и запись
 * те же, меняются порядок, вид отдельных полей и обязательность.
 */
export interface NodeOverride {
  /**
   * Поля сверху формы, по порядку; путь через точку. Остальные поля типа
   * уходят в свёрнутую группу «Дополнительно».
   */
  primary: string[];
  /** Поле → вид, которым оно рисуется вместо вида из схемы. */
  widgets?: Readonly<Partial<Record<string, NodeOverrideWidget>>>;
  /** Поля, без которых узел типа не работает, хотя схема их не требует. */
  required?: string[];
  /** Новый узел типа: то, без чего он не соберётся, уже заполнено. */
  preset?: (tag: string) => Record<string, unknown>;
  /**
   * Проверки, которых схема не знает: сверены с исходниками форка. `before` —
   * узел до правки: значение, которого пользователь не трогал, формат не
   * перепроверяет — арбитр ему `sing-box check` (ADR-0035), а форма не мешает
   * править соседнее поле узла, сохранённого другим инструментом.
   */
  refine?: (node: NodeValue, before: NodeValue) => NodeOverrideIssue[];
}

/** Значение узла, как его видит проверка: поля как есть, пустые выпали. */
type NodeValue = Readonly<Record<string, unknown>>;

/** Ключ таблицы оверрайдов: реестр и тип узла. */
export type NodeOverrideKey = `${NodeRegistry}/${string}`;

/**
 * Публичный ключ Reality: base64url без паддинга, 32 байта — 43 символа
 * (`base64.RawURLEncoding` и проверка длины в `common/tls/reality_client.go`
 * форка).
 */
const REALITY_PUBLIC_KEY = /^[\w-]{43}$/;

/** Short ID Reality: hex, не больше 8 байт; пусто — допустимо (`hex.Decode` в `[8]byte`). */
const REALITY_SHORT_ID = /^(?:[\da-f]{2}){0,8}$/i;

/** Отпечатки uTLS, которые знает форк (`uTLSClientHelloID` в `common/tls/utls_client.go`). */
const UTLS_FINGERPRINTS = [
  'chrome',
  'chrome_psk',
  'chrome_psk_shuffle',
  'chrome_padding_psk_shuffle',
  'chrome_pq',
  'chrome_pq_psk',
  'firefox',
  'edge',
  'safari',
  '360',
  'qq',
  'ios',
  'android',
  'random',
  'randomized',
];

/** Значение поля узла по пути через точку; `undefined` — поля нет. */
export function readField(node: NodeValue, name: string): unknown {
  let value: unknown = node;

  for (const key of name.split('.')) {
    value = typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
  }

  return value;
}

/** Пустое поле: его значение «ключа нет» (`compactNode`). */
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function requireFields(node: NodeValue, names: readonly string[]): NodeOverrideIssue[] {
  return names
    .filter((name) => isEmpty(readField(node, name)))
    .map((name) => ({ name, code: NODE_OVERRIDE_ERROR.Required }));
}

/** Строка поля не по шаблону; значение, равное прежнему, не перепроверяется. */
function checkPattern(
  node: NodeValue,
  before: NodeValue,
  name: string,
  pattern: RegExp,
  code: NodeOverrideError
): NodeOverrideIssue[] {
  const value = readField(node, name);

  return typeof value === 'string' && value !== readField(before, name) && !pattern.test(value) ? [{ name, code }] : [];
}

/**
 * VLESS с Reality — сценарий AC-6. Без порядка полей форма открывалась бы
 * двадцатью полями dial; ключи Reality проверяются так же, как их разбирает
 * клиент форка, иначе ошибка всплыла бы только на `sing-box check`.
 */
const VLESS_OVERRIDE: NodeOverride = {
  primary: [
    'tag',
    'server',
    'server_port',
    'uuid',
    'flow',
    'tls.server_name',
    'tls.utls.fingerprint',
    'tls.reality.public_key',
    'tls.reality.short_id',
  ],
  widgets: {
    // Форк включает Vision по префиксу `xtls-rprx-vision` (`protocol/vless/outbound.go`).
    flow: { kind: FIELD_KIND.Enum, options: ['', 'xtls-rprx-vision'] },
    'tls.utls.fingerprint': { kind: FIELD_KIND.Enum, options: UTLS_FINGERPRINTS },
  },
  // Без сервера, порта и UUID узел не собирается. Имя сервера и ключ Reality
  // нужны только Reality: VLESS с обычным TLS открывается той же формой.
  required: ['server', 'server_port', 'uuid'],
  // Reality без uTLS клиент форка не создаёт: `uTLS is required by reality client`.
  preset: (tag) => ({
    type: 'vless',
    tag,
    tls: { enabled: true, utls: { enabled: true, fingerprint: 'chrome' }, reality: { enabled: true } },
  }),
  refine: (node, before) => [
    ...(readField(node, 'tls.reality.enabled') === true
      ? requireFields(node, ['tls.server_name', 'tls.reality.public_key'])
      : []),
    ...checkPattern(node, before, 'tls.reality.public_key', REALITY_PUBLIC_KEY, NODE_OVERRIDE_ERROR.RealityPublicKey),
    ...checkPattern(node, before, 'tls.reality.short_id', REALITY_SHORT_ID, NODE_OVERRIDE_ERROR.RealityShortId),
  ],
};

/** Длина секрета службы `api` в байтах: 24 байта — 32 символа base64url. */
const API_SECRET_BYTES = 24;

/**
 * Случайный секрет: base64url без паддинга из криптографического генератора.
 * Пустой `secret` оставил бы gRPC-сервис форка открытым всем, кто достучится
 * до порта.
 */
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(API_SECRET_BYTES));

  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/**
 * Служба `api` — gRPC-сервис форка, единственная служба с формой (PRD, раздел
 * 8; ADR-0006). Слушает loopback: наружу демон его не открывает и сам к нему
 * ходит с той же машины. Порт не подставляется: 9090 по умолчанию занят Clash
 * API (флаг `-clash-port` демона), а свободный порт на устройстве форма не
 * знает, поэтому он обязателен. `dashboard` остаётся в «Дополнительно» JSON-текстом.
 */
const API_OVERRIDE: NodeOverride = {
  primary: ['tag', 'listen', 'listen_port', 'secret', 'access_control_allow_origin', 'tls'],
  required: ['listen_port'],
  preset: (tag) => ({ type: 'api', tag, listen: '127.0.0.1', secret: randomSecret() }),
};

/**
 * Оверрайды форм по типам. Тип без записи открывается автоформой, если её
 * разрешает политика реестра; запись добавляется сюда, а не веткой в рендерере.
 */
export const NODE_OVERRIDE: Readonly<Partial<Record<NodeOverrideKey, NodeOverride>>> = {
  'outbound/vless': VLESS_OVERRIDE,
  'service/api': API_OVERRIDE,
};

/** Оверрайд типа; `null` — тип открывается автоформой как есть. */
export function nodeOverrideOf(registry: NodeRegistry, type: string): NodeOverride | null {
  return NODE_OVERRIDE[`${registry}/${type}`] ?? null;
}

/** Есть ли у типа рукописный оверрайд: по нему открывают форму реестры без автоформы. */
export function hasNodeOverride(registry: NodeRegistry, type: string): boolean {
  return nodeOverrideOf(registry, type) !== null;
}

/**
 * Новый узел типа: заготовка оверрайда, а без неё — `fallback`, узел из типа и
 * тега. Заготовка заполняет только то, без чего тип не соберётся.
 */
export function nodePreset(
  registry: NodeRegistry,
  type: string,
  tag: string,
  fallback: (type: string, tag: string) => object
): object {
  return nodeOverrideOf(registry, type)?.preset?.(tag) ?? fallback(type, tag);
}

/**
 * Отказы проверок оверрайда на значении узла: обязательные поля и `refine`.
 * `node` — то, что ляжет в документ, с выпавшими пустыми полями; `before` —
 * узел до правки.
 */
export function overrideIssues(override: NodeOverride | null, node: NodeValue, before: NodeValue): NodeOverrideIssue[] {
  if (override === null) {
    return [];
  }

  return [...requireFields(node, override.required ?? []), ...(override.refine?.(node, before) ?? [])];
}
