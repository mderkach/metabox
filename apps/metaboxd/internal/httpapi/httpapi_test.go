package httpapi_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync"
	"testing"

	"metabox/internal/apply"
	"metabox/internal/config"
	"metabox/internal/contract"
	"metabox/internal/httpapi"
	"metabox/internal/singbox"
)

func testLogger(t *testing.T) *slog.Logger {
	t.Helper()

	return slog.New(slog.NewTextHandler(testWriter{t: t}, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

type testWriter struct {
	t *testing.T
}

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Helper()
	w.t.Log(string(p))

	return len(p), nil
}

// fakeApplier подменяет цикл применения: сам цикл проверяется в internal/apply,
// здесь важны только коды ответов и формат тела.
type fakeApplier struct {
	mu         sync.Mutex
	current    apply.Transaction
	startErr   error
	confirmErr error
	received   []byte
	lists      apply.Lists
	base       string
	listsBase  string
}

func (a *fakeApplier) Start(
	_ context.Context,
	cfg []byte,
	lists apply.Lists,
	base, listsBase string,
) (apply.Transaction, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.startErr != nil {
		return apply.Transaction{}, a.startErr
	}

	a.received = cfg
	a.lists = lists
	a.base = base
	a.listsBase = listsBase
	a.current = apply.Transaction{ID: "tx-1", Phase: apply.PhaseApplying}

	return a.current, nil
}

func (a *fakeApplier) Confirm(_ context.Context, id string) (apply.Transaction, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.confirmErr != nil {
		return apply.Transaction{}, a.confirmErr
	}
	if a.current.ID != id {
		return apply.Transaction{}, apply.ErrUnknownTransaction
	}

	a.current.Phase = apply.PhaseConfirmed

	return a.current, nil
}

func (a *fakeApplier) Current() apply.Transaction {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.current
}

func (a *fakeApplier) body() []byte {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.received
}

func (a *fakeApplier) sentBase() string {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.base
}

// fakeReader подменяет владельца файла конфига: чтение с диска проверяется в
// internal/config, здесь важно, что байты доходят до ответа неизменными.
type fakeReader struct {
	data  []byte
	lists map[string][]byte
	err   error
	// readErr ломает только чтение конфига, оставляя историю доступной.
	readErr  error
	versions []config.Version
	// byID подменяет содержимое версий; пустая карта означает, что версии нет.
	byID map[int][]byte
}

func (r fakeReader) Read(context.Context) ([]byte, error) {
	if r.err != nil {
		return nil, r.err
	}

	if r.readErr != nil {
		return nil, r.readErr
	}

	return r.data, nil
}

func (r fakeReader) ReadLists(context.Context) (map[string][]byte, error) {
	if r.err != nil {
		return nil, r.err
	}

	return r.lists, nil
}

func (r fakeReader) Versions(context.Context) ([]config.Version, error) {
	if r.err != nil {
		return nil, r.err
	}

	return r.versions, nil
}

func (r fakeReader) ReadVersion(_ context.Context, id int) ([]byte, error) {
	data, ok := r.byID[id]
	if !ok {
		return nil, config.ErrNoVersion
	}

	return data, nil
}

func newTestServer(t *testing.T, applier httpapi.Applier, allowedOrigin string) *httptest.Server {
	t.Helper()

	return newTestServerWith(t, applier, fakeReader{}, allowedOrigin, nil)
}

func newTestServerWithSPA(t *testing.T, applier httpapi.Applier, allowedOrigin string, spa http.Handler) *httptest.Server {
	t.Helper()

	return newTestServerWith(t, applier, fakeReader{}, allowedOrigin, spa)
}

func newTestServerWithReader(t *testing.T, reader httpapi.ConfigReader) *httptest.Server {
	t.Helper()

	return newTestServerWith(t, &fakeApplier{}, reader, "", nil)
}

func newTestServerWith(
	t *testing.T,
	applier httpapi.Applier,
	reader httpapi.ConfigReader,
	allowedOrigin string,
	spa http.Handler,
) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(applier, reader, testLogger(t), httpapi.Options{
		Version:        "test",
		SingboxVersion: testSingboxVersion,
		AllowedOrigin:  allowedOrigin,
		SPA:            spa,
		ConfigPath:     testConfigPath,
	}))
	t.Cleanup(srv.Close)

	return srv
}

