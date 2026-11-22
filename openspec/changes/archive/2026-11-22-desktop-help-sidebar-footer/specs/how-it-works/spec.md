# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: AC-105 "How metabox works" is the first section of the menu`
- TO: `### Requirement: AC-105 How metabox works is reachable from the sidebar or More`

## MODIFIED Requirements

### Requirement: AC-105 How metabox works is reachable from the sidebar or More

The panel SHALL serve "How metabox works" at `/how-it-works`. On desktop, Overview leads the main sections and Help is a separate sidebar footer link with an accessible name, visible keyboard focus and a current-page state. On phones the help screen remains the first item in More, the bottom bar keeps five section links and the panel root opens Overview.

#### Scenario: First item of the sidebar

- **GIVEN** a desktop screen
- **WHEN** the panel opens
- **THEN** Overview is the first main section and Help is available in the sidebar footer

#### Scenario: Desktop Help opens the existing address

- **GIVEN** the sidebar is expanded or collapsed
- **WHEN** the user focuses and activates Help with the keyboard
- **THEN** focus is visible, the existing help screen opens at `/how-it-works`, and its footer link is marked as the current page

#### Scenario: First item of the More sheet on a phone

- **GIVEN** a phone screen
- **WHEN** the user opens "More"
- **THEN** "How metabox works" is its first item, and the bottom bar shows the same five sections as before

#### Scenario: The root still opens Overview on a phone

- **GIVEN** a phone screen
- **WHEN** the panel root opens
- **THEN** Overview is shown, not "How metabox works"
