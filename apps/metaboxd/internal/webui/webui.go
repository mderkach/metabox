// Package webui раздаёт собранную SPA, встроенную в бинарь. Каталог static
// наполняет `make daemon`; в репозитории он держится непустым специально:
// директива встраивания не собирается, если не нашла ни одного файла
// (docs/adr/ADR-0003).
package webui

import (
	"embed"
	"errors"
	"io/fs"
	"net/http"
	"strings"
)

// Префикс all: нужен, чтобы каталог с одним лишь .gitkeep всё-таки собрался:
// без него go:embed пропускает файлы, начинающиеся с точки, и падает на
// «no matching files found».
//
//go:embed all:static
var embedded embed.FS

const (
	indexFile = "index.html"

	// indexCache — страница-оболочка обязана перепроверяться: под тем же
	// адресом после обновления демона лежит другой набор ассетов.
	indexCache = "no-cache"
	// assetCache — файлы с хэшем в имени неизменяемы по построению, их можно
	// кэшировать навсегда.
	assetCache = "public, max-age=31536000, immutable"
)

// ErrNotBuilt — SPA в бинарь не попала: демон собран без `make daemon`.
var ErrNotBuilt = errors.New("SPA не собрана")

// Handler раздаёт статику и отдаёт index.html на неизвестных путях: роутинг
// у SPA клиентский, и адрес вроде /connections существует только в браузере.
//
// Возвращает ErrNotBuilt, если статики в бинаре нет. Вызывающий решает, чем
// это заменить: демон обязан подниматься и без UI (NFR-1).
func Handler() (http.Handler, error) {
	root, err := fs.Sub(embedded, "static")
	if err != nil {
		return nil, err
	}

	return newHandler(root)
}

// newHandler отделён от embed, чтобы раздачу можно было проверить тестом: в
// репозитории каталог статики пуст, и через Handler туда не заглянуть.
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

	// index.html отдаётся своими руками: http.FileServerFS канонизирует этот
	// адрес редиректом на «/», а браузеру незачем ходить дважды за той же
	// страницей.
	if name == "" || name == indexFile || !exists(h.root, name) {
		h.serveIndex(w, r)

		return
	}

	if hashed(name) {
		w.Header().Set("Cache-Control", assetCache)
	} else {
		w.Header().Set("Cache-Control", indexCache)
	}

	h.files.ServeHTTP(w, r)
}

func (h *handler) serveIndex(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", indexCache)

	if r.Method == http.MethodHead {
		return
	}

	// Ошибка записи здесь означает оборвавшегося клиента: статус уже ушёл,
	// сообщить о ней некому.
	_, _ = w.Write(h.index)
}

func exists(root fs.FS, name string) bool {
	info, err := fs.Stat(root, name)

	return err == nil && !info.IsDir()
}

// hashed отвечает, несёт ли имя файла отпечаток содержимого. Vite ставит его
// перед расширением: index-D4f8Ka1x.js. Имя без отпечатка переиспользуется
// между сборками, и вечный кэш на нём отдал бы старый файл навсегда.
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

// isHash: Vite берёт восемь символов base64url. Меньше шести считаем частью
// имени — так «vendor-ui.css» не попадёт под вечный кэш.
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
