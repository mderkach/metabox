#!/bin/sh
# Check of the interception dataplane on the test bench (`make dataplane-check`). The wired
# network clients start here, on the host, as separate containers with
# the default route through the test bench, like LAN devices through the router. What is
# visible only from inside the router is read by /usr/bin/dataplane-check of the test bench.
#
# Client addresses match the ACL lists in /etc/config/metabox of the test bench:
# .40 is listed by IP, .42 by MAC, .41 is not listed.
set -eu

TARGET=metabox-target-1
NET=metabox_lan
ROUTER=192.168.210.2
LISTED_IP=192.168.210.40
UNLISTED_IP=192.168.210.41
MAC_IP=192.168.210.42
LISTED_MAC=02:00:00:00:d2:2a
# An external address outside private networks: the dataplane never intercepts them.
OUTSIDE=1.1.1.1

docker inspect "$TARGET" >/dev/null 2>&1 || {
	echo "test bench is not up: run make up first" >&2
	exit 1
}

# Deadline of one step inside the test bench, in seconds. docker exec has no deadline of
# its own, and a step that never returned held a CI run for hours (issue #122).
STEP_TIMEOUT=${DATAPLANE_STEP_TIMEOUT:-60}

failed=0

section() {
	echo "$(date +%H:%M:%S) $*"
}

# in_target <command...>: one step inside the test bench. On the deadline the host
# side is killed and what is still alive inside the container is listed: the step that
# hung and the process it waits on.
in_target() {
	started=$(date +%s)
	docker exec "$TARGET" /usr/bin/dataplane-check "$@" &
	exec_pid=$!
	(sleep "$STEP_TIMEOUT" && kill "$exec_pid") >/dev/null 2>&1 &
	watchdog=$!
	wait "$exec_pid"
	rc=$?
	kill "$watchdog" 2>/dev/null
	wait "$watchdog" 2>/dev/null || true
	if [ $(($(date +%s) - started)) -ge "$STEP_TIMEOUT" ]; then
		echo "  HUNG    dataplane-check $* did not finish within ${STEP_TIMEOUT}s" >&2
		docker exec "$TARGET" sh -c '
			for p in /proc/[0-9]*; do
				[ "${p#/proc/}" = "$$" ] && continue
				cmd=$(tr "\0" " " < "$p/cmdline" 2>/dev/null) || continue
				case "$cmd" in */usr/bin/dataplane-check\ *|logread*|grep*|*/logd\ *|*/ubusd*)
					echo "    pid ${p#/proc/} $(cat "$p/wchan" 2>/dev/null): $cmd" ;;
				esac
			done' >&2 || true
		return 1
	fi
	return "$rc"
}

counter() {
	in_target counter "$1" "$2"
}

# client <ip> <mac or -> <command>: a wired network client, all traffic
# of which goes through the test bench.
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

# check <what> <condition>: the condition is a test expression.
check() {
	what="$1"
	shift
	if [ "$@" ]; then
		echo "  ok      $what"
	else
		echo "  FAILED  $what" >&2
		failed=1
	fi
}

# foreign_check <what>: the foreign ip rule and the table with the dataplane numbers are in place.
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

section "1. Dataplane installed by service start"
# After the container is recreated the service is still coming up: without waiting the first
# snapshot catches empty chains and counters.
in_target wait || failed=1
in_target state
in_target expect-up || failed=1

section "2. TCP of a client listed by IP goes to the sing-box redirect"
lanac_ip=$(counter metabox_redirect_lanac 'ip saddr @metabox_src_ip')
redir=$(counter metabox_redirect 'redirect to')
got=$(tcp_to_outside "$LISTED_IP" -)
check "connection accepted ($got)" "$got" = connected
check "ip saddr counter grew" "$(counter metabox_redirect_lanac 'ip saddr @metabox_src_ip')" -gt "$lanac_ip"
check "redirect counter grew" "$(counter metabox_redirect 'redirect to')" -gt "$redir"
if in_target log-has "redirect-in" "$LISTED_IP" 2>/dev/null; then
	check "sing-box logged an incoming connection from $LISTED_IP" 1 = 1
