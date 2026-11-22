## ADDED Requirements

### Requirement: AC-113 Each server's norm is edited in its Proxies row

Proxies SHALL offer a compact inline editor for each editable server's usual latency in milliseconds. The shared heading identifies automatic mode as the default. A stored override has a passive “Custom norm” label and a separate “Return to auto” button. The name editor stays separate. Saving a norm or restoring automatic mode changes only the selected server's norm through its metadata and needs no Apply.

#### Scenario: The norm is saved inline without moving the row

- **GIVEN** an editable server in automatic mode, with a computed norm or no data
- **WHEN** the user activates the value or pencil and saves an integer from 1 to 10000 ms by pressing Enter or the Save button
- **THEN** the row shows the saved manual norm and focus returns to its edit button
- **AND** the field, action slot, row height and neighboring columns keep their positions before, during and after editing
- **AND** the existing server name and other entries stay intact, with no draft or Apply request

#### Scenario: Escape discards the edited norm

- **GIVEN** the user has changed the field without saving
- **WHEN** the user presses Escape
- **THEN** the editor restores the last saved or computed reading and focus returns to the edit button without sending a write

#### Scenario: Reset restores the current automatic norm

- **GIVEN** a server has a manual norm and a computed norm is available
- **WHEN** the user activates “Return to auto” with the keyboard or pointer
- **THEN** only this server's manual norm is removed, the current automatic norm is shown, and focus returns to the edit button
- **AND** the history chart and latency comparison use that automatic norm and the current samples
- **AND** the server's name and the other server rows keep their saved values
- **AND** the row height, the field's size and position, the action slot, and the neighboring columns stay stable

#### Scenario: Reset with no computed norm while a refresh is pending

- **GIVEN** a server has a manual norm, no computed norm, and a latency reply from before the reset
- **WHEN** the daemon accepts “Return to auto” and the latency refresh is pending
- **THEN** the field shows no data, and the chart and comparison omit a norm until current data supports one
- **AND** the old manual norm does not appear as an automatic norm or produce a stale comparison
- **AND** the server's name and the other server rows keep their saved values
- **AND** the row height, the field's size and position, the action slot, and the neighboring columns stay stable

#### Scenario: A probe failure remains separate from a norm comparison

- **GIVEN** the server has a check failure or a failed request prevented the check
- **WHEN** its norm changes or returns to automatic mode
- **THEN** the row still reports the observed diagnosis as before the change
