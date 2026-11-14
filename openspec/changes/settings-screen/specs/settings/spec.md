## ADDED Requirements

### Requirement: AC-77 A Settings screen with access, agents and system sections

A "Settings" entry in the navigation SHALL open a screen with sections: access (set, change and remove the panel password, see and end sessions), agents (enable MCP, issue and revoke the token, see its permission), system (versions of the panel and the core, service state, dataplane settings). Setting the password or the MCP token from this screen has the same effect as the AC-69 and AC-71 actions; the sidebar footer keeps only the theme, the language, logout and the service state. Each section is reachable and complete on its own, without the wizard. The session list shows each session's address and how long ago it signed in and was last active, and marks the current one. A session other than the current one can be ended, which closes its open event and log streams; the current one ends only by logout. The daemon log records the address of the ended session as well as the caller's. Without a password the list is empty and ending a session answers "not found". When the session file cannot be written, the panel says the session is ended but not saved and may return after a daemon restart. The card tells the user to change the password when a session is unfamiliar. Done on 2026-11-01 except sessions and the dataplane settings; sessions done on 2026-11-14. Not done: the dataplane settings on the screen itself, the system section links to the devices screen for interception.

#### Scenario: A section works without the wizard

- **GIVEN** the first-run wizard was never opened
- **WHEN** the user opens a section of "Settings"
- **THEN** the section is reachable and complete on its own

#### Scenario: Another session is ended

- **GIVEN** a password is set and two sessions are signed in
- **WHEN** the user ends the session that is not the current one
- **THEN** its open event and log streams close and the daemon log records the address of the ended session and the caller's

#### Scenario: Without a password there are no sessions

- **GIVEN** no password is set
- **WHEN** the user opens the session list and a request ends a session
- **THEN** the list is empty and the request answers "not found"
