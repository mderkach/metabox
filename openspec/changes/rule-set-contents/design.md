## Context

See proposal.md, "Why". How the daemon reads the record of a cached set, the RAM cost of the copy and why the list itself is not read are decided in [ADR-0091](../../../docs/adr/ADR-0091-read-rule-set-check-times-from-a-checked-copy-of-the-cache-file.md); this document does not repeat its comparison.

What the project has today:

- `internal/cachefile` opens the cache file with `go.etcd.io/bbolt` only with the core stopped and deletes one key ([ADR-0088](../../../docs/adr/ADR-0088-repair-the-sing-box-cache-file-in-the-daemon-with-bbolt.md)). Its fault recovery (`debug.SetPanicOnFault` and a length check) protects the daemon from a broken file.
- `internal/clashapi.ReadCacheFile` reads `experimental.cache_file` (enabled, path, `cache_id`) from the config bytes; `apply.Manager.cachePath` resolves a relative path against the working directory of the service.
- `GET /api/config/rule-sets` returns the own list files and their `stats` (size, modification time) since #309; the rule sets table shows a dash for every other set.
- The panel already knows the source of a remote set: `describeURL` in `entities/RuleSet` matches the address against the catalog and gives the provider name, the list kind (`geosite` or `geoip`) and the category. The catalog of the daemon (`internal/ruleset`) carries provider names and category names only; there is no human description of a category.
- `countRuleSetUsage` counts references from route rules only (`readRules` in `pages/RuleSets`); DNS rules are not counted, and the count is a number, not the list of rules.
- The rule sets route has no address parameter that names a set; `overview-for-newcomers` and `how-it-works` link a service to "its rule set on the rule sets screen".

## Goals / Non-Goals

**Goals:**

- Check time, size and address match of every remote set of the applied config, read while the core runs.
- A description of every set from its source and its use, true for any category.
- One place a link can open for one rule set.

**Non-Goals:**

- Reading the list inside a set: no counts, no samples (owner, 2026-11-20; ADR-0091, option 6).
- Reading the draft: a set that is not applied is not downloaded, and the panel says so without asking the daemon.
- Background polling: the daemon reads only when the panel asks.

## Decisions

### One endpoint, the record only

- `GET /api/rule-sets/cached` returns, for each `remote` entry of `route.rule_set` in the applied config, `{tag, state, checked_at, size, other_address}`. `state` is `cached`, `not_downloaded` (no entry under the tag), `memory_only` (no `experimental.cache_file`), `unreadable` (the entry under the tag is not a rule set record: its frame does not decode or its content, after a byte order mark and whitespace, starts neither with `SRS` nor with `{`; a JSON subscription under the same tag is not told apart, ADR-0091) or `cache_unavailable` (the copy failed after its retries, or the file is above 64 MiB). It decodes the `SavedBinary` frame without copying the content and runs no binary. The rule sets screen calls it once per open and after an apply.
- The route goes into `createMissingHandlers` of the mock stand in the same pull request.

### What the daemon reads from the config

`clashapi.ReadCacheFile` grows into a projection of `experimental.cache_file` and the `remote` entries of `route.rule_set` (tag, url). It decodes only those fields, as it does today, and never writes. `other_address` compares the entry's `URLHash` with the SHA-256 of the address in the config, as the core does on start; a version-1 entry, which has no `URLHash`, counts as the same address, as the core treats it. The projection gets its row in the projection table of `apps/metaboxd/docs/guides/Architecture&Style.md`.

### The checked copy

- The live file is read with plain file reads; bbolt never opens it on this path, so no `flock` is taken.
- Procedure: read the two meta pages of the live file, copy the file into a temporary directory made with `os.MkdirTemp`, read the two meta pages again; equal pages mean no commit finished during the copy and the copy holds the last committed tree whole (ADR-0091). On a difference, copy again, at most three times, then `cache_unavailable`.
- The page size is read from the first meta page, so the comparison does not assume the 4 KiB default.
- The copy is opened read-only with bbolt, under the fault recovery the package has, and removed after the read on every path.
- The result is kept in memory per live file size and modification time and per the remote entries asked for, so an Apply that adds a set or changes an address is answered anew; a request with the same live file and entries does not copy again. Reads are serialised: one copy at a time.

