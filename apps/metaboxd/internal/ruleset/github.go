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

// GitHubAPI is the GitHub REST API address. A separate constant because tests
// substitute their own server.
const GitHubAPI = "https://api.github.com"

// maxTreeBytes is the ceiling for the tree response. The largest catalog tree is
// about 600 KB; eight megabytes cover growth with a margin and do not let a foreign
// response take the router memory.
const maxTreeBytes = 8 << 20

const srsSuffix = ".srs"

// errTruncated: GitHub returned the tree not whole. A truncated tree would give a
// catalog without some categories, and this would not be visible from the response.
var errTruncated = errors.New("дерево отдано не целиком")

// errEmpty: no rule set file found in the tree. This is what a changed provider
// layout looks like, not an empty catalog: the previous listing stays.
var errEmpty = errors.New("в дереве нет файлов наборов")

// Listing is the result of checking one tree.
type Listing struct {
	// Names are the tree file names; empty with NotModified.
	Names []string
	ETag  string
	// NotModified: the tree has not changed since the last check.
	NotModified bool
}

// GitHub reads branch trees through the REST API.
//
// Without a token the limit is 60 requests per hour per address, and a conditional ETag request
// counts against it too. Four requests a day are enough for the catalog, so
// no token is created.
type GitHub struct {
	client    *http.Client
	baseURL   string
	userAgent string
}

// NewGitHub assembles the client. userAgent is required: without it GitHub answers 403.
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

// List reads the tree file names. A non-empty etag makes the request conditional.
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

// categories keeps the rule set files with the needed prefix and returns the category
// names in alphabetical order. Ready `.srs` files are taken, not a parse of `geosite.dat`:
// a category without a file would give an address from which sing-box downloads nothing.
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
