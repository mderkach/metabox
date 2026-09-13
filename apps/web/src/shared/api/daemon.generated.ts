// Сгенерировано apps/metaboxd/cmd/contractgen из контракта демона. Не
// редактировать: правится демон, файл пересобирается `make schema-daemon`.
//
// Схемы описывают форму ответа, но не переводят её: перевод и отказ живут в
// адаптерах слайсов (docs/adr/ADR-0005).

import { z } from 'zod'

/** Health — ответ `GET /healthz`. */
export const HealthSchema = z.object({
  status: z.string(),
  version: z.string(),
})

/** Transaction — снимок применения. Он же формат файла состояния: то, что демон отдаёт клиенту, и то, по чему доигрывает себя после перезагрузки. */
export const TransactionSchema = z.object({
  id: z.string(),
  phase: z.string(),
  /** Window — сколько осталось на подтверждение. Хранится длительностью, а не меткой времени: у роутера нет часов реального времени, после включения он стартует с эпохи и прыгает при синхронизации NTP (ADR-0002). */
  window: z.int(),
  /** Sum — sha256 конфига, записанного демоном. По нему ловится правка файла извне. */
  sha256: z.string().optional(),
  /** Reason заполняется, когда применение не дошло до конца. */
  reason: z.string().optional(),
  /** ClashAPIAdded отмечает, что демон сам добавил секцию (AC-32). */
  clash_api_added: z.boolean().optional(),
})

/** Status — ответ `GET /api/status`. */
export const StatusSchema = z.object({
  /** Version — версия демона; версия бинаря sing-box идёт отдельным полем. */
  version: z.string(),
  singbox_version: z.string().optional(),
  /** ConfigPath — файл, которым демон владеет: путь задаётся флагами запуска, и вычислить его на стороне панели нельзя. */
  config_path: z.string().optional(),
  transaction: TransactionSchema.optional(),
  /** TransactionHref — адрес идущего применения. Без него перезагрузка страницы теряет транзакцию: её идентификатор жил только в ответе на POST (ADR-0002). */
  transaction_href: z.string().optional(),
})

/** Version — запись истории. Содержимое конфига демон не разбирает (ADR-0002), поэтому наружу идут только номер, размер, отпечаток и отметка времени. */
export const VersionSchema = z.object({
  /** ID — монотонный номер. Время источником порядка быть не может: у роутера нет часов реального времени, он стартует с эпохи и прыгает при синхронизации NTP. */
  id: z.int(),
  /** Size — размер в байтах. */
  size: z.int(),
  /** Sum — sha256 содержимого. По нему видно, что версия совпадает с активным конфигом, без вычитывания обеих. */
  sum: z.string(),
  /** SavedAt — отметка времени файла, секунды Unix. Справочная: показывает часы устройства на момент сохранения и врёт, если они не синхронизованы. */
  saved_at: z.int(),
})

/** Versions — ответ `GET /api/config/versions`. */
export const VersionsSchema = z.object({
  versions: z.array(VersionSchema),
})

/** Service — ответ `GET /api/service` и того же вида событие потока: панель получает один формат независимо от источника (ADR-0010). */
export const ServiceSchema = z.object({
  status: z.string(),
  /** Uptime — секунды с момента старта. Ноль означает, что возраст узнать не удалось: панель показывает такое значение прочерком. */
  uptime: z.int(),
  /** Binary — версия бинаря на устройстве. Схему панель знает свою и сверяет расхождение сама. */
  binary: z.string(),
  /** Managed означает, что процессом владеет служба, которой управляет демон. Ложь при статусе `running` читается так: sing-box на устройстве работает, но поднят не ею — маршрутизацией владеет чужой пакет, и кнопки службы к этому процессу не относятся. */
  managed: z.boolean(),
  lastError: z.string().optional(),
})

/** Point — средняя скорость за шаг, байт в секунду. */
export const PointSchema = z.object({
  down: z.int(),
  up: z.int(),
})

/** DevicePoint — усреднённые показания платы за шаг. */
export const DevicePointSchema = z.object({
  /** Load — средняя загрузка за минуту, как её отдаёт ядро. */
  load: z.number(),
  /** Celsius — самая горячая зона платы; ноль означает, что зон нет. */
  celsius: z.number(),
  /** Memory — занятая память платы в байтах. */
  memory: z.int(),
})

