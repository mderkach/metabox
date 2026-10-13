# ADR-0019. Keep interface texts in the slice and load them as files over the network

- Status: Accepted
- Date: 2026-09-16
- Deciders: repository owner

## Context and problem statement

Before this decision the panel had one language, and texts lived in two ways at once: as strings right in components (359 lines in 47 files) and as a shared dictionary `shared/lib/i18n` with thirteen keys for toasts. The dictionary existed not for translation but for the query `meta`: a toast is shown centrally, and a hook must pass a key, not a ready string (Query.md). The code said so explicitly: "there is no localization library on purpose: there is one language".

The requirement changed — the panel must speak two languages (AC-43). This exposes three properties of the old setup:

- a component's text lives in the component, while a translation of the same text would land in a shared file: one statement ends up in two places, and they drift apart;
- pluralization is hand-written (`plural(count, ['узел', 'узла', 'узлов'])`) and correct only for Russian;
- one dictionary for the whole panel means all text goes into the first chunk, and with a second language it doubles.

The last point costs more for this product than for a usual website: the SPA is embedded in the daemon binary ([ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md)) and served from the router.

In scope: where text lives, how it is typed and how it reaches the browser. Out of scope: texts the panel receives from the daemon: rejections carry a machine `code`, and their translation stays a separate task.

Constraints set earlier: the `src` structure is FSD with slices and a Public API; the build is Vite; generator artifacts are committed and not edited by hand.

## Decision drivers

- Text lives next to the code that shows it and moves together with it.
- `t` in a component knows the keys of its slice and does not know others' — checked by types, not by agreement.
- Text cannot get into the bundle by mistake: the cost of the mistake is megabytes over the network on the owner's device.
- Pluralization and interpolation are handled by a library, not by panel code.
- Adding a language does not require editing components.
- Dictionaries drifting between languages are caught before the device, not on screen.

## Considered options

1. **Locale in the slice's `i18n` segment, namespace is the slice path, the dictionary arrives as a file over the network** — i18next with `resources-to-backend`, dictionary URLs are gathered by a build plugin. Pros: text lives in the slice; `t` is limited to its namespace; build modules hold no text at all, so a careless import cannot pull it in; a screen fetches only its own dictionaries. Cons: text becomes asynchronous, a "dictionary still loading" state appears; only the build knows dictionary URLs, so a map goes into the bundle. **Chosen.**

2. **Locale in the slice, but the dictionary is a lazy chunk** (`import.meta.glob` with dynamic import). Pros: same placement, one mechanism fewer — no URLs needed. Cons: text stays a build module, and one static import brings it back into the first chunk; exactly this failure cost a lot in the owner's previous project. **Rejected.**

3. **A shared dictionary per language** (`locales/ru.json`, `locales/en.json`). Pros: familiar, convenient for a translator. Cons: a component's text lives a mile away from it, `t` gives access to all panel keys at once, the first chunk pulls all text of both locales. **Rejected.**

4. **Keep the current approach** — one language, strings in components. Cons: does not meet AC-43. **Rejected.**

## Decision outcome

Interface text lives in the `i18n` segment of its slice: `src/<layer>/<Group>/<Slice>/i18n/<language>.json`. The namespace is the slice path from `src`, and the component names it in full: `useTranslation('features/Rule/RuleEdit')`.

**Types are derived from the JSON itself.** `tools/i18n.ts` prints `src/i18n.generated.d.ts` — a map `'features/Rule/RuleEdit': typeof import('./features/Rule/RuleEdit/i18n/ru.json')`. Keys are not copied into the map: TypeScript knows them, and the map changes only when a locale appears or disappears. The import in it exists as a type and is erased at build time.

**The dictionary arrives as a file.** The build puts each locale into `dist/locales/<namespace>/<language>-<fingerprint>.json` and prints a URL map as the module `virtual:metabox-locales`; the runtime fetches the dictionary with `fetch`. The fingerprint in the name is the same as for other assets — the daemon serves such a file with a permanent cache. Build modules hold no text, so there is nowhere to import it from.

**Screen dictionaries are loaded by the route `loader`**, shell dictionaries by the app entry. A component whose dictionary has not loaded yet goes into `Suspense` instead of showing a key.

Placement rules:

- toast texts live in the `shared` namespace: one place in the whole app shows them, and the slice dictionary may not be loaded by then;
- a form's Zod schema returns a rejection code, and the `ui` of its slice substitutes the text for it: the schema knows nothing about language;
- numerals use i18next pluralization (`_one`, `_few`, `_many`), there is no manual form choice in code;
- a phrase with markup is built with `<Trans>`, not two `t()` around a tag: word order belongs to the language;
- logs are not translated — a developer reads them.

