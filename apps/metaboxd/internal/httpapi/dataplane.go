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

// maxDataplaneBytes — потолок тела смены модели: в нём списки адресов и MAC.
const maxDataplaneBytes = 256 << 10

// PlaneApplier — смена модели обвязки протоколом применения. Интерфейс
// объявлен здесь, у потребителя.
type PlaneApplier interface {
	Start(ctx context.Context, model dataplane.Model, base string, client netip.Addr) (apply.Transaction, error)
	Confirm(ctx context.Context, id string) (apply.Transaction, error)
	Current() apply.Transaction
}

// handleDataplaneChange запускает смену модели. Ответ уходит после проверки
// модели, до записи: смена, как и применение конфига, живёт дольше запроса.
//
// Адрес клиента берётся из RemoteAddr: за прокси дев-стенда это адрес прокси, и
// предупреждение о выводе администратора из перехвата там не срабатывает.
//
// If-Match обязателен, в отличие от Apply конфига: у конфига без заголовка
// остаётся сверка с тем, что записал сам демон, а у секции UCI такой базы нет.
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
