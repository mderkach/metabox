# A real procd, not a stub: the Apply cycle must work as on the router.

# The base comes from outside: the owner uses an image from the device firmware (`make
# stand-base`), CI has no firmware and takes the public OpenWrt rootfs of the same
# branch with apk.
ARG BASE_IMAGE=openwrt/rootfs:aarch64_generic-25.12.4
ARG SINGBOX_VERSION=1.14.1-extended-2.7.2
# The built daemon binary: the arch is set from outside because the target environment
# image comes in both aarch64 and x86_64.
ARG DAEMON_BINARY=dist/metaboxd-linux-arm64

FROM ${BASE_IMAGE} AS base

# The package is downloaded for the arch the base itself declares: for an image from the firmware it is
# aarch64_cortex-a53, for the public rootfs aarch64_generic. A separate stage:
# the OpenWrt rootfs has neither curl nor trusted roots for GitHub.
# $BUILDPLATFORM: otherwise BuildKit would look for alpine under the OpenWrt platform.
FROM --platform=$BUILDPLATFORM alpine:3.23 AS fetch
ARG SINGBOX_VERSION
COPY --from=base /etc/apk/arch /tmp/arch
RUN set -eu; \
    apk add --no-cache curl; \
    arch="$(cat /tmp/arch)"; \
    curl -fsSL -o /sing-box.apk \
      "https://github.com/shtorm-7/sing-box-extended/releases/download/v${SINGBOX_VERSION}/sing-box-extended_${SINGBOX_VERSION}_openwrt_${arch}.apk"

# The panel is built as the same package that goes to the router (ADR-0011): the test bench
# checks the delivery, not files laid out in place. The version is numeric:
# apk does not accept a string like `dev` as a version.
FROM --platform=$BUILDPLATFORM alpine:3.23 AS package
ARG PKG_VERSION=0.0.0-r0
ARG DAEMON_BINARY
# The release sets the arch explicitly: there is no public rootfs for the router's
# aarch64_cortex-a53, and apk installs only a package of the device's own arch.
ARG PKG_ARCH
COPY --from=base /etc/apk/arch /tmp/arch
COPY apps/metaboxd/package /src/package
COPY ${DAEMON_BINARY} /src/metaboxd
# The signing key comes as a BuildKit secret, so it stays out of build args and layers.
# Without it the package is unsigned, as in the test bench.
RUN --mount=type=secret,id=apk_sign_key \
    set -eu; \
    mkdir -p /pkgroot/usr/bin /out; \
    cp -R /src/package/. /pkgroot/; \
    install -m 0755 /src/metaboxd /pkgroot/usr/bin/metaboxd; \
    chmod 0755 /pkgroot/etc/init.d/metaboxd /pkgroot/etc/init.d/metabox-singbox; \
    chown -R root:root /pkgroot; \
    sign=; \
    if [ -s /run/secrets/apk_sign_key ]; then sign="--sign-key /run/secrets/apk_sign_key"; fi; \
    apk mkpkg $sign \
      --info name:metaboxd \
      --info "version:${PKG_VERSION}" \
      --info "arch:${PKG_ARCH:-$(cat /tmp/arch)}" \
      --info description:"Панель настройки sing-box" \
      --info license:GPL-3.0-or-later \
      --info depends:sing-box-extended \
      --files /pkgroot \
      --output /out/metaboxd.apk

# The same stage exported outside: the device package and the package in the test bench
# are built by the same code, so they cannot diverge (`make package`).
FROM scratch AS package-out
COPY --from=package /out/metaboxd.apk /

FROM base

COPY --from=fetch /sing-box.apk /tmp/sing-box.apk
COPY --from=package /out/metaboxd.apk /tmp/metaboxd.apk
COPY .devcontainer/target/files/ /

# sing-box and the panel are installed as packages: their own init scripts
# come with them, and services start in the test bench the same way as on the router. sing-box
# is started by the service of the panel package, the service of the fork package does not enter autostart,
# on the router it is also disabled. The packages are not signed. The panel settings are put
# before the install: apk does not overwrite a file in /etc, the package value is put next to it
# as .apk-new; the test bench address relies on this, so after the install it
# is checked.
#
# Services that have nothing to run on in the container are removed from autostart.
# `init.d disable` does not work at build time because procd and ubus are not up yet,
# so the symlinks are removed. dnsmasq, on the contrary, is put into autostart explicitly:
# the dataplane sends client DNS to it, and this must not
# depend on whether the base enabled it.
#
# /var in the rootfs is a symlink to an empty /tmp: without /var/lock and /var/run ubusd
# will not create the socket, and procd comes up without starting a single service.
RUN set -eu; \
    apk add --allow-untrusted /tmp/sing-box.apk /tmp/metaboxd.apk; \
    rm -f /tmp/sing-box.apk /tmp/metaboxd.apk; \
    grep -q "option listen_port '8080'" /etc/config/metabox; \
    rm -f /etc/rc.d/S*odhcpd /etc/rc.d/S*uhttpd; \
    ln -sf ../init.d/dnsmasq /etc/rc.d/S19dnsmasq; \
    rm -f /etc/rc.d/S99sing-box; \
    ln -sf ../init.d/metabox-singbox /etc/rc.d/S97metabox-singbox; \
    ln -sf ../init.d/metaboxd /etc/rc.d/S98metaboxd; \
    mkdir -p /var/lock /var/run; \
    chmod +x /usr/bin/apply-cycle-check /usr/bin/dataplane-check /usr/bin/stand-init; \
    /usr/bin/sing-box version

EXPOSE 8080 9090

# Not /sbin/init: the preinit chain shuts down network devices, and the container loses
# the address from Docker. procd starts stand-init, laying out the networks first.
CMD ["/usr/bin/stand-init"]
