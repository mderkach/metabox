// Package webui serves the built SPA embedded into the binary. The static directory
// is filled by `make daemon`; in the repository it is kept non-empty on purpose:
// the embed directive does not build if it found no file.
package webui

import (
	"bytes"
	"embed"
	"errors"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"
)

// The all: prefix is needed so a directory with only .gitkeep still builds:
// without it go:embed skips files starting with a dot and fails on
// "no matching files found".
//
//go:embed all:static
var embedded embed.FS

const (
	indexFile = "index.html"

	// indexCache: the shell page must be rechecked: under the same
	// address a different asset set lies after a daemon update.
	indexCache = "no-cache"
	// assetCache: files with a hash in the name are immutable by construction, they can be
	// cached forever.
	assetCache = "public, max-age=31536000, immutable"
)

// encodings are the compressed variants in descending order of gain. They are compressed by the panel build,
// not by the daemon: compressing the same file on every request is router processor
// time spent for nothing, and the weaker the hardware, the more often it is spent.
var encodings = []struct {
	token  string
	suffix string
}{
	{token: "br", suffix: ".br"},
	{token: "gzip", suffix: ".gz"},
}

// ErrNotBuilt means the SPA did not get into the binary: the daemon was built without `make daemon`.
var ErrNotBuilt = errors.New("SPA не собрана")

// Handler serves static files and returns index.html on unknown paths: the SPA routing
// is client-side, and an address like /connections exists only in the browser.
//
// Returns ErrNotBuilt if there are no static files in the binary. The caller decides what
// to replace it with: the daemon must come up without the UI too.
func Handler() (http.Handler, error) {
	root, err := fs.Sub(embedded, "static")
	if err != nil {
		return nil, err
	}

	return newHandler(root)
}

// newHandler is separated from embed so the serving can be checked by a test: in
// the repository the static directory is empty, and nothing can be looked at through Handler.
func newHandler(root fs.FS) (http.Handler, error) {
	index, err := fs.ReadFile(root, indexFile)
	if err != nil {
		return nil, ErrNotBuilt
	}

	return &handler{files: http.FileServerFS(root), root: root, index: index}, nil
}

type handler struct {
	files http.Handler
	root  fs.FS
	index []byte
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/")

	// index.html is served by hand: http.FileServerFS canonicalizes this
	// address with a redirect to "/", and the browser has no need to go twice for the same
	// page.
	// A compressed variant is not an independent address: served directly, it would arrive
	// without Content-Encoding and would not be unpacked.
	if name == "" || name == indexFile || isEncoded(name) || !exists(h.root, name) {
		h.serveIndex(w, r)

		return
	}

	if hashed(name) {
		w.Header().Set("Cache-Control", assetCache)
	} else {
		w.Header().Set("Cache-Control", indexCache)
	}

	// Vary stands on the uncompressed response too: without it a shared cache would give a client without
	// brotli the body compressed for a client with it.
	w.Header().Set("Vary", "Accept-Encoding")

	if h.serveEncoded(w, r, name) {
		return
	}

	h.files.ServeHTTP(w, r)
}

// serveEncoded serves a precompressed variant of the file if it is in the binary and
// the client accepts it. Reports whether it took over the response: otherwise the file goes
// as is.
//
// The content type is taken from the original name: the variant has its own extension
// (.br, .gz), and by it the type would be determined as "byte stream".
func (h *handler) serveEncoded(w http.ResponseWriter, r *http.Request, name string) bool {
	mediaType := mime.TypeByExtension(path.Ext(name))
	if mediaType == "" {
		return false
	}

	accepted := r.Header.Get("Accept-Encoding")

	for _, encoding := range encodings {
		if !accepts(accepted, encoding.token) {
			continue
		}

		body, err := fs.ReadFile(h.root, name+encoding.suffix)
		if err != nil {
			continue
		}

		w.Header().Set("Content-Type", mediaType)
		w.Header().Set("Content-Encoding", encoding.token)
		// Time is not passed: files from embed have none, and an invented one would give
		// the client a reason to consider the response fresh by mistake.
		http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(body))

		return true
	}

	return false
}

func isEncoded(name string) bool {
	for _, encoding := range encodings {
		if strings.HasSuffix(name, encoding.suffix) {
			return true
		}
	}

	return false
}

// accepts parses Accept-Encoding: a token is accepted if it is listed and its
// weight is not zero. An explicit "br;q=0" means a refusal, not a choice.
func accepts(header, token string) bool {
	for part := range strings.SplitSeq(header, ",") {
		value, params, _ := strings.Cut(strings.TrimSpace(part), ";")

		if !strings.EqualFold(strings.TrimSpace(value), token) {
			continue
		}

		quality, ok := strings.CutPrefix(strings.TrimSpace(params), "q=")

		return !ok || (quality != "0" && !strings.HasPrefix(quality, "0.0"))
	}

	return false
}

func (h *handler) serveIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", indexCache)

	if r.Method == http.MethodHead {
		return
	}

	// A write error here means the client dropped: the status has gone,
	// there is nobody to report it to.
	_, _ = w.Write(h.index)
}

func exists(root fs.FS, name string) bool {
	info, err := fs.Stat(root, name)

	return err == nil && !info.IsDir()
}

// hashed reports whether the file name carries a content fingerprint. Vite puts it
// before the extension: index-D4f8Ka1x.js. A name without a fingerprint is reused
// between builds, and an eternal cache on it would serve an old file forever.
func hashed(name string) bool {
	base := name
	if i := strings.LastIndexByte(base, '/'); i >= 0 {
		base = base[i+1:]
	}

	ext := strings.LastIndexByte(base, '.')
	if ext <= 0 {
		return false
	}

	dash := strings.LastIndexByte(base[:ext], '-')
	if dash <= 0 {
		return false
	}

	return isHash(base[dash+1 : ext])
}

// isHash: Vite takes eight base64url characters. Fewer than six count as a part of
// the name, so "vendor-ui.css" does not fall under the eternal cache.
func isHash(s string) bool {
	const minLen = 6
	if len(s) < minLen {
		return false
	}

	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_', r == '-':
		default:
			return false
		}
	}

	return true
}
