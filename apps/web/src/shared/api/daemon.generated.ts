// Сгенерировано apps/metaboxd/cmd/contractgen из контракта демона. Не
// редактировать: правится демон, файл пересобирается `make schema-daemon`.
//
// Схемы описывают форму ответа, но не переводят её: перевод и отказ живут в
// адаптерах слайсов.

import { z } from 'zod'

export const RUNTIME_SOURCE = [
  'clash_api',
] as const

export const PHASE = [
  'applying',
  'awaiting_confirm',
  'confirmed',
  'rolled_back',
  'failed',
] as const

export const APPLY_REASON_CODE = [
  'backup_failed',
  'write_failed',
  'restart_failed',
  'healthcheck_failed',
  'dns_probe_failed',
  'interception_missing',
  'rollback_failed',
  'no_backup',
] as const

export const SERVICE_ERROR_CODE = [
  'service_state_unread',
  'service_instance_ambiguous',
] as const

export const ERROR_CODE = [
  'not_found',
  'origin_mismatch',
  'upgrade_unsupported',
  'config_missing',
  'version_missing',
  'connection_missing',
  'runtime_unavailable',
  'unknown_transaction',
  'apply_in_progress',
  'nothing_to_confirm',
  'config_modified',
  'config_too_large',
  'list_invalid',
  'workdir_mismatch',
  'launch_mismatch',
  'device_invalid',
  'dataplane_invalid',
  'dataplane_modified',
  'dataplane_foreign_service',
  'log_unavailable',
  'log_query_invalid',
  'log_stream_limit',
  'log_clear_forbidden',
  'check_failed',
  'internal',
] as const

export const NAME_SOURCE = [
  'custom',
  'static',
  'dhcp',
  'none',
] as const

export const ACCESS_MODE = [
  'all',
  'listed',
] as const

export const APPLIED_REASON = [
  'nft_unavailable',
  'nft_unparsed',
] as const

export const FIELD_REASON = [
  'invalid',
  'out_of_range',
  'duplicate',
  'required',
] as const

export const SOURCE = [
  'logread',
  'file',
] as const

export const LEVEL = [
  'trace',
  'debug',
  'info',
  'notice',
  'warn',
  'error',
  'fatal',
  'panic',
] as const

export const CHECK_NAME = [
  'redirect_port',
  'tproxy_port',
  'dns_port',
  'dns_probe',
  'nft_chains',
  'proxy',
  'direct',
] as const

export const CHECK_STATUS = [
  'ok',
  'fail',
  'skipped',
] as const

export const CHECK_REASON = [
  'model_unavailable',
  'interception_disabled',
  'not_listening',
  'proc_unavailable',
  'config_missing',
  'no_dns_inbound',
  'dns_name_unset',
  'no_answer',
  'nft_unavailable',
  'nft_unparsed',
  'chains_missing',
  'proxy_unset',
  'proxy_missing',
  'runtime_unavailable',
  'request_failed',
  'unsupported',
] as const

export const ORIGIN = [
  'observed',
  'computed',
  'unknown',
] as const

export const KIND = [
  'rule',
  'final',
  'unknown',
] as const

export const ROUTE_REASON_CODE = [
  'not_in_process_list',
] as const

export const LIST_KIND = [
  'geosite',
  'geoip',
] as const

export const LIST_SOURCE = [
  'snapshot',
  'provider',
] as const

/** Health — ответ `GET /healthz`. */
export const HealthSchema = z.object({
  status: z.string(),
  version: z.string(),
})

/** SingboxBuild — то, с чем собран бинарь sing-box на устройстве. */
export const SingboxBuildSchema = z.object({
  /** Tags — build-теги из `sing-box version`. Пустой список значит сборку без тегов: типы узлов, закрытые тегом, такой бинарь откажется запускать. */
  tags: z.array(z.string()),
})

/** Runtime — источники рантайма в `GET /api/status`. Поля отвечают, что демон умеет читать, а не отвечает ли sing-box сейчас: живость процесса идёт `GET /api/service` и топиком `service` потока, и второй правды о ней здесь не заводится. */
export const RuntimeSchema = z.object({
  /** Sources — источники, которые демон собрал. */
  sources: z.array(z.string()),
  /** Connections — источник, из которого панель получает соединения. Пустая строка означает, что читать их нечем: экран деградирует, а панель остаётся доступной. */
  connections: z.string().optional(),
})

