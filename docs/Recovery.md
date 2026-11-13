**English** · [Русский](./Recovery.ru.md)

# Known limitations and getting access back

What to do when the network behind a router with metabox stops working, and the limits of the current release. Every command below runs on the router as root over SSH (Secure Shell); LuCI, the standard OpenWrt web interface, is not needed.

## When the internet stops

metabox runs sing-box through its own service, `metabox-singbox`. When LAN traffic interception is on (`option enabled '1'` in the `dataplane` section of `/etc/config/metabox`), the service adds nftables rules to the fw4 firewall, an `ip rule` for UDP and a dnsmasq fragment that sends every DNS query of the network to sing-box.

Interception is fail-closed: these rules stay in place while sing-box is down. If sing-box crashes, fails to start or restarts, connections of intercepted devices are refused and DNS of the whole network gets no answer, instead of going out directly past the proxy. procd, the OpenWrt service manager, restarts a crashed sing-box on its own. The rules are removed only by an explicit stop of `metabox-singbox` or by turning interception off.

The internet therefore stops when:

- the sing-box config is broken and sing-box cannot start;
- the config has no DNS inbound on the `dns_port` of the `dataplane` section (5333 by default): dnsmasq forwards every query there;
- the sing-box binary or the config file is missing: the service does not start, and rules left by an earlier start stay;
- the remote server or node that the config routes traffic through is unreachable.

Interception is off after installation. Devices that are not intercepted (with `acl_mode 'listed'`, the default, only the devices enabled on the Devices screen or listed in the `dataplane` section are) keep their own connection, but they still lose DNS while sing-box is down, because DNS of the whole network goes through it.

## What an Apply undoes on its own

An Apply in the panel checks the new config with `sing-box check`, saves the previous one, restarts sing-box and runs a health check: the Clash API (the sing-box control interface) answers, a DNS query through sing-box resolves, the interception rules are present and the process is new. A failed check rolls back to the previous config at once.

After a passed check the panel asks to confirm the change within a confirmation window, 60 seconds by default (the `-confirm-window` flag of `metaboxd`). Without a confirmation the daemon restores the previous config and restarts sing-box. So if an Apply cuts the browser off from the router, wait for the window to end: the previous config comes back.

Changes of interception settings and of the device list on the Devices screen go through the same window and roll back to the previous settings.

The transaction is kept in `/etc/metabox/apply.json` on persistent storage. If the router reboots or the daemon restarts during an Apply, the daemon finishes the transaction on start: an unfinished Apply is rolled back, and an open window starts again in full.

The automatic rollback does not help when the config was already broken before the Apply, when the config was changed by hand, or when the rollback finds no previous config.

## Getting back without the panel

Connect to the router over SSH by its IP address (`ssh root@<router IP>`). SSH does not depend on sing-box: it works while the LAN is up, even when DNS and the internet are not.

### See what is wrong

```sh
logread -e metabox-singbox
logread -e sing-box
/etc/init.d/metabox-singbox status
```

`logread` shows the reason sing-box stopped. Check the config with the same command the daemon uses:

```sh
sing-box check -c /etc/sing-box/config.json -D /etc/sing-box
```

### Stop interception now

```sh
/etc/init.d/metabox-singbox stop
```

This removes the nftables rules, the `ip rule` and the route table of interception and the dnsmasq fragment, then restarts dnsmasq. LAN traffic and DNS go out directly. Check that nothing is left; each command must print nothing:

```sh
nft list ruleset | grep metabox_
uci -q get firewall.metabox_post
```

A stopped service starts again on the next reboot. To keep it off, also run `/etc/init.d/metabox-singbox disable`.

### Turn interception off

To keep sing-box running but stop intercepting LAN traffic:

```sh
uci set metabox.dataplane.enabled='0'
uci commit metabox
/etc/init.d/metabox-singbox restart
```

The service removes the rules on start when interception is off.

### Restore an earlier config

The daemon keeps the last ten configs that an Apply replaced in `/etc/metabox/versions/`, as files named by a six-digit number (`000001`, `000002`, …); the highest number is the newest. Each file is the config as it was, byte for byte. The panel restores them from its version history through a normal Apply. Over SSH:

```sh
ls -l /etc/metabox/versions/
sing-box check -c /etc/metabox/versions/<number> -D /etc/sing-box
cp /etc/sing-box/config.json /root/config.json.broken
cp /etc/metabox/versions/<number> /etc/sing-box/config.json
/etc/init.d/metabox-singbox restart
```

Do not put copies of a config into `/etc/sing-box/`: sing-box loads every `.json` file in that directory. A neighbouring `<number>.rule-sets/` directory holds the rule-set files of that version; copying the config alone does not restore them. After a change by hand, the panel reports an outside edit and refuses the next Apply until it rereads the file.

### Reset the panel password

```sh
rm /etc/metabox/auth.json && /etc/init.d/metaboxd restart
```

### Remove metabox

The package has no removal scripts, so stop the services first:

```sh
/etc/init.d/metaboxd stop
/etc/init.d/metaboxd disable
/etc/init.d/metabox-singbox stop
/etc/init.d/metabox-singbox disable
apk del metaboxd
```

LAN traffic then goes out directly. `/etc/config/metabox` and `/etc/sing-box/config.json` stay on the router. The `sing-box-extended` package stays too; remove it with `apk del sing-box-extended` if you do not need it. The install script also added the signing key `/etc/apk/keys/metabox-release.pem` and the package feed `/etc/apk/repositories.d/metabox.list`; delete them to stop using the metabox repository.

## Known limitations

- **OpenWrt 25.12 or SNAPSHOT only.** These versions use the apk package manager. OpenWrt 24.10 and older use opkg and are not supported.
- **aarch64 only.** Packages are built for `aarch64_cortex-a53`, the architecture of mediatek/filogic firmware. MIPS routers are not supported.
- **One core.** sing-box-extended, a fork of sing-box, is the only supported core. The upstream `sing-box` package is not supported, and the fork's own `sing-box` service must stay off.
- **No fail-open mode.** While sing-box is down, intercepted devices have no connection and the network has no DNS (see [above](#when-the-internet-stops)). Every Apply also leaves the network without DNS for a few seconds while sing-box restarts.
- **IPv4 only.** Interception, its device list and exclusions work with IPv4. IPv6 traffic is not intercepted.
- **One interceptor.** Another service that intercepts LAN traffic must be stopped before interception is turned on; otherwise both capture the same traffic.
- **LAN only, password optional.** The panel listens on the LAN networks only. Without a password, any LAN device can change routing.
- **Tested hardware.** The project is a pre-release, tested on the Banana Pi BPI-R4 Pro.
