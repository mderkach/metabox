package mcp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"sync"

	"metabox/internal/contract"
)

const tokenBytes = 32

// Store keeps the token hash file. ReadMCP returns an error for which
// errors.Is(err, fs.ErrNotExist) holds when MCP was never enabled.
type Store interface {
	ReadMCP(ctx context.Context) ([]byte, error)
	WriteMCP(ctx context.Context, data []byte) error
}

// record is the token hash file. An empty record means MCP is disabled.
type record struct {
	Hash []byte `json:"hash,omitempty"`
}

// Access owns the MCP token: only its SHA-256 hash is kept, in memory and in the file.
type Access struct {
	store Store

	// change serializes token changes: the write and the in-memory swap must not
	// interleave with another change.
	change sync.Mutex

	mu   sync.Mutex
	hash []byte
}

// NewAccess reads the hash file. It always returns a usable Access: with a file that
// cannot be read or parsed MCP is off and the error is returned for the log, so issuing a
// token from the panel overwrites the broken file.
func NewAccess(ctx context.Context, store Store) (*Access, error) {
	a := &Access{store: store}

	data, err := store.ReadMCP(ctx)
	if errors.Is(err, fs.ErrNotExist) {
		return a, nil
	}
	if err != nil {
		return a, err
	}

	var rec record
	if err := json.Unmarshal(data, &rec); err != nil {
		return a, fmt.Errorf("разбор файла токена MCP: %w", err)
	}

	if len(rec.Hash) != 0 && len(rec.Hash) != sha256.Size {
		return a, fmt.Errorf("файл токена MCP: хэш длиной %d байт", len(rec.Hash))
	}

	a.hash = rec.Hash

	return a, nil
}

// Enabled reports whether a token is set.
func (a *Access) Enabled() bool {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.hash != nil
}

// Permissions returns what the token allows; nil means the token is wrong or MCP is
// disabled. Phase one has a single permission, so every valid token gets read.
func (a *Access) Permissions(token string) []contract.MCPPermission {
	sum := sha256.Sum256([]byte(token))

	a.mu.Lock()
	defer a.mu.Unlock()

	if a.hash == nil || token == "" || subtle.ConstantTimeCompare(sum[:], a.hash) != 1 {
		return nil
	}

	return []contract.MCPPermission{contract.MCPRead}
}

// Issue generates a new token, which enables MCP and invalidates the previous one. The
// token is returned once: only its hash is stored. A failed write leaves the previous
// token in force.
func (a *Access) Issue(ctx context.Context) (string, error) {
	a.change.Lock()
	defer a.change.Unlock()

	raw := make([]byte, tokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("генерация токена MCP: %w", err)
	}

	token := base64.RawURLEncoding.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))

	if err := a.write(ctx, record{Hash: sum[:]}); err != nil {
		return "", err
	}

	a.mu.Lock()
	a.hash = sum[:]
	a.mu.Unlock()

	return token, nil
}

// Disable removes the token: the endpoint answers as an unknown path until a new one
// is issued.
func (a *Access) Disable(ctx context.Context) error {
	a.change.Lock()
	defer a.change.Unlock()

	if err := a.write(ctx, record{}); err != nil {
		return err
	}

	a.mu.Lock()
	a.hash = nil
	a.mu.Unlock()

	return nil
}

func (a *Access) write(ctx context.Context, rec record) error {
	data, err := json.Marshal(rec)
	if err != nil {
		return fmt.Errorf("сборка файла токена MCP: %w", err)
	}

	return a.store.WriteMCP(ctx, data)
}
