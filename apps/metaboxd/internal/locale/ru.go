package locale

// ru holds the Russian texts by their English source.
var ru = map[string]string{
	"Usage of %s:":  "Использование %s:",
	" (default %q)": " (по умолчанию %q)",
	" (default %v)": " (по умолчанию %v)",

	"addresses and ports the daemon listens on, comma-separated":                                                    "адреса и порты, которые слушает демон; несколько — через запятую",
	"extra allowed Origin for mutating requests; needed by the dev stand":                                           "дополнительный разрешённый Origin мутирующих запросов; нужен дев-стенду",
	"serve the panel over HTTPS with a certificate from the daemon's own root; http on the same port is redirected": "обслуживать панель по HTTPS с сертификатом от собственного корня демона; http на том же порту перенаправляется",
	"path to a ready panel certificate in PEM, used with -https-key; the daemon then issues no root of its own":     "путь к готовому сертификату панели в PEM вместе с -https-key; тогда свой корень демон не выпускает",
	"path to the key of the -https-cert certificate":                                                                "путь к ключу сертификата из -https-cert",
	"sing-box config directory":          "каталог конфига sing-box",
	"config file name in that directory": "имя файла конфига в этом каталоге",
	"daemon state directory for the backup and transaction state; outside the config directory": "служебный каталог демона под бэкап и состояние транзакции; вне каталога конфига",
	"path to the sing-box binary":     "путь к бинарю sing-box",
	"path to the service init script": "путь к init-скрипту сервиса",
	"procd instance the init script service runs sing-box in; empty means the service's only instance":                                     "инстанс procd, в котором служба init-скрипта держит sing-box; пустой — единственный инстанс службы",
	"path to ubus, used to read the service state from procd":                                                                              "путь к ubus: через него читается состояние службы у procd",
	"path to logread, the source of the log and the reason sing-box crashed; empty disables reading":                                       "путь к logread: из него берутся лог и причина падения sing-box; пустой отключает чтение",
	"dnsmasq lease file, the source of LAN devices":                                                                                        "файл аренд dnsmasq: из него берутся устройства LAN",
	"path to uci, used to read static leases from UCI dhcp and to read and write the plumbing model in UCI metabox":                        "путь к uci: через него читаются статические аренды из UCI dhcp, читается и пишется модель обвязки в UCI metabox",
	"path to nft, used to see whether the plumbing rules are in place; empty disables the check":                                           "путь к nft: через него демон видит, стоят ли правила обвязки; пустой отключает проверку",
	"name the sing-box dns-in must resolve after a restart, otherwise the change is rolled back; empty disables the DNS probe":             "имя, которое dns-in sing-box обязан разрешить после рестарта, иначе изменение откатывается; пустое выключает DNS-пробу",
	"URL diagnostics uses to check internet access through the node and directly":                                                          "адрес, по которому диагностика проверяет выход в интернет через узел и напрямую",
	"Clash API port, used when the daemon creates the section itself":                                                                      "порт Clash API, если демон заводит секцию сам",
	"how long to wait for connectivity confirmation before the automatic rollback":                                                         "сколько ждать подтверждения связи до автоотката",
	"time limit for the apply steps from backup to healthcheck":                                                                            "потолок на шаги применения от бэкапа до healthcheck",
	"how often to sync the rule set catalog with providers; 0 disables syncing: the catalog comes from the cache or the built-in snapshot": "как часто сверять каталог наборов с поставщиками; 0 — без сверки: каталог из кэша или встроенного снимка",
	"log level: debug, info, warn, error":                                                                                                  "уровень логов: debug, info, warn, error",
	"language of the texts the daemon shows the operator: en or ru":                                                                        "язык текстов, которые демон показывает оператору: en или ru",

	"endpoint not found":                                                                   "адрес API не найден",
	"request origin does not match the panel address":                                      "источник запроса не совпадает с адресом панели",
	"request host does not match the panel address":                                        "адрес запроса не совпадает с адресом панели",
	"WebSocket upgrade is not supported: the runtime comes through the /api/events stream": "апгрейд до WebSocket не поддерживается: рантайм идёт потоком /api/events",
	"apply request body not parsed":                                                        "тело запроса применения не разобрано",
	"device rename body not parsed":                                                        "тело правки имени устройства не разобрано",
	"dataplane model change body not parsed":                                               "тело смены модели обвязки не разобрано",
	"If-Match with the ETag from GET /api/dataplane is required":                           "нужен If-Match с ETag из GET /api/dataplane",
	"log query parameters not parsed":                                                      "параметры запроса лога не разобраны",
	"sign-in required":                                                                     "нужен вход в панель",
	"MCP token required":                                                                   "нужен токен MCP",
	"sign-in or password change body not parsed":                                           "тело входа или смены пароля не разобрано",
	"sing-box rejected the config":                                                         "sing-box отверг конфиг",
	"the sing-box service working directory does not match the config directory":           "рабочий каталог службы sing-box не совпадает с каталогом конфига",
	"dataplane model rejected":                                                             "модель обвязки не принята",
	"internal error":                                                                       "внутренняя ошибка",
	"the sing-box service starts with a config metabox does not own":                       "служба sing-box поднимается не на конфиге, которым владеет metabox",

	"no config file":                                     "файла конфига нет",
	"no config version":                                  "версии конфига нет",
	"apply already in progress":                          "применение уже идёт",
	"no transaction with this ID":                        "транзакции с таким идентификатором нет",
	"nothing to confirm":                                 "подтверждать нечего",
	"config file changed outside metabox":                "файл конфига изменён вне metabox",
	"list files changed outside metabox":                 "файлы списков изменены вне metabox",
	"invalid list file name":                             "недопустимое имя файла списка",
	"%w: %q":                                             "%w: %q",
	"%w: %q is both written and removed":                 "%w: %q и пишется, и удаляется",
	"dataplane model changed outside metabox":            "модель обвязки изменена вне metabox",
	"the dataplane model is read only by the service %s": "модель обвязки читает только служба %s",
	"no connection with this ID":                         "соединения с таким идентификатором нет",
	"sing-box runtime unavailable":                       "рантайм sing-box недоступен",
	"MAC address not parsed":                             "MAC-адрес не разобран",
	"device name rejected":                               "имя устройства не принято",
	"too many custom device names":                       "своих имён устройств слишком много",
	"%w: limit %d":                                       "%w: не больше %d",
	"%w: longer than %d characters":                      "%w: длиннее %d символов",
	"%w: control characters":                             "%w: управляющие символы",
	"sing-box log unavailable":                           "лог sing-box недоступен",
	"too many log streams open":                          "открыто слишком много потоков лога",
	"log file outside the allowed directories":           "файл лога вне разрешённых каталогов",
	"wrong password":                                     "пароль не подошёл",
	"password rejected":                                  "пароль не принят",
	"panel password is not set":                          "пароль панели не задан",
	"too many wrong passwords, retry in %s":              "слишком много неверных паролей, повторите через %s",
	"%w: %d to %d characters":                            "%w: от %d до %d символов",

	"internal error, the cause is in the daemon log": "внутренняя ошибка, причина в логе демона",
	"tool argument out of range":                     "аргумент инструмента вне допустимых значений",
	"%w: domain is empty":                            "%w: domain пуст",
	"%w: id must be greater than zero":               "%w: id должен быть больше нуля",
	"%w: level %q":                                   "%w: level %q",

	"%w: the config has no top-level key %q":                   "%w: в конфиге нет ключа верхнего уровня %q",
	"%w: %q has no key %q; call with path %q to list its keys": "%w: у %q нет ключа %q; вызовите с путём %q, чтобы увидеть его ключи",
	"Reference for one sing-box config path, from the schema of the sing-box-extended fork the panel " +
		"is built on (schema_version): the value type, the allowed values of an enum or a type discriminator, " +
		"reference (the kind of node the value names by its tag: outbound, dns_server, rule_set and so on), " +
		"when (the discriminator values along the path the field needs, for example type vless at outbounds.*), " +
		"the fork's own field comment, a hand-written note where the schema is not enough, and the keys under " +
		"the path. An array index may be a number or *, so a path from a real config works. The reference does " +
		"not read the config on the router: use metabox_config_version for that.": "Справка по одному пути конфига sing-box по схеме форка sing-box-extended, на которой построена панель " +
		"(schema_version): тип значения, допустимые значения перечисления или дискриминатора type, " +
		"reference (вид узла, который значение называет по тегу: outbound, dns_server, rule_set и так далее), " +
		"when (значения дискриминаторов на пути, при которых поле есть, например type vless у outbounds.*), " +
		"собственный комментарий поля в форке, заметка от руки там, где схемы мало, и ключи под путём. " +
		"Индекс массива — число или *, так что подходит путь из настоящего конфига. Справка не читает " +
		"конфиг на роутере: для этого есть metabox_config_version.",

	"State of the router running metabox: whether the sing-box service runs and who owns the process " +
		"(managed=false with status running means a foreign package started it), the daemon, sing-box binary and " +
		"panel schema versions, the dataplane routing mode, the runtime sources the daemon reads, and the " +
		"permissions of this MCP token. An empty version means it could not be read or was not built in. " +
		"Does not tell whether traffic actually flows: use metabox_diagnostics for that.": "Состояние роутера с metabox: работает ли служба sing-box и кто владеет процессом " +
		"(managed=false при status running значит, что его запустил чужой пакет), версии демона, бинаря sing-box и " +
		"схемы панели, режим маршрутизации обвязки, источники рантайма, которые читает демон, и " +
		"права этого токена MCP. Пустая версия значит, что её не удалось прочитать или она не встроена при сборке. " +
		"Не говорит, идёт ли трафик на самом деле: для этого есть metabox_diagnostics.",
	"Live sing-box connections, newest data from the Clash API, filtered by host, device, rule, " +
		"chain and network. Filters are case-insensitive substrings, except network (exact tcp or udp) and " +
		"device (a source IP, a MAC or a device name from DHCP). total counts all matches, connections holds " +
		"at most limit of them (default 50, at most 500). An empty list means no live connection matches " +
		"right now; it says nothing about connections that already closed.": "Живые соединения sing-box, свежие данные из Clash API, с фильтрами по хосту, устройству, правилу, " +
		"цепочке и сети. Фильтры — подстроки без учёта регистра, кроме network (ровно tcp или udp) и " +
		"device (IP источника, MAC или имя устройства из DHCP). total считает все совпадения, connections содержит " +
		"не больше limit из них (по умолчанию 50, не больше 500). Пустой список значит, что сейчас ни одно живое соединение " +
		"не подходит; об уже закрытых соединениях он ничего не говорит.",
	"Proxy groups with their selected member, and nodes with the last latency sing-box recorded. " +
		"Does not run a latency check: a failed check erases the node's delay history. last_delay_ms is " +
		"absent when the node was never checked; 0 means the last check failed.": "Группы прокси с выбранным участником и узлы с последней задержкой, которую записал sing-box. " +
		"Проверку задержки не запускает: неудачная проверка стирает историю задержек узла. last_delay_ms " +
		"нет, если узел ни разу не проверялся; 0 значит, что последняя проверка не удалась.",
	"Explains how sing-box routed a domain: for live connections whose host is the domain or its " +
		"subdomain, the matched rule (its index in route.rules, conditions and action) and the outbound chain, " +
		"as sing-box reported them. found=false means there is no live connection to the domain: the tool " +
		"does not evaluate rules on its own, so open the site first and ask again. At most limit connections " +
		"are explained (default 5, at most 20).": "Объясняет, как sing-box смаршрутизировал домен: для живых соединений, чей хост — этот домен или его " +
		"поддомен, сработавшее правило (его индекс в route.rules, условия и действие) и цепочку выходов " +
		"в том виде, как их сообщил sing-box. found=false значит, что живого соединения с доменом нет: инструмент " +
		"сам правила не вычисляет, так что сначала откройте сайт и спросите снова. Объясняется не больше limit соединений " +
		"(по умолчанию 5, не больше 20).",
	"History of applied sing-box configs, newest first: id, size, sha256 and save time. The save " +
		"time is the router clock and is wrong before NTP sync. An empty list means nothing was applied " +
		"through metabox yet.": "История применённых конфигов sing-box, новые первыми: id, размер, sha256 и время сохранения. Время " +
		"сохранения — по часам роутера и до синхронизации NTP неверно. Пустой список значит, что через metabox " +
		"ещё ничего не применялось.",
	"Content of one config version from metabox_config_versions. Secrets are masked " +
		"(secret, password, private_key, pre_shared_key, psk, token, auth_str, access_key_secret; for url and " +
		"download_url everything after the host) and cannot be revealed through MCP. Comments are removed, " +
		"since they may hold secrets the mask cannot recognise.": "Содержимое одной версии конфига из metabox_config_versions. Секреты замаскированы " +
		"(secret, password, private_key, pre_shared_key, psk, token, auth_str, access_key_secret; у url и " +
		"download_url всё после хоста) и через MCP не раскрываются. Комментарии удалены: " +
		"в них могут быть секреты, которые маска не распознаёт.",
	"Last lines of the sing-box log, oldest first, the same text the panel log screen shows. " +
		"level is the minimum level: trace, debug, info, notice, warn, error, fatal or panic (default: all). " +
		"lines is 1 to 1000, default 200. Lines without a level (stack traces, continuations) pass the filter. " +
		"URLs are hidden after the host; the rest of the line is not masked and may contain addresses and " +
		"whatever sing-box itself prints. An empty list means no line at this level since the last clear in the panel.": "Последние строки лога sing-box, старые первыми, тот же текст, что на экране лога в панели. " +
		"level — минимальный уровень: trace, debug, info, notice, warn, error, fatal или panic (по умолчанию все). " +
		"lines — от 1 до 1000, по умолчанию 200. Строки без уровня (стектрейсы, продолжения) проходят фильтр. " +
		"В URL всё после хоста скрыто; остальное в строке не маскируется и может содержать адреса и " +
		"всё, что печатает сам sing-box. Пустой список значит, что с последней очистки в панели строк этого уровня не было.",
	"Dataplane checks of the router, nothing is changed: sing-box listeners on the redirect, tproxy " +
		"and DNS ports, a DNS query to sing-box dns-in, the nft interception chains, and a direct internet " +
		"request bypassing interception. Each check is ok, fail or skipped with a reason; skipped is not a " +
		"failure. The node latency check is always skipped here: run it from the panel.": "Проверки обвязки роутера, ничего не меняют: слушатели sing-box на портах redirect, tproxy " +
		"и DNS, DNS-запрос к dns-in sing-box, цепочки перехвата nft и прямой запрос в интернет " +
		"в обход перехвата. Каждая проверка — ok, fail или skipped с причиной; skipped — не " +
		"сбой. Проверка задержки узла здесь всегда пропускается: запустите её из панели.",

	"backup: %w":             "бэкап: %w",
	"write lists: %w":        "запись списков: %w",
	"write config: %w":       "запись конфига: %w",
	"check interception: %w": "проверка перехвата: %w",
	"no interception chains in nft after the restart": "цепочек перехвата в nft после рестарта нет",
	"service not up":                                                     "служба не поднята",
	"procd still reports the old pid %d":                                 "procd всё ещё сообщает прежний pid %d",
	"wait for the new service process: %w, last attempt: %w":             "ожидание нового процесса службы: %w, последняя попытка: %w",
	"write dataplane model: %w":                                          "запись модели обвязки: %w",
	"interception chains remain after the dataplane was turned off":      "цепочки перехвата остались после выключения обвязки",
	"interception chains missing in nft: %v":                             "цепочек перехвата в nft нет: %v",
	"config for the DNS probe: %w":                                       "конфиг для DNS-пробы: %w",
	"no dns-in on port %d in the config":                                 "dns-in на порту %d в конфиге нет",
	"no backup":                                                          "бэкапа нет",
	"no config before the apply, only the lists were restored":           "конфига до применения не было, возвращены только списки",
	"wait for the Clash API: %w, last attempt: %w":                       "ожидание Clash API: %w, последняя попытка: %w",
	"request to %s: %w":                                                  "запрос к %s: %w",
	"%s answered %d":                                                     "%s ответил %d",
	"DNS probe %s via %s: %w, last attempt: %w":                          "DNS-проба %s через %s: %w, последняя попытка: %w",
	"DNS probe %s via %s, %d attempts: %w":                               "DNS-проба %s через %s, попыток %d: %w",
	"the service has several instances and no instance name is set":      "у службы несколько инстансов, а имя инстанса не задано",
	"service state not read":                                             "состояние службы не прочитано",
	"the connection rule is not in the rule list of the running process": "правила соединения нет в списке правил работающего процесса",
	"service %s: %w":                                                     "служба %s: %w",
	"service state: %w":                                                  "состояние службы: %w",
	"build request to %s: %w":                                            "сборка запроса к %s: %w",
}
