BIN        := dist/metaboxd
DEVICE_BIN := dist/metaboxd-linux-arm64
# Version in semver, a single source for the binary and the package.
VERSION    ?= $(shell cat VERSION)
# Fork version of the panel schemas: the daemon reports it to MCP agents next to the binary version.
SCHEMA_VERSION := $(shell sed -n 's/^export const SCHEMA_FORK_VERSION = "\(.*\)"$$/\1/p' apps/web/src/shared/api/generated.ts)
LDFLAGS    := -s -w -X metabox/internal/version.Version=$(VERSION) -X metabox/internal/version.Schema=$(SCHEMA_VERSION)

# Pins the version down: the `go` directive in go.mod raises it but does not lower it.
export GOTOOLCHAIN := go$(shell cat .go-version)

.PHONY: all schema schema-daemon rule-set-snapshot web embed daemon daemon-device daemon-target ldflags dev dev-mock dev-mock-missing test test-schemagen singbox-pin-check lint hooks clean up up-dev down sh target-sh apply-check reach-check dataplane-check package stand-base stand-reset

all: daemon

# Without with_wireguard the schema loses the warp type; go:linkname in the fork requires
# -checklinkname=0. with_purego is added on top of the fork's set: otherwise
# with_naive_outbound pulls in cronet, whose libcronet.a GNU ld on CI rejects
# ("skipping incompatible"). The schema with purego comes out byte for byte the same.
# `go list -m` prints an empty Dir until the module is in the cache, so it is downloaded first;
# an empty Dir would silently drop the fork tags.
SINGBOX_DIR = $(or $(shell cd tools/schemagen && go mod download github.com/sagernet/sing-box && go list -m -f '{{.Dir}}' github.com/sagernet/sing-box),$(error sing-box fork module not found))
SCHEMA_TAGS = $(shell cat '$(SINGBOX_DIR)/release/DEFAULT_BUILD_TAGS'),with_purego
SCHEMA_LDFLAGS = $(shell cat '$(SINGBOX_DIR)/release/LDFLAGS')

schema:
	mkdir -p apps/web/src/shared/api
	cd tools/schemagen && go run \
		-tags "$(SCHEMA_TAGS)" -ldflags "$(SCHEMA_LDFLAGS)" . \
		-out ../../apps/web/src/shared/api/generated.ts \
		-fields ../../apps/metaboxd/internal/mcp/fields.generated.go

schema-daemon:
	mkdir -p apps/web/src/shared/api
	cd apps/metaboxd && go run ./cmd/contractgen \
		-root . \
		-out ../../apps/web/src/shared/api/daemon.generated.ts

# Snapshot of the rule set catalog embedded in the binary: with it the daemon starts before it has
# checked with the providers itself. It calls the GitHub API, so it is not part of the build.
rule-set-snapshot:
	cd apps/metaboxd && go run ./cmd/rulesetsnap -out internal/ruleset/snapshot.json

web:
	pnpm --filter web build

# go:embed does not see directories above its package, so the SPA is moved here.
EMBED_DIR := apps/metaboxd/internal/webui/static

# Depends on web: in a parallel build embed would copy a half-written directory.
embed: web
	find $(EMBED_DIR) -mindepth 1 ! -name .gitkeep -delete
	cp -R apps/web/dist/. $(EMBED_DIR)/

daemon: embed
	cd apps/metaboxd && go build -ldflags "$(LDFLAGS)" -o ../../$(BIN) .

# Without CGO_ENABLED=0 the binary links to the libc of the build machine and will not
# start on the router.
daemon-device: embed
	cd apps/metaboxd && GOOS=linux GOARCH=arm64 CGO_ENABLED=0 \
		go build -ldflags "$(LDFLAGS)" -o ../../$(DEVICE_BIN) .

# CI builds the daemon for its own arch without the panel, and takes the version stamps from here.
ldflags:
	@echo '$(LDFLAGS)'

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

