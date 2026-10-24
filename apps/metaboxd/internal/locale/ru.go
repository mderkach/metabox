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
}
