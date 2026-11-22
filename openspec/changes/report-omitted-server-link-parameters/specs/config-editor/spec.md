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