### Memory: NFR-4 and the copy

The copy lands in `/tmp`, which is `tmpfs`, that is RAM, on OpenWrt. Each read after a change of the live file takes router RAM equal to the cache file size for the time of the read: about the sum of the cached remote sets, about 12 MB with the largest catalog set (`geosite-ru-blocked-all`, 11.9 MB), at most 64 MiB by the limit, a value the owner can lower. This is outside the daemon's resident memory. The daemon itself touches only the bbolt pages it walks (meta, branch and leaf pages, the first and last page of each value) and keeps only the small result between requests. NFR-4 (steady-state resident memory at most 64 MB, measured with no panel open) is unaffected, since the daemon reads only on a panel request; the bench test of task 1.4 records the daemon's resident memory before and after a read.

### The description (AC-109)

Built in the panel from what it already has; the daemon is not asked. The category is quoted as the provider's name for the list, never interpreted: "belongs to ‹X›" would be a claim about contents, false for `ru-blocked`, `cn` or `category-ads-all`. The kind is stated because the format guarantees it: a `geosite` list holds only sites, a `geoip` list only addresses. Values from the config are monospace, the sentence is not. Templates, written with `/impeccable clarify` against `apps/web/docs/guides/Glossary.md`:

| Set                      | en                                                                                      | ru                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| catalog, `geosite`       | A ready list of sites from the ‹provider› catalog. There it is called `‹category›`.     | Готовый список сайтов из каталога ‹provider›. Там он называется `‹category›`.  |
| catalog, `geoip`         | A ready list of addresses from the ‹provider› catalog. There it is called `‹category›`. | Готовый список адресов из каталога ‹provider›. Там он называется `‹category›`. |
| remote, not from catalog | A list the core downloads from `‹host›`.                                                | Список, который ядро скачивает с `‹host›`.                                     |
| own list file            | A list in a file on the router: `‹path›`. It changes only when the file does.           | Список в файле на роутере: `‹path›`. Меняется только вместе с файлом.          |
| inline                   | Conditions written right in the config, not a downloaded list.                          | Условия записаны прямо в конфиге, а не скачаны списком.                        |

Every remote set adds the line "File: `‹file name›`" / «Файл: `‹file name›`», the last segment of its address (`geosite-google.srs`); a catalog set fetched through a mirror also adds "Mirror: ‹host›" / «Зеркало: ‹host›». The provider name stands after «каталога» and is not declined.

Where the set is used: "Used in" / «Где используется», with the groups "Rules" / «Правила» and "DNS rules" / «Правила DNS»; an empty group is omitted. An item is the rule's name from the config (AC-86), else "rule N" / «правило N», and links to the rule. With no use: "No rule in the draft uses this rule set." / «В черновике этот сет не используется.» The usage is read from the same document as the rows: the draft. DNS references count in the row's usage number too; the existing "Rules with set ‹tag›" link keeps opening the route rules filtered by the tag, and the remove dialog's warning counts both kinds, since the core refuses a config whose DNS rule names a removed set as well.

### Freshness texts (AC-110)

- Check time: "Checked ‹relative›" / «Проверен ‹relative›», the absolute time in `<time datetime>` and on hover and focus. Help: "When the core last asked the address for a new version. A check that found no changes counts too." / «Когда ядро последний раз спрашивало адрес о новой версии. Проверка без изменений тоже считается.»
- Size: "Size ‹bytes›" / «Размер ‹bytes›», the size of the saved copy; no word for entries next to it.
- `other_address`: "The saved copy came from a different address than the one set now." / «Сохранённая копия скачана с другого адреса, не с того, что указан сейчас.»
- `not_downloaded`: "Not downloaded yet." / «Ещё не скачан.»
- `memory_only`: "Kept only in the core's memory, so the check time and size are unknown. Saving copies to disk is off in the config." / «Хранится только в памяти ядра, поэтому время проверки и размер неизвестны. Сохранение копий на диск выключено в конфиге.»
- `unreadable`: "The saved copy under this name is not a rule set, so the check time and size are unknown." / «Сохранённая копия под этим именем — не сет правил, поэтому время проверки и размер неизвестны.»
- `cache_unavailable`: "Saved copies are unavailable right now." / «Сохранённые копии сейчас недоступны.»
- Request failed: "Couldn't load the check time and size." / «Не удалось загрузить время проверки и размер.», with "Retry" / «Повторить».
- Only in the draft: "Only in the draft. The core gets it after Apply." / «Есть только в черновике. Ядро получит его после применения.»

