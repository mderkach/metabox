## MODIFIED Requirements

### Requirement: AC-10 Overview shows live traffic and a summary of the connection snapshot

Overview SHALL show up/down traffic in real time, counters, memory and service state. It also shows a summary of the live connection snapshot: the number of open connections, the top LAN devices by volume of their open connections and the top destinations that left by the default rule, each with its device. The summary is computed by the panel from the snapshot and marked as computed and as "open now" (UX-8): it has no history of its own and describes the snapshot, not a period. Volumes over a period are AC-97 and AC-101; latency of the servers in use is shown in the outbound rows of AC-98. Without live connections the summary cards say there are none. Traffic and board readings history — AC-37.

#### Scenario: Speed comes from the stream

- **GIVEN** a traffic sample in the runtime stream
- **WHEN** the overview opens
- **THEN** the download and upload rates show the sample, not a cumulative counter

#### Scenario: Connection count comes from the snapshot

- **GIVEN** a connection snapshot of seven connections
- **WHEN** the overview opens
- **THEN** it shows seven connections

#### Scenario: The snapshot summary

- **GIVEN** a live connection snapshot with connections from three devices, some of them matched by the default rule
- **WHEN** the overview opens
- **THEN** the summary shows the devices by the volume of their open connections and the destinations of the default rule by volume, marked as open now

#### Scenario: The summary and the list read one snapshot

- **GIVEN** a connection snapshot shown in the connection list
- **WHEN** the summary is computed
- **THEN** it is computed from the same snapshot as the connection list

#### Scenario: Latency of the selected nodes

- **GIVEN** groups with selected servers that carry rules
- **WHEN** the overview opens
- **THEN** the latency of each server in use is shown in the row of its outbound, not in a card of its own

#### Scenario: The summary without data

- **GIVEN** no live connections
- **WHEN** the overview opens
- **THEN** the device and default-rule cards say there are no open connections, and no skeleton stays on screen

### Requirement: AC-35 Overview shows device readings

Overview SHALL show device readings: load and number of cores, board temperature, used memory out of total, outward interface speed, resident memory and pid of the sing-box process, daemon memory and goroutines, router uptime, the core type and version, and the interception mode (all devices or selected devices). The share of traffic that went through a proxy is part of the traffic shares of AC-97, not of the readings. The daemon reads them from procfs and sysfs and returns them as a topic of the single stream; a missing individual source — thermal zone, default route, process — blanks its own field, not the whole topic.

#### Scenario: The daemon reads the readings from procfs and sysfs

- **GIVEN** a procfs and sysfs tree with load, memory, uptime, a thermal zone, a default route and a sing-box process
- **WHEN** the daemon reads the device
- **THEN** it returns load and cores, memory, uptime, the board temperature, the outward interface, the pid and resident memory of sing-box, and the daemon memory and goroutines

#### Scenario: A missing source blanks only its field

- **GIVEN** a tree without thermal zones and without a sing-box process
- **WHEN** the daemon reads the device
- **THEN** memory and the outward interface are still returned, and only the temperature and the process are empty

#### Scenario: The panel shows the readings as a section

- **GIVEN** a device readings topic with a temperature and a load
- **WHEN** the overview opens
- **THEN** the device readings section shows the temperature and the load

#### Scenario: The readings name the core and the interception mode

- **GIVEN** a running core and interception of selected devices only
- **WHEN** the overview opens
- **THEN** the "Router and metabox" block shows the core type and version and says that selected devices are intercepted

## ADDED Requirements

### Requirement: AC-95 Overview states the core once, in its header

Overview SHALL show one core status in its header, with the states specified below. An in-use server without a measurement counts as needs attention. The header holds no commands. Core commands stay in the service card and the panel restart in the daemon card (AC-87). The core restart asks for confirmation and explains the possible interruption of connections through the core. No card repeats the status. The core version is in the sidebar footer.

#### Scenario: One status in the header

