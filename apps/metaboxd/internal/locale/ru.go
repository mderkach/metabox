package locale

// ru holds the Russian texts by their English source.
var ru = map[string]string{
	"Usage of %s:":  "Использование %s:",
	" (default %q)": " (по умолчанию %q)",
	" (default %v)": " (по умолчанию %v)",

	"addresses and ports the daemon listens on, comma-separated":                                                                                   "адреса и порты, которые слушает демон; несколько — через запятую",
	"extra allowed Origin for mutating requests; needed by the dev stand":                                                                          "дополнительный разрешённый Origin мутирующих запросов; нужен дев-стенду",
	"serve the panel over HTTPS with a certificate from the daemon's own root; http on the same port is redirected":                                "обслуживать панель по HTTPS с сертификатом от собственного корня демона; http на том же порту перенаправляется",
	"path to a ready panel certificate in PEM, used with -https-key; the daemon then issues no root of its own":                                    "путь к готовому сертификату панели в PEM вместе с -https-key; тогда свой корень демон не выпускает",
	"path to the key of the -https-cert certificate":                                                                                               "путь к ключу сертификата из -https-cert",
	"routing core configuration directory":                                                                                                         "каталог конфига ядра маршрутизации",
	"config file name in that directory":                                                                                                           "имя файла конфига в этом каталоге",
	"daemon state directory outside the configuration directory, used for saved copies and apply progress":                                         "служебный каталог демона вне каталога конфига, где хранятся резервные копии и состояние применения",
	"path to the routing core executable":                                                                                                          "путь к исполняемому файлу ядра маршрутизации",
	"path to ubus, used to read the service state from procd":                                                                                      "путь к ubus: через него читается состояние службы у procd",
	"path to logread, used to read system logs and diagnose core startup failures. Leave empty to disable log reading":                             "путь к logread для чтения системного лога и поиска причин сбоя при запуске ядра. Пустое значение отключает чтение",
	"dnsmasq lease file, the source of LAN devices":                                                                                                "файл аренд dnsmasq: из него берутся устройства LAN",
	"path to uci, used to read static leases from UCI dhcp and to read and write the plumbing model in UCI metabox":                                "путь к uci: через него читаются статические аренды из UCI dhcp, читается и пишется модель обвязки в UCI metabox",
	"path to the nft command that checks the firewall rules for traffic interception. Leave empty to skip the check":                               "путь к команде nft для проверки правил файрвола, которые перехватывают трафик. Пустое значение отключает проверку",
	"domain name to resolve through the core DNS listener after restart. A failed lookup rolls back the change. Leave empty to skip the DNS check": "домен, который ядро должно разрешить через свой приём DNS-запросов после перезапуска. Если имя не разрешается, изменение откатывается. Пустое значение отключает проверку DNS",
	"URL diagnostics uses to check internet access through the node and directly":                                                                  "адрес, по которому диагностика проверяет выход в интернет через узел и напрямую",
	"Clash API port, used when the daemon creates the section itself":                                                                              "порт Clash API, если демон заводит секцию сам",
	"how long to wait for connectivity confirmation before the automatic rollback":                                                                 "сколько ждать подтверждения связи до автоотката",
	"time limit for applying changes, from saving a copy of the current configuration to checking that the core works":                             "время на применение изменений от создания резервной копии до проверки работы ядра",
	"how often to sync the rule set catalog with providers; 0 disables syncing: the catalog comes from the cache or the built-in snapshot":         "как часто сверять каталог наборов с поставщиками; 0 — без сверки: каталог из кэша или встроенного снимка",
	"log level: debug, info, warn, error":                                                                                                          "уровень логов: debug, info, warn, error",
	"language of the texts the daemon shows the operator: en or ru":                                                                                "язык текстов, которые демон показывает оператору: en или ru",

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
	"the routing core rejected the configuration":                                          "ядро маршрутизации отклонило конфиг",
	"the routing service working directory does not match the configuration directory":     "рабочий каталог службы маршрутизации не совпадает с каталогом конфига",
	"dataplane model rejected":                                                             "модель обвязки не принята",
	"internal error":                                                                       "внутренняя ошибка",

	"config is not valid JSON":                 "конфиг не является корректным JSON",
	"config is not a JSON object":              "конфиг не является объектом JSON",
	"%w: it starts with %q":                    "%w: он начинается с %q",
	"%w: it is empty":                          "%w: он пустой",
	"no config file":                           "файла конфига нет",
	"no config version":                        "версии конфига нет",
	"apply already in progress":                "применение уже идёт",
	"no transaction with this ID":              "транзакции с таким идентификатором нет",
	"nothing to confirm":                       "подтверждать нечего",
	"config file changed outside metabox":      "файл конфига изменён вне metabox",
	"list files changed outside metabox":       "файлы списков изменены вне metabox",
	"invalid list file name":                   "недопустимое имя файла списка",
	"%w: %q":                                   "%w: %q",
	"%w: %q is both written and removed":       "%w: %q и пишется, и удаляется",
	"dataplane model changed outside metabox":  "модель обвязки изменена вне metabox",
	"no connection with this ID":               "соединения с таким идентификатором нет",
	"the routing core is unavailable":          "ядро маршрутизации недоступно",
	"MAC address not parsed":                   "MAC-адрес не разобран",
	"device name rejected":                     "имя устройства не принято",
	"too many custom device names":             "своих имён устройств слишком много",
	"%w: limit %d":                             "%w: не больше %d",
	"%w: longer than %d characters":            "%w: длиннее %d символов",
	"%w: control characters":                   "%w: управляющие символы",
	"the routing core log is unavailable":      "лог ядра маршрутизации недоступен",
	"too many log streams open":                "открыто слишком много потоков лога",
	"too many runtime streams open":            "открыто слишком много потоков рантайма",
	"log file outside the allowed directories": "файл лога вне разрешённых каталогов",
	"wrong password":                           "пароль не подошёл",
	"password rejected":                        "пароль не принят",
	"panel password is not set":                "пароль панели не задан",
	"session revocation not saved":             "отзыв сессии не сохранён",
	"session not found":                        "сессия не найдена",
	"use sign-out for the current session":     "текущую сессию завершает выход из панели",
	"too many wrong passwords, retry in %s":    "слишком много неверных паролей, повторите через %s",
	"%w: %d to %d characters":                  "%w: от %d до %d символов",

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

	"State of the router running metabox: whether the routing core service is running and whether metabox manages it " +
		"(managed=false with status running means the core was started outside that service), the daemon version, " +
		"core type and version, panel schema version, traffic interception mode, the sources of runtime data, " +
		"and the permissions of this MCP token. An empty version means it could not be read or was not built in. " +
		"Use metabox_diagnostics to check whether traffic flows.": "Состояние роутера с metabox: работает ли служба маршрутизации и управляет ли ею metabox " +
		"(managed=false при status running означает, что ядро запущено вне этой службы), версия демона, " +
		"тип и версия ядра, версия схемы панели, режим перехвата трафика, источники данных о работе ядра " +
		"и разрешения этого MCP-токена. Пустая версия означает, что её не удалось прочитать или она не встроена при сборке. " +
		"Чтобы проверить, проходит ли трафик, используйте metabox_diagnostics.",
	"Live connections from the Clash API, filtered by host, device, rule, chain and network. " +
		"Filters are case-insensitive substrings, except network (exact tcp or udp) and " +
		"device (a source IP, a MAC or a device name from DHCP). total counts all matches, connections holds " +
		"at most limit of them (default 50, at most 500). An empty list means no live connection matches " +
		"right now; it says nothing about connections that already closed.": "Активные соединения из Clash API с фильтрами по хосту, устройству, правилу, " +
		"цепочке и сети. Фильтры — подстроки без учёта регистра, кроме network (ровно tcp или udp) и " +
		"device (IP источника, MAC или имя устройства из DHCP). total считает все совпадения, connections содержит " +
		"не больше limit из них (по умолчанию 50, не больше 500). Пустой список значит, что сейчас ни одно живое соединение " +
		"не подходит; об уже закрытых соединениях он ничего не говорит.",
	"Proxy groups with their selected member, and nodes with the last latency recorded by the routing core. " +
		"Does not run a latency check: a failed check erases the node's delay history. last_delay_ms is " +
		"absent when the node was never checked; 0 means the last check failed.": "Группы прокси с выбранным участником и узлы с последней задержкой, которую записало ядро маршрутизации. " +
		"Проверку задержки не запускает: неудачная проверка стирает историю задержек узла. last_delay_ms " +
		"нет, если узел ни разу не проверялся; 0 значит, что последняя проверка не удалась.",
	"Explains how the routing core routed a domain: for live connections whose host is the domain or its " +
		"subdomain, the matched rule (its index in route.rules, conditions and action) and the outbound chain, " +
		"as the core reported them. found=false means there is no live connection to the domain: the tool " +
		"does not evaluate rules on its own, so open the site first and ask again. At most limit connections " +
		"are explained (default 5, at most 20).": "Объясняет, как ядро маршрутизации направило трафик для домена: для живых соединений, чей хост — этот домен или его " +
		"поддомен, сработавшее правило (его индекс в route.rules, условия и действие) и цепочку выходов " +
		"в том виде, как их сообщило ядро. found=false значит, что живого соединения с доменом нет: инструмент " +
		"сам правила не вычисляет, так что сначала откройте сайт и спросите снова. Объясняется не больше limit соединений " +
		"(по умолчанию 5, не больше 20).",
	"History of applied configurations, newest first: id, size, sha256 and save time. The save " +
		"time is the router clock and is wrong before NTP sync. An empty list means nothing was applied " +
		"through metabox yet.": "История применённых конфигов, новые первыми: id, размер, sha256 и время сохранения. Время " +
		"сохранения — по часам роутера и до синхронизации NTP неверно. Пустой список значит, что через metabox " +
		"ещё ничего не применялось.",
	"Content of one config version from metabox_config_versions. Secrets are masked " +
		"(secret, password, private_key, pre_shared_key, psk, token, auth_str, access_key_secret; for url and " +
		"download_url everything after the host) and cannot be revealed through MCP. Comments are removed, " +
		"since they may hold secrets the mask cannot recognise.": "Содержимое одной версии конфига из metabox_config_versions. Секреты замаскированы " +
		"(secret, password, private_key, pre_shared_key, psk, token, auth_str, access_key_secret; у url и " +
		"download_url всё после хоста) и через MCP не раскрываются. Комментарии удалены: " +
		"в них могут быть секреты, которые маска не распознаёт.",
	"Last lines of the routing core log, oldest first, the same text the panel log screen shows. " +
		"level is the minimum level: trace, debug, info, notice, warn, error, fatal or panic (default: all). " +
		"lines is 1 to 1000, default 200. Lines without a level (stack traces, continuations) pass the filter. " +
		"URLs are hidden after the host; the rest of the line is not masked and may contain addresses and " +
		"whatever else the core logs. An empty list means no line at this level since the last clear in the panel.": "Последние строки лога ядра маршрутизации, старые первыми. Панель показывает тот же текст. " +
		"level — минимальный уровень: trace, debug, info, notice, warn, error, fatal или panic (по умолчанию все). " +
		"lines — от 1 до 1000, по умолчанию 200. Строки без уровня (стектрейсы, продолжения) проходят фильтр. " +
		"В URL всё после хоста скрыто; остальное в строке не маскируется и может содержать адреса и " +
		"другие данные, которые пишет ядро. Пустой список значит, что с последней очистки в панели строк этого уровня не было.",
	"Read-only checks of traffic interception on the router. Checks whether the routing core is listening on " +
		"the configured TCP, UDP and DNS ports, whether its DNS listener answers a query, whether the firewall " +
		"rules for traffic interception are in place, and whether a direct request bypassing interception reaches the internet. " +
		"Each check reports ok, fail or skipped with a reason. A skipped check leaves that part of the setup unverified. " +
		"proxy names a node for the proxy check, which " +
		"reports the last latency recorded by the routing core. Use metabox_proxies for the time of that " +
		"measurement. not_measured means there is no record, either because the node has never been tested " +
		"or because the last test failed and erased it, so it says nothing about the node's health. To measure the node now, run a latency check from the panel.": "Проверки перехвата трафика на роутере; ничего не меняют. Проверяет, слушает ли ядро маршрутизации " +
		"настроенные порты TCP, UDP и DNS, отвечает ли ядро на DNS-запрос, действуют ли правила " +
		"файрвола для перехвата трафика и проходит ли запрос в интернет напрямую, в обход перехвата. " +
		"Результат каждой проверки — ok, fail или skipped с причиной. Если проверка пропущена, состояние этой части системы неизвестно. " +
		"Параметр proxy задаёт узел, для которого " +
		"выводится последняя задержка, записанная ядром. Время замера можно посмотреть через " +
		"metabox_proxies. not_measured означает, что записи нет. Узел могли ещё не проверять, либо последняя " +
		"проверка не прошла и запись была удалена, поэтому о здоровье узла это ничего не говорит. Новый замер можно запустить из панели.",

	"save a copy of the configuration and rule-set files: %w": "сохранение копии конфига и файлов сетов правил: %w",
	"save transaction state: %w":                              "сохранение состояния транзакции: %w",
	"write lists: %w":                                         "запись списков: %w",
	"write config: %w":                                        "запись конфига: %w",
	"check interception: %w":                                  "проверка перехвата: %w",
	"the firewall rules for traffic interception are missing after restart": "после перезапуска пропали правила файрвола для перехвата трафика",
	"service not up":                                         "служба не поднята",
	"procd still reports the old pid %d":                     "procd всё ещё сообщает прежний pid %d",
	"wait for the new service process: %w, last attempt: %w": "ожидание нового процесса службы: %w, последняя попытка: %w",
	"write dataplane model: %w":                              "запись модели обвязки: %w",
	"the firewall rules for traffic interception are still in place after interception was turned off": "правила файрвола для перехвата трафика остались после отключения перехвата",
	"the firewall is missing these chains for traffic interception: %v":                                "в файрволе отсутствуют цепочки правил для перехвата трафика: %v",
	"read the configuration for the DNS check: %w":                                                     "чтение конфига для проверки DNS: %w",
	"the configuration has no DNS listener on port %d":                                                 "в конфиге не настроен приём DNS-запросов на порту %d",
	"no previous configuration or rule-set files to restore":                                           "для восстановления нет ни сохранённого конфига, ни файлов сетов правил",
	"there was no configuration before applying, so only the rule-set files were restored":             "до применения конфига не было, восстановлены только файлы сетов правил",
	"wait for the Clash API: %w, last attempt: %w":                                                     "ожидание Clash API: %w, последняя попытка: %w",
	"request to %s: %w":                         "запрос к %s: %w",
	"%s answered %d":                            "%s ответил %d",
	"DNS probe %s via %s: %w, last attempt: %w": "DNS-проба %s через %s: %w, последняя попытка: %w",
	"DNS probe %s via %s, %d attempts: %w":      "DNS-проба %s через %s, попыток %d: %w",
	"service state not read":                    "состояние службы не прочитано",
	"the connection rule is not in the rule list of the running process": "правила соединения нет в списке правил работающего процесса",
	"service state: %w":       "состояние службы: %w",
	"build request to %s: %w": "сборка запроса к %s: %w",

	// The check of sing-box after a restart and the repair of its cache file.
	"read the configuration to check the routing core: %w":          "чтение конфига для проверки ядра маршрутизации: %w",
	"the routing core did not start: %w":                            "ядро маршрутизации не запустилось: %w",
	"the routing core did not start: %w. Last error in its log: %s": "ядро маршрутизации не запустилось: %w. Последняя ошибка в логе: %s",
	"sing-box exits on the saved subscription %q: %s":               "sing-box аварийно завершается из-за сохранённой подписки %q: %s",
	"sing-box still exits on the saved subscription %q: %s":         "sing-box всё ещё аварийно завершается из-за сохранённой подписки %q: %s",
	"read the config for the cache file: %w":                        "чтение конфига для файла кэша: %w",
	"stop sing-box before editing the cache file: %w":               "не удалось остановить sing-box перед правкой файла кэша: %w",
	"sing-box did not start after the cache file was repaired: %w":  "sing-box не запустился после правки файла кэша: %w",
	"sing-box exits on the saved subscription %q, but subscriptions are not cached in this config (store_subscriptions is off), so the daemon cannot repair it":                       "sing-box аварийно завершается из-за сохранённой подписки %q, но в этом конфиге подписки не кэшируются (store_subscriptions выключен), демон не может это починить",
	"could not remove subscription %q from the cache file (the subscription stays in the config): %w":                                                                                 "не удалось убрать подписку %q из файла кэша (сама подписка в конфиге остаётся): %w",
	"sing-box could not start on the saved subscription %s. The daemon deleted its entry from the cache file; the next subscription update downloads it again":                        "sing-box не мог запуститься из-за сохранённой подписки %s. Демон удалил её запись из файла кэша; при следующем обновлении подписка скачается заново",
	"sing-box could not start on the saved subscription %s, and the cache file did not open. The daemon renamed the file to %s; sing-box downloads subscriptions and rule sets again": "sing-box не мог запуститься из-за сохранённой подписки %s, а файл кэша не открылся. Демон переименовал файл в %s; sing-box скачает подписки и наборы правил заново",
}
