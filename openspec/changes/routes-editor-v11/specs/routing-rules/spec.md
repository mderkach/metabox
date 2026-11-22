## ADDED Requirements

### Requirement: AC-120 The Routes Editor opens a rule editor under its row

The Routes Editor SHALL expand the selected rule immediately below its row at desktop and phone widths. The expansion offers the schema Form and the rule's JSON over the same draft. It also links to the same rule in the whole-config JSON editor. Editing retains the existing validation, lossless writes and separate Apply operation.

#### Scenario: Open and close a rule in the list

- **GIVEN** a rule is visible in the Routes Editor, whether the list is filtered or unfiltered
- **WHEN** the operator opens the rule with its row control
- **THEN** the editor expands below that row and exposes its expanded state to assistive technology
- **AND** the rule's identity, list order and active filters remain visible or available in the same list
- **WHEN** the operator closes the expansion from within it
- **THEN** keyboard focus returns to the opening control and the list retains its scroll context

#### Scenario: Form and JSON edit one draft rule

- **GIVEN** the rule is expanded
- **WHEN** the operator switches between Form and JSON
- **THEN** valid edits refer to the same draft rule and unrelated config text remains unchanged
- **AND** validation feedback stays associated with its input, and switching views preserves the entered rule text
- **AND** neither view applies the draft to the router

#### Scenario: Open the same rule in the whole-config editor

- **GIVEN** the rule is expanded and exists in the draft
- **WHEN** the operator activates the whole-config link
- **THEN** the text editor reveals the corresponding rule in that draft, using the current document location
- **AND** the whole-config editor retains the raw-text behavior of AC-24 and AC-66

#### Scenario: Expanded content stays usable in a long list

- **GIVEN** a rule list long enough to scroll and an expansion with multiple fields
- **WHEN** the operator expands and edits the rule on a phone or desktop
- **THEN** the form can be reached and used without horizontal scrolling of the page
- **AND** the expansion is measured as part of the list, so scrolling keeps its content with the selected rule and does not cover adjacent rows
