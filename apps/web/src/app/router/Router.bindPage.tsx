import type { AsyncRouteComponent, RouteComponent } from '@tanstack/react-router';

/** Resolves navigation inputs on render, after TanStack initializes route IDs, while retaining route preloading. */
export function bindPage<Props extends object>(
  Page: AsyncRouteComponent<Props>,
  useProps: () => NoInfer<Props>
): RouteComponent {
  function BoundPage() {
    const props = useProps();

    return <Page {...props} />;
  }

  BoundPage.preload = Page.preload;

  return BoundPage;
}
