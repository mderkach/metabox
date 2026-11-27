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
- **WHEN** Simple receives an outbound-specific link or the user selects an outbound tile or uses the rule filter
- **THEN** it shows rules for that outbound with their original positions and identifies the selected tile when present
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
- **WHEN** the user reviews the proposed addition
- **THEN** Simple previews the effective route and DNS rule for the same service and device scope, including their positions, selected outbound and resolver
- **AND** staging prepares the whole pair in one draft operation, and the diff before Apply shows each actual edit
- **AND** existing unrelated routing and DNS rules remain intact

#### Scenario: Choose a catalog source and resolver before staging

- **GIVEN** multiple sources publish the same named service
- **WHEN** the user searches the catalog and picks a source and an outbound
- **THEN** Simple uses that source’s definition and limits the resolver choices to verified entries for the selected outbound
- **AND** a compatible service assignment is shown when available. Otherwise the user selects a resolver explicitly
- **AND** the user can cancel without adding a set, changing shared DNS assignments or modifying the draft

#### Scenario: Reuse a rule that already covers the service

- **GIVEN** an effective rule already covers the requested service and scope with the selected outbound or resolver
- **WHEN** the user previews the pair
- **THEN** Simple identifies the reused rule in the preview and keeps it in its original position without a duplicate or a diff entry
- **AND** only the missing part appears in the diff. Repeating a complete pair makes no edit

#### Scenario: A catalog set shares a cache key with a profile

- **GIVEN** a new or existing remote catalog set would use the effective tag of a WARP endpoint or a MASQUE outbound
- **WHEN** the user previews the service in Simple
- **THEN** the form identifies the conflicting tag and leaves the entire draft unchanged

#### Scenario: Separate one service from a shared DNS rule

- **GIVEN** a plain DNS rule matches several service sets and the selected service needs a different eligible resolver
- **WHEN** Simple previews a service-specific split
- **THEN** it offers the split only for proven disjoint sets when two adjacent rules at the original position preserve the other services' effective scope
- **AND** the diff shows the dedicated DNS rule, the selected set's removal from the shared rule, and any required route change
- **AND** if the sets may overlap or the rule contains conditions or options Simple cannot preserve, it names the shared rule and leaves the entire draft intact

#### Scenario: A catalog addition has no verified DNS mapping

- **GIVEN** the intended pair cannot be proven valid for the current core and draft, for example because the selected path has no eligible resolver or an imported rule would conflict
- **WHEN** the user attempts to stage the catalog service
- **THEN** Simple identifies the missing resolver, unsupported path or conflicting rule and its position when known, and leaves both the routing and DNS draft unchanged
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

#### Scenario: A compatible resolver is explicitly configured for a catalog service

