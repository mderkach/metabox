BIN        := dist/metaboxd
DEVICE_BIN := dist/metaboxd-linux-arm64
VERSION    ?= dev
LDFLAGS    := -s -w -X metabox/internal/version.Version=$(VERSION)

.PHONY: all schema schema-daemon web embed daemon daemon-device daemon-target dev dev-mock dev-mock-missing test test-schemagen lint hooks clean up down sh target-sh apply-check stand-reset

all: daemon

# Regenerate apps/web/src/shared/api/generated.ts from sing-box-extended.
# Build tags and linker flags come from the fork itself: without with_wireguard
# the schema silently loses the warp type (docs/adr/ADR-0001), and the fork's
# go:linkname tricks need -checklinkname=0.
SINGBOX_DIR = $(shell cd tools/schemagen && go list -m -f '{{.Dir}}' github.com/sagernet/sing-box)

schema:
	mkdir -p apps/web/src/shared/api
	cd tools/schemagen && go run \
		-tags "$$(cat '$(SINGBOX_DIR)/release/DEFAULT_BUILD_TAGS')" \
		-ldflags "$$(cat '$(SINGBOX_DIR)/release/LDFLAGS')" . \
		-out ../../apps/web/src/shared/api/generated.ts

# Regenerate apps/web/src/shared/api/daemon.generated.ts from the daemon's own
# contract. Тегов и флагов форка тут не нужно: генератор читает исходники
# демона и живёт в его модуле без зависимостей.
schema-daemon:
	mkdir -p apps/web/src/shared/api
	cd apps/metaboxd && go run ./cmd/contractgen \
		-root . \
		-out ../../apps/web/src/shared/api/daemon.generated.ts

# Build the SPA into apps/web/dist.
web:
	pnpm --filter web build

# Каталог, из которого go:embed берёт статику. Директива не поднимается выше
# каталога своего пакета, поэтому собранная SPA переезжает сюда (ADR-0003).
# В git тут лежит только .gitkeep — он держит каталог непустым, чтобы Go-часть
# собиралась и тестировалась без фронта.
EMBED_DIR := apps/metaboxd/internal/webui/static

# Зависит от web: при параллельной сборке embed иначе скопировал бы каталог,
# который фронт ещё не дописал.
embed: web
	find $(EMBED_DIR) -mindepth 1 ! -name .gitkeep -delete
	cp -R apps/web/dist/. $(EMBED_DIR)/

# Build the daemon; the SPA is built first because it gets embedded.
# BIN is relative to the repository root, so the build runs from there.
daemon: embed
	cd apps/metaboxd && go build -ldflags "$(LDFLAGS)" -o ../../$(BIN) .

# Сборка под целевое устройство: OpenWrt на aarch64 (раздел 9 PRD). CGO
# выключен, иначе бинарь привяжется к libc сборочной машины и на роутере
# не запустится.
daemon-device: embed
	cd apps/metaboxd && GOOS=linux GOARCH=arm64 CGO_ENABLED=0 \
		go build -ldflags "$(LDFLAGS)" -o ../../$(DEVICE_BIN) .

# Run the SPA dev server.
dev:
	pnpm --filter web dev

# То же на моках MSW: демон и Clash API не нужны, данные берутся из фикстур.
dev-mock:
	pnpm --filter web dev:mock

# Моки только там, где ручек у демона ещё нет; остальное идёт на живой демон.
dev-mock-missing:
	pnpm --filter web dev:mock-missing

test:
	cd apps/metaboxd && go test ./...
	$(MAKE) test-schemagen
	pnpm --filter web test

# Генератор — отдельный модуль, тесты демона его не видят.
# Теги и флаги те же, что у `make schema`: без них не соберётся.
test-schemagen:
	cd tools/schemagen && go test \
		-tags "$$(cat '$(SINGBOX_DIR)/release/DEFAULT_BUILD_TAGS')" \
		-ldflags "$$(cat '$(SINGBOX_DIR)/release/LDFLAGS')" ./...

# Версия линтера фиксируется здесь: tool-директива в go.mod демона притащила бы
# в него двести строк чужих зависимостей. Генератор — отдельный модуль, и теги
# ему нужны те же, что для сборки.
GOLANGCI = go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.13.2

lint:
	cd apps/metaboxd && $(GOLANGCI) run ./...
	cd tools/schemagen && $(GOLANGCI) run \
		--build-tags "$$(cat '$(SINGBOX_DIR)/release/DEFAULT_BUILD_TAGS')" ./...

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
# Статику стенд раздаёт сам Vite с HMR (AC-20), поэтому embed здесь не нужен:
# демон в стенде отвечает только API и говорит об этом в лог.
daemon-target:
	$(DC) up -d dev
	$(DC) exec -T dev sh -c 'cd apps/metaboxd && go build -ldflags "$(LDFLAGS)" -o ../../$(BIN) .'

# AC-20: одна команда поднимает фронт с HMR, демон и целевое окружение.
# Демон собирается до старта target — иначе init.d не найдёт /opt/metabox/metaboxd.
#
# --build обязателен: без него compose берёт готовый образ, и подъём версии
# sing-box в target/Dockerfile молча не доезжает до стенда. Пересборка с кэшем
# занимает секунды, а стенд на устаревшем бинаре проверяет не то, что нужно.
up: daemon-target
	$(DC) up -d --build

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
	rm -rf dist apps/web/dist
	find $(EMBED_DIR) -mindepth 1 ! -name .gitkeep -delete
