"""Emit independent full draft snapshots and synthetic catalog source files."""

import json
import sys
from pathlib import Path

SERVICES = ("alpha", "beta", "other")
CASES = (
    "direct", "proxy", "named", "existing-before", "existing",
    "conflict-dns", "conflict-route", "missing", "configured",
    "shared-before", "shared-after", "overlap-before", "overlap-after", "direct-detour",
)
HOPS = {"group-member": 11081, "named": 11082}


def catalog_rule(tag, field, value):
    return {"rule_set": [tag], "action": "route", field: value}


def configuration(case):
    if case not in CASES:
        raise ValueError(f"Unknown fixture: {case}")
    overlap = case.startswith("overlap-")
    direct_detour = case == "direct-detour"
    if overlap:
        case = case.replace("overlap-", "shared-")
    if direct_detour:
        case = "direct"
    route_rules = [{"inbound": ["queries"], "action": "hijack-dns"}]
    dns_rules = []
    scope = case if case in ("direct", "proxy") else "named"
    server = f"{scope}-dns"
    if case == "conflict-dns":
        dns_rules.append({"domain_suffix": ["alpha.test"], "action": "route", "server": "direct-dns"})
    if case == "conflict-route":
        route_rules.append({"domain_suffix": ["alpha.test"], "action": "route", "outbound": "direct"})

    if case not in ("missing", "configured", "existing-before", "shared-before"):
        route_rules.append(catalog_rule("alpha", "outbound", scope))
    if case == "shared-before":
        dns_rules.append({"rule_set": ["alpha", "beta"], "action": "route", "server": "direct-dns"})
    elif case not in ("missing", "configured"):
        dns_rules.append(catalog_rule("alpha", "server", server))

    route_rules.append(catalog_rule("beta", "outbound", "direct"))
    route_rules.append(catalog_rule("other", "outbound", "proxy"))
    if case != "shared-before":
        dns_rules.append(catalog_rule("beta", "server", "direct-dns"))
    dns_rules.append(catalog_rule("other", "server", "proxy-dns"))

    servers = [{"type": "hosts", "tag": "hosts", "predefined": {
        f"{service}.test": "127.0.0.1" for service in (*SERVICES, "overlap")
    }}]
    for tag, port in (("direct", 10053), ("proxy", 10054), ("named", 10055), ("default", 10056)):
        if tag == "named" and case == "missing":
            continue
        resolver = {"type": "tcp", "tag": f"{tag}-dns", "server": "127.0.0.1", "server_port": port}
        if tag in ("proxy", "named") or (tag == "direct" and direct_detour):
            resolver["detour"] = tag
        servers.append(resolver)
    sources = []
    for tag in SERVICES:
        filename = f"{tag}-overlap" if overlap and tag in ("alpha", "beta") else tag
        sources.append({"type": "remote", "tag": tag, "format": "binary",
                        "url": f"http://127.0.0.1:18080/{filename}.srs"})
    return {
        "log": {"level": "debug"},
        "inbounds": [
            {"type": "socks", "tag": "client", "listen": "127.0.0.1", "listen_port": 11080},
            {"type": "direct", "tag": "queries", "listen": "127.0.0.1",
             "listen_port": 1053, "network": "udp"},
        ],
        "outbounds": [
            {"type": "direct", "tag": "direct"},
            *[{"type": "socks", "tag": tag, "server": "127.0.0.1", "server_port": port}
              for tag, port in HOPS.items()],
            {"type": "selector", "tag": "proxy", "outbounds": ["group-member", "named"], "default": "group-member"},
        ],
        "dns": {"servers": servers, "rules": dns_rules, "final": "default-dns", "disable_cache": True},
        "route": {
            "rules": route_rules, "final": "named", "default_domain_resolver": "hosts",
            "rule_set": sources,
        },
    }


def emit(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for service in SERVICES:
        source = {"version": 3, "rules": [{"domain": [f"{service}.test"]}]}
        (directory / f"{service}.json").write_text(json.dumps(source) + "\n")
        if service in ("alpha", "beta"):
            source["rules"][0]["domain"].append("overlap.test")
            (directory / f"{service}-overlap.json").write_text(json.dumps(source) + "\n")
    for case in CASES:
        target = directory / case
        target.mkdir(exist_ok=True)
        (target / "config.json").write_text(json.dumps(configuration(case), indent=2) + "\n")


if __name__ == "__main__":
    emit(Path(sys.argv[1]))
