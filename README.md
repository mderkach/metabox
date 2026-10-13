<div align="center">

<img src="docs/logo.svg" alt="metabox" width="72" />

# metabox

**Web panel for sing-box on OpenWrt routers**

Edit the config in forms, apply it with automatic rollback, see where every connection goes.

[![license](https://img.shields.io/badge/license-GPL--3.0--or--later-blue?style=flat-square)](./LICENSE)
![version](https://img.shields.io/badge/version-0.1.0--rc.2-orange?style=flat-square)
![OpenWrt](https://img.shields.io/badge/OpenWrt-25.12%20%7C%20SNAPSHOT-00B5E2?style=flat-square)
![arch](https://img.shields.io/badge/arch-aarch64-lightgrey?style=flat-square)

**English** · [Русский](./README.ru.md)

</div>

---

metabox is a Go daemon (`metaboxd`) that installs on the router as an apk package and serves a built-in web UI. It works with the config of [sing-box-extended](https://github.com/shtorm-7/sing-box-extended), a fork of sing-box: forms for nodes, routing rules and rule sets, raw JSON editing, and validation against the fork's schema before anything reaches the router.

Apply checks the config with the sing-box binary, restarts the service, waits for Clash API and DNS to answer, and rolls back to the previous version if a check fails or you don't confirm in the panel within a minute that the connection is still alive.

The package also ships its own sing-box service and LAN interception (nftables, tproxy, upstream for dnsmasq), so metabox can replace re:HomeProxy.

<img src="docs/screenshots/desktop/overview.png" alt="Overview" />

## Features

- Routing rules: search, add, delete, reorder; a form per rule for action, rule sets and common conditions, or the raw node as JSON
- Rule sets: attach remote and local sets, see which rules use each one
- Every config section in a form generated from the fork's schema; unknown fields are kept as is and marked in the UI
- The whole config as text, with a line-by-line diff before applying
- Apply with health checks and automatic rollback; version history with restore
- Connections: live list with filters, CSV and JSON export, and an explanation of which rule routed each connection
- Proxies: node groups with latency tests, subscription updates
- Devices from DHCP leases, with a per-device switch to route it through sing-box
- Overview: traffic, connections, top devices and nodes, router load, temperature and memory
- sing-box log and interception diagnostics
- Light and dark theme, English and Russian, desktop and phone layouts

## Preview

<details>
<summary><b>Desktop</b></summary>

|                                  Rules                                   |                                   Proxies                                    |
| :----------------------------------------------------------------------: | :--------------------------------------------------------------------------: |
| <img src="docs/screenshots/desktop/rules.png" alt="Rules" width="420" /> | <img src="docs/screenshots/desktop/proxies.png" alt="Proxies" width="420" /> |

|                                     Connections                                      |                                   Devices                                    |
| :----------------------------------------------------------------------------------: | :--------------------------------------------------------------------------: |
| <img src="docs/screenshots/desktop/connections.png" alt="Connections" width="420" /> | <img src="docs/screenshots/desktop/devices.png" alt="Devices" width="420" /> |

</details>

<details>
<summary><b>Mobile</b></summary>

|                                   Overview                                    |                                  Rules                                  |                                     Connections                                     |
| :---------------------------------------------------------------------------: | :---------------------------------------------------------------------: | :---------------------------------------------------------------------------------: |
| <img src="docs/screenshots/mobile/overview.png" alt="Overview" width="220" /> | <img src="docs/screenshots/mobile/rules.png" alt="Rules" width="220" /> | <img src="docs/screenshots/mobile/connections.png" alt="Connections" width="220" /> |

|                                   Proxies                                   |                                   Devices                                   |                                 Logs                                  |
| :-------------------------------------------------------------------------: | :-------------------------------------------------------------------------: | :-------------------------------------------------------------------: |
| <img src="docs/screenshots/mobile/proxies.png" alt="Proxies" width="220" /> | <img src="docs/screenshots/mobile/devices.png" alt="Devices" width="220" /> | <img src="docs/screenshots/mobile/logs.png" alt="Logs" width="220" /> |

</details>

## Requirements

- OpenWrt with the apk package manager: 25.12 or SNAPSHOT. 24.10 and older use opkg and are not supported.
- aarch64, tested on Banana Pi BPI-R4 Pro. The package architecture must match `/etc/apk/arch` on the router; for mediatek/filogic firmware it is `aarch64_cortex-a53`.
- The `sing-box-extended` package, a dependency of `metaboxd`. Tested version: `1.14.1-extended-2.7.2`. OpenWrt packages are in the [fork's releases](https://github.com/shtorm-7/sing-box-extended/releases).

| Port             | Listener                                                                    |
| ---------------- | --------------------------------------------------------------------------- |
| 8088             | the panel, on the addresses of networks from `listen_interface`             |
| 9090             | sing-box Clash API on `127.0.0.1`, when the daemon added `clash_api` itself |
| 5331, 5332, 5333 | sing-box inbounds for interception: TCP redirect, UDP tproxy, DNS           |

## Installation

Prebuilt packages are not published yet. To build the package from source and install it on the router, see [`docs/Development.md`](./docs/Development.md) (Russian).

The package depends on `sing-box-extended`, which brings its own `sing-box` service. Disable it: sing-box is started by the metabox service.

```sh
/etc/init.d/sing-box stop
/etc/init.d/sing-box disable
```

If homeproxy runs sing-box now, leave it as is: metabox interception is off by default and does not conflict with it.

Put a sing-box config at `/etc/sing-box/config.json`, then start the services. The package does not start them on install.

```sh
/etc/init.d/metabox-singbox enable
/etc/init.d/metabox-singbox start
/etc/init.d/metaboxd enable
/etc/init.d/metaboxd start
```

## First run

Open `http://<router LAN address>:8088`, for example `http://192.168.1.1:8088`. Use an IP address: the daemon only answers when the `Host` header is an IP or `localhost`, so `http://openwrt.lan:8088` will not open.

The daemon reads `/etc/sing-box/config.json` as is, there is no import step. A handwritten config opens in forms; whatever the forms don't know is kept unchanged and marked in the UI. If the config has no `experimental.clash_api`, the daemon adds it on the first apply (`127.0.0.1:9090`, random secret): the panel reads connections and proxies through it.

| What                   | Where                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Panel settings         | `/etc/config/metabox`                                              |
| sing-box config        | `/etc/sing-box/config.json`, set by `config_dir` and `config_name` |
| Config versions, state | `/etc/metabox/`                                                    |
| Logs                   | `logread`, or the Logs screen                                      |

### LAN interception

Interception is off by default: `option enabled '0'` in the `dataplane` section of `/etc/config/metabox`. Stop homeproxy first if you have it, otherwise two setups capture the same traffic.

The sing-box config needs inbounds on the ports from the `dataplane` section: `direct` on 5333 for DNS, `redirect` on 5331, `tproxy` on 5332 for UDP, and `route.default_mark` equal to `self_mark` (100).

> [!WARNING]
> Without an inbound on 5333 the whole network loses DNS: dnsmasq forwards queries there.

```sh
uci set metabox.dataplane.enabled='1'
uci commit metabox
/etc/init.d/metabox-singbox restart
```

With `acl_mode 'listed'` (default) only devices enabled on the Devices screen or listed in `source_ip` and `source_mac` go through sing-box. With `all`, every device on `br-lan` does.

## Security

> [!IMPORTANT]
> **There is no login yet.** Anyone who can open the panel controls routing for the whole network.

- The daemon listens only on the networks from `listen_interface` in `/etc/config/metabox`, `lan` by default, never on `0.0.0.0`. Add a guest network there only if you trust every device on it.
- Never expose port 8088 to WAN.
- A web page opened in your browser can send requests to LAN addresses. The daemon accepts a state-changing request only when its `Origin` header matches the panel's own address and rejects requests without `Origin`. The `Host` check on every request blocks DNS rebinding. No CORS headers are sent.
- The services don't start on package install, so the port stays closed until you start them.

## Update and removal

Install the new package the same way as the first one, then restart the services:

```sh
/etc/init.d/metabox-singbox restart
/etc/init.d/metaboxd restart
```

Your `/etc/config/metabox` is not overwritten on update: the packaged version lands next to it as `/etc/config/metabox.apk-new`. sysupgrade keeps `/etc/config/metabox` and `/etc/metabox/`.

```sh
/etc/init.d/metaboxd stop
/etc/init.d/metaboxd disable
/etc/init.d/metabox-singbox stop
/etc/init.d/metabox-singbox disable
apk del metaboxd
```

Stopping `metabox-singbox` removes interception: nftables rules, `ip rule` and the dnsmasq fragment. After removal sing-box is not running; enable the fork's service or homeproxy if you need it.

## Documentation

Project documentation is in Russian.

- [`docs/PRD.md`](./docs/PRD.md): requirements, acceptance criteria, milestones
- [`docs/adr/`](./docs/adr/README.md): architecture decisions
- [`apps/metaboxd/docs/guides/`](./apps/metaboxd/docs/guides/README.md): daemon guides (HTTP API, device I/O, errors and logs)
- [`apps/web/docs/`](./apps/web/docs/README.md): frontend guides
- [`docs/Development.md`](./docs/Development.md): build, test bench, commands
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): branches, commits, checks

## License

[GPL-3.0-or-later](./LICENSE). You may use, modify and distribute the code, including for money. Whoever distributes the program or a modified version passes it on under the same license, together with the source code.