else
	check "sing-box logged an incoming connection from $LISTED_IP" 0 = 1
fi

redir=$(counter metabox_redirect 'redirect to')
client_sh "$LISTED_IP" - "nc -w 2 172.16.0.1 80 </dev/null >/dev/null 2>&1 || true"
check "TCP to a private network is not intercepted" "$(counter metabox_redirect 'redirect to')" = "$redir"

section "3. TCP of a client listed by MAC goes to redirect"
lanac_mac=$(counter metabox_redirect_lanac 'ether saddr @metabox_src_mac')
got=$(tcp_to_outside "$MAC_IP" "$LISTED_MAC")
check "connection accepted ($got)" "$got" = connected
check "ether saddr counter grew" "$(counter metabox_redirect_lanac 'ether saddr @metabox_src_mac')" -gt "$lanac_mac"

section "4. TCP of an unlisted client bypasses sing-box"
redir=$(counter metabox_redirect 'redirect to')
tcp_to_outside "$UNLISTED_IP" - >/dev/null
check "redirect counter did not change" "$(counter metabox_redirect 'redirect to')" = "$redir"

section "5. UDP of a listed client goes to tproxy"
tproxy=$(counter metabox_mangle_prerouting 'tproxy ip to')
client_sh "$LISTED_IP" - "echo metabox | nc -u -w 1 $OUTSIDE 9999 >/dev/null 2>&1 || true"
check "tproxy counter grew" "$(counter metabox_mangle_prerouting 'tproxy ip to')" -gt "$tproxy"
if in_target log-has "tproxy-in" "$LISTED_IP" 2>/dev/null; then
	check "sing-box logged UDP from $LISTED_IP" 1 = 1
else
	check "sing-box logged UDP from $LISTED_IP" 0 = 1
fi

section "6. client udp/53 is intercepted to dnsmasq, the answer comes through sing-box"
hijack=$(counter dstnat 'udp dport 53')
answer=$(client_sh "$UNLISTED_IP" - "nslookup dataplane-check.metabox.example $OUTSIDE 2>&1 || true")
check "answer 1.2.3.4 from the sing-box dns-in" -n "$(echo "$answer" | grep -F 1.2.3.4)"
check "udp/53 interception counter grew" "$(counter dstnat 'udp dport 53')" -gt "$hijack"

section "7. router's own TCP goes to redirect, outgoing sing-box traffic with mark 100 bypasses it"
out_jump=$(counter metabox_output_redir 'jump metabox_redirect')
out_self=$(counter metabox_output_redir 'meta mark 0x00000064')
redir=$(counter metabox_redirect 'redirect to')
in_target router-tcp
check "nat output sent router TCP to redirect" "$(counter metabox_output_redir 'jump metabox_redirect')" -gt "$out_jump"
check "redirect counter grew" "$(counter metabox_redirect 'redirect to')" -gt "$redir"
check "outgoing sing-box traffic with mark 100 came back from interception" "$(counter metabox_output_redir 'meta mark 0x00000064')" -gt "$out_self"

section "8. router's own UDP is marked and goes to tproxy through lo"
mark_out=$(counter metabox_mangle_output 'meta mark set 0x00000065')
lo=$(counter metabox_mangle_lanac 'iifname "lo"')
in_target router-udp
check "mangle output marked router UDP" "$(counter metabox_mangle_output 'meta mark set 0x00000065')" -gt "$mark_out"
check "the marked packet came back through lo to tproxy" "$(counter metabox_mangle_lanac 'iifname "lo"')" -gt "$lo"

