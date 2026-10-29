#!/bin/sh
# Installs metabox on a clean OpenWrt router: the project key, the apk feed, the
# sing-box-extended package and the metaboxd package. Decision: docs/adr/ADR-0058.
#
#   wget -qO- https://mderkach.github.io/metabox/install.sh | sh
#   wget -qO- https://mderkach.github.io/metabox/install.sh | sh -s -- --channel stable
#   wget -qO- https://mderkach.github.io/metabox/install.sh | sh -s -- --lang ru

set -eu

ARCH=aarch64_cortex-a53
SITE=https://mderkach.github.io/metabox
KEY_URL=https://raw.githubusercontent.com/mderkach/metabox/main/keys/metabox-release.pem
KEY_FILE=/etc/apk/keys/metabox-release.pem
FEED_FILE=/etc/apk/repositories.d/metabox.list

# The pin is sing-box-extended.sha256, which the test bench reads too; `make singbox-pin-check`
# fails when these two lines drift from it. The fork release has no checksum file: the hash
# is the asset digest from the GitHub API.
SINGBOX_VERSION=1.14.1-extended-2.7.2
SINGBOX_SHA256=be11f74666b11167e5071547a705f7e730731dfaac39650c51b49f4d68aa8870
SINGBOX_URL="https://github.com/shtorm-7/sing-box-extended/releases/download/v${SINGBOX_VERSION}/sing-box-extended_${SINGBOX_VERSION}_openwrt_${ARCH}.apk"

channel=testing
lang=

usage() {
	cat <<EOF
Usage: install.sh [--channel testing|stable] [--lang en|ru]

Puts the metabox key and apk feed on the router, installs sing-box-extended
${SINGBOX_VERSION} if it is missing, then runs apk add metaboxd.
The services are not started.

  --channel  testing (default): every release; stable: releases without a pre-release suffix
  --lang     language of the texts the daemon shows the operator, written to UCI
             metabox.main.lang; asked when not given, en without a terminal
EOF
}

# msg prints the format $1, or its Russian version $2 when the chosen language is ru,
# with the rest as arguments. The script runs before the package, so it carries its own texts.
msg() {
	format=$1
	[ "$lang" != ru ] || format=$2
	shift 2
	printf "$format" "$@"
}
say() {
	printf '==> '
	msg "$@"
	printf '\n'
}
die() {
	{
		printf 'install.sh: '
		msg "$@"
		printf '\n'
	} >&2
	exit 1
}

while [ $# -gt 0 ]; do
	case "$1" in
	--channel)
		[ $# -ge 2 ] || die "%s needs a value" "%s требует значения" --channel
		channel=$2
		shift 2
		;;
	--channel=*)
		channel=${1#--channel=}
		shift
		;;
	--lang)
		[ $# -ge 2 ] || die "%s needs a value" "%s требует значения" --lang
		lang=$2
		shift 2
		;;
	--lang=*)
		lang=${1#--lang=}
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*) die "unknown option: %s" "неизвестный параметр: %s" "$1" ;;
	esac
done

# A second run keeps the language chosen before. The script arrives on stdin through
# wget | sh, so the answer is read from the terminal; the probe runs in a subshell because
# a failed redirection of a builtin would end the script itself.
current=$(uci -q get metabox.main.lang 2>/dev/null || true)
case "$current" in
en | ru) ;;
*) current=en ;;
esac
if [ -z "$lang" ] && (: </dev/tty) 2>/dev/null; then
	printf 'Language / Язык [en/ru] (%s): ' "$current" >/dev/tty
	read -r lang </dev/tty || lang=
fi
lang=${lang:-$current}

case "$lang" in
en | ru) ;;
*)
	bad=$lang
	lang=en
	die "unknown language: %s, expected en or ru" "неизвестный язык: %s, нужен en или ru" "$bad"
	;;
esac

case "$channel" in
testing | stable) ;;
*) die "unknown channel: %s" "неизвестный канал: %s" "$channel" ;;
esac

[ "$(id -u)" = 0 ] || die "run as root" "запустите от root"
[ -f /etc/openwrt_release ] || die "not OpenWrt: /etc/openwrt_release is missing" "это не OpenWrt: нет /etc/openwrt_release"
command -v apk >/dev/null 2>&1 || die "apk is missing: OpenWrt 25.12 or a snapshot is needed" "нет apk: нужен OpenWrt 25.12 или снапшот"
arch=$(cat /etc/apk/arch 2>/dev/null || true)
[ "$arch" = "$ARCH" ] || die "arch %s, packages are built for %s only" "архитектура %s, пакеты собираются только под %s" "${arch:-unknown}" "$ARCH"