- **GIVEN** a running core and no problem
- **WHEN** the overview opens
- **THEN** the header says the core works, and no card shows a status dot

#### Scenario: Needs attention outranks works

- **GIVEN** a running core and a group none of whose servers answer
- **WHEN** the overview opens
- **THEN** the header says needs attention

#### Scenario: A server in use that was never checked needs attention

- **GIVEN** a running core and a manual-choice group whose server in use has no latency result
- **WHEN** the overview opens
- **THEN** the header says needs attention

#### Scenario: The core is starting

- **GIVEN** a core that started and has sent no data yet
- **WHEN** the overview opens before the data timeout
- **THEN** the header says it is waiting for the first data from the core

#### Scenario: A silent core is not a lost daemon

- **GIVEN** Overview with live streams
- **WHEN** only the traffic stream stalls, or both the traffic and the device streams stall
- **THEN** the first case says the core sends no data, the second says there is no link to the daemon

#### Scenario: A lost daemon is not a stopped core

- **GIVEN** a daemon that stopped answering
- **WHEN** the panel polls it
- **THEN** the header says there is no link to the daemon, not that the core stopped

#### Scenario: A core outside the managed service

- **GIVEN** a running core started outside the managed service
- **WHEN** the overview opens
- **THEN** the header says the core works and was started outside metabox, and the core service card offers no command

#### Scenario: The core commands stay in the service card

- **GIVEN** a running core
- **WHEN** the overview opens
- **THEN** the header holds no core command, "Restart" and "Stop" are in the core service card, and the panel restart is in the panel daemon card

#### Scenario: Restart warns about interrupted connections

- **GIVEN** a running managed core on Overview
- **WHEN** the user activates "Restart" in the core service card
- **THEN** the confirmation explains that connections through the core may be interrupted

#### Scenario: The recovery action is the only primary button

- **GIVEN** a crashed core
- **WHEN** the overview opens
- **THEN** Overview has one primary action: restore and start when a prior version can be restored, or Start in the service card otherwise

#### Scenario: The core version is in view on every screen

- **GIVEN** any screen of the panel
- **WHEN** it is shown on a desktop width
- **THEN** the sidebar footer shows a "core ‹version›" line next to the daemon version, with the full version string of the binary

#### Scenario: A core older than the forms on a phone

- **GIVEN** a phone width, where the sidebar footer is inside "More", and a core older than the schema of the forms
- **WHEN** any screen is shown
- **THEN** the "More" button carries an amber dot, and its accessible name says the core is older than the forms

### Requirement: AC-96 Needs attention lists only problems, each with one action

A "Needs attention" block SHALL appear on Overview only when there is a problem, one item per problem. An item names the servers (at most four, then "and N more") and the rules it affects. It ends with one main action that depends on the cause. A server in use that no check has measured is an item whose action checks it. A dropped subscription cache (AC-92) is an item that names the subscription and the reason, kept until the user dismisses it.

#### Scenario: No problem, no block

- **GIVEN** every server in use answers within its norm
- **WHEN** the overview opens
- **THEN** there is no "Needs attention" block

#### Scenario: A manual-choice group with no live server

- **GIVEN** a manual-choice group whose servers do not answer and that eight rules lead to
- **WHEN** the overview opens
- **THEN** the item names the servers, says the group does not switch by itself and the eight rules do not work, and its main action switches the group to another outbound

#### Scenario: A group that picks by latency stayed on a slow server

- **GIVEN** a group that picks by latency, whose current server is above its norm while the others are not faster by the group's tolerance
- **WHEN** the overview opens
- **THEN** the item says the group did not switch because of its tolerance, and its main action checks the other servers of the group

#### Scenario: A server in use that was never checked

- **GIVEN** a manual-choice group whose server in use has no latency result, because the core checks only groups that pick by latency and subscription servers
- **WHEN** the overview opens
- **THEN** the item names the server, shows "No measurement", and its main action checks it

#### Scenario: More than four servers

