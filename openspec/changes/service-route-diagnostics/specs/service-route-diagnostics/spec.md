## Purpose

Let users open Diagnostics for a configured service and understand which network path each observation or measurement represents.

## ADDED Requirements

### Requirement: AC-127 Simple Routes opens Diagnostics for an applied service rule

Simple Routes SHALL offer an accessible “Check route” action for an identifiable applied service rule. The action opens Diagnostics with that rule selected. Navigation alone starts no probes and changes neither the draft nor the running configuration.

#### Scenario: Open the current rule from the service list

- **GIVEN** an applied service rule shown in Simple Routes
- **WHEN** the user activates “Check route” in either rule ordering, with or without an outbound filter
- **THEN** Diagnostics identifies the selected rule and its configured outbound from the applied configuration

#### Scenario: Explain an unapplied or stale rule

- **WHEN** the displayed draft rule has no matching applied rule, or the selected rule cannot be resolved against the applied revision
- **THEN** the panel explains that the displayed rule cannot be checked and does not silently select another rule
- **AND** Diagnostics produces no result attributed to that rule

#### Scenario: Distinguish observations from configuration

- **WHEN** Diagnostics displays the selected rule
- **THEN** it separates the configured outbound from any matching connection observed by the core
- **AND** it identifies the device, rule, observed outbound or node, and observation time when known
- **AND** it shows the absence of a matching observation explicitly

### Requirement: AC-128 Diagnostics reports scoped network path measurements

On explicit request, Diagnostics SHALL report TCP/HTTPS, UDP/STUN and DNS separately. Each result identifies its measurement source, target, method and path when known. It reports observed values as evidence for the tested path and marks unsupported or inconclusive checks as unknown.

#### Scenario: Compare protocol and resolver paths

- **GIVEN** a selected rule and a supported route for a measurement
- **WHEN** the user runs the network path checks
- **THEN** each supported address probe shows the address observed by its target and the outbound or direct path tested
- **AND** each DNS result identifies its measurement method, including router resolver, WAN observation or independent DoH where available

#### Scenario: Attribute a probe only to the path measured

- **WHEN** a probe originates on the router or goes to an IP-reflection endpoint whose route equivalence to the selected service cannot be established
- **THEN** the result identifies its own source and target
- **AND** the panel does not attribute it to a selected LAN device, browser, or service path without corresponding evidence

#### Scenario: Preserve uncertainty when a probe cannot finish

- **WHEN** a probe times out, its method is unavailable, or its intended outbound cannot be proven
- **THEN** the panel reports an unknown or unavailable result with the reason
- **AND** it does not infer matching routes, blocked traffic, or absence of leaks from that result

#### Scenario: Do not reroute a failed diagnostic attempt through WAN

- **GIVEN** a routed probe whose selected proxy is unavailable
- **WHEN** the user runs that probe
- **THEN** it does not send the request through a direct fallback and reports the unavailable path
- **AND** a direct comparison is separately identified and runs only when requested
