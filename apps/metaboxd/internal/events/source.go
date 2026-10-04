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

// errNoService означает, что источник состояния службы не задан: поток живёт
// и без него, просто без топика service.
var errNoService = errors.New("источник состояния службы не задан")

// errNoSystem означает, что показания устройства читать нечем: поток живёт и
// без них, просто без топика system.
var errNoSystem = errors.New("источник показаний устройства не задан")

// Settings — адрес и секрет контроллера на момент запроса.
type Settings struct {
	BaseURL string
	Secret  string
}

// Resolver отдаёт настройки контроллера. Читаются на каждое подключение: порт
// меняется вместе с конфигом.
type Resolver func(ctx context.Context) (Settings, error)

// ServiceReader отдаёт состояние службы в том виде, в каком его отдаёт ручка
// `/api/service`. Интерфейс объявлен здесь, у потребителя.
type ServiceReader func(ctx context.Context) (json.RawMessage, error)

// SystemReader отдаёт показания устройства. Читает их не Clash API, но в поток
// они идут тем же путём, что и остальное.
type SystemReader func(ctx context.Context) (json.RawMessage, error)

// ClashSource читает рантайм у Clash API. Потоки `/traffic` и `/memory` форк
// отдаёт и без WebSocket — обычным chunked-ответом по строке в секунду,
// поэтому клиента WebSocket в демоне не заводится.
type ClashSource struct {
	resolve Resolver
	service ServiceReader
	system  SystemReader
	client  *http.Client
	// snapshotTimeout ограничивает разовый запрос; потоки живут без дедлайна.
	snapshotTimeout time.Duration
}

// NewClashSource собирает источник.
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

// Stream держит построчный ответ до обрыва или отмены.
func (s *ClashSource) Stream(ctx context.Context, path string, sink func(json.RawMessage)) error {
	response, err := s.do(ctx, path)
	if err != nil {
		return err
	}
	defer func() { _ = response.Body.Close() }()

	return lines(response.Body, sink)
}

// maxSnapshotBytes — потолок на разовый ответ. Самый крупный — `/connections`
// загруженного роутера, единицы мегабайт; потолок перекрывает его с запасом и
// не даёт процессу, занявшему порт контроллера при лежащем sing-box, забрать
// память роутера.
const maxSnapshotBytes = 16 << 20

// errSnapshotTooLarge — разовый ответ больше maxSnapshotBytes. Обрезанный JSON
// не разобрался бы, а разбор целиком без потолка стоил бы памяти.
var errSnapshotTooLarge = errors.New("ответ больше допустимого")

// Snapshot читает разовый ответ целиком.
func (s *ClashSource) Snapshot(ctx context.Context, path string) (json.RawMessage, error) {
	ctx, cancel := context.WithTimeout(ctx, s.snapshotTimeout)
	defer cancel()

	response, err := s.do(ctx, path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = response.Body.Close() }()

	// Байт сверх потолка читается намеренно: по нему превышение отличается от
	// ответа ровно в потолок.
	body, err := io.ReadAll(io.LimitReader(response.Body, maxSnapshotBytes+1))
	if err != nil {
		return nil, fmt.Errorf("чтение %s: %w", path, err)
	}

	if len(body) > maxSnapshotBytes {
		return nil, fmt.Errorf("чтение %s: %w", path, errSnapshotTooLarge)
	}

	return body, nil
}

// ServiceState отдаёт состояние службы.
func (s *ClashSource) ServiceState(ctx context.Context) (json.RawMessage, error) {
	if s.service == nil {
		return nil, errNoService
	}

	return s.service(ctx)
}

// SystemState отдаёт показания устройства.
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
		return nil, fmt.Errorf("сборка запроса %s: %w", path, err)
	}

	if settings.Secret != "" {
		request.Header.Set("Authorization", "Bearer "+settings.Secret)
	}

	response, err := s.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("запрос %s: %w", path, err)
	}

	if response.StatusCode != http.StatusOK {
		_ = response.Body.Close()

		return nil, fmt.Errorf("запрос %s: код %d", path, response.StatusCode)
	}

	return response, nil
}
