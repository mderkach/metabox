---
name: metabox
description: Control panel for a sing-box router on OpenWrt; shows where traffic goes and lets you change it safely.
colors:
  primary: '#00b2f7'
  on-primary: '#060e15'
  background: '#090a0d'
  sidebar: '#050608'
  card: '#141518'
  popover: '#1b1d21'
  secondary: '#232428'
  muted: '#202226'
  accent: '#24292e'
  selected: '#222e39'
  meter-track: '#282a2f'
  foreground: '#f4f5f6'
  muted-foreground: '#9a9ea7'
  border: '#ffffff1a'
  input: '#ffffff29'
  destructive: '#f4545b'
  route-direct: '#37c7ae'
  route-proxy: '#22b8fb'
  route-block: '#f75c61'
  route-dns: '#b28fef'
  route-neutral: '#9a9ea7'
  signal-ok: '#37c7ae'
  signal-warn: '#f0b550'
  signal-bad: '#f75c61'
  signal-idle: '#60636a'
  series-down: '#22b8fb'
  series-up: '#f0b550'
  code-string: '#73ce95'
  code-number: '#fc9f7f'
  code-literal: '#bc98f9'
  code-comment: '#7a808d'
  light-primary: '#0073bd'
  light-background: '#f8f9fb'
  light-sidebar: '#eff1f5'
  light-card: '#ffffff'
  light-selected: '#d6e9f7'
  light-foreground: '#14171d'
  light-muted-foreground: '#5b5f68'
  light-border: '#dadce0'
  light-route-direct: '#006f5e'
  light-route-proxy: '#006db7'
  light-route-block: '#c51c2b'
  light-route-dns: '#724aab'
  light-signal-warn: '#945500'
typography:
  display:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '1.75rem'
    fontWeight: 600
    lineHeight: '2rem'
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: '1.625rem'
  title:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 600
    lineHeight: '1.25rem'
  body:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: '1.25rem'
  label:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: '1rem'
    letterSpacing: '0.06em'
  metric:
    fontFamily: 'Geist Variable, sans-serif'
    fontSize: '1.375rem'
    fontWeight: 600
    lineHeight: '1.75rem'
  mono:
    fontFamily: 'Fira Code Variable, ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: '0.75rem'
    fontWeight: 400
    lineHeight: '1.25rem'
    fontFeature: "'calt' 0"
rounded:
  sm: '8px'
  md: '10px'
  lg: '14px'
  xl: '16px'
  2xl: '20px'
  pill: '32px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.on-primary}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
    typography: '{typography.title}'
  button-outline:
    backgroundColor: '{colors.input}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  button-destructive-outline:
    textColor: '{colors.destructive}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  button-ghost:
    textColor: '{colors.foreground}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  input:
    textColor: '{colors.foreground}'
    rounded: '{rounded.lg}'
    padding: '4px 10px'
    height: '32px'
  card:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.xl}'
    padding: '16px'
  badge:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    height: '20px'
  condition-chip:
    backgroundColor: '{colors.muted}'
    textColor: '{colors.muted-foreground}'
    rounded: '{rounded.md}'
    padding: '0 8px 0 6px'
    height: '24px'
  nav-item:
    textColor: '{colors.muted-foreground}'
    rounded: '{rounded.md}'
    padding: '6px 10px'
    height: '32px'
  nav-item-active:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
  proxy-node-tile:
    backgroundColor: '{colors.card}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '8px 10px'
  proxy-node-tile-selected:
    backgroundColor: '{colors.selected}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '8px 10px'
---

# Design System: metabox

## Overview

**Creative North Star: "The Night Console"**

metabox is opened in the evening, in a window next to an SSH session to the router. The panel behaves like an instrument console in a dark room: a near-black, cold-tinted base, quiet surfaces separated by hairline edges, and color that appears only where it carries meaning. Every hue on screen answers one question: what happens to a packet, or how healthy something is.

