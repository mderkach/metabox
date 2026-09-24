package ruleset

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

// GitHubAPI — адрес GitHub REST API. Отдельной константой, потому что тесты
// подставляют свой сервер.
const GitHubAPI = "https://api.github.com"

// maxTreeBytes — потолок на ответ дерева. Самое большое дерево каталога —
// около 600 КБ; восемь мегабайт с запасом перекрывают рост и не дают чужому
// ответу забрать память роутера.
const maxTreeBytes = 8 << 20

const srsSuffix = ".srs"

// errTruncated — GitHub отдал дерево не целиком. Урезанное дерево дало бы
// каталог без части категорий, и по ответу это не было бы видно.
var errTruncated = errors.New("дерево отдано не целиком")

// errEmpty — в дереве не нашлось ни одного файла набора. Так выглядит сменившаяся
// раскладка поставщика, а не пустой каталог: прежний перечень остаётся.
var errEmpty = errors.New("в дереве нет файлов наборов")

// Listing — результат сверки одного дерева.
type Listing struct {
	// Names — имена файлов дерева; при NotModified пустой.
	Names []string
	ETag  string
	// NotModified — дерево не менялось с прошлой сверки.
	NotModified bool
}

// GitHub читает деревья веток через REST API.
//
// Без токена лимит — 60 запросов в час на адрес, и условный запрос по ETag в
// него тоже засчитывается. Каталогу хватает четырёх запросов в сутки, поэтому
// токен не заводится.
type GitHub struct {
	client    *http.Client
	baseURL   string
	userAgent string
}

// NewGitHub собирает клиент. userAgent обязателен: без него GitHub отвечает 403.
func NewGitHub(baseURL, userAgent string, timeout time.Duration) *GitHub {
	return &GitHub{
		client:    &http.Client{Timeout: timeout},
		baseURL:   strings.TrimSuffix(baseURL, "/"),
		userAgent: userAgent,
	}
}

type treeResponse struct {
	Truncated bool `json:"truncated"`
	Tree      []struct {
		Path string `json:"path"`
		Type string `json:"type"`
	} `json:"tree"`
}

// List читает имена файлов дерева. Непустой etag делает запрос условным.
func (g *GitHub) List(ctx context.Context, tree Tree, etag string) (Listing, error) {
	target := tree.Ref
	if tree.Dir != "" {
		target += ":" + tree.Dir
	}

	endpoint := fmt.Sprintf("%s/repos/%s/%s/git/trees/%s",
		g.baseURL, url.PathEscape(tree.Owner), url.PathEscape(tree.Repo), url.PathEscape(target))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Listing{}, fmt.Errorf("запрос дерева %s/%s: %w", tree.Owner, tree.Repo, err)
	}

	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", g.userAgent)

	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}

	resp, err := g.client.Do(req)
	if err != nil {
		return Listing{}, fmt.Errorf("дерево %s/%s: %w", tree.Owner, tree.Repo, err)
	}
	defer func() { _ = resp.Body.Close() }()

	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotModified:
		return Listing{ETag: etag, NotModified: true}, nil
	default:
		return Listing{}, fmt.Errorf("дерево %s/%s: ответ %s", tree.Owner, tree.Repo, resp.Status)
	}

	var body treeResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxTreeBytes)).Decode(&body); err != nil {
		return Listing{}, fmt.Errorf("разбор дерева %s/%s: %w", tree.Owner, tree.Repo, err)
	}

	if body.Truncated {
		return Listing{}, fmt.Errorf("дерево %s/%s: %w", tree.Owner, tree.Repo, errTruncated)
	}

	names := make([]string, 0, len(body.Tree))
	for _, entry := range body.Tree {
		if entry.Type == "blob" {
			names = append(names, entry.Path)
		}
	}

	return Listing{Names: names, ETag: resp.Header.Get("ETag")}, nil
}

// categories оставляет файлы наборов с нужной приставкой и отдаёт имена
// категорий по алфавиту. Берутся готовые `.srs`, а не разбор `geosite.dat`:
// категория без файла дала бы адрес, по которому sing-box ничего не скачает.
func categories(names []string, prefix string) []string {
	found := make([]string, 0, len(names))

	for _, name := range names {
		if !strings.HasPrefix(name, prefix) || !strings.HasSuffix(name, srsSuffix) {
			continue
		}

		if category := strings.TrimSuffix(strings.TrimPrefix(name, prefix), srsSuffix); category != "" {
			found = append(found, category)
		}
	}

	slices.Sort(found)

	return found
}
