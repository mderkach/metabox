"""Compare complete fixture documents against the allowed edits for each pair."""

import json
import sys
from pathlib import Path


def check_deltas(directory):
    def read(case):
        return json.loads((directory / case / "config.json").read_text())

    def expect(case, expected):
        if read(case) != expected:
            raise ValueError(f"{case}: document differs outside the expected edits, or a required edit is missing")

    for outbound in ("direct", "proxy", "named"):
        pair = read("configured")
        pair["route"]["rules"].insert(1, {"rule_set": ["alpha"], "action": "route", "outbound": outbound})
        pair["dns"]["rules"].insert(0, {"rule_set": ["alpha"], "action": "route", "server": f"{outbound}-dns"})
        expect(outbound, pair)

    existing = read("existing-before")
    existing["route"]["rules"].insert(1, {"rule_set": ["alpha"], "action": "route", "outbound": "named"})
    expect("existing", existing)

    configured = read("missing")
    configured["dns"]["servers"].insert(3, {
        "type": "tcp", "tag": "named-dns", "server": "127.0.0.1", "server_port": 10055, "detour": "named"
    })
    expect("configured", configured)

    shared = read("shared-before")
    rule = shared["dns"]["rules"][0]
    if rule != {"rule_set": ["alpha", "beta"], "action": "route", "server": "direct-dns"}:
        raise ValueError("shared-before: expected the direct resolver to serve both sets")
    rule["rule_set"].remove("alpha")
    shared["dns"]["rules"].insert(0, {"rule_set": ["alpha"], "action": "route", "server": "named-dns"})
    shared["route"]["rules"].insert(1, {"rule_set": ["alpha"], "action": "route", "outbound": "named"})
    expect("shared-after", shared)

    print("Fixture diffs passed: three pairs, DNS reuse, explicit resolver and shared rule split")


if __name__ == "__main__":
    check_deltas(Path(sys.argv[1]))
