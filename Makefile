BIN     := dist/metaboxd
VERSION ?= dev
LDFLAGS := -s -w -X metabox/internal/version.Version=$(VERSION)

.PHONY: all schema web daemon daemon-target dev test test-schemagen hooks clean up down sh target-sh apply-check stand-reset

all: daemon

# Regenerate web/src/shared/api/generated.ts from sing-box-extended.
# Build tags and linker flags come from the fork itself: without with_wireguard
# the schema silently loses the warp type (docs/adr/ADR-0001), and the fork's
# go:linkname tricks need -checklinkname=0.
SINGBOX_DIR = $(shell cd tools/schemagen && go list -m -f '{{.Dir}}' github.com/sagernet/sing-box)

schema:
	mkdir -p web/src/shared/api
	cd tools/schemagen && go run \
		-tags "$$(cat '$(SINGBOX_DIR)/release/DEFAULT_BUILD_TAGS')" \
		-ldflags "$$(cat '$(SINGBOX_DIR)/release/LDFLAGS')" . \
		-out ../../web/src/shared/api/generated.ts

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
	$(MAKE) test-schemagen
	pnpm --filter web test

# Генератор — отдельный модуль, `go test ./...` из корня его не видит.
# Теги и флаги те же, что у `make schema`: без них не соберётся.
test-schemagen:
	cd tools/schemagen && go test \
		-tags "$$(cat '$(SINGBOX_DIR)/release/DEFAULT_BUILD_TAGS')" \
		-ldflags "$$(cat '$(SINGBOX_DIR)/release/LDFLAGS')" ./...

# Git-хуки: их же ставит `pnpm install` через скрипт prepare.
hooks:
	pnpm exec lefthook install

# --- devcontainer -----------------------------------------------------------
# Стенд: dev (Go + Node) и target (OpenWrt с procd и sing-box-extended).

DC := docker compose -f .devcontainer/docker-compose.yml

# Поднять стенд целиком: фронт с HMR, демон и целевое окружение (AC-20)
# Демон собирается внутри dev-контейнера, а не на хосте: CGO_ENABLED=0 задан
# в Dockerfile.dev, и сборка на macOS дала бы darwin-бинарь, который target не
# запустит. Каталог dist/ смонтирован в target как /opt/metabox.
daemon-target:
	$(DC) up -d dev
	$(DC) exec -T dev go build -ldflags "$(LDFLAGS)" -o $(BIN) ./cmd/metaboxd

# AC-20: одна команда поднимает фронт с HMR, демон и целевое окружение.
# Демон собирается до старта target — иначе init.d не найдёт /opt/metabox/metaboxd.
up: daemon-target
	$(DC) up -d

down:
	$(DC) down

# Прогон Apply переписывает /etc/sing-box/config.json, а он лежит в именованном
# томе и переживает down/up. Сброс возвращает эталон из образа: без него
# проверки вида «sha256 до и после» считаются от неизвестного базиса.
stand-reset:
	$(DC) down
	docker volume rm -f metabox_singbox-etc
	$(MAKE) up

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
