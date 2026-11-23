#!/bin/sh
set -eu

bench=$(CDPATH='' cd "$(dirname "$0")" && pwd)
root=$(cd "$bench/../../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
python3 "$bench/fixtures.py" "$work/cases"
node "$bench/checkSchema.mjs" "$work"/cases/*/config.json
python3 "$bench/check_deltas.py" "$work/cases"

image=python@sha256:5aa3872d12a059e22fda84b7556a8d103dc9dff314d044d2d47d5785378c5856
case "$(docker run --rm --network none --cpus 1 "$image" uname -m)" in
    aarch64) arch=aarch64_generic ;;
    x86_64) arch=x86_64 ;;
    *) echo 'No pinned OpenWrt package for the Docker architecture' >&2; exit 1 ;;
esac
name=$(awk -v suffix="_openwrt_${arch}.apk" 'index($2, suffix) {print $2}' "$root/sing-box-extended.sha256")
test -n "$name"
version=${name#sing-box-extended_}
version=${version%_openwrt_*}
if [ -n "${SING_BOX_APK:-}" ]; then
    cp "$SING_BOX_APK" "$work/$name"
else
    curl -fLsS --retry 2 -o "$work/$name" "https://github.com/shtorm-7/sing-box-extended/releases/download/v$version/$name"
fi
awk -v name="$name" '$2 == name' "$root/sing-box-extended.sha256" > "$work/pin"
docker run --rm --network none --cpus 1 -e GOMAXPROCS=1 \
    -v "$bench:/bench:ro" -v "$work:/inputs:ro" "$image" sh -ec '
        cd /inputs
        sha256sum -c pin
        mkdir /tmp/pkg
        apk extract --allow-untrusted --destination /tmp/pkg "./$1" >/dev/null
        export SING_BOX=/tmp/pkg/usr/bin/sing-box
        "$SING_BOX" version
        cp -R /inputs/cases /tmp/cases
        exec python /bench/probe.py /tmp/cases
    ' sh "$name"
