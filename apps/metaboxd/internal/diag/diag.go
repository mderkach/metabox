// Package diag проверяет сетевую обвязку sing-box по модели из UCI: слушает ли
// кто-то порты inbound, отвечает ли dns-in, стоят ли цепочки nft и выходит ли
// роутер в интернет через выбранный узел и напрямую.
//
// Проверки только читают: правил, конфига и службы диагностика не трогает.
package diag

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"metabox/internal/clashapi"
	"metabox/internal/config"
	"metabox/internal/dataplane"
)

// detailLimit — потолок подробности: в неё попадает ответ Clash API.
const detailLimit = 300

// CheckName — что проверялось. Набор закрытый: по нему панель подписывает строку
// отчёта.
type CheckName string

const (
	// NameRedirectPort — слушатель TCP на redirect_port: сюда nft уводит TCP
	// из LAN.
	NameRedirectPort CheckName = "redirect_port"
	// NameTproxyPort — слушатель UDP на tproxy_port.
	NameTproxyPort CheckName = "tproxy_port"
	// NameDNSPort — слушатель UDP на dns_port: сюда dnsmasq отдаёт запросы.
	NameDNSPort CheckName = "dns_port"
	// NameDNSProbe — dns-in применённого конфига разрешает имя.
	NameDNSProbe CheckName = "dns_probe"
	// NameChains — цепочки обвязки стоят в таблице fw4.
	NameChains CheckName = "nft_chains"
	// NameProxy — задержка узла через Clash API.
	NameProxy CheckName = "proxy"
	// NameDirect — выход в интернет мимо перехвата, с меткой self_mark.
	NameDirect CheckName = "direct"
)

// CheckStatus — итог проверки.
type CheckStatus string

// Итоги проверки: skipped — проверять не к чему или нечем, это не отказ.
const (
	StatusOK      CheckStatus = "ok"
	StatusFail    CheckStatus = "fail"
	StatusSkipped CheckStatus = "skipped"
)

// CheckReason — почему проверка не прошла или пропущена. Набор закрытый: по нему
// панель выбирает текст на языке пользователя.
type CheckReason string

const (
	// ReasonModelUnavailable — модель обвязки не прочитана или не принята.
	ReasonModelUnavailable CheckReason = "model_unavailable"
	// ReasonInterceptionDisabled — перехват в модели выключен: порты, dns-in
	// и цепочки не нужны.
	ReasonInterceptionDisabled CheckReason = "interception_disabled"
	// ReasonNotListening — порт никто не слушает: sing-box не поднят или в
	// конфиге нет такого inbound.
	ReasonNotListening CheckReason = "not_listening"
	// ReasonProcUnavailable — таблица сокетов /proc/net не прочитана.
	ReasonProcUnavailable CheckReason = "proc_unavailable"
	// ReasonConfigMissing — применённого конфига нет.
	ReasonConfigMissing CheckReason = "config_missing"
	// ReasonNoDNSInbound — в конфиге нет inbound direct на dns_port.
	ReasonNoDNSInbound CheckReason = "no_dns_inbound"
	// ReasonDNSNameUnset — имя пробы не задано флагом.
	ReasonDNSNameUnset CheckReason = "dns_name_unset"
	// ReasonNoAnswer — dns-in не ответил адресом.
	ReasonNoAnswer CheckReason = "no_answer"
	// ReasonNFTUnavailable — nft не запустился или путь к нему не задан.
	ReasonNFTUnavailable CheckReason = "nft_unavailable"
	// ReasonNFTUnparsed — вывод nft не разобран.
	ReasonNFTUnparsed CheckReason = "nft_unparsed"
	// ReasonChainsMissing — части цепочек нет; их имена — в Missing.
	ReasonChainsMissing CheckReason = "chains_missing"
	// ReasonProxyUnset — узел не выбран.
	ReasonProxyUnset CheckReason = "proxy_unset"
	// ReasonProxyMissing — Clash API такого узла не знает.
	ReasonProxyMissing CheckReason = "proxy_missing"
	// ReasonRuntimeUnavailable — Clash API не отвечает.
	ReasonRuntimeUnavailable CheckReason = "runtime_unavailable"
	// ReasonRequestFailed — запрос к проверочному адресу не прошёл.
	ReasonRequestFailed CheckReason = "request_failed"
	// ReasonUnsupported — проверка невозможна на этой платформе: метка
	// сокета есть только в Linux.
	ReasonUnsupported CheckReason = "unsupported"
)

