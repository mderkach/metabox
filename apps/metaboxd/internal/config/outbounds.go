package config

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"metabox/internal/locale"
)

const (
	outboundsName       = "outbounds.json"
	maxOutboundTags     = 4096
	maxOutboundTagBytes = 1024
	maxLabelRunes       = 64
	maxNormMS           = 10000
)

// ErrOutboundMetadata means the label, norm, tag, or entry count is outside the stored limits.
var ErrOutboundMetadata = locale.New("outbound metadata rejected")

// OutboundMetadata is the panel's label and manual norm for a tag.
type OutboundMetadata struct {
	Label  string `json:"label,omitempty"`
	NormMS *int   `json:"norm_ms,omitempty"`
}

// OutboundRegistry owns the persisted map and its in-memory snapshot.
type OutboundRegistry struct {
	store   *Store
	mu      sync.RWMutex
	entries map[string]OutboundMetadata
}

// NewOutboundRegistry refuses an invalid state file so later edits cannot overwrite it.
func NewOutboundRegistry(ctx context.Context, store *Store) (*OutboundRegistry, error) {
	r := &OutboundRegistry{store: store, entries: map[string]OutboundMetadata{}}
	data, err := store.readState(ctx, outboundsName)
	if errors.Is(err, ErrNoState) {
		return r, nil
	}
	if err != nil {
		return nil, err
	}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if !utf8.Valid(data) || !json.Valid(data) {
		return nil, errors.New("parse outbound metadata: invalid JSON")
	}
	if err := decoder.Decode(&r.entries); err != nil {
		return nil, fmt.Errorf("parse outbound metadata: %w", err)
	}
	if r.entries == nil || len(r.entries) > maxOutboundTags {
		return nil, errors.New("parse outbound metadata: invalid entry map")
	}
	for tag, entry := range r.entries {
		if err := validateOutboundMetadata(tag, entry); err != nil {
			return nil, fmt.Errorf("parse outbound metadata: %w", err)
		}
		if entry.empty() {
			return nil, errors.New("parse outbound metadata: empty tag entry")
		}
	}

	return r, nil
}

// Entries returns detached values so an API response can compute its own availability.
func (r *OutboundRegistry) Entries() map[string]OutboundMetadata {
	r.mu.RLock()
	defer r.mu.RUnlock()

	entries := maps.Clone(r.entries)
	for key, entry := range entries {
		entries[key] = entry.clone()
	}

	return entries
}

// ManualNorms returns the overrides for evaluating a single latency snapshot.
func (r *OutboundRegistry) ManualNorms() map[string]int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	norms := map[string]int{}
	for tag, entry := range r.entries {
		if entry.NormMS != nil {
			norms[tag] = *entry.NormMS
		}
	}

	return norms
}

// Set replaces both fields. An empty entry removes the tag through the same atomic write.
func (r *OutboundRegistry) Set(ctx context.Context, tag string, entry OutboundMetadata) error {
	if err := validateOutboundMetadata(tag, entry); err != nil {
		return err
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	next := maps.Clone(r.entries)
	if entry.empty() {
		delete(next, tag)
	} else {
		next[tag] = entry.clone()
	}

	if len(next) > maxOutboundTags {
		return ErrOutboundMetadata
	}

	data, err := json.Marshal(next)
	if err != nil {
		return fmt.Errorf("encode outbound metadata: %w", err)
	}
	if err := r.store.writeState(ctx, outboundsName, data); err != nil {
		return err
	}

	r.entries = next

	return nil
}

func validateOutboundMetadata(tag string, entry OutboundMetadata) error {
	switch {
	case tag == "", len(tag) > maxOutboundTagBytes, !utf8.ValidString(tag), strings.ContainsFunc(tag, unicode.IsControl):
		return ErrOutboundMetadata
	case !utf8.ValidString(entry.Label), utf8.RuneCountInString(entry.Label) > maxLabelRunes,
		strings.ContainsFunc(entry.Label, unicode.IsControl):
		return ErrOutboundMetadata
	case entry.NormMS != nil && (*entry.NormMS < 1 || *entry.NormMS > maxNormMS):
		return ErrOutboundMetadata
	default:
		return nil
	}
}

func (entry OutboundMetadata) empty() bool {
	return entry.Label == "" && entry.NormMS == nil
}

func (entry OutboundMetadata) clone() OutboundMetadata {
	if entry.NormMS != nil {
		norm := *entry.NormMS
		entry.NormMS = &norm
	}

	return entry
}
