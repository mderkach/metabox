package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
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
	snap    dataplane.Snapshot
	err     error
	applied bool
	reason  dataplane.AppliedReason
}

func (f fakeDataplane) Snapshot(context.Context) (dataplane.Snapshot, error) { return f.snap, f.err }

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
	srv := newDataplaneServer(t, fakeDataplane{reason: dataplane.NFTUnavailable})

	got := request(t, srv, http.MethodGet, "/api/dataplane", "", nil)
	if got.status != http.StatusOK {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	if etag := got.header.Get("ETag"); etag != `"`+(dataplane.Snapshot{}).Sum()+`"` {
		t.Errorf("ETag %q, ожидали отпечаток секции", etag)
	}

	var body contract.Dataplane
	got.decode(t, &body)

	if body.Model.RedirectPort != 5331 || body.Applied || body.AppliedReason != dataplane.NFTUnavailable {
		t.Errorf("ответ %+v", body)
	}
	if body.ForeignService {
		t.Error("без Plane служба названа чужой")
	}
}

func TestDataplaneModelForeignService(t *testing.T) {
	srv := newPlaneServer(t, &fakePlaneApplier{foreign: true})

	got := request(t, srv, http.MethodGet, "/api/dataplane", "", nil)
	if got.status != http.StatusOK {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	var body contract.Dataplane
	got.decode(t, &body)

	if !body.ForeignService {
		t.Error("foreign_service не отдан, панель предложит смену, которую демон отклонит")
	}
}

func TestDataplaneInvalid(t *testing.T) {
	fields := []dataplane.FieldError{{Field: "acl_mode", Value: "some", Reason: dataplane.ReasonInvalid}}
	srv := newDataplaneServer(t, fakeDataplane{snap: dataplane.Snapshot{
		Exists: true, Type: "dataplane", Options: map[string][]string{"acl_mode": {"some"}},
	}})

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
	base     string
	client   netip.Addr
	foreign  bool
}

func (f *fakePlaneApplier) ForeignService() bool { return f.foreign }

func (f *fakePlaneApplier) Start(_ context.Context, m dataplane.Model, base string, client netip.Addr) (apply.Transaction, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.startErr != nil {
		return apply.Transaction{}, f.startErr
	}

	f.model, f.base, f.client = m, base, client
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
		Dataplane: fakeDataplane{},
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

	etag := request(t, srv, http.MethodGet, "/api/dataplane", "", nil).header.Get("ETag")

	got := putDataplane(t, srv, etag, body)
	if got.status != http.StatusAccepted {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	var tx apply.Transaction
	got.decode(t, &tx)

	if tx.ID != "plane-1" || !slices.Equal(plane.model.SourceIP, model.SourceIP) {
		t.Errorf("транзакция %+v, модель %+v", tx, plane.model)
	}
	if want := (dataplane.Snapshot{}).Sum(); plane.base != want {
		t.Errorf("база смены %q, ожидали отпечаток из ETag %q", plane.base, want)
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
		{
			"секция изменилась после чтения", apply.ErrDataplaneModified, `{"model":{}}`,
			http.StatusPreconditionFailed, contract.ErrDataplaneModified,
		},
		{
			"демон управляет чужой службой", apply.ErrDataplaneForeignService, `{"model":{}}`,
			http.StatusConflict, contract.ErrDataplaneForeignService,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := newPlaneServer(t, &fakePlaneApplier{startErr: tt.startErr})

			got := putDataplane(t, srv, `"base"`, []byte(tt.body))
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

func TestDataplaneChangeWithoutIfMatch(t *testing.T) {
	plane := &fakePlaneApplier{}
	srv := newPlaneServer(t, plane)

	got := request(t, srv, http.MethodPut, "/api/dataplane", srv.URL, []byte(`{"model":{}}`))
	if got.status != http.StatusPreconditionRequired {
		t.Fatalf("код %d, тело %s", got.status, got.body)
	}

	var body contract.Error
	got.decode(t, &body)

	if body.Code != contract.ErrDataplaneModified {
		t.Errorf("код отказа %q, ожидали %q", body.Code, contract.ErrDataplaneModified)
	}
	if plane.Current().ID != "" {
		t.Error("смена без If-Match дошла до транзакции")
	}
}

func TestDataplaneChangeWithoutPlane(t *testing.T) {
	srv := newPlaneServer(t, nil)

	if got := putDataplane(t, srv, `"base"`, []byte(`{"model":{}}`)); got.status != http.StatusNotFound {
		t.Errorf("без смены обвязки PUT ответил %d", got.status)
	}
}

// putDataplane — PUT /api/dataplane со своим Origin и If-Match.
func putDataplane(t *testing.T, srv *httptest.Server, ifMatch string, body []byte) response {
	t.Helper()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodPut, srv.URL+"/api/dataplane", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}

	req.Header.Set("Origin", srv.URL)
	req.Header.Set("If-Match", ifMatch)

	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Errorf("закрытие тела ответа: %v", err)
		}
	}()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}

	return response{status: resp.StatusCode, contentType: resp.Header.Get("Content-Type"), header: resp.Header, body: string(raw)}
}