type response struct {
	status      int
	contentType string
	header      http.Header
	body        string
}

func (r response) decode(t *testing.T, into any) {
	t.Helper()

	if err := json.Unmarshal([]byte(r.body), into); err != nil {
		t.Fatalf("разбор ответа %q: %v", r.body, err)
	}
}

func request(t *testing.T, srv *httptest.Server, method, path, origin string, body []byte) response {
	t.Helper()

	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}

	req, err := http.NewRequestWithContext(t.Context(), method, srv.URL+path, reader)
	if err != nil {
		t.Fatalf("сборка запроса %s %s: %v", method, path, err)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}

	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("запрос %s %s: %v", method, path, err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Errorf("закрытие тела ответа: %v", err)
		}
	}()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("чтение ответа %s %s: %v", method, path, err)
	}

	return response{
		status:      resp.StatusCode,
		contentType: resp.Header.Get("Content-Type"),
		header:      resp.Header,
		body:        string(raw),
	}
}

func TestHealth(t *testing.T) {
	got := request(t, newTestServer(t, &fakeApplier{}, ""), http.MethodGet, "/healthz", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusOK)
	}
	if !strings.HasPrefix(got.contentType, "application/json") {
		t.Errorf("Content-Type %q, ожидали application/json", got.contentType)
	}

	var health struct {
		Status  string `json:"status"`
		Version string `json:"version"`
	}
	got.decode(t, &health)

	if health.Status != "ok" || health.Version != "test" {
		t.Errorf("получили %+v, ожидали status ok и version test", health)
	}
}

func TestConfigServedVerbatim(t *testing.T) {
	raw := []byte("{\n  \"log\":   {\"level\": \"info\"},\n  \"неизвестная_секция\": [1,2]\n}\n")

	got := request(t, newTestServerWithReader(t, fakeReader{data: raw}), http.MethodGet, "/api/config", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusOK)
	}
	if !strings.HasPrefix(got.contentType, "application/json") {
		t.Errorf("Content-Type %q, ожидали application/json", got.contentType)
	}
	if got.body != string(raw) {
		t.Errorf("тело %q, ожидали %q", got.body, raw)
	}
	if cache := got.header.Get("Cache-Control"); cache != "no-store" {
		t.Errorf("Cache-Control %q, ожидали no-store", cache)
	}
}

func TestConfigCarriesEtag(t *testing.T) {
	raw := []byte(rawConfig)
	digest := sha256.Sum256(raw)
	want := `"` + hex.EncodeToString(digest[:]) + `"`

	got := request(t, newTestServerWithReader(t, fakeReader{data: raw}), http.MethodGet, "/api/config", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusOK)
	}
	if etag := got.header.Get("ETag"); etag != want {
		t.Errorf("ETag %q, ожидали %q: панели нечего вернуть в If-Match", etag, want)
	}
}

func TestConfigMissingIsNotFound(t *testing.T) {
	got := request(t, newTestServerWithReader(t, fakeReader{err: config.ErrNoConfig}),
		http.MethodGet, "/api/config", "", nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusNotFound)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "config_missing" {
		t.Errorf("код ошибки %q, ожидали config_missing", apiErr.Code)
	}
	if strings.Contains(got.body, "config.json") {
		t.Errorf("тело %q: путь к конфигу наружу не идёт", got.body)
	}
}

func TestConfigReadFailureHidesDetails(t *testing.T) {
	reader := fakeReader{err: errors.New("чтение конфига /etc/sing-box/config.json: отказано в доступе")}

	got := request(t, newTestServerWithReader(t, reader), http.MethodGet, "/api/config", "", nil)

	if got.status != http.StatusInternalServerError {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusInternalServerError)
	}
	if strings.Contains(got.body, "/etc/sing-box") {
		t.Errorf("тело %q: путь на диске наружу не идёт", got.body)
	}
}

