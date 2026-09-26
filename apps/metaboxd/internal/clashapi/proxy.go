package clashapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// Prefix — ветка, под которой демон отдаёт Clash API наружу. Панель ходит
// сюда, а не на порт контроллера: адрес и секрет остаются внутри демона
// (ADR-0006).
const Prefix = "/api/clash"

// Resolver отдаёт адрес и секрет контроллера. Значения читаются из
// применённого конфига на каждый запрос: пользователь вправе сменить порт,
// и прокси обязан ходить туда, где контроллер слушает сейчас.
type Resolver func(ctx context.Context) (Settings, error)

// ErrorHandler отдаёт отказ в формате HTTP-слоя. Внедряется снаружи, чтобы
// пакет не знал про формат ответа демона.
type ErrorHandler func(w http.ResponseWriter, r *http.Request, err error)

// Proxy пробрасывает запросы панели в Clash API sing-box, сохраняя формы
// ответов дословно. Ответ не буферизуется: под этой же веткой ходят потоки
// трафика, памяти и соединений.
type Proxy struct {
	resolve Resolver
	onError ErrorHandler
	proxy   *httputil.ReverseProxy
}

type targetKey struct{}

type target struct {
	base   *url.URL
	secret string
}

// NewProxy собирает прокси. onError обязателен: без него отказ ушёл бы
// клиенту в формате net/http, а не в формате демона.
func NewProxy(resolve Resolver, onError ErrorHandler) (*Proxy, error) {
	if resolve == nil {
		return nil, errors.New("резолвер настроек не задан")
	}

	if onError == nil {
		return nil, errors.New("обработчик ошибок не задан")
	}

	p := &Proxy{resolve: resolve, onError: onError}
	p.proxy = &httputil.ReverseProxy{
		Rewrite: rewrite,
		// -1 отключает буферизацию: `/traffic` и `/memory` отдают по строке
		// раз в секунду, и с буфером панель увидела бы их пачкой.
		FlushInterval:  -1,
		ModifyResponse: stripCORS,
		ErrorHandler:   onError,
	}

	return p, nil
}

func (p *Proxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	settings, err := p.resolve(r.Context())
	if err != nil {
		p.onError(w, r, err)

		return
	}

	base, err := settings.BaseURL()
	if err != nil {
		p.onError(w, r, err)

		return
	}

	parsed, err := url.Parse(base)
	if err != nil {
		p.onError(w, r, err)

		return
	}

	ctx := context.WithValue(r.Context(), targetKey{}, target{base: parsed, secret: settings.Secret})
	p.proxy.ServeHTTP(w, r.WithContext(ctx))
}

// stripCORS снимает CORS-заголовки контроллера: при пустом
// access_control_allow_origin форк отвечает Access-Control-Allow-Origin: * на
// всё, и пропустить это наружу — отдать ветку прокси, авторизованную
// секретом, любому сайту в браузере пользователя.
func stripCORS(resp *http.Response) error {
	for name := range resp.Header {
		if strings.HasPrefix(name, "Access-Control-") {
			resp.Header.Del(name)
		}
	}

	return nil
}

func rewrite(pr *httputil.ProxyRequest) {
	t, ok := pr.In.Context().Value(targetKey{}).(target)
	if !ok {
		return
	}

	pr.SetURL(t.base)
	// SetURL склеивает путь цели с входящим, поэтому префикс снимается после
	// него: контроллер знает `/rules`, а не `/api/clash/rules`.
	pr.Out.URL.Path = strings.TrimPrefix(pr.In.URL.Path, Prefix)
	pr.Out.URL.RawPath = strings.TrimPrefix(pr.In.URL.EscapedPath(), Prefix)
	pr.Out.Host = t.base.Host

	// Куки панели контроллеру не принадлежат, а секрет ставит демон: браузер
	// его не видит и подделать заголовок не может.
	pr.Out.Header.Del("Cookie")
	pr.Out.Header.Del("Authorization")

	if t.secret != "" {
		pr.Out.Header.Set("Authorization", "Bearer "+t.secret)
	}
}