- **GIVEN** a problem with six servers
- **WHEN** the item is shown
- **THEN** it names four of them and says "and 2 more"

#### Scenario: A dropped subscription cache is reported

- **GIVEN** the daemon dropped the cache entry of a subscription that crashed the core
- **WHEN** the overview opens
- **THEN** the item names the subscription and the reason the core gave, even though the core was started again by the recovery

#### Scenario: A dismissed recovery notice stays dismissed

- **GIVEN** a recovery item the user dismissed
- **WHEN** the overview is opened again or in another browser
- **THEN** the item is not shown

#### Scenario: A recovery notice survives a daemon restart

- **GIVEN** a recovery item the user has not dismissed
- **WHEN** the daemon restarts
- **THEN** the item is still shown

### Requirement: AC-97 Overview shows traffic shares over the daemon uptime

Overview SHALL show proxy and direct shares since daemon start, with volume, percentage and the interface name. Direct combines traffic sent directly by rules and estimated traffic past the core, clamped to zero. It carries a computed mark. The daemon splits core traffic by outbound kind. The separate blocked count is computed from the core log or unavailable when the needed lines are hidden. AC-89 is folded into this requirement.

#### Scenario: Two shares and the blocked connections

- **GIVEN** a daemon that has run for twelve hours with consistent internet-interface and core counters that include proxied, direct, blocked and uncaptured traffic
- **WHEN** the overview opens
- **THEN** the two shares cover the twelve hours, add up to the internet connection volume and name the interface, and the number of blocked connections is shown apart

#### Scenario: One period reconciles internet shares and outbound rows

- **GIVEN** 100 MiB on the WAN interface for the period, 30 MiB through a proxy outbound and 20 MiB through a direct outbound
- **WHEN** Overview shows both summaries for that period
- **THEN** the internet shares show 30 MiB (30%) through a proxy and 70 MiB (70%) direct
- **AND** the outbound rows show 30 MiB and 20 MiB, with the remaining 50 MiB estimated as traffic past the core

#### Scenario: The daemon splits the core traffic by outbound kind

- **GIVEN** connections through a proxy, direct and to a `block` outbound, some of them opened and closed between two snapshots
- **WHEN** the daemon accumulates the volume
- **THEN** it keeps the proxy, direct and blocked volumes apart, and their sum equals the core volume of the period

#### Scenario: Blocked connections are counted from the core log

- **GIVEN** a core log level of `debug` and core log lines for connections closed by a `reject` rule and for connections to a `block` outbound
- **WHEN** the daemon reads the lines
- **THEN** it counts each line as one blocked connection, keeps the count with the AC-37 history, and Overview shows it marked as computed from the log

#### Scenario: A partial count is not shown

- **GIVEN** a config with `reject` rules and a `block` outbound, and `log.level` `info`, which shows the lines of the `block` outbound only
- **WHEN** the overview opens
- **THEN** the blocked figure says it is unavailable, not a count of the `block` lines alone

#### Scenario: A log level change cannot recover earlier blocked connections

- **GIVEN** a needed log line was hidden earlier in this daemon uptime
- **WHEN** the running config starts logging every needed line
- **THEN** the daemon still reports the uptime count as unavailable until the daemon restarts

#### Scenario: A log level that hides the lines

- **GIVEN** a running config whose `log.level` is above the level of those lines, or whose log is disabled
- **WHEN** the overview opens
- **THEN** the blocked figure says it is unavailable, and its help names the `log.level` it needs and says that the level is changed in the config

#### Scenario: The count survives a core restart

- **GIVEN** a blocked count and a core that restarts
- **WHEN** the daemon reads the log of the new core process
- **THEN** the count goes on from where it was, and no line is counted twice

#### Scenario: Direct traffic is outside the proxy share

- **GIVEN** traffic that a rule sent direct
- **WHEN** the shares are counted
- **THEN** it counts toward Direct

#### Scenario: The shares survive a reload