Density is that of a working tool, not a marketing page. Small type (14px body, 12px secondary), tight 32px controls, tables of hundreds of rows, monospace for anything that is literally in the config (tags, domains, addresses, numbers). The dark theme is the primary one; the light theme is fully built and uses the same hues at a lower lightness.

The interface reads as two layers. The prose layer (Geist) explains: screen titles, status sentences like "Everything works", column labels. The data layer (Fira Code, ligatures off) is the config and the live state itself. A user tells them apart at a glance.

**Key Characteristics:**

- Near-black base with a cold blue undertone (hue 265), surfaces stepped by lightness, not by shadow.
- One accent, azure. Everything else colored is a domain signal: route action, health, chart series, log level, JSON syntax.
- Monospace for config values, sans for explanations.
- Flat surfaces with a 1px translucent edge; shadow only on floating layers.
- Persistent left sidebar on desktop, bottom tab bar on phone (from 400px).

## Colors

A dark, cold, near-neutral base where color is a vocabulary of packet fates and health states, with a single azure accent.

### Primary

- **Signal Azure** (`primary`): the only accent. Primary buttons, focus rings, the selected-item edge, the active tab underline, the check mark on the chosen proxy node, the caret. In the light theme it becomes `light-primary`.

### Secondary: route actions

Four fates of a packet plus a neutral. A rule's action and a connection's route wear these as text color, so the action is understood before it is read.

- **Direct Teal** (`route-direct`): traffic goes out without a proxy.
- **Proxy Azure** (`route-proxy`): traffic goes through a proxy node or group. Shares its hue with the accent on purpose.
- **Block Coral** (`route-block`): traffic is rejected.
- **DNS Violet** (`route-dns`): DNS hijack.
- **Neutral Slate** (`route-neutral`): actions that are not an exit, such as sniffing.

### Tertiary: health and series

Health reuses the route hues so the palette stays one system.

- **OK Teal** (`signal-ok`) = Direct Teal: running, fast node (under 300 ms), success.
- **Warn Amber** (`signal-warn`): slow node (over 300 ms), degraded state.
- **Bad Coral** (`signal-bad`) = Block Coral: down, no response, failure.
- **Idle Graphite** (`signal-idle`): unknown, not yet checked.
- **Download Azure / Upload Amber** (`series-down`, `series-up`): traffic chart series, separated by hue, never by lightness.
- **Code tones** (`code-string`, `code-number`, `code-literal`, `code-comment`): JSON highlighting, a separate group so retuning action hues never touches the editor.

### Neutral

- **Night Base** (`background`): the screen behind everything.
- **Deep Rail** (`sidebar`): the sidebar, one step darker than the screen so content reads as lifted.
- **Panel Graphite** (`card`): cards, tables, lists.
- **Float Graphite** (`popover`): menus, popovers, dialogs.
- **Quiet Fill** (`secondary`, `muted`): chips, secondary buttons, hover fills.
- **Selection Ink** (`selected`): a selected row or tile. An opaque surface one step above the card, never alpha.
- **Track Graphite** (`meter-track`): the empty part of a progress meter.
- **Paper White** (`foreground`): primary text.
- **Fog Grey** (`muted-foreground`): secondary text, column labels, units.
- **Hairline** (`border`, white at 10%) and **Field Edge** (`input`, white at 16%): edges and input strokes.
- **Alarm Coral** (`destructive`): irreversible actions and errors.

### Named Rules

**The Meaning-Only Rule.** Color is never decoration. If a hue does not encode a route action, a health state, a chart series, a log level or a code token, it does not appear. Everything else is the neutral ramp.

**The One Accent Rule.** Azure is the only accent. A second accent color (purple CTA, gradient, brand orange) is not allowed.

**The Opaque Selection Rule.** Selection is a separate opaque surface plus an azure edge or a check mark, never a translucent fill. Selected must be distinguishable from hover without peering, and one of the two marks is not color-based.