- **GIVEN** the selected path has no eligible resolver and the user explicitly configures one
- **WHEN** that server is available in the candidate configuration and the user selects it for the service
- **THEN** Simple checks the transport and dial settings against the [verified outbound mapping](../../design.md#catalog-route-and-dns-mapping) and checks effective rule order before it can offer the pair
- **AND** an unassigned inventory entry alone never changes a route, a DNS rule or a shared assignment

#### Scenario: Edit a supported sequential fallback

- **GIVEN** the active core and draft support editing a sequential fallback chain
- **WHEN** the user adds, removes, or reorders a backup resolver
- **THEN** Simple shows the actual ordered chain and stages the change using controls operable with a pointer and by keyboard
- **AND** the primary stays fixed, backup choices come from earlier registered transports and only the selected fallback transport’s member list changes
- **AND** Simple explains when the core advances to another member and when a successful or nonexistent-domain response ends the search

#### Scenario: Preserve an unsupported imported DNS configuration

- **GIVEN** the active core does not support the requested DNS edit, or Simple cannot represent an imported chain losslessly
- **WHEN** the user opens the DNS section or edits an unrelated assignment
- **THEN** available inventory and assignments remain usable, the unsupported edit is explained and unavailable, and the imported chain and its original strategy stay intact

#### Scenario: Change supported DNS options

- **GIVEN** the active core and draft support changing an IPv6 option or static DNS entry
- **WHEN** the user sets the IPv6 option or adds, edits, or removes a static entry
- **THEN** Simple validates the supported change and stages it without altering other DNS settings
- **AND** the address-family field distinguishes the default, both family preferences and each single-family strategy, preserving equivalent imported representations when no change is requested
- **AND** a static entry belongs to a named or indexed hosts transport and can have one or more literal IPv4 or IPv6 addresses; its external files, other entries, server order, default resolver and DNS rules retain their configuration
- **AND** the user can inspect the edits in the shared document and in the existing diff before Apply

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
- **THEN** it shows the subscription name, available grouping, preset or custom refresh interval, and supported User-Agent settings. Groups can use an explicit subscription list or include all subscriptions automatically
- **AND** choosing a browser profile supplies editable User-Agent header text for the core to send when fetching the subscription
- **AND** staging the subscription leaves the actual fetch to the router's existing Apply flow

#### Scenario: Open the shared import from the Routes header

- **GIVEN** the Simple view is open with an empty or populated configuration
- **WHEN** the user opens “Server or subscription” from the Routes header, Outbounds, or the empty state when shown
- **THEN** the same dialog opens while preserving the current view, filter, and scroll position
- **AND** the header shows the view tabs, version history, and import action on desktop and mobile
- **AND** at narrow widths the header actions and the import dialog actions each stack in full-width rows
- **AND** closing the dialog returns focus to the opener or to the remaining Outbounds action when the starter disappears

#### Scenario: Keep common Routes controls in place across views

- **GIVEN** the user opens Simple, Editor, or JSON
- **THEN** the title, view tabs, draft indicator, and version history use the same header layout
- **AND** on a narrow screen the three tabs divide the available row equally and each outbound control in Simple occupies one full-width row
- **AND** the document path in Editor and JSON appears below the common controls

#### Scenario: An unverified HTTPS link opens the subscription form

- **GIVEN** a pasted HTTPS URL is eligible as a subscription address but its contents are unknown
- **WHEN** Simple evaluates the URL
- **THEN** it opens the subscription form in place and indicates that the link has not been verified
- **AND** evaluating the pasted URL neither fetches it nor stages a subscription
- **AND** the user can review the fields and explicitly stage or cancel the proposed subscription
- **AND** the address is masked in the form and its credentials are excluded from feedback and previews

#### Scenario: Credentials stay out of subscription diagnostics and previews

- **GIVEN** the subscription address contains credentials in its authority, path, query, or fragment
- **WHEN** the panel shows the address field, the draft diff, a validation message, or core output in its journal
- **THEN** it obscures the address in the field and hides the credentials in the displayed feedback
- **AND** the configured address sent on Apply is preserved

#### Scenario: Add a subscription at an existing URL

- **GIVEN** the full URL matches a subscription in the configuration or draft, and the new subscription has a provider tag that is unique across both
- **WHEN** the user stages the subscription from the standard form
- **THEN** Simple adds it as a separate draft entry with its own User-Agent, refresh interval, and group assignment
- **AND** the existing subscription stays intact, and the new subscription may use the same User-Agent
- **AND** Simple may show a non-blocking notice with a shortcut to the existing subscription and keeps URL credentials out of the notice
- **AND** fetching remains part of the existing Apply flow

#### Scenario: A subscription tag is already in use

- **GIVEN** the proposed provider tag is already in use in the configuration or draft
- **WHEN** the user attempts to stage the subscription
- **THEN** Simple asks for a unique tag in the same form and preserves the entered settings
- **AND** the draft is unchanged

#### Scenario: An import cannot be completed as entered

- **GIVEN** the input is ambiguous, invalid, unsupported, or is identified as a duplicate manually added server
- **WHEN** Simple evaluates it
- **THEN** it explains the issue and presents any supported next choice in the same context
- **AND** it does not overwrite an existing entry or stage an unresolved import automatically
