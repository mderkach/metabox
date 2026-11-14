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

The transaction is kept in `apply.json` in the daemon state directory (`/etc/metabox` by default) on persistent storage. If the router reboots or the daemon restarts during an Apply, the daemon finishes the transaction on start: an unfinished Apply is rolled back, and an open window starts again in full.

The automatic rollback does not help when the config was already broken before the Apply, when the config was changed by hand, or when the rollback finds no previous config.

## Getting back without the panel

Connect to the router over SSH by its IP address (`ssh root@<router IP>`). SSH does not depend on sing-box: it works while the LAN is up, even when DNS and the internet are not.

The sing-box config is `/etc/sing-box/config.json` and the daemon state is in `/etc/metabox` by default; the `main` section of `/etc/config/metabox` can move them (`config_dir`, `config_name`, `state_dir`). Read the actual paths first; the commands below use these variables, so run them in the same SSH session:

```sh
dir=$(uci -q get metabox.main.config_dir || echo /etc/sing-box)
config="$dir/$(uci -q get metabox.main.config_name || echo config.json)"
state=$(uci -q get metabox.main.state_dir || echo /etc/metabox)
```

### See what is wrong

```sh
logread -e metabox-singbox
logread -e sing-box
/etc/init.d/metabox-singbox status
```

`logread -e sing-box` shows the error sing-box exited with, in a line with `FATAL`; `logread -e metabox-singbox` shows interception errors and a missing config or sing-box binary. `status` prints `running` while sing-box works. Check the config with the same command the daemon uses:

```sh
sing-box check -c "$config" -D "$dir"
```

### Stop interception now

```sh
/etc/init.d/metabox-singbox stop
```

This removes the nftables rules, the `ip rule` and the route table of interception and the dnsmasq fragment, then restarts dnsmasq. LAN traffic and DNS go out directly. Check that nothing is left; each command must print nothing:

```sh
nft list ruleset 2>/dev/null | grep metabox_
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

The daemon keeps the last ten configs that an Apply replaced in `$state/versions/`, as files named by a six-digit number (`000001`, `000002`, …); the highest number is the newest. Each file is the config as it was, byte for byte. The panel restores them from its version history through a normal Apply. Over SSH, list them:

```sh
ls -l "$state/versions/"
```

A neighbouring `<number>.rule-sets/` directory holds the whole set of rule-set files of that version, the files the config refers to in `$dir/rule-sets/`; it may be empty. A version without it was saved by an older daemon and does not change the rule-set files. Set `v` to the number of the version to restore; the commands keep the current config and rule-set files in `/root`, put the version in place and restart sing-box only if the check passes:

```sh
v=000002
cp "$config" /root/config.json.broken
[ ! -d "$dir/rule-sets" ] || cp -R "$dir/rule-sets" /root/rule-sets.broken
cp "$state/versions/$v" "$config"
if [ -d "$state/versions/$v.rule-sets" ]; then
	mkdir -p "$dir/rule-sets"
	rm -f "$dir/rule-sets/"*.json
	cp -R "$state/versions/$v.rule-sets/." "$dir/rule-sets/"
fi
sing-box check -c "$config" -D "$dir" && /etc/init.d/metabox-singbox restart
```

If `sing-box check` fails, the service is not restarted; put the copies from `/root` back. After a change by hand, the panel reports an outside edit and refuses the next Apply until it rereads the config.

### Reset the panel password

```sh
rm "$state/auth.json" && /etc/init.d/metaboxd restart
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

LAN traffic then goes out directly. apk keeps `/etc/config/metabox` if it was changed after installation, for example by the interception settings of the panel, and deletes it otherwise. The daemon state directory `$state` (version history, panel password) and the sing-box config with its `rule-sets/` directory stay on the router; delete them by hand if you do not need them. The `sing-box-extended` package stays too; remove it with `apk del sing-box-extended` after `apk del metaboxd`. Run earlier, it keeps the package while metaboxd depends on it, but takes it off the list of packages installed on request, and the next `apk del metaboxd` then removes both. The install script also added the signing key `/etc/apk/keys/metabox-release.pem` and the package feed `/etc/apk/repositories.d/metabox.list`; delete them to stop using the metabox repository.

## Known limitations

- **OpenWrt 25.12 or SNAPSHOT only.** These versions use the apk package manager. OpenWrt 24.10 and older use opkg and are not supported.
- **aarch64 only.** Packages are built for `aarch64_cortex-a53`, the architecture of mediatek/filogic firmware. MIPS routers are not supported.
- **One core.** sing-box-extended, a fork of sing-box, is the only supported core. The upstream `sing-box` package is not supported, and the fork's own `sing-box` service must stay off.
- **No fail-open mode.** While sing-box is down, intercepted devices have no connection and the network has no DNS (see [above](#when-the-internet-stops)). Every Apply also leaves the network without DNS for a few seconds while sing-box restarts.
- **IPv4 only.** Interception, its device list and exclusions work with IPv4. IPv6 traffic is not intercepted.
- **One interceptor.** Another service that intercepts LAN traffic must be stopped before interception is turned on; otherwise both capture the same traffic.
- **LAN only, password optional.** The panel listens on the LAN networks only. Without a password, any LAN device can change routing.
- **Tested hardware.** The project is a pre-release, tested on the Banana Pi BPI-R4 Pro.
