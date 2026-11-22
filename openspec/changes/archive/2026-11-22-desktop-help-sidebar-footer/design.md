# Design

## Design brief

Where can a user find the full connection walkthrough without interrupting the main navigation? Place a Help link immediately above the existing sidebar footer controls. Use the application's existing link styles and a help icon. In collapsed mode the icon retains the same accessible name. The link occupies its natural keyboard order after the main sections and shows the current-page marker on the help route. On phones the established More entry and its full name remain the entry point.

## Implementation

Keep one help destination in the navigation model. Use a desktop section list and a phone list with help at the top for More. Keep route transitions based on the desktop navigation order under [ADR-0026](../../../../docs/adr/ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md). The footer uses the same inactive, hover, focus and active styles as the main section links. The help content, path and router redirects are independent of placement.

## Alternatives considered

- Keep help first on desktop. It keeps the existing layout but takes the first position in the list of primary tasks from Overview.
- Put help behind an icon in the desktop header. It would introduce another help location and an icon-only action in the expanded shell. The footer provides a labeled link in the sidebar's normal tab order.
- Promote help to the phone bottom bar. The existing More entry preserves the five established section destinations in the smaller layout.

The change concerns one navigation entry and uses the existing shell and route transition contract. No new architecture decision is required.
