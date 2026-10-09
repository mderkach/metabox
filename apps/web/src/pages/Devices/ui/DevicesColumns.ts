/**
 * Раскладка строки устройства. Один набор ширин на шапку и на строку: разойдясь,
 * подписи встанут не над своими колонками. Ниже md строка переносится карточкой.
 */
export const DEVICES_COLUMN = {
  Row: 'flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-3 last:border-b-0',
  Label: 'flex min-w-0 grow basis-56 items-center gap-2',
  Ip: 'w-32 shrink-0 font-mono text-xs max-md:w-auto',
  Mac: 'w-40 shrink-0 font-mono text-xs text-muted-foreground max-md:w-auto',
  NameSource: 'w-36 shrink-0 text-xs text-muted-foreground max-md:w-auto',
  Lease: 'w-32 shrink-0 max-md:w-auto',
  Online: 'w-24 shrink-0 text-xs max-md:w-auto',
  RowActions: 'flex w-32 shrink-0 items-center justify-end max-md:w-auto max-md:grow',
} as const;