/** Transaction — снимок применения. Он же формат файла состояния: то, что демон отдаёт клиенту, и то, по чему доигрывает себя после перезагрузки. */
export const TransactionSchema = z.object({
  id: z.string(),
  phase: z.string(),
  /** Window — сколько осталось на подтверждение. Хранится длительностью, а не меткой времени: у роутера нет часов реального времени, после включения он стартует с эпохи и прыгает при синхронизации NTP. */
  window: z.int(),
  /** Sum — sha256 конфига, записанного демоном. По нему ловится правка файла извне. */
  sha256: z.string().optional(),
  /** Lists — sha256 файлов списков, которые транзакция записывает: имя → отпечаток нового содержимого. Только реально меняемые файлы: по совпадению отпечатка доигрывание судит, началась ли запись. */
  lists: z.record(z.string(), z.string()).optional(),
  /** RemovedLists — файлы списков, которые транзакция удаляет; на момент запуска они существовали. */
  removed_lists: z.array(z.string()).optional(),
  /** ReasonCode — на каком шаге встал цикл. Пусто, если применение прошло или отказ не привязан к шагу. */
  reason_code: z.string().optional(),
  /** Reason заполняется, когда применение не дошло до конца: исходная ошибка шага, как её записал демон. Показывать её пользователю — запасной путь, текст отказа панель берёт по ReasonCode. */
  reason: z.string().optional(),
  /** ClashAPIAdded отмечает, что демон сам добавил секцию. */
  clash_api_added: z.boolean().optional(),
})

/** Status — ответ `GET /api/status`. */
export const StatusSchema = z.object({
  /** Version — версия демона; версия бинаря sing-box идёт отдельным полем. */
  version: z.string(),
  singbox_version: z.string().optional(),
  /** SingboxBuild — состав сборки бинаря. Нет поля — бинарь не прочитан, и судить, каких типов узлов в нём нет, панели не по чему. */
  singbox_build: SingboxBuildSchema.optional(),
  /** ConfigPath — файл, которым демон владеет: путь задаётся флагами запуска, и вычислить его на стороне панели нельзя. */
  config_path: z.string().optional(),
  /** Runtime — откуда демон читает рантайм. Молчаливая подмена одного источника другим запрещена, поэтому состав объявлен контрактом. */
  runtime: RuntimeSchema,
  transaction: TransactionSchema.optional(),
  /** TransactionHref — адрес идущего применения. Без него перезагрузка страницы теряет транзакцию: её идентификатор жил только в ответе на POST. */
  transaction_href: z.string().optional(),
  /** DataplaneTransaction — последняя смена модели обвязки в этой жизни демона. Идёт тем же протоколом и с теми же фазами, что применение конфига, и одновременно с ним не бывает. */
  dataplane_transaction: TransactionSchema.optional(),
  /** DataplaneTransactionHref — адрес смены обвязки, по тому же правилу, что TransactionHref. */
  dataplane_transaction_href: z.string().optional(),
})

/** Version — запись истории. Содержимое конфига демон не разбирает, поэтому наружу идут только номер, размер, отпечаток и отметка времени. */
export const VersionSchema = z.object({
  /** ID — монотонный номер. Время источником порядка быть не может: у роутера нет часов реального времени, он стартует с эпохи и прыгает при синхронизации NTP. */
  id: z.int(),
  /** Size — размер в байтах. */
  size: z.int(),
  /** Sum — sha256 содержимого. По нему видно, что версия совпадает с активным конфигом, без вычитывания обеих. */
  sum: z.string(),
  /** SavedAt — отметка времени файла, секунды Unix. Справочная: показывает часы устройства на момент сохранения и врёт, если они не синхронизованы. */
  saved_at: z.int(),
  /** ListsSum — отпечаток снимка файлов списков в той же записи, что etag `GET /api/config/rule-sets`. Поля нет — версия сохранена без снимка, и её восстановление списков не трогает. */
  lists_sum: z.string().optional(),
})

