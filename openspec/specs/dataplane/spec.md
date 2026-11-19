# Dataplane Specification

## Purpose

How LAN and router traffic reaches sing-box on the router: interception of TCP, UDP and DNS, what survives a crash or a reboot, how a change of the interception settings is applied and rolled back, and its diagnostics.

## Requirements

### Requirement: AC-49 LAN traffic is intercepted by redirect and tproxy

LAN traffic interception SHALL use the `redirect_tproxy` mode: TCP via redirect, UDP via tproxy to the ports of the dataplane model. ACL mode is `all` or `listed`; in `listed` only the listed sources go through sing-box, the rest go direct. A source is set by an IP address or subnet, or by a MAC address: a MAC does not depend on DHCP lease changes, while sing-box route rules still need an IP (AC-62). In `listed` a source can also be excluded by address or MAC: an excluded device goes direct even when a listed subnet or its listed MAC covers it; in `all` the exclusions, like the source lists, have no effect. Sources and exclusions are IPv4 only. The router's own traffic is intercepted by the same chains, traffic with the bypass mark goes around, private and service destinations are not intercepted.

#### Scenario: A source listed by address goes through sing-box

- **GIVEN** ACL mode `listed` and a client listed by its IP address
- **WHEN** the client opens a TCP connection and sends UDP to an outside address
- **THEN** the TCP connection is redirected and the UDP gets the tproxy mark

#### Scenario: A source listed by MAC goes through sing-box

- **GIVEN** ACL mode `listed` and a client listed by its MAC address
- **WHEN** the client opens a TCP connection to an outside address
- **THEN** the connection is redirected to sing-box

#### Scenario: An excluded device inside a listed subnet goes direct

- **GIVEN** ACL mode `listed`, a listed subnet, one device in it excluded by address and another by MAC
- **WHEN** both devices send TCP and UDP outside
- **THEN** their traffic is neither redirected nor marked for tproxy, and a device of the subnet without exclusion still goes through sing-box

#### Scenario: Private destinations are not intercepted

- **GIVEN** a listed client
- **WHEN** it opens a TCP connection to a private network
- **THEN** the connection is not redirected

#### Scenario: The router's own traffic is intercepted

- **GIVEN** a running dataplane
- **WHEN** a process on the router opens TCP and sends UDP outside
- **THEN** the TCP goes to redirect, the UDP comes back through `lo` to tproxy, and sing-box's own outgoing traffic carrying the bypass mark is not intercepted again

### Requirement: AC-50 LAN DNS goes through dnsmasq to sing-box

DNS: udp/53 from LAN SHALL be intercepted to dnsmasq, dnsmasq forwards queries to sing-box `dns-in`. The upstream is set by a fragment in the dnsmasq conf-dir, which the service puts in place on start and removes on stop; UCI `dhcp` is not edited for DNS (OQ-19), the only writes to it are the `host` sections of AC-80. Applying the JSON config does not restart dnsmasq and does not reload fw4; dnsmasq is restarted only when the dataplane DNS settings change or a static lease of AC-80 is saved, and exactly once per change.

#### Scenario: A LAN query is answered by sing-box

- **GIVEN** a running dataplane
- **WHEN** a LAN client sends a DNS query to udp/53
- **THEN** the query is intercepted to dnsmasq and the answer comes from sing-box `dns-in`

#### Scenario: A config reload leaves dnsmasq and the ruleset alone

- **GIVEN** a running dataplane
- **WHEN** the service reloads the sing-box config
- **THEN** the nft ruleset and the dnsmasq pid are the same as before

#### Scenario: Stop removes the upstream fragment

- **GIVEN** a running dataplane
- **WHEN** the service is stopped
- **THEN** the fragment is removed and dnsmasq is restarted

### Requirement: AC-51 The init script owns the dataplane

nft rules, `ip rule`/`ip route` and the dnsmasq upstream SHALL be set up and removed by the init script of the sing-box service, not by the daemon: the dataplane survives a router reboot without metaboxd, `stop` removes it when the daemon is dead, after `stop` there are no traces of metabox in `nft list ruleset` and `ip rule`. The daemon is the editor of the dataplane model in UCI and the initiator of the service `reload`. Decision — [ADR-0047](../../../docs/adr/ADR-0047-set-up-lan-interception-in-the-singbox-init-script.md).

#### Scenario: Stop leaves no traces

- **GIVEN** a running dataplane
- **WHEN** the service is stopped
- **THEN** `nft list ruleset` has no metabox chains and `ip rule` has no metabox rules

#### Scenario: Start brings the dataplane back

- **GIVEN** a stopped service
- **WHEN** the service is started
- **THEN** interception is in place and a listed client gets connections through sing-box

### Requirement: AC-52 Interception fails closed

Fail-closed: when sing-box crashes, interception and the dnsmasq upstream SHALL stay in place, traffic of listed devices and network DNS do not bypass the proxy. The same on restart and config reload: interception and upstream are not removed while sing-box comes up, so there is no window in which traffic or DNS would go direct; only an explicit service stop removes them. The process is brought up by procd `respawn`; while it is down, the panel shows the crash and its reason (AC-27, AC-55). Fail-open rejected by the owner on 2026-10-09 (OQ-16).

