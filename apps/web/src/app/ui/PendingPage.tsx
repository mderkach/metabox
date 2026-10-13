import { Skeleton, SkeletonRows } from '@shared/ui';

/**
 * A screen whose data has not arrived yet, when the router has already waited
 * longer than `defaultPendingMs`. The layout is shared: screens have different
 * ones, and the skeleton answers only the question "loading is in progress"
 * without pretending to be their content.
 */
export function PendingPage() {
  return (
    <div className='flex min-h-0 grow flex-col gap-4 px-4 py-5 sm:px-6'>
      <Skeleton aria-hidden='true' className='h-5 w-2/3 max-w-md' />
      <SkeletonRows className='rounded-xl ring-1 ring-foreground/10' />
    </div>
  );
}