// Check — одна проверка.
type Check struct {
	Name   CheckName   `json:"name"`
	Status CheckStatus `json:"status"`
	// Reason — пусто при ok.
	Reason CheckReason `json:"reason,omitempty"`
	// Detail — подробность на языке демона: порт, исходная ошибка, ответ
	// Clash API. Панель показывает её под своим текстом, а не вместо него.
	Detail string `json:"detail,omitempty"`
	// Missing — отсутствующие цепочки при chains_missing.
	Missing []string `json:"missing,omitempty"`
	// DelayMS — задержка при ok у proxy и direct.
	DelayMS int `json:"delay_ms,omitempty"`
}

// Report — отчёт в фиксированном порядке проверок.
type Report struct {
	Checks []Check `json:"checks"`
}

// Plane читает модель обвязки и цепочки nft.
type Plane interface {
	Model(ctx context.Context) (dataplane.Model, error)
	Chains(ctx context.Context) ([]string, dataplane.AppliedReason, error)
}

// DNSProber шлёт запрос в dns-in.
type DNSProber interface {
	Probe(ctx context.Context, in clashapi.DNSInbound) error
}

// ConfigReader отдаёт применённый конфиг; отсутствие файла —
// config.ErrNoConfig.
type ConfigReader interface {
	Read(ctx context.Context) ([]byte, error)
}

// Options — то, что демон получает флагами.
type Options struct {
	// ProcNet — каталог таблиц сокетов, `/proc/net` на устройстве.
	ProcNet string
	// URL — адрес проверки выхода в интернет; ответ ниже 400 — успех.
	URL string
	// Timeout — потолок одной сетевой проверки.
	Timeout time.Duration
}

// Checker прогоняет проверки. Ничего не кэширует: модель, конфиг и правила
// меняются мимо демона.
type Checker struct {
	plane  Plane
	config ConfigReader
	dns    DNSProber
	opts   Options
	client *http.Client
}

// New собирает проверки. dns nil — имя пробы не задано, проба пропускается.
func New(plane Plane, cfg ConfigReader, dns DNSProber, opts Options) *Checker {
	// Диагностика редкая: держать соединение к контроллеру между прогонами
	// незачем.
	client := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}}

	return &Checker{plane: plane, config: cfg, dns: dns, opts: opts, client: client}
}

// Run прогоняет все проверки; proxy — узел, через который проверяется выход.
// Сетевые проверки идут параллельно: последовательно отчёт ждал бы сумму их
// таймаутов. Отказ проверки — строка отчёта, а не ошибка; ошибка — только
// отмена ctx.
func (c *Checker) Run(ctx context.Context, proxy string) (Report, error) {
	model, modelErr := c.plane.Model(ctx)
	cfg, cfgErr := c.config.Read(ctx)

	if err := ctx.Err(); err != nil {
		return Report{}, err
	}

	checks := []func(context.Context) Check{
		func(ctx context.Context) Check {
			return c.port(ctx, NameRedirectPort, model, modelErr, "tcp", model.RedirectPort)
		},
		func(ctx context.Context) Check {
			return c.port(ctx, NameTproxyPort, model, modelErr, "udp", model.TproxyPort)
		},
		func(ctx context.Context) Check {
			return c.port(ctx, NameDNSPort, model, modelErr, "udp", model.DNSPort)
		},
		func(ctx context.Context) Check { return c.dnsProbe(ctx, model, modelErr, cfg, cfgErr) },
		func(ctx context.Context) Check { return c.chains(ctx, model, modelErr) },
		func(ctx context.Context) Check { return c.proxy(ctx, proxy, cfg, cfgErr) },
		func(ctx context.Context) Check { return c.direct(ctx, model, modelErr) },
	}

	out := make([]Check, len(checks))

	var wg sync.WaitGroup

	for i, check := range checks {
		wg.Go(func() {
			checkCtx, cancel := context.WithTimeout(ctx, c.opts.Timeout)
			defer cancel()

			out[i] = check(checkCtx)
		})
	}

	wg.Wait()

	if err := ctx.Err(); err != nil {
		return Report{}, err
	}

	return Report{Checks: out}, nil
}

// interception отдаёт пропуск, когда проверки обвязки не к чему применять.
func interception(name CheckName, modelErr error, model dataplane.Model) (Check, bool) {
	switch {
	case modelErr != nil:
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonModelUnavailable, Detail: modelErr.Error()}, true
	case !model.Enabled:
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonInterceptionDisabled}, true
	default:
		return Check{}, false
	}
}

