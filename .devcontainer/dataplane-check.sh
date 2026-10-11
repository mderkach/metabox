#!/bin/sh
# Проверка обвязки перехвата на стенде (`make dataplane-check`). Клиенты
# проводной сети поднимаются здесь, на хосте, отдельными контейнерами с
# маршрутом по умолчанию через стенд — как устройства LAN через роутер. Что
# видно только изнутри роутера, читает /usr/bin/dataplane-check стенда.
#
# Адреса клиентов совпадают со списками ACL в /etc/config/metabox стенда:
# .40 перечислен по IP, .42 — по MAC, .41 не перечислен.
set -eu

TARGET=metabox-target-1
NET=metabox_lan
ROUTER=192.168.210.2
LISTED_IP=192.168.210.40
UNLISTED_IP=192.168.210.41
MAC_IP=192.168.210.42
LISTED_MAC=02:00:00:00:d2:2a
# Внешний адрес вне приватных сетей: их обвязка не перехватывает никогда.
OUTSIDE=1.1.1.1

docker inspect "$TARGET" >/dev/null 2>&1 || {
	echo "стенд не поднят: сначала make up" >&2
	exit 1
}

failed=0

in_target() {
	docker exec "$TARGET" /usr/bin/dataplane-check "$@"
}

counter() {
	in_target counter "$1" "$2"
}

# client <ip> <mac или -> <команда>: клиент проводной сети, весь трафик
# которого идёт через стенд.
client() {
	ip="$1" mac="$2"
	shift 2
	set -- --rm --network "$NET" --ip "$ip" --cap-add NET_ADMIN "$@"
	if [ "$mac" != - ]; then
		set -- --mac-address "$mac" "$@"
	fi
	docker run "$@"
}

client_sh() {
	ip="$1" mac="$2" script="$3"
	client "$ip" "$mac" alpine:3 sh -c "ip route replace default via $ROUTER && $script"
}

# check <что> <условие>: условие — выражение test.
check() {
	what="$1"
	shift
	if [ "$@" ]; then
		echo "  ок      $what"
	else
		echo "  ПРОВАЛ  $what" >&2
		failed=1
	fi
}

# foreign_check <что>: чужие ip rule и таблица с номерами обвязки на месте.
foreign_check() {
	if in_target foreign-present 2>/dev/null; then
		check "$1" 1 = 1
	else
		check "$1" 0 = 1
	fi
}

tcp_to_outside() {
	client_sh "$1" "$2" "nc -w 3 $OUTSIDE 80 </dev/null >/dev/null 2>&1 && echo connected || echo refused"
}

echo "1. Обвязка поставлена стартом службы"
# После пересоздания контейнера служба ещё поднимается: без ожидания первый
# снимок застаёт пустые цепочки и счётчики.
in_target wait || failed=1
in_target state
in_target expect-up || failed=1

echo "2. TCP перечисленного по IP клиента уходит в redirect sing-box"
lanac_ip=$(counter metabox_redirect_lanac 'ip saddr @metabox_src_ip')
redir=$(counter metabox_redirect 'redirect to')
got=$(tcp_to_outside "$LISTED_IP" -)
check "соединение принято ($got)" "$got" = connected
check "счётчик ip saddr вырос" "$(counter metabox_redirect_lanac 'ip saddr @metabox_src_ip')" -gt "$lanac_ip"
check "счётчик redirect вырос" "$(counter metabox_redirect 'redirect to')" -gt "$redir"
if in_target log-has "redirect-in" "$LISTED_IP" 2>/dev/null; then
	check "sing-box записал входящее соединение от $LISTED_IP" 1 = 1
else
	check "sing-box записал входящее соединение от $LISTED_IP" 0 = 1
fi

redir=$(counter metabox_redirect 'redirect to')
client_sh "$LISTED_IP" - "nc -w 2 172.16.0.1 80 </dev/null >/dev/null 2>&1 || true"
check "TCP в приватную сеть не перехвачен" "$(counter metabox_redirect 'redirect to')" = "$redir"

