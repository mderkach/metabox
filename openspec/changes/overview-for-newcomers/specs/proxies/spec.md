## MODIFIED Requirements

### Requirement: AC-45 The routing mode is switched from the panel

The routing mode of the core SHALL be switched from the panel, not only shown. The mode is runtime state, not config: switching goes to the Clash API and does not touch the file, so it has no apply bar and no confirmation window. The core builds its mode list from the `clash_mode` values of the route and DNS rules, and a mode changes routing only through those rules. So the switch is shown in the Overview and Routes headers only when the running config has rules with `clash_mode`; without them there is one mode and a switch would change nothing. Each mode is labelled by where its rules lead ("by the rules", "everything through proxy ‹outbound›", "everything direct"). A switch takes effect at once, and a toast offers to undo it for ten seconds. While the mode is not the default one (`experimental.clash_api.default_mode`, else `Rule`, as the core takes it), a banner on every screen names the mode and offers to return to the default. A runtime failure is shown the same way as for other runtime actions.

#### Scenario: The current mode is shown

- **GIVEN** a running core whose config defines three modes
- **WHEN** the mode switch is shown
- **THEN** it shows the runtime mode, labelled by where its rules lead

#### Scenario: A switch is a runtime request

- **GIVEN** the shared mode switch in the Overview or Routes header
- **WHEN** another mode is chosen
- **THEN** the panel sends one Clash API request with the new mode and both headers display the same accepted runtime mode

#### Scenario: A failed switch is reported

- **GIVEN** a runtime that rejects the switch
- **WHEN** another mode is chosen
- **THEN** the previous mode comes back and a toast reports the failure

#### Scenario: No switch for a single mode

- **GIVEN** a running config without rules with `clash_mode`
- **WHEN** Overview or Routes opens
- **THEN** no mode switch is shown

#### Scenario: A switch is undone within ten seconds

- **GIVEN** a mode switched a moment ago
- **WHEN** the user presses undo in the toast within ten seconds
- **THEN** the panel sends the previous mode

#### Scenario: A banner while the mode is not the default

- **GIVEN** a mode other than the default one
- **WHEN** any screen of the panel is open
- **THEN** a banner names the mode and offers to return to the default, and it is gone once the default mode is back