/** Versions — ответ `GET /api/config/versions`. */
export const VersionsSchema = z.object({
  versions: z.array(VersionSchema),
  /** CurrentSum — sha256 применённого конфига в той же записи, что у `Version.Sum`: по нему панель отмечает версию, совпадающую с файлом на устройстве. Считает демон, потому что `crypto.subtle` браузер даёт только в защищённом контексте, а панель открывают по http. Поля нет — конфига на устройстве нет. */
  current_sum: z.string().optional(),
  /** CurrentListsSum — отпечаток текущего набора файлов списков в той же записи, что у `Version.ListsSum`: версия совпадает с устройством, только когда совпадают и конфиг, и списки. Поля нет у демона, который снимков списков не хранит. */
  current_lists_sum: z.string().optional(),
})

/** Service — ответ `GET /api/service` и того же вида событие потока: панель получает один формат независимо от источника. */
export const ServiceSchema = z.object({
  status: z.string(),
  /** Uptime — секунды с момента старта. Ноль означает, что возраст узнать не удалось: панель показывает такое значение прочерком. */
  uptime: z.int(),
  /** Binary — версия бинаря на устройстве. Схему панель знает свою и сверяет расхождение сама. */
  binary: z.string(),
  /** Managed означает, что процессом владеет служба, которой управляет демон. Ложь при статусе `running` читается так: sing-box на устройстве работает, но поднят не ею — маршрутизацией владеет чужой пакет, и кнопки службы к этому процессу не относятся. */
  managed: z.boolean(),
  lastError: z.string().optional(),
  /** LastErrorCode — почему LastError написал демон, а не служба. Пусто, когда в LastError вывод упавшей службы: его панель показывает дословно. */
  lastErrorCode: z.string().optional(),
})

/** Point — средняя скорость за шаг, байт в секунду. */
export const PointSchema = z.object({
  down: z.int(),
  up: z.int(),
})

/** DevicePoint — показания платы и процессов за шаг. Загрузка и температура берутся пиком шага, память — средним. История нужна, чтобы заметить перегрев и утечку за дни работы, а при укрупнении шага среднее растворило бы короткий перегрев в соседних спокойных минутах. */
export const DevicePointSchema = z.object({
  /** Load — средняя загрузка за минуту, как её отдаёт ядро; пик шага. */
  load: z.number(),
  /** Celsius — самая горячая зона платы, пик шага; ноль означает, что зон нет. */
  celsius: z.number(),
  /** Memory — занятая память платы в байтах. */
  memory: z.int(),
  /** Singbox — резидентная память процесса sing-box в байтах; ноль — процесс не найден. По ней и видна утечка: память платы в целом её размывает. */
  singbox: z.int(),
  /** Daemon — резидентная память самого демона в байтах. */
  daemon: z.int(),
})

/** History — ответ `GET /api/history`: трафик за всё время, что копил демон. Время точки не передаётся: часов у роутера до синхронизации NTP нет, и абсолютная метка соврала бы. Точки идут подряд с шагом StepSeconds, последняя — самая свежая, а подписи оси панель считает по своим часам. */
export const HistorySchema = z.object({
  step_seconds: z.int(),
  points: z.array(PointSchema),
  /** Device — показания платы тем же шагом: загрузка, температура, память. */
  device: z.array(DevicePointSchema),
  /** Recent — последняя минута трафика по секунде, без усреднения. Пуста, пока демон не получил ни одного сэмпла. */
  recent: z.array(PointSchema),
  /** Connections — число живых соединений за последнюю минуту, по снимку в секунду. */
  connections: z.array(z.int()),
})

/** Error — единый формат отказа на границе HTTP. Внутренние подробности — пути на диске, аргументы команд, содержимое конфига — в него не попадают; Details несёт только то, что показывают пользователю. Code — контракт, Message — запасной текст: панель показывает свой перевод по коду, а сообщение берёт, только когда код ей незнаком. */
export const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
})

/** CheckDetails — вывод sing-box дословно. Единственное исключение из правила «внутренние подробности наружу не идут»: на этих строках пользователь чинит конфиг. */
export const CheckDetailsSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.int(),
})

