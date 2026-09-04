BIN     := dist/metaboxd
VERSION ?= dev
LDFLAGS := -s -w -X metabox/internal/version.Version=$(VERSION)

.PHONY: all schema web daemon dev test hooks clean up down sh target-sh apply-check

all: daemon

# Regenerate web/src/shared/api/generated.ts from sing-box-extended.
schema:
	mkdir -p web/src/shared/api
	cd tools/schemagen && go run . -out ../../web/src/shared/api/generated.ts

# Build the SPA into web/dist.
web:
	pnpm --filter web build

# Build the daemon; the SPA is built first because it gets embedded.
daemon: web
	go build -ldflags "$(LDFLAGS)" -o $(BIN) ./cmd/metaboxd

# Run the SPA dev server.
dev:
	pnpm --filter web dev

test:
	go test ./...
	pnpm --filter web test

# Git-хуки: их же ставит `pnpm install` через скрипт prepare.
hooks:
	pnpm exec lefthook install

# --- devcontainer -----------------------------------------------------------
# Стенд: dev (Go + Node) и target (OpenWrt с procd и sing-box-extended).

DC := docker compose -f .devcontainer/docker-compose.yml

# Поднять стенд целиком: фронт с HMR, демон и целевое окружение (AC-20)
up:
	$(DC) up -d

down:
	$(DC) down

# Шелл в среде разработки
sh:
	$(DC) exec dev bash

# Шелл в целевом окружении
target-sh:
	$(DC) exec target sh

# Полный цикл Apply на целевом окружении: check → запись → restart → healthcheck (AC-21)
apply-check:
	$(DC) exec -T target sh /usr/bin/apply-cycle-check

clean:
	rm -rf dist web/dist