# install.sh carries the fork version and the router package hash as literals, because it runs
# from a bare router; they must equal the pin the test bench reads.
singbox-pin-check:
	@set -eu; \
	line=$$(grep '_openwrt_aarch64_cortex-a53\.apk$$' sing-box-extended.sha256); \
	sum=$${line%% *}; \
	version=$${line#*sing-box-extended_}; version=$${version%%_openwrt_*}; \
	grep -qx "SINGBOX_VERSION=$$version" install.sh || { echo "install.sh SINGBOX_VERSION differs from sing-box-extended.sha256 ($$version)" >&2; exit 1; }; \
	grep -qx "SINGBOX_SHA256=$$sum" install.sh || { echo "install.sh SINGBOX_SHA256 differs from sing-box-extended.sha256 ($$sum)" >&2; exit 1; }

GOLANGCI = go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0

lint:
	cd apps/metaboxd && $(GOLANGCI) run ./...
	cd tools/schemagen && $(GOLANGCI) run --build-tags "$(SCHEMA_TAGS)" ./...

hooks:
	pnpm exec lefthook install

# Test bench settings are not committed and live in one file: docker compose reads it
# itself, make does through this directive. Otherwise `make package` would build the package for the arch
# of the default image, and the test bench next to it would start on the firmware image.
-include .devcontainer/.env

OPENWRT_PLATFORM ?= linux/aarch64_generic
METABOX_BASE_IMAGE ?= openwrt/rootfs:aarch64_generic-25.12.4
DAEMON_BINARY ?= $(DEVICE_BIN)
# The package version is derived from semver by apk rules: a pre-release is written
# as a suffix with an underscore and no dot, otherwise apk rejects the string or
# ranks the pre-release above the release. 0.1.0-rc.2 becomes 0.1.0_rc2, 0.1.0 is
# 0.1.0. apk cannot express other pre-releases and build metadata, and a version
# of that kind does not build into a package.
APK_VERSION := $(shell echo '$(VERSION)' | sed -nE \
	-e 's/^([0-9]+\.[0-9]+\.[0-9]+)$$/\1/p' \
	-e 's/^([0-9]+\.[0-9]+\.[0-9]+)-(alpha|beta|rc)\.([0-9]+)$$/\1_\2\3/p')
PKG_VERSION ?= $(APK_VERSION)-r0
# Empty: the arch of the base image and an unsigned package. The release sets both.
# A signed build passes --no-cache-filter package: the build cache does not see the secret
# and would return an unsigned package cached from an earlier build.
PKG_ARCH ?=
APK_SIGN_KEY ?=
comma := ,

# Values go to docker compose: it takes them from the environment, not from the Makefile.
export METABOX_BASE_IMAGE OPENWRT_PLATFORM DAEMON_BINARY PKG_VERSION

DC := docker compose -f .devcontainer/docker-compose.yml

# GOTOOLCHAIN goes into the container explicitly: the golang image keeps it at `local`, and
# the version from .go-version is not picked up there: the build fails as soon as
# go.mod requires a newer patch than the one frozen into the image.
daemon-target:
	$(DC) up -d dev
	$(DC) exec -T -e GOTOOLCHAIN=$(GOTOOLCHAIN) dev sh -c 'cd apps/metaboxd && go build -ldflags "$(LDFLAGS)" -o ../../$(BIN) .'

# Panel package for the device. Built by the same stage that installs the panel into the
# test bench, and for the same arch that the test bench base declares: the delivery and
# the check cannot diverge. No OpenWrt SDK needed: apk-tools comes from alpine (ADR-0011).
package: daemon-device
	$(if $(APK_VERSION),,$(error version $(VERSION) is not expressible as an apk version: need X.Y.Z or X.Y.Z-(alpha|beta|rc).N))
	docker build --platform $(OPENWRT_PLATFORM) \
		--build-arg BASE_IMAGE=$(METABOX_BASE_IMAGE) \
		--build-arg PKG_VERSION=$(PKG_VERSION) \
		--build-arg DAEMON_BINARY=$(DAEMON_BINARY) \
		--build-arg PKG_ARCH=$(PKG_ARCH) \
		$(if $(APK_SIGN_KEY),--secret id=apk_sign_key$(comma)src=$(APK_SIGN_KEY) --no-cache-filter package,) \
		--target package-out --output type=local,dest=dist \
		-f .devcontainer/target/Dockerfile .

# Target environment image from the device image on downloads.openwrt.org: the OpenWrt
# branch, arch and apk are the same as on the router. The target is manual: the device image
# changes less often than the test bench, and CI builds on the public rootfs of its arch.
DEVICE_IMAGE ?= metabox/openwrt-device:latest

stand-base:
	docker build --platform $(OPENWRT_PLATFORM) \
		$(if $(DEVICE_IMAGE_URL),--build-arg DEVICE_IMAGE_URL=$(DEVICE_IMAGE_URL),) \
		-t $(DEVICE_IMAGE) .devcontainer/target/device-base

# The test bench installs the panel as a package, so it needs a binary for the device.
# --build is required: otherwise a sing-box version bump or a daemon change
# does not reach the test bench.
up: daemon-device
	$(DC) up -d --build

# Same plus a dev server with HMR: the panel opens on 5173 and talks to the same daemon.
up-dev: daemon-device
	$(DC) --profile dev up -d --build

down:
	$(DC) --profile dev down

# The config lives in a named volume and survives down/up; reset restores
# the reference from the image.
stand-reset: down
	docker volume rm -f metabox_singbox-etc
	$(MAKE) up

sh:
	$(DC) exec dev bash

target-sh:
	$(DC) exec target sh

apply-check:
	$(DC) exec -T target sh /usr/bin/apply-cycle-check

# The panel must be reachable from all local networks of the owner and from none of the
# external ones. Checked from outside: a client starts in each test bench network.
# Clash API listens on all addresses, and from the external network only the wan zone of
# fw4 closes it: this checks the rules themselves, not just the address the panel listens on.
reach-check:
	@set -eu; \
	docker inspect metabox-target-1 >/dev/null 2>&1 || { echo "test bench is not up: run make up first" >&2; exit 1; }; \
	fail=0; \
	for net in lan guest wan; do \
		case "$$net" in lan) expect=reply ;; guest) expect=reply ;; wan) expect=refused ;; esac; \
		addr=$$(docker inspect metabox-target-1 \
			--format "{{ (index .NetworkSettings.Networks (printf \"metabox_%s\" \"$$net\")).IPAddress }}"); \
		for target in 8080/healthz 9090/version; do \
			if docker run --rm --network "metabox_$$net" alpine:3 \
				wget -q -T 3 -O /dev/null "http://$$addr:$$target" >/dev/null 2>&1; \
			then got=reply; else got=refused; fi; \
			printf "%-6s %-16s %-13s expected %s, got %s\n" "$$net" "$$addr" "$${target%%/*}" "$$expect" "$$got"; \
			[ "$$got" = "$$expect" ] || fail=1; \
		done; \
	done; \
	if [ "$$fail" = 1 ]; then echo "FAILED: network reachability is not as required" >&2; exit 1; fi; \
	echo; echo "The panel is reachable from local networks and unreachable from the external one." 

# Interception dataplane: wired-network clients routed through the test bench, nft
# counters, fail-closed when sing-box dies, Apply without restarting dnsmasq and fw4,
# stop leaves no traces. Needs a privileged test bench and a kernel with tproxy.
dataplane-check:
	sh .devcontainer/dataplane-check.sh

clean:
	rm -rf dist apps/web/dist
	find $(EMBED_DIR) -mindepth 1 ! -name .gitkeep -delete
