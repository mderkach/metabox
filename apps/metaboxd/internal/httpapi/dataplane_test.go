package httpapi_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"slices"
	"sync"
	"testing"
	"time"

	"metabox/internal/apply"
	"metabox/internal/contract"
	"metabox/internal/dataplane"
	"metabox/internal/httpapi"
)

type fakeDataplane struct {
	model   dataplane.Model
	err     error
	applied bool
	reason  dataplane.AppliedReason
}

func (f fakeDataplane) Model(context.Context) (dataplane.Model, error) { return f.model, f.err }

func (f fakeDataplane) Applied(context.Context) (bool, dataplane.AppliedReason, error) {
	return f.applied, f.reason, nil
}

func newDataplaneServer(t *testing.T, plane httpapi.DataplaneReader) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
		Version:   "test",
		Dataplane: plane,
	}))
	t.Cleanup(srv.Close)

	return srv
}

func TestDataplaneModel(t *testing.T) {
	srv := newDataplaneServer(t, fakeDataplane{model: dataplane.Defaults(), reason: dataplane.NFTUnavailable})

	got := request(t, srv, http.MethodGet, "/api/dataplane", "", nil)
	if got.status != http.StatusOK {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	var body contract.Dataplane
	got.decode(t, &body)

	if body.Model.RedirectPort != 5331 || body.Applied || body.AppliedReason != dataplane.NFTUnavailable {
		t.Errorf("ответ %+v", body)
	}
}

func TestDataplaneInvalid(t *testing.T) {
	fields := []dataplane.FieldError{{Field: "acl_mode", Value: "some", Reason: dataplane.ReasonInvalid}}
	srv := newDataplaneServer(t, fakeDataplane{err: &dataplane.InvalidError{Fields: fields}})

	got := request(t, srv, http.MethodGet, "/api/dataplane", "", nil)
	if got.status != http.StatusUnprocessableEntity {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	var body struct {
		Code    contract.ErrorCode        `json:"code"`
		Details contract.DataplaneDetails `json:"details"`
	}
	got.decode(t, &body)

	if body.Code != contract.ErrDataplaneInvalid || len(body.Details.Fields) != 1 || body.Details.Fields[0] != fields[0] {
		t.Errorf("отказ %+v", body)
	}
}

func TestDataplaneWithoutReader(t *testing.T) {
	srv := newDataplaneServer(t, nil)

	if got := request(t, srv, http.MethodGet, "/api/dataplane", "", nil); got.status != http.StatusNotFound {
		t.Errorf("без читателя ручка ответила %d", got.status)
	}
}

type fakePlaneApplier struct {
	mu       sync.Mutex
	current  apply.Transaction
	startErr error
	model    dataplane.Model
	client   netip.Addr
}

func (f *fakePlaneApplier) Start(_ context.Context, m dataplane.Model, client netip.Addr) (apply.Transaction, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.startErr != nil {
		return apply.Transaction{}, f.startErr
	}

	f.model, f.client = m, client
	f.current = apply.Transaction{ID: "plane-1", Phase: apply.PhaseApplying, Window: time.Minute}

	return f.current, nil
}

func (f *fakePlaneApplier) Confirm(_ context.Context, id string) (apply.Transaction, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if id != f.current.ID {
		return apply.Transaction{}, apply.ErrUnknownTransaction
	}

	f.current.Phase = apply.PhaseConfirmed

	return f.current, nil
}

func (f *fakePlaneApplier) Current() apply.Transaction {
	f.mu.Lock()
	defer f.mu.Unlock()

	return f.current
}

func newPlaneServer(t *testing.T, plane httpapi.PlaneApplier) *httptest.Server {
	t.Helper()

	srv := httptest.NewServer(httpapi.NewServer(&fakeApplier{}, fakeReader{}, testLogger(t), httpapi.Options{
		Version:   "test",
		Dataplane: fakeDataplane{model: dataplane.Defaults()},
		Plane:     plane,
	}))
	t.Cleanup(srv.Close)

	return srv
}

func TestDataplaneChangeCycle(t *testing.T) {
	plane := &fakePlaneApplier{}
	srv := newPlaneServer(t, plane)

	model := dataplane.Defaults()
	model.SourceIP = []string{"192.168.1.10"}

	body, err := json.Marshal(contract.DataplaneChange{Model: model})
	if err != nil {
		t.Fatal(err)
	}

	got := request(t, srv, http.MethodPut, "/api/dataplane", srv.URL, body)
	if got.status != http.StatusAccepted {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	var tx apply.Transaction
	got.decode(t, &tx)

	if tx.ID != "plane-1" || !slices.Equal(plane.model.SourceIP, model.SourceIP) {
		t.Errorf("транзакция %+v, модель %+v", tx, plane.model)
	}
	if !plane.client.IsLoopback() {
		t.Errorf("адрес клиента %v, ожидали адрес запроса", plane.client)
	}

	var status contract.Status
	request(t, srv, http.MethodGet, "/api/status", "", nil).decode(t, &status)

	if status.DataplaneTransaction == nil || status.DataplaneTransactionHref != "/api/dataplane/apply/plane-1" {
		t.Errorf("статус без смены обвязки: %+v", status)
	}
	if status.Transaction != nil {
		t.Error("смена обвязки показана транзакцией конфига")
	}

	if got := request(t, srv, http.MethodGet, "/api/dataplane/apply/plane-1", "", nil); got.status != http.StatusOK {
		t.Errorf("состояние: код %d", got.status)
	}

	if got := request(t, srv, http.MethodGet, "/api/dataplane/apply/other", "", nil); got.status != http.StatusNotFound {
		t.Errorf("чужая транзакция: код %d", got.status)
	}

	got = request(t, srv, http.MethodPost, "/api/dataplane/apply/plane-1/confirm", srv.URL, nil)
	if got.status != http.StatusOK {
		t.Fatalf("подтверждение: код %d, тело %s", got.status, got.body)
	}

	got.decode(t, &tx)
	if tx.Phase != apply.PhaseConfirmed {
		t.Errorf("фаза %q, ожидали подтверждение", tx.Phase)
	}
}

func TestDataplaneChangeRejected(t *testing.T) {
	tests := []struct {
		name     string
		startErr error
		body     string
		status   int
		code     contract.ErrorCode
	}{
		{"тело не JSON", nil, "{", http.StatusBadRequest, contract.ErrDataplaneInvalid},
		{
			"модель не принята", &dataplane.InvalidError{Fields: []dataplane.FieldError{{Field: "dns_port", Reason: dataplane.ReasonOutOfRange}}},
			`{"model":{}}`, http.StatusUnprocessableEntity, contract.ErrDataplaneInvalid,
		},
		{"идёт применение конфига", apply.ErrBusy, `{"model":{}}`, http.StatusConflict, contract.ErrApplyInProgress},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newPlaneServer(t, &fakePlaneApplier{startErr: tt.startErr})

			got := request(t, srv, http.MethodPut, "/api/dataplane", srv.URL, []byte(tt.body))
			if got.status != tt.status {
				t.Fatalf("код %d, ожидали %d; тело %s", got.status, tt.status, got.body)
			}

			var body contract.Error
			got.decode(t, &body)

			if body.Code != tt.code {
				t.Errorf("код отказа %q, ожидали %q", body.Code, tt.code)
			}
		})
	}
}

func TestDataplaneChangeWithoutPlane(t *testing.T) {
	srv := newPlaneServer(t, nil)

	if got := request(t, srv, http.MethodPut, "/api/dataplane", srv.URL, []byte(`{"model":{}}`)); got.status != http.StatusNotFound {
		t.Errorf("без смены обвязки PUT ответил %d", got.status)
	}
}
