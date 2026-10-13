# Frontend architecture and style guide

The structure of `apps/web/src` and the rules for writing code.

## Methodologies

The structure is [Feature-Sliced Design](https://feature-sliced.design/ru/docs/get-started/overview). Slice names come from the domain concepts of the sing-box config (`Inbound`, `Outbound`, `Route`, `RuleSet`): one language for the code and the domain, as DDD (domain-driven design) requires.

### Assignment of responsibilities

SOLID (five principles of object design) and GRASP (general responsibility assignment software patterns, nine patterns for assigning responsibilities) are read here as rules for placing code. These are target statements: some of them apply to modules that do not exist yet.

**SOLID**

- **Single responsibility** (SRP). A slice is responsible for one domain area, a segment for one kind of code. A component that fetches data itself, draws itself and validates itself is split across `api`, `ui`, `model`.
- **Open/closed** (OCP). A new schema node type is added as a form in its own slice; the autorenderer and the screen frame are not edited for it.
- **Liskov substitution** (LSP). An implementation is substituted for the contract without weakening it: any variant of a discriminated union of the schema is handled by code that accepts the node, and a new schema version adapter takes the place of the old one without edits in the calling code.
- **Interface segregation** (ISP). Only what the consumer needs goes out through `index.ts`; the rest of the slice depth is closed by the Public API, and a neighbouring slice gets its own narrow cut through `@x`.
- **Dependency inversion** (DIP). Screens depend on the internal model, not on the fork's schema. A breaking schema change edits the `api` segment of its slice and does not reach the screens: the application's three-layer model rests on this.

**GRASP**

- **Information expert.** Logic lives where the data is: parsing, validation and config invariants are in `entities/*/model`, not in the component that shows them.
- **Creator.** A model is created by the slice that owns it: `Rule` is assembled in `entities/Rule`, not in the form that fills it in. Query options and keys are assembled by factories in the `api` segment of their slice.
- **Controller.** A user scenario is handled by a `features/*` slice, the page only composes. A handler in `pages/*` that knows the request format is a placement error.
- **Low coupling.** A slice does not know its neighbours: the connection goes only through lower layers, `@x` or a shared store. The linter catches a direct import of a neighbouring slice.
- **High cohesion.** A segment holds one kind of code, a slice one area. An overgrown `lib` that holds everything is split, not extended.
- **Polymorphism.** Branching by node type is a "type → component" table in the autorenderer, not an `if` chain over `type`. A new type is added by an entry in the table.
- **Pure fabrication.** A module with no counterpart in the domain is created deliberately and lives in `shared`: `shared/lib/state` (`stateCreator`, `createReactSelectors`), `ApiClient` in `shared/api`. There are no such modules in `entities`.
- **Indirection.** Between a foreign format and the application model stands the "schema / adapter" boundary: the schema in `api` describes the DTO, the adapter in `model` converts it into the model and carries field renames and migrations; neither side knows about the other.
- **Protected variations.** Points of instability are isolated: the fork schema by the `api` and `model` segments of the `Config` and `Rule` slices, the Clash API by the same segments of the `Connection`, `Proxy` and `Daemon` slices, the dependency on shadcn by the `shared/ui` vendor zone.

## FSD

### Layers

The layer set is trimmed: there are ten screens. An empty layer is not created in advance.

| Layer       | Purpose                                                                                                           | Created        |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| `app/`      | startup: router, providers, global styles, entry point                                                            | from the start |
| `pages/`    | router screens (Editor, RuleSets, RawConfig, Section, Overview, Proxies, Connections, Devices, Logs, Diagnostics) | from the start |
| `widgets/`  | self-contained parts of a screen: the config tree, the diff panel, the connections table                          | as needed      |
| `features/` | user actions: `Config/ConfigApply`, `Rule/RuleEdit`, `Connection/ConnectionClose`                                 | as needed      |
| `entities/` | domain entities: `Config`, `Rule`, `RuleSet`, `Route`, `Proxy`, `Connection`, `Daemon`, `Device`, `Log`, `Diag`   | from the start |
| `shared/`   | reusable code without domain specifics: UI primitives, the http client, helpers                                   | from the start |

`app` and `shared` have no slices: they consist of segments directly.

### Slices

A slice is a domain area. Slices **do not import other slices of the same layer**: `features/RuleAdd` cannot import `features/RuleReorder`.

Related slices get a grouping folder: `features/Rule/{RuleAdd,RuleReorder,RuleDelete}`. A group is not a slice and has no public API.

Cross-imports go only through the `@x` segment (FSD 2.1):

```text
entities/Outbound/@x/rule/index.ts   // what Outbound allows the Rule slice to import
```

```ts
// entities/Outbound/@x/rule/index.ts
export { OUTBOUND_TYPE } from '../../model';
export type { OutboundRef } from '../../model';
```

The importing side writes `import { OUTBOUND_TYPE } from "@entities/Outbound/@x/rule"`. Everything not exposed in `@x` is closed to the neighbouring slice.

### Segments

| Segment  | What is inside                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------- |
| `ui`     | components, formatters for display                                                                              |
| `api`    | requests to the daemon: fetch functions, query options, stream topic subscriptions, DTO schemas                 |
| `model`  | the slice's domain knowledge: schemas, types, stores, constants, domain rules, including those packed in a hook |
| `lib`    | code without domain knowledge: utilities, tool hooks, composition of ready parts for a screen                   |
| `config` | configuration and feature flags (as needed)                                                                     |

A segment is chosen by the knowledge inside the file, not by the shape of the code. A hook that knows a domain rule (what counts as an unapplied draft, where in the config the needed node lives) lives in `model`. A hook that calls a query, a store and a mapper and lays out the result for one screen carries no domain knowledge and lives in `lib`.

**A slice in a group starts with the group name.** The group is named after the domain, so `Daemon/DaemonTraffic`, not `Daemon/TrafficChart`: the slice name reads both in an import and in a file list where the group folder is not next to it. The same applies inside: a component of the `DaemonService` slice is called `DaemonService`, not `ServiceStatus`. Checked by `fsd/slice-name`.

**Adapters of foreign APIs are part of the slice, not a separate layer.** The response shape is described by a schema in `api/<Slice>.schema.ts`, conversion into the screen model and the failure decision are in `model/<Slice>.adapter.ts` of the same slice. The model is what goes out through `index.ts`: the source shape does not cross the slice boundary, so a format change stops there. The project has no `src/adapters/` directory, and creating one is forbidden.

A schema describes the shape and does not convert: `.transform()` inside it is forbidden; `ZodObject` turns into `ZodPipe` and loses `.extend()`, `.omit()`, `.pick()`, while over a clean schema you can keep any number of adapters, including a reverse one.

**The file's role determines the segment, not the suffix.** `api/<Slice>.schema.ts` is the source shape, `model/<Slice>.model.ts` and form schemas in `model` are the application model. The same `.schema.ts` suffix appears in both segments, and the role must not be inferred from the file name: `features/Rule/RuleEdit/model/RuleEdit.schema.ts` describes the user's form, not the daemon's response.

### Localization

Interface text lives in the `i18n` segment of the slice that shows it: `features/Rule/RuleEdit/i18n/ru.json`. The namespace is the slice path from `src`, so the component names it in full:

```tsx
const { t } = useTranslation('features/Rule/RuleEdit');
```

This way `t` knows only the keys of its own slice: a foreign key will not be substituted and will not appear in autocompletion.

**Keys are typed from the JSON itself.** `tools/i18n.ts` prints `src/i18n.generated.d.ts`, a map of the form `'features/Rule/RuleEdit': typeof import('./features/Rule/RuleEdit/i18n/ru.json')`. Keys are not copied into it, so the file changes only when a locale appears or disappears. The import in the map exists only as a type and is erased at build time. The artifact is not edited by hand: on the dev server it is updated by the `metabox-i18n` plugin, in the build by the `gen:i18n` step.

**A dictionary arrives over the network as a file, not as a chunk.** The build puts each `i18n/<language>.json` into `dist/locales/<namespace>/<language>-<fingerprint>.json`, the runtime loads it with `fetch` (`app/lib/i18n.ts`). The text is in no build module, so a wrong import cannot pull it into the bundle: there is nothing to import.

The fingerprint in the name is the same as for other assets and gives the same result: the daemon serves such a file with a permanent cache, and a new panel version arrives under a new address. The runtime cannot know the name in advance, so the address map is printed by the build plugin: the `virtual:metabox-locales` module, declared in `src/viteEnv.d.ts`. On the dev server there is no fingerprint: the dictionary is read from the source.

The build also compresses dictionaries and other static files (`.br` and `.gz` next to the file): the daemon deliberately has no compressor, see the [daemon HTTPAPI](../../../metaboxd/docs/guides/HTTPAPI.md).

A screen loads its namespaces in the route `loader`, the shell at the application entry. A component whose dictionary is not loaded goes into `Suspense` instead of showing the key.

**The browser chooses the language, not the daemon.** On the first visit the first suitable language from `navigator.languages` is taken, after that the saved choice from `localStorage` (`shared/lib/i18n`). The interface language is personal, like the theme: one setting for everyone who opens the router panel would be a restriction. The switcher sits next to the theme switcher in the sidebar footer, and the document's `lang` attribute follows the choice: a screen reader picks reading rules by it (WCAG 3.1.1).

**Languages are checked against each other.** `checkLocales` from `tools/i18n.ts` compares the key set of each language with the source language, ignoring plural suffixes: their sets differ between languages. On the dev server a mismatch is printed to the terminal when a locale is edited, in the build it fails the build.

Placement rules:

- **Text belongs to whoever shows it.** Toast texts live in the `shared` namespace, because one place in the whole application shows them (`showQueryError`), not the query's slice: by the time of showing, its dictionary may not be loaded.
- **One text, one key.** Text that several slices show in the same role lives in `shared`, not as a copy in each dictionary: list states (`list.*`), delay labels (`delay.*`), route outbounds (`route.*`), section names (`section.*`), read failures (`source.*`). The `shared` dictionary is loaded at the application entry, so a shared key does not tie screen loading together. Matching words in different roles (a table column label and a panel title) do not count as a duplicate.
- **Schemas, adapters and stores do not know texts.** A form's Zod schema returns a failure code, and the `ui` of its slice inserts the text by it.
- **Numerals use i18next pluralization**, with the keys `_one`, `_few`, `_many`, not manual form selection by remainder.
- **A sentence is not glued from pieces.** Markup inside a phrase is `<Trans>` with `components`, not two `t()` around a tag: word order belongs to the language, not to the code.
- **Logs are not translated.** `console.warn("[STREAM] …")` is read by a developer, not by the router owner.

Only the build tooling (`tools/i18n.ts`) and the test dictionary (`src/test/i18n.ts`, glob) look inside slices past the Public API. Application code does not import dictionaries at all: it knows the namespace, and the runtime finds the file.

### Public API

The `index.ts` of a layer/slice/segment is the **only entry**. Reaching deeper than the public API is forbidden.

**Any code in `index.ts` other than re-exports is forbidden.**

The Public API is assembled **by name**, not with `export *` per segment: otherwise
the contents of `api` go out together with the DTO schemas, and the slice boundary
protection that [ADR-0005](../../../../docs/adr/ADR-0005-keep-foreign-api-adapters-in-the-api-segment.md) was written for is removed.

```ts
// entities/Rule/index.ts
export { RULE_QUERY, useRules } from './api/Rule.query';
export { filterRules, toRuleRows } from './model/Rule.model';
export type { RuleRow } from './model/Rule.model';
```

A barrel works only together with `"sideEffects": ["**/*.css"]` in `apps/web/package.json`: without the flag Rollup considers modules side-effectful and pulls in the whole slice; for `shared/ui` that is an extra 24 kB.

### Exceptions to FSD

The generated schema lives in a layer: `src/shared/api/generated.ts` is written by `tools/schemagen`, is not edited by hand and is noisy in a git diff as a whole.

`src/shared/ui/**` is the `ui` segment of the `shared` layer. shadcn primitives live in `src/shared/ui/shadcn/`: they are generated by the CLI (`aliases.ui` in `components.json`), the naming rules **do not apply** to them, and renaming them is forbidden. After a rename, `shadcn add` puts a file with the old name and broken links next to it; on macOS the file system masks the case mismatch, it breaks in Linux CI.

The vendor part is the `shadcn` subdirectory, not the whole segment. The segment's own code lives one level up and follows the project rules fully: styling classes shared by several screens go in `styles.ts`. The CLI does not touch such files because it does not create them. The criterion is one: what defines how a screen looks is the `ui` segment; `lib` stays for code without domain knowledge and unrelated to display.

The segment is visible outside through `src/shared/ui/index.ts`, application code imports `@shared/ui`. After each `shadcn add` three things are fixed by hand: the re-export in the barrel (the CLI does not add it), the utilities import changed to the relative `../../lib/utils`, and the new file name in the primitives override in `apps/web/.oxlintrc.json`. `pnpm lint` catches the import, not the barrel. Project rules are removed from primitives by name, not by a directory glob: lint checks a file outside the list as our own code, so our own module placed in `shadcn/` does not drop out of lint, and a primitive forgotten in the list shows warnings where the vendor differs from the project rules.

### Additional requirements

1. UI components in `shared` are [dumb components](https://habr.com/ru/companies/epam_systems/articles/519856/): no domain state, only `props`.
2. If the `ui` segment has several components that are used together, [compound components](https://habr.com/ru/companies/alfa/articles/647013/) are applied: `ConfigTree.Root`, `ConfigTree.Node`.
3. Complex component state is moved into a hook: a domain rule into the `model` of its slice, the state of a specific screen into `lib`.

## Style guide

### Exports

- All exports are named.
- `export default` only for `lazy()`.
- Exports go out from `index.ts`.

### Imports

Order: external libraries → internal modules → styles. The group order and sorting within groups are handled by `oxfmt` (`sortImports` in the root `.oxfmtrc.json`); do not align them by hand.

A layer alias is an entry from outside. Inside your own layer and slice use relative paths: this is [what FSD requires](https://feature-sliced.design/docs/reference/public-api), and this way a module does not pull itself in through its own barrel.

There is an alias per layer: `@app`, `@pages`, `@widgets`, `@features`, `@entities`, `@shared`. A separate `@test` alias leads to the test tooling `src/test`: it is not a layer, but tests inside layers reach it through this alias. There is no common `@/`: a path starts with the layer, and the import direction is visible in the line. They are declared in `tsconfig.json`, `tsconfig.app.json`, `tsconfig.mocks.json` and `vite.config.ts`.

```ts
import { useQuery } from '@tanstack/react-query'; // external
import { Button } from '@shared/ui'; // another layer: alias
import { RULE_QUERY } from '../model'; // own slice: relative path
```

### Naming

`kebab-case` and `snake_case` for entities and files are forbidden. Exceptions: shadcn primitives in `shared/ui/shadcn` and configs at the root.

**Entity files:** `<Name>.<entity>.<extension>`

```text
Rule.api.ts
Rule.model.ts
Rule.store.ts
Rule.constants.ts
Rule.schema.ts
```

Files of the `ui` segment are just the component name: `RuleRow.tsx`.

**Constants** are `UPPER_CASE` / `SCREAMING_SNAKE_CASE`. A logically related group is wrapped in an object: the object name in `SCREAMING_SNAKE_CASE`, the keys in `PascalCase`.

```ts
const DEFAULT_LISTEN = '127.0.0.1:9090';

const APPLY_STAGE = {
  Check: 'check',
  Write: 'write',
  Restart: 'restart',
  Healthcheck: 'healthcheck',
} as const;
```

Everything repeated more than twice is moved into a constant. There are no magic numbers or strings in the code.

Time conversion factors (`MS_IN_SECOND`, `SECONDS_IN_MINUTE`, `MINUTES_IN_HOUR`, `HOURS_IN_DAY`, `NS_IN_SECOND`) are taken from `shared/lib/time`, not declared locally. Thresholds and periods (poll interval, request timeout, ring buffer length) stay settings of their modules, but are expressed in these units: `15 * MS_IN_SECOND` reads, `15_000` needs mental arithmetic.

Custom logs are in upper case and in square brackets: `console.warn("[APPLY] rollback triggered")`.

### Markup

Markup is semantic: the tag is chosen by the meaning of the content, not by what is convenient to style.

- A list of uniform items is `ul`/`ol` with `li`, even when the markers are turned off by styles.
- Navigation is `nav` with a list and `a` inside: a section link must open in a new tab and be read by a screen reader as a link. A `div` with a click handler instead of a link is an error. The exception is the section tab strip (config sections): it is the `Tabs` primitive with links (`render={<Link />}`, `nativeButton={false}`), so that two tab strips on neighbouring screens are one mechanism. The link keeps the address and opens in a new tab, but a screen reader reads it as a tab. Sections that did not fit into the strip are in the "More" menu («Ещё», as the UI shows it) next to it; menu items are links too (`DropdownMenuItem` with `render={<Link />}`), and a section chosen from the menu takes its place in the strip as a tab.
- "Label / value" pairs (uptime, binary version, config path) are `dl` with `dt` and `dd`, not two columns of `div`.
- The screen title is `h1`, card and panel titles are `h2`; the level is determined by structure, not by font size.
- Machine-readable values are `time` with `dateTime` and `data` with `value`.
- A button that leads nowhere is a `button`; a link that leads somewhere is an `a`. Do not pass a link to the `Button` primitive through `render`: Base UI puts `role="button"` on it on top of `<a href>` even with `nativeButton={false}` (verified by the `RouteExplanation` test), a screen reader announces it as a button, and a middle click stops opening a tab. A link that needs to look like a button gets the classes as `cn(buttonVariants({ … }))`: without `cn` both the base's `border-transparent` and the variant's `border-border` survive in the markup, and the link stays without a border.

The exception is virtualized lists. Their rows are positioned absolutely, and such a layout inside `table` breaks parsing by assistive technologies, so the table is built with roles: `role="table"`, `role="row"`, `role="cell"` and `aria-rowcount` with the full number of rows, not the number rendered.

Markup is checked by the `jsx-a11y` plugin: a role from the ARIA set, required and allowed attributes for it, a label on a control, a click on a non-interactive element without a keyboard handler.

### Functions and callbacks

A callback that outlives its call is declared as a named function: the name is visible in the error stack, in the React profiler and in the debugger, while an anonymous arrow is named there after the component.

```tsx
useEffect(function openRuntimeStream() {
  const source = new EventSource(DAEMON_ENDPOINT.events());

  return function closeRuntimeStream() {
    source.close();
  };
}, []);
```

- An effect callback (`useEffect`, `useLayoutEffect`, `useInsertionEffect`) is only a named function or a reference to one.
- The unsubscribe that an effect returns is a callback too, and it lives longer than the effect itself: React calls it on unmount and on every dependency change. It is named by the same rule.

Both cases are checked by `project/named-effect`.

- A function in `setTimeout` / `setInterval`, a subscription and a handler longer than one expression are named too: they fire later than where they are declared, and only the name remains of them in the stack. The linter does not catch them; this is a review comment.
- An unnamed arrow stays where a name adds nothing: `map`, `filter`, `sort`, a one-line callback that just returns an expression.

### Components

Primitives come from `shared/ui`, the shadcn/ui vendor zone. `Card`, `Tabs`, `Alert`, `Badge`, `Button`, `Select`, `Textarea` are already there; building a card, tabs or a badge by hand from a styled `div` is forbidden. If the needed primitive is missing, it is added with `shadcn add` into `shared/ui/shadcn`, not written next to it.

Loading, emptiness and source failure are three different screens, and each has one primitive: a skeleton (`Skeleton`, for lists `SkeletonRows`), `Empty` and `QueryFailure`. A "Loading…" line, a dash instead of a value that has not arrived and a homemade dashed box are not used. A dash stays for a quantity that does not exist at all (the board has no thermal zones), not for one that has not arrived yet. Rules for choosing the state: [Query.md](./Query.md), the "Block states" section.

```tsx
function RuleRow({ rule, onSelect }: { rule: RuleModel; onSelect: (id: string) => void }) {
  return <div>...</div>;
}
```

1. Declared as a **Function Declaration**, otherwise the debugger shows `Anonymous`.
2. `React.FC` / `React.VFC` are not used: [deprecation](https://github.com/facebook/create-react-app/pull/8177) and broken `children` typing.
3. `props` are destructured right in the arguments, without an intermediate type alias. The rule applies to components on top of shadcn primitives; when the type is needed outside, declare an interface and export it.
4. A memoized component is declared with the `Proto` suffix, and `memo` is what is exported:

```tsx
function RuleRowProto({ rule }: { rule: RuleModel }) { ... }

export const RuleRow = memo(RuleRowProto)
```

**Do not memoize everything.** `memo` is justified in lists and tree nodes; on a single form it only adds a props comparison. Functions in `props` of a memoized component are wrapped in `useCallback`, otherwise `memo` is useless.

### Performance

- Function calls are moved out of the render body.
- Components are not declared inside other components.
- Unsubscribing happens in `useEffect` through the returned cleanup.
- A `props` spread only when it is deliberate, not "just in case".

### Maintainability

- `any` is forbidden. If the type is unknown, use `unknown` plus narrowing.
- `@ts-expect-error` / disabling linter rules only with a comment explaining the reason. `@ts-ignore` is not used at all.
- `TODO` / `FIXME` only with an explanation and a link to the task.
- No nested ternaries and long `if...else` chains.
- Type casts only narrow; a widening cast is caught by `typescript/no-unsafe-type-assertion`. The exception is addressing a config node by a string path: it is never type-safe, and there the cast is covered by `// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reason`. A bare disable without a reason is forbidden by a separate rule.

## Styles

Tailwind v4, the entry is `src/app/styles/index.css`: global styles live in the `app` layer. Theme tokens are declared in `@theme inline`.

- Classes are written in `className`; sorting is done by `oxfmt` (`sortTailwindcss`).
- Conditional classes go through `cn()` from `@shared/lib/utils`, no manual string concatenation.
- Component variants go through `cva`, not through a set of boolean props with branching inside.
- Arbitrary values (`w-[137px]`) by exception only; look for a scale token first.
- Units:

  | Unit  | Where                                                                                   | Why                                                                                                          |
  | ----- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
  | `rem` | font size, line height, spacing, control heights, widths and `max-width`                | they scale with the browser font size setting; otherwise the panel fails WCAG 1.4.4                          |
  | `em`  | what is tied to the element's own font size: `letter-spacing`, spacing inside a variant | the `sm` button variant gets proportional spacing without a separate set of values                           |
  | `px`  | border width, focus ring, shadow offsets and blur                                       | physical quantities: a hairline grown to 1.5px together with the font size reads as a defect, not as a theme |

  The Tailwind scale is already in `rem`, nothing special is needed; the rule concerns arbitrary values. Violations are caught by `tailwind/no-restricted-classes`.

- Step 10 is only for a service mark: "soon", "always". A value that is read is 12 and above, because below eleven functional text cannot be read at working distance; the same argument explains the choice of 12px in `shared/ui/styles.ts`.
- Sizes are multiples of two: font sizes 10/12/14/16/18/22/28/36, control heights 32/24/20, radii 8/10/14/16/20/24/32. An odd step between 12 and 14 is indistinguishable, and an odd control size breaks the vertical alignment of neighbours. The exception is the same physical quantities as above: a 1px border, the focus ring and the vendor sizes of `shared/ui` primitives set by shadcn.
- Font size and radius steps are listed in `@theme inline` as explicit values, not computed by a multiplier from a base: the shadcn multiplier gave 6/8/10/14/18/22 and broke the multiple-of-two rule. `--radius` stays though: `sonner.tsx` reads it as a variable.
- Fonts are files in `src/app/styles/fonts/` and are connected with `@font-face` in `index.css`. We do not install `@fontsource-*` packages: the panel must open while sing-box is not working, and the build must run without a network. Only the needed subsets are kept: Latin, Latin Extended, Cyrillic and Cyrillic Extended; Greek and Vietnamese glyphs do not appear in the panel.

### Palette

Semantic domain tokens are declared on top of the base shadcn roles. A Tailwind palette literal (`bg-emerald-400`) in a component is a sign of a missing token, not a solution:

| Group     | Tokens                                                                                  | What they encode                                                            |
| --------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| action    | `--route-direct`, `--route-proxy`, `--route-block`, `--route-dns`, `--route-neutral`    | the packet's fate: out directly, through a proxy, blocked, DNS interception |
| state     | `--signal-ok`, `--signal-warn`, `--signal-bad`, `--signal-idle`                         | node delay, service state, apply result                                     |
| selection | `--selected`, `--selected-edge`                                                         | the selected row and its edge                                               |
| series    | `--series-down`, `--series-up`                                                          | inbound and outbound traffic on charts                                      |
| meters    | `--meter-track`                                                                         | the bar track: a surface, not alpha over the background                     |
| row       | `--row-hover`, `--table-head`                                                           | hover and the table header; opaque, content slides under them               |
| code      | `--code-string`, `--code-number`, `--code-literal`, `--code-comment`                    | JSON highlighting in text mode                                              |
| log       | `--log-trace`, `--log-debug`, `--log-info`, `--log-notice`, `--log-warn`, `--log-error` | log line level; fatal and panic use the error tone in bold                  |

Rules:

- **Selection is a separate surface, not alpha over the background.** `bg-muted/60` over `bg-card` in the dark theme gives a lightness difference of 0.038, which is indistinguishable.
- **A selected state carries two signs**, and one of them is not color: an edge plus a check mark, an edge plus a fill.
- **The "action string → tone" mapping is a substring table**, not an `if` chain: a new node kind is added by an entry (`ConnectionAction.ts`, `RuleTargetTone.ts`).
- **Both themes declare `color-scheme`.** Without it a browser with auto dark mode recolors the light theme itself and draws native elements according to the system setting.
- The light palette is in `:root`, the dark one in `.dark`: the `dark:` variant of shadcn primitives is bound to this class, and the reverse order would break it. The default theme is dark: `ThemeProvider` sets it, not the block order.

- We do not create separate `.css` files. The only place for raw CSS is `src/app/styles/index.css`: tokens, `@custom-variant`, base.
- No hard `width`/`height`: a component takes the space allotted by the grid.

### Responsive layout

The response to width is structural, not typographic: the sidebar collapses, columns rearrange, panels wrap. Font size does not depend on width: the panel is viewed at a constant DPI, and a floating title in a narrow column looks worse than a fixed one.

- Below 48rem (`NARROW_SCREEN` in `shared/lib/media.ts`) there is no side panel: sections move to a bottom bar with labels under the icons, and the sidebar footer (service state, theme and language) moves to the sheet of its "More" item («Ещё»). A strip of icons on the side would take width from the content and give no labels. The bottom bar sits in the layout flow, not `fixed`: the screen above it gets the remaining height and does not go under it. It has an `env(safe-area-inset-bottom)` bottom padding, the touch target is at least 44px. The page declares `viewport-fit=cover`, otherwise the browser reports safe-area insets as zero; side cutouts in landscape orientation are covered by the shell root padding. Width is tracked by a `matchMedia` subscription, not measured once on mount.
- A touch target under a finger is at least 44px, and this is held by `@media (pointer: coarse)` in `index.css`, not by screen classes: buttons, tabs, dropdowns and fields grow to 44px there, the switch and the checkbox extend their hit area with their `::after`. The pointer decides, not the width: a narrow window under a mouse stays dense, a tablet under a finger does not. Our own interactive element outside the primitives gets the same size with the `pointer-coarse:` variant.
- The start screen at a narrow width is the overview, at a wide width the configuration: the redirect from `/` checks the width in `beforeLoad`.
- Tables with fixed columns scroll horizontally as a whole, together with the header. Shrinking columns is forbidden: address, rule and chain get truncated beyond recognition. At the width where the table stops being readable, a row unfolds into a "label — value" list; rules and limits are in [Tables.md](./Tables.md).

### Transition animation

Each kind of change has one mechanism. Screen changes and stateful tabs go through the browser's View Transitions ([ADR-0026](../../../../docs/adr/ADR-0026-animate-screen-changes-with-the-router-and-in-page-changes-with-react.md)), side panels, sheets and bars through CSS layout transitions:

- **Screen change: the router.** The router's `defaultViewTransition` passes the transition type to CSS (`page-forward`, `page-backward`, `page-fade`, `page-hold`: `app/router/Router.transition.ts`), the direction follows the order of menu items. A transition inside a section (when the addresses share the first segment) gets `page-hold`: the shell there is held by a layout route, and it stays, only the content changes. Do not put a `<ViewTransition>` boundary around `Outlet`: the router subscription goes through `useSyncExternalStore`, and React renders a route change synchronously, outside a Transition, so the boundary would not fire.
- **Stateful tabs**: `<Activity>` on top of `keepMounted`, a `<ViewTransition enter exit default='none'>` boundary right under `Activity`, before the first DOM node, switching in `startTransition`. An update from a Zustand store or Query does not trigger the boundary: React renders such updates synchronously. `document.startViewTransition` is not called by hand.
- **Side panel next to a list**: `SidePanelLayout` from `shared/ui`: `Root` with `open`, `Main` with the list, `Panel` with the panel content. The list width changes once (on opening the panel column appears immediately, on closing it collapses after the panel has slid out), and only the panel moves: it slides in from the right with translation and opacity. A transition of the grid width would relayout the table on every frame, and rows that got cramped would jump to a second line in the middle of the movement. A closed panel leaves the accessibility tree immediately, but keeps its content until the end of the slide-out; a content change of an open panel (by `key` inside `Panel`) does not touch the column. Focus into the panel and back is handled by the panel itself (`useFocusReturn`): it returns when the content is removed, that is, after the slide-out. A screen does not build its own "list + panel" row markup, and `startTransition` is not needed to open the panel.
- **Bottom sheet** (below `lg` the panel opens as a sheet): `SheetContent side='bottom'` with the `SHEET_BOTTOM` classes from `shared/ui/styles.ts`: the sheet slides in whole, from the bottom edge, overriding the vendor 2.5rem shift; `cn` in the primitive gives priority to the passed classes. A sheet whose content comes from a query gets a fixed height, not `max-h`: otherwise it grows in the middle of the slide-in. The sheet is mounted permanently and controlled by `open`, not by conditional rendering, otherwise it disappears without an exit. The blur under the overlay is removed by a rule in `index.css`: the overlay primitive is closed to `className`.
- **The apply bar** floats above the bottom edge of the screen and does not move the layout: it appears with a shift from below and opacity, and keeps the outgoing text until `transitionend`. The space under it is freed by the shell: the bottom padding of `<main>` equal to the bar height, which the bar reports through `onSpaceChange` while visible. The bar carries `view-transition-name: apply-bar` for layer order: without a name, on a screen change the `page` group would cover it for the whole transition.
- **The daemon unavailability strip** sits above the screen and expands with a `grid-template-rows` transition: the screen under it is the named `page` group, outside a router transition it is not animated, and a `<ViewTransition>` boundary around the strip would leave the screen jumping.
- **Pinned elements.** `view-transition-name` is carried by the shell's `<main>`, `PageHeader`, the config tab strip and the apply bar. A named element is animated only in a router transition; outside it is shown live, without a snapshot and fade. A new name is added to the shared branch of rules in `index.css`, where the group has zero duration, and, if it is animated, to the `:active-view-transition-type()` branch under which it is animated: there are three: content under all four types, the header under all except `page-hold`, and the header without a pair under `page-hold`. The carrier of a name must not render twice.
- **Durations and curves** are variables in `index.css`: `--view-transition-*` for View Transitions, `--motion-*` for CSS transitions (enter 240 ms, exit 180 ms, sheet 280 and 200 ms, curve `--motion-ease-out`). Exit is faster than enter. Keyframes live there too. The `prefers-reduced-motion: reduce` rule zeroes View Transitions by itself; CSS transitions are removed with `motion-reduce:transition-none` on each one, and code that waits for `transitionend` checks the setting itself: with the transition removed there will be no event.

## Tools

Lint is oxlint, format is oxfmt, types are tsc, tests are Vitest. Commands and the full list of checks before committing are in [`CONTRIBUTING.md`](../../../../CONTRIBUTING.md).

Formatting is not fixed by hand:

- there is one config for the repository, `.oxfmtrc.json` at the root; frontend settings (import order, Tailwind class sorting) live there in an override for `apps/web/**`;
- lint is cascading: `apps/web/.oxlintrc.json` extends the root one through `extends`, shared JS rules live at the root;
- `react/incompatible-library` is off: the rule warns that React Compiler will not memoize a component that calls `useVirtualizer`. The compiler is not connected in the build (`vite.config.ts` has `@vitejs/plugin-react` without `babel-plugin-react-compiler`), so the warning hung on every virtualized list with no consequences. Re-enable together with the compiler;
- `jsx-a11y/prefer-tag-over-role` is off: the rule requires replacing a role with a tag, while the virtualized table is built with roles out of necessity; the "Markup" section explains why `table` does not work there. The other rules of the set are enabled as errors;
- lint runs **only from the root** (`pnpm lint`): the `better-tailwindcss` plugin finds Tailwind and its CSS entry through the `cwd` setting in `apps/web/.oxlintrc.json`, and it is resolved from the launch directory. From `apps/web` the same config would declare all classes unknown, so the frontend has no `lint` script of its own;
- `options.typeAware` is declared **only** in the root `.oxlintrc.json`: in the frontend config oxlint does not accept it and discards the whole file, and with it all frontend exceptions;
- in VS Code formatting and autofixes run on save: `.vscode/settings.json` sets `oxc.oxc-vscode` as the formatter for TS/JS, JSON, CSS and Markdown, otherwise the built-in formatters diverge from `format:check`.

Lint is type-aware: `strict` in all four tsconfig projects (`app`, `node`, `mocks`, `dev`), `options.typeAware` in `.oxlintrc.json`, the `oxlint-tsgolint` package. Through `jsPlugins` the plugins for TanStack Query, Testing Library, jest-dom, Tailwind and `check-file` are connected; `jsx-a11y` is built into oxlint and is enabled by name in `plugins`. FSD boundaries are checked by the local `fsd/boundaries` (`apps/web/tools/fsdBoundaries.js`): an import up the layers, a neighbouring slice past `@x`, bypassing the Public API, a path without a Public API (a group instead of a slice), a relative path outside the slice, both ends of a cross-import (`@x` is open to one neighbour of its layer, not to everyone and not from above), and an import of the generated schema: `@shared/api/generated` and `daemon.generated` are read only by `api` and `model` of entities and by tests, screens take their model. It finds a slice by its Public API: a folder without `index.ts` counts as a group, so `@features/Rule/RuleEdit` is allowed and `@features/Rule/RuleEdit/ui/RuleEditForm` is not. Project rules that are not in ready-made sets live in `apps/web/tools/projectRules.js`: `project/named-effect` (an effect callback and its unsubscribe are named), `project/no-query-destructuring`. The list of the rest is in the config.

Both plugins export an object through `export default` (otherwise Node will not load them), so `import/no-default-export` for `tools/**` is off in `apps/web/.oxlintrc.json`. A run from the root (`pnpm lint`) applies the nested config, and the plugin files pass; a separate run with the root config bypassing it does not. There, the `no-unsafe-*` group and a few more type-aware rules are also removed for `tools/**`: the plugins are JS without types, and the ESLint context comes into them as `any`. Moving the plugins to TypeScript would pull in `@types/eslint` for two files. `.oxlintrc.json` itself is strict JSON and holds no comments, so the reasons are recorded here.

What the linter does not see: the contents of `index.ts`, the log format, whether `memo`, `useCallback` and a `props` spread are justified; this is the [review checklist](./ReviewChecklist.md). It also does not see a slice used by a single page: for that, [`steiger`](https://github.com/feature-sliced/steiger) as a separate CI step, once there are many slices.