## Typography

**Body Font:** Geist Variable (with sans-serif)
**Mono Font:** Fira Code Variable (with ui-monospace, SFMono-Regular, Menlo), ligatures disabled

**Character:** Geist is neutral and compact, it explains. Fira Code is the voice of the config: tags, domains, IPs, ports, sizes, delays. Ligatures are off because `->` and `!=` in domains and regexes must look exactly as in the file.

### Hierarchy

- **Display** (600, 28px, 32px line, -0.02em): screen title only, one per screen ("Overview", "Configuration").
- **Headline** (600, 18px, 26px line): screen section ("Traffic", "Node groups").
- **Title** (600, 14px, 20px line): card title, sentence case.
- **Metric** (600, 22px, 28px line): the big number on a stat card, tabular figures.
- **Body** (400, 14px, 20px line): rows, descriptions, status sentences. Secondary text drops to 12px in Fog Grey.
- **Label** (500, 12px, 0.06em tracking, uppercase): table column headers only.
- **Mono** (400 or 500, 12–14px): every value that exists in the config or the live state.

Sizes run 10/12/14/16/18/22/28/36px and are always multiples of two.

### Named Rules

**The Two Voices Rule.** If the text is in the config or comes from sing-box, it is monospace. If the panel wrote it to explain something, it is sans. Never mix within one token.

**The Caps-Are-Columns Rule.** Uppercase tracked labels belong to table headers only. A card title in caps reads as part of a table.

## Layout

Desktop: a fixed left sidebar (232px, collapsible to 56px) with the logo, eight sections and a footer holding the sing-box status, daemon version, theme switch (system / light / dark) and language switch (RU / EN). The content area has a page header strip (title, optional file path in mono, actions on the right) with a bottom hairline, then content padded 24px (16px on phone).

Content is built from cards in a responsive grid: three columns on wide screens for summaries, full-width cards for tables. Gaps between cards are 12–16px. Section headings sit outside cards with 24–32px above.

Tables are full-width cards: a toolbar row (search field with a `/` shortcut hint, dashed facet filters, actions at the right), an uppercase column header, then rows of 48px with hairline separators and a footer count. Long lists are virtualized.

Phone (from 400px): the sidebar becomes a bottom tab bar with five items and "More"; cards stack into one column; controls grow to a 44px touch target under a coarse pointer while desktop density stays unchanged.

Spacing follows a 4px grid; the working steps are 4, 8, 12, 16, 24.

## Elevation & Depth

Flat by default. Depth comes from tonal steps of the cold neutral ramp (sidebar darker than the screen, card lighter, popover lighter still) and from a 1px edge: `ring-1` of the foreground at 10% on cards. Shadows appear only on layers that float over content: dialogs, menus, the bottom sheet, the floating apply bar. Motion is short and functional: 240ms enter, 180ms exit, `cubic-bezier(0.16, 1, 0.3, 1)`; screen changes shift content 12px in the navigation direction; everything respects reduced motion.

### Named Rules

**The Flat-At-Rest Rule.** Nothing in the page flow has a shadow. If it does not float over other content, it is lifted by tone and edge only.

## Shapes

Softly rounded rectangles. Controls (buttons, inputs, selects) use 14px corners; cards and table containers 16px; condition chips and proxy tiles 10px; tiny key hints 8px; badges and status pills are fully rounded. No sharp corners, no circles except status dots (8px) and the logo tile. Facet filters use a dashed 1px border to read as "optional, not set yet"; once set they become solid.

## Components

### Buttons

Quiet and compact; the primary action is rare.

- **Shape:** gently rounded (14px), height 32px (28px small, 24px extra small), 14px medium text, optional 16px Lucide icon.
- **Primary:** Signal Azure fill with near-black text. One per view at most, usually "Apply".
- **Outline (the default in practice):** translucent white fill (16% white over the surface) with a hairline edge; "Restart", "Check", "Version history".
- **Destructive outline:** Alarm Coral text and a coral edge at 40%, no fill; "Stop", "Close all connections", "Discard changes". A filled coral button would read as an error message.
- **Ghost:** no fill until hover.
- **Hover / Focus:** hover adds a muted fill; focus shows a 3px azure ring at 50%; press nudges down 1px.

