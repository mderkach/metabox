# Config Editor Specification

## Purpose

Loading a handwritten sing-box config, editing it in forms without losing or reordering anything, and showing what the panel does not recognize or the build does not support.

## Requirements

### Requirement: AC-1 A handwritten config loads without errors

A handwritten `config.json` from a real router SHALL load, parse and be shown in the UI without errors.

#### Scenario: Every corpus config parses

- **GIVEN** a config from the test corpus of handwritten router configs: with comments, tabs, CRLF, unknown sections
- **WHEN** the panel parses it
- **THEN** there are no parse issues

#### Scenario: A corpus config is accepted by the schema as a whole

- **GIVEN** a handwritten config from the test corpus without deliberately unknown fields
- **WHEN** the panel parses it
- **THEN** no node is reported as unknown to the schema

#### Scenario: A corpus config opens in the node form

- **GIVEN** a handwritten config from the test corpus loaded into the panel
- **WHEN** one of its outbounds is opened in the node form
- **THEN** the form shows the node without errors

### Requirement: AC-2 An edit changes only its own place in the file

After loading a foreign config, changing one field and saving, the diff against the original file SHALL contain only that change — nothing is lost or arbitrarily reordered. The only allowed difference beyond the user's edits is the `experimental.clash_api` section, added under AC-31 and shown explicitly. A `service` section of type `api` does not fall under this exception: under AC-33 it appears only on an explicit user action.

#### Scenario: An edit of an existing field is one line

- **GIVEN** a config from the device
- **WHEN** an existing field is changed
- **THEN** exactly one line of the text differs

#### Scenario: Keys are not reordered

- **GIVEN** a config whose sections are in an order different from the schema
- **WHEN** a field is changed
- **THEN** the section order in the text stays as it was

#### Scenario: Apply sends the edited text

- **GIVEN** a draft with an edit
- **WHEN** Apply is sent
- **THEN** the daemon receives the draft text, not a config rebuilt from the parsed model

#### Scenario: The added clash_api section is the only other difference

- **GIVEN** a config without `experimental.clash_api`
- **WHEN** it is applied
- **THEN** the only difference beyond the user's edits is the added `experimental.clash_api` section, and the panel shows the addition

### Requirement: AC-3 Unrecognized constructs survive and are marked

Constructs not recognized by the model SHALL be preserved on round-trip and marked in the UI as unrecognized.

#### Scenario: Unknown nodes survive a neighbouring edit

- **GIVEN** a config with a vendor section, an unknown option and an unknown matcher
- **WHEN** a neighbouring field is edited
- **THEN** the unknown section, option and matcher are in the text as before

#### Scenario: A section outside the schema is kept by the parser

- **GIVEN** a config with a top-level section the schema does not know
- **WHEN** the panel parses it
- **THEN** there are no issues and the section is in the parsed config as it was

#### Scenario: Unknown fields are named one by one

- **GIVEN** a config with fields the schema does not know
- **WHEN** the panel parses it
- **THEN** each unknown field is listed with the path of its node

#### Scenario: A node with an unknown field is marked in the UI

- **GIVEN** an outbound with a field the schema does not know
- **WHEN** it is opened
- **THEN** it is marked as not recognized by the panel

### Requirement: AC-4 Invalid values are shown before Apply

Invalid values SHALL be highlighted in the UI before an apply attempt, with the node and the reason.

#### Scenario: The parser names the node, the reason and the line

- **GIVEN** a file with comments and a value of the wrong type
- **WHEN** the panel parses it
- **THEN** the issue names the node, the reason and the line

#### Scenario: The form names an invalid field

- **GIVEN** a node form
- **WHEN** a port above 65535 is typed
- **THEN** the field names the error and the value is not written

#### Scenario: An issue leads to the node in the text

- **GIVEN** a schema issue with a position in the raw editor
- **WHEN** the issue is pressed
- **THEN** the cursor goes to the node in the text

#### Scenario: Apply is held on a text that does not parse

- **GIVEN** a draft whose text does not parse
- **WHEN** Apply is attempted
- **THEN** nothing is sent and the Apply bar names the line to fix

### Requirement: AC-5 Every inbound and outbound type has a renderer

Each inbound/outbound type from the fork checklist SHALL have either a manual form or an auto-generated renderer — there are no nodes without a renderer.

#### Scenario: The auto-generated renderer covers every type

- **GIVEN** every inbound and outbound type of the schema
- **WHEN** the auto-generated renderer builds the field list of the type
- **THEN** the list is not empty

#### Scenario: Every inbound and outbound type opens as a form

- **GIVEN** every inbound and outbound type
- **WHEN** a node of the type is opened in the node form
- **THEN** the form renders without exceptions

### Requirement: AC-47 Types outside the build are marked

A node type missing from the sing-box build on the device SHALL be shown by the panel with a warning: it does not prevent building such a config, but names the consequence — the binary will refuse to start. The build composition is taken from the binary itself, not hardcoded in the panel as a list.

#### Scenario: A type outside the build is marked

- **GIVEN** a node type whose build tag is not in the binary
- **WHEN** the type list is built
- **THEN** the type is marked, and a type that needs no build tag is not

### Requirement: AC-111 The server add form reports omitted VLESS link parameters

For a valid VLESS server link, the add form SHALL show the decoded names of parameters whose settings the importer omits before the user adds the server. Each name appears once. The warning exposes no parameter values and allows the user to add the mapped fields to the draft (UX-3 and UX-8).

#### Scenario: A server link imports with an omission warning

- **GIVEN** a valid VLESS REALITY link with `spx`, another unrecognized parameter, and a supported `sni`
- **WHEN** the user pastes the link and adds the server
- **THEN** the form names only the omitted parameters before the add action
- **AND** the draft includes the server with its mapped server name and without the omitted parameters

#### Scenario: The warning follows the current link

- **GIVEN** a link with repeated and percent-encoded instances of an omitted parameter name
- **WHEN** the user pastes it and then replaces it with a valid link that has no omitted parameters
- **THEN** the form initially shows the decoded name once and clears the warning after the replacement

#### Scenario: Invalid links retain their existing guidance

- **GIVEN** the form shows a warning for a valid VLESS link
- **WHEN** the user replaces it with an invalid server link or an HTTP or HTTPS subscription link and submits
- **THEN** the warning clears and the form shows the corresponding validation error or subscription guidance

#### Scenario: A supported explicit hybrid key share setting is kept

- **GIVEN** a valid VLESS REALITY link with an explicit boolean hybrid key share setting and a schema that supports it
- **WHEN** the user adds the server
- **THEN** the draft contains the boolean value and the warning omits that parameter name

### Requirement: AC-112 The editor exposes the REALITY hybrid key share setting

The editor SHALL expose the hybrid key share setting for an editable VLESS REALITY outbound when the core schema supports it. Changing the setting updates the draft through the normal edit and Apply flow.

#### Scenario: An existing REALITY outbound gains the setting

- **GIVEN** a VLESS REALITY outbound in the applied config with no hybrid key share setting
- **WHEN** the operator opens its form and enables the setting
- **THEN** the setting is visible among the REALITY settings and the draft contains true at the corresponding field
- **AND** existing node fields and the applied config retain their values until Apply

#### Scenario: The setting is limited to eligible outbounds

- **GIVEN** a non-REALITY VLESS outbound or a core schema without the setting
- **WHEN** the operator opens that outbound form
- **THEN** the form does not offer the hybrid key share setting as a REALITY setting