// port проверяет слушателя. TCP — подключением к loopback: туда же nft
// уводит перехваченный трафик, и слушатель на wildcard на нём отвечает. UDP —
// по таблицам /proc/net: подключение к UDP ничего не доказывает. Подключение
// к redirect-inbound оставляет в логе sing-box строку об отказе: исходного
// адреса назначения у такого соединения нет.
func (c *Checker) port(ctx context.Context, name CheckName, model dataplane.Model, modelErr error, network string, port int) Check {
	if skip, ok := interception(name, modelErr, model); ok {
		return skip
	}

	detail := strconv.Itoa(port) + "/" + network

	if network == "tcp" {
		var d net.Dialer

		conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
		if err != nil {
			return Check{Name: name, Status: StatusFail, Reason: ReasonNotListening, Detail: detail}
		}

		_ = conn.Close()

		return Check{Name: name, Status: StatusOK, Detail: detail}
	}

	listening, err := c.udpListening(port)
	if err != nil {
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonProcUnavailable, Detail: detail}
	}

	if !listening {
		return Check{Name: name, Status: StatusFail, Reason: ReasonNotListening, Detail: detail}
	}

	return Check{Name: name, Status: StatusOK, Detail: detail}
}

// udpListening ищет несвязанный сокет UDP на порту в udp и udp6. Ошибка —
// когда не прочиталась ни одна таблица.
func (c *Checker) udpListening(port int) (bool, error) {
	var read bool

	for _, table := range []string{"udp", "udp6"} {
		data, err := os.ReadFile(filepath.Join(c.opts.ProcNet, table))
		if err != nil {
			continue
		}

		read = true

		if udpBound(string(data), port) {
			return true, nil
		}
	}

	if !read {
		return false, errors.New("таблицы сокетов UDP не прочитаны")
	}

	return false, nil
}

// udpBound разбирает таблицу /proc/net/udp: локальный адрес — `адрес:порт` в
// шестнадцатеричном виде, состояние 07 — сокет без пары, то есть слушатель.
func udpBound(table string, port int) bool {
	want := fmt.Sprintf(":%04X", port)

	for line := range strings.SplitSeq(table, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		if strings.HasSuffix(fields[1], want) && fields[3] == "07" {
			return true
		}
	}

	return false
}

func (c *Checker) dnsProbe(ctx context.Context, model dataplane.Model, modelErr error, cfg []byte, cfgErr error) Check {
	if skip, ok := interception(NameDNSProbe, modelErr, model); ok {
		return skip
	}

	if c.dns == nil {
		return Check{Name: NameDNSProbe, Status: StatusSkipped, Reason: ReasonDNSNameUnset}
	}

	if skip, ok := configSkip(NameDNSProbe, cfgErr); ok {
		return skip
	}

	in, found, err := clashapi.ReadDNSInbound(cfg, model.DNSPort)
	if err != nil || !found {
		return Check{Name: NameDNSProbe, Status: StatusFail, Reason: ReasonNoDNSInbound, Detail: strconv.Itoa(model.DNSPort)}
	}

	if err := c.dns.Probe(ctx, in); err != nil {
		return Check{Name: NameDNSProbe, Status: StatusFail, Reason: ReasonNoAnswer, Detail: clamp(err.Error())}
	}

	return Check{Name: NameDNSProbe, Status: StatusOK, Detail: in.Address}
}

func (c *Checker) chains(ctx context.Context, model dataplane.Model, modelErr error) Check {
	if skip, ok := interception(NameChains, modelErr, model); ok {
		return skip
	}

	present, reason, err := c.plane.Chains(ctx)

	switch {
	case err != nil:
		return Check{Name: NameChains, Status: StatusSkipped, Reason: ReasonNFTUnavailable, Detail: err.Error()}
	case reason == dataplane.NFTUnparsed:
		return Check{Name: NameChains, Status: StatusSkipped, Reason: ReasonNFTUnparsed}
	case reason != "":
		return Check{Name: NameChains, Status: StatusSkipped, Reason: ReasonNFTUnavailable}
	}

	var missing []string

	for _, chain := range dataplane.ExpectedChains() {
		if !slices.Contains(present, chain) {
			missing = append(missing, chain)
		}
	}

	if len(missing) > 0 {
		return Check{
			Name:    NameChains,
			Status:  StatusFail,
			Reason:  ReasonChainsMissing,
			Detail:  strings.Join(missing, ", "),
			Missing: missing,
		}
	}

	return Check{Name: NameChains, Status: StatusOK}
}