### Chips and Badges

- **Condition chip:** 24px tall, Quiet Fill (`muted`) background, 10px corners, 12px text, a sans key in Fog Grey followed by a mono value in Paper White ("Domain suffix `persona.com`"). Overflow collapses to "and 2 more".
- **Badge:** pill, 20px tall, 12px medium text; marks a group type ("manual choice", "fastest").
- **Counter:** a bare mono number after a tab label ("Routing 43").

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** Panel Graphite.
- **Shadow Strategy:** none; see Elevation.
- **Border:** 1px foreground at 10%.
- **Internal Padding:** 16px (12px for compact cards). A card with a header strip separates it with a hairline and lets content run edge to edge.

### Inputs / Fields

- **Style:** 32px tall, 14px corners, Field Edge stroke, translucent fill in dark, transparent in light. Search fields carry a leading magnifier and a trailing `/` key hint.
- **Focus:** azure border and a 3px azure ring at 50%.
- **Error / Disabled:** coral border with a coral ring at 20–40%; disabled drops to 50% opacity.

### Navigation

- **Sidebar item:** 16px icon plus 14px label in Fog Grey; hover lightens; the active item gets an Accent fill, Paper White text and a 2px azure bar on the left edge.
- **Tabs:** text tabs with a mono counter; the active one is Paper White with a 2px underline.
- **Phone:** bottom tab bar, icon over a small label, azure for the active item.

### Rule Row (signature)

The core of the editor. A numbered row: index in mono, conditions as chips, an arrow, then the action colored by its route hue in mono when it is a node tag ("seattle-fallback") or sans when it is a verb ("hijack DNS"), and a hit counter at the right. Selected rows get Selection Ink plus a 2px azure left edge.

### Proxy Node Tile (signature)

A small card in a grid: node tag in mono, protocol below in Fog Grey, delay at the right in mono colored by health (teal under 300 ms, amber above, coral "no response"). The chosen node is Selection Ink with a 1px azure edge and a check mark before the name.

### Status Line (signature)

Every screen header can carry one status sentence with a state icon ("Everything works", "Waiting for the first data from sing-box") and an explanation in Fog Grey. State is always visible; "the service is down" and "the panel is unreachable" are distinct states, not edge cases.

### Meter and Sparkline

Thin 4px meters on Track Graphite colored by series or route; stacked meters for shares (TCP/UDP, received/sent). Line charts use 1.5px azure and amber strokes on a dotted grid with mono axis labels.

## Do's and Don'ts

### Do:

- **Do** use the route hue as text color for a rule's action and a connection's route, in both themes.
- **Do** set every config value (tag, domain, IP, port, size, delay) in Fira Code with ligatures off.
- **Do** mark selection with the opaque Selection Ink surface plus an azure edge or a check mark.
- **Do** keep font sizes and radii on multiples of two (sizes 10/12/14/16/18/22/28/36px, radii 8/10/14/16/20/24/32px).
- **Do** design both themes: dark is primary, light uses the `light-*` tokens with the same hues at lower lightness.
- **Do** show the destructive action as a coral outline, never a coral fill.
- **Do** give every screen a visible state for "sing-box stopped" and "no data yet".

### Don't:

- **Don't** add decorative color, gradients, glows or a second accent.
- **Don't** separate states or chart series by lightness alone.
- **Don't** use translucent fills for selection or table hover: pinned columns scroll under them.
- **Don't** put shadows on cards in the page flow.
- **Don't** use uppercase tracked labels outside table column headers.
- **Don't** render the product name other than lowercase `metabox`, or sing-box other than `sing-box`.
