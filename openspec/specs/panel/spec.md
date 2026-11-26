# Panel Specification

## Purpose

Behaviour shared by the panel screens: filtering of lists, themes, narrow screens and keyboard shortcuts.

## Requirements

### Requirement: AC-38 Rule and connection lists are filtered by search and facets

Rule and connection lists SHALL be filtered by substring search and facets: for rules — action and LAN device, for connections — device, action, rule, chain and network, with multi-select and a row count for each value. Filtering affects only the display: it does not change the config, and a row the schema did not accept does not disappear from the list (AC-3).

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

### Requirement: AC-41 The panel works in dark and light themes

The panel SHALL work in dark and light themes, the theme is switched from the interface, and the choice survives a page reload.

#### Scenario: The theme is switched and remembered

- **GIVEN** the theme switch
- **WHEN** the user picks the light theme
- **THEN** the document takes the light theme and the choice is saved

#### Scenario: A saved theme is applied on load

- **GIVEN** a saved dark or light theme
- **WHEN** the panel opens
- **THEN** the page takes that colour scheme

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

### Requirement: AC-90 The panel has keyboard shortcuts

The panel SHALL have keyboard shortcuts: `/` puts focus into the search field of the list on screen, `N` opens adding an item there (a rule, a rule set from the catalog, a section node), `Ctrl+S` or `⌘S` opens the Apply summary. A shortcut works only when its control is visible, enabled and not behind an open dialog; a letter typed into a text field stays a letter; the shortcut matches the physical key, so a Russian layout works too. On the Rule sets screen `Shift+N` opens adding an own list, while `N` keeps opening the catalog. `?` opens the list of shortcuts. The up and down arrows move between the rows of the rules list and of a section node list, and `Enter` opens the row in focus; on the title of an open section node they open the neighbouring node. Where there is a keyboard (a fine pointer is present, `any-pointer: fine`), the key is hinted next to the control at any width, and screen readers get it from `aria-keyshortcuts`.

#### Scenario: The shortcut list

- **GIVEN** any screen
- **WHEN** the user presses `?`
- **THEN** the list of shortcuts opens

#### Scenario: Arrows move through the rules

- **GIVEN** the rules list
- **WHEN** the user presses the arrows and `Enter`
- **THEN** focus moves between rule rows and `Enter` opens the rule in focus

#### Scenario: Arrows move through a section node list

- **GIVEN** a section node list
- **WHEN** the user presses the arrows and `Enter`
- **THEN** focus moves between node rows and `Enter` opens the row in focus

#### Scenario: `Shift+N` on the Rule sets screen

- **GIVEN** the Rule sets screen
- **WHEN** the user presses `Shift+N` or `N` outside the search field
- **THEN** `Shift+N` opens the own list form and `N` opens the catalog