The "Updated" column keeps its header, since it also holds the modification time of own list files; a remote cell carries the "Checked" label. Renaming the column to "Checked" was considered and not taken: it would be false for own list files. "checked" goes into `Glossary.md`. The final texts are fixed in the task that adds the dictionaries, checked by `apps/web/tools/vocabulary.test.ts`.

### Opening one set by address

The rule sets route accepts `?set=‹tag›`: the row of that tag is expanded and scrolled into view; a tag not in the config opens the screen with every row collapsed. This is the target for the service links of `overview-for-newcomers` and `how-it-works`; those changes point their links at it. Simple mode of the Routes change reuses the expanded block as a component.

## Design brief

Produced with `/impeccable shape`; the owner approves it with the proposal.

**Question.** "What is this rule set, is it fresh, and does anything use it?", answered without the list's contents.

**Content, top to bottom.**

1. Description: one sentence from the template for the set's type; provider, category, host and path in monospace; the file name and the mirror on their own lines.
2. Freshness, remote sets only: "Checked ‹relative›" and "Size ‹bytes›", replaced by one state sentence when unknown.
3. Address warning: warn tone with an icon and text, never colour alone.
4. Usage: "Used in" with Rules and DNS rules, each item a link to its rule; the unused sentence when there is none.
5. No actions inside: edit and remove stay in the row's action column (`apps/web/docs/guides/Tables.md`).

**States.** Exactly one freshness state at a time; usage is always shown. Fresh; not downloaded; memory only; unreadable; cache unavailable; only in the draft; daemon data loading (a one-line skeleton in the freshness slot while the description and usage render from the config); daemon request failed (the freshness slot says the check time and size could not be loaded, with a retry; the rest of the row stays); local file and inline (no freshness block: the core does not check them).

**Desktop.** A chevron button at the start of the tag column; the panel opens under the row at full width, indented to the tag text; several rows may be open; open state is not saved. The panel lives in the same `role="row"` as a last `role="cell"` with `aria-colspan` equal to the visible column count, so `aria-rowcount` stays the number of sets. The list lays out the expanded row at its natural height.

**Narrow, 375 px.** The row is the "label — value" card; the toggle is a full-width 44 px button at the card bottom, "Details" / «Подробнее», then "Hide details" / «Скрыть подробности»; the panel renders inside the card in the same order; monospace values wrap (`overflow-wrap: anywhere`); rule links are 44 px touch targets.

**Keyboard and screen reader.** The toggle is a `<button>` with `aria-expanded` and `aria-controls`, named "Details of ‹tag›" / «Подробности: ‹tag›»; Enter and Space toggle; focus stays on the button and the panel is next in tab order; Escape does not close it. The panel is a `role="region"` labelled by the tag. With reduced motion there is no height animation; otherwise the enter and exit durations of `apps/web/DESIGN.md`.

## Risks / Trade-offs

- [The copy is RAM on `tmpfs`] → only after the live file changed, one copy at a time, a 64 MiB limit; see "Memory".
- [The checked copy is reasoned from the bbolt source and not exercised against a writing core yet] → the unit test of task 1.2 changes a meta page between the reads, and the bench test of task 1.4 reads while the core runs.
- [The fork changes `SavedBinary` or the bucket] → the fork pin test writes remote sets through `SaveRuleSet` into the fixture, and the daemon tests read it.
- [A subscription with the same tag as a remote set] → a share-link or base64 subscription reads `unreadable`; a JSON one is not told apart and shows its own time and size. In that case the fork overwrites one with the other (ADR-0088); task 1.2 tests with a subscription the fork writes.
- [A newcomer reads a category name such as `ru-blocked` as jargon] → the sentence says it is the provider's name for the list; a human description of categories is out of scope (proposal).
- ["Checked" may read as "the list changed"] → the cell label and the help say "checked"; `Glossary.md` gets the word in the same change.

## Migration Plan

None. The endpoint is new and read-only; rolling back the daemon returns the dash on the rule sets screen, and the description, which needs no daemon, stays.
