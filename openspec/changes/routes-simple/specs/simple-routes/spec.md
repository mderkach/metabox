## Purpose

Help users configure common routes from one screen without learning the core schema, while keeping the same configuration draft available to advanced editors.

## ADDED Requirements

### Requirement: AC-115 Simple Routes shares a draft with Editor and JSON

Routes SHALL offer Simple, Editor, and JSON views of the same configuration draft. Simple SHALL present Interception, DNS, Outbounds, and Rules in that order, with contextual guidance and actions. Creating or changing an item SHALL stage the edit for review through the existing Apply flow.

#### Scenario: Change views without losing edits

- **GIVEN** a user staged a supported edit in Simple
- **WHEN** the user opens Editor or JSON and then returns to Simple
- **THEN** each view shows the same draft and the staged edit remains pending
- **AND** switching views does not apply the draft or reorder unrelated configuration

#### Scenario: Set up an empty editable configuration

- **GIVEN** Routes is open with an empty editable configuration
- **WHEN** the user adds a connection or selects a suggested service
- **THEN** the corresponding contextual form opens on Simple
- **AND** the service form uses the same catalog as it does for an existing configuration and names the available or staged outbounds
- **AND** the user can see when a staged outbound depends on a subscription becoming available after Apply

#### Scenario: Return from a contextual form

- **GIVEN** a user opens a form from a filtered list or a scrolled section
- **WHEN** the user cancels it or stages a valid edit
- **THEN** the user returns to the same section, filter, and scroll context, with focus returned to the invoking control when it still exists
- **AND** cancellation adds no edit, while successful staging shows the actual changes in the draft diff

#### Scenario: Contextual help and history use distinct interactions

- **GIVEN** Simple is open
- **WHEN** the user opens short help, the route explanation, or version history
- **THEN** short help opens by its control without moving neighboring content, the route explanation expands in place, and the history action opens the existing version list

### Requirement: AC-116 Simple Routes exposes the effective order of editable rules

Simple SHALL let users view supported rules by type, filter by outbound, and inspect and edit their effective order. It SHALL show where a new rule will be inserted and which devices it covers before staging the edit. Adding a catalog service SHALL stage a supported pair of routing and DNS rules together.

#### Scenario: Filter by an outbound without renumbering

- **GIVEN** the current draft contains rules for multiple outbounds
- **WHEN** Simple receives an outbound-specific link or the user chooses an outbound filter
- **THEN** it shows rules for that outbound with their original positions
- **AND** clearing the filter restores all rules without affecting the draft

#### Scenario: Inspect a service from its rule row

- **GIVEN** a rule refers to a catalog set
- **WHEN** the user expands the service in its row
- **THEN** Simple shows the source and the actual references from routing and DNS rules under AC-109, with an explicit state when the information is unavailable
- **AND** it does not promise or offer to inspect, list, or search entries inside a downloaded set

#### Scenario: Add a service, custom site, or device exception

- **GIVEN** the user opens a contextual rule form and selects an eligible outbound
- **WHEN** the user previews a catalog service, supported custom site or address, or device-scoped exception
- **THEN** Simple shows the intended position and device scope from the current draft
- **AND** an exception to an existing general rule is shown ahead of that rule before staging
- **AND** if Simple cannot determine or represent the edit safely, it explains the limit and leaves the existing rules intact

#### Scenario: Stage a catalog route and its matching DNS rule together

- **GIVEN** the user adds a catalog service and Simple can prove an eligible DNS mapping for the selected outbound
- **WHEN** the user stages the addition
- **THEN** the service route and its matching DNS rule through that outbound are staged as one draft change and both edits appear in the diff before Apply
- **AND** existing unrelated routing and DNS rules remain intact

#### Scenario: A catalog addition has no verified DNS mapping

- **GIVEN** the intended pair cannot be proven valid for the current core and draft, for example because the selected path has no eligible resolver or an imported rule would conflict
- **WHEN** the user attempts to stage the catalog service
- **THEN** Simple identifies the blocker and leaves both the routing and DNS draft unchanged
- **AND** it does not guess a fallback or silently rewrite imported DNS rules

#### Scenario: Put an exception ahead of a broad rule

- **GIVEN** a draft contains editable rules and the order explanation is visible in Simple
- **WHEN** the user moves a rule in the ordered view with a pointer or keyboard
- **THEN** the displayed positions and the draft reflect the same effective order
- **AND** Simple distinguishes a demonstrable overlap from an uncertain match without claiming that it evaluated the core's full rule sequence
- **AND** rules that Simple cannot reorder or represent remain preserved and are identified as editable in Editor or JSON

