<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/banner-dark.webp" />
  <img src="docs/readme/banner-light.webp" alt="metabox" width="100%" />
</picture>

**See what your router does with traffic — and change it**

Edit the config in forms, apply it with automatic rollback, see where every connection goes.

[![license](https://img.shields.io/badge/license-GPL--3.0--or--later-blue?style=flat-square)](./LICENSE)
![release](https://img.shields.io/github/v/release/mderkach/metabox?include_prereleases&style=flat-square)
![OpenWrt](https://img.shields.io/badge/OpenWrt-25.12%20%7C%20SNAPSHOT-00B5E2?style=flat-square)
![arch](https://img.shields.io/badge/arch-aarch64-lightgrey?style=flat-square)

**English** · [Русский](./README.ru.md)

</div>

---

metabox is a web panel for sing-box on an OpenWrt router. It is for router owners who route traffic through sing-box and want to manage it in a browser instead of editing JSON by hand over SSH.

A hand-edited config breaks easily: one wrong field, and the router loses internet until you fix it from a terminal. metabox shows the config as forms and checks every value before saving. Apply restarts sing-box, checks that it works, and rolls back to the previous version if a check fails. It also rolls back if you do not confirm in the panel within a minute that the connection is still alive.

metabox installs on the router as one apk package. It contains the `metaboxd` daemon with the built-in panel, the service that runs sing-box, and optional interception of LAN traffic.

**Status:** pre-release. Tested only on a Banana Pi BPI-R4 Pro (aarch64).

<img src="docs/screenshots/desktop/overview.png" alt="Overview" />

## Features

- Routing rules: search, add, delete, reorder; a form for each rule or the raw rule as JSON
- Rule sets: attach remote and local sets, see which rules use each one
- Every config section as a form generated from the sing-box-extended schema; unknown fields are kept and marked
- The whole config as text, with a line-by-line diff before applying
- Apply with health checks and automatic rollback; version history with restore
- Connections: live list with filters, CSV and JSON export, and which rule routed each connection
- Proxies: node groups with latency tests, subscription updates
- Devices from DHCP leases, with a per-device switch to route it through sing-box
- Overview: traffic, connections, top devices and nodes, router load, temperature and memory
- sing-box log and interception diagnostics
- Read-only MCP endpoint for AI agents such as Claude Code
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

- OpenWrt 25.12 or SNAPSHOT. These versions use the apk package manager. OpenWrt 24.10 and older use opkg and are not supported.
- An aarch64 router. Packages are built for `aarch64_cortex-a53`, the architecture of mediatek/filogic firmware. Check yours with `cat /etc/apk/arch`.
- The `sing-box-extended` package. `metaboxd` depends on it, and the install script installs it. Tested version: `1.14.1-extended-2.7.2`.

## Install

1. On the router, as root, run the install script:

   ```sh
   wget -qO- https://mderkach.github.io/metabox/install.sh | sh
   ```

2. Put your sing-box config at `/etc/sing-box/config.json` (see [below](#where-do-i-get-a-sing-box-config)) and start the services. The package does not start them on install.

   ```sh
   /etc/init.d/metabox-singbox enable
   /etc/init.d/metabox-singbox start
   /etc/init.d/metaboxd enable
   /etc/init.d/metaboxd start
   ```

3. Open `http://<router IP>:8088`, for example `http://192.168.1.1:8088`, and set a password with **Set password** at the bottom of the sidebar. Use the IP address, not a name like `openwrt.lan`: the panel only answers requests addressed to an IP, as a protection against DNS rebinding (an attack that points a foreign domain at the router address).

> [!WARNING]
> Without a password the panel is open to every device on the router's local networks, and any of them can change routing. A forgotten password is reset over SSH: `rm /etc/metabox/auth.json && /etc/init.d/metaboxd restart`.

The install script ([`install.sh`](./install.sh)) does the following:

- asks the language of the daemon's messages: help, service messages, API errors, MCP. `--lang en|ru` answers in advance. The panel language is chosen in the panel;
- checks that the router runs OpenWrt with apk on `aarch64_cortex-a53`;
- adds the project signing key and the package repository;
- installs `sing-box-extended` if it is missing, and checks its sha256 against the value in the script;
- runs `apk add metaboxd` and saves the language to UCI `metabox.main.lang`.

Until there is a stable release, packages are in the `testing` channel. The script connects the `stable` channel with a flag: `wget -qO- https://mderkach.github.io/metabox/install.sh | sh -s -- --channel stable`.

## Where do I get a sing-box config

metabox does not create a config, and the package does not include one. Bring your own: from your proxy provider, or written by hand. Without `/etc/sing-box/config.json` the `metabox-singbox` service does not start, and the panel reports that there is no config on the device.

The daemon reads the file as is; there is no import step. Whatever the forms do not know is kept unchanged and marked in the panel. If the config has no `experimental.clash_api` section, the daemon adds one on the first apply (`127.0.0.1:9090`, random secret). The panel reads connections and proxies through it.

## More

<details>
<summary><b>Manual install</b></summary>

`sing-box-extended` is not in the metabox repository. Install it first: OpenWrt packages are on its [releases page](https://github.com/shtorm-7/sing-box-extended/releases).

Then add the key and the repository, and install the package:

```sh
wget -O /etc/apk/keys/metabox-release.pem https://raw.githubusercontent.com/mderkach/metabox/main/keys/metabox-release.pem
echo https://mderkach.github.io/metabox/apk/testing/packages.adb > /etc/apk/repositories.d/metabox.list
apk update
apk add metaboxd
```

The repository index is signed with the same key. The `testing` channel has every release. The `stable` channel has only releases without a pre-release suffix, so it is empty until the first such release.

The `sing-box-extended` package has its own `sing-box` service. metabox starts sing-box through `metabox-singbox`, so the `sing-box` service must stay off. The install script turns it off (for a fork that was already installed it asks first, and without a terminal it only prints the commands); after a manual install, do it yourself:

```sh
/etc/init.d/sing-box stop
/etc/init.d/sing-box disable
```

Then continue from step 2 of the install.

Building the package from source: [`docs/Development.md`](./docs/Development.md#package-for-the-router).

</details>

<details>
<summary><b>HTTPS</b></summary>

By default the panel uses plain http, like LuCI. The password, the session and the MCP token cross the LAN unencrypted.

To switch to HTTPS, set `option https '1'` in `/etc/config/metabox` and restart `metaboxd`. The daemon creates its own root certificate and issues the panel certificate from it. Plain http on the same port redirects to HTTPS. The root can only sign certificates for private networks and the panel addresses, not for public sites.

The browser warns until the root is installed on each device:

1. Download it from `http://192.168.1.1:8088/metabox-ca.crt`.
2. Compare its fingerprint with the `ca_sha256` line in `logread -e metaboxd`.
3. Add it to the system or browser trust store. On a phone, open the address and install the profile.

If the router already has a certificate, for example one from `acme.sh` for LuCI, the panel can use it instead. Set `https_cert` and `https_key` in the same section to the PEM files and restart `metaboxd`. Restart it again after each renewal.

</details>

> [!WARNING]
> If you turn on LAN interception, the sing-box config must have a DNS inbound on port 5333. Without it the whole network loses DNS: dnsmasq forwards queries there.

<details>
<summary><b>LAN traffic interception</b></summary>

Interception sends traffic of LAN devices through sing-box without configuring each device. It uses nftables rules, tproxy for UDP, and sing-box as the upstream DNS server for dnsmasq.

It is off by default: `option enabled '0'` in the `dataplane` section of `/etc/config/metabox`. If another service already intercepts LAN traffic, stop it first. Otherwise both will capture the same traffic.

The sing-box config needs these inbounds on the ports from the `dataplane` section:

- `direct` on 5333 for DNS;
- `redirect` on 5331 for TCP;
- `tproxy` on 5332 for UDP;
- and `route.default_mark` equal to `self_mark` (100).

Turn it on:

```sh
uci set metabox.dataplane.enabled='1'
uci commit metabox
/etc/init.d/metabox-singbox restart
```

With `acl_mode 'listed'` (the default), only some devices go through sing-box: those enabled on the Devices screen, or listed in `source_ip` and `source_mac`. With `acl_mode 'all'`, every device on `br-lan` does.

</details>

<details>
<summary><b>AI agents over MCP</b></summary>

[MCP](https://modelcontextprotocol.io) (Model Context Protocol) lets an AI agent call tools on the router. The daemon serves it at `/mcp`; it is off by default.

Turn it on with **MCP access** at the bottom of the sidebar. The panel shows a token once, together with the command for Claude Code:

```sh
claude mcp add --transport http metabox http://192.168.1.1:8088/mcp --header "Authorization: Bearer <token>"
```

The agent can then answer questions like these:

- why a site goes through a given rule;
- which connections a device has;
- which nodes respond;
- what earlier config versions contained;
- what the sing-box log and interception diagnostics say;
- what a config field means: its type, allowed values and which node types have it.

Access is read-only: no tool changes the config or the services. Secrets in config fragments are masked. The sing-box log is returned as is.

The token is separate from the panel password and does not open the panel. A new token replaces the old one. **Disable** in the same dialog turns MCP off. Over SSH: `rm /etc/metabox/mcp.json && /etc/init.d/metaboxd restart`.

With HTTPS on, the command uses `https://`, and the client must trust the panel certificate. Claude Code rejects the daemon's own root with `unsupported name constraint type`. Your own certificate through `https_cert` and `https_key` avoids this.

</details>

<details>
<summary><b>Update and removal</b></summary>

Update:

```sh
apk update && apk upgrade metaboxd
```

The package restarts the daemon if it was running. sing-box keeps running, so the update does not cut traffic. The new version of the sing-box service takes effect after `/etc/init.d/metabox-singbox restart`; run it when a short traffic break is acceptable.

A package installed from a file (`apk add /tmp/metaboxd-<version>.apk`) is pinned to that file in `/etc/apk/world`, as `metaboxd><Q1…`. `apk upgrade metaboxd` does not update such a package, and `apk add -u metaboxd` also pulls in system upgrades. To switch back to the repository:

```sh
apk add metaboxd=<version>
apk add metaboxd
```

Updates do not overwrite your `/etc/config/metabox`: the new default lands next to it as `/etc/config/metabox.apk-new`. sysupgrade keeps `/etc/config/metabox` and `/etc/metabox/`.

Removal:

```sh
/etc/init.d/metaboxd stop
/etc/init.d/metaboxd disable
/etc/init.d/metabox-singbox stop
/etc/init.d/metabox-singbox disable
apk del metaboxd
```

Stopping `metabox-singbox` removes interception: the nftables rules, the `ip rule` and the dnsmasq settings. After removal sing-box is not running, and LAN traffic goes out directly. The `sing-box-extended` package stays installed; remove it with `apk del sing-box-extended` if you do not need it.

</details>

<details>
<summary><b>File locations</b></summary>

| What                   | Where                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Panel settings         | `/etc/config/metabox`                                                              |
| sing-box config        | `/etc/sing-box/config.json`; set by `config_dir` and `config_name`                 |
| Config versions, state | `/etc/metabox/`                                                                    |
| Certificates           | `/etc/metabox/tls/`; delete the directory and restart `metaboxd` to get a new root |
| Logs                   | `logread`, or the Logs screen                                                      |

</details>

<details>
<summary><b>Ports</b></summary>

| Port             | What listens                                                                           |
| ---------------- | -------------------------------------------------------------------------------------- |
| 8088             | the panel, on the addresses of the networks from `listen_interface` (by default `lan`) |
| 9090             | sing-box Clash API on `127.0.0.1`, when the daemon added the `clash_api` section       |
| 5331, 5332, 5333 | sing-box inbounds for interception: TCP redirect, UDP tproxy, DNS                      |

</details>

## Documentation

- [`docs/PRD.md`](./docs/PRD.md): requirements and milestones
- [`docs/adr/`](./docs/adr/README.md): architecture decisions
- [`docs/Development.md`](./docs/Development.md): build from source, test bench, commands
- [`CONTRIBUTING.md`](./CONTRIBUTING.md): how to send a change
- [`apps/metaboxd/docs/guides/`](./apps/metaboxd/docs/guides/README.md): daemon guides
- [`apps/web/docs/`](./apps/web/docs/README.md): frontend guides