/** History — ответ `GET /api/history`: трафик за всё время, что копил демон. Время точки не передаётся: часов у роутера до синхронизации NTP нет, и абсолютная метка соврала бы. Точки идут подряд с шагом StepSeconds, последняя — самая свежая, а подписи оси панель считает по своим часам. */
export const HistorySchema = z.object({
  step_seconds: z.int(),
  points: z.array(PointSchema),
  /** Device — показания платы тем же шагом: загрузка, температура, память. */
  device: z.array(DevicePointSchema),
})

/** Error — единый формат отказа на границе HTTP. Внутренние подробности — пути на диске, аргументы команд, содержимое конфига — в него не попадают; Details несёт только то, что показывают пользователю. */
export const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})

/** CheckDetails — вывод sing-box дословно. Единственное исключение из правила «внутренние подробности наружу не идут», и оно задано ADR-0002: на этих строках пользователь чинит конфиг. */
export const CheckDetailsSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.int(),
})

/** Load — средняя загрузка. Приводить её к процентам нельзя: это длина очереди на выполнение, и на четырёх ядрах значение 4.0 означает полную занятость. */
export const LoadSchema = z.object({
  one: z.number(),
  five: z.number(),
  fifteen: z.number(),
  /** Cores — сколько ядер видит система: без него значение не читается. */
  cores: z.int(),
})

/** Memory — память устройства в байтах. */
export const MemorySchema = z.object({
  total: z.int(),
  /** Available — то, что система готова отдать без свопа, а не `MemFree`: свободного на роутере мало всегда, кэш занимает остальное. */
  available: z.int(),
})

/** Zone — одна термозона ядра. */
export const ZoneSchema = z.object({
  /** Name — `type` зоны: на плате их бывает несколько, и различаются они им. */
  name: z.string(),
  /** Milli — тысячные доли градуса Цельсия, ровно как отдаёт ядро. */
  milli: z.int(),
})

/** Link — счётчики интерфейса с момента его подъёма, в байтах. */
export const LinkSchema = z.object({
  name: z.string(),
  rx: z.int(),
  tx: z.int(),
})

/** Share — сколько прошло через канал и через sing-box за время наблюдения. Доля считается делением одного на другое и осмысленна только вместе с Seconds: окно начинается, когда демон впервые снял показания. */
export const ShareSchema = z.object({
  link: z.int(),
  proxy: z.int(),
  seconds: z.int(),
})

/** Process — показания чужого процесса. */
export const ProcessSchema = z.object({
  pid: z.int(),
  /** RSS — резидентная память процесса в байтах. У sing-box она больше, чем `memory` из Clash API: тот отдаёт только память рантайма Go, а здесь весь процесс вместе с резидентным кодом бинаря. */
  rss: z.int(),
})

/** Daemon — показания самого metaboxd. */
export const DaemonSchema = z.object({
  rss: z.int(),
  heap: z.int(),
  goroutines: z.int(),
})

/** Stat — показания устройства на момент опроса. */
export const StatSchema = z.object({
  load: LoadSchema,
  memory: MemorySchema,
  /** Thermal пуст, когда термозон у платы нет. */
  thermal: z.array(ZoneSchema),
  /** Uplink пуст, когда маршрута по умолчанию нет. */
  uplink: LinkSchema.optional(),
  /** Share — объёмы канала и sing-box за время наблюдения демона. */
  share: ShareSchema,
  /** Singbox пуст, когда процесс не найден: маршрутизации на устройстве может не быть вовсе. */
  singbox: ProcessSchema.optional(),
  daemon: DaemonSchema,
  /** Uptime — секунды с загрузки устройства. */
  uptime: z.int(),
})