### Requirement: AC-117 Simple Routes configures DNS through inventory and assignments

Simple SHALL let users add supported resolvers to an inventory and separately assign them to direct connections, proxied connections, or specific outbounds. DNS controls SHALL reflect core capabilities and preserve imported settings that cannot be edited safely in Simple.

#### Scenario: Add a resolver before assigning it

- **GIVEN** a user needs a resolver that is absent from the inventory
- **WHEN** the user stages a valid resolver entry
- **THEN** the entry appears as unassigned and can be selected independently for each supported assignment
- **AND** adding it does not replace any existing assignment

#### Scenario: Assign a resolver to a particular path

- **GIVEN** the inventory contains an eligible resolver
- **WHEN** the user changes the resolver for direct connections, proxied connections, or a selected outbound
- **THEN** Simple identifies the affected assignment and stages its supported change
- **AND** unrelated assignments and unsupported fields stay intact

#### Scenario: Edit a supported sequential fallback

- **GIVEN** the active core and draft support editing a sequential fallback chain
- **WHEN** the user adds, removes, or reorders a backup resolver
- **THEN** Simple shows the actual ordered chain and stages the change using controls operable with a pointer and by keyboard

#### Scenario: Preserve an unsupported imported DNS configuration

- **GIVEN** the active core does not support the requested DNS edit, or Simple cannot represent an imported chain losslessly
- **WHEN** the user opens the DNS section or edits an unrelated assignment
- **THEN** available inventory and assignments remain usable, the unsupported edit is explained and unavailable, and the imported chain and its original strategy stay intact

#### Scenario: Change supported DNS options

- **GIVEN** the active core and draft support changing an IPv6 option or static DNS entry
- **WHEN** the user sets the IPv6 option or adds, edits, or removes a static entry
- **THEN** Simple validates the supported change and stages it without altering other DNS settings

#### Scenario: Show a confirmed DNS and traffic path mismatch

- **GIVEN** an existing diagnostic reports a DNS and traffic path mismatch
- **WHEN** the user opens DNS in Simple
- **THEN** the confirmed mismatch appears separately from informational help
- **AND** any offered correction shows the affected configuration in the draft before Apply

### Requirement: AC-118 Simple Routes lets users choose managed interception in context

Simple SHALL let users choose the devices included in supported managed interception. It SHALL distinguish that behavior from an optional proxy address for applications that explicitly use one and from imported advanced settings.

#### Scenario: Choose the devices to intercept

- **GIVEN** the current router and core support managed interception
- **WHEN** the user chooses all devices explicitly or selects specific devices in Simple
- **THEN** the proposed scope is shown in context and staged for the existing confirmation and rollback flow
- **AND** unrelated inbound and DNS settings stay intact

#### Scenario: Inspect an optional or unsupported configuration

- **GIVEN** a configuration includes an application proxy, an imported inbound outside managed interception, or an unsupported setup
- **WHEN** the user opens Interception in Simple
- **THEN** it distinguishes the application proxy from managed interception and explains what is unavailable for editing
- **AND** Simple preserves imported settings and presents configured state separately from any observed traffic status

### Requirement: AC-119 Simple Routes stages server and subscription additions in context

Simple SHALL use one contextual flow for adding a server or subscription to the shared draft. It SHALL show what it recognizes, which options the active core supports, and what will be added before Apply.

#### Scenario: Add a recognized server link

- **GIVEN** the user provides a supported server link
- **WHEN** Simple recognizes the link
- **THEN** it shows the proposed server settings and any omission warning required by AC-111
- **AND** it offers only eligible group choices and stages the user's confirmed choices without exposing credentials in warnings or summaries

#### Scenario: Add a recognized subscription link

- **GIVEN** the user provides a supported subscription link
- **WHEN** Simple recognizes it
- **THEN** it shows the proposed subscription name, available grouping, preset or custom refresh interval, and supported User-Agent settings
- **AND** choosing a browser profile supplies editable header text rather than making the browser fetch the subscription
- **AND** staging the subscription leaves the actual fetch to the router's existing Apply flow

#### Scenario: An import cannot be completed as entered

- **GIVEN** the input is ambiguous, invalid, unsupported, or matches an existing entry
- **WHEN** Simple evaluates it
- **THEN** it explains the issue and presents any supported next choice in the same context
- **AND** it does not overwrite an existing entry or stage an unresolved import automatically
