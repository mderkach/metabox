# Lists and tables

Rules for screens that show many uniform rows: connections, routing, rule sets,
logs. The basis is a [competitor review and practices for working with large
data](#sources).

## When this applies

A list counts as a table when a row has more than two fields and they are read
in columns, not as a paragraph. Three rows with a couple of fields are a `dl` or
a `ul`, and nothing here applies to them.

## Engine

The table model is `@tanstack/react-table`. It draws nothing: markup, themes and
virtualization stay ours, while it holds sorting, filters, column visibility and
column order.

- Features are plugged in by name through `tableFeatures`: only what is listed
  gets into the build. We do not enable an extra feature "for later".
- Cell rendering is a "field → component" table in its own module, not `cell` in
  the column definition: the definition stays data and is read as a whole, and a
  new column is added by an entry in the layout, in the field set, in the column
  definitions and in the cell table.
- The column definition is narrowed by our own type: the library keeps `id` as a
  string and `meta` as optional, for us both are guaranteed. The header and the
  row read the definition from their own array, not through the table state;
  otherwise type casts appear that must not exist.

## Columns

**One column is one field, one sort key, one filter.** A column that packs two
fields cannot be honestly sorted or filtered: the key has to be glued together,
and the result is an order that does not exist in the data. Width is saved by
hiding columns, not by gluing fields.

First of all, different axes and different links of the causal chain are split:
source and destination are "who started" and "where it went"; rule, action and
chain are "why it matched", "what was decided", "what it went through". Each of
these questions is asked separately, so filtering by them must be separate too.

A composite cell stays legitimate where two values read as one fact and are not
queried separately: the inbound and outbound direction of one quantity. Two
different quantities, rate and accumulated volume, are already two questions
and two columns.

A row action lives in its own column, not inside a data cell: hidden in a cell,
it disappears together with a hidden column.

A column without which a row stops answering the screen's question is marked
mandatory: it is visible in the column list, but it cannot be turned off.

## Anatomy

One order of parts for all lists:

```
list card
├ toolbar   search [facet] [facet] … [reset all] ···· [view] [list actions]
├ header    label ⇅ • | label ⇅ | …
├ rows      virtualized
└ footer    "showing N of M" ····· [export]
```

`•` is the filter marker on a column whose field has a facet set.

- **List actions live in its card.** A button that works on rows does not sit
  in the page header: at a distance the connection is not readable. The page
  header is the title and the screen state, not a toolbar.
- **Export is in the footer, next to the counter.** Exactly what the counter
  names is exported, and this is visible in one place.
- **View controls are separate from actions.** Column choice, density and
  display mode change the picture, not the system; they sit to the left of the
  actions and are not part of their row.
- **The destructive action is single, at the edge, behind a separator, outlined
  in the danger tone.** A fill in the danger tone among regular buttons reads as
  an error message, not as an available action. The action is disabled when
  there is nothing to apply it to. On a narrow width the toolbar wraps, and a
  separate button lands under the search, in the thumb zone: there the
  destructive action moves into the list actions menu "⋯", the confirmation
  stays the same.

## Virtualization instead of pagination

Rows are virtualized with `@tanstack/react-virtual`. We do not add pagination:
with five thousand live connections (NFR-2) that is a hundred pages, and the
answer to "who is eating the bandwidth right now" is scattered across them.

Because of virtualization the table is built with ARIA roles, not the `table`
tag: rows are positioned absolutely, and `display` on top of table tags breaks
their parsing by assistive technologies. `aria-rowcount` describes the full
list, not the rendered window. Details: [Architecture&Style.md](./Architecture&Style.md),
the "Markup" section.

## Sorting

- **Sorting is disabled per column, not for the whole table.** In the engine it
  is opt-out: `enableSorting ?? true`, so a column for which sorting makes no
  sense must get `enableSorting: false`. Silence enables sorting, it does not
  disable it.
- **Where the row order carries meaning itself, there is no sorting.** In
  routing, rules are checked top to bottom, and a sorted list would show an
  order that does not exist. The refusal is recorded in the code with a reason.
- **A live list goes in stream order by default.** A snapshot arrives once a
  second, and any other order rearranges rows under the cursor. The arrow in the
  header is a sign that the list is no longer in stream order.
- **A column is sorted by a stable key, not by what is drawn.** Rate and volume
  are split into two columns: volume accumulates and the list is read by it,
  rate is recomputed every second. Sorting by rate is available, but it
  rearranges rows under the cursor, so by default the list goes in stream order.

## Filters

- **Global search** goes over a prebuilt string (`searchText` in the model), not
  over the fields on every keystroke.
- **Filtering by field is a facet in the toolbar, not a field in the header.** A
  facet is a button in the row with the search; it opens a list of values with
  search over them, multiple selection and reset. Values inside a facet are
  combined with "or", facets with each other with "and". The selection is
  visible on the button itself: one value as a label, several as a number. When
  anything is selected, "Reset all" appears on the right. A substring in the
  column header does not give this: you cannot see which values exist at all,
  and you cannot select two at once.
- **The column header carries the filter marker** for its field: without it an
  empty table looks like a breakage, not like a filter result.
- **Facets are slices by the screen's question, not by all fields in a row.** On
  connections these are device, action, rule, chain and network: "whose it is",
  "where it went" and through what.
- **Facet values are all that exist in the tab, and the counter is computed with
  the other facets and the search, but without its own.** A value does not
  disappear because of its own selection or a neighbour's, and the number next
  to it says how many rows selecting it adds. The order of values does not
  depend on counters: they change every second and would rearrange values under
  the cursor.
- **Filtering and counters are computed in one pass over the rows**, not one
  pass per facet: with five thousand rows and a snapshot every second it would
  not fit otherwise.
- **The filter lives in the URL.** A link to a filtered list can be shared; one
  value is written as a string, several as a list, and old links with one value
  keep working.
- **Filtering is client-side while the whole snapshot is in the panel.** Going
  to the device for a filtered list would mean showing something other than
  what is in the store.

## The view survives a reload

Visible columns and their order, density, sorting and the refresh interval are a
personal setting, like theme and language, and are stored in the same place, in
`localStorage`. Several people open the router panel, and one shared setting for
everyone would be a restriction.

The order is changed with "up" and "down" buttons in the field picker, not by
dragging the header: the buttons are available from the keyboard and to a
screen reader without a separate protocol. It is stored as a list of
identifiers: an unknown one is skipped, a missing one (a new column, or a view
saved before reordering) goes to the end in the order of the definitions.

## Density and narrow screens

- Density is a set of named modes, not an arbitrary number.
- **Columns do not shrink.** Address, rule and chain get truncated beyond
  recognition before the screen becomes narrow. While the table stays a table,
  it scrolls horizontally as a whole, together with the header.
- **A row is never anonymous.** The column by which a row is recognized stays in
  place during horizontal scrolling: otherwise the screen shows the middle of
  the rows, and there is nothing to tell which object they belong to.
- **Below the width at which the table stops being readable, a row unfolds into
  a "label — value" list.** Horizontal scrolling on a phone is not an answer:
  the user sees fragments of columns without an anchor. The list loses no field:
  hidden columns stay hidden, all visible ones are shown.
- **One scroller for both axes, a sticky header.** A vertical viewport inside a
  horizontal container drifts away from the header: with `overflow-y-auto` the
  browser computes `visible` on the other axis as `auto`, the viewport gets its
  own horizontal scroll and slides out from under the header. Closing it with
  `overflow-x-clip` is not possible: then rows are clipped to the viewport width
  instead of scrolling. One element scrolls, the header inside it is `sticky`,
  and both axes stay consistent.
- **The minimum width is computed from the visible columns, not taken as a
  constant.** A constant for the full set would mean that hiding columns does
  not make the table narrower, which is the reason hiding exists. The width is
  set once on the wrapper that contains both the header and the rows: when they
  have different values, the header background breaks off in the middle of the
  scroll, and the rows compute their width from the visible part.

## States

A list must respond to each of its states, and all of them are written before it
gets on screen: loading, empty, "empty because of a filter", source failure,
overflow. "Empty" and "empty because of a filter" are different screens: the
second has a button that clears the filter.

Loading is skeleton rows until the first snapshot, empty and "empty because of
a filter" are `Empty`, source failure is `QueryFailure` ([Query.md](./Query.md),
"Block states"). Overflow is a line in the footer next to the counter: closed
connections are trimmed by a limit, and the footer says how many rows were
evicted.

## What we do not do

- Pagination: see above.
- A display mode as a user setting (`Auto / Table / Cards`, as in metacubexd):
  the screen chooses the width, not the person. The setting will appear only if
  a scenario turns up where the automatic choice gets in the way.
- Sorting and filtering by a field that is not in the row model: a column does
  not invent data that the source did not provide.

## Sources

A competitor review of b4, Re:HomeProxy and metacubexd and practices for working
with large tables:

- [Data table UI design reference guide](https://www.setproduct.com/blog/data-table-ui-design)
- [Best practices for creating user-friendly data grids](https://www.telerik.com/blogs/best-practices-creating-user-friendly-data-grids)
- [Best React data grid for large datasets](https://www.infragistics.com/blogs/best-react-data-grid-for-large-datasets-performance-guide)
