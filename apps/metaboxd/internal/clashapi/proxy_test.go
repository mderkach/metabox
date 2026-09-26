package clashapi_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"metabox/internal/clashapi"
)

func resolver(address, secret string) clashapi.Resolver {
	return func(context.Context) (clashapi.Settings, error) {
		return clashapi.Settings{Address: address, Secret: secret}, nil
	}
}

func TestProxyForwardsToController(t *testing.T) {
	tests := []struct {
		name     string
		request  string
		secret   string
		wantPath string
		wantAuth string
	}{
		{"префикс снимается", clashapi.Prefix + "/rules", "", "/rules", ""},
		{"вложенный путь", clashapi.Prefix + "/providers/proxies", "", "/providers/proxies", ""},
		{"секрет подставляет демон", clashapi.Prefix + "/version", "s3cret", "/version", "Bearer s3cret"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotPath, gotAuth string

			controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				gotAuth = r.Header.Get("Authorization")
				w.WriteHeader(http.StatusOK)
			}))
			defer controller.Close()

			proxy, err := clashapi.NewProxy(
				resolver(strings.TrimPrefix(controller.URL, "http://"), tt.secret),
				func(w http.ResponseWriter, _ *http.Request, _ error) { w.WriteHeader(http.StatusBadGateway) },
			)
			if err != nil {
				t.Fatalf("сборка прокси: %v", err)
			}

			rec := httptest.NewRecorder()
			proxy.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, tt.request, nil))

			if rec.Code != http.StatusOK {
				t.Fatalf("код ответа: получили %d, ожидали %d", rec.Code, http.StatusOK)
			}

			if gotPath != tt.wantPath {
				t.Errorf("путь у контроллера: получили %q, ожидали %q", gotPath, tt.wantPath)
			}

			if gotAuth != tt.wantAuth {
				t.Errorf("заголовок авторизации: получили %q, ожидали %q", gotAuth, tt.wantAuth)
			}
		})
	}
}

// Заголовок, пришедший от браузера, до контроллера доходить не должен: секрет
// ставит демон, и подделать его со страницы нельзя.
func TestProxyDropsClientCredentials(t *testing.T) {
	var gotAuth, gotCookie string

	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotCookie = r.Header.Get("Cookie")
		w.WriteHeader(http.StatusOK)
	}))
	defer controller.Close()

	proxy, err := clashapi.NewProxy(
		resolver(strings.TrimPrefix(controller.URL, "http://"), ""),
		func(w http.ResponseWriter, _ *http.Request, _ error) { w.WriteHeader(http.StatusBadGateway) },
	)
	if err != nil {
		t.Fatalf("сборка прокси: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, clashapi.Prefix+"/version", nil)
	request.Header.Set("Authorization", "Bearer подделка")
	request.Header.Set("Cookie", "session=1")

	proxy.ServeHTTP(httptest.NewRecorder(), request)

	if gotAuth != "" {
		t.Errorf("авторизация клиента дошла до контроллера: %q", gotAuth)
	}

	if gotCookie != "" {
		t.Errorf("кука клиента дошла до контроллера: %q", gotCookie)
	}
}

// Контроллер с незаданным access_control_allow_origin отвечает
// Access-Control-Allow-Origin: * на всё. Наружу эти заголовки уходить не
// должны: прокси авторизует запросы секретом, и с ними ветку /api/clash/*
// читал бы любой сайт в браузере пользователя.
func TestProxyStripsUpstreamCORS(t *testing.T) {
	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
		w.WriteHeader(http.StatusOK)
	}))
	defer controller.Close()

	proxy, err := clashapi.NewProxy(
		resolver(strings.TrimPrefix(controller.URL, "http://"), ""),
		func(w http.ResponseWriter, _ *http.Request, _ error) { w.WriteHeader(http.StatusBadGateway) },
	)
	if err != nil {
		t.Fatalf("сборка прокси: %v", err)
	}

	rec := httptest.NewRecorder()
	proxy.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, clashapi.Prefix+"/connections", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("код ответа: получили %d, ожидали %d", rec.Code, http.StatusOK)
	}

	for name := range rec.Header() {
		if strings.HasPrefix(name, "Access-Control-") {
			t.Errorf("%s дошёл до клиента: %q", name, rec.Header().Get(name))
		}
	}
}

func TestProxyReportsUnreachableController(t *testing.T) {
	tests := []struct {
		name    string
		resolve clashapi.Resolver
	}{
		{
			"настройки не прочитаны",
			func(context.Context) (clashapi.Settings, error) {
				return clashapi.Settings{}, errors.New("нет конфига")
			},
		},
		{
			"адрес контроллера пуст",
			resolver("", ""),
		},
		{
			"контроллер не отвечает",
			// Порт 0 не слушает никто: соединение отвергается сразу.
			resolver("127.0.0.1:0", ""),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			proxy, err := clashapi.NewProxy(tt.resolve, func(w http.ResponseWriter, _ *http.Request, _ error) {
				w.WriteHeader(http.StatusBadGateway)
			})
			if err != nil {
				t.Fatalf("сборка прокси: %v", err)
			}

			rec := httptest.NewRecorder()
			proxy.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, clashapi.Prefix+"/version", nil))

			if rec.Code != http.StatusBadGateway {
				t.Errorf("код ответа: получили %d, ожидали %d", rec.Code, http.StatusBadGateway)
			}
		})
	}
}

// Поток отдаётся по мере поступления: буферизация превратила бы посекундные
// сэмплы трафика в одну пачку.
func TestProxyStreamsWithoutBuffering(t *testing.T) {
	released := make(chan struct{})

	controller := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "{\"up\":1}\n")
		w.(http.Flusher).Flush()
		<-released
	}))
	defer controller.Close()

	proxy, err := clashapi.NewProxy(
		resolver(strings.TrimPrefix(controller.URL, "http://"), ""),
		func(w http.ResponseWriter, _ *http.Request, _ error) { w.WriteHeader(http.StatusBadGateway) },
	)
	if err != nil {
		t.Fatalf("сборка прокси: %v", err)
	}

	front := httptest.NewServer(proxy)
	defer front.Close()

	response, err := http.Get(front.URL + clashapi.Prefix + "/traffic") //nolint:noctx // дедлайн задаёт t.Deadline теста
	if err != nil {
		t.Fatalf("запрос потока: %v", err)
	}
	defer func() { _ = response.Body.Close() }()

	buf := make([]byte, len("{\"up\":1}\n"))
	if _, err := io.ReadFull(response.Body, buf); err != nil {
		t.Fatalf("первый сэмпл не пришёл до конца ответа: %v", err)
	}

	close(released)

	if got := string(buf); got != "{\"up\":1}\n" {
		t.Errorf("первый сэмпл: получили %q", got)
	}
}
