BIN     := dist/metaboxd
VERSION ?= dev
LDFLAGS := -s -w -X metabox/internal/version.Version=$(VERSION)

.PHONY: all schema web daemon dev test clean

all: daemon

# Regenerate web/src/schema.generated.ts from sing-box-extended.
schema:
	cd tools/schemagen && go run . -out ../../web/src/schema.generated.ts

# Build the SPA into web/dist.
web:
	pnpm -C web build

# Build the daemon; the SPA is built first because it gets embedded.
daemon: web
	go build -ldflags "$(LDFLAGS)" -o $(BIN) ./cmd/metaboxd

# Run the SPA dev server.
dev:
	pnpm -C web dev

test:
	go test ./...
	pnpm -C web test

clean:
	rm -rf dist web/dist