/** Connection — соединение в контракте демона. Форма панели не зависит от того, каким источником соединение прочитано (ADR-0006): Clash API и gRPC форка расходятся и в наборе полей, и в формате правила, поэтому сведение к одной модели делает демон, а не фронт. */
export const ConnectionSchema = z.object({
  id: z.string(),
  /** Host — адрес назначения с портом: имя, если его разобрал sniff, иначе адрес. Собирается здесь, потому что источники держат его по-разному. */
  host: z.string(),
  network: z.string(),
  source: z.string(),
  /** Rule — условия сработавшего правила. Пусто у правила без условий и у соединения, не совпавшего ни с одним (ADR-0007). */
  rule: z.string(),
  /** Action — исход правила. gRPC его не отдаёт вовсе, и там поле пустое. */
  action: z.string(),
  /** Final отмечает, что ни одно правило не совпало и сработал route.final. Без отдельного признака этот исход не отличить от правила без условий: у обоих условия пусты, а это разные вещи (ADR-0007). */
  final: z.boolean(),
  /** Chain — цепочка в порядке core: от конечного узла к группе. */
  chain: z.array(z.string()),
  upload: z.int(),
  download: z.int(),
  started_at: z.string(),
})

/** ConnectionsSnapshot — полный список живых соединений с итогами. */
export const ConnectionsSnapshotSchema = z.object({
  connections: z.array(ConnectionSchema),
  upload_total: z.int(),
  download_total: z.int(),
  memory: z.int(),
})

/** Event — конверт. Seq считается для каждого читателя отдельно и растёт без пропусков, пока события доходят: разрыв в номерах означает, что читатель не успевал и событие было отброшено. */
export const EventSchema = z.object({
  topic: z.string(),
  seq: z.int(),
  data: z.unknown(),
})

/** Match — сработавшее правило. Index отдаётся указателем: ноль — валидный индекс, и отличить его от «индекса нет» иначе нельзя. */
export const MatchSchema = z.object({
  origin: z.string(),
  kind: z.string(),
  index: z.int().optional(),
  conditions: z.string().optional(),
  action: z.string().optional(),
  /** Reason заполняется только у Kind == KindUnknown. */
  reason: z.string().optional(),
})

/** Chain — цепочка прокси соединения в том порядке, в каком её отдаёт core: от конечного узла к группе. */
export const ChainSchema = z.object({
  origin: z.string(),
  nodes: z.array(z.string()),
})

/** Rule — правило работающего процесса. Индекс равен индексу узла в route.rules применённого документа: роутер строит список циклом по конфигу один к одному (ADR-0007). */
export const RuleSchema = z.object({
  origin: z.string(),
  index: z.int(),
  type: z.string(),
  conditions: z.string(),
  action: z.string(),
})

/** Explanation — ответ ручки объяснения маршрута. */
export const ExplanationSchema = z.object({
  connection_id: z.string(),
  match: MatchSchema,
  chain: ChainSchema,
  /** Rules — весь список работающего процесса. Панель сверяет его длину с длиной route.rules применённого документа: процесс мог загрузить другой конфиг, и вести пользователя на узел чужого файла нельзя (ADR-0007). */
  rules: z.array(RuleSchema),
})

export type ChainWire = z.infer<typeof ChainSchema>
export type CheckDetailsWire = z.infer<typeof CheckDetailsSchema>
export type ConnectionWire = z.infer<typeof ConnectionSchema>
export type ConnectionsSnapshotWire = z.infer<typeof ConnectionsSnapshotSchema>
export type DaemonWire = z.infer<typeof DaemonSchema>
export type DevicePointWire = z.infer<typeof DevicePointSchema>
export type ErrorWire = z.infer<typeof ErrorSchema>
export type EventWire = z.infer<typeof EventSchema>
export type ExplanationWire = z.infer<typeof ExplanationSchema>
export type HealthWire = z.infer<typeof HealthSchema>
export type HistoryWire = z.infer<typeof HistorySchema>
export type LinkWire = z.infer<typeof LinkSchema>
export type LoadWire = z.infer<typeof LoadSchema>
export type MatchWire = z.infer<typeof MatchSchema>
export type MemoryWire = z.infer<typeof MemorySchema>
export type PointWire = z.infer<typeof PointSchema>
export type ProcessWire = z.infer<typeof ProcessSchema>
export type RuleWire = z.infer<typeof RuleSchema>
export type ServiceWire = z.infer<typeof ServiceSchema>
export type ShareWire = z.infer<typeof ShareSchema>
export type StatWire = z.infer<typeof StatSchema>
export type StatusWire = z.infer<typeof StatusSchema>
export type TransactionWire = z.infer<typeof TransactionSchema>
export type VersionWire = z.infer<typeof VersionSchema>
export type VersionsWire = z.infer<typeof VersionsSchema>
export type ZoneWire = z.infer<typeof ZoneSchema>
