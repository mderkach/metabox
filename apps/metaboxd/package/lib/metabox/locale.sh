# Operator messages of the metabox init scripts in the language of UCI
# metabox.main.lang. The English text is the key, as in the daemon catalogue
# (docs/adr/ADR-0062); a text without a translation is printed in English.
# internal/locale/catalogue_test.go checks the entries against the scripts.

MB_LANG=${MB_LANG:-$(uci -q get metabox.main.lang 2>/dev/null || echo en)}

# mb_text prints the format $1 in the operator's language.
mb_text() {
	[ "$MB_LANG" = ru ] || {
		printf '%s' "$1"
		return
	}

	case "$1" in
	"%s is missing") printf '%s' "%s отсутствует" ;;
	"config %s not found") printf '%s' "конфига %s нет" ;;
	"network '%s' has no addresses, set listen_addr in /etc/config/metabox") printf '%s' "у сетей '%s' нет адресов, задайте listen_addr в /etc/config/metabox" ;;
	"invalid value '%s' in metabox.dataplane") printf '%s' "недопустимое значение '%s' в metabox.dataplane" ;;
	"metabox.dataplane expects a decimal number, got '%s'") printf '%s' "в metabox.dataplane ожидалось десятичное число, получено '%s'" ;;
	"acl_mode '%s' is neither all nor listed") printf '%s' "acl_mode '%s' не all и не listed" ;;
	"nft fragment failed fw4 check, interception left unchanged") printf '%s' "фрагмент nft не прошёл fw4 check, перехват не изменён" ;;
	"fw4 reload failed") printf '%s' "fw4 reload не прошёл" ;;
	"metabox_ sets were not reloaded") printf '%s' "наборы metabox_ не перезагружены" ;;
	"dnsmasq section not found in /etc/config/dhcp") printf '%s' "секция dnsmasq в /etc/config/dhcp не найдена" ;;
	*) printf '%s' "$1" ;;
	esac
}

# mb_msg prints "$1: <message>" to stderr; $2 is the format, the rest its arguments.
mb_msg() {
	local tag="$1" format="$2"
	shift 2

	printf "%s: $(mb_text "$format")\n" "$tag" "$@" >&2
}
