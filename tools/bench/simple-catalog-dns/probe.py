"""Exercise the pinned core inside an isolated Linux loopback namespace."""

import contextlib
import functools
import http.server
import ipaddress
import json
import os
import socket
import socketserver
import struct
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from fixtures import CASES, HOPS, SERVICES

LOCAL = "127.0.0.1"
CORE = os.environ.get("SING_BOX", "sing-box")
# Each SOCKS relay binds its own source address on the last hop.
PEERS = {"direct": 1, "proxy": 2, "named": 3}
PORT_MARKERS = {"direct": 1, "proxy": 2, "named": 3, "default": 4}


def read_exact(conn, length):
    data = bytearray()
    while len(data) < length:
        chunk = conn.recv(length - len(data))
        if not chunk:
            raise EOFError("peer closed a partial response")
        data.extend(chunk)
    return bytes(data)


class Resolver(socketserver.BaseRequestHandler):
    def handle(self):
        length = int.from_bytes(read_exact(self.request, 2))
        query = read_exact(self.request, length)
        end = query.index(b"\x00", 12) + 5
        peer = ipaddress.IPv4Address(self.client_address[0]).packed[-1]
        marker = self.server.server_address[1] - 10052
        reply = (query[:2] + struct.pack("!5H", 0x8180, 1, 1, 0, 0) + query[12:end]
                 + struct.pack("!3HIH", 0xc00c, 1, 1, 0, 4) + bytes([192, 0, marker, peer]))
        self.request.sendall(len(reply).to_bytes(2) + reply)


class Destination(socketserver.BaseRequestHandler):
    def handle(self):
        if read_exact(self.request, 1) == b"?":
            self.request.sendall(socket.inet_aton(self.client_address[0]))