func TestAPINotFound(t *testing.T) {
	got := request(t, newTestServer(t, &fakeApplier{}, ""), http.MethodGet, "/api/nope", "", nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusNotFound)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "not_found" {
		t.Errorf("код ошибки %q, ожидали not_found", apiErr.Code)
	}
}

func TestMutatingRequestChecksOrigin(t *testing.T) {
	const devOrigin = "http://localhost:5173"

	tests := []struct {
		name string
		// ownOrigin подставляет адрес самого тестового сервера.
		ownOrigin     bool
		origin        string
		allowedOrigin string
		// 404 означает, что запрос прошёл проверку и дошёл до маршрутизации.
		want int
	}{
		{name: "свой origin проходит", ownOrigin: true, want: http.StatusNotFound},
		{name: "дев-стенд по флагу проходит", origin: devOrigin, allowedOrigin: devOrigin, want: http.StatusNotFound},
		{name: "чужой origin отклонён", origin: "http://evil.example", want: http.StatusForbidden},
		{name: "без origin отклонён", want: http.StatusForbidden},
		{name: "флаг не открывает чужой origin", origin: "http://evil.example", allowedOrigin: devOrigin, want: http.StatusForbidden},
		{name: "дев-origin без флага отклонён", origin: devOrigin, want: http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newTestServer(t, &fakeApplier{}, tt.allowedOrigin)

			origin := tt.origin
			if tt.ownOrigin {
				origin = srv.URL
			}

			got := request(t, srv, http.MethodPost, "/api/nope", origin, nil)
			if got.status != tt.want {
				t.Errorf("origin %q: код %d, ожидали %d", origin, got.status, tt.want)
			}
		})
	}
}

func TestMutatingMethodsAllChecked(t *testing.T) {
	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		t.Run(method, func(t *testing.T) {
			got := request(t, newTestServer(t, &fakeApplier{}, ""), method, "/api/nope", "http://evil.example", nil)
			if got.status != http.StatusForbidden {
				t.Errorf("код %d, ожидали %d", got.status, http.StatusForbidden)
			}
		})
	}
}

func TestReadRequestSkipsOriginCheck(t *testing.T) {
	got := request(t, newTestServer(t, &fakeApplier{}, ""), http.MethodGet, "/healthz", "http://evil.example", nil)

	if got.status != http.StatusOK {
		t.Errorf("код %d, ожидали %d: проверка источника не касается чтения", got.status, http.StatusOK)
	}
}

const rawConfig = `{"log":{"level":"info"}}`

// Путь стенда: демон отдаёт его как есть, значение здесь роли не играет.
const (
	testConfigPath     = "/tmp/metabox-test/config.json"
	testSingboxVersion = "1.14.0-extended-2.7.1"
)

// apply отправляет конфиг со своим Origin: проверка источника здесь не предмет
// теста, её закрывает TestMutatingRequestChecksOrigin.
func applyRequest(t *testing.T, srv *httptest.Server, body []byte) response {
	t.Helper()

	return request(t, srv, http.MethodPost, "/api/apply", srv.URL, body)
}

func TestApplyStartsTransaction(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	got := applyRequest(t, srv, []byte(rawConfig))

	if got.status != http.StatusAccepted {
		t.Fatalf("код %d, ожидали %d: применение асинхронно", got.status, http.StatusAccepted)
	}

	var tx apply.Transaction
	got.decode(t, &tx)

	if tx.ID == "" {
		t.Error("ответ без идентификатора транзакции: клиенту нечего опрашивать")
	}
	if !bytes.Equal(applier.body(), []byte(rawConfig)) {
		t.Errorf("до применения доехало %q, отправляли %q", applier.body(), rawConfig)
	}
}

