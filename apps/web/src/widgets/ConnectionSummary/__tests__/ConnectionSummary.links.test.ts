import type { ComponentProps } from 'react';
import { expectTypeOf, it } from 'vitest';

import type { ConnectionSummaryPanel } from '../ui/ConnectionSummaryPanel';
import type { ConnectionSummaryTop } from '../ui/ConnectionSummaryTop';

it('accepts registered static destinations or no link throughout a summary card', () => {
  type Destination = ComponentProps<typeof ConnectionSummaryPanel>['href'];

  expectTypeOf<ComponentProps<typeof ConnectionSummaryTop>['href']>().toEqualTypeOf<Destination>();
  expectTypeOf<'/proxies' | '/connections' | undefined>().toExtend<Destination>();
  expectTypeOf<'/unknown-screen'>().not.toExtend<Destination>();
  expectTypeOf<'/config/$section'>().not.toExtend<Destination>();
});
