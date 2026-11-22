package clashapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// DelayObserver binds a user-requested check to the controller observed before
// the request. A nil result leaves the existing proxy behavior in place.
type DelayObserver func(context.Context, Settings, string) (Settings, *DelayObservation)

// DelayObservation receives the upstream result and releases the pending check
// on every exit path, including transport failures and cancellation.
type DelayObservation struct {
	Record func(context.Context, int, bool)
	Done   func()
}

type delayObserverKey struct{}

// WithDelayObserver observes completed delay checks without changing their wire format.
func (p *Proxy) WithDelayObserver(observer DelayObserver) *Proxy {
	p.observeDelay = observer

	probe := *p.proxy
	// A pooled connection could still reach the previous owner of the controller.
	probe.Transport = &http.Transport{DisableKeepAlives: true}
	probe.ModifyResponse = observeDelayResponse
	p.probe = &probe

	return p
}

func (p *Proxy) handlerForDelay(ctx context.Context, req *http.Request, settings Settings) (*httputil.ReverseProxy, context.Context, func()) {
	if p.observeDelay == nil || req.Method != http.MethodGet {
		return p.proxy, ctx, nil
	}

	path, ok := strings.CutPrefix(req.URL.EscapedPath(), Prefix+"/proxies/")
	if !ok {
		return p.proxy, ctx, nil
	}
	encoded, ok := strings.CutSuffix(path, "/delay")
	if !ok || encoded == "" || strings.Contains(encoded, "/") {
		return p.proxy, ctx, nil
	}
	tag, err := url.PathUnescape(encoded)
	if err != nil {
		return p.proxy, ctx, nil
	}

	// The fork decodes a route parameter again when its URL has no RawPath.
	if req.URL.RawPath == "" {
		if decoded, err := url.PathUnescape(tag); err == nil && decoded != tag {
			return p.proxy, ctx, nil
		}
	}

	pinned, observe := p.observeDelay(ctx, settings, tag)
	if observe == nil {
		return p.proxy, ctx, nil
	}

	base, err := pinned.BaseURL()
	if err != nil {
		observe.Done()

		return p.proxy, ctx, nil
	}
	parsed, err := url.Parse(base)
	if err != nil {
		observe.Done()

		return p.proxy, ctx, nil
	}

	ctx = context.WithValue(ctx, targetKey{}, target{base: parsed, secret: pinned.Secret})

	return p.probe, context.WithValue(ctx, delayObserverKey{}, observe), observe.Done
}

func observeDelayResponse(resp *http.Response) error {
	_ = stripCORS(resp)
	ctx := resp.Request.Context()
	observe, ok := ctx.Value(delayObserverKey{}).(*DelayObservation)
	if !ok {
		return nil
	}

	switch resp.StatusCode {
	case http.StatusServiceUnavailable, http.StatusGatewayTimeout:
		observe.Record(ctx, 0, false)
	case http.StatusOK:
		const maxDelayBody = 4096
		raw, err := io.ReadAll(io.LimitReader(resp.Body, maxDelayBody+1))
		resp.Body = delayResponseBody{Reader: io.MultiReader(bytes.NewReader(raw), resp.Body), Closer: resp.Body}

		var result struct {
			Delay *uint16 `json:"delay"`
		}
		if err == nil && len(raw) <= maxDelayBody && json.Unmarshal(raw, &result) == nil && result.Delay != nil {
			delay := int(*result.Delay)
			observe.Record(ctx, delay, delay > 0 && delay < 65535)
		}
	}

	return nil
}

type delayResponseBody struct {
	io.Reader
	io.Closer
}