func TestApplyPassesClientBase(t *testing.T) {
	tests := []struct {
		name    string
		ifMatch string
		want    string
	}{
		{"без заголовка применение идёт без сверки", "", ""},
		{"ETag передаётся без кавычек", `"abc123"`, "abc123"},
		{"слабый валидатор принимается", `W/"abc123"`, "abc123"},
		{"звёздочка означает «любая база»", "*", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			applier := &fakeApplier{}
			srv := newTestServer(t, applier, "")

			req, err := http.NewRequestWithContext(t.Context(), http.MethodPost,
				srv.URL+"/api/apply", strings.NewReader(rawConfig))
			if err != nil {
				t.Fatalf("сборка запроса: %v", err)
			}
			req.Header.Set("Origin", srv.URL)
			if tt.ifMatch != "" {
				req.Header.Set("If-Match", tt.ifMatch)
			}

			resp, err := srv.Client().Do(req)
			if err != nil {
				t.Fatalf("запрос применения: %v", err)
			}
			if err := resp.Body.Close(); err != nil {
				t.Errorf("закрытие тела ответа: %v", err)
			}

			if resp.StatusCode != http.StatusAccepted {
				t.Fatalf("код %d, ожидали %d", resp.StatusCode, http.StatusAccepted)
			}
			if got := applier.sentBase(); got != tt.want {
				t.Errorf("база %q, ожидали %q", got, tt.want)
			}
		})
	}
}

// Вывод бинаря — единственное исключение из правила «внутренние подробности
// наружу не идут»: на нём пользователь чинит конфиг.
func TestApplyReturnsCheckOutputVerbatim(t *testing.T) {
	applier := &fakeApplier{startErr: &singbox.CheckError{
		Stdout:   "разбор конфига",
		Stderr:   "FATAL[0000] decode config at 12: unknown outbound type",
		ExitCode: 1,
	}}

	got := applyRequest(t, newTestServer(t, applier, ""), []byte(rawConfig))

	if got.status != http.StatusUnprocessableEntity {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusUnprocessableEntity)
	}

	var apiErr struct {
		Code    string `json:"code"`
		Details struct {
			Stdout   string `json:"stdout"`
			Stderr   string `json:"stderr"`
			ExitCode int    `json:"exit_code"`
		} `json:"details"`
	}
	got.decode(t, &apiErr)

	if apiErr.Code != "check_failed" {
		t.Errorf("код ошибки %q, ожидали check_failed", apiErr.Code)
	}
	if apiErr.Details.Stderr != "FATAL[0000] decode config at 12: unknown outbound type" {
		t.Errorf("stderr изменён: %q", apiErr.Details.Stderr)
	}
	if apiErr.Details.ExitCode != 1 {
		t.Errorf("код возврата %d, ожидали 1", apiErr.Details.ExitCode)
	}
}

func TestApplyMapsDomainErrors(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		want     int
		wantCode contract.ErrorCode
	}{
		{"применение уже идёт", apply.ErrBusy, http.StatusConflict, contract.ErrApplyInProgress},
		{"конфиг правили извне", apply.ErrConfigModified, http.StatusConflict, contract.ErrConfigModified},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := applyRequest(t, newTestServer(t, &fakeApplier{startErr: tt.err}, ""), []byte(rawConfig))

			if got.status != tt.want {
				t.Fatalf("код %d, ожидали %d", got.status, tt.want)
			}

			var apiErr contract.Error
			got.decode(t, &apiErr)

			if apiErr.Code != tt.wantCode {
				t.Errorf("код ошибки %q, ожидали %q", apiErr.Code, tt.wantCode)
			}
		})
	}
}

// Без лимита один запрос забирает столько памяти, сколько прислали.
func TestApplyRejectsOversizedBody(t *testing.T) {
	got := applyRequest(t, newTestServer(t, &fakeApplier{}, ""), bytes.Repeat([]byte("щ"), 8<<20))

	if got.status != http.StatusRequestEntityTooLarge {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusRequestEntityTooLarge)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "config_too_large" {
		t.Errorf("код ошибки %q, ожидали config_too_large", apiErr.Code)
	}
}

