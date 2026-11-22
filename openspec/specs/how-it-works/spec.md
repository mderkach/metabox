# how-it-works Specification

## Purpose

A help section of the panel that shows a newcomer how the router handles one of its own live connections, from the device to the server, and defines the words the other screens use.

## Requirements

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

### Requirement: AC-106 The section walks one live connection step by step

The section SHALL walk one live connection in five steps: device, destination, rule, outbound, server. Device and destination come from the connection and the Devices list; rule, outbound and server come from the route explanation and carry its origin. The rule name or content label (AC-86) is shown only when the shared rule identity confirms the loaded revision and matched position. Arrows join steps. Group choices appear nested in the outbound step.

#### Scenario: A connection through a group

- **GIVEN** a connection whose rule sends it to a group that picked a server
- **WHEN** the section shows it
- **THEN** the outbound step names the group, how it chooses and the member it picked as a nested block, and the server step names the server the connection went through

#### Scenario: The device and the destination

- **GIVEN** a connection from an address the Devices list knows and one from an address it does not
- **WHEN** the section shows them
- **THEN** the device step names the first by its device name and gives the second by its address, and the destination step gives the host, or the address when the core learned no host

#### Scenario: Offered connections

- **GIVEN** a router with connections through a group, straight to a server and direct, among DNS and sniff-only rows
- **WHEN** the section opens
- **THEN** it offers one connection of each kind, up to three, and none of the skipped rows

#### Scenario: Nested groups

- **GIVEN** a connection whose group picked another group
- **WHEN** the section shows it
- **THEN** the inner group is a block inside the outer one, and no arrow joins the two groups

#### Scenario: A direct connection

- **GIVEN** a connection sent `direct`
- **WHEN** the section shows it
- **THEN** the outbound step says it goes without a proxy, and the server step says there is no server

#### Scenario: The rule is linked by its number

- **GIVEN** a connection matched by a rule, with a confirmed position in the loaded revision and a confirmed target in the current editor document
- **WHEN** the section shows it
- **THEN** the rule step gives the rule number, the services the rule names and a link to that rule in the editor

#### Scenario: A named rule shows its name

- **GIVEN** a connection matched by a rule that has a name (AC-86), and the core runs the applied config
- **WHEN** the section shows it
- **THEN** the rule step shows the rule name first and the rule number second

#### Scenario: An unnamed rule shows its content label

- **GIVEN** a connection matched by a rule without a name, and the core runs the applied config
- **WHEN** the section shows it
- **THEN** the rule step shows the content label of AC-86 ("geosite-ru → direct") first and the rule number second

#### Scenario: The core runs another config

- **GIVEN** a core rule list whose positions cannot be matched to the applied revision, including a same-length reorder
- **WHEN** the section shows the connection
- **THEN** the rule step shows the conditions from the core without a name, a number or a link, and says why

#### Scenario: A draft changes the rule's position

- **GIVEN** a confirmed position in the applied revision but no confirmed position in the current editor document
- **WHEN** the reader follows the rule glossary link
- **THEN** the link opens the rules list without selecting a row

#### Scenario: No rule matched

- **GIVEN** a connection that went to the default route
- **WHEN** the section shows it
- **THEN** the rule step says no rule matched and the default outbound was used

#### Scenario: The rule is undetermined

- **GIVEN** a connection whose rule the daemon cannot determine
- **WHEN** the section shows it
- **THEN** the rule step says the rule is undetermined and gives the reason

#### Scenario: Every step carries its origin

- **GIVEN** a walk of a connection
- **WHEN** it is shown
- **THEN** every step that comes from the route explanation carries the same origin mark as on the Connections screen

#### Scenario: No live connections

- **GIVEN** a running core with no connection to walk
- **WHEN** the section opens
- **THEN** it says there are no connections now, shows the steps without values and still shows the terms

#### Scenario: The core is stopped

- **GIVEN** a stopped core
- **WHEN** the section opens
- **THEN** it says the core is stopped instead of a walk, and still shows the terms

#### Scenario: The explanation request failed

- **GIVEN** a walk is requested and the route explanation fails for a reason other than a closed connection
- **WHEN** the section shows the result
- **THEN** it shows the inline error block of the Connections sheet with a retry action, no invented values, and still shows the terms

#### Scenario: The connection closed after it was shown

- **GIVEN** a walk is shown and its connection then closes
- **WHEN** the stream drops the connection
- **THEN** the walk stays as shown with a muted line that the connection has closed, and the panel does not request the explanation again

#### Scenario: An unknown outbound type

- **GIVEN** a connection whose outbound has a type the panel does not know
- **WHEN** the section shows it
- **THEN** the outbound step names the tag without a line about how it chooses

#### Scenario: Loading

- **GIVEN** the route explanation of the selected connection has not arrived
- **WHEN** the section is shown
- **THEN** the steps show their names with placeholder values, and the terms are already shown

#### Scenario: Another connection

- **GIVEN** a walk is shown and the router has other suitable connections
- **WHEN** the user picks another offered connection
- **THEN** the walk shows that connection, and the offered list does not change while the stream updates

### Requirement: AC-107 The section defines eight terms and where each is configured

The section SHALL define eight terms (device, service, rule, outbound, group, server, subscription, core), each in one sentence of the vocabulary, in English and Russian, with a link to the screen where it is configured or shown. Selecting a step shows its term. The service link opens the rule sets screen with the first rule set the walked rule names selected, as on Overview; with none named, the screen itself.

#### Scenario: Eight terms with a link each

- **GIVEN** the section in either language
- **WHEN** it opens
- **THEN** it shows the eight terms, each with a one-sentence definition and a link that opens the screen where the term is configured or shown

#### Scenario: The service link opens its rule set

- **GIVEN** a walk whose rule names a service
- **WHEN** the user selects the service term and follows its link
- **THEN** the rule sets screen opens with that service's rule set selected

#### Scenario: The service link without a named service

- **GIVEN** a walk whose rule names no service, or no walk
- **WHEN** the user follows the link of the service term
- **THEN** the rule sets screen opens without a selection

#### Scenario: A step shows its term

- **GIVEN** a walk is shown
- **WHEN** the user selects a step
- **THEN** the definition of that step's term is shown next to the walk, and the selection is announced to assistive technology

#### Scenario: The terms use the vocabulary

- **GIVEN** the texts of the section
- **WHEN** the vocabulary check runs
- **THEN** it finds no forbidden word in them
