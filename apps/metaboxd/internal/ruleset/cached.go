package ruleset

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"os"
	"slices"
	"strings"

	"metabox/internal/cachefile"
	"metabox/internal/clashapi"
	"metabox/internal/contract"
)

type cachedConfigReader interface {
	Read(context.Context) ([]byte, error)
}

// CachedReader serves metadata for remote rule sets in the applied config.
type CachedReader struct {
	config      cachedConfigReader
	resolvePath func(context.Context, string) string
	readRecords func(context.Context, string, string, []string) (map[string]cachefile.RuleSetRecord, error)
	slot        chan struct{}
	last        cachedRead
}

type cachedRead struct {
	path string
	id   string
	file os.FileInfo
	sets []clashapi.RemoteRuleSet
	rows []contract.CachedRuleSet
}

// NewCachedReader uses the same cache path resolution as subscription recovery.
func NewCachedReader(config cachedConfigReader, resolvePath func(context.Context, string) string) *CachedReader {
	return &CachedReader{
		config:      config,
		resolvePath: resolvePath,
		readRecords: cachefile.ReadRuleSets,
		slot:        make(chan struct{}, 1),
	}
}

// Read copies at most one cache file at a time and keeps metadata from the last stable read.
func (r *CachedReader) Read(ctx context.Context) ([]contract.CachedRuleSet, error) {
	select {
	case r.slot <- struct{}{}:
		defer func() { <-r.slot }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	data, err := r.config.Read(ctx)
	if err != nil {
		return nil, err
	}
	cfg, err := clashapi.ReadCacheFile(data)
	if err != nil {
		return nil, err
	}

	rows := make([]contract.CachedRuleSet, 0, len(cfg.RemoteRuleSets))
	if len(cfg.RemoteRuleSets) == 0 {
		return rows, nil
	}

	state := contract.CachedRuleSetStateMemoryOnly
	if !cfg.Enabled {
		return rowsWithState(cfg.RemoteRuleSets, state), nil
	}

	path := r.resolvePath(ctx, cfg.Path)
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return rowsWithState(cfg.RemoteRuleSets, contract.CachedRuleSetStateNotDownloaded), nil
	}
	if err != nil || !info.Mode().IsRegular() {
		return rowsWithState(cfg.RemoteRuleSets, contract.CachedRuleSetStateCacheUnavailable), nil
	}
	if r.last.path == path && r.last.id == cfg.CacheID &&
		sameCacheVersion(r.last.file, info) && slices.Equal(r.last.sets, cfg.RemoteRuleSets) {
		return r.last.rows, nil
	}

	tags := make([]string, len(cfg.RemoteRuleSets))
	for i, set := range cfg.RemoteRuleSets {
		tags[i] = set.Tag
	}
	records, err := r.readRecords(ctx, path, cfg.CacheID, tags)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return rowsWithState(cfg.RemoteRuleSets, contract.CachedRuleSetStateCacheUnavailable), nil
	}

	for _, set := range cfg.RemoteRuleSets {
		record, found := records[set.Tag]
		row := contract.CachedRuleSet{Tag: set.Tag, State: contract.CachedRuleSetStateNotDownloaded}
		switch {
		case !found:
		case record.Unreadable:
			row.State = contract.CachedRuleSetStateUnreadable
		default:
			row.State = contract.CachedRuleSetStateCached
			checkedAt := record.CheckedAt.Unix()
			row.CheckedAt = &checkedAt
			row.Size = &record.Size
			// The core expands {tag} before hashing the address it downloads.
			hash := sha256.Sum256([]byte(strings.ReplaceAll(set.URL, "{tag}", set.Tag)))
			row.OtherAddress = len(record.URLHash) > 0 && !bytes.Equal(record.URLHash, hash[:])
		}
		rows = append(rows, row)
	}
	if after, err := os.Stat(path); err == nil && sameCacheVersion(info, after) {
		r.last = cachedRead{path: path, id: cfg.CacheID, file: after, sets: cfg.RemoteRuleSets, rows: rows}
	}
	return rows, nil
}

func sameCacheVersion(a, b os.FileInfo) bool {
	return a != nil && os.SameFile(a, b) && a.Size() == b.Size() && a.ModTime().Equal(b.ModTime())
}

func rowsWithState(sets []clashapi.RemoteRuleSet, state contract.CachedRuleSetState) []contract.CachedRuleSet {
	rows := make([]contract.CachedRuleSet, 0, len(sets))
	for _, set := range sets {
		rows = append(rows, contract.CachedRuleSet{Tag: set.Tag, State: state})
	}
	return rows
}
