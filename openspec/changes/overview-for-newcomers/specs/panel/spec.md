## ADDED Requirements

### Requirement: AC-111 Visible panel transitions communicate the change

The panel SHALL animate navigation between screens and user-visible changes of view, including tab changes, the opening and closing of disclosures and contextual panels, and the appearance and dismissal of actionable notices. The transition preserves the surrounding layout and focus behavior. An in-flow disclosure may resize its own section. Background data refreshes and changes to individual values do not replay the surrounding transition.

#### Scenario: Navigation animates in both directions

- **GIVEN** a browser supporting screen transitions and a user who allows motion
- **WHEN** the user navigates between panel screens or follows browser history
- **THEN** outgoing and incoming content transition while persistent navigation stays in place

#### Scenario: Contextual changes animate in place

- **GIVEN** a panel screen is visible and the user allows motion
- **WHEN** a notice changes state, a tab changes, or the user opens or closes a disclosure, help popover or contextual panel
- **THEN** the changed content transitions, an anchored popover leaves neighboring content in place, and keyboard focus follows the control's normal behavior

#### Scenario: Reduced or unavailable motion leaves the panel usable

- **GIVEN** the user requests reduced motion or the browser lacks the transition API
- **WHEN** the user repeats the navigation and contextual actions
- **THEN** reduced motion removes non-essential animation, and unavailable animation leaves the final state, focus and navigation usable

## MODIFIED Requirements

### Requirement: AC-38 Rule and connection lists are filtered by search and facets

Rule and connection lists SHALL be filtered by substring search and facets: for rules — action, outbound and LAN device, for connections — device, action, rule, chain and network, with multi-select and a row count for each value. The outbound facet of rules takes its value from the address parameter, so another screen can open the list already filtered by an outbound. Filtering affects only the display: it does not change the config, and a row the schema did not accept does not disappear from the list (AC-3).

#### Scenario: Search narrows the rule list

- **GIVEN** a list of three rules
- **WHEN** the user types a word into the rule search
- **THEN** only the matching rule is shown

#### Scenario: Search needs every word

- **GIVEN** connections and a query of several words
- **WHEN** the list is filtered
- **THEN** a connection is shown only when all words match

#### Scenario: Values of one facet add up

- **GIVEN** the action facet of the connections
- **WHEN** the user selects several values
- **THEN** rows of any selected value are shown

#### Scenario: Facets combine with each other and with the query

- **GIVEN** selections in two facets and a query
- **WHEN** the list is filtered
- **THEN** a row is shown only when it matches every facet and the query

#### Scenario: Each value has a row count

- **GIVEN** a connection list without a filter
- **WHEN** the facet values are listed
- **THEN** each value carries the number of rows it has

#### Scenario: The facet list allows multi-select

- **GIVEN** a facet filter
- **WHEN** the user opens it
- **THEN** several values can be selected

#### Scenario: The rule list opens filtered by an outbound

- **GIVEN** an address with an outbound parameter
- **WHEN** the rules list opens from it
- **THEN** the outbound facet holds that outbound and only the rules leading to it are shown
