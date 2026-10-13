package webui

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

// spa repeats what vite puts: the shell, assets with a fingerprint in the name and
// a file without a fingerprint.
func spa() fstest.MapFS {
	return fstest.MapFS{
		"index.html":                {Data: []byte("<!doctype html><title>metabox</title>")},
		"assets/index-D4f8Ka1x.js":  {Data: []byte("console.log(1)")},
		"assets/index-B7cQ2m0p.css": {Data: []byte("body{}")},
		"favicon.svg":               {Data: []byte("<svg/>")},
	}
}

func serve(t *testing.T, files fstest.MapFS, path string) *httptest.ResponseRecorder {
	t.Helper()

	h, err := newHandler(files)
	if err != nil {
		t.Fatalf("serve build: %v", err)
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))

	return rec
}

// SPA routing is client-side: an address like /connections exists only in the
// browser, and the shell must arrive for it, not a 404.
func TestUnknownPathServesIndex(t *testing.T) {
	for _, path := range []string{"/", "/connections", "/config/outbounds/2", "/нет-такого"} {
		t.Run(path, func(t *testing.T) {
			rec := serve(t, spa(), path)

			if rec.Code != http.StatusOK {
				t.Fatalf("code %d, expected %d", rec.Code, http.StatusOK)
			}
			if body := rec.Body.String(); body != "<!doctype html><title>metabox</title>" {
				t.Errorf("served %q, expected index.html", body)
			}
			if got := rec.Header().Get("Cache-Control"); got != indexCache {
				t.Errorf("Cache-Control %q, expected %q", got, indexCache)
			}
		})
	}
}

func TestCacheHeaders(t *testing.T) {
	tests := []struct {
		name string
		path string
		want string
	}{
		{"asset with a fingerprint", "/assets/index-D4f8Ka1x.js", assetCache},
		{"style with a fingerprint", "/assets/index-B7cQ2m0p.css", assetCache},
		{"file without a fingerprint", "/favicon.svg", indexCache},
		{"shell", "/index.html", indexCache},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(t, spa(), tt.path)

			if rec.Code != http.StatusOK {
				t.Fatalf("code %d", rec.Code)
			}
			if got := rec.Header().Get("Cache-Control"); got != tt.want {
				t.Errorf("Cache-Control %q, expected %q", got, tt.want)
			}
		})
	}
}

// An eternal cache on a file without a fingerprint would serve an old version forever, so
// the fingerprint is recognized strictly.
func TestHashed(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"assets/index-D4f8Ka1x.js", true},
		{"assets/main-a1b2c3d4.css", true},
		{"index.html", false},
		{"favicon.svg", false},
		{"assets/vendor-ui.css", false},
		{"assets/-D4f8Ka1x.js", false},
		{"assets/index-.js", false},
		{"assets/index-D4f8Ka1x", false},
		{"assets/логотип-картинка.svg", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := hashed(tt.name); got != tt.want {
				t.Errorf("got %v, expected %v", got, tt.want)
			}
		})
	}
}

// The daemon must come up without the interface too: the API works, the panel explains
// what is missing.
func TestNotBuilt(t *testing.T) {
	_, err := newHandler(fstest.MapFS{".gitkeep": {Data: []byte("пусто")}})

	if !errors.Is(err, ErrNotBuilt) {
		t.Errorf("got %v, expected ErrNotBuilt", err)
	}
}

// In the repository the static directory is kept with a single .gitkeep, and Handler must
// say so and not crash.
func TestEmbeddedDirectoryCompiles(t *testing.T) {
	if _, err := Handler(); err != nil && !errors.Is(err, ErrNotBuilt) {
		t.Errorf("the embedded directory cannot be read: %v", err)
	}
}

// compressed repeats what the panel build puts: precompressed variants
// lie next to the file.
func compressed() fstest.MapFS {
	files := spa()
	files["assets/index-D4f8Ka1x.js.br"] = &fstest.MapFile{Data: []byte("сжато brotli")}
	files["assets/index-D4f8Ka1x.js.gz"] = &fstest.MapFile{Data: []byte("сжато gzip")}
	files["locales/shared/ru-Z1k8dm97.json"] = &fstest.MapFile{Data: []byte(`{"a":"б"}`)}
	files["locales/shared/ru-Z1k8dm97.json.br"] = &fstest.MapFile{Data: []byte("словарь brotli")}

	return files
}

