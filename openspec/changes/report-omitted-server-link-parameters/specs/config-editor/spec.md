## ADDED Requirements

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
