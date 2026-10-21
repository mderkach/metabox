#!/bin/sh
# Installs metabox on a clean OpenWrt router: the project key, the apk feed, the
# sing-box-extended fork package and the metaboxd package. Decision: docs/adr/ADR-0058.
#
#   wget -qO- https://mderkach.github.io/metabox/install.sh | sh
#   wget -qO- https://mderkach.github.io/metabox/install.sh | sh -s -- --channel stable

set -eu

ARCH=aarch64_cortex-a53
SITE=https://mderkach.github.io/metabox
KEY_URL=https://raw.githubusercontent.com/mderkach/metabox/main/keys/metabox-release.pem
KEY_FILE=/etc/apk/keys/metabox-release.pem
FEED_FILE=/etc/apk/repositories.d/metabox.list

# Same version as SINGBOX_VERSION in .devcontainer/target/Dockerfile. The fork release has
# no checksum file: the hash is the asset digest from the GitHub API.
SINGBOX_VERSION=1.14.1-extended-2.7.2
SINGBOX_SHA256=be11f74666b11167e5071547a705f7e730731dfaac39650c51b49f4d68aa8870
SINGBOX_URL="https://github.com/shtorm-7/sing-box-extended/releases/download/v${SINGBOX_VERSION}/sing-box-extended_${SINGBOX_VERSION}_openwrt_${ARCH}.apk"

channel=testing

usage() {
	cat <<EOF
Usage: install.sh [--channel testing|stable]

Puts the metabox key and apk feed on the router, installs sing-box-extended
${SINGBOX_VERSION} if it is missing, then runs apk add metaboxd.
The services are not started.

  --channel  testing (default): every release; stable: releases without a pre-release suffix
EOF
}

say() { printf '==> %s\n' "$*"; }
die() {
	printf 'install.sh: %s\n' "$*" >&2
	exit 1
}

while [ $# -gt 0 ]; do
	case "$1" in
	--channel)
		[ $# -ge 2 ] || die "--channel needs a value"
		channel=$2
		shift 2
		;;
	--channel=*)
		channel=${1#--channel=}
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*) die "unknown option: $1" ;;
	esac
done

case "$channel" in
testing | stable) ;;
*) die "unknown channel: $channel" ;;
esac

[ "$(id -u)" = 0 ] || die "run as root"
[ -f /etc/openwrt_release ] || die "not OpenWrt: /etc/openwrt_release is missing"
command -v apk >/dev/null 2>&1 || die "apk is missing: OpenWrt 25.12 or a snapshot is needed"
arch=$(cat /etc/apk/arch 2>/dev/null || true)
[ "$arch" = "$ARCH" ] || die "arch ${arch:-unknown}, packages are built for $ARCH only"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

say "project key $KEY_FILE"
wget -q -O "$tmp/key.pem" "$KEY_URL" || die "cannot download $KEY_URL"
if [ -f "$KEY_FILE" ]; then
	cmp -s "$tmp/key.pem" "$KEY_FILE" || die "$KEY_FILE exists with other content; remove it if the change is intended"
else
	cp "$tmp/key.pem" "$KEY_FILE"
fi

say "feed $channel in $FEED_FILE"
echo "$SITE/apk/$channel/packages.adb" >"$FEED_FILE"
apk update

if apk info -e sing-box-extended >/dev/null 2>&1; then
	say "sing-box-extended is installed, left as is"
else
	# The fork provides sing-box and would replace the official package under a running setup.
	! apk info -e sing-box >/dev/null 2>&1 || die "the official sing-box package is installed; metabox needs sing-box-extended instead"

	say "sing-box-extended $SINGBOX_VERSION"
	wget -q -O "$tmp/sing-box.apk" "$SINGBOX_URL" || die "cannot download $SINGBOX_URL"
	sum=$(sha256sum "$tmp/sing-box.apk" | cut -d ' ' -f 1)
	[ "$sum" = "$SINGBOX_SHA256" ] || die "sha256 of the fork package is $sum, expected $SINGBOX_SHA256"
	# The fork package is signed by the fork, not by the project key: the pinned hash is the check.
	apk add --allow-untrusted "$tmp/sing-box.apk"

	# sing-box is run by metabox-singbox, so the fork's own service stays off.
	/etc/init.d/sing-box stop >/dev/null 2>&1 || true
	/etc/init.d/sing-box disable
fi

say "metaboxd"
apk add metaboxd

cat <<EOF

metaboxd is installed; the services are not started.
Put a sing-box config at /etc/sing-box/config.json, then:

  /etc/init.d/metabox-singbox enable && /etc/init.d/metabox-singbox start
  /etc/init.d/metaboxd enable && /etc/init.d/metaboxd start

Updates: apk update && apk upgrade metaboxd
EOF