- **GIVEN** accumulated shares
- **WHEN** the page is reloaded
- **THEN** the same shares are shown, not ones counted from the reload

#### Scenario: Direct includes traffic that bypasses the core

- **GIVEN** direct traffic seen by the core and traffic past the core
- **WHEN** the shares are shown
- **THEN** Direct includes both, carries a computed mark, and explains why the direct outbound row can show less

#### Scenario: Past the core never goes below zero

- **GIVEN** a core volume larger than the interface volume over the period
- **WHEN** the shares are computed
- **THEN** traffic past the core contributes zero and the two shares use their sum as the denominator

#### Scenario: The shares on a phone

- **GIVEN** a width of 375 px in English and in Russian
- **WHEN** the overview opens
- **THEN** the two shares stand in one column with their values on one baseline, and the blocked connections are under them

#### Scenario: The internet connection term has help

- **GIVEN** the shares heading
- **WHEN** the user opens its toggletip from the keyboard
- **THEN** it explains what an internet connection is, and Escape closes it

### Requirement: AC-98 Overview lists outbounds with their rules

Overview SHALL list one row per outbound that `route.rules` lead to, plus "everything else" for `route.final`: rows with traffic by volume over the period, then "everything else", then rows without traffic. A row shows its rules by name or content label (AC-86) and "N rules"; on separate lines with no arrows, the kind, how a group chooses, the nested group chosen and the server in use; then latency against the norm (AC-102), rate, connections, volume.

#### Scenario: Several outbounds are several rows

- **GIVEN** a config whose rules lead to a manual-choice group, a group that picks by latency and `direct`
- **WHEN** the overview opens
- **THEN** there are three rows and an "everything else" row, each with its rules and its count

#### Scenario: A nested choice is shown as lines, not a chain

- **GIVEN** a manual-choice group whose chosen outbound is a group that picks by latency
- **WHEN** its row is shown
- **THEN** separate lines say "group, manual choice", "chose group ‹name›, picks by latency" and "server in use ‹name›", with no arrow between them

#### Scenario: A rule is called by its name

- **GIVEN** a rule with a name and a rule without one
- **WHEN** their outbound row is shown
- **THEN** the first is called by its name and the second by its content label

#### Scenario: An outbound with rules but no traffic

- **GIVEN** an outbound that rules lead to and that carried nothing in the period
- **WHEN** the overview opens
- **THEN** its row says there is no traffic and sits below the rows with traffic

#### Scenario: A row on a phone

- **GIVEN** a width of 375 px
- **WHEN** the overview opens
- **THEN** each row stacks its lines without horizontal scrolling of the page

### Requirement: AC-99 Every name on Overview leads to where it is configured

On Overview, "N rules" SHALL open the rules list filtered by that outbound (AC-38). A service name opens the rule sets screen with its set expanded, an outbound or server name opens Proxies with it highlighted, and a device label opens its row in Devices. A link names its target for assistive technology.

#### Scenario: N rules opens the filtered list

- **GIVEN** an outbound row with eight rules
- **WHEN** the user follows "8 rules"
- **THEN** the rules list opens with the outbound facet set to that outbound and shows eight rules

#### Scenario: A server opens Proxies

- **GIVEN** an outbound row with a server in use
- **WHEN** the user follows the server name
- **THEN** Proxies opens with that server highlighted

#### Scenario: A device opens its row

- **GIVEN** a device label in the summary
- **WHEN** the user follows it
- **THEN** Devices opens with that device's row focused

#### Scenario: A service opens its rule set

- **GIVEN** a rule label that names a service
- **WHEN** the user follows it
- **THEN** the rule sets screen opens with the row of that set expanded

### Requirement: AC-100 A stopped core is a state of Overview, not a wait

With the core stopped or crashed, Overview SHALL show the reason, the last config version on which it ran, and the effect supported by the observed traffic and DNS interception state (AC-52). It offers to restore and start a different recoverable version. Otherwise Start lives in the service card. Error text is folded and shown as received. Blocks that need live core data say it is unavailable. Period totals stay as history and daemon readings keep updating.