/** WorkdirDetails — каталоги отказа `workdir_mismatch`. Пути наружу идут намеренно: путь конфига панель и так знает из `GET /api/status`, а по этим двум она собирает команду, которая настраивает службу. */
export const WorkdirDetailsSchema = z.object({
  /** Workdir — рабочий каталог, с которым procd поднимает службу. */
  workdir: z.string(),
  /** ConfigDir — каталог конфига, которым владеет демон. */
  config_dir: z.string(),
})

/** RuleSetFiles — файлы своих списков из подкаталога rule-sets каталога конфига, как их отдаёт GET /api/config/rule-sets. */
export const RuleSetFilesSchema = z.object({
  /** Files — имя файла → содержимое байт в байт. */
  files: z.record(z.string(), z.string()),
  /** Etag — отпечаток набора; клиент возвращает его в lists_base применения. */
  etag: z.string(),
})

/** ApplyEnvelope — применение конфига вместе с файлами списков подкаталога rule-sets. Идёт в POST /api/apply с Content-Type application/vnd.metabox.apply+json; тело без этого типа демон читает как голые байты конфига. */
export const ApplyEnvelopeSchema = z.object({
  /** Config — текст конфига как есть, с комментариями и висячими запятыми. */
  config: z.string(),
  /** Lists — имя файла в подкаталоге rule-sets → его содержимое. */
  lists: z.record(z.string(), z.string()).optional(),
  /** RemoveLists — файлы подкаталога rule-sets, которые применение удаляет. */
  remove_lists: z.array(z.string()).optional(),
  /** ListsBase — отпечаток набора файлов, от которого редактировал клиент: значение etag из GET /api/config/rule-sets. Пустой — применить без сверки. */
  lists_base: z.string().optional(),
})

/** Device — устройство LAN, сведённое по MAC. */
export const DeviceSchema = z.object({
  /** IP — адрес из аренды, а без неё — из статической записи. Пусто, когда адреса нет ни там, ни там: у устройства есть только своё имя. */
  ip: z.string(),
  /** MAC — в нижнем регистре через двоеточие; по нему хранится своё имя. */
  mac: z.string(),
  /** Name — подпись по приоритету: своё имя, статическая аренда, DHCP. Пусто при NameSource `none`. */
  name: z.string(),
  /** NameSource — откуда взята подпись; при `none` панель подписывает устройство адресом. */
  name_source: z.string(),
  /** Static — у MAC есть статическая аренда в UCI `dhcp`. */
  static: z.boolean(),
  /** Online — аренда не истекла по часам роутера. До синхронизации NTP часы стоят в прошлом, и истёкшая аренда может считаться живой. */
  online: z.boolean(),
  /** LeaseExpires — конец аренды в секундах unix. Ноль — аренды нет или она бессрочная; второе отличается признаком Online. */
  lease_expires: z.int(),
})

/** Devices — ответ `GET /api/devices` и `PUT /api/devices/{mac}`: устройства LAN по адресу, без адреса — в конце. */
export const DevicesSchema = z.object({
  devices: z.array(DeviceSchema),
})

/** DeviceName — тело `PUT /api/devices/{mac}`. */
export const DeviceNameSchema = z.object({
  /** Name — своё имя устройства. Пустое убирает его, и подпись возвращается к статической аренде или DHCP. */
  name: z.string(),
})

/** Model — секция `metabox.dataplane`. Отсутствующая опция получает значение по умолчанию из Defaults; список, заданный пустыми значениями, — пустой. */
export const ModelSchema = z.object({
  /** Enabled — ставить ли перехват. Ложь: служба поднимает только sing-box, без nft, ip rule и upstream dnsmasq. */
  enabled: z.boolean(),
  /** RedirectPort — порт inbound redirect: сюда уходит TCP из LAN. */
  redirect_port: z.int(),
  /** TproxyPort — порт inbound tproxy: сюда уходит UDP из LAN. */
  tproxy_port: z.int(),
  /** DNSPort — порт dns-in sing-box, на который dnsmasq отдаёт запросы. */
  dns_port: z.int(),
  /** DNSHijack — перехватывать udp/53 из LAN на dnsmasq роутера. */
  dns_hijack: z.boolean(),
  /** SelfMark — метка обхода: пакет с ней идёт мимо перехвата. Совпадает с route.default_mark конфига sing-box, иначе его трафик зациклится. */
  self_mark: z.int(),
  /** TproxyMark — метка потоков tproxy, по ней ip rule уводит их в RouteTable. */
  tproxy_mark: z.int(),
  /** RouteTable — таблица маршрутов с local-маршрутом для tproxy. */
  route_table: z.int(),
  acl_mode: z.string(),
  /** SourceIP — источники режима listed: IPv4-адрес или подсеть. */
  source_ip: z.array(z.string()),
  /** SourceMAC — источники режима listed по MAC: не зависят от смены аренды. */
  source_mac: z.array(z.string()),
  /** LANInterface — интерфейсы, с которых перехватывается трафик. */
  lan_interface: z.array(z.string()),
  /** WANProxyCIDR — назначения, которые всегда идут через sing-box. */
  wan_proxy_cidr: z.array(z.string()),
  /** WANDirectCIDR — назначения, которые всегда идут мимо sing-box. */
  wan_direct_cidr: z.array(z.string()),
  /** IPv6 — рендерить ли цепочки IPv6; пока ложь, их нет. */
  ipv6: z.boolean(),
})

