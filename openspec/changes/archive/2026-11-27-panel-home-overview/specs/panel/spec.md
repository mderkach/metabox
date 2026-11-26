## MODIFIED Requirements

### Requirement: AC-42 The panel frame stays usable from 400 px

The panel frame SHALL stay usable at widths from 400 px. Opening the panel root SHALL show Overview at every viewport width. On a narrow screen navigation moves to a bottom bar with labels, tables with fixed columns scroll horizontally together with the header, and the page itself has no horizontal overflow.

#### Scenario: Navigation moves to a bottom bar

- **GIVEN** a phone screen
- **WHEN** the panel opens
- **THEN** there is no sidebar and the sections are in the bottom bar

#### Scenario: The bottom bar has labels

- **GIVEN** the bottom bar
- **WHEN** it is shown
- **THEN** it leads to the sections with labelled links

#### Scenario: The root opens the overview on a phone

- **GIVEN** a phone screen
- **WHEN** the panel root opens
- **THEN** the overview is shown

#### Scenario: The root opens the overview on desktop

- **GIVEN** a desktop screen
- **WHEN** the panel root opens
- **THEN** the panel navigates to `/overview` and shows Overview

#### Scenario: No horizontal overflow of the page

- **GIVEN** a width of 400 px
- **WHEN** a screen opens
- **THEN** the page is no wider than the screen
