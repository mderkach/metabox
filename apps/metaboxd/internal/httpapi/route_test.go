package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"metabox/internal/httpapi"
	"metabox/internal/route"
)

// fakeExplainer подменяет объяснение маршрута: подбор правила проверяется в
// internal/route, здесь важны коды ответов и то, что происхождение доходит до
// клиента.
type fakeExplainer struct {
	explanation route.Explanation
	err         error
	calls       []string
}

func (f *fakeExplainer) Explain(_ context.Context, id string) (route.Explanation, error) {
	f.calls = append(f.calls, id)

	if f.err != nil {
		return route.Explanation{}, f.err
	}

	return f.explanation, nil
}

func newExplainServer(t *testing.T, explainer httpapi.Explainer) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{Version: "test", Explain: explainer},
	))
	t.Cleanup(srv.Close)

	return srv
}

func matchedExplanation() route.Explanation {
	index := 2

	return route.Explanation{
		ConnectionID: "c-1",
		Match: route.Match{
			Origin:     route.OriginObserved,
			Kind:       route.KindRule,
			Index:      &index,
			Conditions: "rule_set=google-ip",
			Action:     "route(proxy)",
		},
		Chain: route.Chain{Origin: route.OriginObserved, Nodes: []string{"hk-01", "proxy"}},
		Rules: []route.Rule{
			{Origin: route.OriginObserved, Index: 0, Conditions: "", Action: "sniff"},
			{Origin: route.OriginObserved, Index: 1, Conditions: "port=53", Action: "hijack-dns"},
			{Origin: route.OriginObserved, Index: 2, Conditions: "rule_set=google-ip", Action: "route(proxy)"},
		},
	}
}

func TestExplainRoute(t *testing.T) {
	explainer := &fakeExplainer{explanation: matchedExplanation()}
	srv := newExplainServer(t, explainer)

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	if got.status != http.StatusOK {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusOK)
	}
	if len(explainer.calls) != 1 || explainer.calls[0] != "c-1" {
		t.Errorf("идентификатор соединения из адреса: получили %v", explainer.calls)
	}

	var body struct {
		ConnectionID string `json:"connection_id"`
		Match        struct {
			Origin string `json:"origin"`
			Kind   string `json:"kind"`
			Index  *int   `json:"index"`
		} `json:"match"`
		Chain struct {
			Origin string   `json:"origin"`
			Nodes  []string `json:"nodes"`
		} `json:"chain"`
		Rules []struct {
			Origin string `json:"origin"`
			Index  int    `json:"index"`
		} `json:"rules"`
	}

	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("разбор ответа: %v", err)
	}

	if body.Match.Index == nil || *body.Match.Index != 2 {
		t.Errorf("индекс узла route.rules: получили %v, ожидали 2", body.Match.Index)
	}

	// Утверждений без происхождения ручка не отдаёт.
	if body.Match.Origin == "" {
		t.Error("сработавшее правило ушло без происхождения")
	}
	if body.Chain.Origin == "" {
		t.Error("цепочка ушла без происхождения")
	}
	for _, rule := range body.Rules {
		if rule.Origin == "" {
			t.Errorf("правило %d ушло без происхождения", rule.Index)
		}
	}
}

func TestExplainRouteUnknown(t *testing.T) {
	srv := newExplainServer(t, &fakeExplainer{
		explanation: route.Explanation{
			ConnectionID: "c-1",
			Match:        route.Match{Origin: route.OriginUnknown, Kind: route.KindUnknown, Reason: "core исполняет другой конфиг"},
			Chain:        route.Chain{Origin: route.OriginObserved, Nodes: []string{"direct"}},
		},
	})

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	var body struct {
		Match struct {
			Origin string `json:"origin"`
			Kind   string `json:"kind"`
			Index  *int   `json:"index"`
			Reason string `json:"reason"`
		} `json:"match"`
	}

	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("разбор ответа: %v", err)
	}

	if body.Match.Index != nil {
		t.Error("индекс в чужой документ показывать нельзя")
	}
	if body.Match.Origin != string(route.OriginUnknown) {
		t.Errorf("происхождение: получили %q, ожидали %q", body.Match.Origin, route.OriginUnknown)
	}
	if body.Match.Reason == "" {
		t.Error("неизвестность без причины наружу не уходит")
	}
}