class Catalog(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(stack, handler, port):
    server = stack.enter_context(socketserver.ThreadingTCPServer((LOCAL, port), handler))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    stack.callback(server.shutdown)


@contextlib.contextmanager
def core(config, cwd, ready_port):
    with tempfile.NamedTemporaryFile(mode="w+") as log:
        proc = subprocess.Popen([CORE, "--disable-color", "run", "-c", str(config)],
                                cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError("core exited during startup")
                try:
                    with socket.create_connection((LOCAL, ready_port), timeout=0.1):
                        break
                except OSError:
                    time.sleep(0.05)
            else:
                raise TimeoutError("core did not become ready")
            with open(log.name) as matches:
                yield matches
        except BaseException:
            log.seek(0)
            print(log.read(), file=sys.stderr)
            raise
        finally:
            proc.terminate()
            proc.wait(timeout=5)


def data_peer(name):
    with socket.create_connection((LOCAL, 11080), timeout=3) as conn:
        conn.sendall(b"\x05\x01\x00")
        assert read_exact(conn, 2) == b"\x05\x00"
        domain = name.encode()
        conn.sendall(b"\x05\x01\x00\x03" + bytes([len(domain)]) + domain + struct.pack("!H", 18081))
        version, status, _, family = read_exact(conn, 4)
        assert (version, status) == (5, 0)
        addr_len = {1: 4, 4: 16}.get(family)
        if addr_len is None:
            assert family == 3
            addr_len = read_exact(conn, 1)[0]
        read_exact(conn, addr_len + 2)
        conn.sendall(b"?")
        return socket.inet_ntoa(read_exact(conn, 4))


def query_dns(name):
    qname = b"".join(bytes([len(label)]) + label.encode() for label in name.split(".")) + b"\x00"
    query = struct.pack("!6H", 123, 0x0100, 1, 0, 0, 0) + qname + struct.pack("!2H", 1, 1)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as conn:
        conn.settimeout(3)
        conn.connect((LOCAL, 1053))
        conn.send(query)
        reply = conn.recv(4096)
    ident, flags, _, answers, _, _ = struct.unpack("!6H", reply[:12])
    assert (ident, flags & 15, answers) == (123, 0, 1), reply
    return socket.inet_ntoa(reply[-4:])


def relay_config():
    return {
        "inbounds": [{"type": "socks", "tag": tag, "listen": LOCAL, "listen_port": port}
                     for tag, port in HOPS.items()],
        "outbounds": [{"type": "direct", "tag": tag + "-exit", "inet4_bind_address": f"127.0.0.{n}"}
                      for n, tag in enumerate(HOPS, start=2)],
        "dns": {"servers": [{"type": "hosts", "tag": "hosts", "predefined": {
            f"{service}.test": LOCAL for service in (*SERVICES, "overlap")
        }}]},
        "route": {"default_domain_resolver": "hosts", "rules": [
            {"inbound": [tag], "action": "route", "outbound": tag + "-exit"} for tag in HOPS
        ]},
    }


def expected(case, service):
    # The trace distinguishes an explicit route from the same outbound chosen by route.final.
    # Each tuple gives the data path, upstream, traffic match and DNS match (None means final).
    alpha = {
        "direct": ("direct", "direct", (1, "rule_set=alpha"), (0, "rule_set=alpha")),
        "direct-detour": ("direct", "direct", (1, "rule_set=alpha"), (0, "rule_set=alpha")),
        "proxy": ("proxy", "proxy", (1, "rule_set=alpha"), (0, "rule_set=alpha")),
        "named": ("named", "named", (1, "rule_set=alpha"), (0, "rule_set=alpha")),
        "existing": ("named", "named", (1, "rule_set=alpha"), (0, "rule_set=alpha")),
        "existing-before": ("named", "named", None, (0, "rule_set=alpha")),
        "conflict-route": ("direct", "named", (1, "domain_suffix=alpha.test"), (0, "rule_set=alpha")),
        "conflict-dns": ("named", "direct", (1, "rule_set=alpha"), (0, "domain_suffix=alpha.test")),
        "missing": ("named", "default", None, None),
        "configured": ("named", "default", None, None),
        "shared-before": ("named", "direct", None, (0, "rule_set=[alpha beta]")),
        "shared-after": ("named", "named", (1, "rule_set=alpha"), (0, "rule_set=alpha")),
    }
    case = case.replace("overlap-", "shared-")
    traffic, resolver, route_hit, dns_hit = alpha[case]
    if service == "overlap":
        service = {"shared-before": "beta", "shared-after": "alpha"}[case]
    if service == "alpha":
        return traffic, resolver, route_hit, dns_hit
    later = {"beta": 0, "other": 1}[service]
    tag = f"rule_set={service}"
    route_index = 1 + int(route_hit is not None) + int(case == "conflict-route") + later
    if case == "shared-before":
        dns_index = later
        dns_tag = "rule_set=[alpha beta]" if service == "beta" else tag
    else:
        dns_index = int(dns_hit is not None) + int(case == "conflict-dns") + later
        dns_tag = tag
    path = {"beta": "direct", "other": "proxy"}[service]
    return path, path, (route_index, tag), (dns_index, dns_tag)


def expected_trace(traffic, resolver, route_hit, dns_hit):
    matches = []
    if route_hit is not None:
        index, rule = route_hit
        matches.append(f"router: match[{index}] {rule} => route({traffic})")
    matches.append("router: match[0] inbound=queries => hijack-dns")
    if dns_hit is not None:
        index, rule = dns_hit
        matches.append(f"dns: match[{index}] {rule} => route({resolver}-dns)")
    return matches


def run(directory):
    for source in sorted(directory.glob("*.json")):
        subprocess.run([CORE, "rule-set", "compile", str(source)], check=True)
    probes = 0
    with contextlib.ExitStack() as stack:
        serve(stack, functools.partial(Catalog, directory=str(directory)), 18080)
        serve(stack, Destination, 18081)
        for port in range(10053, 10057):
            serve(stack, Resolver, port)
        relay = directory / "relays.json"
        relay.write_text(json.dumps(relay_config()))
        stack.enter_context(core(relay, directory, 11081))
        for case in CASES:
            config = directory / case / "config.json"
            subprocess.run([CORE, "check", "-c", str(config)], check=True)
            print(f"{case}: config check passed")
            with core(config, config.parent, 11080) as log:
                services = (*SERVICES, "overlap") if case.startswith("overlap-") else SERVICES
                for service in services:
                    name = service + ".test"
                    data = data_peer(name)
                    dns = query_dns(name)
                    traffic, resolver, route_hit, dns_hit = expected(case, service)
                    peer = PEERS["direct"] if resolver == "default" else PEERS[resolver]
                    assert data == f"127.0.0.{PEERS[traffic]}", (case, name, data)
                    assert dns == f"192.0.{PORT_MARKERS[resolver]}.{peer}", (case, name, dns)
                    print(f"  {name}: data peer {data}, resolver {resolver}-dns, DNS peer 127.0.0.{peer} ({dns})")
                    matches = [line.split("ms] ")[-1] for line in log.read().splitlines() if "match[" in line]
                    print(*("  " + match for match in matches), sep="\n")
                    wanted = expected_trace(traffic, resolver, route_hit, dns_hit)
                    assert matches == wanted, (case, name, matches, wanted)
                    probes += 1
    print(f"{len(CASES)} config checks and {probes} data/DNS probe pairs passed")


if __name__ == "__main__":
    run(Path(sys.argv[1]).resolve())
