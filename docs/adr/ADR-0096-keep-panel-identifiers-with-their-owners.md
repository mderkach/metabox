# ADR-0096. Keep panel route and locale identifiers with their owners

- Status: Accepted
- Date: 2026-11-27
- Deciders: Repository owner

## Context and problem statement

Pages, navigation and links refer to the same public addresses. A nested route has both a local segment and a resolved destination. Similarly, a component and its route loader must request the same translation namespace. [ADR-0019](./ADR-0019-keep-interface-texts-in-the-slice-and-load-them-over-the-network.md) derives namespace identities from dictionary directories and loads the dictionaries over the network.

## Decision drivers

- A developer changing a page or a dictionary should find the declaration beside the resource.
- A link must retain its typed parameters and support browser navigation, including opening it in another tab.
- Importing an identifier should allow the page implementation and its dictionaries to load on demand.

## Considered options

1. A shared catalog of paths and namespaces would be convenient for every caller. It would also require a catalog edit for changes owned by an individual page or dictionary.
2. Per-owner handwritten constants for both identifiers would fit the import boundaries. The namespace literal would need manual updates when its dictionary moves.
3. Page-owned route declarations and directory-derived namespace exports preserve both forms of ownership. Application composition supplies destinations to components that cannot import pages.

## Decision outcome

Choose option 3. Each page exports its registration path and a lazy loader through its public API. The application registers the tree and provides targets to navigation consumers. Index routes use the parent address for links. Parameterized routes keep their parameter contract.

The locale generator emits a string constant beside each source-language dictionary. A component uses its owner's named constant. The initial shell and route loaders use public exports to preload the same namespace. The i18next resource types and fingerprinted dictionary URLs are derived infrastructure.

Vite serves individual modules in development. For a namespace-only import in an application preloader, the dev server follows the owner's named public re-export directly to the generated module. This keeps the unrelated UI behind that entry out of the startup request graph. Mixed runtime imports still evaluate the public entry normally.

## Consequences

A route edit is discoverable at its page, and a dictionary move changes its generated value. Components shared between screens receive navigation inputs through composition. Generation and freshness checks cover multiple small files. The build must keep UI code and dictionary contents out of initial assets when a caller only needs a name.

## Validation

- [Router registration](../../apps/web/src/app/router/Router.tsx) and [router tests](../../apps/web/src/app/router/__tests__/Router.test.tsx) exercise public paths and the Overview entry.
- [Generation](../../apps/web/tools/i18n.ts), [freshness checks](../../apps/web/tools/i18n.test.js) and [plugin tests](../../apps/web/tools/i18nPlugin.test.js) cover local namespace modules.
- [Bundle budget](../../apps/web/tools/bundleBudget.js) checks entry costs. Inspect the production chunk graph independently for lazy screens.