section "9. A packet with a foreign mark (b4 trace) does not go to tproxy"
foreign=$(counter metabox_mangle_output 'meta mark != 0x00000000')
in_target b4-sim-up
check "packet with mark 0x8000 passed by interception" "$(counter metabox_mangle_output 'meta mark != 0x00000000')" -gt "$foreign"
check "the tproxy mark was not set on the probe" "$(in_target b4-sim-counter 0x00000065)" = 0
check "mark 0x8000 reached postrouting" "$(in_target b4-sim-counter 0x00008000)" -gt 0
in_target b4-sim-down

section "10. Config Apply does not touch fw4 and dnsmasq"
before=$(in_target snapshot)
pid_before=$(in_target singbox-pid)
in_target apply
in_target wait
after=$(in_target snapshot)
pid_after=$(in_target singbox-pid)
echo "  before: $before"
echo "  after:  $after"
check "nft -s list ruleset and dnsmasq pid match" "$before" = "$after"
check "sing-box restarted (pid $pid_before -> $pid_after)" "$pid_before" != "$pid_after"

section "11. Fail-closed: sing-box is killed, interception stays"
killed=$(in_target kill)
got=$(tcp_to_outside "$LISTED_IP" -)
check "client has no outside access while sing-box is down ($got)" "$got" = refused
# A name nobody asked for before: the dnsmasq cache would answer even without sing-box.
answer=$(client_sh "$UNLISTED_IP" - "nslookup -timeout=2 failclosed.metabox.example $OUTSIDE 2>&1 || true")
check "client DNS gets no answer while sing-box is down" -z "$(echo "$answer" | grep -F 1.2.3.5)"
rules=$(in_target expect-up 2>&1 | grep -c 'dataplane in place' || true)
check "rules in place after kill -9 $killed" "$rules" = 1
in_target wait
got=$(tcp_to_outside "$LISTED_IP" -)
check "after respawn the connection is accepted again ($got)" "$got" = connected
answer=$(client_sh "$UNLISTED_IP" - "nslookup failclosed.metabox.example $OUTSIDE 2>&1 || true")
check "after respawn DNS answers again" -n "$(echo "$answer" | grep -F 1.2.3.5)"

section "12. Mode all: an unlisted client also goes through sing-box"
in_target acl all
redir=$(counter metabox_redirect 'redirect to')
got=$(tcp_to_outside "$UNLISTED_IP" -)
check "connection accepted ($got)" "$got" = connected
check "redirect counter grew" "$(counter metabox_redirect 'redirect to')" -gt "$redir"
in_target acl listed

section "13. stop removes the dataplane, start brings it back"
dnsmasq_before=$(in_target snapshot | sed 's/.*dnsmasq=//')
in_target stop
in_target state
in_target expect-down || failed=1
check "dnsmasq restarted when the fragment was removed" "$(in_target snapshot | sed 's/.*dnsmasq=//')" != "$dnsmasq_before"
in_target start
in_target wait
in_target expect-up || failed=1
got=$(tcp_to_outside "$LISTED_IP" -)
check "after start the connection is accepted ($got)" "$got" = connected

section "14. Disabled model next to homeproxy: foreign ip rule and table stay"
# The service is stopped, there is no state file, as after a reboot. The rule and
# the table with the dataplane numbers are held by a foreign service.
in_target stop
in_target foreign-up
in_target dataplane 0
in_target start
in_target wait
foreign_check "start of a disabled service left the foreign rule and table"
check "no metabox_ chains with enabled=0" "$(in_target state | sed -n 's/^nft: \([0-9]*\) .*/\1/p')" = 0
in_target stop
foreign_check "stop of a disabled service left the foreign rule and table"
in_target foreign-down
# The same numbers with enabled=1 and no state file are our own: stop removes them.
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
	echo "FAILED: the dataplane does not behave as required" >&2
	exit 1
fi
echo "The dataplane intercepts the listed clients, holds fail-closed, is removed by stop and does not touch foreign rules."
