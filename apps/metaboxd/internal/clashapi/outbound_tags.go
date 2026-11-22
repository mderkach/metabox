package clashapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
)

var errOutboundTagsUnread = errors.New("outbound tags have not been read")

// OutboundTags projects configured tags from the bytes already read for the
// runtime API resolver. It retains the tags and digest without retaining the config.
type OutboundTags struct {
	mu       sync.Mutex
	read     func(context.Context) ([]byte, error)
	revision string
	tags     map[string]struct{}
	err      error
}

// NewOutboundTags uses the existing config reader so tag refresh does not add a disk poll.
func NewOutboundTags(read func(context.Context) ([]byte, error)) *OutboundTags {
	return &OutboundTags{read: read, err: errOutboundTagsUnread}
}

func (o *OutboundTags) Read(ctx context.Context) ([]byte, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	data, err := o.read(ctx)
	if err != nil {
		o.err = err

		return nil, err
	}

	sum := sha256.Sum256(data)
	revision := hex.EncodeToString(sum[:])
	if o.revision != revision || o.err != nil {
		o.tags, o.err = configuredOutboundTags(data)
		o.revision = revision
	}

	return data, nil
}

// Current returns an immutable tag set from the last successful resolver read.
// The digest identifies bytes read from disk, independent of the core process.
func (o *OutboundTags) Current(ctx context.Context) (string, map[string]struct{}, error) {
	if err := ctx.Err(); err != nil {
		return "", nil, err
	}

	o.mu.Lock()
	defer o.mu.Unlock()

	if o.err != nil {
		return "", nil, o.err
	}

	return o.revision, o.tags, nil
}

func configuredOutboundTags(data []byte) (map[string]struct{}, error) {
	type entry struct {
		Tag string `json:"tag"`
	}

	var cfg struct {
		Outbounds []entry `json:"outbounds"`
		Endpoints []entry `json:"endpoints"`
	}

	if err := json.Unmarshal(mask(data), &cfg); err != nil {
		return nil, fmt.Errorf("read outbound tags: %w", err)
	}

	tags := make(map[string]struct{}, len(cfg.Outbounds)+len(cfg.Endpoints))
	for _, group := range [][]entry{cfg.Outbounds, cfg.Endpoints} {
		for _, item := range group {
			if item.Tag != "" {
				tags[item.Tag] = struct{}{}
			}
		}
	}

	return tags, nil
}
