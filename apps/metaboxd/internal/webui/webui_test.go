package webui

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

// spa повторяет то, что кладёт vite: оболочка, ассеты с отпечатком в имени и
// файл без отпечатка.
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
		t.Fatalf("сборка раздачи: %v", err)
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))

	return rec
}

// Роутинг у SPA клиентский: адрес вроде /connections существует только в
// браузере, и на него обязана приехать оболочка, а не 404.
func TestUnknownPathServesIndex(t *testing.T) {
	for _, path := range []string{"/", "/connections", "/config/outbounds/2", "/нет-такого"} {
		t.Run(path, func(t *testing.T) {
			rec := serve(t, spa(), path)

			if rec.Code != http.StatusOK {
				t.Fatalf("код %d, ожидали %d", rec.Code, http.StatusOK)
			}
			if body := rec.Body.String(); body != "<!doctype html><title>metabox</title>" {
				t.Errorf("отдали %q, ожидали index.html", body)
			}
			if got := rec.Header().Get("Cache-Control"); got != indexCache {
				t.Errorf("Cache-Control %q, ожидали %q", got, indexCache)
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
		{"ассет с отпечатком", "/assets/index-D4f8Ka1x.js", assetCache},
		{"стиль с отпечатком", "/assets/index-B7cQ2m0p.css", assetCache},
		{"файл без отпечатка", "/favicon.svg", indexCache},
		{"оболочка", "/index.html", indexCache},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := serve(t, spa(), tt.path)

			if rec.Code != http.StatusOK {
				t.Fatalf("код %d", rec.Code)
			}
			if got := rec.Header().Get("Cache-Control"); got != tt.want {
				t.Errorf("Cache-Control %q, ожидали %q", got, tt.want)
			}
		})
	}
}

// Вечный кэш на файле без отпечатка отдал бы старую версию навсегда, поэтому
// отпечаток распознаётся строго.
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
				t.Errorf("получили %v, ожидали %v", got, tt.want)
			}
		})
	}
}

// Демон обязан подниматься и без интерфейса: API работает, панель объясняет,
// чего не хватает (NFR-1).
func TestNotBuilt(t *testing.T) {
	_, err := newHandler(fstest.MapFS{".gitkeep": {Data: []byte("пусто")}})

	if !errors.Is(err, ErrNotBuilt) {
		t.Errorf("получили %v, ожидали ErrNotBuilt", err)
	}
}

// В репозитории каталог статики держится с одним .gitkeep — Handler обязан
// сказать об этом, а не упасть.
func TestEmbeddedDirectoryCompiles(t *testing.T) {
	if _, err := Handler(); err != nil && !errors.Is(err, ErrNotBuilt) {
		t.Errorf("встроенный каталог не читается: %v", err)
	}
}

// compressed повторяет то, что кладёт сборка панели: рядом с файлом лежат
// заранее сжатые варианты.
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
		t.Fatalf("сборка раздачи: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, path, nil)
	if accept != "" {
		req.Header.Set("Accept-Encoding", accept)
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	return rec
}

// Сжимает сборка панели, а не демон: процессорное время роутера на повторное
// сжатие одного и того же файла не тратится.
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
			name:         "brotli когда клиент его принимает",
			path:         "/assets/index-D4f8Ka1x.js",
			accept:       "gzip, deflate, br, zstd",
			wantEncoding: "br",
			wantBody:     "сжато brotli",
			wantType:     "text/javascript; charset=utf-8",
		},
		{
			name:         "gzip когда brotli не предложен",
			path:         "/assets/index-D4f8Ka1x.js",
			accept:       "gzip, deflate",
			wantEncoding: "gzip",
			wantBody:     "сжато gzip",
			wantType:     "text/javascript; charset=utf-8",
		},
		{
			name:         "исходный файл, когда сжатое не принимают",
			path:         "/assets/index-D4f8Ka1x.js",
			accept:       "identity",
			wantEncoding: "",
			wantBody:     "console.log(1)",
			wantType:     "text/javascript; charset=utf-8",
		},
		{
			name:         "исходный файл, когда варианта нет",
			path:         "/assets/index-B7cQ2m0p.css",
			accept:       "br, gzip",
			wantEncoding: "",
			wantBody:     "body{}",
			wantType:     "text/css; charset=utf-8",
		},
		{
			name:         "словарь отдаётся сжатым",
			path:         "/locales/shared/ru-Z1k8dm97.json",
			accept:       "br",
			wantEncoding: "br",
			wantBody:     "словарь brotli",
			wantType:     "application/json",
		},
		{
			name:         "нулевой вес считается отказом",
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
				t.Fatalf("код %d, ожидали %d", rec.Code, http.StatusOK)
			}
			if got := rec.Header().Get("Content-Encoding"); got != tt.wantEncoding {
				t.Errorf("Content-Encoding %q, ожидали %q", got, tt.wantEncoding)
			}
			if got := rec.Body.String(); got != tt.wantBody {
				t.Errorf("тело %q, ожидали %q", got, tt.wantBody)
			}
			if got := rec.Header().Get("Content-Type"); got != tt.wantType {
				t.Errorf("Content-Type %q, ожидали %q", got, tt.wantType)
			}
			if got := rec.Header().Get("Vary"); got != "Accept-Encoding" {
				t.Errorf("Vary %q, ожидали Accept-Encoding", got)
			}
		})
	}
}

// Словарь несёт отпечаток в имени, как и остальные ассеты: он обязан попадать
// под вечный кэш, иначе каждый заход перепрашивает все словари экрана.
func TestHashedLocaleIsImmutable(t *testing.T) {
	rec := serveWith(t, compressed(), "/locales/shared/ru-Z1k8dm97.json", "")

	if got := rec.Header().Get("Cache-Control"); got != assetCache {
		t.Errorf("Cache-Control %q, ожидали %q", got, assetCache)
	}
}

// Прямой запрос сжатого варианта отдал бы клиенту нераспакованные байты без
// Content-Encoding, поэтому такой адрес раздаче неизвестен.
func TestEncodedVariantIsNotAnAddress(t *testing.T) {
	rec := serveWith(t, compressed(), "/assets/index-D4f8Ka1x.js.br", "br")

	if got := rec.Header().Get("Content-Type"); got != "text/html; charset=utf-8" {
		t.Errorf("Content-Type %q, ожидали оболочку", got)
	}
}