func TestApplyStateAndConfirm(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	var started apply.Transaction
	applyRequest(t, srv, []byte(rawConfig)).decode(t, &started)

	state := request(t, srv, http.MethodGet, "/api/apply/"+started.ID, "", nil)
	if state.status != http.StatusOK {
		t.Fatalf("состояние транзакции: код %d", state.status)
	}

	unknown := request(t, srv, http.MethodGet, "/api/apply/чужая", "", nil)
	if unknown.status != http.StatusNotFound {
		t.Errorf("чужой идентификатор: код %d, ожидали %d", unknown.status, http.StatusNotFound)
	}

	confirm := request(t, srv, http.MethodPost, "/api/apply/"+started.ID+"/confirm", srv.URL, nil)
	if confirm.status != http.StatusOK {
		t.Fatalf("подтверждение: код %d", confirm.status)
	}

	var confirmed apply.Transaction
	confirm.decode(t, &confirmed)

	if confirmed.Phase != apply.PhaseConfirmed {
		t.Errorf("фаза %q, ожидали подтверждение", confirmed.Phase)
	}
}

func TestConfirmNothingToConfirm(t *testing.T) {
	applier := &fakeApplier{confirmErr: apply.ErrNothingToConfirm}
	srv := newTestServer(t, applier, "")

	got := request(t, srv, http.MethodPost, "/api/apply/tx-1/confirm", srv.URL, nil)
	if got.status != http.StatusConflict {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusConflict)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "nothing_to_confirm" {
		t.Errorf("код ошибки %q, ожидали nothing_to_confirm", apiErr.Code)
	}
}

// Формы панели построены по схеме одной версии форка: без версии устройства
// расхождение со схемой ничем не видно.
func TestStatusReportsSingboxVersion(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	var status struct {
		SingboxVersion string `json:"singbox_version"`
	}
	request(t, srv, http.MethodGet, "/api/status", "", nil).decode(t, &status)

	if status.SingboxVersion != testSingboxVersion {
		t.Errorf("версия %q, ожидали %q", status.SingboxVersion, testSingboxVersion)
	}
}

// Без состава сборки панель не отличит «типа нет в бинаре» от «бинарь не
// прочитан», поэтому второе выражается отсутствием поля, а не пустым списком.
func TestStatusReportsSingboxBuild(t *testing.T) {
	tests := []struct {
		name string
		tags []string
		want *[]string
	}{
		{"теги прочитаны", []string{"with_quic"}, &[]string{"with_quic"}},
		{"сборка без тегов", []string{}, &[]string{}},
		{"бинарь не прочитан", nil, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, nil, testLogger(t), httpapi.Options{
				Version:     "test",
				SingboxTags: tt.tags,
			}))
			t.Cleanup(srv.Close)

			var status struct {
				SingboxBuild *struct {
					Tags []string `json:"tags"`
				} `json:"singbox_build"`
			}
			request(t, srv, http.MethodGet, "/api/status", "", nil).decode(t, &status)

			if tt.want == nil {
				if status.SingboxBuild != nil {
					t.Errorf("состав сборки %v, ожидали отсутствие поля", status.SingboxBuild)
				}
				return
			}
			if status.SingboxBuild == nil || !slices.Equal(status.SingboxBuild.Tags, *tt.want) {
				t.Errorf("состав сборки %v, ожидали теги %v", status.SingboxBuild, *tt.want)
			}
			if status.SingboxBuild.Tags == nil {
				t.Error("пустой список тегов ушёл как null")
			}
		})
	}
}

// Путь конфига задаётся флагами запуска, поэтому панель обязана получать его
// с демона, а не держать у себя константу.
func TestStatusReportsConfigPath(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	var status struct {
		ConfigPath string `json:"config_path"`
	}
	request(t, srv, http.MethodGet, "/api/status", "", nil).decode(t, &status)

	if status.ConfigPath != testConfigPath {
		t.Errorf("путь %q, ожидали %q", status.ConfigPath, testConfigPath)
	}
}