/** Dataplane — ответ `GET /api/dataplane`: модель сетевой обвязки из UCI и то, стоят ли её правила на устройстве. */
export const DataplaneSchema = z.object({
  model: ModelSchema,
  /** Applied — в таблице fw4 есть цепочки обвязки. Ложь без AppliedReason — nft прочитан, цепочек нет. */
  applied: z.boolean(),
  /** AppliedReason — почему Applied не наблюдён, а подставлен ложью. */
  applied_reason: z.string().optional(),
  /** ForeignService — демон управляет не службой `metabox-singbox`, и `PUT /api/dataplane` получит `dataplane_foreign_service`: панель не предлагает смену, которую демон отклонит. */
  foreign_service: z.boolean().optional(),
})

/** DataplaneChange — тело `PUT /api/dataplane`: модель в той же форме, что поле model ответа `GET /api/dataplane`. Пишется целиком: отсутствующее поле — это нулевое значение, а не «оставить как есть». */
export const DataplaneChangeSchema = z.object({
  model: ModelSchema,
})

/** FieldError — одно непринятое значение. */
export const FieldErrorSchema = z.object({
  /** Field — имя опции UCI. */
  field: z.string(),
  /** Value — значение как в UCI; у элемента списка — сам элемент. Пусто у ReasonRequired. */
  value: z.string(),
  reason: z.string(),
})

/** DataplaneDetails — поля отказа `dataplane_invalid`. */
export const DataplaneDetailsSchema = z.object({
  fields: z.array(FieldErrorSchema),
})

/** Entry — строка лога sing-box. */
export const EntrySchema = z.object({
  /** Time — метка времени строки в RFC 3339; пусто, когда метки нет. У строк логгера это время logd, у файла — метка log.timestamp sing-box. Часов реального времени у роутера нет: до синхронизации NTP метки в прошлом. */
  time: z.string().optional(),
  /** Level — пусто, когда уровень не разобран: продолжение многострочного сообщения, стек паники. Такие строки фильтр по уровню пропускает. */
  level: z.string().optional(),
  message: z.string(),
})

/** Logs — ответ `GET /api/logs`: последние строки лога sing-box, старые первыми. */
export const LogsSchema = z.object({
  source: z.string(),
  /** Since — отметка последней очистки в RFC 3339: строки раньше неё не отдаются. Нет поля — очистки не было с запуска демона. */
  since: z.string().optional(),
  entries: z.array(EntrySchema),
})

/** LogEvent — событие `log` потока `GET /api/logs/stream`. */
export const LogEventSchema = z.object({
  /** Seq растёт на единицу с каждой строкой, в том числе отброшенной из-за медленного читателя: разрыв означает потерю строк. */
  seq: z.int(),
  entry: EntrySchema,
})

