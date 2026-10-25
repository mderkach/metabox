package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/netip"

	"metabox/internal/apply"
	"metabox/internal/contract"
	"metabox/internal/dataplane"
)

// maxDataplaneBytes is the ceiling of the model change body: it holds address and MAC lists.
const maxDataplaneBytes = 256 << 10

// PlaneApplier is a dataplane model change by the apply protocol. The interface
// is declared here, at the consumer.
type PlaneApplier interface {
	Start(ctx context.Context, model dataplane.Model, base string, client netip.Addr) (apply.Transaction, error)
	Confirm(ctx context.Context, id string) (apply.Transaction, error)
	Current() apply.Transaction
}

// handleDataplaneChange starts a model change. The response goes after the model
// check, before the write: the change, like a config apply, lives longer than the request.
//
// The client address is taken from RemoteAddr: behind the dev test bench proxy it is the proxy address, and
// the warning about taking the administrator out of interception does not fire there.
//
// If-Match is required, unlike the config Apply: a config without the header
// keeps the check against what the daemon wrote itself, while a UCI section has no such base.
func (s *Server) handleDataplaneChange(w http.ResponseWriter, r *http.Request) {
	match := r.Header.Get("If-Match")
	if match == "" {
		fail(s.log, w, r, errDataplaneBaseMissing)

		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxDataplaneBytes))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	var req contract.DataplaneChange
	if err := json.Unmarshal(body, &req); err != nil {
		fail(s.log, w, r, errors.Join(errBadDataplaneBody, err))

		return
	}

	var client netip.Addr
	if addr, err := netip.ParseAddrPort(r.RemoteAddr); err == nil {
		client = addr.Addr()
	}

	tx, err := s.plane.Start(r.Context(), req.Model, baseSum(match), client)
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusAccepted, tx)
}

func (s *Server) handleDataplaneState(w http.ResponseWriter, r *http.Request) {
	tx := s.plane.Current()
	if tx.ID != r.PathValue("id") {
		fail(s.log, w, r, apply.ErrUnknownTransaction)

		return
	}

	writeJSON(s.log, w, http.StatusOK, tx)
}

func (s *Server) handleDataplaneConfirm(w http.ResponseWriter, r *http.Request) {
	tx, err := s.plane.Confirm(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(s.log, w, r, err)

		return
	}

	writeJSON(s.log, w, http.StatusOK, tx)
}
