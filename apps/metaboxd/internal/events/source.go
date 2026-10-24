package events

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// errNoService means the service state source is not set: the stream lives
// without it, just without the service topic.
var errNoService = errors.New("service state source not set")

// errNoSystem means there is nothing to read the device readings with: the stream lives
// without them, just without the system topic.
var errNoSystem = errors.New("device readings source not set")

// Settings is the controller address and secret at the time of the request.
type Settings struct {
	BaseURL string
	Secret  string
}

// Resolver returns the controller settings. Read on every connection: the port
// changes together with the config.
type Resolver func(ctx context.Context) (Settings, error)

// ServiceReader returns the service state in the form the `/api/service` handler
// returns it. The interface is declared here, at the consumer.
type ServiceReader func(ctx context.Context) (json.RawMessage, error)

// SystemReader returns the device readings. They are read not by the Clash API, but they go into the stream
// the same way as everything else.
type SystemReader func(ctx context.Context) (json.RawMessage, error)

// ClashSource reads the runtime from the Clash API. The `/traffic` and `/memory` streams the fork
// serves without WebSocket too, as a plain chunked response with a line per second,
// so the daemon has no WebSocket client.
type ClashSource struct {
	resolve Resolver
	service ServiceReader
	system  SystemReader
	client  *http.Client
	// snapshotTimeout limits a one-off request; streams live without a deadline.
	snapshotTimeout time.Duration
}

// NewClashSource assembles the source.
func NewClashSource(
	resolve Resolver,
	service ServiceReader,
	system SystemReader,
	snapshotTimeout time.Duration,
) *ClashSource {
	return &ClashSource{
		resolve:         resolve,
		service:         service,
		system:          system,
		client:          &http.Client{},
		snapshotTimeout: snapshotTimeout,
	}
}

// Stream holds a line-by-line response until a break or cancellation.
func (s *ClashSource) Stream(ctx context.Context, path string, sink func(json.RawMessage)) error {
	response, err := s.do(ctx, path)
	if err != nil {
		return err
	}
	defer func() { _ = response.Body.Close() }()

	return lines(response.Body, sink)
}

// maxSnapshotBytes is the ceiling on a one-off response. The largest is `/connections`
// of a loaded router, a few megabytes; the ceiling covers it with a margin and
// does not let a process that took the controller port while sing-box is down take
// the router memory.
const maxSnapshotBytes = 16 << 20

// errSnapshotTooLarge: a one-off response is larger than maxSnapshotBytes. Truncated JSON
// would not parse, and parsing it whole without a ceiling would cost memory.
var errSnapshotTooLarge = errors.New("response larger than allowed")

// Snapshot reads a one-off response whole.
func (s *ClashSource) Snapshot(ctx context.Context, path string) (json.RawMessage, error) {
	ctx, cancel := context.WithTimeout(ctx, s.snapshotTimeout)
	defer cancel()

	response, err := s.do(ctx, path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = response.Body.Close() }()

	// A byte beyond the ceiling is read deliberately: it tells an excess from
	// an answer exactly at the ceiling.
	body, err := io.ReadAll(io.LimitReader(response.Body, maxSnapshotBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	if len(body) > maxSnapshotBytes {
		return nil, fmt.Errorf("read %s: %w", path, errSnapshotTooLarge)
	}

	return body, nil
}

// ServiceState returns the service state.
func (s *ClashSource) ServiceState(ctx context.Context) (json.RawMessage, error) {
	if s.service == nil {
		return nil, errNoService
	}

	return s.service(ctx)
}

// SystemState returns the device readings.
func (s *ClashSource) SystemState(ctx context.Context) (json.RawMessage, error) {
	if s.system == nil {
		return nil, errNoSystem
	}

	return s.system(ctx)
}

func (s *ClashSource) do(ctx context.Context, path string) (*http.Response, error) {
	settings, err := s.resolve(ctx)
	if err != nil {
		return nil, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, settings.BaseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("build request %s: %w", path, err)
	}

	if settings.Secret != "" {
		request.Header.Set("Authorization", "Bearer "+settings.Secret)
	}

	response, err := s.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("request %s: %w", path, err)
	}

	if response.StatusCode != http.StatusOK {
		_ = response.Body.Close()

		return nil, fmt.Errorf("request %s: status %d", path, response.StatusCode)
	}

	return response, nil
}