/** LogsCleared — ответ `POST /api/logs/clear`. */
export const LogsClearedSchema = z.object({
  /** Since — отметка очистки в RFC 3339. */
  since: z.string(),
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

/** Check — одна проверка. */
export const CheckSchema = z.object({
  name: z.string(),
  status: z.string(),
  /** Reason — пусто при ok. */
  reason: z.string().optional(),
  /** Detail — подробность на языке демона: порт, исходная ошибка, ответ Clash API. Панель показывает её под своим текстом, а не вместо него. */
  detail: z.string().optional(),
  /** Missing — отсутствующие цепочки при chains_missing. */
  missing: z.array(z.string()).optional(),
  /** DelayMS — задержка при ok у proxy и direct. */
  delay_ms: z.int().optional(),
})

/** Report — отчёт в фиксированном порядке проверок. */
export const ReportSchema = z.object({
  checks: z.array(CheckSchema),
})

/** Connection — соединение в контракте демона. Форма панели не зависит от того, каким источником соединение прочитано: Clash API и gRPC форка расходятся и в наборе полей, и в формате правила, поэтому сведение к одной модели делает демон, а не фронт. */
export const ConnectionSchema = z.object({
  id: z.string(),
  /** Host — адрес назначения с портом: имя, если его разобрал sniff, иначе адрес. Собирается здесь, потому что источники держат его по-разному. */
  host: z.string(),
  network: z.string(),
  source: z.string(),
  /** Rule — условия сработавшего правила. Пусто у правила без условий и у соединения, не совпавшего ни с одним. */
  rule: z.string(),
  /** Action — выход правила: аутбаунд или действие. gRPC его не отдаёт вовсе, и там поле пустое. */
  action: z.string(),
  /** Final отмечает, что ни одно правило не совпало и сработал route.final. Без отдельного признака этот выход не отличить от правила без условий: у обоих условия пусты, а это разные вещи. */
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
  /** ReasonCode заполняется только у Kind == KindUnknown: по нему панель берёт текст на языке пользователя. */
  reason_code: z.string().optional(),
  /** Reason — та же причина словами демона. Запасной текст для кода, которого панель не знает. */
  reason: z.string().optional(),
})

/** Chain — цепочка прокси соединения в том порядке, в каком её отдаёт core: от конечного узла к группе. */
export const ChainSchema = z.object({
  origin: z.string(),
  nodes: z.array(z.string()),
})

/** Rule — правило работающего процесса. Индекс равен индексу узла в route.rules применённого документа: роутер строит список циклом по конфигу один к одному. */
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
  /** Rules — весь список работающего процесса. Панель сверяет его длину с длиной route.rules применённого документа: процесс мог загрузить другой конфиг, и вести пользователя на узел чужого файла нельзя. */
  rules: z.array(RuleSchema),
})

/** RuleHits — срабатывания одного правила работающего процесса. */
export const RuleHitsSchema = z.object({
  index: z.int(),
  hits: z.int(),
  /** Counted — видно ли правило в списке соединений вообще. Clash API пишет у соединения только правило, на котором перебор остановился, и только соединения, ушедшие в outbound: `sniff` и `resolve` не останавливают перебор, перехваченный DNS и отклонённое соединение в список не попадают. У таких правил ноль значил бы не «не срабатывало», а «не видно». */
  counted: z.boolean(),
})

/** Hits — ответ ручки счётчика срабатываний. Счёт наблюдаемый, а не точный: соединение, которое открылось и закрылось между двумя снапшотами, core уже не покажет, и в счёт оно не попадёт. */
export const HitsSchema = z.object({
  /** Seconds — сколько идёт счёт. Он живёт в памяти демона и начинается с его запуска: у роутера нет часов реального времени, поэтому отдаётся длительность, а не момент начала. */
  seconds: z.int(),
  /** Rules — по записи на каждое правило работающего процесса, в его порядке. Длину панель сверяет с route.rules применённого документа, как и у объяснения маршрута. */
  rules: z.array(RuleHitsSchema),
  /** Final — соединения, которые не совпали ни с одним правилом и ушли в route.final. */
  final: z.int(),
})

/** Mirror — адрес, по которому sing-box качает файлы набора. До основного адреса из России дотягиваются не всегда, поэтому зеркал несколько. */
export const MirrorSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Base — начало адреса до имени файла, со слэшем на конце. */
  base: z.string(),
})