**The browser chooses the language.** On the first visit the first matching one from `navigator.languages` is taken, afterwards the saved choice from `localStorage`; the document `lang` attribute follows the choice. The daemon has no language setting: the interface language is personal, like the theme, and one setting for everyone who opens the router panel would be a limitation.

**Languages are checked against each other.** `checkLocales` compares each language's key set with the source language, ignoring pluralization suffixes: their sets differ between languages. On the dev server a mismatch is printed to the terminal, in the build it fails the build.

### Scope and boundaries

`apps/web/src/**/i18n/*.json`, `apps/web/tools/i18n.ts`, the `metabox-i18n` plugin in `apps/web/vite.config.ts`, `apps/web/src/app/lib/i18n.ts` and `apps/web/src/shared/lib/i18n.ts`. The artifact `apps/web/src/i18n.generated.d.ts` is committed and not edited by hand.

## Consequences

### Positive

- Text is edited in the same place as the code that shows it; a translation does not drift from where it is used.
- Limiting `t` to a namespace is checked by the compiler: a foreign key does not compile.
- A screen pulls only its own dictionaries: the connections screen loads nine files out of fifty.
- Manual Russian pluralization is removed — i18next computes the forms by the language's rules.
- Adding a third language is a set of files and one line in the language list; components are not touched.

### Negative

- Text became asynchronous. The order "dictionary before the frame" rests on preloading in `loader`, and `Suspense` stays a safety net; a namespace forgotten in the list gives a short placeholder on screen, not a key.
- Dictionaries are many and small: 50 files, 200 KB, from 180 bytes. That is fifty requests instead of one if the user visits every screen.
- Three dependencies appeared: `i18next`, `react-i18next`, `i18next-resources-to-backend`.
- The URL map goes into the bundle: without it the runtime does not know the fingerprinted names.
- The English texts were written by a developer and not proofread by an editor.

### Neutral or deferred

- Daemon rejections are translated as a separate task: they have a machine `code`, and `message` stays the fallback text.
- A language setting in the daemon is not added until a scenario appears that needs it.

## Risks and mitigations

| Risk                                                                      | Likelihood and impact                  | Mitigation                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| A new key is added to one language only                                   | high with two people working; cosmetic | `checkLocales` fails the build and prints the list of mismatches                      |
| A namespace is forgotten in the route preload                             | medium; a placeholder instead of text  | `Suspense` shows a placeholder, not a key; the namespace list lives next to the route |
| A dictionary is served as the SPA shell instead of JSON (unknown URL)     | low; a screen without text             | the loader checks the response type and throws an error instead of substituting HTML  |
| The fingerprint in the name drifts from the URL map after a partial build | low; dictionary not found              | the map is printed by the same plugin and in the same pass that writes the files      |

## Compatibility, migration and rollback

The migration is complete: texts are moved out of all 47 files, `shared/lib/i18n` with the toast dictionary is removed, the `meta` keys moved to the `shared` namespace. The config format, the daemon API and data on the device are not affected — the decision is entirely inside the panel.

Rollback is reverting the commit: artifacts, dictionaries and the plugin go away with it; config files are not involved.

## Validation

- `pnpm --filter web build` — prints the namespace map, checks the languages and fails on a key mismatch;
- `pnpm --filter web test` — 302 tests, including language switching and saving the choice;
- `pnpm lint` — the `fsd/boundaries` rule guards that dictionaries are not imported across layers;
- in the browser: the panel opens in the browser language, the switch changes the language without a reload, the choice is kept after a reload, `document.documentElement.lang` matches the choice;
- `dist/locales` holds `.json` files, and `dist/assets` has no chunk with a dictionary.

## Links

- [PRD, AC-43](../PRD.md) — the interface language requirement;
- [ADR-0003](./ADR-0003-embed-the-spa-from-a-staging-directory.md) — the SPA is embedded in the daemon binary;
- [ADR-0020](./ADR-0020-precompress-static-assets-at-build-time.md) — how dictionaries and other static assets reach the browser;
- [Frontend architecture and style guide](../../apps/web/docs/guides/Architecture&Style.md) — section "Localization";
- [`apps/web/tools/i18n.ts`](../../apps/web/tools/i18n.ts), [`apps/web/src/app/lib/i18n.ts`](../../apps/web/src/app/lib/i18n.ts), [`apps/web/src/shared/lib/i18n.ts`](../../apps/web/src/shared/lib/i18n.ts).