func TestExplainRouteMissingConnection(t *testing.T) {
	srv := newExplainServer(t, &fakeExplainer{err: route.ErrNoConnection})

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	if got.status != http.StatusNotFound {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusNotFound)
	}

	var body struct {
		Code string `json:"code"`
	}

	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("разбор ответа: %v", err)
	}
	if body.Code != "connection_missing" {
		t.Errorf("код отказа: получили %q, ожидали %q", body.Code, "connection_missing")
	}
}

// Лежащий sing-box отвечает тем же текстом, что и прокси Clash API: адрес
// контроллера и ошибка транспорта остаются в логе.
func TestExplainRouteRuntimeUnavailable(t *testing.T) {
	const cause = `Get "http://127.0.0.1:9090/connections": dial tcp 127.0.0.1:9090: connect: connection refused`

	srv := newExplainServer(t, &fakeExplainer{
		err: fmt.Errorf("%w: соединения: %w", route.ErrRuntimeUnavailable, errors.New(cause)),
	})

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	if got.status != http.StatusBadGateway {
		t.Fatalf("код ответа: получили %d, ожидали %d", got.status, http.StatusBadGateway)
	}

	var body struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}

	if err := json.Unmarshal([]byte(got.body), &body); err != nil {
		t.Fatalf("разбор ответа: %v", err)
	}
	if body.Code != "runtime_unavailable" {
		t.Errorf("код отказа: получили %q, ожидали runtime_unavailable", body.Code)
	}
	if body.Message != "рантайм sing-box недоступен" {
		t.Errorf("сообщение %q, ожидали фиксированный текст без причины", body.Message)
	}
	if strings.Contains(got.body, "127.0.0.1") {
		t.Errorf("тело %q уносит наружу адрес контроллера", got.body)
	}
}

// Без источника рантайма ручки объяснения нет: панель открывается, а экран
// соединений остаётся без объяснения.
func TestExplainRouteAbsent(t *testing.T) {
	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{Version: "test"},
	))
	t.Cleanup(srv.Close)

	got := request(t, srv, http.MethodGet, "/api/connections/c-1/route", "", nil)

	if got.status != http.StatusNotFound {
		t.Errorf("код ответа: получили %d, ожидали %d", got.status, http.StatusNotFound)
	}
}

// Апгрейд до WebSocket на ветке прокси закрыт: рантайм идёт одним потоком
// `/api/events`, и второго пути к тем же данным быть не должно.
func TestClashProxyRejectsUpgrade(t *testing.T) {
	var proxied int

	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{
			Version: "test",
			Clash: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				proxied++
				w.WriteHeader(http.StatusOK)
			}),
		},
	))
	t.Cleanup(srv.Close)

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, srv.URL+"/api/clash/traffic", nil)
	if err != nil {
		t.Fatalf("сборка запроса: %v", err)
	}
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")

	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("запрос: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("код ответа: получили %d, ожидали %d", resp.StatusCode, http.StatusBadRequest)
	}
	if proxied != 0 {
		t.Error("апгрейд ушёл в прокси, а должен был остановиться на границе")
	}
}

// Обычный запрос к тем же ручкам прокси проходит: правила, группы и DNS-запрос
// остаются сквозными.
func TestClashProxyPassesRequests(t *testing.T) {
	var proxied int

	srv := httptest.NewServer(httpapi.NewServer(
		&fakeApplier{},
		fakeReader{},
		testLogger(t),
		httpapi.Options{
			Version: "test",
			Clash: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				proxied++
				w.WriteHeader(http.StatusOK)
			}),
		},
	))
	t.Cleanup(srv.Close)

	got := request(t, srv, http.MethodGet, "/api/clash/rules", "", nil)

	if got.status != http.StatusOK || proxied != 1 {
		t.Errorf("запрос-ответ обязан пройти в прокси: код %d, вызовов %d", got.status, proxied)
	}
}
