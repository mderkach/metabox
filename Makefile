BIN        := dist/metaboxd
DEVICE_BIN := dist/metaboxd-linux-arm64
VERSION    ?= dev
LDFLAGS    := -s -w -X metabox/internal/version.Version=$(VERSION)

# Прижимает версию вниз: директива `go` в go.mod поднимает, но не опускает.
export GOTOOLCHAIN := go$(shell cat .go-version)

.PHONY: all schema schema-daemon web embed daemon daemon-device daemon-target dev dev-mock dev-mock-missing test test-schemagen lint hooks clean up down sh target-sh apply-check stand-reset

all: daemon

# Без with_wireguard схема теряет тип warp; go:linkname в форке требует
# -checklinkname=0. with_purego добавлен сверх набора форка: иначе
# with_naive_outbound тянет cronet, чей libcronet.a GNU ld на CI отвергает
# («skipping incompatible»). Схема с purego получается байт в байт та же.
SINGBOX_DIR = $(shell cd tools/schemagen && go list -m -f '{{.Dir}}' github.com/sagernet/sing-box)
SCHEMA_TAGS = $(shell cat '$(SINGBOX_DIR)/release/DEFAULT_BUILD_TAGS'),with_purego
SCHEMA_LDFLAGS = $(shell cat '$(SINGBOX_DIR)/release/LDFLAGS')

schema:
	mkdir -p apps/web/src/shared/api
	cd tools/schemagen && go run \
		-tags "$(SCHEMA_TAGS)" -ldflags "$(SCHEMA_LDFLAGS)" . \
		-out ../../apps/web/src/shared/api/generated.ts

schema-daemon:
	mkdir -p apps/web/src/shared/api
	cd apps/metaboxd && go run ./cmd/contractgen \
		-root . \
		-out ../../apps/web/src/shared/api/daemon.generated.ts

web:
	pnpm --filter web build

# go:embed не видит каталоги выше своего пакета, поэтому SPA переезжает сюда.
EMBED_DIR := apps/metaboxd/internal/webui/static

# Зависит от web: при параллельной сборке embed скопировал бы недописанный каталог.
embed: web
	find $(EMBED_DIR) -mindepth 1 ! -name .gitkeep -delete
	cp -R apps/web/dist/. $(EMBED_DIR)/

daemon: embed
	cd apps/metaboxd && go build -ldflags "$(LDFLAGS)" -o ../../$(BIN) .

# Без CGO_ENABLED=0 бинарь привяжется к libc сборочной машины и на роутере
# не запустится.
daemon-device: embed
	cd apps/metaboxd && GOOS=linux GOARCH=arm64 CGO_ENABLED=0 \
		go build -ldflags "$(LDFLAGS)" -o ../../$(DEVICE_BIN) .

dev:
	pnpm --filter web dev

dev-mock:
	pnpm --filter web dev:mock

dev-mock-missing:
	pnpm --filter web dev:mock-missing

test:
	cd apps/metaboxd && go test ./...
	$(MAKE) test-schemagen
	pnpm --filter web test

test-schemagen:
	cd tools/schemagen && go test \
		-tags "$(SCHEMA_TAGS)" -ldflags "$(SCHEMA_LDFLAGS)" ./...

GOLANGCI = go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.13.2

lint:
	cd apps/metaboxd && $(GOLANGCI) run ./...
	cd tools/schemagen && $(GOLANGCI) run --build-tags "$(SCHEMA_TAGS)" ./...

hooks:
	pnpm exec lefthook install

DC := docker compose -f .devcontainer/docker-compose.yml

# GOTOOLCHAIN уезжает в контейнер явно: образ golang держит его в `local`, и
# версия из .go-version там не подхватывается — сборка падает, как только
# go.mod требует патч свежее того, что вмёрз в образ.
daemon-target:
	$(DC) up -d dev
	$(DC) exec -T -e GOTOOLCHAIN=$(GOTOOLCHAIN) dev sh -c 'cd apps/metaboxd && go build -ldflags "$(LDFLAGS)" -o ../../$(BIN) .'

# --build обязателен: иначе подъём версии sing-box в target/Dockerfile
# не доезжает до стенда.
up: daemon-target
	$(DC) up -d --build

down:
	$(DC) down

# Конфиг лежит в именованном томе и переживает down/up; сброс возвращает
# эталон из образа.
stand-reset:
	$(DC) down
	docker volume rm -f metabox_singbox-etc
	$(MAKE) up

sh:
	$(DC) exec dev bash

target-sh:
	$(DC) exec target sh

apply-check:
	$(DC) exec -T target sh /usr/bin/apply-cycle-check

clean:
	rm -rf dist apps/web/dist
	find $(EMBED_DIR) -mindepth 1 ! -name .gitkeep -delete