# The fork package ships its own sing-box service; metabox runs sing-box through
# metabox-singbox, and two instances would fight over the ports and the routing rules.
fork_service_on() {
	[ -x /etc/init.d/sing-box ] || return 1
	/etc/init.d/sing-box enabled >/dev/null 2>&1 || /etc/init.d/sing-box running >/dev/null 2>&1
}
fork_service_off() {
	/etc/init.d/sing-box stop >/dev/null 2>&1 || true
	/etc/init.d/sing-box disable
}
fork_service_left=

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

say "project key %s" "ключ проекта %s" "$KEY_FILE"
wget -q -O "$tmp/key.pem" "$KEY_URL" || die "cannot download %s" "не удалось скачать %s" "$KEY_URL"
if [ -f "$KEY_FILE" ]; then
	cmp -s "$tmp/key.pem" "$KEY_FILE" || die "%s exists with other content; remove it if the change is intended" "%s уже есть с другим содержимым; удалите его, если замена задумана" "$KEY_FILE"
else
	cp "$tmp/key.pem" "$KEY_FILE"
fi

say "feed %s in %s" "фид %s в %s" "$channel" "$FEED_FILE"
echo "$SITE/apk/$channel/packages.adb" >"$FEED_FILE"
apk update

if apk info -e sing-box-extended >/dev/null 2>&1; then
	say "sing-box-extended is installed, left as is" "sing-box-extended уже установлен, не трогаем"
	if fork_service_on; then
		say "the sing-box service of sing-box-extended is enabled or running; metabox runs sing-box through metabox-singbox" "служба sing-box из sing-box-extended включена или запущена; metabox запускает sing-box через metabox-singbox"
		answer=n
		if (: </dev/tty) 2>/dev/null; then
			msg 'Stop and disable the sing-box service? [y/N]: ' 'Остановить и выключить службу sing-box? [y/N]: ' >/dev/tty
			read -r answer </dev/tty || answer=n
		fi
		case "$answer" in
		y | Y | yes | YES) fork_service_off ;;
		*) fork_service_left=1 ;;
		esac
	fi
else
	# The fork provides sing-box and would replace the official package under a running setup.
	! apk info -e sing-box >/dev/null 2>&1 || die "the official sing-box package is installed; metabox needs sing-box-extended instead" "установлен официальный пакет sing-box; вместо него для metabox нужен sing-box-extended"

	say "sing-box-extended %s" "sing-box-extended %s" "$SINGBOX_VERSION"
	wget -q -O "$tmp/sing-box.apk" "$SINGBOX_URL" || die "cannot download %s" "не удалось скачать %s" "$SINGBOX_URL"
	sum=$(sha256sum "$tmp/sing-box.apk" | cut -d ' ' -f 1)
	[ "$sum" = "$SINGBOX_SHA256" ] || die "sha256 of the sing-box-extended package is %s, expected %s" "sha256 пакета sing-box-extended %s, ожидался %s" "$sum" "$SINGBOX_SHA256"
	# The sing-box-extended package is not signed by the project key: the pinned hash is the check.
	apk add --allow-untrusted "$tmp/sing-box.apk"

	fork_service_off
fi

say "metaboxd" "metaboxd"
apk add metaboxd

say "language %s in metabox.main.lang" "язык %s в metabox.main.lang" "$lang"
uci set metabox.main.lang="$lang"
uci commit metabox

if [ -n "$fork_service_left" ]; then
	msg '
metaboxd is installed; the services are not started.
The sing-box service of sing-box-extended is still enabled or running. Stop it first,
otherwise metabox-singbox cannot start:

  /etc/init.d/sing-box stop && /etc/init.d/sing-box disable

Then put a sing-box config at /etc/sing-box/config.json and start the services:
' '
metaboxd установлен; службы не запущены.
Служба sing-box из sing-box-extended всё ещё включена или запущена. Сначала остановите её,
иначе metabox-singbox не запустится:

  /etc/init.d/sing-box stop && /etc/init.d/sing-box disable

Затем положите конфиг sing-box в /etc/sing-box/config.json и запустите службы:
'
else
	msg '
metaboxd is installed; the services are not started.
Put a sing-box config at /etc/sing-box/config.json, then:
' '
metaboxd установлен; службы не запущены.
Положите конфиг sing-box в /etc/sing-box/config.json, затем:
'
fi
msg '
  /etc/init.d/metabox-singbox enable && /etc/init.d/metabox-singbox start
  /etc/init.d/metaboxd enable && /etc/init.d/metaboxd start

Updates: apk update && apk upgrade metaboxd
Language: uci set metabox.main.lang=ru && uci commit metabox && /etc/init.d/metaboxd restart
' '
  /etc/init.d/metabox-singbox enable && /etc/init.d/metabox-singbox start
  /etc/init.d/metaboxd enable && /etc/init.d/metaboxd start

Обновления: apk update && apk upgrade metaboxd
Язык: uci set metabox.main.lang=en && uci commit metabox && /etc/init.d/metaboxd restart
'