// Перезагрузка страницы не должна терять идущее применение: его идентификатор
// жил только в ответе на POST.
func TestStatusLinksActiveTransaction(t *testing.T) {
	applier := &fakeApplier{}
	srv := newTestServer(t, applier, "")

	empty := request(t, srv, http.MethodGet, "/api/status", "", nil)

	var before struct {
		Version         string             `json:"version"`
		Transaction     *apply.Transaction `json:"transaction"`
		TransactionHref string             `json:"transaction_href"`
	}
	empty.decode(t, &before)

	if before.Transaction != nil {
		t.Errorf("до применения статус несёт транзакцию %+v", before.Transaction)
	}
	if before.Version != "test" {
		t.Errorf("версия %q, ожидали test", before.Version)
	}

	var started apply.Transaction
	applyRequest(t, srv, []byte(rawConfig)).decode(t, &started)

	after := request(t, srv, http.MethodGet, "/api/status", "", nil)

	var status struct {
		Transaction     *apply.Transaction `json:"transaction"`
		TransactionHref string             `json:"transaction_href"`
	}
	after.decode(t, &status)

	if status.Transaction == nil || status.Transaction.ID != started.ID {
		t.Fatalf("статус не отдал идущую транзакцию: %+v", status.Transaction)
	}
	if status.TransactionHref != "/api/apply/"+started.ID {
		t.Errorf("ссылка %q, ожидали /api/apply/%s", status.TransactionHref, started.ID)
	}

	// Ссылка обязана вести на живую ручку, а не быть строкой на вид.
	followed := request(t, srv, http.MethodGet, status.TransactionHref, "", nil)
	if followed.status != http.StatusOK {
		t.Errorf("переход по ссылке дал %d", followed.status)
	}
}

// Роутинг у SPA клиентский: всё, что не под /api/, уходит интерфейсу.
func TestUnknownPathGoesToSPA(t *testing.T) {
	spa := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("оболочка"))
	})
	srv := newTestServerWithSPA(t, &fakeApplier{}, "", spa)

	for _, path := range []string{"/", "/connections", "/config/outbounds/2"} {
		t.Run(path, func(t *testing.T) {
			got := request(t, srv, http.MethodGet, path, "", nil)

			if got.status != http.StatusOK || got.body != "оболочка" {
				t.Errorf("код %d, тело %q: ожидали оболочку SPA", got.status, got.body)
			}
		})
	}
}

// Под /api/ по-прежнему JSON, а не index.html: иначе фронт получит HTML вместо
// разбираемого ответа.
func TestAPIPathNeverReachesSPA(t *testing.T) {
	spa := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("оболочка"))
	})

	got := request(t, newTestServerWithSPA(t, &fakeApplier{}, "", spa), http.MethodGet, "/api/нет", "", nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("код %d, ожидали %d", got.status, http.StatusNotFound)
	}

	var apiErr contract.Error
	got.decode(t, &apiErr)

	if apiErr.Code != "not_found" {
		t.Errorf("код ошибки %q, ожидали not_found", apiErr.Code)
	}
}

// Демон, собранный без фронта, обязан подниматься и обслуживать API: панель
// объясняет, чего не хватает, а не молчит 404.
func TestDaemonWithoutSPAStillServesAPI(t *testing.T) {
	srv := newTestServer(t, &fakeApplier{}, "")

	root := request(t, srv, http.MethodGet, "/", "", nil)
	if root.status != http.StatusServiceUnavailable {
		t.Errorf("код %d, ожидали %d", root.status, http.StatusServiceUnavailable)
	}
	if !strings.Contains(root.body, "make daemon") {
		t.Errorf("тело %q не объясняет, как собрать интерфейс", root.body)
	}

	if got := request(t, srv, http.MethodGet, "/healthz", "", nil); got.status != http.StatusOK {
		t.Errorf("API не работает без фронта: код %d", got.status)
	}
}
