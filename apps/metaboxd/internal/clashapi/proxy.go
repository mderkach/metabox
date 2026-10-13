package clashapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// Prefix is the branch under which the daemon serves the Clash API outside. The panel goes
// here, not to the controller port: the address and secret stay inside the daemon.
const Prefix = "/api/clash"

// Resolver returns the controller address and secret. The values are read from
// the applied config on every request: the user may change the port,
// and the proxy must go where the controller listens now.
type Resolver func(ctx context.Context) (Settings, error)

// ErrorHandler returns a failure in the HTTP layer format. Injected from outside so that
// the package does not know the daemon response format.
type ErrorHandler func(w http.ResponseWriter, r *http.Request, err error)

// Proxy forwards panel requests to the sing-box Clash API, keeping the response
// shapes verbatim. The response is not buffered: the traffic, memory and connection
// streams go under the same branch.
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

// NewProxy assembles the proxy. onError is required: without it a failure would go
// to the client in the net/http format, not in the daemon format.
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
		// -1 disables buffering: `/traffic` and `/memory` give a line
		// once a second, and with a buffer the panel would see them in a batch.
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

// stripCORS removes the controller CORS headers: with an empty
// access_control_allow_origin the fork answers Access-Control-Allow-Origin: * to
// everything, and letting that outside would hand the proxy branch, authorized
// by the secret, to any site in the user's browser.
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
	// SetURL joins the target path with the incoming one, so the prefix is stripped after
	// it: the controller knows `/rules`, not `/api/clash/rules`.
	pr.Out.URL.Path = strings.TrimPrefix(pr.In.URL.Path, Prefix)
	pr.Out.URL.RawPath = strings.TrimPrefix(pr.In.URL.EscapedPath(), Prefix)
	pr.Out.Host = t.base.Host

	// The panel cookies do not belong to the controller, and the secret is set by the daemon: the browser
	// does not see it and cannot forge the header.
	pr.Out.Header.Del("Cookie")
	pr.Out.Header.Del("Authorization")

	if t.secret != "" {
		pr.Out.Header.Set("Authorization", "Bearer "+t.secret)
	}
}
