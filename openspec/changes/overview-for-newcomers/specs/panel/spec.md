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
