## Context

The router already renders Overview at its own address. The root only selects an initial destination.

## Decision

Redirect from the root to Overview independently of viewport width. Keep the responsive sidebar and bottom bar. The Configuration menu entry continues to open Simple Routes.

## Verification

Exercise entry through the root in desktop and phone browsers and follow the Configuration menu item. The existing tests for direct editor links remain applicable.
