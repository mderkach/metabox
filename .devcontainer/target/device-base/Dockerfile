# Test bench base from the target device image: the same OpenWrt branch, the same arch and
# the same apk as on the router. The image is downloaded from downloads.openwrt.org; nothing
# but the network is needed for the build.
#
# A sysupgrade image is taken because OpenWrt does not publish the rootfs as a separate archive for
# filogic. The kernel and dtb from it are not used: the container runs
# on the host kernel, so an image of any board of the same target fits.

ARG DEVICE_IMAGE_URL=https://downloads.openwrt.org/releases/25.12.4/targets/mediatek/filogic/openwrt-25.12.4-mediatek-filogic-bananapi_bpi-r4-squashfs-sysupgrade.itb

FROM --platform=$BUILDPLATFORM debian:trixie-slim AS extract
ARG DEVICE_IMAGE_URL

RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends -qq ca-certificates curl squashfs-tools \
 && rm -rf /var/lib/apt/lists/*

# The root lies in the sysupgrade image behind the FIT tree, and the tree has no separate entry for it:
# the kernel and dtb data are moved out, and squashfs is simply glued on
# after. So the start is found by magic, not by an offset from the header.
RUN set -eu; \
    curl -fsSL -o /tmp/device.itb "$DEVICE_IMAGE_URL"; \
    offset="$(grep -abo hsqs /tmp/device.itb | head -1 | cut -d: -f1)"; \
    [ -n "$offset" ] || { echo "no squashfs in image $DEVICE_IMAGE_URL" >&2; exit 1; }; \
    dd if=/tmp/device.itb of=/tmp/rootfs.squashfs bs=1M iflag=skip_bytes,fullblock skip="$offset" status=none; \
    unsquashfs -q -d /rootfs /tmp/rootfs.squashfs >/dev/null; \
    test -x /rootfs/sbin/procd

FROM scratch
COPY --from=extract /rootfs/ /