echo "3. TCP перечисленного по MAC клиента уходит в redirect"
lanac_mac=$(counter metabox_redirect_lanac 'ether saddr @metabox_src_mac')
got=$(tcp_to_outside "$MAC_IP" "$LISTED_MAC")
check "соединение принято ($got)" "$got" = connected
check "счётчик ether saddr вырос" "$(counter metabox_redirect_lanac 'ether saddr @metabox_src_mac')" -gt "$lanac_mac"

echo "4. TCP неперечисленного клиента идёт мимо sing-box"
redir=$(counter metabox_redirect 'redirect to')
tcp_to_outside "$UNLISTED_IP" - >/dev/null
check "счётчик redirect не изменился" "$(counter metabox_redirect 'redirect to')" = "$redir"

echo "5. UDP перечисленного клиента уходит в tproxy"
tproxy=$(counter metabox_mangle_prerouting 'tproxy ip to')
client_sh "$LISTED_IP" - "echo metabox | nc -u -w 1 $OUTSIDE 9999 >/dev/null 2>&1 || true"
check "счётчик tproxy вырос" "$(counter metabox_mangle_prerouting 'tproxy ip to')" -gt "$tproxy"
if in_target log-has "tproxy-in" "$LISTED_IP" 2>/dev/null; then
	check "sing-box записал UDP от $LISTED_IP" 1 = 1
else
	check "sing-box записал UDP от $LISTED_IP" 0 = 1
fi

echo "6. udp/53 клиента перехватывается на dnsmasq, ответ приходит через sing-box"
hijack=$(counter dstnat 'udp dport 53')
answer=$(client_sh "$UNLISTED_IP" - "nslookup dataplane-check.metabox.example $OUTSIDE 2>&1 || true")
check "ответ 1.2.3.4 из dns-in sing-box" -n "$(echo "$answer" | grep -F 1.2.3.4)"
check "счётчик перехвата udp/53 вырос" "$(counter dstnat 'udp dport 53')" -gt "$hijack"

echo "7. TCP самого роутера уходит в redirect, исходящее sing-box с меткой 100 — мимо"
out_jump=$(counter metabox_output_redir 'jump metabox_redirect')
out_self=$(counter metabox_output_redir 'meta mark 0x00000064')
redir=$(counter metabox_redirect 'redirect to')
in_target router-tcp
check "nat output отправил TCP роутера в redirect" "$(counter metabox_output_redir 'jump metabox_redirect')" -gt "$out_jump"
check "счётчик redirect вырос" "$(counter metabox_redirect 'redirect to')" -gt "$redir"
check "исходящее sing-box с меткой 100 вернулось из перехвата" "$(counter metabox_output_redir 'meta mark 0x00000064')" -gt "$out_self"

echo "8. UDP самого роутера метится и через lo уходит в tproxy"
mark_out=$(counter metabox_mangle_output 'meta mark set 0x00000065')
lo=$(counter metabox_mangle_lanac 'iifname "lo"')
in_target router-udp
check "mangle output пометил UDP роутера" "$(counter metabox_mangle_output 'meta mark set 0x00000065')" -gt "$mark_out"
check "помеченный пакет вернулся через lo в tproxy" "$(counter metabox_mangle_lanac 'iifname "lo"')" -gt "$lo"

echo "9. Пакет с чужой меткой (след b4) не уходит в tproxy"
foreign=$(counter metabox_mangle_output 'meta mark != 0x00000000')
in_target b4-sim-up
check "пакет с меткой 0x8000 пропущен мимо перехвата" "$(counter metabox_mangle_output 'meta mark != 0x00000000')" -gt "$foreign"
check "метка tproxy пробе не ставилась" "$(in_target b4-sim-counter 0x00000065)" = 0
check "метка 0x8000 дошла до postrouting" "$(in_target b4-sim-counter 0x00008000)" -gt 0
in_target b4-sim-down