#### Scenario: A crash after a config change offers the last working version

- **GIVEN** a crashed core and a current config version newer than the last one the core ran on
- **WHEN** the overview opens
- **THEN** the primary action restores that version and starts the core, the service card offers "Start current version" as secondary, and the error text is folded

#### Scenario: A crash on the version that ran offers a start

- **GIVEN** a crashed core whose current config version is the last one it ran on
- **WHEN** the overview opens
- **THEN** the service card offers the only Start button, and the recovery block links to the core log

#### Scenario: A crash leaves interception installed

- **GIVEN** the core has crashed and traffic and DNS interception are observed to remain installed
- **WHEN** Overview opens
- **THEN** it warns that external access and DNS may be unavailable for intercepted devices

#### Scenario: An explicit Stop removes interception

- **GIVEN** the user stopped the core and removal of traffic and DNS interception is confirmed
- **WHEN** Overview opens
- **THEN** it says the routing rules do not apply and devices may connect directly

#### Scenario: Interception removal is unconfirmed

- **GIVEN** the core is stopped and the state of traffic or DNS interception is unknown
- **WHEN** Overview opens
- **THEN** it reports the stopped core and inactive rules without making a claim about external access or DNS

#### Scenario: Blocks without data say so

- **GIVEN** a stopped core
- **WHEN** the overview opens
- **THEN** the outbound rows and the open-connection cards say there is no data because the core is stopped, the shares and the chart over the period stay, and the daemon readings update

#### Scenario: A rollback that could not bring the core up

- **GIVEN** a transaction closed as `rollback_failed`
- **WHEN** the overview opens
- **THEN** the block shows the transaction reason as the reason

### Requirement: AC-101 The daemon accumulates traffic per outbound

The daemon SHALL accumulate bytes since its start for each outbound a rule led to and each server traffic left through. It tracks default-rule traffic separately. It spreads bytes unseen in the connection poll by weight as in AC-97. The AC-37 history carries volumes and rates, marked as computed when they include spread bytes. At a config change, tags absent from both the running config and runtime list leave the per-tag totals. Their bytes stay in the totals by kind.

#### Scenario: Two outbounds are counted apart

- **GIVEN** the period in AC-97's "One period reconciles internet shares and outbound rows" scenario
- **WHEN** the daemon reads its per-outbound and per-kind volumes
- **THEN** the proxy and direct outbound counters are 30 MiB and 20 MiB respectively and sum to the 50 MiB of core traffic in the kind split

#### Scenario: A removed outbound leaves the rows and keeps its bytes in the kind split

- **GIVEN** the same period and counters, followed by a config change at which the proxy outbound is absent from both the running config and the runtime list
- **WHEN** Overview shows the retained period totals
- **THEN** the remaining direct row still shows 20 MiB and the removed outbound has no row
- **AND** the per-kind counters retain 30 MiB proxy and 20 MiB direct, so the internet shares stay at 30 MiB proxy and 70 MiB direct

#### Scenario: The rule's outbound, not the last hop, is the key

- **GIVEN** a connection whose chain is a manual-choice group, a nested group and a server
- **WHEN** it is counted
- **THEN** its bytes go to the manual-choice group as the outbound and to the server as the server

#### Scenario: The default rule is counted apart

- **GIVEN** connections to `direct` matched by a rule and connections to `direct` matched by the default rule
- **WHEN** they are counted
- **THEN** the two volumes are kept apart, and Overview shows them in the `direct` row and in the "everything else" row

#### Scenario: A daemon restart resets the volumes

- **GIVEN** accumulated volumes
- **WHEN** the daemon restarts
- **THEN** the volumes start from zero, like the rest of the history

#### Scenario: Memory stays bounded

- **GIVEN** a config with many subscription servers and 5000 connections
- **WHEN** the daemon accumulates volumes
- **THEN** it keeps at most one entry per outbound and server of the running config
