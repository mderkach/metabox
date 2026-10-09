BIN        := dist/metaboxd
DEVICE_BIN := dist/metaboxd-linux-arm64
VERSION    ?= dev
LDFLAGS    := -s -w -X metabox/internal/version.Version=$(VERSION)

# Прижимает версию вниз: директива `go` в go.mod поднимает, но не опускает.
export GOTOOLCHAIN := go$(shell cat .go-version)

.PHONY: all schema schema-daemon rule-set-snapshot web embed daemon daemon-device daemon-target dev dev-mock dev-mock-missing test test-schemagen lint hooks clean up up-dev down sh target-sh apply-check reach-check dataplane-check package stand-base stand-reset

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

# Снимок каталога наборов, встроенный в бинарь: с ним демон стартует, пока не
# сверился с поставщиками сам. Ходит в GitHub API, поэтому в сборку не входит.
rule-set-snapshot:
	cd apps/metaboxd && go run ./cmd/rulesetsnap -out internal/ruleset/snapshot.json

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

# Настройки стенда не коммитятся и живут в одном файле: docker compose читает его
# сам, make — этой директивой. Иначе `make package` собрал бы пакет под арку
# образа по умолчанию, а стенд рядом поднялся бы на образе из прошивки.
-include .devcontainer/.env

OPENWRT_PLATFORM ?= linux/aarch64_generic
METABOX_BASE_IMAGE ?= openwrt/rootfs:aarch64_generic-25.12.4
DAEMON_BINARY ?= $(DEVICE_BIN)
# apk не принимает версией строку вроде `dev`, которой по умолчанию помечается
# бинарь, поэтому у пакета своя нумерация.
PKG_VERSION ?= 0.0.0-r0

# Значения уезжают в docker compose: он берёт их из окружения, а не из Makefile.
export METABOX_BASE_IMAGE OPENWRT_PLATFORM DAEMON_BINARY PKG_VERSION

DC := docker compose -f .devcontainer/docker-compose.yml

# GOTOOLCHAIN уезжает в контейнер явно: образ golang держит его в `local`, и
# версия из .go-version там не подхватывается — сборка падает, как только
# go.mod требует патч свежее того, что вмёрз в образ.
daemon-target:
	$(DC) up -d dev
	$(DC) exec -T -e GOTOOLCHAIN=$(GOTOOLCHAIN) dev sh -c 'cd apps/metaboxd && go build -ldflags "$(LDFLAGS)" -o ../../$(BIN) .'

# Пакет панели для устройства. Собирается той же стадией, что ставит панель в
# стенд, и под ту же арку, что объявляет база стенда: разойтись поставке и
# проверке негде. OpenWrt SDK не нужен — apk-tools берётся из alpine (ADR-0011).
package: daemon-device
	docker build --platform $(OPENWRT_PLATFORM) \
		--build-arg BASE_IMAGE=$(METABOX_BASE_IMAGE) \
		--build-arg PKG_VERSION=$(PKG_VERSION) \
		--build-arg DAEMON_BINARY=$(DAEMON_BINARY) \
		--target package-out --output type=local,dest=dist \
		-f .devcontainer/target/Dockerfile .

# Образ целевого окружения из образа устройства с downloads.openwrt.org: ветка
# OpenWrt, арка и apk там те же, что на роутере. Цель ручная: образ устройства
# меняется реже, чем стенд, а CI собирается на публичном rootfs своей арки.
DEVICE_IMAGE ?= metabox/openwrt-device:latest

stand-base:
	docker build --platform $(OPENWRT_PLATFORM) \
		$(if $(DEVICE_IMAGE_URL),--build-arg DEVICE_IMAGE_URL=$(DEVICE_IMAGE_URL),) \
		-t $(DEVICE_IMAGE) .devcontainer/target/device-base

# Стенд ставит панель пакетом, поэтому ему нужен бинарь под устройство.
# --build обязателен: иначе подъём версии sing-box или правка демона
# не доезжают до стенда.
up: daemon-device
	$(DC) up -d --build

# То же плюс дев-сервер с HMR: панель открывается на 5173 и ходит в тот же демон.
up-dev: daemon-device
	$(DC) --profile dev up -d --build

down:
	$(DC) --profile dev down

# Конфиг лежит в именованном томе и переживает down/up; сброс возвращает
# эталон из образа.
stand-reset: down
	docker volume rm -f metabox_singbox-etc
	$(MAKE) up

sh:
	$(DC) exec dev bash

target-sh:
	$(DC) exec target sh

apply-check:
	$(DC) exec -T target sh /usr/bin/apply-cycle-check

# Панель обязана быть доступна со всех локальных сетей владельца и ни с одной
# внешней. Проверяется снаружи: клиент поднимается в каждой сети стенда.
# Clash API слушает все адреса, и с внешней сети его закрывает только зона wan
# fw4 — так проверяются сами правила, а не только адрес, который слушает панель.
reach-check:
	@set -eu; \
	docker inspect metabox-target-1 >/dev/null 2>&1 || { echo "стенд не поднят: сначала make up" >&2; exit 1; }; \
	fail=0; \
	for net in lan guest wan; do \
		case "$$net" in lan) expect=ответ ;; guest) expect=ответ ;; wan) expect=отказ ;; esac; \
		addr=$$(docker inspect metabox-target-1 \
			--format "{{ (index .NetworkSettings.Networks (printf \"metabox_%s\" \"$$net\")).IPAddress }}"); \
		for target in 8080/healthz 9090/version; do \
			if docker run --rm --network "metabox_$$net" alpine:3 \
				wget -q -T 3 -O /dev/null "http://$$addr:$$target" >/dev/null 2>&1; \
			then got=ответ; else got=отказ; fi; \
			printf "%-6s %-16s %-13s ожидалось %s, получено %s\n" "$$net" "$$addr" "$${target%%/*}" "$$expect" "$$got"; \
			[ "$$got" = "$$expect" ] || fail=1; \
		done; \
	done; \
	if [ "$$fail" = 1 ]; then echo "ПРОВАЛ: доступность сетей не та, что требуется" >&2; exit 1; fi; \
	echo; echo "Панель доступна с локальных сетей и недоступна с внешней." 

# Обвязка перехвата: клиенты проводной сети с маршрутом через стенд, счётчики
# nft, fail-closed при падении sing-box, Apply без рестарта dnsmasq и fw4,
# stop без следов. Нужны privileged-стенд и ядро с tproxy.
dataplane-check:
	sh .devcontainer/dataplane-check.sh

clean:
	rm -rf dist apps/web/dist
	find $(EMBED_DIR) -mindepth 1 ! -name .gitkeep -delete
