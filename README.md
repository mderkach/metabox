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
- MCP endpoint for AI agents such as Claude Code: they read the router state through typed tools, read-only, behind a separate token
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

| Port             | Listener                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| 8088             | the panel over http, on the addresses of networks from `listen_interface`; over HTTPS with `option https '1'` |
| 9090             | sing-box Clash API on `127.0.0.1`, when the daemon added `clash_api` itself                                   |
| 5331, 5332, 5333 | sing-box inbounds for interception: TCP redirect, UDP tproxy, DNS                                             |

## Installation

Releases are published as a signed apk repository. On the router, as root:

```sh
wget -qO- https://mderkach.github.io/metabox/install.sh | sh
```

The script ([`install.sh`](./install.sh)) checks that the router runs OpenWrt with apk on `aarch64_cortex-a53`, puts the project key and the feed line, installs `sing-box-extended` from the [fork release](https://github.com/shtorm-7/sing-box-extended/releases) if it is missing, checking the package against a sha256 pinned in the script, and runs `apk add metaboxd`. Until the first version without a pre-release suffix the packages are in the `testing` channel; `sh -s -- --channel stable` connects `stable`. The script asks for the language of the texts the daemon shows the operator (help, init-script messages, API details, MCP) and writes it to UCI `metabox.main.lang`; `--lang en|ru` answers in advance. The panel language is chosen in the panel. Updates are `apk update && apk upgrade metaboxd`. Building the package from source and installing a single file are in [`docs/Development.md`](./docs/Development.md).

By hand, the same is: the key, the feed, then the package. `sing-box-extended` has to be installed first: it is not in the repository.

```sh
wget -O /etc/apk/keys/metabox-release.pem https://raw.githubusercontent.com/mderkach/metabox/main/keys/metabox-release.pem
echo https://mderkach.github.io/metabox/apk/testing/packages.adb > /etc/apk/repositories.d/metabox.list
apk update
apk add metaboxd
```

`sing-box-extended` brings its own `sing-box` service. The script disables it when it installs the fork; after a manual install, disable it yourself: sing-box is started by the metabox service.

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

The panel is served over plain http, like LuCI: the password, the session and the MCP token cross the LAN in clear text. `option https '1'` in `/etc/config/metabox` and a restart of `metaboxd` serve it over HTTPS with a certificate from a root the daemon issues, and plain http on the same port is redirected. The browser then warns until that root is installed on every device: download it from `http://192.168.1.1:8088/metabox-ca.crt`, compare its fingerprint with the `ca_sha256` line in `logread -e metaboxd` and add it to the system or browser trust store; on a phone, open the address and install the profile. The root is limited to private networks and the panel addresses: it cannot sign a certificate for a public site. A certificate the router already has, for example one `acme.sh` issues for LuCI, is served instead of the daemon's own: set `https_cert` and `https_key` in the same section to the PEM files and restart `metaboxd`; after a renewal, restart it again.

> [!WARNING]
> Without a password the panel is open to every device on the networks from `listen_interface`, and any of them can change routing. Set one with **Set password** at the bottom of the sidebar. A forgotten password is reset over SSH: `rm /etc/metabox/auth.json && /etc/init.d/metaboxd restart`.

The daemon reads `/etc/sing-box/config.json` as is, there is no import step. A handwritten config opens in forms; whatever the forms don't know is kept unchanged and marked in the UI. If the config has no `experimental.clash_api`, the daemon adds it on the first apply (`127.0.0.1:9090`, random secret): the panel reads connections and proxies through it.

| What                   | Where                                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| Panel settings         | `/etc/config/metabox`                                                           |
| sing-box config        | `/etc/sing-box/config.json`, set by `config_dir` and `config_name`              |
| Config versions, state | `/etc/metabox/`                                                                 |
| Certificates           | `/etc/metabox/tls/`; remove the directory and restart `metaboxd` for a new root |
| Logs                   | `logread`, or the Logs screen                                                   |

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

### AI agents over MCP

The daemon serves an [MCP](https://modelcontextprotocol.io) endpoint at `/mcp`, off by default. Turn it on with **MCP access** at the bottom of the sidebar: the panel shows a token once, together with the command for Claude Code:

```sh
claude mcp add --transport http metabox http://192.168.1.1:8088/mcp --header "Authorization: Bearer <token>"
```

With HTTPS on, the command carries `https://`, and the client has to trust the panel certificate. Claude Code rejects the daemon's own root with `unsupported name constraint type`; a certificate pair of your own through `https_cert` and `https_key` avoids that.

The agent can then ask why a site goes through a given rule, which connections a device has, which nodes respond, what earlier config versions contained, and what the sing-box log and interception diagnostics say. It can also look up any config field: its type, allowed values and which node types have it, from the same fork schema the panel uses. Access is read-only: there are no tools that change the config or the service. Secrets in config fragments are masked; the sing-box log tail is returned as is.

The token does not depend on the panel password and does not open the panel. A new token makes the old one stop working; **Disable** in the same dialog turns MCP off. Over SSH: `rm /etc/metabox/mcp.json && /etc/init.d/metaboxd restart`.

## Update and removal

Install the new package the same way as the first one, then restart the services:

```sh
/etc/init.d/metabox-singbox restart
/etc/init.d/metaboxd restart
```

A package installed from a file (`apk add /tmp/metaboxd-<version>.apk`) is recorded in `/etc/apk/world` pinned to its hash, `metaboxd><Q1…`. `apk upgrade metaboxd` does not update such an entry, and `apk add -u metaboxd` pulls system dependency upgrades in with it. To get back to the repository, run `apk add metaboxd=<version>` and then `apk add metaboxd`: the entry becomes a plain name and `apk upgrade metaboxd` works again.

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

- [`docs/PRD.md`](./docs/PRD.md): requirements, acceptance criteria, milestones
- [`docs/adr/`](./docs/adr/README.md): architecture decisions
- [`apps/metaboxd/docs/guides/`](./apps/metaboxd/docs/guides/README.md): daemon guides (HTTP API, device I/O, errors and logs)
- [`apps/web/docs/`](./apps/web/docs/README.md): frontend guides
- [`docs/Development.md`](./docs/Development.md): build, test bench, commands
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): branches, commits, checks
