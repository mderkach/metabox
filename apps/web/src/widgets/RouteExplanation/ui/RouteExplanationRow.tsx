/** A label and a value in plain words; `raw` is the sing-box text, kept as a tooltip. */
export function RouteExplanationRow({ label, value, raw }: { label: string; value: string; raw?: string }) {
  return (
    <div className='flex justify-between gap-4 border-t border-border py-1.5 first:border-t-0'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='truncate text-xs' title={raw}>
        {value}
      </dd>
    </div>
  );
}