#### Scenario: A crashed sing-box blocks instead of leaking

- **GIVEN** a running dataplane
- **WHEN** sing-box is killed with `kill -9`
- **THEN** the interception rules stay, a listed client gets no outside access and its DNS gets no answer

#### Scenario: Traffic resumes after respawn

- **GIVEN** sing-box was killed
- **WHEN** procd starts it again
- **THEN** the listed client's connections and DNS answers work again

### Requirement: AC-53 Dataplane settings are applied with a confirmation window

Changing ACL and dataplane DNS settings SHALL go through the same protocol as Apply of the config: model check, UCI write, service `reload`, confirmation window, automatic rollback to the previous model. An unconfirmed ACL change does not cut off the administrator's device for longer than the window. When an ACL change in the `listed` mode takes the address the request came from out of interception — the address was intercepted before and is not listed by address or subnet after, or is excluded — the daemon log of that apply names the address and says that without a confirmation the change rolls back when the window ends.

#### Scenario: An unconfirmed change rolls back

- **GIVEN** a change of the dataplane model was written and the service reloaded
- **WHEN** the confirmation window ends without a confirmation
- **THEN** the previous model is restored

#### Scenario: A confirmed change stays

- **GIVEN** a change of the dataplane model inside its confirmation window
- **WHEN** the change is confirmed
- **THEN** the window closes and the new model stays

#### Scenario: Excluding the administrator's own address is noted

- **GIVEN** the administrator's address is intercepted as part of a listed subnet
- **WHEN** an ACL change excludes that address, and when another change keeps it listed
- **THEN** the daemon log of the first apply notes that the request address leaves interception, and the second notes nothing

### Requirement: AC-54 The healthcheck probes DNS, interception and the process

The healthcheck after a restart is not limited to polling the Clash API: it SHALL check a DNS probe through `dns-in`, that interception is present and that the process pid is new. A config with a broken `dns` section is rolled back. The DNS probe also runs before the restart against the running config: when it already fails there, the apply did not break DNS and a rollback would not repair it, so the check after the restart is skipped with a warning and the apply relies on the confirmation window ([ADR-0061](../../../docs/adr/ADR-0061-skip-the-dns-check-when-dns-already-failed-before-the-restart.md)).

#### Scenario: A broken dns section rolls back

- **GIVEN** a config whose `dns` section makes the DNS probe through `dns-in` fail
- **WHEN** the config is applied
- **THEN** the apply rolls back to the previous config

#### Scenario: DNS that already failed does not block the apply

- **GIVEN** the DNS probe fails against the running config before the restart
- **WHEN** a config is applied
- **THEN** the DNS check after the restart is skipped with a warning and the confirmation window decides

#### Scenario: The healthcheck waits for a new process

- **GIVEN** an apply that restarts sing-box
- **WHEN** the old process is still the one answering
- **THEN** the healthcheck does not pass until a process with a new pid answers

#### Scenario: Missing interception fails the healthcheck

- **GIVEN** an apply after which the interception chains are absent
- **WHEN** the healthcheck runs
- **THEN** it fails and the apply rolls back

### Requirement: AC-57 The dataplane coexists with other marking daemons

The dataplane SHALL coexist with other daemons that mark router traffic: their nft tables and the metabox chains are in place together, and a flow that already carries another daemon's mark does not go into tproxy. Checked on the test bench with fw4 and repeated on the router in the first day after the switch.

#### Scenario: A foreign mark passes by

- **GIVEN** a running dataplane and router traffic marked by another daemon
- **WHEN** the marked packet leaves the router
- **THEN** it is not marked for tproxy and reaches postrouting with its own mark

#### Scenario: Foreign rules survive start and stop

- **GIVEN** another service holds an `ip rule` and a routing table with the dataplane numbers
- **WHEN** a disabled metabox service is started and stopped
- **THEN** the foreign rule and table are left in place

### Requirement: AC-68 Dataplane diagnostics

Dataplane diagnostics: port listeners, a DNS probe through `dns-in`, presence of nft chains, internet access through the selected node. With interception removed, diagnostics names the missing chain, with sing-box stopped — the closed port. The owner uses LuCI diagnostics, so the screen is needed before the switch (OQ-23, 2026-10-09).

#### Scenario: A closed port is named

- **GIVEN** sing-box not listening on a dataplane port
- **WHEN** diagnostics runs
- **THEN** the port check fails as not listening

#### Scenario: A missing chain is named

- **GIVEN** interception with a chain removed
- **WHEN** diagnostics runs
- **THEN** the chains check fails and names the missing chain

#### Scenario: The DNS probe goes through dns-in

- **GIVEN** a silent `dns-in`
- **WHEN** diagnostics runs
- **THEN** the DNS probe fails

#### Scenario: Internet access through the selected node

- **GIVEN** a selected node
- **WHEN** diagnostics runs
- **THEN** it reports the delay through that node