/** List — один вид списков у поставщика. */
export const ListSchema = z.object({
  kind: z.string(),
  /** Prefix — приставка имени файла: `geosite-` + категория + `.srs`. */
  prefix: z.string(),
  mirrors: z.array(MirrorSchema),
  /** Featured — что показать, пока поле категории пустое, в порядке от общего к частному. */
  featured: z.array(z.string()),
  /** Categories — все категории, для которых у поставщика есть файл `.srs`, по алфавиту. */
  categories: z.array(z.string()),
  source: z.string(),
  /** UpdatedAt — когда перечень последний раз сверен с поставщиком, а у снимка — когда снимок собран; секунды Unix. Справочная величина: у роутера нет часов реального времени, но сверка идёт по TLS, а он без синхронизованных часов не пройдёт. */
  updated_at: z.int(),
})

/** Provider — поставщик готовых наборов. */
export const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  lists: z.array(ListSchema),
})

/** Catalog — ответ ручки каталога. */
export const CatalogSchema = z.object({
  providers: z.array(ProviderSchema),
})

export type ApplyEnvelopeWire = z.infer<typeof ApplyEnvelopeSchema>
export type CatalogWire = z.infer<typeof CatalogSchema>
export type ChainWire = z.infer<typeof ChainSchema>
export type CheckDetailsWire = z.infer<typeof CheckDetailsSchema>
export type CheckWire = z.infer<typeof CheckSchema>
export type ConnectionWire = z.infer<typeof ConnectionSchema>
export type ConnectionsSnapshotWire = z.infer<typeof ConnectionsSnapshotSchema>
export type DaemonWire = z.infer<typeof DaemonSchema>
export type DataplaneChangeWire = z.infer<typeof DataplaneChangeSchema>
export type DataplaneDetailsWire = z.infer<typeof DataplaneDetailsSchema>
export type DataplaneWire = z.infer<typeof DataplaneSchema>
export type DeviceNameWire = z.infer<typeof DeviceNameSchema>
export type DevicePointWire = z.infer<typeof DevicePointSchema>
export type DeviceWire = z.infer<typeof DeviceSchema>
export type DevicesWire = z.infer<typeof DevicesSchema>
export type EntryWire = z.infer<typeof EntrySchema>
export type ErrorWire = z.infer<typeof ErrorSchema>
export type EventWire = z.infer<typeof EventSchema>
export type ExplanationWire = z.infer<typeof ExplanationSchema>
export type FieldErrorWire = z.infer<typeof FieldErrorSchema>
export type HealthWire = z.infer<typeof HealthSchema>
export type HistoryWire = z.infer<typeof HistorySchema>
export type HitsWire = z.infer<typeof HitsSchema>
export type LinkWire = z.infer<typeof LinkSchema>
export type ListWire = z.infer<typeof ListSchema>
export type LoadWire = z.infer<typeof LoadSchema>
export type LogEventWire = z.infer<typeof LogEventSchema>
export type LogsClearedWire = z.infer<typeof LogsClearedSchema>
export type LogsWire = z.infer<typeof LogsSchema>
export type MatchWire = z.infer<typeof MatchSchema>
export type MemoryWire = z.infer<typeof MemorySchema>
export type MirrorWire = z.infer<typeof MirrorSchema>
export type ModelWire = z.infer<typeof ModelSchema>
export type PointWire = z.infer<typeof PointSchema>
export type ProcessWire = z.infer<typeof ProcessSchema>
export type ProviderWire = z.infer<typeof ProviderSchema>
export type ReportWire = z.infer<typeof ReportSchema>
export type RuleHitsWire = z.infer<typeof RuleHitsSchema>
export type RuleSetFilesWire = z.infer<typeof RuleSetFilesSchema>
export type RuleWire = z.infer<typeof RuleSchema>
export type RuntimeWire = z.infer<typeof RuntimeSchema>
export type ServiceWire = z.infer<typeof ServiceSchema>
export type ShareWire = z.infer<typeof ShareSchema>
export type SingboxBuildWire = z.infer<typeof SingboxBuildSchema>
export type StatWire = z.infer<typeof StatSchema>
export type StatusWire = z.infer<typeof StatusSchema>
export type TransactionWire = z.infer<typeof TransactionSchema>
export type VersionWire = z.infer<typeof VersionSchema>
export type VersionsWire = z.infer<typeof VersionsSchema>
export type WorkdirDetailsWire = z.infer<typeof WorkdirDetailsSchema>
export type ZoneWire = z.infer<typeof ZoneSchema>
