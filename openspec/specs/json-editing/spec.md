# JSON Editing Specification

## Purpose

Editing a node or the whole config as text: the raw mode, the text editor, the draft that holds unapplied edits and survives a reload.

## Requirements

### Requirement: AC-23 A node is edited as JSON

Any config node SHALL be able to be opened in raw mode and edited as JSON; the changes go back into the model without losing other data. The criterion is closed by forms for an existing `remote` set and the `route` and `dns` scalars (`final`, `strategy` and neighbors); the rest stays in raw mode (OQ-21, 2026-10-09).

#### Scenario: A node edit by text lands precisely

- **GIVEN** an outbound open on the JSON tab
- **WHEN** its text is edited
- **THEN** the draft gets the edit and the comment and the neighbouring node are intact

#### Scenario: Form input survives a switch to JSON

- **GIVEN** a node with a field typed in the form
- **WHEN** the user switches to JSON and back
- **THEN** the typed value is still there

#### Scenario: A remote rule set is edited by its form

- **GIVEN** an existing remote rule set
- **WHEN** its tag is edited in the form
- **THEN** one line of the file changes and the address and other fields remain

#### Scenario: route.final is edited by the form

- **GIVEN** the route scalars form
- **WHEN** `route.final` is changed
- **THEN** one line changes and the rules and rule sets are untouched

#### Scenario: dns.strategy is edited by the form

- **GIVEN** the dns scalars form
- **WHEN** `dns.strategy` is changed
- **THEN** one line changes and the comment and servers are kept

### Requirement: AC-24 The whole config is edited as JSON

There SHALL be a mode for editing the JSON of the whole config in the web.

#### Scenario: The file is shown as is

- **GIVEN** a config on the device
- **WHEN** the config text screen opens
- **THEN** it shows the file as it is on the device

#### Scenario: An edit goes to the draft

- **GIVEN** the config text screen
- **WHEN** the text is edited
- **THEN** the draft gets the edit and the file on the device is not touched

#### Scenario: A config the schema rejects still opens as text

- **GIVEN** a config the schema did not accept
- **WHEN** the config text screen opens
- **THEN** the text is editable while forms are unavailable

### Requirement: AC-25 An unrecognized node is a raw block

A node the model did not recognize SHALL be shown as a raw block marked "not covered by the UI" and saved without distortion; a form for this node is unavailable, the rest of the config is edited normally.

#### Scenario: A node with an unknown field opens as text

- **GIVEN** an outbound with a field the schema does not know
- **WHEN** it is opened
- **THEN** it is marked as unknown to the panel, the form tab is disabled and the JSON tab holds the node

#### Scenario: An unrecognized rule is edited as text

- **GIVEN** a routing rule the schema does not recognize
- **WHEN** it is opened from the rules list
- **THEN** it is marked "not covered by the UI", has no form and is edited as text

#### Scenario: Unknown nodes are saved without distortion

- **GIVEN** a config with unknown nodes
- **WHEN** a neighbouring field is edited
- **THEN** the unknown nodes are in the text as before

### Requirement: AC-26 Edits go to the draft and Apply needs sing-box check

An edit SHALL go into the draft even with warnings, without a separate save step; Apply is rejected if `sing-box check` did not pass, and shows the binary output.

#### Scenario: An edit with a warning goes into the draft

- **GIVEN** a rule open as text
- **WHEN** it is edited into a shape the panel does not recognize
- **THEN** the draft gets the rule as typed and the panel shows a warning

#### Scenario: An edit needs no save step

- **GIVEN** a loaded config
- **WHEN** an edit is made
- **THEN** it is in the draft and the applied config stays as it was

#### Scenario: A failed check writes nothing

- **GIVEN** a config that `sing-box check` rejects
- **WHEN** it is applied
- **THEN** the apply stops before anything is written

#### Scenario: The binary output reaches the client

- **GIVEN** a config that `sing-box check` rejects
- **WHEN** Apply is sent to the daemon
- **THEN** the response carries the binary output verbatim

#### Scenario: The panel shows the binary output

- **GIVEN** an Apply the binary rejected
- **WHEN** the result is shown
- **THEN** the apply bar shows the sing-box output

### Requirement: AC-70 The draft survives a reload

The draft SHALL survive a page reload: it is stored in the browser and restored on the next opening; if the config on the device changed in the meantime, the panel says so rather than silently applying the draft over it. Leaving the page with an unsaved draft requires browser confirmation.

#### Scenario: Edits survive a reload

- **GIVEN** a draft on an unchanged device config
- **WHEN** the page is reloaded
- **THEN** the edits are restored silently

#### Scenario: A changed device config is reported

- **GIVEN** a stored draft whose base differs from the device config
- **WHEN** the page is reloaded
- **THEN** the panel warns that the config on the device changed

#### Scenario: A restored draft is applied against the device config

- **GIVEN** a restored draft
- **WHEN** Apply is pressed
- **THEN** the panel waits for the device config and sends its fingerprint as the base

#### Scenario: The daemon refuses a stale base

- **GIVEN** an Apply whose base differs from the file on disk
- **WHEN** the daemon starts the apply
- **THEN** it refuses the apply as made over a changed config

#### Scenario: Leaving with a draft asks the browser

- **GIVEN** unapplied edits
- **WHEN** the page is left
- **THEN** the browser asks to confirm leaving

### Requirement: AC-40 The config text editor numbers lines, highlights and searches

The screen for editing the whole config as text (AC-24) SHALL show line numbers, JSON highlighting and search with navigation between matches. Highlighting and search do not change the text: Apply sends the same bytes the user sees.

#### Scenario: Line numbers

- **GIVEN** the text editor with line wrapping off
- **WHEN** it is shown
- **THEN** the lines are numbered

#### Scenario: Highlighting keeps the text

- **GIVEN** a config text
- **WHEN** it is highlighted
- **THEN** the highlighted text repeats the source verbatim

#### Scenario: Search finds every match

- **GIVEN** a config text and a query
- **WHEN** the user searches
- **THEN** every non-overlapping match is found, case-insensitive

#### Scenario: Apply sends the bytes as they are

- **GIVEN** a config with comments and a trailing comma
- **WHEN** it is sent to the daemon
- **THEN** it goes out byte for byte
