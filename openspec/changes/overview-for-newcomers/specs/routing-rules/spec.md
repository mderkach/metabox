## ADDED Requirements

### Requirement: AC-103 Rule names reach the daemon, MCP and connections

The daemon SHALL read rule names from the applied config comments (AC-86) and index them like `route.rules`. A connection keeps the core’s observed condition and action. It gets a name only after the daemon confirms the loaded config revision and matched position. MCP returns names with versions and connections, masks URLs as in the log tail, removes invisible and control characters, and strips other comments.

#### Scenario: Names come indexed like the rules

- **GIVEN** an applied config with three rules, the second one named
- **WHEN** the daemon reads the rule names
- **THEN** it returns three entries, a name only in the second

#### Scenario: A connection carries its rule's name

- **GIVEN** a live connection matched by a named rule at a confirmed position in the revision loaded by the core
- **WHEN** the agent lists connections through MCP
- **THEN** the connection carries the rule's name next to the matched rule text

#### Scenario: MCP gets names but not other comments

- **GIVEN** a config version with a named rule and another comment
- **WHEN** the agent reads that version
- **THEN** the result carries the rule names and no other comment

#### Scenario: A name that looks like a secret is masked

- **GIVEN** a rule named with a URL that holds a password
- **WHEN** the agent reads the rule names
- **THEN** the password in the name is masked

#### Scenario: Invisible characters are removed from a name

- **GIVEN** a rule name with a zero-width character and a control character
- **WHEN** the agent reads the rule names
- **THEN** the name comes back without them

#### Scenario: The rules on disk are reordered at the same length

- **GIVEN** the core loaded a revision with rules A and B and a live connection matched A
- **AND** the on-disk config has the same number of rules in order B, A and its revision cannot be matched to the running core
- **WHEN** the agent lists connections through MCP
- **THEN** the connection keeps the condition and action reported by the core and carries no rule name

#### Scenario: The matched position is unconfirmed

- **GIVEN** the core's loaded config revision is confirmed and a connection whose matched position is unknown or ambiguous
- **WHEN** the agent lists connections through MCP
- **THEN** the connection keeps the condition and action reported by the core and carries no rule name
