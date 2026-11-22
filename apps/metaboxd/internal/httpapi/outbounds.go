package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"unicode/utf8"

	"metabox/internal/config"
	"metabox/internal/contract"
)

const maxOutboundMetadataBytes = 4 << 10

// OutboundRegistry stores label and norm edits independently of the config.
type OutboundRegistry interface {
	Entries() map[string]config.OutboundMetadata
	Set(context.Context, string, config.OutboundMetadata) error
}

func (s *Server) handleOutbounds(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	entries := s.outbounds.Entries()
	out := make(contract.Outbounds, len(entries))
	for tag, entry := range entries {
		out[tag] = contract.OutboundMetadata{Label: entry.Label, NormMS: entry.NormMS}
	}
	if len(out) != 0 {
		s.markUnusedOutbounds(r.Context(), out)
	}

	writeJSON(s.log, w, http.StatusOK, out)
}

func (s *Server) markUnusedOutbounds(ctx context.Context, out contract.Outbounds) {
	if s.configuredOutbounds == nil || s.runtimeOutbounds == nil {
		return
	}

	configured, err := s.configuredOutbounds(ctx)
	if err != nil {
		return
	}

	runtime, err := s.runtimeOutbounds(ctx)
	if err != nil {
		return
	}

	for tag, entry := range out {
		_, inConfig := configured[tag]
		_, inRuntime := runtime[tag]
		if !inConfig && !inRuntime {
			entry.Unused = true
			out[tag] = entry
		}
	}
}

func (s *Server) handleOutboundEdit(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxOutboundMetadataBytes))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	var req *contract.OutboundMetadataEdit
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if !utf8.Valid(body) || !json.Valid(body) {
		fail(s.log, w, r, errBadOutboundBody)

		return
	}
	if err := decoder.Decode(&req); err != nil || req == nil {
		fail(s.log, w, r, errors.Join(errBadOutboundBody, err))

		return
	}
	if err := s.outbounds.Set(r.Context(), r.PathValue("tag"), config.OutboundMetadata(*req)); err != nil {
		fail(s.log, w, r, err)

		return
	}

	s.handleOutbounds(w, r)
}
