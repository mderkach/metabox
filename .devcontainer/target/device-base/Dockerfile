# База стенда из образа целевого устройства: та же ветка OpenWrt, та же арка и
# тот же apk, что на роутере. Образ качается с downloads.openwrt.org — ничего,
# кроме сети, для сборки не нужно.
#
# Берётся sysupgrade-образ, потому что rootfs отдельным архивом OpenWrt для
# filogic не публикует. Ядро и dtb из него не используются: контейнер работает
# на ядре хоста, поэтому подходит образ любой платы того же таргета.

ARG DEVICE_IMAGE_URL=https://downloads.openwrt.org/releases/25.12.4/targets/mediatek/filogic/openwrt-25.12.4-mediatek-filogic-bananapi_bpi-r4-squashfs-sysupgrade.itb

FROM --platform=$BUILDPLATFORM debian:trixie-slim AS extract
ARG DEVICE_IMAGE_URL

RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends -qq ca-certificates curl squashfs-tools \
 && rm -rf /var/lib/apt/lists/*

# Корень лежит в образе sysupgrade за деревом FIT, отдельной записи о нём в
# дереве нет: данные ядра и dtb вынесены наружу, и squashfs просто приклеен
# следом. Поэтому начало ищется по магии, а не по смещению из заголовка.
RUN set -eu; \
    curl -fsSL -o /tmp/device.itb "$DEVICE_IMAGE_URL"; \
    offset="$(grep -abo hsqs /tmp/device.itb | head -1 | cut -d: -f1)"; \
    [ -n "$offset" ] || { echo "в образе $DEVICE_IMAGE_URL нет squashfs" >&2; exit 1; }; \
    dd if=/tmp/device.itb of=/tmp/rootfs.squashfs bs=1M iflag=skip_bytes,fullblock skip="$offset" status=none; \
    unsquashfs -q -d /rootfs /tmp/rootfs.squashfs >/dev/null; \
    test -x /rootfs/sbin/procd

FROM scratch
COPY --from=extract /rootfs/ /