func serveWith(t *testing.T, files fstest.MapFS, path, accept string) *httptest.ResponseRecorder {
	t.Helper()

	h, err := newHandler(files)
	if err != nil {
		t.Fatalf("serve build: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, path, nil)
	if accept != "" {
		req.Header.Set("Accept-Encoding", accept)
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	return rec
}

// Compression is done by the panel build, not by the daemon: router processor time is not spent
// recompressing the same file.
func TestPrecompressedVariants(t *testing.T) {
	tests := []struct {
		name         string
		path         string
		accept       string
		wantEncoding string
		wantBody     string
		wantType     string
	}{
		{
			name:         "brotli when the client accepts it",
			path:         "/assets/index-D4f8Ka1x.js",
			accept:       "gzip, deflate, br, zstd",
			wantEncoding: "br",
			wantBody:     "сжато brotli",
			wantType:     "text/javascript; charset=utf-8",
		},
		{
			name:         "gzip when brotli is not offered",
			path:         "/assets/index-D4f8Ka1x.js",
			accept:       "gzip, deflate",
			wantEncoding: "gzip",
			wantBody:     "сжато gzip",
			wantType:     "text/javascript; charset=utf-8",
		},
		{
			name:         "the original file when compressed is not accepted",
			path:         "/assets/index-D4f8Ka1x.js",
			accept:       "identity",
			wantEncoding: "",
			wantBody:     "console.log(1)",
			wantType:     "text/javascript; charset=utf-8",
		},
		{
			name:         "the original file when there is no variant",
			path:         "/assets/index-B7cQ2m0p.css",
			accept:       "br, gzip",
			wantEncoding: "",
			wantBody:     "body{}",
			wantType:     "text/css; charset=utf-8",
		},
		{
			name:         "the dictionary is served compressed",
			path:         "/locales/shared/ru-Z1k8dm97.json",
			accept:       "br",
			wantEncoding: "br",
			wantBody:     "словарь brotli",
			wantType:     "application/json",
		},
		{
			name:         "zero weight counts as a refusal",
			path:         "/assets/index-D4f8Ka1x.js",
			accept:       "br;q=0, gzip",
			wantEncoding: "gzip",
			wantBody:     "сжато gzip",
			wantType:     "text/javascript; charset=utf-8",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serveWith(t, compressed(), tt.path, tt.accept)

			if rec.Code != http.StatusOK {
				t.Fatalf("code %d, expected %d", rec.Code, http.StatusOK)
			}
			if got := rec.Header().Get("Content-Encoding"); got != tt.wantEncoding {
				t.Errorf("Content-Encoding %q, expected %q", got, tt.wantEncoding)
			}
			if got := rec.Body.String(); got != tt.wantBody {
				t.Errorf("body %q, expected %q", got, tt.wantBody)
			}
			if got := rec.Header().Get("Content-Type"); got != tt.wantType {
				t.Errorf("Content-Type %q, expected %q", got, tt.wantType)
			}
			if got := rec.Header().Get("Vary"); got != "Accept-Encoding" {
				t.Errorf("Vary %q, expected Accept-Encoding", got)
			}
		})
	}
}

// The dictionary carries a fingerprint in the name like the other assets: it must fall
// under the eternal cache, otherwise every visit re-requests all the screen dictionaries.
func TestHashedLocaleIsImmutable(t *testing.T) {
	rec := serveWith(t, compressed(), "/locales/shared/ru-Z1k8dm97.json", "")

	if got := rec.Header().Get("Cache-Control"); got != assetCache {
		t.Errorf("Cache-Control %q, expected %q", got, assetCache)
	}
}

// A direct request for a compressed variant would give the client unpacked bytes without
// Content-Encoding, so such an address is unknown to the serving.
func TestEncodedVariantIsNotAnAddress(t *testing.T) {
	rec := serveWith(t, compressed(), "/assets/index-D4f8Ka1x.js.br", "br")

	if got := rec.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Errorf("Content-Type %q, expected the shell", got)
	}
}