echo "10. Apply конфига не трогает fw4 и dnsmasq"
before=$(in_target snapshot)
pid_before=$(in_target singbox-pid)
in_target apply
in_target wait
after=$(in_target snapshot)
pid_after=$(in_target singbox-pid)
echo "  до:    $before"
echo "  после: $after"
check "nft -s list ruleset и pid dnsmasq совпадают" "$before" = "$after"
check "sing-box рестартовал (pid $pid_before -> $pid_after)" "$pid_before" != "$pid_after"

echo "11. Fail-closed: sing-box убит, перехват остаётся"
killed=$(in_target kill)
got=$(tcp_to_outside "$LISTED_IP" -)
check "клиент без доступа наружу, пока sing-box лежит ($got)" "$got" = refused
# Имя, которое раньше не спрашивали: кэш dnsmasq ответил бы и без sing-box.
answer=$(client_sh "$UNLISTED_IP" - "nslookup -timeout=2 failclosed.metabox.example $OUTSIDE 2>&1 || true")
check "DNS клиента без ответа, пока sing-box лежит" -z "$(echo "$answer" | grep -F 1.2.3.5)"
rules=$(in_target expect-up 2>&1 | grep -c 'обвязка на месте' || true)
check "правила на месте после kill -9 $killed" "$rules" = 1
in_target wait
got=$(tcp_to_outside "$LISTED_IP" -)
check "после respawn соединение снова принято ($got)" "$got" = connected
answer=$(client_sh "$UNLISTED_IP" - "nslookup failclosed.metabox.example $OUTSIDE 2>&1 || true")
check "после respawn DNS снова отвечает" -n "$(echo "$answer" | grep -F 1.2.3.5)"

echo "12. Режим all: через sing-box идёт и неперечисленный клиент"
in_target acl all
redir=$(counter metabox_redirect 'redirect to')
got=$(tcp_to_outside "$UNLISTED_IP" -)
check "соединение принято ($got)" "$got" = connected
check "счётчик redirect вырос" "$(counter metabox_redirect 'redirect to')" -gt "$redir"
in_target acl listed

echo "13. stop снимает обвязку, start возвращает"
dnsmasq_before=$(in_target snapshot | sed 's/.*dnsmasq=//')
in_target stop
in_target state
in_target expect-down || failed=1
check "dnsmasq рестартован при снятии фрагмента" "$(in_target snapshot | sed 's/.*dnsmasq=//')" != "$dnsmasq_before"
in_target start
in_target wait
in_target expect-up || failed=1
got=$(tcp_to_outside "$LISTED_IP" -)
check "после start соединение принято ($got)" "$got" = connected

echo "14. Выключенная модель рядом с homeproxy: чужие ip rule и таблица остаются"
# Служба остановлена, файла состояния нет — как после перезагрузки. Правило и
# таблицу с номерами обвязки держит чужая служба.
in_target stop
in_target foreign-up
in_target dataplane 0
in_target start
in_target wait
foreign_check "start выключенной службы оставил чужое правило и таблицу"
check "цепочек metabox_ при enabled=0 нет" "$(in_target state | sed -n 's/^nft: \([0-9]*\) .*/\1/p')" = 0
in_target stop
foreign_check "stop выключенной службы оставил чужое правило и таблицу"
in_target foreign-down
# Те же номера при enabled=1 и без файла состояния — свои: stop их снимает.
in_target dataplane 1
in_target start
in_target wait
in_target expect-up || failed=1
in_target forget-state
in_target stop
in_target expect-down || failed=1
in_target start
in_target wait
in_target expect-up || failed=1

echo
if [ "$failed" = 1 ]; then
	echo "ПРОВАЛ: обвязка ведёт себя не так, как требуется" >&2
	exit 1
fi
echo "Обвязка перехватывает перечисленных клиентов, держит fail-closed, снимается stop и не трогает чужие правила."
