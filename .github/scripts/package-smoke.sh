#!/usr/bin/env bash
# Installs the router package into an OpenWrt rootfs and runs the command its init script
# hands procd. There is no procd in the container: ubus is a stub that records that command.
#
# Usage: package-smoke.sh <package.apk> [public-key.pem]
# Without a key the package signature is not checked.
set -euo pipefail

package=${1:?usage: package-smoke.sh <package.apk> [public-key.pem]}
key=${2:-}
# There is no public rootfs for the router's aarch64_cortex-a53: the aarch64_generic one of
# the same branch runs the same binary, and apk is told to accept the router's arch too.
image=${SMOKE_IMAGE:-openwrt/rootfs:aarch64_generic-25.12.4}
platform=${SMOKE_PLATFORM:-linux/aarch64_generic}
arch=${PKG_ARCH:-aarch64_cortex-a53}
version=$(cat VERSION)

fail() {
  echo "::error::$*" >&2
  exit 1
}

[ -s "$package" ] || fail "package $package is missing or empty"
[ -z "$key" ] || [ -s "$key" ] || fail "public key $key is missing or empty"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp "$package" "$tmp/metaboxd.apk"
[ -z "$key" ] || cp "$key" "$tmp/"

# The fork package the router installs, verified against the pin shared with install.sh.
name=$(sed -n "s/^[0-9a-f]*  \(.*_openwrt_${arch}\.apk\)\$/\1/p" sing-box-extended.sha256)
[ -n "$name" ] || fail "sing-box-extended.sha256 has no package for arch $arch"
fork=${name#sing-box-extended_}
fork=${fork%_openwrt_*}
curl -fsSL -o "$tmp/$name" \
  "https://github.com/shtorm-7/sing-box-extended/releases/download/v$fork/$name"
grep "  $name\$" sing-box-extended.sha256 > "$tmp/pin"
(cd "$tmp" && sha256sum -c pin)
mv "$tmp/$name" "$tmp/sing-box.apk"

docker run --rm --platform "$platform" -v "$tmp:/smoke:ro" \
  -e ARCH="$arch" -e VERSION="$version" -e KEY="${key:+/smoke/$(basename "$key")}" \
  "$image" sh -euc '
    echo "$ARCH" >> /etc/apk/arch
    # The fork package is not signed with the panel key; its hash was checked above.
    apk add --allow-untrusted /smoke/sing-box.apk
    if [ -n "$KEY" ]; then
      cp "$KEY" /etc/apk/keys/
      apk add /smoke/metaboxd.apk
    else
      echo "no public key: the package signature is not checked"
      apk add --allow-untrusted /smoke/metaboxd.apk
    fi

    # The amd64 runner would start an amd64 binary natively inside this container, so a
    # started daemon does not prove the arch; the ELF machine field does.
    machine=$(hexdump -s 18 -n 2 -e "2/1 \"%02x\"" /usr/bin/metaboxd)
    [ "$machine" = b700 ] || { echo "/usr/bin/metaboxd is not an aarch64 ELF (machine $machine)" >&2; exit 1; }

    cat > /bin/ubus <<"STUB"
#!/bin/sh
case "$1 $2 $3" in
"call service set") printf "%s" "$4" > /tmp/procd-set.json ;;
"call service list") echo "{}" ;;
*) exit 4 ;;
esac
STUB
    chmod 0755 /bin/ubus

    # /var in the rootfs is a symlink to an empty /tmp; procd.sh takes its lock there.
    mkdir -p /var/lock /var/run
    uci set metabox.main.listen_addr=127.0.0.1
    uci commit metabox
    /etc/init.d/metaboxd start
    [ -s /tmp/procd-set.json ] || { echo "the init script registered no instance" >&2; exit 1; }
    jsonfilter -i /tmp/procd-set.json -e "@.instances.metaboxd.command[*]" > /tmp/command
    [ "$(head -1 /tmp/command)" = /usr/bin/metaboxd ] || {
      echo "unexpected command:" >&2; cat /tmp/command >&2; exit 1
    }

    set --
    while IFS= read -r arg; do set -- "$@" "$arg"; done < /tmp/command
    "$@" > /tmp/daemon.log 2>&1 &
    daemon=$!

    health=
    for _ in $(seq 1 60); do
      health=$(wget -qO- http://127.0.0.1:8088/healthz 2>/dev/null) && break
      kill -0 "$daemon" 2>/dev/null || break
      sleep 1
    done
    kill "$daemon" 2>/dev/null || true
    reported=$(echo "$health" | jsonfilter -e "@.version" 2>/dev/null || true)
    if [ "$reported" != "$VERSION" ]; then
      echo "daemon did not report version $VERSION on /healthz (got: ${health:-nothing})" >&2
      cat /tmp/daemon.log >&2
      exit 1
    fi
    echo "metaboxd $reported started on $(uname -m) from the init script command"

    arg_after() {
      jsonfilter -i /tmp/procd-set.json -e "@.instances.metaboxd.command[*]" | awk -v flag="$1" "found { print; exit } \$0 == flag { found = 1 }"
    }

    uci set metabox.main.https=1
    uci set metabox.main.https_cert=/etc/metabox/owner.crt
    uci set metabox.main.https_key=/etc/metabox/owner.key
    uci commit metabox
    rm -f /tmp/procd-set.json
    /etc/init.d/metaboxd start
    jsonfilter -i /tmp/procd-set.json -e "@.instances.metaboxd.command[*]" | grep -qx -- "-https=1" &&
      [ "$(arg_after -https-cert)" = /etc/metabox/owner.crt ] &&
      [ "$(arg_after -https-key)" = /etc/metabox/owner.key ] || {
      echo "the UCI https settings did not reach the daemon flags:" >&2
      jsonfilter -i /tmp/procd-set.json -e "@.instances.metaboxd.command[*]" >&2
      exit 1
    }
    echo "the init script hands https, https_cert and https_key from UCI to the daemon flags"
  '
