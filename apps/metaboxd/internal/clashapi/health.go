package clashapi

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// Checker ждёт, пока Clash API поднимется после рестарта сервиса — шаг 7
// протокола ADR-0002.
type Checker struct {
	client   *http.Client
	interval time.Duration
}

// NewChecker задаёт таймаут одного запроса и паузу между попытками. Общий срок
// ожидания приходит контекстом: он же обрывает опрос при остановке демона.
func NewChecker(requestTimeout, interval time.Duration) *Checker {
	return &Checker{
		client:   &http.Client{Timeout: requestTimeout},
		interval: interval,
	}
}

// Wait опрашивает контроллер, пока тот не ответит или пока не истечёт срок из
// контекста. Пустой Secret — штатный случай: форк отключает авторизацию
// целиком, когда секрет пуст, и заголовок в этом случае не нужен.
func (c *Checker) Wait(ctx context.Context, s Settings) error {
	base, err := s.BaseURL()
	if err != nil {
		return err
	}

	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	var last error
	for {
		err := c.ping(ctx, base, s.Secret)
		if err == nil {
			return nil
		}
		last = err

		select {
		case <-ctx.Done():
			return fmt.Errorf("ожидание Clash API: %w, последняя попытка: %w", ctx.Err(), last)
		case <-ticker.C:
		}
	}
}

func (c *Checker) ping(ctx context.Context, base, secret string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/version", nil)
	if err != nil {
		return fmt.Errorf("сборка запроса к %s: %w", base, err)
	}
	if secret != "" {
		req.Header.Set("Authorization", "Bearer "+secret)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("запрос к %s: %w", base, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s ответил %d", base, resp.StatusCode)
	}

	return nil
}
