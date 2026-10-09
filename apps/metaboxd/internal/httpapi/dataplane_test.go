package httpapi_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

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