func configSkip(name CheckName, cfgErr error) (Check, bool) {
	switch {
	case errors.Is(cfgErr, config.ErrNoConfig):
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonConfigMissing}, true
	case cfgErr != nil:
		return Check{Name: name, Status: StatusSkipped, Reason: ReasonConfigMissing, Detail: cfgErr.Error()}, true
	default:
		return Check{}, false
	}
}

// proxy меряет задержку узла ручкой Clash API `/proxies/{name}/delay`:
// запрос к адресу проверки делает сам sing-box через этот узел.
func (c *Checker) proxy(ctx context.Context, proxy string, cfg []byte, cfgErr error) Check {
	if proxy == "" {
		return Check{Name: NameProxy, Status: StatusSkipped, Reason: ReasonProxyUnset}
	}

	if skip, ok := configSkip(NameProxy, cfgErr); ok {
		return skip
	}

	settings, err := clashapi.Read(cfg)
	if err != nil {
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRuntimeUnavailable}
	}

	base, err := settings.BaseURL()
	if err != nil {
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRuntimeUnavailable}
	}

	query := url.Values{
		"url": {c.opts.URL},
		// Замер обязан закончиться раньше потолка проверки, иначе вместо
		// ответа Clash API придёт отмена.
		"timeout": {strconv.Itoa(int(c.opts.Timeout * 4 / 5 / time.Millisecond))},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		base+"/proxies/"+url.PathEscape(proxy)+"/delay?"+query.Encode(), nil)
	if err != nil {
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRequestFailed}
	}

	if settings.Secret != "" {
		req.Header.Set("Authorization", "Bearer "+settings.Secret)
	}

	res, err := c.client.Do(req)
	if err != nil {
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRuntimeUnavailable}
	}
	defer func() { _ = res.Body.Close() }()

	var body struct {
		Delay   int    `json:"delay"`
		Message string `json:"message"`
	}

	_ = json.NewDecoder(io.LimitReader(res.Body, 4<<10)).Decode(&body)

	switch res.StatusCode {
	case http.StatusOK:
		return Check{Name: NameProxy, Status: StatusOK, DelayMS: body.Delay, Detail: proxy}
	case http.StatusNotFound:
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonProxyMissing, Detail: proxy}
	default:
		return Check{Name: NameProxy, Status: StatusFail, Reason: ReasonRequestFailed, Detail: clamp(body.Message)}
	}
}

// direct идёт к адресу проверки сокетом с меткой self_mark: такой пакет nft
// пропускает мимо перехвата. Имя адреса разрешает системный резолвер, то есть
// dnsmasq, — при включённом перехвате это тот же dns-in, и проверка говорит
// о прямом пути TCP, а не DNS.
func (c *Checker) direct(ctx context.Context, model dataplane.Model, modelErr error) Check {
	if modelErr != nil {
		return Check{Name: NameDirect, Status: StatusSkipped, Reason: ReasonModelUnavailable, Detail: modelErr.Error()}
	}

	control, ok := markControl(model.SelfMark)
	if !ok {
		return Check{Name: NameDirect, Status: StatusSkipped, Reason: ReasonUnsupported}
	}

	dialer := &net.Dialer{Control: control}
	client := &http.Client{
		Transport: &http.Transport{DialContext: dialer.DialContext, DisableKeepAlives: true},
		// Редирект проверочного адреса — уже ответ: сеть есть.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.opts.URL, nil)
	if err != nil {
		return Check{Name: NameDirect, Status: StatusFail, Reason: ReasonRequestFailed}
	}

	started := time.Now()

	res, err := client.Do(req)
	if err != nil {
		return Check{Name: NameDirect, Status: StatusFail, Reason: ReasonRequestFailed, Detail: clamp(err.Error())}
	}

	_ = res.Body.Close()

	if res.StatusCode >= http.StatusBadRequest {
		return Check{Name: NameDirect, Status: StatusFail, Reason: ReasonRequestFailed, Detail: res.Status}
	}

	return Check{Name: NameDirect, Status: StatusOK, DelayMS: int(time.Since(started) / time.Millisecond)}
}

func clamp(s string) string {
	if len(s) <= detailLimit {
		return s
	}

	return s[:detailLimit] + "…"
}
