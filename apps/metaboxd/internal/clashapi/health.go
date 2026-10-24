package clashapi

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

// Checker waits until the Clash API comes up after the service restart, step 7
// of the apply protocol.
type Checker struct {
	client   *http.Client
	interval time.Duration
}

// NewChecker sets the timeout of one request and the pause between attempts. The total wait
// time comes via the context: it also interrupts the polling when the daemon stops.
func NewChecker(requestTimeout, interval time.Duration) *Checker {
	return &Checker{
		client:   &http.Client{Timeout: requestTimeout},
		interval: interval,
	}
}

// Wait polls the controller until it answers or the deadline from the
// context expires. An empty Secret is a regular case: the fork disables authorization
// entirely when the secret is empty, and the header is not needed then.
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
			return fmt.Errorf("wait for the Clash API: %w, last attempt: %w", ctx.Err(), last)
		case <-ticker.C:
		}
	}
}

func (c *Checker) ping(ctx context.Context, base, secret string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/version", nil)
	if err != nil {
		return fmt.Errorf("build request to %s: %w", base, err)
	}
	if secret != "" {
		req.Header.Set("Authorization", "Bearer "+secret)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("request to %s: %w", base, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s answered %d", base, resp.StatusCode)
	}

	return nil
}
